# NEMO Sports — implementation and verification report

**Date:** 2026-10-09 · **Repository:** `mohaamedokasha1-arch/sport` · **Branch:** `arena/8837555d-sport`  
**Baseline:** `db4b659aed34faf6a050378024028b996b3b53f6`

## 1. Executive summary and boundaries

This is an implemented, tested incremental repair—not a rebuild and **not a claim that the entire master prompt is complete**. Existing routes, the Arabic navy/gold identity, sports coverage, provider adapters, admin tools and stored records were preserved. No production deployment, secret change, paid dependency, or production database mutation was performed.

The repository already contained a substantial Next.js 15.5.27 / React 19.1 / TypeScript application, 7 provider adapters including a development demo adapter, a two-layer provider/canonical cache, Postgres and Redis adapters, RSS ingestion, signed admin sessions, RBAC, and tests. Existing test success did not establish operational correctness: publication times, broadcast identity, persistent writes, serverless scheduling and source attribution still had defects.

Implemented additions:
- **My Football Day** at `/my-day`: device-local team/competition/player favorites, matching fixtures/results and news, reload persistence, clear preferences, storage-failure feedback. No registration.
- **NEMO Scout** at `/scout`: team sample comparison, home/away and supplied-season filters, recent results/goals visualization, head-to-head within the returned sample, same-response scorer comparison. Honest coverage and comparability warnings.
- **Match Pulse improvements** within existing `/matches/[slug]`: provider-pinned telemetry, match-ID filtering, player names where supplied, stoppage-time display, unavailable states. No invented momentum.
- **Calendar export** at `/api/v1/calendar/[slug]`, calendar-date navigation, and browser sharing on existing match pages.
- Original Arabic educational guide at `/learn`.
- Existing `/news` and `/watch` enhanced as Newsroom and Watch Guide rather than replaced.

### Production access

`curl -I --max-time 15 https://nemo-sports.vercel.app/` failed with TLS connection error (exit 35). This sandbox permits outbound access only to GitHub and package registries, not Vercel or sports/news providers. Consequently:
- The deployed commit, actual provider responses, live sports accuracy, production database, broadcast rights and Google indexing **were not verified**.
- Source code and prior audit claims were not treated as proof of deployment behavior.
- Local provider-failure paths, controlled fixtures and an isolated real PostgreSQL instance were used for verification. Controlled fixtures never entered the production database or committed content files.

## 2. Audit findings and repairs

