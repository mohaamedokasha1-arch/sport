/**
 * NEMO Sports · i18n routing & SEO contract
 * ─────────────────────────────────────────────────────────────────────────────
 * The invariants the bilingual build depends on, asserted against the real
 * modules rather than a description of them:
 *
 *   · an English page canonicalises to its OWN /en URL — never to the Arabic
 *     page it was translated from (that would tell Google the English page is a
 *     duplicate and keep it out of the index);
 *   · an Arabic canonical is byte-identical to what the site emitted before
 *     English existed;
 *   · hreflang is emitted only where a real /en route exists, with x-default
 *     pointing at Arabic, and never on a noindex page;
 *   · EN_ROUTE_ROOTS and the tree under app/(en)/en/ agree exactly, so the
 *     switcher can never link to a route that does not exist;
 *   · the sitemap lists an /en counterpart for every Arabic entry that has one,
 *     with no duplicates.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";

import { EN_ROUTE_ROOTS, equivalentPathFor } from "@/lib/i18n/paths";
import { readFileSync } from "node:fs";
import { localeAlternates } from "@/lib/i18n/metadata";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/lib/i18n/context";
import StatusBadge from "@/components/ui/StatusBadge";
import { hasMessage, t } from "@/lib/i18n/translate";
import { STATUS_AR, EVENT_LABEL } from "@/lib/format";
import { broadcastBadgeKey, broadcastNoticeKey } from "@/lib/i18n/broadcast";
import { clockLabel } from "@/lib/i18n/clock";
import type { ClockParts } from "@/lib/live";
import type { MatchState } from "@/lib/match-state";
import type { BroadcastState } from "@/lib/broadcast-state";
import { EN_PREFIX } from "@/lib/i18n/locales";
import { SITE_URL } from "@/lib/site";
import sitemap from "@/app/sitemap";

import * as home from "@/views/home";
import * as matches from "@/views/matches";
import * as teams from "@/views/teams";
import * as news from "@/views/news";
import * as competitions from "@/views/competitions";
import * as standings from "@/views/standings";
import * as live from "@/views/live";
import * as results from "@/views/results";
import * as fixtures from "@/views/fixtures";
import * as watch from "@/views/watch";
import * as about from "@/views/about";
import * as contact from "@/views/contact";
import * as faq from "@/views/faq";
import * as learn from "@/views/learn";
import * as broadcastRights from "@/views/broadcast-rights";
import * as privacy from "@/views/privacy";
import * as terms from "@/views/terms";
import * as copyrightView from "@/views/copyright";
// noindex utility pages: correct canonical, deliberately no hreflang.
import * as scout from "@/views/scout";
import * as search from "@/views/search";
import * as sports from "@/views/sports";
import * as myDay from "@/views/my-day";
import * as account from "@/views/account";

type Gen = { generateMetadata: (locale: "ar" | "en", props?: never) => Metadata };

const INDEXABLE: Record<string, Gen> = {
  "/": home as never, "/matches": matches as never, "/teams": teams as never,
  "/news": news as never, "/competitions": competitions as never, "/standings": standings as never,
  "/live": live as never, "/results": results as never, "/fixtures": fixtures as never,
  "/watch": watch as never, "/about": about as never, "/contact": contact as never,
  "/faq": faq as never, "/learn": learn as never, "/broadcast-rights": broadcastRights as never,
  "/privacy": privacy as never, "/terms": terms as never, "/copyright": copyrightView as never,
};
const NOINDEX: Record<string, Gen> = {
  "/scout": scout as never, "/search": search as never, "/sports": sports as never,
  "/my-day": myDay as never, "/account": account as never,
};

const canon = (mod: Gen, locale: "ar" | "en") =>
  (mod.generateMetadata(locale).alternates ?? {}).canonical as string;
const langs = (mod: Gen, locale: "ar" | "en") =>
  (mod.generateMetadata(locale).alternates ?? {}).languages as Record<string, string> | undefined;

test("every English page canonicalises to its own /en URL", () => {
  for (const [path, mod] of Object.entries({ ...INDEXABLE, ...NOINDEX })) {
    const en = canon(mod, "en");
    const expected = EN_PREFIX + (path === "/" ? "" : path);
    assert.equal(en, expected, `${path}: English canonical must be its own URL, got ${en}`);
  }
});

test("Arabic canonicals are unchanged by the English build", () => {
  for (const [path, mod] of Object.entries({ ...INDEXABLE, ...NOINDEX })) {
    assert.equal(canon(mod, "ar"), path, `${path}: the published Arabic canonical moved`);
  }
});

test("indexable pages carry ar / en / x-default hreflang, absolute and reciprocal", () => {
  for (const [path, mod] of Object.entries(INDEXABLE)) {
    const l = langs(mod, "en");
    assert.ok(l, `${path}: indexable page must advertise hreflang`);
    assert.equal(l!.ar, `${SITE_URL}${path}`, `${path}: ar hreflang`);
    assert.equal(l!.en, `${SITE_URL}${EN_PREFIX}${path === "/" ? "" : path}`, `${path}: en hreflang`);
    assert.equal(l!["x-default"], l!.ar, `${path}: x-default must point at Arabic, the real default`);
    // Arabic and English must describe the same cluster, or Google drops both.
    assert.deepEqual(langs(mod, "ar"), l, `${path}: hreflang differs between the two languages`);
  }
});

test("noindex utility pages get a correct canonical but no hreflang", () => {
  for (const [path, mod] of Object.entries(NOINDEX)) {
    assert.equal(canon(mod, "en"), EN_PREFIX + path, `${path}: English canonical`);
    assert.equal(langs(mod, "en"), undefined, `${path}: a noindex page must not advertise a language cluster`);
  }
});

test("localeAlternates never points hreflang at a route with no English page", () => {
  for (const path of ["/admin", "/api/search", "/ad-frame", "/icon.svg"]) {
    const a = localeAlternates("en", path);
    assert.equal(a.languages, undefined, `${path} has no English route and must not claim one`);
  }
});

test("EN_ROUTE_ROOTS and the app/(en)/en tree list exactly the same routes", () => {
  const root = "app/(en)/en";
  assert.ok(existsSync(root), "the English route tree exists");
  const onDisk = new Set<string>([""]);
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const seg = `${prefix}/${entry.name}`;
      onDisk.add(seg.replace(/^\//, "").split("/")[0] ?? "");
      walk(join(dir, entry.name), seg);
    }
  };
  walk(root, "");
  const declared = new Set(EN_ROUTE_ROOTS);
  for (const route of onDisk) {
    assert.ok(declared.has(route), `app/(en)/en/${route} exists but is missing from EN_ROUTE_ROOTS — the switcher would fall back to the homepage`);
  }
  for (const route of declared) {
    if (route === "") continue;
    assert.ok(onDisk.has(route), `EN_ROUTE_ROOTS lists "${route}" but app/(en)/en/${route} does not exist — hreflang would point at a 404`);
  }
});

test("the sitemap lists an /en counterpart for every Arabic entry that has one", async () => {
  const list = await sitemap();
  const path = (url: string) => url.replace(/^https?:\/\/[^/]+/, "");
  const isEn = (url: string) => new RegExp(`^${EN_PREFIX}(/|$)`).test(path(url));
  const en = list.filter((e) => isEn(e.url));
  const ar = list.filter((e) => !isEn(e.url));
  assert.ok(list.length > 0, "the sitemap is not empty");

  const urls = list.map((e) => e.url);
  assert.equal(new Set(urls).size, urls.length, `the sitemap contains duplicate URLs: ${urls.filter((u, i) => urls.indexOf(u) !== i).join(", ")}`);
  for (const e of list) assert.ok(e.url.startsWith(SITE_URL), `every sitemap URL is absolute on the serving host: ${e.url}`);

  // Every Arabic entry with an English route has its counterpart, carrying the
  // same lastModified / changeFrequency / priority.
  for (const entry of ar) {
    const p = path(entry.url) || "/";
    const { hasEnglishEquivalent } = await import("@/lib/i18n/paths");
    if (!hasEnglishEquivalent(p)) continue;
    const counterpart = en.find((e) => path(e.url) === (p === "/" ? EN_PREFIX : EN_PREFIX + p));
    assert.ok(counterpart, `missing /en counterpart for ${p}`);
    assert.equal(counterpart!.changeFrequency, entry.changeFrequency, `${p}: changeFrequency must match its Arabic entry`);
    assert.equal(counterpart!.priority, entry.priority, `${p}: priority must match its Arabic entry`);
    assert.deepEqual(counterpart!.lastModified, entry.lastModified, `${p}: lastModified must match its Arabic entry`);
  }
});

test("the language switcher preserves filters, pagination and search on switch", () => {
  const cases: [string, string, string][] = [
    ["/matches?date=2026-10-14&sport=football", "/matches?date=2026-10-14&sport=football", "/en/matches?date=2026-10-14&sport=football"],
    ["/search?q=ahly", "/search?q=ahly", "/en/search?q=ahly"],
    ["/news?competition=egyptian-league", "/news?competition=egyptian-league", "/en/news?competition=egyptian-league"],
    ["/teams?page=2", "/teams?page=2", "/en/teams?page=2"],
    ["/teams/al-ahly", "/teams/al-ahly", "/en/teams/al-ahly"],
    ["/", "/", "/en"],
  ];
  for (const [current, ar, en] of cases) {
    assert.equal(equivalentPathFor(current, "ar"), ar, `${current} -> ar`);
    assert.equal(equivalentPathFor(current, "en"), en, `${current} -> en`);
  }
});

test("a page with no English counterpart falls back to the English homepage, never a 404", () => {
  // /admin has no English route and sits outside EN_ROUTE_ROOTS on purpose.
  assert.equal(equivalentPathFor("/admin", "en"), "/en");
  assert.equal(equivalentPathFor("/admin/live", "en"), "/en");
  assert.equal(equivalentPathFor("/api/search", "en"), "/en");
  // Arabic never gains a prefix, so existing links are untouched.
  assert.equal(equivalentPathFor("/en/matches", "ar"), "/matches");
});

test("the switcher renders real anchors in server HTML, not a null fallback", () => {
  // A `fallback={null}` boundary removed the switcher from the server HTML of
  // every statically prerendered page, leaving crawlers and no-JS visitors
  // without one. The fallback must render the same anchors, built from the
  // pathname, with the query string added after hydration.
  const src = readFileSync(new URL("../components/layout/LanguageSwitcher.tsx", import.meta.url), "utf8");
  assert.match(src, /fallback=\{<SwitcherLinks search="" \/>\}/, "the Suspense fallback must render real anchors");
  assert.ok(!/fallback=\{null\}/.test(src), "a null fallback must not come back");
  assert.match(src, /useSearchParams\(\)/, "the query string is still read, so filters survive a switch");
  assert.match(src, /LOCALE_COOKIE/, "the explicit choice is still remembered");
  // Routing must never read the cookie: a direct /en/... link has to render
  // English regardless of a previous choice, and crawlers must see both trees.
  const middleware = readFileSync(new URL("../middleware.ts", import.meta.url), "utf8");
  assert.ok(!middleware.includes("LOCALE_COOKIE"), "middleware must not redirect on the locale cookie");
});

/* ── status pill + match-event labels ───────────────────────────────────────
 * StatusBadge and the match event timeline rendered STATUS_AR / EVENT_LABEL
 * from lib/format.ts directly, so English match cards showed Arabic status
 * pills. The Arabic-leak scan of /en pages did not catch this: with no
 * DATABASE_URL in the test environment no match card renders at all, so the
 * page looked clean. These tests render the real components instead.
 */

