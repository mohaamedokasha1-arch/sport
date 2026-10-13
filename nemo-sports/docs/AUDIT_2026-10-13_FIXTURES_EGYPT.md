# NEMO Sports — Audit 2026-10-13: fixtures, Egyptian league, homepage day sections

Branch `arena/2b719c78-sport` (from `main` @ `96eca5b`). App root `nemo-sports/`.

## 0. Scope and what could not be tested

| Item | Result | Label |
|---|---|---|
| `https://nemo-sports.vercel.app/` from the sandbox | HTTP 000 (no route out) | **External limitation** — production was NOT inspected live |
| `sportscore.com` from the sandbox (`curl`) | HTTP 000 | **External limitation** — SportScore was read only through the read-only page fetch tool |
| SportScore public REST v1 `fixtures/`, team, standings endpoints | Read through the fetch tool on 2026-10-13 | **Confirmed by fetch, not by NEMO production** |
| `npm ci`, `npm run check`, `npm run build`, `npm run smoke` | All run locally | **Confirmed and reproduced (local)** |
| Replay of the built app against captured provider payloads | Run locally | **Confirmed and reproduced (local replay)** |
| Football-Data.org | `FOOTBALL_DATA_API_KEY` not set in this environment | **External limitation** |

Nothing in this document claims that the deployed site has changed. It has not been deployed.

## 1. Route inventory (Phase 1)

Source: `find app -name page.tsx -o -name route.ts`. Status columns are from the local build
(`npm run smoke`, 37 routes, empty-data mode, all green) and the local replay run.

| Route | Kind | Status (local) |
|---|---|---|
| `/` | page, ISR 60 s | Working. Empty-data: honest "unavailable" states. Replay: live 10 / today 9 / results present |
| `/live`, `/matches`, `/matches/[slug]`, `/match/[slug]` | live/match | Smoke-green. Live counts agree on every surface (`verify-live-consistency`, all checks ✓) |
| `/today` | 308 → `/matches?date=today` | Intentional redirect (documented in code) |
| `/fixtures`, `/results`, `/standings` | schedule/tables | Smoke-green |
| `/competitions`, `/competitions/[slug]` | competition | Egyptian page: fixed (see F1). Aliases 308 to canonical (`/competitions/egyptian-premier-league` → `/competitions/egyptian-league`) |
| `/teams`, `/teams/[slug]` | teams | Smoke-green. Directory is derived from standings; empty when standings are unavailable |
| `/players`, `/players/[slug]` | players | Smoke-green. Directory = top scorers only (not a complete player database) |
| `/search` | search | Smoke-green. Match and competition queries verified (Arabic + English), see §4 |
| `/news`, `/news/[slug]` | news | Smoke-green. Pipeline not changed this turn |
| `/watch`, `/broadcast-rights` | broadcast | Not modified (out of scope by rule 5) |
| `/about`, `/contact`, `/faq`, `/learn`, `/privacy`, `/terms`, `/copyright`, `/account`, `/my-day`, `/scout` | static / utility | Smoke-green |
| `/admin/*` (21 pages) | admin | Returns 404 with no admin configuration (closed by design). Not modified |
| `/admin/login` | admin | 200 |
| `/robots.txt`, `/sitemap.xml` | SEO | 200 |
| `/api/live`, `/api/search`, `/api/v1`, `/api/v1/live`, `/api/v1/matches`, `/api/v1/competitions`, `/api/v1/news`, `/api/v1/football-data/*`, `/api/v1/calendar/[slug]` | public API | Smoke-green |
| `/api/v1/system`, `/api/v1/ingest`, `/api/cron/fetch-news`, `/api/cron/*`, `/api/v1/pipeline/*` | protected / scheduled | 503 with no secret configured (fail-closed, by design) |
| `/api/v1/sportscore-relay/[...path]` | relay | Disabled unless `NEMO_SPORTSCORE_RELAY_ENABLED=1`; can only proxy widget endpoints |

Providers and data layers: SportScore (keyless, default), Football-Data.org (keyed, not configured here),
Sportradar / Sportmonks / API-Football / TheSportsDB (adapters exist, keys not configured), editorial
records in `db/admin-matches.json` (shown with a "تحريري" label), and an offline demo adapter that is
only active in development. Cache: `packages/sdl` 5-layer cache (in-process memory without `REDIS_URL`).
Database: `lib/db/pg.ts`, schema in `db/schema.sql`, in-memory fallback without `DATABASE_URL`.

