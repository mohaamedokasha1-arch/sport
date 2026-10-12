# NEMO Sports — Production readiness audit (2026-10-12)

Scope: repository `mohaamedokasha1-arch/sport`, app root `nemo-sports/`, branch
`arena/081bf8e2-sport` (from `main` @ `11a3926`). Evidence labels follow the brief:
**Confirmed and reproduced** · **Confirmed by source code only** · **Suspected — needs production access** · **External limitation**.

## 0. What could and could not be tested

| Check | Result | Label |
|---|---|---|
| `https://nemo-sports.vercel.app/` and all public routes (curl from the sandbox) | No response (HTTP 000) — the sandbox only allows github.com, npm, PyPI | **External limitation** — production not reached |
| Football-Data.org, TheSportsDB, Google News RSS reachability | No response from the sandbox | **External limitation** — no live provider data was fetched |
| `npm ci`, `npm run check` (typecheck + 20 offline suites + new test) | Exit 0 | **Confirmed and reproduced** (local) |
| `npm run build` (Next 15.5.27, production) | Exit 0 | **Confirmed and reproduced** (local) |
| `npm run smoke` against `next start` in empty-data mode (`NEMO_SPORTSCORE_ENABLED=0`) | ALL GREEN, 37 routes | **Confirmed and reproduced** (local, empty-data only — not a live test) |
| Live Egyptian Premier League match via the deployed path | Not possible from this sandbox | **External limitation** |

The smoke test runs with no provider data, so it proves routing, status codes, robots/sitemap
consistency and security headers — not that real matches, scores or times are correct.

## 1. Findings

### F1 — Ad admin page shows "active" ads that nothing verifies or renders (fixed)
- Evidence: `app/admin/ads/page.tsx` hardcodes slots (`AdSense — برنامجي` / `حملة نايكي — رعاية`, status `نشط`) and campaigns (`رعاية نايكي — موسم 2026`, `متجر أطقم الفرق (Affiliate)`, status `نشط`). The "+ حملة جديدة" and "حفظ الحملة" buttons have no handler.
- Severity: High (operator could believe ads are live and approved).
- Label: **Confirmed by source code only.**
- Fix: a notice that the page is static; every status now reads "مسجَّل يدويًا — غير مُتحقَّق"; the two non-functional buttons are disabled and labeled. No data model was changed.

### F2 — Advertising integration is not present in the repository (not changed)
- Evidence: a repo-wide search finds no `adsbygoogle`, AdSense loader, `ca-pub-` ID, consent banner, or `public/ads.txt`. `app/layout.tsx` loads only the Search Console verification meta tag, theme init, and Organization/WebSite JSON-LD.
- Ad status, reported separately:
  - **Configured:** Unknown from the repo. Any configuration would have to be outside this codebase or in production env/ad dashboard, which I cannot access.
  - **Serving:** Not served by this code. Confirmed by source only.
  - **Approved:** Unknown. Cannot be verified here.
- Consequence: nothing in the repo can produce ad revenue today. Adding a network requires explicit approval (per the brief), and I did not add one.
- Required before any ad code: consent (CMP) decision for EEA/UK visitors, `ads.txt` with the publisher's real line from the network dashboard, and a placement review so ads do not overlay broadcast controls or the match navigation.

### F3 — Standings replacement could wipe a good stored table (fixed)
- Evidence: `lib/pipeline/upsert.ts::replaceStandings` deletes the source's existing rows for the season/group and then inserts only rows whose `teamSourceId` resolves. If every row fails to resolve, the table is deleted and nothing is written. If some fail, the table is silently shrunk.
- Severity: High for data accuracy (a standings table is user-visible and can drop to empty or partial because of an identity gap, not a provider outage).
- Label: **Confirmed by source code only** (not reproduced against a database).
- Fix: when any incoming row lacks a resolved team, the function records a `data_conflicts` entry (`standing/table`, severity high) and returns without any DELETE/INSERT. The stored table stays.
- Trade-off: a permanently unmappable team now freezes that table until the identity is fixed. This is deliberate and visible in `data_conflicts`.
- Test: `scripts/verify-standings-guard.test.ts` (3 cases, fake DB) — now part of `npm run check`.

### F4 — Egyptian Premier League has no licensed primary source (external limitation)
- Evidence: `config/pipeline/endpoints.yml` keeps `egyptianproleague` and `efa` `enabled: false` with `scraping_licensed: false` ("لا جمع آلي قبل تأكيد كتابي"). Football-Data targets for `egyptian-premier-league` are `enabled: false` ("الخطة المجانية لا تشمل الدوري المصري").
- Consequence: Egyptian league data depends on the keyless SportScore and TheSportsDB sources. Their coverage and freshness **could not be verified from this sandbox**.
- Label: **External limitation** (licensing/plan), plus **Suspected — needs production access** for coverage.
- Action: obtain written permission from the Egyptian Pro League before enabling scraping; do not infer coverage.

### F5 — Scheduled news ingestion depends on environment variables (source + earlier production observation)
- Evidence: `app/api/cron/fetch-news/route.ts` returns 503 `not_configured` when neither `NEMO_INGEST_TOKEN` nor `CRON_SECRET` is set (verified locally in smoke: "503 not_configured (must refuse anonymous)"). `docs/…` and `AUDIT_REPORT_2026-10-12.md` (prior session) record that production returned this 503 on 2026-10-11.
- Label: **Confirmed by source code and local smoke**; production state **Suspected — needs production access** (not re-checked today).
- Action (owner): set `CRON_SECRET` in Vercel for Production. Do not paste it into chat or commit it.

### F6 — Vercel cron schedules (external limitation)
- Evidence: `vercel.json` defines 6 daily/weekly crons. Whether the current Vercel plan executes all six, and whether they ran, can only be read in the Vercel dashboard.
- Label: **External limitation / Suspected — needs production access.**

