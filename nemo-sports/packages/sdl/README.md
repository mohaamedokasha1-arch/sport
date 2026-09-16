# `@nemo/sdl` — NEMO Sports Data Layer

The **only** component in the platform that is allowed to talk to a sports data
provider. The API server, background jobs and the admin dashboard import this
package and nothing else; the frontend never sees a provider at all.

```
┌──────────────┐   canonical JSON   ┌────────────────────────────────────────┐
│  Next.js app │ ─────────────────► │  SportsDataLayer (this package)        │
│  (frontend   │                    │                                        │
│   + API v1)  │ ◄───────────────── │  priority chain → adapter → normalize  │
└──────────────┘                    │  cache → rate limit → canonical store  │
                                    └───────────────┬────────────────────────┘
                                                    │ HTTPS only
                     ┌──────────────┬───────────────┼───────────────┬───────────────┐
                     ▼              ▼               ▼               ▼               ▼
                Sportradar     Sportmonks     API-Football     TheSportsDB      demo (offline)
```

## Commands

```bash
npm run typecheck   # tsc --noEmit over src/
npm test            # compiles src/ + test/ and runs `node --test` (71 tests)
```

The package has **zero runtime dependencies** — it runs on Node 20's built-in
`fetch`, `AbortController` and `node:test`.

---

## 1. The four hard rules

1. **No provider shape escapes.** Adapters return `Normalized*` types only. If
   a provider renames a field, exactly one file changes.
2. **No provider call outside this package.** `src/adapters/*` may only be
   imported by `src/index.ts` and by tests.
3. **Canonical ids are sacred.** A wrong provider link is fixed by moving the
   mapping (`EntityResolver.relink`), never by deleting an entity.
4. **Every call is justified.** Cache first, then rate limit, then coalesce
   identical in-flight requests, then call. `costReport()` is the audit trail.

## 2. Request lifecycle

`sdl.fetch({ sport, competition, dataType, endpoint, params, call })` runs:

| Step | What happens | Where |
|---|---|---|
| 1 | Canonical cache lookup (layer 2) → hit returns immediately | `orchestrator.fetch` |
| 2 | Priority chain resolved for `sport × competition × dataType`, filtered by capability + health | `priority.ts`, `health.ts` |
| 3 | Raw response cache (layer 1) per provider + request key | `cache.ts` |
| 4 | Rate-limit check; an exhausted provider is **skipped**, not retried | `rate-limit.ts` |
| 5 | In-flight dedup so N concurrent callers share one HTTP call | `RequestCoalescer` |
| 6 | Adapter call with timeout, typed error translation, health recording | `adapters/base.ts` |
| 7 | `apply()` hook writes canonical entities + raises conflicts | `mapper.ts`, `conflict.ts` |
| 8 | All providers failed → serve last good value inside `staleGrace`, marked `stale: true` | `orchestrator.fetch` |

The result is always either canonical data or a documented `SdlFailure` —
never a provider error, never a provider payload.

## 3. Adding a new provider (≈45 minutes)

1. Create `src/adapters/<name>.ts`:

   ```ts
   import { withDefaults, type HttpOptions } from "./base";

   export class MyAdapter extends withDefaults("my_provider") {
     readonly capabilities: DataType[] = ["fixtures", "live_matches", "team"];
     readonly supportedSports = ["football"];

     baseUrl(): string { return "https://api.example.com/v1"; }
     auth(): { headers: Record<string, string> } { return { headers: { "x-api-key": this.key } }; }

     override async getLiveMatches(input: { sport: string }) {
       const res = await this.getJson<MyFeed>("live", { sport: input.sport });
       if (!res.ok) return res;                 // typed failure — never throw
       return { ...res, data: res.data.map(mapToNormalizedFixture) };
     }
   }
   ```

   `withDefaults()` fills every method you do not override with a
   `not_supported` result, so the orchestrator skips you for data types you
   cannot serve instead of failing the chain.

2. Register it in `createSdl()` (`src/index.ts`) behind an env var check.
3. Add its rate limits to the `defaults` map in `SportsDataLayer`'s constructor.
4. Add priority rows in `db/schema.sql` (`provider_priority`) — or leave the
   defaults and only override per competition.
5. Add adapter tests with an injected `fetchImpl` and a canned payload copied
   from the provider's documentation. **Verify the docs before writing the
   mapping** — see `test/adapters.test.ts` for the four existing examples.

## 4. Adding a new data type