## 2. Findings

Severity: **H** = visible wrong data or missing data on a main page; **M** = wrong metadata or misleading state; **L** = low.

| ID | Sev | Route / file | Root cause | Evidence | Status |
|---|---|---|---|---|---|
| F1 | H | `/competitions/egyptian-league` · `packages/sdl/src/adapters/sportscore.ts` `getFixtures` | The adapter's only fixtures source was SportScore `matches/`, documented as "live + recent", capped at 50 matches across **all** competitions. The competition filter ran **after** that cap, so a smaller league such as the Egyptian Premier League almost always had zero fixtures while its standings table loaded. | `matches/` documented as live + recent with `limit ≤ 50` (SportScore developer page). The REST v1 `fixtures/` endpoint returns a full UTC day and accepts `competition=` (OpenAPI spec, fetched 2026-10-13). Live v1 response for `competition=egyptian-premier-league&date=2026-10-12` returned **4 matches** (captured to `test/fixtures/sportscore/v1-fixtures-egypt-2026-10-12.json`). Replay of the built app: the page now lists those 4 results and upcoming Egyptian fixtures. | **Fixed (local verified).** Production not verified |
| F2 | H | `/` "مباريات الغد" and "أحدث النتائج" | Both sections were filtered from the same 50-match feed, which contains almost no tomorrow or yesterday matches, so they were structurally empty. | `app/page.tsx` read `providerFixtures` (feed) for both. | **Fixed (local verified)**: both now use `fixturesForCairoDate` (day endpoint, Cairo boundary) |
| F3 | H | `/` "مباريات اليوم" | The empty state said "no matches" in the same way for a failed fetch and a genuine empty day, and its text depended on the feed sample. | `app/page.tsx` `feedIsSampleBehindNow` branch. | **Fixed**: failed fetch → "تعذّر استرجاع مباريات اليوم"; ok + empty → "لم يسجّل المصدر مباريات…لهذا اليوم"; degraded → explicit wording. Verified on the build |
| F4 | M | `/competitions/egyptian-league` metadata | The provider-backed competition page set no `openGraph`, so shared links inherited the homepage title "نيمو سبورتس \| نتائج ومواعيد المباريات". | `curl` on the built page: `og:title` = homepage title. Match and team pages already set their own `openGraph`. | **Fixed**: own `openGraph` title/description; verified in the built HTML |
| F5 | M | `/` (homepage) | Build-time prerender persists in `.next/cache` (ISR). After a replay run, a restart served replay HTML until a clean rebuild. | Reproduced locally; `rm -rf .next` + rebuild resolved it. | **Operational note, not a code defect.** Deployments always rebuild |
| F6 | H (carried) | `/api/cron/fetch-news`, `/api/v1/ingest` | No `CRON_SECRET` / `NEMO_INGEST_TOKEN` in this environment. Both return 503 by design, so the scheduled news/ingest job cannot run until configured. | `curl` → 503 `not_configured`. Matches the 2026-10-11 production-config audit. | **External blocker**: operator must set the secret in Vercel and verify |
| F7 | H (carried) | Top scorers, standings fallback, Egyptian standings on Vercel | Football-Data.org key is not set, so SportScore is the only source for football standings and scorers. | `FOOTBALL_DATA_API_KEY` unset; `/api/v1/football-data/status` `configured:false` in the 2026-10-11 audit. | **External blocker** (see §6) |
| F8 | M | `/search?q=بيراميدز`, `/search?q=salah` | Team and player search only uses the provider-derived directory (standings / top scorers). With no standings, Arabic team and player queries return zero results. There is no approved team catalogue outside demo content. | `curl /api/search?q=…` → 0 teams/players for "بيراميدز" and "صلاح" in the replay. Competition and match queries work (`الدوري المصري` → `/competitions/egyptian-league`; `ahly` → `/matches/al-ahly-vs-zamalek`). | **Open** — needs a decision on a team/player source (§6) |
| F9 | L | `/robots.txt` | Contains a non-standard `Host: https://nemo-sports.vercel.app` line. Harmless for Google (ignored); not changed. | `curl /robots.txt` | Open, low |
| F10 | M | `/competitions/egyptian-league` standings | Standings endpoint is correct: SportScore `standings/?slug=egyptian-premier-league` returns the 20-team table with 6 matches played each (fetched 2026-10-13). Local replay does not serve Egyptian standings, so the table shows its "unavailable" state locally. | fetch tool read of the endpoint; replay harness serves UEFA standings only. | Verified at the provider level; production check needed |
| F11 | L | Relay mode (`NEMO_SPORTSCORE_RELAY_ENABLED=1`) | The relay only proxies widget endpoints, so day fixtures cannot be served through it. It now reports `not_supported` instead of silently falling back to a partial feed. | Unit test `REST v1: the compatibility relay cannot serve day fixtures…`. | **Fixed** (explicit failure) |

