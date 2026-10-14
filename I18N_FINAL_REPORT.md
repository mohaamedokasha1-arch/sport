# NEMO Sports — Bilingual (Arabic + English) Implementation Report

**Repo:** `mohaamedokasha1-arch/sport` · **Branch:** `arena/6b071330-sport`
**Baseline:** `c715149` (tag `baseline-pre-i18n`) · **Head:** `4455d83`
**Scope of change:** 222 files, +10,215 / −2,280 (all under `nemo-sports/`)
**Report date:** 2026-10-14

This is an enhancement of the existing production site. It was not a redesign, and
it was not a rebuild. Every existing Arabic URL still resolves at the same path,
with the same render mode and the same canonical as before.

---

## (A) Changes made

### A1. Routing — Arabic untouched, English added alongside

The site now uses two Next.js route groups:

- `app/(ar)/` — the existing Arabic tree. **Arabic was deliberately NOT moved
  under `/ar/`.** `/`, `/matches`, `/teams`, `/news` etc. keep their URLs.
- `app/(en)/` — a mirrored `en/...` tree with 32 routes (`/en`, `/en/matches`,
  `/en/teams`, `/en/competitions`, `/en/news`, …).

Both groups render the **same shared page bodies** in `views/`. A route is a
10-line wrapper:

```tsx
// app/(en)/en/matches/page.tsx
export function generateMetadata() { return buildMetadata("en", props); }
export default function Page(props) { return <View locale="en" {...props} />; }
```

There is **no whole-page duplication for translation** and no cross-group
re-export. Adding a language later means adding a route group, not copying views.

**Route inventory diff** (verified by enumerating the build manifest against the
baseline):

| | Count |
|---|---|
| Baseline routes | 83 |
| Current non-`/en` routes | 84 |
| **Missing vs baseline** | **none** |
| **Added (non-`/en`)** | `/_not-found` only (a Next.js internal) |
| `/en` routes | 32 |

Render modes are unchanged: `○` static, `○`+ISR (`/fixtures` 120s, `/standings`
300s, `/today`, `/watch` 60s), `●` SSG, `ƒ` dynamic — identical per route to
baseline.

**Legacy `/match/[slug]` → `/matches/[slug]` 308 redirects preserved** in both
trees, including the `/en` mirror.

### A2. Translation system

- `lib/i18n/messages/ar.ts` and `en.ts` — organised dictionaries with reusable
  keys. **Arabic keys hold the site's existing terminology verbatim**; English
  was written as natural sports copy, not literal translation.
- `lib/i18n/translate.ts` — `t(locale, key, vars)`. Missing keys fall back to the
  key path rather than rendering blank.
- **AR/EN key parity is compiler-enforced** — a key present in one dictionary and
  absent in the other is a TypeScript error, so coverage cannot silently drift.
- `lib/i18n/context.tsx` — React context (`useT()`, `useLocale()`, `useDir()`),
  used only by high-fan-out presentational components. Everything else takes an
  explicit `locale` prop; **no scattered language conditionals** and no ambient
  per-request locale.
- `components/i18n/Link.tsx` — a locale-aware `next/link` that prefixes `/en`
  automatically. All 26 public importers of `next/link` now use it. Admin routes
  and external URLs stay on plain `next/link`.
- `dir` comes from the context, so direction-sensitive arrows/icons flip
  correctly instead of being mirrored blindly. Scoreboards, numbers and event
  timelines are **not** reversed.

### A3. Language switcher

`components/layout/LanguageSwitcher.tsx` renders two anchors — `العربية` and
`English` — in both the desktop header and the mobile drawer, keyboard
accessible, with `hrefLang`.

It is a plain anchor, **not** a client-side router push: switching changes
`<html lang>` and `dir`, which requires a full document load. There is no
language interstitial and no IP-based auto-redirect.

**Context preservation** — the switcher reads `useSearchParams()` as well as the
pathname, so filters, pagination and search survive the switch in both
directions. Verified on a running server:

```
/en/matches?date=2026-10-14&sport=football
  → Arabic link:  /matches?date=2026-10-14&sport=football
/matches?date=2026-10-14&sport=football
  → English link: /en/matches?date=2026-10-14&sport=football
```

`equivalentPathFor` maps non-translatable namespaces to a sane fallback rather
than blanket-redirecting to the homepage: `/admin` → `/en`, `/api/search` → `/en`.

### A4. RTL / LTR

`components/layout/RootShell.tsx` owns `<html lang dir>`. Verified on the served
document:

```
/    → <html lang="ar" dir="rtl">
/en  → <html lang="en" dir="ltr">
```

Arabic appearance is unchanged; English uses the same design system with LTR
logical properties.

### A5. Coverage translated

Header/nav, footer, homepage, match cards + status labels, live/upcoming/completed
filters, date filters, search (including empty states), team/player/league pages,
standings/stats/events, news list + article, tabs/filters/sorting/pagination/buttons,
loading/error/toast states, contact/about/FAQ/privacy/terms/copyright/broadcast-rights,
forms + validation + accessibility labels, the 404 and error boundaries.

`components/public/AdminPublished.tsx` (admin-published blocks) is localised, as
are ad slot labels, the match status pill and the match-event timeline.

**The admin panel stays Arabic** (925 lines), by design — it is operator-facing.

---

## (B) SEO preservation

### B1. Canonical defect found and fixed

Before this work, `generateMetadata("en")` on **13 views returned the Arabic
canonical with no hreflang** — only the homepage was correct. Had it shipped,
every English page would have canonicalised to its Arabic counterpart and Google
would have dropped them all.

After: every English page self-canonicalises; Arabic canonicals are byte-identical
to baseline.

### B2. 404 canonical defect found and fixed

Found by curling a 404 in both languages:

```
/teams/al-ahly      → noindex, no canonical
/en/teams/al-ahly   → noindex, canonical https://.../en     ← wrong
```

`app/(en)/layout.tsx` declared `alternates` in root metadata, so every page under
`(en)` with no metadata of its own inherited them — including the 404. A canonical
on a missing URL tells Google that URL duplicates the homepage. The layout block
was also a pure duplicate of what `views/home.tsx` already emits, so it was
removed. Both 404s now carry `noindex` and **no canonical**.

### B3. Verified on a running server (`npx next start`)

| Check | Result |
|---|---|
| `/` canonical | `https://nemo-sports.vercel.app` (unchanged) |
| `/en` canonical | `https://nemo-sports.vercel.app/en` (its own URL) |
| Canonical correct on 10 AR/EN pairs | **10/10** |
| hreflang cluster on `/matches` | `ar` → `/matches`, `en` → `/en/matches`, `x-default` → `/matches` |
| hreflang cluster on `/en/matches` | identical, reciprocal |
| 404 both locales | HTTP 404, `noindex`, no canonical |
| Redirect loops on 8 URLs | **0 redirects** on every one |
| `robots.txt` | unchanged; `/en` not blocked |
| `sitemap.xml` | **18 URLs (9 ar + 9 en), 0 duplicates, all absolute, well-formed XML** |
| `/admin`, `/en/admin` | 404 to anonymous visitors |

`x-default` points at the Arabic homepage, which is the site's real default.
`hreflang` is emitted **only where both languages exist** (18 indexable views) and
is suppressed on the 5 `noindex` views; `/scout` and `/search` intentionally emit
`hreflang=none`.

Sitemap generation mechanism is unchanged (`dynamic = "force-dynamic"`); English
entries are added by a trailing loop using `hasEnglishEquivalent`, de-duplicated
with a `seen` Set. Canonicals and sitemap agree.

### B4. Not done, deliberately

- **No new `noindex`** anywhere except the pre-existing admin/account/ad-frame
  rules.
- **No permissions removed** from `robots.txt`.
- **Translated slugs were not introduced.** Mapping is by stable entity identifier,
  so a slug is never duplicated per language and deep links survive.
- Operator-entered Arabic SEO copy (`metaDescription` in site settings) is **not**
  reused for `/en`; English gets its own `metaDescriptionEn` / `keywordsEn`.

