# NEMO Sports · Data-source compliance (zero-cost edition)

Every external source in one auditable place: tier, limits, attribution, and
what we must never do. Re-verify each row quarterly and update `Last checked`.

## Source matrix

| Source | Tier | Cost | Automatic? | Used for | Fallback |
|---|---|---|---|---|---|
| **SportScore** (open tier) | Free, keyless | $0 | ✅ | Live scores, fixtures, results, standings, player stats, match detail | Stale cache + honest empty state |
| **Football-Data.org** | Free (key, server-side only) | $0 | ✅ | Tables, scorers, fixtures/results (leads static football); live fallback | Next provider in chain → cache |
| **TheSportsDB** | Free tier ONLY | $0 | ✅ | Teams/players metadata + artwork — NEVER live scores or premium V2 | SportScore / Football-Data |
| **Google News RSS** | Free, keyless | $0 | ✅ | News headlines (metadata + short snippet + original link) | Cached feed + honest empty state |
| **Official broadcast registry** | Admin-managed | $0 | ❌ (verified entries) | Legal broadcaster info per competition | Honest "no official broadcaster" state |
| **Vercel KV / Redis** | Free tier / unset | $0 | ✅ | Distributed cache when configured | In-process LRU |
| **Postgres** (`DATABASE_URL`) | Free tier / unset | $0 | ✅ | Canonical store, news, broadcasts | In-process memory |

## Free-tier limits (verify against provider docs before launch)

- **SportScore open tier** — ~10,000 requests / 24h / IP, burst-friendly;
  responses cached 60s at their edge. Our SDL cache policy rides that 60s
  edge cache (no point asking sooner). Attribution **REQUIRED**.
- **Football-Data.org free** — 10 req/min, 12 competitions, delayed scores.
  Our internal budget defaults to 8/min (`FOOTBALL_DATA_REQUESTS_PER_MINUTE`).
  Tables cached 15 min, scorers 1h, fixtures 5 min.
- **TheSportsDB free** — ~30 req/min on shared keys; metadata/images only.
  The adapter is on the `images` chain and team/player metadata — it is
  NEVER consulted for live scores (see `db/seed.sql` priority rules).
- **Google News RSS** — no published quota; we fetch per-source on
  15–240 min intervals with ETag/`If-Modified-Since`, 10s timeout, and
  exponential backoff (5→30 min) on failure.

## Attribution (all REQUIRED, all implemented)

| Source | Text | Link | Where |
|---|---|---|---|
| SportScore | بيانات المباريات: SportScore | https://www.sportscore.com | Footer (`AttributionFooter`) + `PoweredBy` on every data panel |
| Football-Data.org | بيانات كرة القدم: Football-Data.org | https://www.football-data.org | Footer + `PoweredByFootballData` on football surfaces |
| TheSportsDB | بيانات الفرق واللاعبين: TheSportsDB | https://www.thesportsdb.com | Any surface rendering its metadata/images |
| Google News RSS | Read on {publisher} + المصدر: {name} | Original article URL | Every `RssArticleCard`, `/api/v1/news` payload |

Registry: `lib/providers.ts`. Footer strip: `components/ui/AttributionFooter.tsx`.

## Content rules (news)

- ✅ Store/display: title, source name + URL, timestamps, RSS snippet
  (≤300 chars), category, related entities.
- ✅ Every article links its ORIGINAL publisher (`target=_blank`,
  `rel="noopener noreferrer nofollow"`).
- ❌ NEVER copy full article bodies. ❌ NEVER strip/alter attribution.
- ❌ NEVER label as breaking unless published < 15 min ago.
- Retention: 30 days; per-source cap: 100 articles (auto-pruned).

## Broadcast rules

Link acceptance is a two-layer check implemented in `lib/stream-policy.ts` and
used by `validateBroadcastLink()` / `validateEmbedUrl()`.

**1. Safety layer — always on, not configurable**

- `https:` only; a parseable absolute URL.
- No embedded credentials (`user:pass@`) and no non-standard port.
- No HTML/script markup, quotes or control characters inside the value.
- No `javascript:` / `data:` / `blob:` / `file:` scheme.
- No loopback, private, link-local or `.internal`/`.local` host (such a URL is
  unreachable for visitors and would render a dead player).

**2. Domain layer — operator switch (`NEMO_STREAM_DOMAIN_POLICY`)**

- `open` (**default**): any host that passes the safety layer is accepted. The
  admin who registers the link attests they hold the right to embed or link it;
  an unlisted host produces a non-blocking note, never a rejection.
- `allowlist`: only the reference domains in `lib/broadcasts.ts`
  (`OFFICIAL_BROADCAST_DOMAINS`) plus `NEMO_STREAM_ALLOWED_DOMAINS` are
  accepted. Use this when a deployment wants the curated behaviour.

Broadcast *entries* still carry the moderation lifecycle: a new broadcaster is
saved as `pending` and only an approved + enabled entry is shown publicly.

A domain — allowlisted or not — is never proof of broadcast rights. Rights
evidence (contract, licence, broadcaster confirmation) belongs in the
`verificationSource` field and is the operator's responsibility.

## Pre-launch verification

- [ ] Read SportScore open-tier terms (https://sportscore.com/developers/)
- [ ] Read Football-Data.org terms (https://www.football-data.org/terms)
- [ ] Read TheSportsDB terms (https://www.thesportsdb.com/terms.php)
- [ ] Confirm no premium TheSportsDB endpoint is reachable from the app
- [ ] Confirm attributions render on all data pages (desktop + mobile)
- [ ] Confirm `/api/cron/fetch-news` authorized + scheduled in Vercel
- [ ] Confirm `NEMO_NEWS_DISABLE` unset (or deliberately set)

## Monthly cost

```
Vercel (Hobby) ............ $0
Postgres (free tier/none) . $0
Redis (free tier/none) .... $0
SportScore ................ $0
Football-Data.org ......... $0
TheSportsDB ............... $0
Google News RSS ........... $0
────────────────────────────────
TOTAL ..................... $0
```

Optional future upgrades (never required): Vercel Pro (tighter crons),
managed Postgres/Redis (durability at scale), paid data plans (faster live).

---

- Last checked: 2026-10-06
- Owner: platform team
- Review cadence: quarterly