function renderBadge(status: string, locale: "ar" | "en"): string {
  return renderToStaticMarkup(
    React.createElement(
      // LocaleProvider derives dir from the locale itself, so only the locale
      // is passed. The cast keeps createElement happy about `children`, which
      // arrives as the trailing argument rather than in the props object.
      LocaleProvider as React.ComponentType<{ locale: "ar" | "en" }>,
      { locale },
      React.createElement(StatusBadge, { status }),
    ),
  );
}

/** The text the pill actually shows — the innermost span. */
function badgeLabel(html: string): string {
  return html.match(/<span>([^<]*)<\/span><\/span>/)?.[1] ?? "";
}

test("StatusBadge renders the Arabic label byte-identical to STATUS_AR", () => {
  for (const status of Object.keys(STATUS_AR)) {
    const html = renderBadge(status, "ar");
    assert.equal(badgeLabel(html), STATUS_AR[status], `ar badge for ${status}`);
    assert.match(html, /dir="rtl"/, `ar badge for ${status} must stay rtl`);
  }
});

test("StatusBadge renders English for every status, in ltr, with no Arabic left", () => {
  for (const status of Object.keys(STATUS_AR)) {
    const html = renderBadge(status, "en");
    const shown = badgeLabel(html);
    assert.ok(shown.length > 0, `en badge for ${status} rendered nothing`);
    assert.equal(
      /[\u0600-\u06FF]/.test(shown),
      false,
      `en badge for ${status} still shows Arabic: ${shown}`,
    );
    assert.match(html, /dir="ltr"/, `en badge for ${status} must be ltr`);
  }
});