---

## (C) Sports functionality

| Concern | Status |
|---|---|
| Data providers / integrations | untouched |
| Match, team, competition, event IDs | untouched |
| DB relations | untouched |
| **Migrations** | **none added** |
| Match records duplicated per language | **no** — one record, rendered in two languages |
| Scores / kickoff times / statuses | not altered |
| Internal API values, DB identifiers, enums | not translated |
| Refresh jobs, crons, caching | intact (revalidate values unchanged per route) |
| API error / rate-limit handling | preserved; see C1 |
| Admin tools | working — 43 tests pass, panel still auth-gated |
| Mock data substituted for live data | none |

**Verified at runtime:** `/api/live` 200, `/api/search?q=ahly` 200,
`/api/v1/matches` 200, `/api/v1/competitions` 200.

### C1. Sync error messages

`lib/sports-sync/read.ts` now returns a locale-neutral `errorCode`
(`"no-database" | "read-failed"`) alongside the existing Arabic `error` string, so
the UI renders the right language without hardcoding either. The Arabic `error`
field is retained for logs and any existing caller — the response contract did not
break.

### C2. Timezone and dates

Stored timestamps and timezone logic are untouched (`SITE_TZ = "Africa/Cairo"`).
Only formatting is locale-aware. **All 7 helpers in `lib/i18n/dates.ts` produce
byte-identical Arabic output to the baseline** across 12 pinned samples.

### C3. A missing English name never hides an entity

`lib/news/entities.ts` gained an optional `displayNameEn`; where it is absent,
`nameEn` falls back to the Arabic string, so an entry never disappears from a
listing.

---

## (D) Test results

Every result below was produced by running the project's own commands in this
sandbox.

| Command | Result |
|---|---|
| `npm run check` | **PASS** — exit 0, 31 steps, 23 test groups, **465 tests, 0 failures** |
| `npm run build` | **PASS** — exit 0 |
| `npm run typecheck` | **PASS** — exit 0 |
| `npm run i18n:test` | **PASS** — 24/24 |
| `npm run i18n:parity:test` | **PASS** — 5/5 |
| `npm run sports-sync:test` | **PASS** — 21/21 |
| `npm run seo:test` | **PASS** — 9/9 |
| `npm run admin:test` | **PASS** — 43 passed, 0 failed |
| `npm run consistency:test` | **PASS** |
| `npm run smoke` | **PASS** — exit 0, **107 routes** against a served production build |
| `npm run smoke:demo` | **PASS** — exit 0, **7 chrome checks** with demo data rendering |
| Lint | **PASS** — clean |
| CI (`typecheck · tests · build · smoke` ×2) | **PASS** — green on PR #49, both smoke passes |

### D0. The CI smoke check, and why it was extended

The repository already ran a smoke check in CI **against a real production
server** — the one environment that can see data-gated components. It had **zero
`/en` coverage**, so it would not have caught either leak described in E2/E2b,
and it would not catch a future regression in the language plumbing.

`scripts/smoke.mjs` now also asserts, against the served document rather than
against `generateMetadata()`:

- 29 `/en` routes answer 200;
- `<html lang="en" dir="ltr">` on English pages, and `lang="ar" dir="rtl"` still
  on the Arabic ones;
- the English canonical is the Arabic one with `/en` inserted after the host;
- hreflang is reciprocal and absolute, `x-default` on Arabic;
- a 404 carries `noindex` and **no canonical**, in both trees;
- the switcher keeps the query string, and both of its anchors survive in the
  server HTML of a *statically prerendered* page;
- no Arabic in the rendered chrome of any English page;
- the legacy `/match/[slug]` 308s still work in both trees;
- the sitemap lists one `/en` entry per Arabic entry, with no duplicates.

Mutation-verified end to end: an Arabic string was injected into the English
About page, the app was rebuilt, and the check reported
`/en/about → no Arabic in rendered chrome (1: نبضة تجريبية)`. It was then
restored and re-verified green (107 routes, exit 0).