| Priority | Location / cause | Impact | Implementation / verification |
|---|---|---|---|
| P0 | `lib/news/normalize.ts`: hostname substring matching plus automatic redirects | A feed link could induce an unintended server request; redirect destinations were not a security boundary | Exact Google origin recognition; no publisher redirect fetching. Public wrapper links retained. Regression test proves zero requests. RSS fetch itself rejects redirects. |
| P0 | `/api/v1/system` depended only on middleware | A stale directory session could continue accessing diagnostic data | Node-side permission/directory recheck. Valid legacy Basic Auth is independently revalidated, preserving that interface. HTTP tests cover anonymous/editor/admin. |
| P1 | News replaced absent publication timestamps with ingestion time | Undated stories appeared freshly published | Reject invalid/missing publication dates; test preserves original valid date. No stored historical records rewritten. |
| P1 | News ingestion published every parsed headline | Business, geography and property stories entered sports feeds | Conservative Arabic/English sports gate; reject unrelated stories; uncertain stories stored hidden for existing editorial review. Reduced broad category keywords. Test includes commercial false positives. This classifier is not fact verification. |
| P1 | News/broadcaster/score-override writes silently fell back to process memory on SQL failures | False success, lost edits after serverless restart | Durable-write failures are explicit; production memory-write override removed. Database write errors abort ingestion rather than counting as invalid articles and reporting success. |
| P1 | Stream lookup removed date suffixes and matched either team order | One match's stream could appear on another meeting | Exact stream identifiers only. Legacy alias-only entries preserved for admin rebinding. Admin match lookup permits undated aliases only when unique, never a mismatched requested date. Rematch regression and HTTP tests. |
| P1 | Telemetry fetched provider-local match IDs through independent fallback chains | Events/statistics could describe a different provider's same-numbered match | Optional provider-pinned SDL cache namespace and chain. Match detail pins events/stats/lineups to its resolved source; editorial matches do not request telemetry. Event match IDs also checked. |
| P1 | Circuit-open provider chain returned before checking stale cache | Last valid cached results unavailable precisely during an outage | Stale fallback is attempted even with no available chain; original timestamp retained. New circuit-open regression. |
| P1 | Arbitrary match dates fell through to “today”; UTC query dates omitted Cairo midnight fixtures | Inconsistent date results | Validated date keys, IANA Cairo day filtering, two adjacent UTC requests, deduplication and degraded flag on partial results. Homepage today/listing share the Cairo helper. Date/API/DST tests. |
| P1 | Public reads launched unawaited news jobs | Work could be terminated at the serverless response boundary | Removed fire-and-forget ingestion. Awaited cron/admin jobs only, database-required in production, process coalescing, transaction-scoped advisory lock across replicas and bounded work. |
| P1 | Admin test wrote into tracked `db/admin-matches.json` | QA contaminated application data | Restored only test-generated mutation; isolated test memory/disk paths. Existing source records unchanged. Offline admin tests refuse configured databases. |
| P1 | Empty admin match tables auto-populated from bundled manual records | Unverified bundled records copied into a new durable database | Bootstrap now requires `NEMO_BOOTSTRAP_LEGACY_DATA=1`; existing rows/files not deleted. Manual fixture provenance is visible and uses editorial update time, not read time. |
| P1 | `lib/match-overrides.ts` marked lazy schema initialization complete before DDL finished | Concurrent first reads could query a nonexistent table (observed in local Postgres logs) | Shared initialization promise with retry after failure; migration 0004 explicitly creates existing overrides/broadcaster tables before traffic. Real DB write/read and two migration runs passed. |
| P2 | `/api/v1/matches` and live endpoint accepted unbounded/invalid filters | Wasted quota and inconsistent errors | Bounds, duplicate-param checks, allowed sports/statuses, real date validation; invalid requests return 400. |
| P2 | Stream iframe lacked sandbox; allowed URLs accepted credentials/custom ports | Unnecessary embedded-content privileges and confusing URLs | Player sandbox added; no top-navigation/popups; credential-bearing URLs, nonstandard ports and lookalikes rejected. Rights verification remains an editorial responsibility. |
| P2 | Relay impersonated a browser to avoid a provider challenge | Fragile access and compliance risk | Honest UA, timeout, no redirects, bounded query; relay disabled unless explicitly permitted/enabled. Direct provider path restored on Vercel. 403/challenges must not be bypassed. |
| P2 | Per-process news feed cache retained moderated stories | Hidden articles could remain visible across requests/replicas | Read the durable store directly; admin actions revalidate `/news`. Existing public API HTTP cache remains briefly cacheable only for non-stale responses. |
| P2 | Freshness based on newest stored article; “breaking” inferred from age | False update and editorial claims | Freshness follows successful source checks/failures; newly fetched is not newly published; “recently published” replaces automatic “breaking”; snippets and automated labels disclosed. |
| P2 | Footer attribution claimed a configured provider despite no servable provider data | Misleading source claims | Sports badges gated by data-servability; per-panel source notes retained. Smoke tests no longer hardcode SportScore as the only possible source. |
| P2 | Contrast in existing footer/login page | WCAG AA failures on mobile and desktop | Increased muted white text contrast. Logo accessible name includes visible English branding; score-rail links use their visible content. Automated axe checks rerun. |
| P2 | Login JSON `null` crashed; Origin comparison used Next's internal listener | Invalid-input errors; added CSRF check initially rejected legitimate local login | Object-shape validation; compare Origin host to browser-facing Host (including port), not internal request URL. Cross-origin and valid-origin HTTP regression. |
| P2 | Sitemap used request time as static content modification time; invalid SportsEvent enums | Misleading SEO metadata | Removed fabricated `lastModified`; omit unsupported completed/in-progress enums; `/learn` included; personal/comparison pages noindex. |