test("StatusBadge falls back to the raw provider token for an unlabelled status", () => {
  // t() degrades to the key, which would leak "status.NOTAKICK" onto the page.
  // The old code did STATUS_AR[status] ?? status; this must behave the same.
  for (const status of ["NOTAKICK", "SOMETHING_NEW"]) {
    assert.equal(hasMessage("en", `status.${status}`), false);
    assert.equal(badgeLabel(renderBadge(status, "en")), status);
    assert.equal(badgeLabel(renderBadge(status, "ar")), status);
  }
});

test("every match-event type has an English label and an unchanged Arabic one", () => {
  for (const type of Object.keys(EVENT_LABEL)) {
    const expected = EVENT_LABEL[type as keyof typeof EVENT_LABEL]!.label;
    assert.equal(t("ar", `event.${type}`), expected, `ar label for ${type}`);
    const en = t("en", `event.${type}`);
    assert.equal(/[\u0600-\u06FF]/.test(en), false, `en label for ${type} has Arabic: ${en}`);
    assert.notEqual(en, `event.${type}`, `en label for ${type} fell through to the key`);
  }
});

test("MatchLive no longer renders EVENT_LABEL.label directly", () => {
  const src = readFileSync("components/match/MatchLive.tsx", "utf8");
  assert.equal(
    /\{meta\.label\}/.test(src),
    false,
    "MatchLive must render the translated event label, not EVENT_LABEL.label",
  );
  assert.match(src, /hasMessage\(locale, eventKey\)/);
});