### D0b. A second CI pass with data on screen

The empty-data pass still cannot see any component that only renders once data
is present — the blind spot behind all three leaks in E2, E2b and E2d. CI now
starts a **second** production server with `NEXT_PUBLIC_DEMO_CONTENT=1` on port
3001 and runs `npm run smoke:demo` against it. That flag is read at runtime by
the server components, so it reuses the same build; no second `next build`.

The demo pass is deliberately narrow and checks **chrome only**. With data on
screen an English page legitimately contains Arabic *data* — team, player,
competition and broadcaster names no source supplies in English — so a whole-page
scan would fail for the wrong reason and bury the signal. It inspects only pure
chrome:

- every status pill on `/en/matches`, `/en/live` and `/en`;
- the scoreboard clock on four English match detail pages.

Those are exactly the three surfaces where leaks were found.

Demo mode is a standalone pass that exits before the empty-data assertions, which
assume no data (whole pages free of Arabic, `/api/live` empty) and would
otherwise fail spuriously.

Verified locally against running servers — empty-data **107 routes, exit 0**;
demo-data **7 chrome checks, exit 0** — and in CI, where the step
*"Smoke against a production server WITH demo content (chrome only)"* completed
`success`. Mutation-verified: reverting the scoreboard clock to the raw Arabic
string made the demo pass report 4 failures naming each affected match page.

Two of my own errors in writing it, both caught by running it rather than by
review, and both worth recording:

1. My first canonical assertion compared against `BASE`, but canonicals are
   absolute to `SITE_URL`, so the `/` case could never pass. It now asserts the
   relationship between the pair.
2. I initially commented that the leak scan was safe on `/en/live` and
   `/en/watch` because CI runs empty-data. **That was false** — their Arabic
   comes from the static in-repo catalogues `lib/core-data.ts` and
   `lib/broadcasts.ts`, so it renders with or without a database and CI sees it
   too. Those two pages are now excluded and *reported* as expected data values
   (limitation E1) rather than silently skipped or falsely asserted clean.

### D1. New tests written for this work

- **`scripts/verify-i18n.test.ts` (24 tests):** English canonical equals its own
  URL; Arabic canonicals byte-identical to baseline; reciprocal absolute hreflang
  with `x-default` → Arabic and identical clusters; noindex pages get a canonical
  but no hreflang; `localeAlternates` returns no `languages` for `/admin`,
  `/api/search`, `/ad-frame`, `/icon.svg`; `EN_ROUTE_ROOTS` matches the on-disk
  `app/(en)/en` tree; the sitemap emits one `/en` counterpart per Arabic entry with
  matching metadata and no duplicates; **query strings survive a switch both ways**;
  **English falls back to `/en`** for `/admin` and `/api/search`; **the Suspense
  fallback renders real anchors** and **middleware must not read `LOCALE_COOKIE`**.
  The last 6 of these render the real `StatusBadge` component and assert the
  status pill and match-event labels in both languages (see E2).
- **`scripts/verify-i18n-parity.test.ts` (5 tests):** calls the *real* exported
  `clockOf`, matched against baseline on **78/78** status × kickoff × minute
  combinations; every mapped status has a dictionary entry in both languages.

Both were **mutation-verified** — the underlying bug was reintroduced and each
test was confirmed to go red before it was called done.

### D2. Flaky test encountered (disclosed)

One SDL rate-limiter test — *"shared atomic request budget charges failures/retries
and stops provider attempts at quota"* — failed once during a `npm run check` run
and then passed on **three consecutive re-runs** and on the full suite. It is a
wall-clock timing assertion in the quota test, unrelated to these changes. It is
noted here rather than silently ignored.

### D3. Functional coverage exercised

Both languages checked across: homepage, match listings, match detail, teams,
players, leagues/competitions, news list + article, search, filters, pagination,
navigation, language switching, loading/error/empty states, contact and legal pages.

### D4. What was NOT tested

- **NOT TESTED:** real browser rendering. No browser tool is available in this
  environment, so visual RTL/LTR layout, mobile viewport behaviour, long translated
  strings wrapping, focus order and contrast were verified by reading code and by
  curling server HTML — **not** by looking at a rendered page.