### Remaining release risks (not hidden by passing tests)

1. **Provider-local list/detail identity across multiple simultaneously enabled providers** is not a complete globally namespaced canonical URL system. Telemetry is pinned after detail resolution, but legacy bare numeric match URLs can still be ambiguous across providers. Verify your configured chains and do not assume numeric IDs are interchangeable. Full cross-provider entity/URL migration needs a separately validated compatibility plan.
2. Bundled manual fixtures and broadcaster seeds predate this work. Their sporting accuracy/current rights cannot be verified here. They are preserved; manually maintained fixtures are labeled editorial. Review these records before release, especially alias-only stream bindings. A host allowlist is not proof of broadcast rights.
3. Existing memory fallbacks for several **read** paths, auto-DDL behavior, and best-effort audit logging remain; this was not a wholesale persistence rewrite. Deployment DB health must be monitored. Audit logging is not an immutable transactionally coupled compliance ledger.
4. Admin login throttling and stream-validation throttling are process-local. They are not a distributed brute-force guarantee on multiple serverless replicas. Shared edge/Redis enforcement remains recommended.
5. CSP still allows inline scripts/styles required by the current Next app and permits HTTPS iframe sources. Sandbox/URL validation constrain the actual player, but nonce-based CSP and a unified CSP host allowlist remain future work.
6. News sources use Google News discovery queries, not publisher-license verification. Feed terms, reuse permissions and source quality need owner review. Existing historical published articles were not destructively reclassified or deleted.
7. Jobs are bounded, but one unusually slow source/database can still consume the function budget. With daily cron, a large backlog may require additional authorized runs; due sources remain due. No real-time freshness promise.
8. Legacy cron query-token authentication is retained for compatibility; use Bearer headers to avoid URL/log leakage. Production token rotation was not attempted.

## 3. Feature inventory

Status vocabulary: **Working and tested** means local evidence below, not production certification. **Partial** means only the explicitly described portion. **Blocked** requires external access/infrastructure/data. **Not implemented** is not disguised as a placeholder.