## 3. Fixes implemented

1. **`packages/sdl/src/adapters/sportscore.ts`** (F1, F11)
   - `getFixtures` with a `date` now calls the documented REST v1 `fixtures/?sport&date[&competition]&limit=200` for that UTC day. An empty day is a genuine empty list; a provider failure is returned as a failure.
   - `getFixtures` with a competition but no date walks a bounded window of UTC days (today ±5 days, or the requested range, capped at 14 days). One failed day fails the whole request, so a partial schedule is never shown as complete. The response's `fetchedAt` is the newest provider response, not the local clock.
   - Rows are de-duplicated by provider match id, filtered by competition slug (exact match, no substring), and sorted.
   - Requests without a date or competition still use the live + recent feed, unchanged, which is what the live board uses.
2. **`packages/sdl/src/adapters/base.ts`** — `getJson` accepts an optional base URL so one adapter can address `/api/v1` on the same host. Existing callers are unchanged.
3. **`app/page.tsx`** (F2, F3) — "today", "tomorrow" and "latest results" are all built from the Cairo-day gateway call. Each section's empty state now reflects the real source state. The `feedIsSampleBehindNow` branch and the feed-based wording are removed.
4. **`app/competitions/[slug]/page.tsx`** (F4) — the provider-backed competition page now sets its own `openGraph` title and description.
5. **`scripts/replay-sportscore-today.mjs`** — the local replay now serves `/api/v1/fixtures/`. The Egyptian 2026-10-12 answer is the real captured payload; other days are derived from the harness's own kickoffs, so an empty day is a genuine empty.
6. **Tests** — `packages/sdl/test/sportscore.test.ts`: 7 new tests (day endpoint, competition window with call-count checks, no cross-competition leakage, failed day fails the request, genuine empty day, relay → `not_supported` with zero outbound calls, `competitionWindowDays` bounds). The three old feed-based competition tests were replaced because they pinned the behaviour that caused F1.

No broadcast engine, player, stream database, stream authorization, admin access rule, deployment setting or database record was changed.

## 4. Tests run and actual results

| Command | Result |
|---|---|
| `npm ci` | exit 0 |
| `npm run check` (typecheck + 14 offline suites, `NEMO_SPORTSCORE_ENABLED=0`) | **exit 0, 0 failing tests** in all suites (SDL: 177 pass / 0 fail) |
| `npm run sdl:test` | 177 pass, 0 fail (after the fixes above) |
| `npm run build` | exit 0 (static + dynamic routes compile) |
| `npm run smoke` against empty-data `next start` (CI configuration) | **ALL GREEN — 37 routes** |
| Replay mode: `node scripts/replay-sportscore-today.mjs 7788` + `SPORTSCORE_BASE_URL=…/api/widget next start` | Homepage: "مباشر الآن (10)", "مباريات اليوم (9)", tomorrow = honest empty notice, results present |
| `verify-live-consistency.mjs` against the replay build | All checks ✓, 0 ✗ (live = 10 on every surface) |
| Egyptian page in replay mode | Lists the captured 4 results (Pyramids 4-1 Ceramica Cleopatra, etc.) and upcoming Egyptian fixtures from the replay window; OG title = competition title |
| `/api/v1/matches?date=2026-10-12&sport=football&competition=egyptian-premier-league` | 200 in replay mode, returns the captured Egyptian 2026-10-12 fixtures (`scheduledAt` 2026-10-12) |
| Egyptian standings (`standings/?slug=egyptian-premier-league`) | Read from SportScore (fetch tool): 20 teams, 6 matches played each |
| Search API (`/api/search`) | Arabic `الدوري المصري` → competition; `egyptian`, `premier` → competitions and matches; `ahly` → match; `بيراميدز`, `salah` → 0 (F8) |
| Robots / sitemap / canonical | robots.txt 200, sitemap.xml 200 (only index-worthy static routes in empty mode); Egyptian page canonical = `/competitions/egyptian-league`, `robots: index, follow` when data is present |