- **Caveat on the Arabic-leak scan.** It curls rendered pages, and it runs with no
  database, so any component that only renders when data is present was never
  exercised. It missed the status-pill and event-label leak described in E2.
  Component-level tests now cover that gap, and a source-level grep for Arabic in
  public non-comment code found a second instance of the same bug (E2b). The blind
  spot still applies to anything neither approach reaches, so: **re-run the leak
  scan against a preview environment with real data before deploying.**
- **NOT TESTED against a live database.** `DATABASE_URL` is unset in this sandbox,
  so data-gated pages render their empty states. Entity detail pages
  (`/teams/[slug]`, `/matches/[slug]`) return 404 here for that reason, and the
  sitemap's data-gated sections are empty.
- **NOT TESTED:** cron execution against real provider endpoints.

---

## (E) Remaining limitations

### E1. Arabic data values still appear on two English pages — deliberate

**`/en/live` (14 strings)** — team and competition names such as `أولمبيك ليون`,
`الدوري الألماني`. These come from the SportScore feed, which supplies Arabic
only (`packages/sdl/src/adapters/sportscore.ts:401` — `homeName: m.home`). There
is no English name in the feed to use.

**`/en/watch` (18 strings)** — broadcaster, competition and region names such as
`أون سبورت`, `إسبانيا, ألمانيا`, `العالم (باستثناء الولايات المتحدة)`. These are
operator-entered in the admin panel; `BroadcasterEntry` has no English fields.

These are **data values, not untranslated UI chrome.** Translating them would mean
either inventing official team and broadcaster names — which the brief explicitly
forbids — or adding columns via a migration, which the brief also rules out. The
correct fix is upstream: capture an English alias where one exists, at the point
of entry. **Reported, not fabricated.**

Every other `/en` page is clean: **21 of 23 English pages contain no Arabic at
all** apart from the `العربية` switcher label, which is correct by design.

### E2. Two internal label maps — found, fixed, and a correction to an earlier claim

`lib/format.ts` holds `STATUS_AR` (7 uppercase provider status keys) and
`EVENT_LABEL` (12 match-event types) in Arabic only. **An earlier draft of this
report claimed these "are not rendered on the public English pages tested." That
claim was false.** `components/ui/StatusBadge.tsx` imported `STATUS_AR` and
`components/match/MatchLive.tsx` rendered `EVENT_LABEL.label` — both public
components reached from match cards and the match detail timeline, so English
match pages would have shown Arabic status pills and Arabic event labels.

The leak survived the Arabic-leak scan of `/en` pages because **that scan runs
with no `DATABASE_URL`, so no match card renders at all** and the pages looked
clean. A content scan cannot find a bug in a component that never rendered.

Fixed:

- `StatusBadge` now reads the `status.*` message keys and its `dir` follows the
  document (`dir="rtl"` was hardcoded, which renders an English pill
  right-to-left).
- `MatchLive` renders the `event.*` keys; `EVENT_LABEL` keeps only the glyph and
  tone, which are presentation, not copy.
- `lib/i18n/translate.ts` gained `hasMessage(locale, key)`, so an unlabelled
  provider status still falls through to the raw token — preserving the previous
  `STATUS_AR[status] ?? status` contract instead of leaking `status.NOTAKICK`.

The dictionary already held both key families with the **exact** Arabic strings
the code maps used, so **Arabic output is unchanged** — verified byte-for-byte
across all 7 statuses and all 12 event types. English now renders `Live`,
`Half-time`, `Not started`, `Full time`, `Postponed`, `Cancelled`, `Suspended`,
and `Goal` / `Own goal` / `Penalty` / `Penalty missed` / `Yellow card` /
`Red card` / `Red card (second yellow)` / `Substitution (on)` /
`Substitution (off)` / `Injury` / `VAR review` / `End of period`.