| Feature | Status | Evidence / limits |
|---|---|---|
| Existing homepage/navigation/RTL/public routes | Working and tested locally | 37-route smoke suite, real production build, Chromium at 390/1280px. No production comparison. |
| Live matches, elapsed time, special statuses | Partial; provider access blocked | SDL status tests and failure paths pass. No fabricated transition based on kickoff. Current live scores not verified. |
| Today/date/team/competition/status filters | Working and tested locally | Cairo/DST/query tests, UI date navigation, shared helper. Complete historic/week coverage still depends on provider response scope. |
| Fixtures/results/team/competition/player routes | Existing, partial; external coverage blocked | Routes preserved; provider normalization/search suites pass; no claim of global player database. Real entity data and season coverage require live provider verification. |
| Stable match detail / old singular route | Working for verified local records | Existing route/redirect retained. HTTP durable match and incorrect-date 404 checked. Multi-provider bare-ID limitation above. |
| Match Pulse | Partial, implemented and locally tested | Source-pinned timeline/stats/lineups, supplied player names/stoppage time, explicit gaps. Provider-dependent real events remain blocked. Momentum intentionally absent. |
| Scout team comparison | Partial, implemented/tested | Completed-score-only calculation, venue/season/sample filters, recent form and scoped head-to-head. Not a full season/historical warehouse. |
| Scout player comparison | Partial, implemented; live data blocked | Same scorer response, optional appearances/assists/penalties; no invented metrics/position/history. Dataset does not consistently identify season, explicitly disclosed. |
| My Football Day | Working and tested for implemented subset | Browser save/reload/clear, robust storage parsing, provider-scoped IDs, relevant loaded fixtures/news. Standings are linked, not personalized tables. No schedule-change history or notifications. Player selection drawn from available PL scorer list, not all players. |
| Prediction Challenge / friend groups | Blocked / not implemented | No public-user authentication or production game persistence configured. Admin credentials are not public user accounts. No fake leaderboard, prototype scores, bets or prizes. |
| Newsroom ingestion/review | Partial, tested with controlled RSS and real local DB | Sports gate, honest dates, canonical/near-title dedup, hidden review, existing moderation/source management, source health/logs. No official/rumor fact certification. |
| Newsroom discovery | Partial | Existing category/competition filters preserved; `team` query passed through. Original links, labeled RSS excerpts, report/uncertain labels. Similar same-day titles grouped within the loaded news window, with all original publisher links retained and a non-verification warning. Not a comprehensive cross-publisher archive. |
| Watch Guide | Partial, implemented and locally tested | Registered schedules, region/platform/access descriptions, direct allowlisted links, exact associations, persistent saved stream on correct public page. No provider rights API, guaranteed availability, or verified free viewing. |
| Football calendar | Partial, working and tested | Daily/week UI coverage follows returned data; arbitrary day navigation; safe UTF-8-folded UTC ICS download, stable UID, no fabricated duration. Export refuses stale/postponed/unscheduled time and is a snapshot, not a subscription. |
| Head-to-head and form explorer | Partial, working on available sample | Scout calculations tested; periods and incomplete coverage disclosed. No qualification/relegation certainty engine. |
| Transfer/squad tracker | Not implemented beyond existing provider/admin content | Reliable confirmation source/history not available. No invented transfers. |
| Match comparison workspace | Not implemented as a dedicated workspace | Team Scout supplies part of the context. No implied match prediction feature. |
| Educational center | Working and tested | One original `/learn` page; no mass thin SEO generation. |
| Accessibility/localization | Partial, locally tested | Arabic RTL, native labels/keyboard controls, two viewport sizes, 16 axe WCAG 2 A/AA route/view checks with zero detected violations. Not a full manual screen-reader audit; no new English route variants. |
| Notifications | Blocked / not implemented | No persistent push worker/subscription store or verified real-time source/delivery capability. |
| Sharing | Working and tested for server output; browser fallback implemented | Stable match URL, Web Share/clipboard fallback; calendar HTTP tested. Native mobile share sheet not manually verified. |
| Admin auth/RBAC | Working locally for tested flows | Session tampering/expiry/deactivation tests; real HTTP admin/editor/anonymous authorization and Basic compatibility; no production account access. |
| Admin saves/news/broadcast persistence | Working in isolated Postgres | Separate write/read processes and public HTTP lookup; no production DB verification. Full click-through of every admin form not performed. |
| Provider health/cache/jobs | Partial | Existing SDL metrics/caches preserved; stale/circuit-open test, local PG job lock test. Redis adapter tests are controlled doubles; production distributed operation unverified. |
| SEO | Partial, locally tested | Robots/sitemap/noindex/canonical/JSON-LD output checked; invalid enums removed. Search Console/indexing and external URL availability blocked. |
| Payments/gambling/pirate streams | Not applicable / prohibited | No new functionality or dependencies introduced. |

## 4. Important changed files