test("StatusBadge no longer reads STATUS_AR from lib/format", () => {
  const src = readFileSync("components/ui/StatusBadge.tsx", "utf8");
  // Strip comments first: the doc comment explains what used to be wrong and
  // legitimately names STATUS_AR. What must not survive is the dependency.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.equal(
    /from "@\/lib\/format"/.test(code),
    false,
    "StatusBadge must read status labels from the message catalogue, not lib/format",
  );
  assert.equal(
    /STATUS_AR/.test(code),
    false,
    "StatusBadge must not reference STATUS_AR in code",
  );
  assert.match(code, /hasMessage\(locale, key\)/, "unknown statuses must fall back safely");
  assert.match(code, /dir=\{dir\}/, "StatusBadge must not hardcode dir=\"rtl\"");
});

/* ── broadcast notices under the stream player ──────────────────────────────
 * lib/broadcast-state.ts produces the notice as an Arabic string (noticeAr)
 * because the broadcast rule it encodes is covered by the consistency suite and
 * must stay untranslated. Callers are responsible for mapping it to a message
 * key. views/watch.tsx did that; LiveStreams and match-detail passed noticeAr
 * straight into a visible prop, so the /en/live and /en/matches/[slug] players
 * showed an Arabic notice. A content scan cannot catch this: with no database
 * there is no stream and therefore no notice on the page.
 */

