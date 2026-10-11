# NEMO Sports — post-deployment verification & fixes (2026-10-11)

Branch `arena/271a6567-sport` (from `main` @ `5060e11`), submitted for review as a pull request. **Nothing merged, nothing deployed to production.**
App: `nemo-sports/`. Production inspected read-only at https://nemo-sports.vercel.app between 00:55 and 01:35 UTC.

## ملخص تنفيذي (عربي)

- **تناقض المباريات المباشرة:** السبب الأساسي اختلاف النطاق: الرئيسية و`/live` وشريط النتائج و`/api/v1/live` كانت تعرض **كرة القدم فقط**، بينما `/matches` يجمع كل الرياضات (في الإنتاج 16 كرة قدم + 8 كرة سلة = 24). يُضاف إلى ذلك نسختان مخزّنتان مختلفتان من نفس مصدر البيانات، وعرض فشل المصدر كأنه «لا توجد مباريات مباشرة»، ونص «لا توجد مباراة جارية الآن» في شريط النتائج قبل وصول أي بيانات. صار هناك الآن **لوحة مباشرة واحدة** تقرأ منها كل الصفحات مع ذكر النطاق صراحة.
- **أخطاء بيانات حرجة اكتُشفت:** صفحات تفاصيل معظم المباريات كانت تُرجع **404** في الإنتاج، لأن المزود غيّر شكل الرابط (`/match/<slug>/<id>/`). وكانت تظهر دقائق مختلقة («1'» بدل «الشوط الأول»)، وتُعرض المباريات المؤجلة كأنها قادمة. أُصلح كل ذلك.
- **الأخبار:** التحديث التلقائي **لا يعمل في الإنتاج** لأن `CRON_SECRET` / `NEMO_INGEST_TOKEN` غير مضبوطين (تحققتُ دون كشف أي سر). أصبح المعيار متوافقًا مع الجدولة اليومية، وصارت البيانات تميّز بين التحديث الناجح والمحاولة الفاشلة. القصص التجارية/العقارية/الجامعية تُرفض عند الاستيعاب، والمنشورة سابقًا تُعزل مع حفظ السجل والمصدر دون حذف. **يجب ضبط `CRON_SECRET` في Vercel ثم التحقق.**
- **البث:** حالة البث منفصلة عن حالة المباراة. لا يصبح البث قابلًا للتشغيل إلا بموافقة + توثيق حقوق + مباراة جارية أو ضمن نافذتها. لم يعد يُكتب «انتهت المباراة» لمباراة حالتها غير مؤكدة.
- كل الاختبارات والبناء واختبار الدخان تعمل وتنجح، والتفاصيل أدناه.

---

## 1. Root causes (verified, with evidence)

### P1 — Live counts disagree (home/live "0" vs `/matches?date=today` "24 live")
| # | Cause | Evidence |
|---|---|---|
| 1 | **Different sport scope.** Homepage, `/live`, score rail (`/api/live`), `/api/v1/live` (default) and `/results` were football-only; `/matches` aggregates football+basketball+tennis+cricket. | `/api/v1/live` → 16 (football), `/api/v1/live?sport=basketball` → 8; `/matches?date=today` → 24 live. When football had nothing live, home/live showed 0 while `/matches` still showed other sports. |
| 2 | **Two independent caches of the same feed.** `live_matches` and `fixtures` are separate SDL cache keys (50 s vs 120 s; stale grace 120 s vs **1 h**). During a provider outage `/matches` kept an hour-old "live" while `/live` had nothing. | `packages/sdl/src/index.ts` cache policy; orchestrator raw/canonical keys per data type. |
| 3 | **Failure shown as "no live matches".** `/live` printed «لا توجد مباريات مباشرة الآن» when the provider failed. And when every provider failed, the gateway's editorial-records fallback (provider `admin`) was treated as a live answer, so the homepage said «لا توجد مباريات مباشرة». | Reproduced on a build with the provider disabled. |
| 4 | **Score rail SSR claim.** Every page server-rendered «لا توجد مباراة جارية الآن» in the rail before its first fetch (and kept it if that fetch failed/timed out). | Found in the HTML of `/live` and the homepage. |
| 5 | **Status normalisation.** `status_text` was ignored: `live`+"Half time" ≠ half-time; `upcoming`+"Postponed" published as upcoming; "1st half"/"2nd quarter" parsed as minute **1'/2'** (fabricated). | Raw SportScore feed fetched 2026-10-11 00:58 UTC (now a test fixture). |
| 6 | **Match pages 404.** SportScore permalinks now end with an id (`/football/match/sao-paulo-vs-vitoria-ba/k82rekhg0vyzrep/`). The slug parser fell back to a made-up id (`s-o-paulo-sp-vs-vit-ria-ba`) that the provider doesn't know, so nearly every live match link was a 404. The sitemap advertised those URLs. | `https://nemo-sports.vercel.app/matches/s-o-paulo-sp-vs-vit-ria-ba` → 404; `match/?slug=sao-paulo-vs-vitoria-ba` resolves at the provider. |
| 7 | `/api/v1/matches?date=today` → `400 invalid_input`, but `/matches?date=today` accepts it; a match that kicked off before Cairo midnight and is still live was not "today". | Production response. |
| 8 | Raw status comparisons bypassed the shared model (`status === "finished"`/`"scheduled"` on home, results, competition and team pages). | Code. |

### P2 — News freshness / relevance
- **Scheduler not authorised in production:** `GET /api/cron/fetch-news` → `503 not_configured` ("NEMO_INGEST_TOKEN / CRON_SECRET is not set"). Same for `/api/v1/ingest`. So every daily Vercel cron run is refused, and `/api/v1/news` shows `lastUpdated: null`, `stale: true`, 13 items. (Checked without sending or exposing any secret.)
- **Incompatible numbers:** per-source targets 30–120 min, stale after 60–240 min, but the only scheduler runs **once a day** (Hobby plan). The feed would be "stale" ~22 h/day even when working. The daily job could also overrun its 40 s budget: it re-read the dedup window from the DB for every item, and processed sources one at a time.
- **Freshness metadata** had a single `lastUpdated`. It couldn't tell "never succeeded", "last run failed" and "nothing ran" apart.
- **False positives already published**, ingested before the current relevance gate existed: "Al Ahly Sabbour Launches Zaha Residence…" (property developer) and "El Sewedy sells 40% of CIRA's Damietta university venture" (snippet "Al Ahly Sabb…"), both under «الكرة المصرية». Also IHF handball stories under «الكرة المصرية», and the entity matcher tagging «المصري» ("the Egyptian") as the Al Masry club.

### P3 — Broadcast lifecycle
- Stream panel text defaulted to «انتهت المباراة — لم يعد البث المباشر نشطًا», a **finished-match claim for fixtures whose state is unconfirmed** (Oct 9 editorial matches still stored as upcoming).
- `/live` rendered every published stream at the top, ended ones included, and counted them as «بث متاح». Live cards offered «مشاهدة المباراة» for any published stream regardless of the match. The Watch Guide grouped them under «إعادة البث» (replay).
- No per-stream rights evidence existed; approval = status only.

### P4 — Team names/badges
- Fallback badge = `name.slice(0,3)` beside the full name → "Vaq Vaqueros Reynosa" (and literally "VaqVaqueros Reynosa" in text extraction, as production rendered); Arabic names cut after the article ("الأ").
- `dir="ltr"` scores on cards whose home team sits on the right put the **home score under the away team**. E.g. Universitario 0–1 Melgar read as a home win.
- Latin names/competitions were truncated from their *start* in RTL ("…queros Reynosa"). Minutes rendered "'45". A logo that failed before hydration stayed a broken-image icon. The header overflowed by 8 px at exactly 1280 px.

### P5 — `/scout`
- Two identical «المصدر: SportScore · آخر تحديث …» lines (matches + scorers), unlabelled.
- With an empty team sample the pickers offered nothing, yet the message said "choose two teams". Default teams could have no completed matches, giving two columns of «غير متاح».

---

## 2. What changed

**One match-state/live model (P1)**
- `lib/live-reconcile.ts` (new, pure) reconciles each sport's live view and full fixtures view. The freshest snapshot wins. A live claim survives only if the freshest data backs it (otherwise status `unverified` → state "unconfirmed": kept, never counted live, never "finished"). Snapshots older than 3 min can't claim live, and editorial-only fallbacks aren't live answers.
- `lib/live-board.ts` (new): `liveBoard(scope)`, the **only** source for live counts/lists. Homepage, `/live` (now with sport chips, all sports by default), `/matches` (live bucket + "today" includes matches still running), score rail, `/api/live` (all sports, so basketball match pages update too), `/api/v1/live` (`sport=all` supported; default stays football for API compatibility; `meta.scope`/`bySport`/`failedSports`), `/api/v1/matches` (`date=today|yesterday|tomorrow`, `sport=all`).
- SportScore adapter: `status_text`-aware `mapStatus`, strict clock minutes, permalink slug with id, shared feed snapshot (15 s) for all data types. Fixtures TTL aligned with live.
- Honest failure states: "couldn't verify" vs "none live"; rail shows "loading" before data.
- `lib/match-state.ts`: `UNVERIFIED_STATUS`, `isLiveNow`, reason-specific notes. Raw status comparisons replaced on home/results/competition/team pages.

**Broadcast lifecycle (P3)**
- `lib/broadcast-state.ts` (new, pure): verdict = operator approval **+ rights evidence (holder + licence ref/URL)** + match state + broadcast window (football 3 h after kickoff, etc.). States: live, standby, expired, ended, review, unpublished. Notices never say «انتهت المباراة» unless the fixture says finished.
- Streams: `rights_holder`, `rights_evidence`, `rights_checked_at` columns (additive; `db/migration-0005-moderation-rights.sql`). Public = approved + evidence. Admin form fields, a publish guard, and a per-stream public verdict in `/admin/live`.
- `/live` shows only playable streams. Cards show a watch action only while playable. The match page, Watch Guide ("خارج نافذة البث", per-row reason badge) and admin all use the same verdict.

**News (P2)**
- `lib/news/schedule.ts`: cadence derived from `vercel.json` (daily), or declared via `NEMO_NEWS_SCHEDULER_INTERVAL_MINUTES`. Stale after `2 × max(source, scheduler)` (48 h daily).
- `/api/v1/news` meta: `lastSuccessfulUpdate`, `lastFailedAttempt`, `lastAttempt`, `lastAttemptOk`, `freshness.state`. `/news` shows success and failure separately. `/admin/news` shows whether the scheduler secret is configured (presence only).
- Relevance gate with reasons (`commercial`, `non-sport-entity`, `non-article`…). Namesake companies (Al Ahly Sabbour/Bank/Capital…) are stripped before categorising/entity matching. Multi-sport clubs: a handball/basketball story is filed under that sport. Entities match whole words only, with no bare ambiguous aliases (المصري, باريس, inter, spurs, ahli…).
- Quarantine with provenance (`moderation_reason/moderated_at/moderated_by/previous_status`, additive): runs automatically at the end of each **authorised** run, and manually via `npm run news:moderate` (dry run by default). Only clear commercial/namesake items with no sports signal are auto-quarantined; nothing is deleted.
- Daily job fits its budget: one dedup window per run, 3 sources in parallel. `NEMO_NEWS_FEED_BASE_URL` for mocks.

**UI (P4/P5) and audit fixes (P6)**
- `ProviderCrest`: CSS-drawn initials (`lib/team-monogram.ts`). The provider's short code is kept when it exists. Crests are decorative next to visible names, and pre-hydration logo errors are detected.
- `ScorePair` on every scoreboard. `dir="auto"` on names/competitions, LTR minutes. Header inline search from `2xl`.
- `/scout`: labelled provenance (merged when identical), honest empty/one-team states, defaults pick teams with completed matches, `aria-live`, pure helpers.

---

## 3. Test results (all run in this session)

| Command | Result |
|---|---|
| `npm run check` (typecheck + 11 suites) | **pass** — SDL 156/156 (+6 new), repairs 20/20, admin 43/43, news pipeline ✓, search 26/26, freshness 12/12 (+4), sports 6/6, stream-policy 8/8, classify 15/15 (+6), **consistency 26/26 (new)**, scenarios 27/27 (+1) |
| `npm run build` (CI env) | **pass**, 0 errors/warnings |
| `npm run smoke` vs started production build (CI empty-data config) | **ALL GREEN — 37 routes** (48 checks) |
| `scripts/verify-live-consistency.mjs` vs production build + replay of today's provider format | **27/27**: identical live counts (10 = 6+3+1) on homepage, `/live`, `/live?sport=basketball`, `/matches` chips, `/api/v1/live?sport=all`, `/api/v1/matches?…status=live`, rail; half-time, no invented minutes, postponed ≠ live, overnight live = today, match pages 200 |
| `scripts/verify-news-ingestion.mjs` vs production build + **real Postgres 17** + mock RSS | **24/24 + 3/3 after restart**: 401 without/with wrong token; authorised run → `storage: postgres`; failing source reported separately; `lastSuccessfulUpdate` set; legacy false positives quarantined with provenance; new commercial items never published; IHF → Handball; clean re-run → `fresh`; timestamps, articles and quarantine survive restart |
| `scripts/verify-http-auth.mjs` (QA DB) | **PASS**: auth, cookie flags, editor RBAC, CSRF, invalid input, durable match/stream binding, rematch rejection, calendar |
| `scripts/verify-durable.ts write/read` | **PASS** (fresh process; cross-connection ingestion lock) |
| `npm run db:setup` on empty Postgres | **pass**, migrations 0002–0005 applied |
| Headless Chromium (360/390/1280 px), Arabic font injected | 15 page checks: **0 overflow, 0 broken images, 0 runtime errors**; screenshots reviewed |

Fixed test commands: `verify-http-auth.mjs` asserted a 422 that only holds under `NEMO_STREAM_DOMAIN_POLICY=allowlist` (default is `open`). It now uses a policy-independent unsafe URL. Four test files whose fixtures published streams without rights evidence (`verify-repairs`, `verify-admin`, `verify-all-scenarios`, `verify-stream-policy`) plus the `verify-durable` fixture were updated to the new rule, with explicit negative assertions added.

Not run: `scripts/verify-browser.mjs` / `verify-provider-flows.mjs` need the full `playwright` package plus the Football-Data mock configuration. I covered the browser checks with my own headless run instead.

---

## 4. External configuration required (owner action)

1. **Set `CRON_SECRET`** (long random value) in Vercel → Production env, then redeploy. Without it automatic news refresh **does not run**. I have **not** verified a production refresh and don't claim it works. Optional: `NEMO_NEWS_SCHEDULER_INTERVAL_MINUTES` if you add an external scheduler (docs/NEWS_SCHEDULING.md).
2. After the first authorised run, review `npm run news:recategorize` (dry run) against production. If you approve, run it with `-- --apply` to move existing handball stories out of «الكرة المصرية». Categories of existing records are not changed automatically.
3. **Streams now require rights evidence.** The two existing production streams (Oct 9 matches) have none and are past anyway. Future streams need «الجهة صاحبة الحقوق» + «مرجع الترخيص» before publishing.
4. Migration 0005 is additive and also applied lazily by the app (`ADD COLUMN IF NOT EXISTS`). `npm run db:setup` applies it explicitly.

## 5. Remaining limitations

- Production still serves the old code until you merge/deploy. Every production observation above predates these fixes.
- The SportScore feed returns ≤ 50 matches per sport, so "today" lists aren't a complete schedule (existing disclosure kept). The free quota (~10k requests/day/IP) is shared. The shared snapshot reduces calls but quota isn't monitored per day across serverless instances.
- Live counts can still differ by a few seconds between surfaces rendered at different moments (cache ≈ 50 s, ISR 60 s on the homepage). They no longer differ by scope or by snapshot source.
- `/api/v1/live` and `/api/v1/matches` keep football as the default for existing API clients. Use `sport=all` to match the `/live` and `/matches` scope.
- Relevance rules are conservative keyword rules, not fact checking. Items with only weak sports context are held for editor review, and real stories may wait in the queue.
- Broadcast windows are fixed per sport. A stream for an unusually long match may expire early; the operator can mark the match live.

## 6. Manual verification after deployment

1. `https://<site>/api/v1/live?sport=all` → note `meta.count` and `meta.bySport`. `/live` header «N جارية الآن · كل الرياضات», the homepage «مباشر الآن (N)», `/matches?date=today` chip «مباشر», and `/api/v1/matches?sport=all&date=today&status=live` → `meta.count` should all show the same N (reload within a minute). Repeat with `?sport=football` / `/live?sport=football` / `/matches?date=today&sport=football`.
2. Open any live match link from `/live`: it must load (no 404); half-time shows «استراحة», never "1'".
3. `/api/v1/matches?date=today` → 200 (no `invalid_input`).
4. News: `curl -s -o /dev/null -w '%{http_code}' https://<site>/api/cron/fetch-news` → **401** (not 503) once the secret is set. Trigger one authorised run (`Authorization: Bearer $CRON_SECRET`), expect `"storage":"postgres"` and `moderation.applied:true`. Then `/api/v1/news` → `meta.lastSuccessfulUpdate` not null, `meta.freshness.state`; the Sabbour/El Sewedy stories are gone from `/news` (still in the DB with `status='hidden'` and a `moderation_reason`).
5. Streams: `/matches/al-fateh-vs-al-ahli` must not say «انتهت المباراة». `/live` must show no stream block for past matches. `/watch` lists them under «خارج نافذة البث».
6. Team cards on a phone: no "Vaq Vaqueros"-style duplicates; scores sit beside the right team.
7. `/scout`: a single labelled provenance line; changing the teams/players updates the tables.
8. Offline reproduction of everything above: see section 3. Commands: `npm run check`, `npm run build`, `npm run smoke`, `npm run replay:today` + `npm run verify:live`, `npm run mock:news` + `npm run verify:news-ingestion`.