- `lib/sdl-gateway.ts`, `packages/sdl/src/orchestrator.ts`: provider affinity, stale fallback, Cairo feed aggregation and editorial freshness.
- `packages/sdl/src/provider.ts`, `adapters/api-football.ts`, `adapters/sportscore.ts`: supplied player names/editorial provenance; honest transport and relay behavior.
- `lib/tz.ts`, `lib/provider-match-filter.ts`, `lib/match-query.ts`, `components/match/MatchesFilters.tsx`: calendar/filter semantics and validation.
- `app/page.tsx`, `app/matches/page.tsx`, `app/matches/[slug]/page.tsx`, match/live API routes: connect repairs to the real public application.
- `lib/news/{pipeline,normalize,relevance,categorize,store,service}.ts`: ingestion, SSRF prevention, editorial routing, fail-closed writes, locking, freshness and moderation consistency.
- `lib/{admin-matches,match-streams,broadcasts,match-overrides}.ts`, `lib/db/{pg,store-policy}.ts`: identity binding, safe DB policy, finite DB connection/query budgets and non-mutating tests.
- `lib/admin-session.ts`, login/system API routes: fresh authorization, compatible Basic Auth and input/origin protection.
- `app/my-day`, `components/personal`, `lib/preferences.ts`: local personalization.
- `app/scout`, `components/scout`, `lib/scout.ts`: bounded real-data comparisons.
- `lib/calendar.ts`, calendar API, `ShareMatch.tsx`: export/sharing.
- `app/learn`, `/news`, `/watch`, `/account`, `/privacy`, navigation/footer/header: integrated discovery, honest messaging, privacy and accessibility.
- `app/sitemap.ts`: no fabricated modification times; useful original content route.
- `scripts/verify-{repairs.test,durable,browser,http-auth}`, SDL tests, smoke/admin checks: reproducible verification; generated records remain isolated.
- `.env.example`, README, scheduling documentation: changed deployment semantics.

No runtime dependency upgrades, new paid providers, production database operations, route removals, or mass formatting were performed. One additive migration was added and tested locally; it has not been applied to production.

## 5. Executed verification

### Baseline

- `npm ci --no-audit` — succeeded.
- `npm test` — 141 tests passed before modifications.
- `npm run news:test`, `npm run search:test`, `npm run admin:test` — baseline passed (41 admin checks); discovered and reversed its tracked-file mutation.
- `npx tsc --noEmit` — passed.
- `npm audit --omit=dev` — zero reported vulnerabilities at execution time. This is not a security certification.

### Final local checks

Raw final build, combined-check and browser logs are preserved in [`verification-2026-10-09/`](verification-2026-10-09/). `npm run check` was executed successfully after the final code changes. It now includes TypeScript, SDL, repair, admin, news, search and HTTP smoke checks.

| Command / check | Result |
|---|---|
| `npm test` | **143 passed**, including new source-affinity and circuit-open stale-cache regressions. |
| `npm run repairs:test` | **15 passed**: date/DST, validation, sports relevance, redirect avoidance, ingestion/dedup/failure retention, broadcast binding, storage denial, preferences, Scout and ICS. |
| `npm run admin:test` | **41 passed** with isolated memory writes; production memory override test deliberately updated to assert refusal. |
| `npm run news:test` | All checks passed (offline parser/categorization/dedup/attribution assertions). |
| `npm run search:test` | **20 passed**. |
| `npm run typecheck` / `npm run sdl:typecheck` | Passed. |
| `npm run build` | Passed repeatedly after changes; final output includes new routes and retains old routes. |
| `npm audit --omit=dev` | Zero reported production-dependency vulnerabilities. |
| `git diff --check` | Passed. |
| `BASE=http://127.0.0.1:3000 node scripts/smoke.mjs` | **37 public route checks passed**, plus anonymous privileged denial/API/failure/SEO/security-header checks. |
| `QA_PACKAGE_JSON=<QA-dir>/package.json LD_LIBRARY_PATH=<QA-dir>/lib node scripts/verify-browser.mjs` | Favorites reload/clear; date query interaction; zero runtime errors; **16 route/viewport axe checks with zero detected WCAG 2 A/AA violations**; no horizontal document overflow at 390/1280px. |
| `npm run db:verify` without configuration | Correctly failed: no production `DATABASE_URL`/`REDIS_URL`. Not reported as a pass. |
| Isolated `DATABASE_URL=... npm run db:setup` | Existing schema, seed, migrations 0002/0003 and additive migration 0004 applied successfully to disposable PostgreSQL 18.4. Setup was rerun twice to check idempotency. No production data involved. |
| Isolated `npm run db:verify` | Passed Postgres connectivity, canonical/news schema and temporary write probe. Initial warnings: local DB has no TLS, no Redis, lazy match-overrides table. Migration 0004 now creates the latter explicitly. Its generic “ready for production” text does **not** certify this deployment. |
| `tsx scripts/verify-durable.ts write`, then a separate `... read` process | Match, score-override note, stream, broadcaster, news source/article persisted; correct match binding; moderation visible; cross-connection advisory lock blocks overlapping jobs. |
| `QA_PACKAGE_JSON=<QA-dir>/package.json LD_LIBRARY_PATH=<QA-dir>/lib node scripts/verify-provider-flows.mjs` | Controlled Football-Data adapter → API → match/team/competition pages; nonempty Scout player selection; supplied-player favorite reload; Cairo date dedup; mobile overflow/runtime checks. Not live provider verification. |
| `NEMO_QA_ENV_FILE=<external-test-file> node scripts/verify-http-auth.mjs` | Authenticated admin/editor HTTP flows, cookie attributes, anonymous denial, origin/input rejection, Basic compatibility, exact durable stream association, rematch 404 and calendar download. |