const MATCH_STATES: MatchState[] = [
  "upcoming",
  "live",
  "unconfirmed",
  "finished",
  "postponed",
  "cancelled",
  "suspended",
  "abandoned",
];

const BROADCAST_STATES: BroadcastState[] = [
  "live",
  "standby",
  "ended",
  "review",
  "unpublished",
  "expired",
];

test("every broadcast notice key resolves to clean English and clean Arabic", () => {
  for (const matchState of MATCH_STATES) {
    const key = broadcastNoticeKey("انتهت نافذة البث المقررة لهذه المباراة", matchState);
    const en = t("en", key);
    assert.notEqual(en, key, `${key} has no English entry`);
    assert.equal(/[\u0600-\u06FF]/.test(en), false, `${key} English still has Arabic: ${en}`);
    assert.ok(t("ar", key).length > 0, `${key} has no Arabic entry`);
  }
});

test("the approval-side broadcast notices are all mapped, not just the expiry ones", () => {
  // These are matched on the Arabic wording lib/broadcast-state.ts emits; if
  // that wording changes the mapper must be updated rather than silently
  // falling through to windowClosed.
  const notices = [
    "أنهت الإدارة البث",
    "غير منشور",
    "بانتظار توثيق الحقوق",
    "يبدأ البث مع انطلاق المباراة",
    "بث مباشر الآن",
    "لا يمكن ربط هذا البث",
  ];
  const expected = [
    "bc.notice.ended",
    "bc.notice.unpublished",
    "bc.notice.review",
    "bc.notice.standby",
    "bc.notice.live",
    "bc.notice.unlinked",
  ];
  notices.forEach((notice, i) => {
    const key = broadcastNoticeKey(notice, "unconfirmed");
    assert.equal(key, expected[i], `notice ${JSON.stringify(notice)} mapped to ${key}`);
    const en = t("en", key);
    assert.equal(/[\u0600-\u06FF]/.test(en), false, `${key} English still has Arabic: ${en}`);
  });
});

test("every broadcast badge key resolves to clean English", () => {
  for (const state of BROADCAST_STATES) {
    const key = broadcastBadgeKey({ state, matchState: "finished" });
    const en = t("en", key);
    assert.notEqual(en, key, `${key} has no English entry`);
    assert.equal(/[\u0600-\u06FF]/.test(en), false, `${key} English still has Arabic: ${en}`);
  }
});

test("no public view passes a raw Arabic broadcast notice to a visible prop", () => {
  // The rule: noticeAr may be *read* to pick a key, but must never be handed to
  // a component as text. Assert on the call sites rather than on the lib, whose
  // Arabic wording is intentional and covered elsewhere.
  for (const file of [
    "components/public/LiveStreams.tsx",
    "views/match-detail.tsx",
    "views/watch.tsx",
  ]) {
    const src = readFileSync(file, "utf8");
    assert.match(
      src,
      /broadcastNoticeKey\(/,
      `${file} must map the broadcast notice through broadcastNoticeKey`,
    );
    assert.equal(
      /inactiveNote=\{[^}]*noticeAr\s*\}/.test(src),
      false,
      `${file} passes the raw Arabic notice straight to a visible prop`,
    );
  }
});

/* ── the live clock ─────────────────────────────────────────────────────────
 * lib/live.ts computes a match clock and has always exposed it as an Arabic
 * string on LiveState.clock, which is part of the /api/live payload. Client
 * components rendered that string directly, so English match cards showed
 * "المجموعة 3" and "الشوط 2 · 14:18" for tennis and handball. The API string
 * cannot change (public contract), so the same information is now also exposed
 * structurally as clockParts and rendered through clockLabel.
 *
 * Found only by running the app with demo content enabled: the leak needs a
 * non-football match in play, and no such card renders without data.
 */

