# Audit & Implementation Report — 2026-10-18

**Scope:** full technical / functional / data-quality / SEO audit of NEMO Sports
(production: `https://nemo-sports.vercel.app`, repo `mohaamedokasha1-arch/sport`),
plus the requested implementation work: Egyptian Premier League provider
priority, cross-provider dedup verification, locale correctness, and regression
tests. Work was done on branch `arena/c7164c65-sport` (base `8075c29`), local
build + local server only. **Nothing was merged or deployed; the production
database was never written to.**

---

## 1. Routes tested

### 1.1 Local crawl (fresh production build, ~80 URLs, `curl` status codes)

| Route group | Result |
| --- | --- |
| `/`, `/matches`, `/standings`, `/news`, `/sports`, `/competitions` (+ `/en/…` mirrors) | 200 |
| `/matches?date=YYYY-MM-DD`, `/matches?competition=…` | 200 |
| `/today`, `/tomorrow` | 308 → `/matches?date=…` (EN mirrors → `/en/matches?date=…`) |
| `/competitions/english-premier-league` | 308 → `/competitions/premier-league` |
| `/en/competitions/english-premier-league` | **was** 308 → `/competitions/premier-league` (locale dropped, defect D7) — **now** 308 → `/en/competitions/premier-league` |
| `/competitions/uefa-champions-league` (and `/en/…`) | 308 → `…/champions-league`, locale preserved |
| `/matches/AL-AHLY-vs-ZAMALEK` (and `/en/…`) | 308 → lowercase slug, locale preserved (fixed in D7) |
| `/teams/<slug>` pages | 404 locally — **expected**: no provider reachable from the sandbox, honest not-found, not a defect |
| Nonexistent slugs (matches/teams/competitions/news) | stable 404, no crash |
| `/admin`, `/admin/login` | 200 |
| `/robots.txt`, `/sitemap.xml` | 200 |
| `/api/v1/football-data/standings?competition=egyptian-premier-league` (offline) | 503 with honest error — no fabricated data |
| `/api/v1/football-data/matches?date=today` | 400 — correct validation (API requires `YYYY-MM-DD`) |
| `/api/v1/news` | 200 |
| `/sports/football` | 404 — **not a defect**: the real route is `/sports/[kind]/[slug]`; no internal link uses the single-segment form |

### 1.2 Smoke suite

`npm run smoke` → **ALL GREEN, 107 routes** (re-run against the final build).

### 1.3 Production spot checks (read-only, via web fetch)

- `GET /api/v1/football-data/standings?competition=egyptian-premier-league` (19:44 UTC): `ok`, 20 rows, provider `sportscore`, ttl 600 s.
- `GET /api/v1/football-data/matches?date=2026-10-18` (19:47 UTC): `count: 0` — **honest empty**: Egyptian matchday 7 runs Oct 19–21 (cross-checked against Ahram Online and Flashscore slates), so there were genuinely no Egyptian league matches that day.
- `/en/competitions/egyptian-league` (fetched twice, 19:47 UTC and again at 22:49 UTC): English H1, full 20-row English table, “Source: SportScore · Live fetch”, team links under `/en/teams/*`, top scorers honestly marked unavailable.
- `/en/teams/pyramids-fc` and the production alias-redirect check could **not** be re-verified at session end: the fetch proxy became intermittently broken (`SignatureDoesNotMatch`, ~19:47 UTC onward; one request succeeded at 22:49, later retries failed). The equivalent behaviour is verified on the local production build instead.

---

## 2. Provider audit (provider → parser → DB → API → frontend)

| Provider | Status | Evidence |
| --- | --- | --- |
| **SportScore** | **Live in production for Egypt** (standings). Adapter, parser, DB upsert, API and frontend chain all traced. | Production standings API returns `provider: "sportscore"`, 20 rows; page renders it. |
| **TheSportsDB** | Adapter sound; verified league IDs recorded (Egypt = **4829**). Not the active Egypt source in production. | Owner's sibling repo constants + thesportsdb.com cross-check. |
| **API-Football (api-sports v3)** | **Gap found and fixed** (see §3). Previously passed raw slugs through, producing invalid `league=` query params. Now resolves canonical slugs to verified league IDs and declines unmapped ones without spending an HTTP request. | `packages/sdl/src/adapters/api-football.ts` + regression test. |
| **football-data.org** | Adapter present; competition coverage checked — returns typed `not_supported` for out-of-coverage competitions (incl. Egypt); orchestrator logs and continues the chain **without** circuit-breaker penalty (`orchestrator.ts:374`). | Source trace + chain-semantics tests. |
| **Sportmonks** | Adapter present. **1336 is the Barbados Premier League, not Egypt** — explicitly excluded and pinned by a regression assertion. | web verification + test guard. |
| **Sportradar** | Adapter present, key-gated; no Egypt coverage claimed. | Source read. |
| **egyptianproleague / efa / fifa (scraping sources)** | License-gated; honest skips confirmed in server logs. Configured first in `provider_priority` for Egypt. Out of scope to modify. | `config/pipeline/endpoints.json`, server logs. |