### Failures found during verification

- Admin policy regression initially expected the removed unsafe production-memory override; corrected the test to the stronger required behavior.
- First smoke run incorrectly required SportScore whenever editorial fallback existed. It now checks source-aware attribution; a genuine no-data footer attribution issue was also fixed.
- Browser first could not start because OS NSS libraries were missing. QA-only libraries bundled in the npm Chromium package were extracted outside the repository; browser tests then ran.
- Axe found footer/login contrast failures; colors corrected, suite rerun successfully.
- Initial same-origin guard compared to Next's internal request URL and rejected a legitimate login; corrected to Host and retested.
- Route-level authorization exposed legacy Basic Auth's same-request cookie gap; Node now revalidates the actual Basic credential rather than bypassing auth.
- Initial disposable DB test used the wrong match input shape and later failed cleanup/dedup isolation. Test harness corrected; write/read/HTTP persistence rerun.

There is no ESLint configuration/script in the existing project. Next build's lint/type stage and explicit TypeScript checks ran; no standalone lint pass is claimed. Browser checks are automated, not a comprehensive manual screen-reader, native sharing, performance-lab or production E2E certification.

### Reproduce optional integration tests safely

1. Create an isolated loopback PostgreSQL database named **`nemo_verification`**. The durability script refuses other database names/hosts. Never use production credentials.
2. Set `DATABASE_URL` locally and apply `npm run db:setup`.
3. Run `npx tsx scripts/verify-durable.ts write`, then `... read` in a fresh process. Optional `NEMO_QA_PASSWORD` creates a test-only editor for HTTP checks.
4. Start a separate app process with that database, locally generated admin token/session secret, SportScore disabled and news disabled. Store QA secrets **outside Git**; never print them.
5. Run `verify-http-auth.mjs` with `BASE` and `NEMO_QA_ENV_FILE` pointing to the local server/test-only secret file. The secret file's keys are `ADMIN_ACCESS_TOKEN`, `ADMIN_SESSION_SECRET`, `NEMO_QA_PASSWORD`.
6. Run `... verify-durable.ts cleanup`; stop the isolated servers. These tests never publish fake data on the real site.
7. Browser tooling is optional and external to production dependencies: install `playwright`, `@sparticuz/chromium`, `axe-core` in a QA directory, provide its `package.json` via `QA_PACKAGE_JSON`, and a working Chromium executable/system libraries. No test browser binaries belong in Git.

## 6. Provider report

All existing adapters retained. **Live documentation/license/entitlement verification is blocked by network access.** The following is adapter/configuration evidence, not a fresh guarantee from the provider.