const CLOCK_CASES: [ClockParts, string, string][] = [
  [{ kind: "status", key: "postponed" }, "مؤجلة", "Postponed"],
  [{ kind: "status", key: "cancelled" }, "ملغاة", "Cancelled"],
  [{ kind: "status", key: "notStarted" }, "لم تبدأ", "Not started"],
  [{ kind: "status", key: "final" }, "نهائي", "Final"],
  [{ kind: "status", key: "finished" }, "انتهت", "Full time"],
  [{ kind: "status", key: "boutEnded" }, "انتهى النزال", "Bout over"],
  [{ kind: "status", key: "halfTime" }, "الاستراحة", "Half-time"],
  [{ kind: "minute", minute: 67 }, "67'", "67'"],
  [{ kind: "stoppage", minute: 2 }, "90+2'", "90+2'"],
  [{ kind: "period", unit: "quarter", index: 3, remaining: "04:12" }, "الربع 3 · 04:12", "Q3 · 04:12"],
  [{ kind: "period", unit: "set", index: 3, remaining: null }, "المجموعة 3", "Set 3"],
  [{ kind: "period", unit: "half", index: 2, remaining: "12:40" }, "الشوط 2 · 12:40", "Half 2 · 12:40"],
  [{ kind: "period", unit: "period", index: 2, remaining: null }, "الفترة 2", "P2"],
  [{ kind: "period", unit: "inning", index: 5, remaining: null }, "الإينينج 5", "Inning 5"],
  [{ kind: "period", unit: "round", index: 4, remaining: null }, "الجولة 4", "Round 4"],
];

test("clockLabel reproduces the legacy Arabic clock string byte-for-byte", () => {
  for (const [parts, ar] of CLOCK_CASES) {
    assert.equal(clockLabel("ar", parts), ar, `arabic clock for ${JSON.stringify(parts)}`);
  }
});

test("clockLabel renders every clock shape in English with no Arabic left", () => {
  for (const [parts, , en] of CLOCK_CASES) {
    const got = clockLabel("en", parts);
    assert.equal(got, en, `english clock for ${JSON.stringify(parts)}`);
    assert.equal(
      /[\u0600-\u06FF]/.test(got),
      false,
      `english clock still has Arabic for ${JSON.stringify(parts)}: ${got}`,
    );
  }
});

test("an unrecognised operator clock value is passed through, not guessed at", () => {
  // Kickoff times and any free-form operator string have no structure to
  // translate. Inventing one would fabricate meaning.
  assert.equal(clockLabel("en", { kind: "raw", value: "21:00" }), "21:00");
  assert.equal(clockLabel("ar", { kind: "raw", value: "21:00" }), "21:00");
  assert.equal(clockLabel("en", { kind: "raw", value: "some custom note" }), "some custom note");
  assert.equal(clockLabel("en", null), "");
});