### F7 — Robots `Host:` directive (low, not changed)
- `app/robots.ts` emits `Host: https://…`. Google ignores this non-standard directive; it is harmless. Left unchanged to avoid churn.
- Label: **Confirmed by source code and local response.**

### F8 — Security checks in source (no defect found)
- Search query is trimmed and capped at 120 characters (`lib/search-service.ts`); search responses are `no-store`.
- `/api/cron/*` refuses anonymous calls (503/401). `/api/v1/system` is guarded by the admin token (smoke: "guarded").
- Admin routes require `requirePermission(...)`.
- Security headers present (smoke: x-content-type-options, x-frame-options, referrer-policy, CSP, permissions-policy).
- Label: **Confirmed and reproduced locally** (headers/status) and **Confirmed by source code** (auth guards).

## 2. Files changed

| File | Reason |
|---|---|
| `nemo-sports/lib/pipeline/upsert.ts` | F3: identity guard in `replaceStandings`; keeps stored table and records conflict when a team cannot be resolved |
| `nemo-sports/scripts/verify-standings-guard.test.ts` | New offline regression test for F3 (3 cases) |
| `nemo-sports/package.json` | Adds `standings-guard:test` and appends it to `check` |
| `nemo-sports/app/admin/ads/page.tsx` | F1: static-display notice; statuses no longer claim "active"; non-functional buttons disabled |
| `nemo-sports/docs/AUDIT_2026-10-12_PRODUCTION_READINESS.md` | This report |

No change to the broadcast engine, stream player, stream database, approval workflow, rights verification, allowed embed hosts, or broadcaster policy. No env var, secret, or production setting was touched. No ad network was added.

## 3. Tests actually run (local)

- `npm run check` → exit 0 (typecheck; sdl 101 tests; repairs; admin 43/43; news; news quality; news cycle; links; seo; search; freshness; sports; competitions; stream policy; classify; consistency; scenarios; pipeline config; pipeline 35/35; standings-guard 3/3).
- `npm run build` → exit 0.
- `npm run smoke` (BASE=http://127.0.0.1:3000, empty-data mode) → ALL GREEN, 37 routes.
- Not run: browser/mobile screenshots (no browser tool available in this sandbox), Lighthouse/Core Web Vitals (needs a reachable deployment), admin UI render behind login (no admin credentials used).

## 4. Data sources — observed health

| Source | Observed here | Evidence |
|---|---|---|
| Production site | Unreachable from sandbox | HTTP 000 |
| SportScore (keyless) | Not reached (sandbox egress) | Enabled by default; disabled in CI |
| Football-Data.org | Not reached; EG disabled in config | `endpoints.yml` |
| TheSportsDB | Not reached | — |
| Egyptian Pro League / EFA | Disabled (licensing) | `endpoints.yml` |
| Google News RSS | Not reached | — |
| News cron | Refuses without secret (local) | smoke |

Last successful update evidence for production: **not available from this sandbox.**

## 5. Google indexing readiness

Verified locally (empty-data mode): robots.txt allows public routes and disallows `/admin`, `/account`, `/api/`; sitemap lists only public static pages while provider data is not servable; empty data pages return noindex.

Search Console actions still needed (owner):
1. Confirm the property is the Vercel production host (or the custom domain once attached).
2. Submit `https://nemo-sports.vercel.app/sitemap.xml` and check it reads "Success".
3. Use URL Inspection on `/`, `/competitions/egyptian-league`, `/news`, and one match page; confirm the rendered HTML has content.
4. Check Coverage for "Crawled – currently not indexed" and "Soft 404" patterns after data is live.
Submitting a sitemap does not guarantee indexing. No indexing has been confirmed in this audit.

## 6. Prioritized 7-day plan

1. **Day 1:** Set `CRON_SECRET` in Vercel Production (owner). Check the Vercel cron log for `fetch-news` and `pipeline/*`. Record the real last-success times.
2. **Day 1–2:** Confirm the Egyptian league coverage on the live site against an official match list by hand; record each mismatch as a data conflict rather than editing values.
3. **Day 2:** Deploy this branch to a preview (not production) after review; run `npm run smoke` against it with the real env.
4. **Day 3:** Search Console: submit sitemap, inspect 4 key URLs, review the coverage report.
5. **Day 4:** Write 2–3 original, verified pages only where real data exists (e.g. an explainer of how the Egyptian league table is built and when it updates). No thin or generated pages.
6. **Day 5:** Ads: decide with the owner whether to proceed. If yes, add a CMP for EEA/UK, `ads.txt` from the network dashboard, and check placements on mobile for accidental clicks and broadcast-control overlap.
7. **Day 6–7:** Measure: indexed valuable pages (Search Console), organic clicks, engaged visits, returning users (analytics — none installed in repo; decide with owner), Core Web Vitals on the real deployment.

No income or traffic outcome is promised by any item above.

## 7. Remaining risks, environment requirements, rollback

- Risks: production state unverified; Egyptian league coverage depends on keyless sources; ad revenue impossible without ad code and approval; no analytics in repo.
- Environment: `CRON_SECRET` (or `NEMO_INGEST_TOKEN`) for scheduled jobs; `NEXT_PUBLIC_SITE_URL` only if a custom domain is live; database optional but required for persistent standings/news.
- Rollback: revert the three source files and the new test (`git revert` of this branch's commit). The standings guard only blocks replacement; reverting restores the previous behavior. The ads page is display-only; reverting restores the old labels.

## 8. Branch and commit

Branch `arena/081bf8e2-sport`; base `main` @ `11a3926ee796cca941fb91073067e40b893c762f`. See the commit recorded in the session. Not merged, not deployed.
