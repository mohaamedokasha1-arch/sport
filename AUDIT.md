# NEMO Sports — Codebase Audit

**Date:** 2026-10-06
**Repo:** `mohaamedokasha1-arch/sport` · app root `nemo-sports/`
**Commit audited:** `4221721` (branch `main`)
**Method:** static reading of all 166 tracked files + a real production build + live HTTP probing of the running server + the repo's own test/smoke suites.

No source files were modified during this audit.

---

## 0. Answers to the Phase-0 questions

These were asked before the code was available. All are now answered from the code itself.

| Question | Answer |
|---|---|
| **Framework** | Next.js **15.5.25**, React **19.1.0**, TypeScript **5.7.2**, Tailwind **4.1.13** (App Router) |
| **Dependencies** | Only 5 runtime deps: `next`, `react`, `react-dom`, `pg`, `ioredis`. Deliberately lean. |
| **PostgreSQL configured?** | Driver wired (`lib/db/pg.ts`) + a 411-line / 20-table schema (`db/schema.sql`) + seed. **No live database** — `DATABASE_URL` unset, so the canonical store silently falls back to in-process memory. |
| **Redis used?** | Driver wired (`lib/cache/redis.ts`) with a 5-layer cache in the SDL. **Not connected** — falls back to in-process LRU. |
| **SportScore key status** | **Keyless by design.** SportScore is an open widget API; it needs no key and is enabled by default (`NEMO_SPORTSCORE_ENABLED !== "0"`). It is reached through an Edge relay (`app/api/v1/sportscore-relay/[...path]`) that exists because SportScore's edge protection 403s Vercel serverless IP ranges. |
| **Football-Data key status** | Supported, server-side only (`FOOTBALL_DATA_API_KEY`), never exposed to the browser. Not set in this environment. |
| **Other providers** | 6 real adapters + 1 offline demo: `sportscore`, `football-data`, `sportradar`, `sportmonks`, `api-football`, `thesportsdb`, `demo`. Priority chains seeded in `db/seed.sql`. |
| **NextAuth configured?** | **No.** There is **no authentication system of any kind** — no auth library, no session store, no password hashing, no `middleware.ts`. |
| **User schema?** | `db/schema.sql` has no `users` / `roles` / `sessions` tables. The role matrix shown in `/admin/users` is hardcoded UI only. |
| **Vercel env vars** | `vercel.json` declares one daily cron (`0 3 * * *` → `/api/v1/ingest`). Env vars themselves are not in the repo (correctly). |
| **Data persistence today** | **In-process memory.** Confirmed at runtime: `"canonical":"memory","cache":"memory"`. |
| **Admin access** | **Anyone, unauthenticated.** All 9 `/admin*` routes return `200`. |
| **Public endpoints** | `/api/live`, `/api/search`, `/api/v1`, `/api/v1/live`, `/api/v1/matches`, `/api/v1/football-data/*`, `/api/v1/sportscore-relay/*`, **`/api/v1/system`**. Only `/api/v1/ingest` is token-gated. |
| **Primary data source** | SportScore (keyless, multi-sport) leads; Football-Data.org leads football standings/scorers when keyed; Sportradar/Sportmonks/API-Football/TheSportsDB are coded but unkeyed. |
| **Sports covered** | 8: football, basketball, tennis, handball, volleyball, baseball, hockey, boxing. 15 competitions seeded in `lib/core-data.ts`. |

### Environment caveat (important for reading this report)

**Outbound HTTPS is blocked in this sandbox** — `curl https://www.google.com` fails, as does `sportscore.com` and `api.football-data.org`. Therefore:

- The `sportscore: down` / `all_providers_failed` results below are **partly a sandbox artifact** and must be re-verified on Vercel.
- To test the real data path anyway, I used the repo's own offline mock (`scripts/mock-football-data.mjs`) with `FOOTBALL_DATA_BASE_URL`. That is how the build-time-env finding (H5) was proven.

---

## 1. Verification of actual state

Everything below was **executed**, not inferred.

| Check | Result |
|---|---|
| `npm install` | ✅ 96 packages, clean |
| `npm run sdl:test` | ✅ **134 tests, 134 pass, 0 fail** (9.9s) |
| `npm run build` | ✅ Compiles, types valid, 48 static pages |
| `npm run check` (smoke) | ✅ **ALL GREEN — 42 routes** |
| Secret scan of tracked files | ✅ No hardcoded keys/tokens/passwords |
| `.env` committed? | ✅ Only `.env.example` |
| `.next/` committed? | ✅ Not tracked |
| Pirate/rehosted stream links | ✅ None. `/watch` shows licensed broadcasters only, with `rel="noopener noreferrer nofollow"` and geo-disclosure |
| `<img>` without `alt` | ✅ None |
| `prefers-reduced-motion` | ✅ Handled (`globals.css:177`) |

**The project's engineering quality is genuinely high.** The SDL package (~7,550 LOC, zero runtime deps, dependency-inverted `SqlClient`/`RedisLike` interfaces, provider priority chains, conflict resolution with a review queue, rate limiting, 5-layer cache with `staleGrace` failover, health tracking, cost ledger) is well above typical for a project at this stage. The "honest empty state instead of fabricated data" discipline is implemented correctly on public pages.

**The problems are concentrated in three areas: authentication/authorization (nonexistent), the admin surface (public + fabricated), and the wiring between the excellent data layer and the pages that don't use it.**

---

## 2. Corrections to the audit plan's assumptions

Several expected findings were wrong. Worth stating plainly so the roadmap isn't built on them.