| Provider | Existing implementation / coverage | Constraints |
|---|---|---|
| SportScore widget | Keyless default; multi-sport fixtures/detail/events/stats/lineups/standings/scorers/player data as returned | Legal permission and exact widget contract unverified here. Honest UA/direct endpoint; relay opt-in, not a challenge bypass. Provider slugs may not be globally date-unique. |
| Football-Data.org v4 | Keyed; configured competition catalogue; fixtures/detail, standings/scorers, competition/team | Repository lists 12 competition codes; adapter budget defaults to 8/minute under its documented-in-repo 10/minute free-tier assumption. Scorers and detailed coverage may be restricted; do not purchase a plan implicitly. Live free-tier scores may be delayed. |
| API-Football | Existing keyed football adapter; fixture/event/stat/team-related capabilities | Availability, quotas and subscriptions depend on the existing key. Not called against the real service here. |
| Sportmonks | Existing token-backed adapter | Coverage/entitlement depends on account; no new subscription. |
| Sportradar | Existing key-backed adapter | Coverage/entitlement depends on account; no new subscription. |
| TheSportsDB | Existing keyed team/squad/player/competition/venue/fixture adapter | Optional fields remain optional; do not assume global roster completeness. |
| Demo | Existing explicit development/CI adapter | Never a production failure substitute; new personalization/Scout features reject demo-source datasets. |
| Google News RSS | Existing keyless discovery queries in `lib/news/sources.ts`; admin-configurable query registry | Public accessibility is not a redistribution license. RSS headlines/snippets/links only; no full-article scraping, AI service or publisher redirect chasing. Missing-date stories rejected. |

Cache intervals remain centralized. SportScore defaults include ~50s canonical live/detail/events, 120s fixtures, 600s standings and 1800s scorers. Football-Data overrides include 60s live, 120s detail, 300s fixtures, 900s standings and 3600s scorers. These are **application cache TTLs**, not freshness guarantees or provider update promises. Redis is needed to share cache/quota counters across replicas; absent Redis, counters/cache are per-process and concurrency limits are local. External provider failures preserve cached timestamps and disclose stale/degraded data.

## 7. Deployment and environment

**Do not deploy assuming production is verified.** Review remaining release risks first and use a staging deployment with your actual providers and durable storage.