test("no public component renders the raw Arabic LiveState.clock", () => {
  // clock is the API's Arabic string; clockParts is the translatable form.
  for (const file of [
    "components/match/MatchCard.tsx",
    "components/match/MatchLive.tsx",
    "components/live/ScoreRail.tsx",
  ]) {
    const src = readFileSync(file, "utf8");
    assert.match(src, /clockLabel\(/, `${file} must render the clock through clockLabel`);
    assert.equal(
      /\{\s*(?:s|state|match)\?\.clock\s*\}|\{state\.clock\}/.test(src),
      false,
      `${file} renders the raw Arabic clock string`,
    );
  }
});

/* ── locale-aware entity names & Egyptian-priority surfaces (2026-10-18) ── */

test("competitionDisplayName gives each locale its own name, with honest fallbacks", async () => {
  const { competitionDisplayName } = await import("@/lib/competition-label");
  const ref = { name: "Egyptian Premier League", nameAr: "الدوري المصري الممتاز" };
  assert.equal(competitionDisplayName("en", ref), "Egyptian Premier League");
  assert.equal(competitionDisplayName("ar", ref), "الدوري المصري الممتاز");
  assert.equal(/[؀-ۿ]/.test(competitionDisplayName("en", ref)), false, "the English name has no Arabic left");
  // A record missing one side falls back to the other, never to blank.
  assert.equal(competitionDisplayName("en", { nameAr: "الزمالك" }), "الزمالك");
  assert.equal(competitionDisplayName("ar", { name: "Zamalek" }), "Zamalek");
  // nameEn wins over name on the English side (admin records carry both).
  assert.equal(competitionDisplayName("en", { name: "Name", nameEn: "NameEn", nameAr: "اسم" }), "NameEn");
  assert.equal(competitionDisplayName("en", null, "fallback-id"), "fallback-id");
  assert.equal(competitionDisplayName("en", undefined), "");
});

test("the public catalogue lists the Egyptian Premier League first, losing no entry", async () => {
  const { canonicalCompetitions, canonicalCompetitionsByPriority, EGYPT_CANONICAL_SLUG } = await import(
    "@/lib/competition-catalog"
  );
  assert.equal(canonicalCompetitionsByPriority[0]?.canonicalSlug, EGYPT_CANONICAL_SLUG, "Egypt leads the catalogue");
  assert.deepEqual(
    [...canonicalCompetitionsByPriority].map((c) => c.canonicalSlug).sort(),
    [...canonicalCompetitions].map((c) => c.canonicalSlug).sort(),
    "priority ordering is a permutation — no competition added, removed or renamed",
  );
  const rest = canonicalCompetitionsByPriority.slice(1).map((c) => c.canonicalSlug);
  const originalRest = canonicalCompetitions.filter((c) => c.canonicalSlug !== EGYPT_CANONICAL_SLUG).map((c) => c.canonicalSlug);
  assert.deepEqual(rest, originalRest, "every other competition keeps its existing relative order");
  const featuredBeforeExtras = canonicalCompetitionsByPriority.slice(1);
  const firstNonFeatured = featuredBeforeExtras.findIndex((c) => !c.featured);
  const lastFeatured = featuredBeforeExtras.map((c) => c.featured).lastIndexOf(true);
  assert.ok(firstNonFeatured === -1 || lastFeatured === -1 || firstNonFeatured > lastFeatured, "featured majors still precede the extras");
});

test("the standings surface leads with the verified Egyptian table, then the majors", async () => {
  const { standingsCompetitions } = await import("@/lib/football-data");
  const list = standingsCompetitions();
  assert.equal(list[0]?.slug, "egyptian-premier-league", "the Egyptian Premier League opens /standings");
  assert.equal(list[0]?.code, "EGY");
  assert.equal(list[0]?.name, "Egyptian Premier League");
  assert.equal(list[0]?.nameAr, "الدوري المصري الممتاز");
  const majors = list.slice(1).map((c) => c.code);
  assert.deepEqual(majors, ["PL", "PD", "SA", "BL1", "FL1", "CL"], "the six majors follow in their existing order");
  const slugs = list.map((c) => c.slug ?? c.code);
  assert.equal(new Set(slugs).size, slugs.length, "no competition appears twice on the surface");
});

test("the English provider competition page no longer renders the Arabic name", () => {
  const src = readFileSync(new URL("../views/competition-detail.tsx", import.meta.url), "utf8");
  assert.match(src, /competitionDisplayName\(locale, competition/, "the breadcrumb/H1 name is locale-aware");
  const providerPage = src.slice(src.indexOf("async function ProviderCompetitionPage"));
  assert.equal(
    /\{competition\.nameAr\}/.test(providerPage),
    false,
    "ProviderCompetitionPage still renders competition.nameAr unconditionally",
  );
});

test("admin metadata picks the record's English name on English pages", () => {
  const competition = readFileSync(new URL("../views/competition-detail.tsx", import.meta.url), "utf8");
  const team = readFileSync(new URL("../views/team-detail.tsx", import.meta.url), "utf8");
  assert.match(competition, /entityName\(locale, c\) \|\| c\.nameAr/, "competition metadata is locale-aware with an honest fallback");
  assert.match(team, /entityName\(locale, adminTeam\) \|\| adminTeam\.nameAr/, "team metadata is locale-aware with an honest fallback");
  assert.equal(
    /name: adminTeam\.nameAr \}\)/.test(team),
    false,
    "team metadata still hardcodes the Arabic name",
  );
  assert.match(team, /competitionDisplayName\(locale, match, id\)/, "the provider team page's competition chip is locale-aware");
});