1. Add the value to `DataType` (`provider.ts`) and to `DATA_TYPES`.
2. Add a `Normalized<T>` payload type and one interface method.
3. Add the `not_supported` default in `withDefaults()`.
4. Add a cache policy entry in `DEFAULT_CACHE_POLICY` (raw ≤ canonical ≤ stale).
5. Implement it only in the adapters that genuinely serve it.

## 5. Cache layers and keys

| Layer | Key format | TTL source |
|---|---|---|
| 1 · raw provider response | `sdl:provider:{provider}:{endpoint}:{hash(params)}` | `policy.raw` |
| 2 · canonical data | `sdl:canonical:{dataType}:{hash(params)}` | `policy.canonical` |
| 2b · last good value | `…:stale` | `policy.staleGrace` |
| 3 · rate-limit counters | `sdl:rl:{provider}:{window}:{bucket}` | window + 5 s |

`invalidate("sdl:canonical:match:{id}")` sweeps **both** the canonical and raw
layers — dropping one without the other would silently re-serve the value you
just invalidated. Production supplies a Redis `KvStore`; dev and tests use
`MemoryStore`.

## 6. Conflicts (§3.9)

| Field | Severity | Strategy |
|---|---|---|
| score | Critical | primary provider wins |
| status | High | primary provider wins |
| standings | High | primary provider wins |
| event | High | most recent wins |
| kickoff | Medium | primary provider wins |
| lineup | Medium | most recent wins |
| stat / metadata | Low | most recent wins |

A rejected value is **never written**. The conflict stays in the queue until an
editor calls `conflicts.resolveManually(id, value, note)`, which is recorded in
the audit trail (`resolution: "manual"`).

## 7. Observability

```ts
sdl.diagnostics();
// { providers, health, cost, cache, conflicts, inFlight, throttled }
```

`cost` reports `calls`, `cacheHits`, `coalesced` and `avoided` per provider —
`avoided` is the count of calls the SDL deliberately did not make.

## 8. Durable stores (Postgres and Redis)

Both are **implementations, not dependencies**. The package never imports
`pg` or `ioredis`; it declares the shape it needs and the host application
supplies a client:

| file | what it is | depends on |
|---|---|---|
| `src/pg-store.ts` | `PgCanonicalStore implements CanonicalStore` | `SqlClient` (`select` / `run` / `transaction`) |
| `src/redis-store.ts` | `RedisKvStore implements KvStore` | `RedisLike` (`get` / `set` / `del` / `scanKeys?` / `ttl?` / `info?`) |

Wiring lives in the app, not here:

```ts
// lib/db/pg.ts   → wraps a pg Pool as SqlClient (also owns BEGIN/COMMIT/ROLLBACK)
// lib/cache/redis.ts → wraps an ioredis client as RedisLike (SCAN, never KEYS)
configureSdl({ canonical: await getCanonicalStore() ?? undefined, store: await getRedisKv() ?? undefined });
```

Both drivers return `null` when unconfigured, so the layer runs on
`MemoryCanonicalStore` + `MemoryStore` and the site still boots. `/admin/providers`
shows which of the four is actually live.

Two invariants the implementations must keep:

- **Redis values are wrapped** as `{ value, expiresAt }`; the TTL is a second
  line of defence, the logical expiry decides staleness.
- **A cache or DB failure never propagates.** Every `RedisKvStore` method
  degrades to a miss, because the cache must not be the reason a request fails
  (§14.3, no single point of failure).

`pg-store.ts` is covered by `test/pg-store.test.ts`, which parses the real
`db/schema.sql` and fails if a mapped column stops existing, then drives the
store through a recording fake `SqlClient`. That is how the mapping stays
honest without a database in CI.

## 9. Ingestion

`fetch()` returns normalised data; it does not write canonical rows. Writing is
a separate job (`lib/sdl-ingest.ts` in the app) so that reads stay cheap and the
canonical store is only ever touched by one code path:

```
POST /api/v1/ingest      (token-gated; 503 when NEMO_INGEST_TOKEN is unset)
npm run ingest [sport]   (cron / manual, exit 2 = refused, not crashed)
```

Per run, per sport: one `getLiveMatches` call, then competitions and teams are
looked up in `provider_entity_map` **first** — a provider is only called for an
entity never seen before (Instruction 9). Matches go through
`CanonicalMapper.upsertMatch`, which is where deduplication and conflict
detection happen, so the job cannot create a duplicate fixture or overwrite a
score with a lower-priority provider's value.

The job refuses to run in demo mode: demo fixtures must never enter the
canonical store, because canonical ids are permanent (Instruction 4) and demo
content must never be indexed (Instruction 6).