| Plan assumed | Reality |
|---|---|
| "In-memory only" is an oversight | In-memory is a **deliberate, documented graceful-degradation fallback**. Postgres and Redis are fully coded; they are simply not provisioned. This is a *deployment* task, not a *build* task. |
| `/ar/*` Arabic routes exist; maintain AR/EN | The site is **Arabic-only**. `app/layout.tsx` hardcodes `<html lang="ar" dir="rtl">`. There is no i18n layer and no English content. **A decision is needed** (see Q1 below). |
| Sport filtering is broken | **The filter logic is correct** (`lib/filters.ts`: `if (q.sport && m.sport !== q.sport) return false`) and the breadcrumb resolves properly. `/matches?sport=basketball` is empty because `/matches` isn't fed by the SDL — not because filtering is broken. |
| News is "empty/fake data" | News is **honestly empty** in production. The demo gate works. The real gap is that no news pipeline exists at all. |
| Broadcasts "may contain pirate links" | **Clean.** This is one of the best-implemented areas: license status (`approved`/`pending`/`rejected`), pending never shown to visitors, no-link-when-no-broadcaster, geo-blocking disclosed. |
| SEO "may lack structured data" | JSON-LD is present and correct: `Organization`, `WebSite` + `SearchAction`, `SportsEvent`, `NewsArticle`. Canonical/OG/Twitter all derive from a single `lib/site.ts` source of truth. The real SEO bugs are different ones (H3, H6, M1, M2). |
| 209 pages / 121 smoke paths / 71 tests / 4 adapters (README) | Actual: **48 static pages / 42 smoke routes / 134 tests / 6 adapters + demo**. The README has drifted badly (M4). |

---

## 3. Findings

### 🔴 CRITICAL

#### C1 — The entire admin area is public, unauthenticated, and CDN-cached for a year

All nine routes return `200` to an anonymous request:

```
/admin  /admin/articles  /admin/matches  /admin/competitions  /admin/broadcast
/admin/providers  /admin/users  /admin/ads  /admin/seo
```

`app/admin/layout.tsx` sets only `robots: noindex`. `components/admin/AdminShell.tsx` renders a hardcoded identity badge — **"مدير المنصة / Super Admin"** — with no check behind it. There is no `middleware.ts` in the repository at all.

Worse, the build output shows every admin page is `○ (Static)`, and the live response is:

```
Cache-Control: s-maxage=31536000      ← 1 year, shared/CDN cache
x-nextjs-prerender: 1
```