Timezone checks: the day endpoint is UTC, and the gateway's `fixturesForCairoDate` fetches D-1 and D and then filters by the Cairo calendar day. The homepage day sections use the same gateway call. No new timezone tests were added in this turn, and midnight boundary behaviour was checked by reading the code, not by a replay run. That is a gap (§5).

## 5. Verification limits (what is NOT yet proven)

- **Production behaviour is not proven.** Vercel and SportScore are not reachable from this sandbox for `curl`. The new path must be verified after a deploy: `GET /api/v1/fixtures/` from a Vercel function must not be blocked. The existing `/api/v1/football-data/status` and `/api/v1/live?sport=all` are the quick checks.
- **SportScore v1 from Vercel IPs is unverified.** Earlier audits recorded 403 responses on Vercel-hosted serverless IPs for the widget API. If v1 is blocked the same way, the homepage and Egyptian page will show "unavailable" (honest) rather than partial data.
- **Quota.** A competition page refresh now costs up to 11 provider calls (ISR 30 min per page), and the homepage costs up to 4 day calls per 50 s canonical window. This is within SportScore's documented anonymous tier for a small number of pages, but it is not monitored across replicas. Monitor the provider health/cost ledger after deploy.
- **Midnight/DST boundary tests** were not added as a replay scenario. The DST-free Egypt rule (no DST since 2023) is assumed by existing code.
- **Not checked in this turn:** newsroom pipeline behaviour (Phase 3), full SEO crawl and structured-data validation (Phase 5 beyond the spot checks above), visual/mobile/RTL review (Phase 6), and an authenticated admin review (Phase 7 beyond the public surfaces).

## 6. Remaining blockers (need access or a decision)

1. **Deploy and verify on Vercel** (requires explicit authorisation): confirm `/`, `/competitions/egyptian-league`, `/api/v1/matches?date=today&sport=football` return real fixtures and that `meta.provider` is `sportscore`.
2. **Set `CRON_SECRET` (or `NEMO_INGEST_TOKEN`) in Vercel** so the scheduled news/ingest job can run (F6). Then verify the cron response, not just HTTP 200.
3. **Decide on a second football source** — `FOOTBALL_DATA_API_KEY` (free tier, no Egyptian league coverage). Without it, standings and scorers depend on SportScore alone (F7).
4. **Decide on a team/player source** for Arabic team and player search (F8). Options: a licensed roster source, or a curated, attributed team list. Do not reuse demo content.
5. **Owner confirmation** of the Egyptian competition route (`/competitions/egyptian-league` is the existing canonical path; its provider alias is `egyptian-premier-league`).

## 7. Prioritised next-phase roadmap

**P0 — data correctness and reliability**
1. Deploy and verify the day/competition path on Vercel; add a production "data health" check that compares the day endpoint with the displayed count.
2. Persist provider health and the last successful update per data type (Redis/Postgres) so multiple replicas agree on "last updated" and staleness.
3. Add replay scenarios for the midnight Cairo boundary, a postponed match on a day boundary, and a provider outage on one day of a competition window.
4. Monitor SportScore request volume per day (cost ledger) and set an alert before the anonymous tier is reached.

**P1 — newsroom quality**
1. Make the news pipeline's last successful run visible (status page + timestamp), and fail closed on stale feeds.
2. Deduplicate across feeds on canonical URL and title hash; keep attribution to the original publisher; store `datePublished`/`dateModified` only when the source provides them.
3. Editorial summaries only, with the source link and no full-text reuse without permission.

**P2 — search and entities**
1. Team and player search from an attributed team list (decision in §6.4), and a complete player directory only when a source provides one. Until then, label player pages as "top scorers" data.
2. Use the provider team `team/` endpoint for team fixtures, because it returns upcoming and recent matches per team.

**P3 — SEO and crawlability**
1. Remove the non-standard `Host:` robots line; keep sitemap entries limited to pages with confirmed data.
2. Add `NewsArticle` structured data only to article pages that have verified publisher and date fields, and validate with Google's Rich Results Test after deploy (no ranking or inclusion promises).

**P4 — UX, accessibility and performance** — mobile and RTL visual review of `/`, `/competitions/[slug]`, `/search`; keyboard and contrast audit; limit client-side refresh to visible sections.

**P5 — new features** only after P0–P3: additional competitions, notifications, and personalised schedules.