- Vercel project root remains `nemo-sports`; retain the existing package lock and `npm run build`.
- Set `NEXT_PUBLIC_SITE_URL` to the actual production HTTPS origin; avoid per-preview canonical domains.
- Keep existing provider secret names: `FOOTBALL_DATA_API_KEY`, `API_FOOTBALL_KEY`, `SPORTMONKS_TOKEN` (alias supported), `SPORTRADAR_KEY`, `THESPORTSDB_KEY` (alias supported). Never use `NEXT_PUBLIC_` for these.
- `DATABASE_URL` is required for durable production admin/news writes. `PG_POOL_MAX` defaults to 5; the job advisory lock occupies one pooled connection while store operations use others—**use at least 2**, preferably the default 5. Configure managed-DB TLS according to the provider.
- `REDIS_URL` / `REDIS_KEY_PREFIX` preserve the existing shared cache integration; no new service was provisioned. A production storage choice/cost still needs owner approval if not already available.
- Apply existing `npm run db:setup` only after inspecting the target and taking a backup. **New migration `db/migration-0004-durable-storage.sql` is additive/idempotent:** creates the existing `match_overrides` and `broadcasts` schema if absent, with no data insertion or deletion. Apply before routing traffic. App modules still perform some lazy DDL for compatibility.
- `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, and optional existing `ADMIN_ACCESS_TOKEN` retain their meanings. Hash with the existing helper. No default password was introduced. `ADMIN_ALLOW_MEMORY_STORE=1` no longer permits production writes.
- Leave `NEMO_BOOTSTRAP_LEGACY_DATA` unset unless editorially reviewed bundled records should populate an **empty** `admin_matches` table. Existing rows are untouched.
- `NEMO_SPORTSCORE_RELAY_ENABLED` is new and **off by default**. Only enable with permission/compatible terms; transport failures must not be evaded. `SPORTSCORE_BASE_URL` remains an operator-only override.
- Keep production `NEXT_PUBLIC_DEMO_CONTENT` unset and `NEMO_SDL_MODE=auto`. Test-memory flags belong only to isolated test processes.
- `CRON_SECRET` authorizes Vercel's Bearer header; `NEMO_INGEST_TOKEN` remains a compatible alternative for controlled schedulers. Existing schedules are retained: sports ingestion **03:00 UTC**, news **03:30 UTC** daily. Confirm current plan limits in your Vercel account (not accessible here).
- **Public page traffic no longer triggers news ingestion.** Daily cron does not provide minute-level news. An existing authorized external scheduler can call the endpoint within quotas and hosting limits. No paid scheduler added.
- `NEMO_NEWS_DISABLE=1` pauses normal ingestion; existing privileged force behavior remains. Monitor `lastSuccessfulFetch`, failure/backoff and the admin job history.
- Calendar exports are downloads, not subscriptions: users must revisit the match after rescheduling.

## 8. SEO and privacy

- Existing routes and canonical structure retained; no new hreflang for nonexistent English alternatives.
- Existing root canonical origin resolution remains; explicitly configure production origin rather than trusting preview environment fallback.
- `/my-day` and `/scout` are noindex utilities, not sitemap targets. `/learn` is original useful content and is included in the sitemap.
- Existing data sections depend on data-servability; no fake match/player/news pages added to fill the sitemap.
- Static sitemap entries no longer pretend every request is a content update. Real admin content keeps its stored `updatedAt`.
- SportsEvent unsupported completed/in-progress enums removed; no invented attendance, reviews or ratings.
- Browser/HTTP checks validate generated output, not Google's index or rich-result eligibility. Existing verification tag preserved; **no Search Console or indexing claim**.
- Favorites use `nemo-football-day-v1` browser storage. They are device-specific, not uploaded to an account, and clearable. Theme storage remains. Privacy/account copy updated; no analytics/tracking introduced.

## 9. External blockers and intentional deferrals

- Production URL, real providers/feed hosts, licenses, broadcast rights and deployment configuration inaccessible in this sandbox.
- No production Postgres/Redis credentials or deployment operation was supplied/performed. Local PostgreSQL verification is not production provisioning.
- Public-user identity is absent; prediction game and friend groups cannot safely reuse admin authentication.
- Full historical analytics, verified transfers, complete squads and position-aware comparisons require provider fields/history not guaranteed by the available adapter models.
- Reliable real-time notifications require verified provider cadence, subscription persistence and a supported delivery mechanism.
- Multi-provider bare-ID ambiguity, distributed abuse prevention, unified strict CSP, database read-fallback policy and full admin-UI E2E remain follow-up work.

## 10. Rollback and safe rollout

1. Back up deployment configuration and durable data before staging/release; no secret values should enter Git or this report.
2. Use the previous known-good Vercel deployment for an immediate code rollback. No migration was run against production and no production records were rewritten. Migration 0004 only creates tables already understood by old code; retain those tables when rolling code back, rather than dropping saved data.
3. On the same working branch, review/revert the specific patch against baseline `db4b659...`; do **not** blindly reset unrelated future changes or delete `db/*.json`. No commit/push is required to preserve Arena work.
4. Existing DB records remain compatible with prior code. Be aware that rolling back also restores unsafe memory fallbacks, broad stream matching and unawaited ingestion; do not treat rollback as a security improvement.
5. New preferences are local-only and ignored by old code. Users can clear them in the UI or browser site-data settings.
6. If a legitimate legacy alias-only stream no longer resolves, rebind it to the correct exact match slug in admin; do not restore broad team/date matching to recover one link.
7. Keep test fixtures, QA credentials, browser binaries and local PostgreSQL files out of Git and out of production. The disposable test database, mock provider and authenticated QA application were stopped and their test records cleaned after verification. The remaining local preview has no QA database or mock provider; it uses the existing editorial records and honest unavailable states. External provider/news fetching is disabled only in that preview process because of sandbox network limits.