test("the manual-news metadata locale follows the page, never a hardcoded ar_AR", () => {
  const src = readFileSync(new URL("../views/news-detail.tsx", import.meta.url), "utf8");
  assert.equal(/locale: "ar_AR"/.test(src), false, "news-detail still hardcodes the OG locale");
  assert.match(src, /locale: ogLocale\(locale\)/, "the OG locale comes from the site-wide mapping");
  assert.match(src, /manual\.titleEn \|\| manual\.title/, "the English page falls back to the real Arabic title only when titleEn is missing");
});

test("the competitions page renders the priority-ordered catalogue", () => {
  const src = readFileSync(new URL("../views/competitions.tsx", import.meta.url), "utf8");
  assert.match(src, /canonicalCompetitionsByPriority/, "the catalogue page lists Egypt first");
});

test("alias and case redirects keep the visitor's language (EN alias never lands on the Arabic tree)", async () => {
  // Next signals a redirect by throwing; the target travels in the digest.
  const captureTarget = async (run: () => Promise<unknown>): Promise<string> => {
    try {
      await run();
    } catch (error) {
      const e = error as { digest?: string; message?: string };
      return String(e.digest ?? e.message ?? "");
    }
    return "";
  };

  // CompetitionPage returns an async child element; invoking the child the
  // way React would is what actually runs the redirect.
  const competitionView = await import("@/views/competition-detail");
  const runCompetitionPage = async (locale: "ar" | "en", slug: string): Promise<string> => {
    const element = (await competitionView.default({ locale, params: Promise.resolve({ slug }) })) as unknown as {
      type: (props: unknown) => Promise<unknown>;
      props: unknown;
    };
    return captureTarget(() => element.type(element.props));
  };
  const enAlias = await runCompetitionPage("en", "english-premier-league");
  assert.match(enAlias, /\/en\/competitions\/premier-league/, "the EN alias redirects to the EN canonical URL");
  const arAlias = await runCompetitionPage("ar", "english-premier-league");
  assert.match(arAlias, /\/competitions\/premier-league/, "the Arabic alias keeps its unchanged target");
  assert.equal(arAlias.includes("/en/"), false, "the Arabic redirect must not gain an /en prefix");

  const matchView = await import("@/views/match-detail");
  const enUpper = await captureTarget(() =>
    matchView.default({ locale: "en", params: Promise.resolve({ slug: "AL-AHLY-vs-ZAMALEK" }) }) as Promise<unknown>,
  );
  assert.match(enUpper, /\/en\/matches\/al-ahly-vs-zamalek/, "the EN uppercase-slug redirect stays in the EN tree");
  const arUpper = await captureTarget(() =>
    matchView.default({ locale: "ar", params: Promise.resolve({ slug: "AL-AHLY-vs-ZAMALEK" }) }) as Promise<unknown>,
  );
  assert.match(arUpper, /\/matches\/al-ahly-vs-zamalek/, "the Arabic redirect target is unchanged");
  assert.equal(arUpper.includes("/en/"), false);

  // The inbound-alias forward is deep inside the match page (it needs live
  // data), so it is pinned at the source level instead.
  const matchSrc = readFileSync(new URL("../views/match-detail.tsx", import.meta.url), "utf8");
  assert.match(matchSrc, /redirect\(localizePath\(matchPath\(alias\), locale\)\)/, "the inbound-alias redirect is locale-aware");
});