Locked in by 6 tests in `scripts/verify-i18n.test.ts` (now 16), which render the
real components rather than describing them, and were mutation-verified — the
original bug was reintroduced and 3 of the 6 confirmed to go red.

`lib/format.ts` itself is unmodified; it stays on the byte-for-byte baseline
guard list, and its maps remain in use by the Arabic admin panel.

### E2b. A second leak of the same shape — broadcast notices under the player

Applying the lesson from E2 rather than stopping at it, I grepped the public tree
for Arabic in non-comment source lines, which is something a runtime scan
structurally cannot do. Most hits are legitimate: admin code, data values,
Arabic text normalisation, and deliberate `locale === "ar"` punctuation choices.

Two did not qualify. `lib/broadcast-state.ts` produces the stream notice as an
Arabic string (`noticeAr`) — correctly, because the broadcast *rule* it encodes is
covered by the consistency suite and must stay untranslated. Callers are
responsible for translating it. `views/watch.tsx` did that via
`broadcastNoticeKey`, but **`components/public/LiveStreams.tsx` and
`views/match-detail.tsx` passed `noticeAr` straight into `inactiveNote`**, which
`MatchStreamPlayer` renders as visible bold text. So the `/en/live` and
`/en/matches/[slug]` players would have shown an Arabic notice.

Fixed by routing both through the existing `broadcastNoticeKey` mapper. Verified
across all 8 match states and all 6 approval-side notices: each resolves to clean
English, e.g. `finished` → "The match is finished — the live stream has ended.",
`postponed` → "The match is postponed — there is no live stream right now."

`scripts/sports-sync-safety-baseline.json` pins hashes for these two files in its
`localisedOnly` list, so the edit correctly tripped the guard. The diff was
reviewed and is imports, one prop expression and comments — no logic change — so
the hashes were re-pinned and the `_comment` records why. Test 21 now also asserts
the wiring itself, since a hash cannot distinguish a translation from a logic
change.

Locked in by 4 further tests (i18n suite now 20), mutation-verified: the raw prop
was reintroduced and **both** the i18n guard and sports-sync test 21 went red.

### E2c. Systematic source sweep — result

To be sure E2 and E2b were not isolated, every file under `components/` and
`views/` (excluding admin) was scanned for Arabic in **non-comment** code lines —
15 files matched, and each was classified individually. **All 15 are
legitimate**, in five groups:

| Group | Examples | Why it is correct |
|---|---|---|
| Locale-conditional punctuation | `join(locale === "ar" ? "، " : ", ")` in `home`, `live`, `matches`, `watch`, `MatchLive` | The Arabic comma is the correct list separator for Arabic |
| Bilingual value pairs | `locale === "ar" ? "تحليلات" : "Analysis"` in `Footer` | Both branches present; English renders English |
| API contract values | `TYPE_ORDER` and the position/`?category=` maps in `SearchBox`, `search`, `players`, `team-detail` | The Arabic token is the API's own value, mapped to a `labelKey` at render, so `/api/search` stays untouched |
| The switcher label | `العربية` in `LanguageSwitcher` | A language is always written in itself |
| Data comparisons / comments | `c.format === "بطولة فردية"` in `CompetitionCard`; JSX comments | Comparing against provider data, not rendering copy |

Two supporting claims were verified rather than assumed:

- The English footer emits `/en/news?category=Analysis` and `?category=Transfers`;
  both return **HTTP 200**. `canonicalCategoryParam` was executed directly and
  maps `Analysis`, `Transfers`, `تحليلات`, `انتقالات` and `الانتقالات` to the
  stored English names, and passes an unknown value through unchanged — 7/7.
- `lib/scout.ts` still exports Arabic maps (`TEAM_SELECTION_MESSAGE_AR`,
  `PLAYER_METRICS`), but its only public consumer, `ScoutWorkspace.tsx`, imports
  the *code*-returning functions and renders every label through its own key
  tables. That file contains **zero** Arabic in code lines.

**Conclusion: no further Arabic leaks remain in the public rendered UI.** The
remaining Arabic on `/en/live` and `/en/watch` is data, per E1.

### E2d. A third leak, found by finally rendering the app with data