So the admin UI is prerendered into the deployment bundle and aggressively cached at the edge. `robots.txt` disallowing `/admin` is **not** protection (and the project's own rules say not to rely on it).

*Today the pages are read-only shells, so the immediate blast radius is information disclosure (C2, H2) rather than data mutation. That changes the moment any write path is added.*

#### C2 — `/api/v1/system` publicly leaks infrastructure diagnostics and internal logs

The route's own comment states the guard exists elsewhere:

> *"In production this must sit behind the admin role check and MFA (§12.2); the guard is applied by the middleware that owns the `/admin` and `/api/v1/system` namespaces, not here."*

**That middleware does not exist.** An anonymous `GET /api/v1/system` returns `200` with:

```json
{"ok":true,"mode":"live",
 "infrastructure":{"postgres":{"ok":false,"detail":"DATABASE_URL غير مضبوط"},
                   "redis":{"ok":false,"detail":"REDIS_URL غير مضبوط"},
                   "canonical":"memory","cache":"memory"},
 "missingProviders":["football_data","sportradar","sportmonks","api_football","thesportsdb"],
 "providers":[{"name":"sportscore", ...}],
 "health":[{"provider":"sportscore","status":"down","errorRate":1,
            "consecutiveFailures":3,"failoverActive":true, ...}],
 "cost":[...],"cache":[...],"conflicts":{...},
 "recentLogs":[{"at":"...","level":"info","area":"provider","message":"registered sportscore", ...}]}
```

This tells an attacker exactly which datastore is absent, which providers are unconfigured, current failure/failover state, and internal log lines. The code that *writes* this is careful (`sanitizeDbMessage()` strips connection strings before they reach a response) — the exposure is purely the missing authorization layer.

#### C3 — No authentication system exists

No `next-auth`, no `jose`/`jsonwebtoken`, no `bcrypt`/`argon2`, no session or cookie handling, no `users` table in `db/schema.sql`. `app/account/page.tsx` renders a login form with `action="#" method="post"` — it submits nowhere. The page is honest about it:

> *"المصادقة في الإنتاج: تجزئة bcrypt/argon2، تأكيد البريد، و2FA إلزامي لمستخدمي لوحة التحكم. هذه النسخة التجريبية لا تحتوي على خادم مصادقة."*

`app/admin/users/page.tsx` displays a six-role permission matrix (Owner → Moderator) that has **no backing implementation**. This is the single largest gap between the UI and the platform, and it is the prerequisite for fixing C1 and C2.

---

### 🟠 HIGH

#### H1 — No security headers anywhere

`next.config.ts` has no `headers()` block. Confirmed against the live server:

| Header | Status |
|---|---|
| `Content-Security-Policy` | ❌ absent |
| `X-Frame-Options` / CSP `frame-ancestors` | ❌ absent → admin & all pages are framable (clickjacking) |
| `X-Content-Type-Options: nosniff` | ❌ absent |
| `Referrer-Policy` | ❌ absent |
| `Strict-Transport-Security` | ❌ absent |
| `Permissions-Policy` | ❌ absent |
| `X-Powered-By` | ✅ correctly suppressed (`poweredByHeader: false`) |

Cheap, high-value fix. `frame-ancestors 'none'` on `/admin` matters most given C1.

#### H2 — Admin pages ship fabricated data that the demo gate does not cover

The demo gate in `lib/site.ts` (`demoContentVisible()`) is correctly applied to `lib/data.ts` and `lib/core-data.ts`, so public pages go honestly empty in production. **But the admin pages define their fake data inline, and 8 of 10 are not gated at all:**

```
app/admin/page.tsx            inlineArrays=1  demoGate=0
app/admin/ads/page.tsx        inlineArrays=2  demoGate=0
app/admin/articles/page.tsx   inlineArrays=1  demoGate=0
app/admin/broadcast/page.tsx  inlineArrays=2  demoGate=0
app/admin/competitions/page.tsx inlineArrays=0 demoGate=0
app/admin/matches/page.tsx    inlineArrays=2  demoGate=0
app/admin/providers/page.tsx  inlineArrays=0  demoGate=0
app/admin/seo/page.tsx        inlineArrays=0  demoGate=2   ← the only gated one
app/admin/users/page.tsx      inlineArrays=2  demoGate=0
```

Fabrications confirmed rendering on the live public `/admin` page:

- **`زيارات اليوم 184,320  +12.4% عن أمس`** and **`مستخدمون جدد 2,431  +6.1%`** — hardcoded string literals (`app/admin/page.tsx:31-32`)
- A 12-bar traffic chart from `const traffic = [42, 55, 48, 61, 73, 68, 88, 96, 84, 100, 92, 78]`
- **`ذروة: 96K · 21:00`**, **`أفضل الصفحات /matches · 38%`**, **`مصادر الزيارات بحث عضوي 54%`**, **`الأجهزة موبايل 71%`**
- A six-person user roster with email addresses (`owner@nemo-sports.example`, `sara@…`, `karim@…`, …), roles, join dates and "last active" times
- Meanwhile the *real* counters on the same page correctly read `مقالات منشورة 0` and `مباريات مجدولة 0`

The `.example` TLD means no real PII is leaked, but this directly violates the project's own rule — *"no fake data on production pages"* — and sits on a publicly reachable, year-cached URL. The juxtaposition of fabricated `184,320` visits next to honest `0` articles is the clearest single symptom in the codebase.

#### H3 — `/matches/[slug]` is an unbounded soft-200 crawl trap

Any numeric slug returns `200` **with `index, follow`** and a content-free shell:

```
/matches/512001             200  index, follow  <title>— ضد — |  | الأربعاء 7 أكتوبر | نيمو سبورتس</title>
/matches/999999999          200  index, follow  <title>— ضد — |  | …</title>
/matches/1                  200  index, follow  <title>— ضد — |  | …</title>
```

Rendered body: `الرئيسية / المباريات / — × — — — : —` — no teams, no score, no competition. Each carries a self-referencing canonical (`<link rel="canonical" href="…/matches/999999999">`).

`generateMetadata` falls back to `f.homeName ?? f.homeProviderId ?? "—"`, so a normalized-but-empty fixture produces a legitimately-titled, indexable, empty page. That is an infinite URL space of thin content offered to crawlers.

*(The empty fixture itself is exaggerated here by the mock returning a list where a single object is expected — but the 200 + `index,follow` + canonical on a contentless page is a genuine robustness bug independent of the mock.)*

#### H4 — Unknown slugs produce HTTP 500 instead of 404

```
/players/bogus-player       500
/players/999999             500
/matches/totally-bogus-slug 500
/matches/aaaaaaaaaaaaaaaaaaaa 500
```

Server log confirms the cause — the pages throw on a *permanent* condition as if it were transient:

```
⨯ Error: player_stats_unavailable:no_provider_configured
⨯ Error: match_detail_unavailable:all_providers_failed
```

`app/matches/[slug]/page.tsx:126` deliberately rethrows everything except `not_found` and `no_provider_configured` so ISR keeps the last good page — sound reasoning for a real outage, but it means a typo'd or legacy URL returns a 500 to users and crawlers.

The correct pattern already exists elsewhere in the codebase and should be copied:

```
/teams/bogus-team           404  noindex   ✅
/competitions/bogus-comp    404  noindex   ✅
/news/bogus-article         404  noindex   ✅
```

#### H5 — Build-time environment determines the shipped HTML

**Proven by experiment.** Same code, same runtime env vars, two builds:

| Build | Runtime env | `/standings` renders |
|---|---|---|
| `npm run build` (no env) | `FOOTBALL_DATA_API_KEY=mock` + base URL | ❌ *"جداول الترتيب غير متوفرة حاليًا / Data temporarily unavailable"* |
| `FOOTBALL_DATA_API_KEY=mock … npm run build` | identical | ✅ *Real table: Liverpool FC 13pts, Manchester City 12, Arsenal 10; scorers Haaland 7, Salah 5, Palmer 4* |

In **both** cases `GET /api/v1/football-data/standings?competition=PL` returned the correct real data. The difference is purely that `/standings` is `○ (Static)` with `revalidate = 300`, so the prerender baked in whatever the build saw.

**Operational consequence on Vercel:** adding `FOOTBALL_DATA_API_KEY` to project settings *without redeploying* leaves the public site showing "Data temporarily unavailable" while the API routes serve real data. The site looks broken to users and to Google. This is very likely the cause of the "zero results" symptom described in the brief.

#### H6 — Indexability is keyed to *configuration*, not to *data availability*

`lib/site.ts`:

```ts
export function hasProviderKeys(): boolean {
  if (process.env.NEMO_SDL_MODE === "demo") return false;
  return process.env.NEMO_SPORTSCORE_ENABLED !== "0" || Boolean( /* any real key */ );
}
```

Because SportScore is keyless and enabled by default, `hasProviderKeys()` is **always true**, so `getSdl()` reports `mode: "live"`, so `robotsForDataSource()` returns `{index:true, follow:true}` — *even when every provider is down and every page says "Data temporarily unavailable"*.

Confirmed live: `<meta name="robots" content="index, follow">` on `/`, `/live`, `/matches`, `/teams`, `/news` while all of them rendered empty states, with 18 (later 21) URLs in `sitemap.xml`.

The internal contradiction is visible to users too — `/live` displayed *"لا توجد بيانات مباشرة الآن (no_provider_configured). الطبقة تعمل بمحوّل «demo»"* while `/api/v1/system` reported `mode: "live"`.

**And the smoke test enshrines it:** `✓ /live → robots indexable (mode=live)` is asserted as *correct behavior*. The test suite currently guards the bug.

#### H7 — Most of the site is not wired to the data layer

Precise per-page mapping of what feeds each route:

**Fed by the SDL (real data path):** `/`, `/live`, `/matches`, `/matches/[slug]`, `/results`, `/fixtures`, `/players/[slug]`, `/standings` (via `lib/football-data`), `/admin/providers`, `/api/v1/*`

**Not fed by the SDL — demo dataset only, therefore permanently empty in production:**

| Route | Source | Production result |
|---|---|---|
| `/teams` | `lib/core-data` | 0 teams, empty state |
| `/teams/[slug]` | `lib/core-data` | 404 for every team |
| `/players` (list) | `lib/core-data` | 0 players |
| `/news`, `/news/[slug]` | `lib/data` | 0 articles — **no news pipeline exists at all** |
| `/competitions`, `/competitions/[slug]` | hardcoded `competitions[]` | renders 15 static shells, `مباشر 0 · قادمة 0`, no standings, no teams |
| `/search` | `lib/data` + `lib/core-data` | always empty |
| `/watch` | `lib/data` broadcastPartners | always empty |
| all admin content pages | inline constants | fabricated (H2) |

Note the asymmetry: `/players/[slug]` **is** SDL-fed but `/players` (the list that links to it) is not — so the working detail pages are unreachable by navigation. Same for `/teams`, which isn't SDL-fed at all even though `db/schema.sql` already defines `teams`, `players`, GIN full-text indexes on both, and `provider_entity_map` to resolve them.

**The schema and the SDL are ready; the page wiring is the missing middle.** This is the largest single body of work.

#### H8 — Search is non-functional in production

```
GET /api/search?q=ريال   →  []      (200)
GET /api/live            →  {}      (200)
```

`app/api/search/route.ts` and `app/search/page.tsx` both iterate the demo arrays (`teams`, `players`, `articles`, `allMatches`), which are empty in production. The Arabic normalizer is genuinely good work — it folds `أ/إ/آ→ا`, `ى→ي`, `ة→ه` and strips diacritics `\u064B-\u0652` — but it has nothing to search.

Meanwhile `db/schema.sql:134,161` already define exactly what's needed:

```sql
CREATE INDEX idx_teams_name   ON teams   USING gin (to_tsvector('simple', name_en || ' ' || name_ar));
CREATE INDEX idx_players_name ON players USING gin (to_tsvector('simple', full_name_en || ' ' || full_name_ar));
```

Search should be repointed at Postgres FTS (keeping the Arabic normalizer as a query pre-processor), not at in-memory arrays.

---

### 🟡 MEDIUM

**M1 — Every 404 emits two conflicting `robots` meta tags.** Reproduced on all four 404s tested:

```
/nope-404              "noindex"  +  "index, follow"
/teams/bogus-team      "noindex"  +  "index, follow"
/news/bogus-article    "noindex"  +  "index, follow"
/competitions/bogus    "noindex"  +  "index, follow"
```

`app/layout.tsx`'s `generateMetadata` injects `robots: index,follow` globally; Next.js adds its own `noindex` for not-found. `app/not-found.tsx` exports no metadata to reconcile them. Google resolves conflicting directives to the most restrictive, so the practical damage is limited — but it is malformed output on every error page, and it interacts badly with H3/H4.

**M2 — Raw provider IDs are used as public canonical URLs.** With a provider active, `sitemap.xml` gains `/matches/512001`, `/matches/512002`, `/matches/512003` (`app/sitemap.ts` uses `f.providerId` directly), each with `rel=canonical` and `index,follow`.

This contradicts the SDL's own stated contract — *"provider identifiers and payloads never leave the Sports Data Layer"* — and creates a direct conflict with the **"never break existing URLs"** rule: switching from Football-Data.org to SportScore changes every match URL, mass-404ing the entire match archive and discarding its accumulated SEO equity. Teams, players and competitions already use stable local slugs; matches are the inconsistent case. Needs a canonical `match_id` with `provider_entity_map` (already in the schema) resolving provider IDs to it, plus 301s from legacy URLs.

**M3 — No inbound rate limiting; the relay is an unauthenticated proxy.** Rate limiting exists only for *outbound* provider calls (inside the SDL). Nothing throttles inbound requests to `/api/search`, `/api/live`, `/api/v1/*`, or `/api/v1/sportscore-relay/*`. The relay is otherwise well-built — strict single-segment allowlist of 8 endpoints (verified: `secret-endpoint` → `400 {"error":"endpoint not allowed"}`, path traversal → `404`), forced `src=nemo-sports`, JSON-only upstream, non-JSON → `502` + `no-store` — but it is still a free, unauthenticated proxy to a third party that anyone can drive.

**M4 — Documentation has drifted substantially from the code.**

| README claims | Actual |
|---|---|
| 71 unit tests | **134** |
| 209 pages | **48** static pages generated |
| 121 smoke paths | **42** |
| "4 محوّلات" (4 adapters) | **6** provider adapters + demo |
| `/live` is the only SDL-fed page | 9 surfaces are SDL-fed |

The README is otherwise excellent and unusually honest (its §5 "what is not connected yet" table is accurate). It just needs re-syncing — and it is the document a new contributor will trust.

**M5 — `/admin` cached `s-maxage=31536000`.** Must become `no-store` *before* authentication lands, or the CDN will serve one user's authenticated admin page to another. Fixing this after auth is a session-leak incident.

**M6 — Latent XSS sink.** `app/faq/page.tsx:57` uses `dangerouslySetInnerHTML={{ __html: item.a }}`. Safe today (the `faq` array is a hardcoded module constant), but it becomes a stored-XSS vector the moment FAQ content becomes admin-editable — which the admin roadmap implies. The seven other uses are all `JSON.stringify` into `application/ld+json`, which is safe.

**M7 — No CSRF protection.** No form currently posts anywhere real (`/account` → `#`, `/contact` is a shell), so there is no live exposure — but any write path added under C3 needs it from day one.

**M8 — No error reporting.** `app/error.tsx` does `console.error(error)` with a comment noting Sentry/Datadog belongs there in production. Errors like the H4 500s are invisible in the wild.

---

### 🟢 LOW

**L1 — The site is Arabic-only.** `lang="ar" dir="rtl"`, no i18n layer, no `/ar/*`, no English content. RTL is done *well* (logical properties `ms-auto`/`border-e`/`text-start` throughout, `unicode-bidi: isolate` + `tabular-nums` so numerals stay LTR inside RTL, Barlow Condensed for Latin). The brief assumed bilingual AR/EN with `/ar/*` routes; that is net-new work, not a regression. **Needs a product decision.**

**L2 — Undocumented env vars that change behavior.** `.env.example` is thorough but omits three variables that materially affect the system: `NEMO_SPORTSCORE_ENABLED` (drives H6 — indexability), `CRON_SECRET` (accepted by `/api/v1/ingest` as an alternative to `NEMO_INGEST_TOKEN`), and the SportScore base-URL override used by the relay.

**L3 — Cron runs once daily** (`0 3 * * *`) due to the Vercel Hobby limit. Documented, and live freshness doesn't depend on it (ISR + on-demand revalidation). Acceptable; note it if real-time ingest is ever required.

**L4 — No E2E tests.** `scripts/smoke.mjs` is a hand-rolled `fetch`-and-assert-string script. It caught none of H3/H4/M1 and actively asserts H6 as correct. No Playwright/Cypress.

---

## 4. Recommended roadmap

Sequenced so each phase unblocks the next, and so nothing working is broken. Estimated sizes assume one engineer.

### Phase 1 — Stop the bleeding (security) · ~1 day
Highest value per hour in the whole plan. No feature work, no visual change.

1. **Add `middleware.ts`** guarding `/admin/*` and `/api/v1/system` — the guard `app/api/v1/system/route.ts` already believes exists.
2. **Interim gate before full auth lands:** HTTP Basic Auth or a signed-cookie check on `/admin/*` via middleware, so the surface is not open while C3 is being built.
3. **Add `headers()` to `next.config.ts`:** `frame-ancestors 'none'` (at minimum on `/admin`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and `Strict-Transport-Security` once a real domain is attached.
4. **Set `Cache-Control: no-store` on `/admin/*` and `/api/v1/system`** (M5) — do this *before* auth, not after.
5. **Strip the fabricated analytics and user roster** from admin (H2) — replace with real zeros or a "not connected" notice, matching the honest-empty-state pattern the public pages already use.
6. **Fix the 500s** (H4): `notFound()` on permanent failure kinds in `/players/[slug]` and `/matches/[slug]`, copying the working `/teams/[slug]` pattern.

### Phase 2 — Make indexing honest (SEO correctness) · ~1 day
Small, isolated, and it removes an active risk of getting thin content indexed.

7. **Gate indexability on data availability, not configuration** (H6): require a provider to have actually succeeded recently (the SDL already tracks `lastSuccessAt` / `errorRate` / `reachable` in `health`) rather than `mode === "live"`.
8. **Fix the soft-200 crawl trap** (H3): `notFound()` when a normalized fixture lacks team identities; never emit `index,follow` + canonical for a contentless page.
9. **Resolve the duplicate robots meta** (M1) — export explicit metadata from `not-found.tsx`.
10. **Update the smoke test** that currently asserts the buggy behavior (`✓ /live → robots indexable (mode=live)`), and add regression assertions for H3/H4/M1.

### Phase 3 — Authentication & authorization (C3) · ~1–2 weeks
The prerequisite for everything admin-related.

11. Add `users`, `roles`, `sessions`/`refresh_tokens` tables to `db/schema.sql`; implement the six-role matrix that `/admin/users` already displays.
12. Introduce an auth library (Auth.js/NextAuth or a lean cookie-session implementation — the codebase's minimal-dependency style may favor the latter), `argon2id` hashing, email verification, and **mandatory 2FA for admin roles** as the UI already promises.
13. Replace the middleware gate from Phase 1 with real session + role checks; wire `/account`'s dead form.
14. Add CSRF protection (M7) alongside the first write path.

### Phase 4 — Provision persistence · ~1 day + infra
Almost entirely deployment, not code. The drivers are written and tested.

15. Provision Postgres; `npm run db:setup` applies the schema + seed.
16. Provision Redis (required for >1 replica — otherwise each replica keeps its own rate-limit budget).
17. Set `NEMO_INGEST_TOKEN` / `CRON_SECRET` so the daily cron stops returning `503 not_configured`.
18. Verify `canonical: "postgres"` and `cache: "redis"` via `/api/v1/system` (once it's behind auth).

### Phase 5 — Close the build-time-env trap (H5) · ~2–4 hours
19. Make provider-dependent pages resilient to a keyless build: either `export const dynamic = "force-dynamic"` on the data surfaces, or keep ISR but ensure the empty state is `noindex` and self-heals on first revalidation. Add a CI check that fails the build when a provider is expected but unreachable.

### Phase 6 — Wire the remaining pages to the SDL (H7) · ~2–4 weeks
The main body of work. Do it in this order, since each step unlocks the next:

20. **Teams** (`/teams`, `/teams/[slug]`) — schema, SDL entities and `provider_entity_map` already exist.
21. **Players list** (`/players`) — the detail page already works; the list makes it reachable.
22. **Competitions** (`/competitions/[slug]`) — replace the 15 hardcoded shells with real standings/fixtures/teams.
23. **Search** (H8) — repoint at Postgres GIN/`tsvector` FTS, keeping the existing Arabic normalizer as a query pre-processor.
24. **News** — the only genuinely net-new pipeline. Requires an editorial model (CMS or admin-authored) plus the `kind: "external"` summarization-with-attribution path already sketched in `lib/data.ts`. Legal-source policy is already documented in `/broadcast-rights`.
25. **Admin write paths** — replace inline constants with real CRUD against Postgres, behind Phase-3 roles. Add `audit_log` writes (table already exists).

### Phase 7 — URL stability (M2) · ~1 week
26. Introduce a canonical `match_id`; resolve provider IDs through `provider_entity_map`; keep `/matches/<providerId>` working as a **301** to the canonical slug so no existing URL breaks. Do this **before** the match archive accumulates meaningful SEO equity.

### Phase 8 — Hardening & hygiene · ~2–3 days
27. Inbound rate limiting on `/api/*`, especially the relay (M3); consider requiring a signed internal header for relay use.
28. Re-sync the README (M4) and document the three missing env vars (L2).
29. Wire error reporting (M8).
30. Replace the smoke script's string assertions with real E2E coverage (L4).

### Deferred — needs a product decision
- **Bilingual AR/EN** (L1): the brief assumed `/ar/*` routes exist. They don't; the site is Arabic-only and RTL-native. Adding English is a substantial i18n project (routing, `hreflang`, RTL/LTR theming, translated metadata), not a fix.

---

## 5. Rule compliance check

Against the constraints in the brief:

| Rule | Status |
|---|---|
| Don't redesign the visual identity | ✅ Untouched — no CSS/component changes made |
| Don't break existing URLs | ⚠️ **At risk from M2** — provider-ID match URLs will break on any provider switch unless Phase 7 lands first |
| Don't remove working features | ✅ Nothing removed; audit was read-only |
| No fake data on production pages | ❌ **Violated today by H2** (admin analytics + user roster) |
| Don't invent sports data/scores/stats | ✅ Public pages comply rigorously; the SDL explicitly refuses to fabricate (`network failure → typed network error (never a fabricated payload)` is a passing test) |
| No pirate streaming links | ✅ Clean — licensed broadcasters only, with disclosure |
| Don't rely on robots.txt for security | ❌ **Violated today by C1** — `/admin` is protected *only* by `robots.txt` + `noindex` |
| No paid APIs without documentation | ✅ All six adapters documented; free-tier limits stated in `.env.example` |
| Don't remove Arabic RTL support | ✅ Untouched, and it is high quality |
| Don't change brand identity | ✅ Untouched |
| Don't create unnecessary infrastructure | ✅ The existing Postgres/Redis layers should be *provisioned*, not rebuilt |

---

## 6. Reproduction appendix

```bash
cd nemo-sports
npm install

# 1. Tests + build
npm run sdl:test          # 134 pass
npm run build             # 48 static pages; note ○ on every /admin route

# 2. Baseline production behavior (no provider keys)
npm run start
curl -s localhost:3000/admin -o /dev/null -w '%{http_code}\n'          # 200  ← C1
curl -sI localhost:3000/admin | grep -i cache-control                  # s-maxage=31536000 ← M5
curl -s localhost:3000/api/v1/system | jq .infrastructure              # full leak ← C2
curl -s localhost:3000/ | grep -o '<meta name="robots"[^>]*>'          # index,follow while empty ← H6
curl -s localhost:3000/api/search?q=ريال                                # [] ← H8
npm run check                                                          # asserts the H6 bug as correct

# 3. Prove build-time env determines shipped HTML (H5)
node scripts/mock-football-data.mjs &                                  # :4321
export FOOTBALL_DATA_API_KEY=mock
export FOOTBALL_DATA_BASE_URL=http://127.0.0.1:4321/v4
curl -s "localhost:3000/api/v1/football-data/standings?competition=PL" # real data ✅
curl -s localhost:3000/standings | grep -c 'Data temporarily'          # still empty ❌
npm run build && npm run start                                         # rebuild WITH env
curl -s localhost:3000/standings | grep -o 'Liverpool FC'              # now real ✅

# 4. Dynamic-route robustness (H3/H4)
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/matches/999999999      # 200 ← H3
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/matches/bogus-slug      # 500 ← H4
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/players/bogus-player    # 500 ← H4
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/teams/bogus-team        # 404 ✅ correct pattern
curl -s localhost:3000/nope-404 | grep -c '<meta name="robots"'                 # 2 tags ← M1
```

> Note: outbound HTTPS is blocked in the audit sandbox, so SportScore/Football-Data results must be re-verified against the real Vercel deployment. The mock-provider path above is unaffected.

---

## 7. Implementation record — Phase 1 + Phase 2 (complete)

Scope agreed after the audit: **do everything**, add **English** as a second language, **Postgres + Redis are provisioned**, use **Auth.js**.

Phases 1 and 2 are implemented and verified. Every claim below was re-tested against a running production build.

### Changes

| # | Finding | Change | Files |
|---|---|---|---|
| 1 | **C1** admin public | New `middleware.ts` guarding `/admin`, `/admin/*`, `/api/v1/system`. Basic Auth against `ADMIN_ACCESS_TOKEN`, then a signed `httpOnly` / `SameSite=Lax` / `Secure` cookie (HMAC-SHA256, 12h). **Fail-closed**: no token ⇒ `404` for the panel, `503` for the API. Constant-time comparisons throughout. | `middleware.ts` (new) |
| 2 | **C2** diagnostics leak | Same guard. The route's comment no longer promises a middleware that doesn't exist. | `app/api/v1/system/route.ts` |
| 3 | **H1** no security headers | `headers()` block: CSP, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, COOP; HSTS + `Upgrade-Insecure-Requests` only once a real origin is configured. Stricter CSP (`frame-ancestors 'none'`, `object-src 'none'`, `base-uri`, `form-action`) on the privileged namespaces. | `next.config.ts`, `middleware.ts` |
| 4 | **M5** admin cached 1 year | `no-store, max-age=0` on every guarded response — done **before** auth lands, not after. | `middleware.ts` |
| 5 | **H2** fabricated admin data | Removed the `184,320` / `2,431` literals, the 12-bar traffic array, `ذروة: 96K`, `/matches · 38%`, `بحث عضوي 54%`, `موبايل 71%`, the six-person user roster with emails, and the invented activity log. New `NotConnected` primitive renders the honest state + what it requires. The `Super Admin` badge became `جلسة مؤقّتة / نظام الحسابات غير موصول`. Role matrix kept but labelled `نموذج مستهدف — غير مُنفَّذ`. | `components/admin/ui.tsx`, `app/admin/page.tsx`, `app/admin/users/page.tsx`, `components/admin/AdminShell.tsx` |
| 6 | **H4** 500s on unknown slugs | Shared `PERMANENT_FAILURE_KINDS` (`not_found`, `no_provider_configured`, `unsupported`) in the gateway, so the two sibling pages can't drift again. `/players/[slug]` now falls through to `notFound()` instead of rethrowing. | `lib/sdl-gateway.ts`, `app/players/[slug]/page.tsx`, `app/matches/[slug]/page.tsx` |
| 7 | **H4** root cause in the SDL | `Attempt` now carries the typed `ProviderError` code instead of forcing callers to grep the message string. Chain aggregation changed: an **authoritative** `not_found` from a provider that actually answered is no longer masked by a sibling's `network`/`timeout`/`rate_limited` failure. Those are evidence about the *provider*, not the *entity*, so they abstain rather than veto. Safe against the reverse error because a previously-served entity is returned from the `:stale` grace cache before this branch is reached. | `packages/sdl/src/orchestrator.ts`, `packages/sdl/src/index.ts` |
| 8 | **H3** soft-200 crawl trap | New `hasMatchIdentity()`; a contentless fixture is a `404`, never a `200` + `index,follow` + self-canonical "— ضد —" page. Applied in both the page and `generateMetadata`, and the sitemap no longer advertises fixtures that can't render. | `lib/sdl-gateway.ts`, `app/matches/[slug]/page.tsx`, `app/sitemap.ts` |
| 9 | **H6** indexable while empty | New `dataServable()`, shared by `robotsForDataSource()` and `sitemap.ts`. Answers from a real (memoised, 60s TTL) probe through the SDL rather than from `mode === "live"` — which was always true because SportScore is keyless and enabled by default. Probing makes it deterministic; the first health-records-only version let the sitemap and the prerendered pages disagree. | `lib/sdl-gateway.ts`, `app/layout.tsx` (via gateway), `app/sitemap.ts` |
| 10 | **M1** conflicting robots on 404 | `app/not-found.tsx` exports metadata; the match/player `generateMetadata` fallbacks declare `robots` explicitly. No 404 emits `index` any more. | `app/not-found.tsx`, `app/matches/[slug]/page.tsx`, `app/players/[slug]/page.tsx` |
| 11 | **L2** undocumented env vars | Documented `ADMIN_ACCESS_TOKEN`, `CRON_SECRET`, `NEMO_SPORTSCORE_ENABLED`, `SPORTSCORE_BASE_URL`. Verified the full `process.env.*` set against `.env.example`. | `.env.example` |
| 12 | **M4** doc drift | Corrected 71→**138** tests, 209→**48** static pages, 121→**33/39** smoke routes, "4 adapters"→**6 providers + demo**. Added §8 الأمان and expanded §4 SEO. | `README.md` |
| 13 | Mock couldn't serve match detail | `GET /matches/{id}` now returns the single `FdMatch` (and a real `404` for unknown ids) instead of the whole list — which is why every match-detail lookup previously normalised into an identity-less shell. | `scripts/mock-football-data.mjs` |
| 14 | Demo adapter couldn't simulate a 404 | `failWith.code` widened to the full `ProviderError` union; it omitted `not_found`, which made the chain's not-found aggregation untestable. | `packages/sdl/src/adapters/demo.ts` |
| 15 | Smoke test enshrined the bugs | Removed `/admin*` from the "must be 200" list. Added: privileged-route denial (10 routes) **and** admission with the token, `no-store` assertion, cross-surface indexability consistency, "no empty data page is indexable", crawl-trap checks, 404-not-500 checks, robots-agreement checks, and 5 security-header checks. Replaced the assertion that previously read `mode === "demo" ? noindex : true` — i.e. any non-demo mode passed unconditionally. | `scripts/smoke.mjs` |

### Verification

```
npm run sdl:typecheck   ✓
tsc --noEmit            ✓
npm run sdl:test        ✓ 138 tests, 138 pass, 0 fail   (was 134 — 4 new regression tests)
npm run build           ✓ 48 static pages
```

Smoke suite run in **both** states, because indexability now has two legitimate answers:

| State | Result | robots | sitemap |
|---|---|---|---|
| **A — provider registered but unreachable** | ✅ ALL GREEN, 33 routes | `noindex, nofollow` on `/`, `/live`, `/matches`, `/standings`, `/teams`, `/news` | **8** URLs (static pages only) |
| **B — real provider data** (offline mock) | ✅ ALL GREEN, 39 routes | `index, follow`, consistent with sitemap | **21** URLs incl. 3 match pages |

Before/after on the specific defects:

| Probe | Before | After |
|---|---|---|
| `GET /admin` (anonymous) | `200` + `s-maxage=31536000` | `404` |
| `GET /admin` (with token) | — | `200` + `no-store, max-age=0` |
| `GET /admin` (wrong token) | `200` | `404` |
| `GET /api/v1/system` (anonymous) | `200`, full infra + logs | `401` |
| `GET /api/v1/system` (no token configured) | `200` | `503` (fail-closed) |
| `GET /matches/999999999` | `200` + `index,follow`, "— ضد —" | `404` |
| `GET /matches/totally-bogus-slug` | `500` | `404` |
| `GET /players/bogus-player` | `500` | `404` |
| `GET /matches/512001` (real match) | `200`, empty shell | `200`, **Liverpool 3–1 Man United** |
| 404 robots directives | `noindex` **+** `index, follow` | `noindex` only |
| `Content-Security-Policy` | absent | present, `frame-ancestors 'none'` |
| Sitemap when no data servable | 18 empty pages, `index,follow` | 8 real static pages, `noindex` |

### Known remaining edge (documented, not fixed)

When the chain fails purely on our **own** rate-limit budget, `all_providers_failed` is returned and dynamic pages still rethrow → HTTP 500 on a first render of an unknown slug. This is deliberate: throwing is what lets ISR keep the last good page instead of caching a wrong answer, and a real quota outage *is* a server-side condition. Mitigations are already in the architecture — raise `FOOTBALL_DATA_REQUESTS_PER_MINUTE` on a paid plan (the state-B run used `55`), or provision Redis so the budget is shared rather than per-replica. Persisting provider health to Redis is the durable fix for the per-process caveat noted in `dataServable()`.

### Still open

Phases 3–8 as scoped in §4: Auth.js + `users`/`roles`/`sessions` + argon2id + 2FA (C3) · provision Postgres/Redis and flip `canonical`/`cache` off `memory` · close the build-time-env trap (H5) · wire `/teams`, `/players` list, `/competitions/[slug]`, `/search`, news, and admin write paths to the SDL (H7/H8) · canonical `match_id` so provider IDs stop being public URLs (M2) · inbound rate limiting (M3) · CSRF, error reporting, E2E (M7/M8/L4) · **English as a second language** (L1, now in scope).

---

## 8. Implementation record — Phase 6a: `/teams` wired to real data

Phase 6 begins with the teams surface because it was the clearest case of the
**H7 asymmetry**: `/teams/[slug]`-style detail pages could already resolve real
entities, while the list page that is supposed to link to them was demo-only and
therefore permanently empty in production — so working pages were unreachable.

### 8.1 Changes

| # | File | Change | Finding |
|---|------|--------|---------|
| 1 | `packages/sdl/src/priority.ts` | Added `fd-7` (`football` / `*` / `team` → `football_data`, **fallback**) and `fd-8` (same for `competition`) | new — see 8.2 |
| 2 | `db/seed.sql` | Same two rules seeded, so the DB-driven chain matches the code default | ditto |
| 3 | `lib/sdl-gateway.ts` | New `team()`, `competition()`, `DirectoryTeam`, `teamsDirectory()`; imported `NormalizedTeam` / `NormalizedCompetition` | H7 |
| 4 | `app/teams/page.tsx` | Real standings-derived directory → dev/demo directory → honest empty; `noStore()` on the empty branch | H7, H5 |
| 5 | `app/teams/[slug]/page.tsx` | Real provider team view (identity + league row + that league's fixtures filtered to the team); demo view retained as fallback; `PERMANENT_FAILURE_KINDS` → `notFound()`, transient → rethrow | H7, H4 |
| 6 | `app/teams/[slug]/page.tsx` | `generateStaticParams()` gated on `demoContentVisible()` | H7 |
| 7 | `app/teams/[slug]/page.tsx`, `app/competitions/[slug]/page.tsx`, `app/news/[slug]/page.tsx` | Added `export const revalidate` (1800/1800/900) | **new — see 8.3** |
| 8 | `scripts/mock-football-data.mjs` | Added `GET /competitions/{code}/matches`; `/teams` listing now uses only the `TOTAL` standings group | test fidelity |
| 9 | `scripts/smoke.mjs` | +3 checks: `/teams` shape, standings↔teams parity, real team view; count now 42 | verification |

### 8.2 New finding — a capability with no priority rule is dead code

`football_data` declared `team` and `competition` in `capabilities` and
implemented `getTeam()` / `getCompetition()`, but **no priority rule existed for
either data type**. Once Sportmonks and TheSportsDB are absent (both need paid
keys), `chainFor()` returned an empty chain and the fetch failed with
`no_provider_configured` — even though a free, official, already-configured
source could answer. The adapter code was reachable in tests and unreachable in
production.

Rules were added as **`fallback`**, not `primary`, so a keyed premium provider
still wins where one is configured.

**Generalisation (worth checking for every future adapter):** declaring a
capability and implementing the method is not enough — without a
`sdl_priority_rules` row the orchestrator will never select it. This is a silent
failure mode: nothing errors, the data just never arrives.

### 8.3 New finding — cached 404s with no expiry (`H9`)

`/teams/[slug]`, `/competitions/[slug]` and `/news/[slug]` exported **no
`revalidate`**. For an on-demand ISR route that means an entry is cached with no
expiry, so a 404 rendered while a provider was briefly unreachable stays a 404
**until the next deploy**. `/matches/[slug]` (30s) and `/players/[slug]` (1800s)
already bounded theirs; these three did not.

This was found empirically: `/teams/64` kept returning 404 across a process
restart after the mock gained the route, because the on-disk ISR entry survived
the restart. Now bounded at 1800/1800/900 so a transient outage self-heals.

Related, and confirmed rather than assumed: switching a deployment from a
reachable provider to an unreachable one leaves `/live` serving its previous
`index, follow` for one stale-while-revalidate window before it self-corrects to
`noindex, nofollow`. That is H6 working as designed, not a regression — verified
by observing the same URL flip within 35s.

### 8.4 New finding — two status vocabularies must not be mixed

The SDL normalises provider statuses to **lowercase canonical** values
(`FD_STATUS`: `FINISHED`→`finished`, `IN_PLAY`→`live`, `TIMED`→`scheduled`). The
demo `Match` type in `lib/data.ts` is the one domain that uses **uppercase**
(`FINISHED`/`UPCOMING`/`LIVE`). The first draft of the real team view filtered
SDL fixtures on `"FINISHED"`, which silently matched nothing and filed Liverpool's
3–1 result under *upcoming* instead of *results*.

Audited every uppercase comparison in `app/`, `lib/` and `components/`: all
others operate on the demo type and are internally consistent. Only the new
real-data path was affected. It now uses `status === "finished"` plus a `SETTLED`
set, with a comment recording the trap.

### 8.5 `noStore()` on the honest-empty branch — a targeted H5 fix

`/teams` was `○ (Static)` with `revalidate = 900`. Built without provider env
(the normal local case; Vercel builds *with* env), it prerendered the
honest-empty state and ISR served it for the whole window — so `/standings`
could show a real table while `/teams`, derived from those same standings,
advertised "0 فريق". The new parity smoke check caught exactly this.

Fix: call `unstable_noStore()` on the empty branch only. A transient answer must
never be the thing that gets cached. Effect on the route table: `○ /teams … 15m`
→ `ƒ /teams` when built env-less; when real data *is* available at build time the
branch is not reached and the page still prerenders and revalidates normally.

**H5 remains open** — this is one surface. The same pattern still needs rolling
out to the other data list pages in Phase 5.

### 8.6 Verification

```
npm run sdl:typecheck      ✓
npx tsc --noEmit           ✓
npm run sdl:test           138/138 pass
npm run build              exit 0, 48 static pages
```

Real values rendered for `/teams/64`, cross-checked against the fixture:

| Field | Rendered | Fixture |
|-------|----------|---------|
| Position | 1 | 1 |
| Points | 13 | 13 |
| Played | 5 | 5 |
| W/D/L | 4 / 1 / 0 | 4/1/0 |
| Goal difference | 8 | 12−4 |
| Form | `WWDWL` | `W,W,D,W,L` |
| Latest result | `/matches/512001` — 3 : 1 | Liverpool 3–1 Man United |
| Founded / Venue | `—` | not supplied by the source |

Founded and venue render as `—` because the source does not return them; they are
deliberately **not** invented, and the mock omits them for the same reason so a
regression cannot hide behind a plausible-looking value.

Both states, full suite:

| State | Result | `/teams` | Indexability | Sitemap |
|-------|--------|----------|--------------|---------|
| A — provider registered, unreachable | ✅ ALL GREEN, 34 checks | honest unavailable state | `noindex, nofollow` | 8 URLs |
| B — mock provider, real data | ✅ ALL GREEN, 41 checks | real standings-derived directory + real team view | indexable | 21 URLs (incl. `/teams`) |

Check counts differ by state because the real-team-view check only runs when the
directory yields real provider ids.

### 8.7 Still open

Phases 3–8 as scoped in §4, minus what §7 and this section closed. Phase 6
continues with: `/players` list · `/competitions` + `[slug]` (15 hardcoded
shells) · `/search` (Postgres FTS behind the existing Arabic normaliser) · news
pipeline · admin write paths. Then M2 canonical match URLs (the sitemap still
advertises `/matches/512001`), H5 rollout beyond `/teams`, and the AR/EN i18n
phase.