Pipeline config for Egypt (`config/pipeline/endpoints.json`): slug
`egyptian-premier-league`, `featured`, tier 1, priority
`egyptianproleague → efa → fifa → football_data → thesportsdb`. Unchanged.

**Egyptian league ID / season / data authenticity (verified, not assumed):**

- api-sports league ID **233** = Egyptian Premier League (owner's sibling repo `koraaaaaaaaaaaa/constants.ts`, live-verified 2026-10-03 for Saudi/UAE/Qatar IDs; Egypt cross-confirmed via TheSportsDB 4829).
- Season 2026-27 = 20 teams since Aug 2026 (2025-26 ended 29 May 2026 with 21 teams, Zamalek champion).
- Production standings (all teams `played 6`: Pyramids 18, Al Ahly 16, Zamalek/Modern Sport/Ittihad 13, …, Ghazl El Mahallah 1) match the exact pre-matchday-7 state reported by Ahram Online (MD7 fixtures Oct 19–21) and Al Ahly's official site (MD1–3 results). **The production data is authentic live data.**

---

## 3. API-Football integration gap — fixed

**Problem:** the adapter forwarded the site's canonical competition slugs
(e.g. `egyptian-premier-league`) as the `league=` query parameter, which
api-sports rejects (numeric IDs only). Egypt is the top priority, so this
mattered most there.

**Fix (`packages/sdl/src/adapters/api-football.ts`):**

- `AF_LEAGUE_BY_SLUG` + `afLeagueId()`: canonical slugs and aliases → **verified
  numeric IDs only**: Egypt 233, Saudi Pro League 307, UAE 301, Qatar 305,
  Premier League 39, La Liga 140, Serie A 135, Bundesliga 78, Ligue 1 61,
  Champions League 2, Europa League 3. Numeric strings pass through. Everything
  else → `null`.
- All four league-scoped methods (`getFixtures`, `getCompetition`,
  `getStandings`, `getTopScorers`) resolve the ID first and decline with a typed
  `not_supported` result — **zero HTTP requests** for unmapped slugs (protects
  the ~100 req/day free plan). The orchestrator treats this as an honest skip
  and continues the chain.
- Deliberately **excluded** (unverified or conflicting): Eredivisie 88 /
  Primeira Liga 94 (single low-quality source), Championship (180 vs 40
  conflict), World Cup 1 / Euro 4. Sportmonks-style 1336 for Egypt is
  forbidden by a test assertion.

**Regression test (`packages/sdl/test/adapters.test.ts`):** asserts
`afLeagueId` mapping incl. the 1336 guard; with a fake fetch it asserts the
Egypt slug reaches the wire as `league=233` with the season preserved, fixtures
translate correctly, numeric input passes through, and an unmapped slug spends
zero requests and returns `not_supported`. `npm run sdl:test` → **178/178**.

Egypt remains primarily served by SportScore in production (live-verified);
API-Football 233 becomes a working chain member wherever `API_FOOTBALL_KEY`
is configured.

---

## 4. Dedup — verified end to end (no code change needed)

The five required layers all exist and were traced:

1. **Provider identity:** `provider_entity_map` with `UNIQUE(entity_type, provider, provider_id)` + `confidence`/`verified` columns.
2. **Cross-provider mapping:** entity map consulted first in `upsertMatch` (stage 1).
3. **Team-name normalization:** normalizer incl. Arabic aliases (verified in match-identity tests).
4. **Fixture identity with time tolerance:** natural key `competition + home + away + kickoff ±36 h` with **separate home/away columns — never reversible** (stage 2), then deterministic `canonicalId` (stage 3); field-level merge via `decideField` with provenance.
5. **Ambiguous records:** flagged, not silently merged.

`standings UNIQUE(season_id, group_name, team_id)`, `top_scorers
UNIQUE(season_id, player_id)`, `provider_priority UNIQUE(sport, competition,
data_type, provider)` complete the DB-level guarantees. News dedup was
verified in the editorial/news pipeline (URL + title normalization).

## 5. Scores, home/away, timezone — verified

- **Scores:** DB `CHECK chk_score_consistency` — scores are `NULL` unless the match has started/finished; the frontend renders `NULL` as “–”, never `0`. No code path fabricates a score.
- **Home/away:** separate columns through parser → DB → API → card; the ±36 h identity key is side-sensitive, so a reversed fixture cannot merge into an existing row.
- **Timezone:** `scheduled_at` stored in UTC; `lib/tz.ts` pins display to `SITE_TZ = "Africa/Cairo"` (SSR/hydration-stable); provider day-key query semantics (UTC matchdays) untouched. Matches the required strategy exactly.

---

## 6. Defects found and fixed (D1–D7)

| # | File(s) | Defect | Fix |
| --- | --- | --- | --- |
| D1/D2 | `views/competition-detail.tsx` | EN competition pages rendered Arabic H1/breadcrumb; metadata locale wrong | locale-aware labels + metadata |
| D3/D4 | `views/team-detail.tsx` | Same class of locale leaks on team pages | locale-aware rendering |
| D5 | `views/news-detail.tsx`, `lib/news/editorial-seo.ts` | Article page + JSON-LD not locale-aware; `og:locale` wrong | locale-aware; `og:locale` = `en_GB` (site convention) |
| D6 | `lib/competition-catalog.ts`, `lib/competition-label.ts`, `lib/football-data.ts`, `views/competitions.tsx`, `views/standings.tsx`, `components/public/AdminPublished.tsx` | Egypt not consistently first/featured in catalogs and standings navigation | Egypt-first ordering, labels |
| D7 | `views/competition-detail.tsx`, `views/match-detail.tsx` | **Three redirects dropped the visitor's locale**: EN alias `/en/competitions/english-premier-league` 308-ed to `/competitions/premier-league` (Arabic tree); same for the uppercase-slug and inbound-alias redirects on match pages | all three wrapped in `localizePath(target, locale)` (no-op for Arabic → AR behaviour byte-identical) |
| — | `packages/sdl/src/adapters/api-football.ts` | API-Football slug passthrough (see §3) | verified-ID resolution + typed decline |

**Verified non-defects** (investigated, intentionally untouched): `search.tsx`,
`player-detail.tsx`, `StatusBadge`, `match-identity.ts`, `fixture-merge.ts`,
`lib/tz.ts`, EN `/today`/`/tomorrow` pages (separate files, already correct),
`/sports/football` 404, `matches?date=today` 400, local team-page 404s
(offline sandbox), the 54-vs-253 news count difference (home editorial
section).

## 7. Regression tests added

- `scripts/verify-i18n.test.ts`: +8 locale tests (D1–D6 coverage) and a new
  redirect test that invokes the real page components and asserts the thrown
  redirect targets keep `/en/…` for EN and stay unprefixed for AR (alias +
  uppercase-slug paths behaviourally; the data-dependent inbound-alias path at
  the source level). Suite: **32/32**.
- `scripts/verify-discover-seo.test.ts`: +1 discover/SEO test (incl. a
  slug-encoding fix in the harness). Suite: **11/11**.
- `packages/sdl/test/adapters.test.ts`: API-Football resolution regression
  (§3). Suite: **178/178**.
- `scripts/sports-sync-safety-baseline.json`: re-pinned the `localisedOnly`
  hash for `views/match-detail.tsx` after the reviewed D7 diff (one import +
  two locale-aware redirect targets; **no stream/broadcast/auth change** — the
  guard's behavioural stream assertions all still pass). The `byteForByte`
  list (player, streams, broadcast state, auth, `vercel.json`,
  `next.config.ts`, `middleware.ts`, schema) is **untouched and still pinned**.

## 8. Acceptance checks (A–H)

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| A | Egyptian Premier League has highest priority and correct live data | ✅ | endpoints.json tier-1/featured; production standings (SportScore, 20 rows) cross-verified against Ahram/Flashscore/Al Ahly; honest empty match list on a real off-day |
| B | Zero duplicate matches across providers | ✅ | 5-layer dedup traced (§4); DB uniqueness constraints; side-sensitive ±36 h identity |
| C | Home/away never reversed; missing scores never shown as 0 | ✅ | separate columns end-to-end; `chk_score_consistency`; UI renders “–” |
| D | UTC storage + Egypt-local display | ✅ | `scheduled_at` UTC; `SITE_TZ = Africa/Cairo` |
| E | Idempotent sync with honest failure handling | ✅ | upsert stages idempotent; `not_supported`/`not_found` skip without breaker penalty; offline API returns 503, pages 404 — no fabricated data anywhere |
| F | News dedup, no fabricated news | ✅ | URL+title dedup verified; matches/news labeled by source (“Editorial”) |
| G | SEO: canonical/hreflang/redirects/JSON-LD locale-correct | ✅ | D1–D7 fixed + tested; alias redirects 308 to canonical with locale preserved; og:locale `en_GB`; discover suite 11/11. *No Google-indexing claim is made — Search Console evidence was not available.* |
| H | Regression tests for all listed scenarios; suites green | ✅ | §7; full `npm run check` exit 0; `npm run build` ✓; smoke 107 ✓ |

## 9. Files changed (16, all uncommitted on `arena/c7164c65-sport`)

`components/public/AdminPublished.tsx`, `lib/competition-catalog.ts`,
`lib/competition-label.ts`, `lib/football-data.ts`,
`lib/news/editorial-seo.ts`, `packages/sdl/src/adapters/api-football.ts`,
`packages/sdl/test/adapters.test.ts`,
`scripts/sports-sync-safety-baseline.json`,
`scripts/verify-discover-seo.test.ts`, `scripts/verify-i18n.test.ts`,
`views/competition-detail.tsx`, `views/competitions.tsx`,
`views/match-detail.tsx`, `views/news-detail.tsx`, `views/standings.tsx`,
`views/team-detail.tsx` — plus this report.

**Migrations: none.** No schema or migration changes were needed (the existing
schema already enforces every required guarantee).

## 10. Verification log

| Command | Result |
| --- | --- |
| `npm run sdl:test` | 178 pass / 0 fail |
| `npm run i18n:test` | 32 pass / 0 fail |
| `npm run sports-sync:test` | 21 pass / 0 fail |
| `npm run check` (all suites + eslint + typecheck) | exit 0, zero failures |
| `npm run build` | compiled, 49/49 static pages |
| `npm run smoke` | ALL GREEN — 107 routes |
| Local HTTP redirect checks | all §1.1 behaviours confirmed on the final build |

## 11. Limitations & known issues

1. **`npm run sdl:typecheck`: 5 pre-existing TS4094 errors** (protected
   `requestGuard` in exported anonymous classes across five adapters).
   Confirmed identical at the untouched baseline via `git stash`; excluded
   from the official `check`. Left unfixed deliberately (out of scope,
   pattern-level change).
2. **P1 (out of scope, unchanged, previously reported):** anonymous
   `GET /api/cron/update-matches` — cron auth changes require explicit owner
   approval; the external cron service was never touched.
3. **Sandbox network:** provider APIs and (intermittently) the production site
   are unreachable from the shell; production evidence comes from successful
   web fetches before/after the proxy degradation. Local team pages 404
   offline — expected, honest behaviour.
4. **Unverified league IDs were excluded**, not guessed (§3). If independent
   verification appears later, they can be added to `AF_LEAGUE_BY_SLUG` safely.
5. Known benign warning during `check`: `[admin-store] database write failed`
   (no DB in the sandbox; suite still exits 0). Baseline behaviour.
6. No Google Search Console access → **no indexing claims** are made.

## 12. Confirmations

- Existing design, colors, layouts, routes, slugs, redirects, broadcast
  section, admin tools and working APIs were **preserved**; no redesign, no
  feature removal, no sample data substituted for real data.
- Streaming engine, player, broadcast URLs, streaming DB and rights config
  were **not modified**. The only change to a stream-adjacent file is the
  reviewed localization diff in `views/match-detail.tsx` (two redirect
  targets), with its safety-baseline hash re-pinned and all behavioural stream
  guards still passing; `MatchStreamPlayer.tsx` / `LiveStreams.tsx` hashes are
  unchanged.
- The production database was never written to; the external cron service was
  never accessed or modified.
- No API keys or secrets appear in this report, the code changes, or logs.
- Nothing was merged into the production branch and nothing was deployed. All
  work sits on `arena/c7164c65-sport`, awaiting owner review.