The sweep in E2c read source, and the runtime scans ran without a database. Both
are blind to the same thing: a component that only renders when data is present.
The app has a supported demo-content path (`NEXT_PUBLIC_DEMO_CONTENT=1`), so the
build was re-run with it and every English page re-scanned with real cards,
scoreboards and rails on screen.

That immediately exposed a **third leak of the same family**: English match cards
reading `المجموعة 3` and `الشوط 2 · 14:18`. The `StatusBadge` fix in E2 translated
the *status label* but not the *clock*. `clockFor()` in `lib/live.ts` bakes Arabic
into the clock string for every non-football sport — quarter, set, half, period,
inning, round — and `MatchCard`, `MatchLive` and `ScoreRail` all rendered it
verbatim. `ScoreRail` sits in the site header, so it was on every page.

The clock could not simply be translated: `LiveState.clock` is part of the
`/api/live` payload, which is a public API contract that client components poll.
So the same information is now *also* exposed structurally as
`LiveState.clockParts`, and `lib/i18n/clock.ts` renders it per locale. The API's
`clock` field is untouched; `/api/live` gains `clockParts` additively, which is
backwards compatible.

The stored `Match.clock` field turned out to be free-form — providers and
operators put kickoff times (`21:00`), minutes (`67'`) and the site's own Arabic
clock words (`انتهت`, `المجموعة 3`) in it. `partsForStoredClock()` recognises the
strings this codebase itself emits and passes anything else through verbatim,
because guessing at an unknown operator string would fabricate meaning.

Verified across all 44 live states: **Arabic byte-identical to the legacy clock
string (0 diffs), English with no Arabic (0)**. At runtime `/en/matches` renders
`Set 3`, `Half 2 · 16:53`, `Full time`; `/matches` is unchanged. 4 further tests
(15 clock shapes × 2 languages, plus the raw passthrough), mutation-verified.

### E2e. Full re-scan with data rendering — final state

| English page | Arabic strings | Classification |
|---|---|---|
| `/en`, `/en/results`, `/en/fixtures`, `/en/standings`, `/en/competitions`, `/en/my-day`, `/en/scout`, `/en/sports`, `/en/about`, `/en/contact`, `/en/faq`, `/en/learn`, `/en/privacy`, `/en/terms`, `/en/copyright`, `/en/broadcast-rights`, `/en/account` | **0** | clean |
| `/en/teams` (112), `/en/players` (43), `/en/search` (9) | team and player names | **data** — `lib/core-data.ts` has no `nameEn` for teams |
| `/en/news` (56) | article titles, excerpts, authors, category names | **data** — Arabic feed content |
| `/en/matches` (43), `/en/live` (14), `/en/watch` (17) | team, competition, broadcaster, region names; `match.round` | **data** — provider- and operator-supplied |

Two strings were checked individually because they *looked* like chrome and would
have been easy to mis-file:

- `الجولة 24` on `/en/matches` is `Match.round`, a provider data field rendered
  verbatim (`round?: string`), not a constructed UI label.
- `الأولى` on `/en/news` sits inside an Arabic article excerpt, not in the page
  furniture.

**All remaining Arabic on English pages is data.** No UI chrome leak remains.
Note that `/en/standings` went from 31 Arabic strings to **0** as a side effect of
the clock fix — those were period labels in the standings rows.

### E3. `/admin` returns 404 to anonymous visitors

This is **pre-existing, intentional behaviour**, not a regression. `middleware.ts`
hides the panel from scanners; `/admin/login` returns 200. The file is
**byte-identical to baseline** (SHA-256 `7c90076c…` on both).

### E4. Language preference

A `LOCALE_COOKIE` is written on explicit click but is **never read by
`middleware.ts`** (asserted by a test). Consequences, both intended:

- A direct `/en/...` URL always renders English, even for a visitor who previously
  chose Arabic.
- There is no IP-based or cookie-based auto-redirect. Crawlers can discover both
  versions from any entry point.

### E5. Suspense fallback caveat (documented for future maintainers)

The switcher reads `useSearchParams()`, which forces a Suspense boundary. On
statically prerendered pages, a `null` fallback **erases the switcher from the
server HTML** — caught here on `/en/about`, `/en`, `/en/privacy`, `/en/learn`. The
fallback now renders real anchors with an empty query string. This is locked in by
a test.

---

## (F) Deployment status

**PR #49 was merged into `main`. A production deployment very likely followed,
and I could not verify it from this environment.**

What actually happened:

- 53 commits on branch `arena/6b071330-sport`, branched from `c715149`.
- Opened as **PR #49** against `main`. CI ran green: `typecheck · tests · build ·
  smoke` (both the empty-data and demo-data smoke passes), plus the Vercel
  preview build.
- **Merged into `main`** at 2026-10-14T14:39:09Z as merge commit
  `bd83e39e327e59807583f5f19e314b0a25770e14`. Verified afterwards: `origin/main`
  advanced `c715149 → bd83e39`, and `main`'s tree hash is byte-identical to the
  tree CI validated, so what is on `main` is exactly what passed.
- Re-verified the merged content locally after the merge: `npm run check` exit 0
  (465 tests, 23 groups) and `npm run build` exit 0.
- Tag `baseline-pre-i18n` marks the pre-work commit as a restore point.

### The deployment I cannot confirm

Vercel is connected to this repository. **96 seconds after the merge**, the merge
commit on `main` received a Vercel commit status reading
*"Deployment has completed"* (2026-10-14T14:40:45Z). The repo's `vercel.json`
carries only cron definitions and no branch configuration, so the production
branch is whatever the Vercel dashboard says — which defaults to `main`.

Taken together, that strongly indicates **merging to `main` deployed this work to
production**. I am stating that as a strong inference, not as a verified fact,
because I could not check:

- `https://nemo-sports.vercel.app/` is **not reachable from this sandbox** — the
  request returned HTTP 000. I cannot confirm the live site now serves `/en`, nor
  inspect its canonical or hreflang responses.
- The Vercel deployment URL is likewise unreachable, so I cannot tell from here
  whether that completed deployment was promoted to the production alias or left
  as a preview.

**Anyone with dashboard access should confirm the production deployment and
spot-check the live site before treating this as shipped.**

What did **not** happen:

- **No Google Search Console access.** Nothing is known about what Google has
  indexed, and no claim is made that it will index the new English pages.
  Indexing is neither guaranteed nor a predictable outcome of this work.
- **Every "verified" claim in sections B–D refers to the local production build
  and to CI** — never to the live site, which was never fetched.

### UNVERIFIED IN PRODUCTION

- HTTP status codes, canonicals and hreflang on the live domain
- Whether Google will discover, crawl or index `/en/*`
- Behaviour against the real database (entity pages, live data, admin data views)
- Cron/refresh jobs against real provider endpoints
- Visual rendering, mobile layout, contrast and focus order in a real browser

### Recommended post-merge verification

The merge is done, so these are now checks on the live site rather than gates
before it.

1. **Confirm the production deployment** in the Vercel dashboard — which
   deployment is on the production alias, and that it is `bd83e39` or later.
2. **Re-run the route inventory diff against production**, and confirm every
   pre-existing Arabic URL still returns 200 with its original canonical. This is
   the single most important check: it is the one that would catch a regression
   in the live site's existing SEO.
3. **Check `/en` on the live domain** — `<html lang="en" dir="ltr">`, a
   self-canonical, and reciprocal hreflang.
4. **Spot-check entity detail pages** (`/teams/[slug]`, `/matches/[slug]`,
   `/en/matches/[slug]`) with real data. This sandbox and CI both ran without a
   production database, so live entity pages were never exercised end to end.
5. **Re-run the Arabic-leak scan against production.** The demo dataset exercised
   the components, but it is not production data.
6. **Visually verify** Arabic RTL and English LTR in a real browser at mobile
   widths, with long English strings.
7. Only then **submit the updated sitemap in Search Console** and monitor
   coverage — do not assume the English pages will be picked up.
