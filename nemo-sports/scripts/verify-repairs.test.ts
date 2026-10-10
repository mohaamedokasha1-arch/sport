import { upsertOverride } from "@/lib/match-overrides";
import { groupSimilarStories } from "@/lib/news/group";
import type { NewsArticle } from "@/lib/news/types";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { isDateKey, siteDateKey, shiftDateKey } from "@/lib/tz";
import { filterProviderMatches, isFixtureLive } from "@/lib/provider-match-filter";
import { sportsRelevance } from "@/lib/news/relevance";
import { isGoogleNewsWrapper, resolvePublisherUrl } from "@/lib/news/normalize";
import { createSource, listArticles } from "@/lib/news/store";
import { runSource } from "@/lib/news/pipeline";
import { validateMatchQuery } from "@/lib/match-query";
import { createBroadcaster, setBroadcasterStatus, validateBroadcastLink } from "@/lib/broadcasts";
import { createLiveStream, inactiveStreamNote, streamForMatch, streamPhase, updateLiveStream } from "@/lib/match-streams";
import { adminFixtureInScope } from "@/lib/sdl-gateway";
import { CATEGORIES, canonicalCategoryParam, categorizeArticle } from "@/lib/news/categorize";
import { newsCompetitions } from "@/lib/news/entities";
import { parsePreferences, emptyPreferences, favoriteMatch } from "@/lib/preferences";
import { teamSample, headToHead } from "@/lib/scout";
import { foldCalendarLine, matchCalendar } from "@/lib/calendar";
import type { NormalizedFixture } from "@/packages/sdl/src";

if (process.env.DATABASE_URL) throw new Error("Offline regression tests refuse a configured database");
process.env.NEMO_TEST_MEMORY_ONLY = "1";
const fixture = (patch: Partial<NormalizedFixture> = {}): NormalizedFixture => ({
  providerId: "test-match-2026-10-09", sport: "football", competitionProviderId: "test-league", seasonProviderId: "2026", round: null,
  homeProviderId: "a", awayProviderId: "b", homeName: "Test A", awayName: "Test B", scheduledAt: "2026-10-08T22:30:00Z",
  status: "scheduled", homeScore: null, awayScore: null, periods: [], venueProviderId: null, venueName: null, attendance: null, minute: null, ...patch,
});

test("Cairo calendar boundaries use summer and winter IANA offsets", () => {
  assert.equal(siteDateKey("2026-10-08T22:30:00Z"), "2026-10-09");
  assert.equal(siteDateKey("2026-01-08T21:30:00Z"), "2026-01-08");
  assert.equal(siteDateKey("2026-01-08T22:30:00Z"), "2026-01-09");
});
test("date keys reject overflow and navigate leap days", () => {
  assert.equal(isDateKey("2026-02-30"), false); assert.equal(isDateKey("2026-13-01"), false);
  assert.equal(shiftDateKey("2024-02-28", 1), "2024-02-29"); assert.equal(shiftDateKey("2026-01-01", -1), "2025-12-31");
});
test("arbitrary date, team, status and competition filters compose", () => {
  const f = fixture();
  assert.equal(filterProviderMatches([f], { date: "2026-10-09", team: "Test A", status: "upcoming" }).length, 1);
  assert.equal(filterProviderMatches([f], { date: "2026-10-08" }).length, 0);
  assert.equal(filterProviderMatches([f], { date: "all", competition: "other" }).length, 0);
  assert.equal(filterProviderMatches([fixture({ scheduledAt: "bad" })], { date: "today" }).length, 0);
});
test("past kickoff never fabricates live status", () => {
  assert.equal(isFixtureLive(fixture({ scheduledAt: "2000-01-01T00:00:00Z" })), false);
  for (const status of ["postponed", "cancelled", "suspended", "abandoned", "finished"]) assert.equal(isFixtureLive(fixture({ status })), false);
  assert.equal(isFixtureLive(fixture({ status: "penalty_shootout" })), true);
});
test("query validation rejects duplicates, invalid dates, huge keys and unsupported sports", () => {
  for (const q of ["date=2026-02-30", "sport=unknown", "sport=football&sport=tennis", `team=${"a".repeat(161)}`, "status=pretend-live"]) assert.ok(validateMatchQuery(new URLSearchParams(q)));
  assert.equal(validateMatchQuery(new URLSearchParams("date=2026-10-09&sport=football&status=live")), null);
});
test("sports gate excludes geography, business and property headlines", () => {
  for (const title of ["Egypt opens a new real estate development", "الأهلي يطلق مشروع عقاري جديد", "Pyramids property development deal", "The final deal for the European stock market"]) assert.equal(sportsRelevance(title), "reject");
  assert.equal(sportsRelevance("الأهلي يفوز بلقب الدوري المصري لكرة القدم"), "publish");
  assert.equal(sportsRelevance("NBA basketball season begins"), "publish");
  assert.equal(sportsRelevance("The coach comments on the match"), "review");
});
test("Google wrapper recognition is exact and never fetches a redirect", async () => {
  assert.equal(isGoogleNewsWrapper("https://news.google.com/rss/articles/a"), true);
  for (const url of ["https://news.google.com.attacker.test/x", "http://news.google.com/a", "https://news.google.com:8443/a", "https://user:pass@news.google.com/a"]) assert.equal(isGoogleNewsWrapper(url), false);
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("No request permitted"); };
  try { await resolvePublisherUrl("https://news.google.com/rss/articles/a"); assert.equal(calls, 0); } finally { globalThis.fetch = original; }
});
test("ingestion rejects undated/non-sports stories, retains uncertain ones for review, deduplicates", async () => {
  const source = await createSource({ query: "test football", language: "en" });
  const date = new Date().toUTCString();
  const item = (id: string, title: string, dateValue: string) => `<item><title>${title}</title><link>https://example.com/${id}</link>${dateValue ? `<pubDate>${dateValue}</pubDate>` : ""}<source>Test source</source></item>`;
  const xml = `<rss><channel>${item("sport", "Football league match report", date)}${item("property", "Egypt real estate development opens", date)}${item("undated", "Football league announces fixtures", "")}${item("review", "The coach discusses the match", date)}</channel></rss>`;
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(xml, { headers: { "content-type": "application/rss+xml" } });
  try {
    const first = await runSource(source, { force: true }); assert.equal(first.ok, true); assert.equal(first.inserted, 2);
    const all = await listArticles({ sourceId: source.id, includeNonPublished: true });
    assert.equal(all.items.length, 2); assert.equal(all.items.filter((a) => a.status === "hidden").length, 1);
    const published = await listArticles({ sourceId: source.id }); assert.equal(published.items.length, 1);
    assert.equal(published.items[0].publicationDate, new Date(date).toISOString());
    const second = await runSource(source, { force: true }); assert.equal(second.inserted, 0); assert.equal(second.duplicates, 2);
    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    assert.equal((await runSource(source, { force: true })).ok, false);
    assert.equal((await listArticles({ sourceId: source.id })).items.length, 1, "provider failure preserves valid data");
  } finally { globalThis.fetch = original; }
});
test("broadcast link safety rejects credentials, custom ports and non-URL schemes in every policy", () => {
  for (const url of ["https://user:pass@youtube.com/a", "https://youtube.com:444/a", "javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "http://youtube.com/a"]) {
    assert.equal(validateBroadcastLink(url).ok, false, `safety: ${url}`);
    assert.equal(validateBroadcastLink(url, { policy: "allowlist" }).ok, false, `safety (allowlist): ${url}`);
  }
  assert.equal(validateBroadcastLink("https://www.youtube.com/embed/test").ok, true);
});
test("open policy accepts an unlisted host; allowlist policy still rejects lookalikes", () => {
  // Default (open): the operator's own embed host is accepted without being
  // on the reference list — only a non-blocking warning is attached.
  const own = validateBroadcastLink("https://cdn.my-own-rights-holder.example/player/1");
  assert.equal(own.ok, true);
  assert.equal(own.policy, "open");
  assert.ok(own.warning, "unlisted host carries an operator warning");
  // Allowlist mode keeps the old curated behaviour, including suffix lookalikes.
  for (const url of ["https://youtube.com.attacker.test/a", "https://cdn.my-own-rights-holder.example/player/1"]) {
    assert.equal(validateBroadcastLink(url, { policy: "allowlist" }).ok, false, `allowlist: ${url}`);
  }
  assert.equal(validateBroadcastLink("https://sub.youtube.com/embed/test", { policy: "allowlist" }).ok, true);
});
test("private/loopback hosts are never accepted as embeds", () => {
  for (const url of ["https://localhost:443/player", "https://127.0.0.1/x", "https://192.168.1.5/x", "https://stream.internal/x"]) {
    assert.equal(validateBroadcastLink(url).ok, false, url);
  }
});
test("a dated stream cannot leak to rematches or reversed teams", async () => {
  const made = await createLiveStream({ matchSlug: "test-a-vs-b-2026-10-09", homeName: "A", awayName: "B", embedUrl: "https://www.youtube.com/embed/test", status: "published" });
  assert.equal(made.ok, true); if (!made.ok) return;
  assert.equal((await streamForMatch({ slug: "test-a-vs-b-2026-10-09" }))?.id, made.entry.id);
  assert.equal(await streamForMatch({ slug: "test-a-vs-b-2026-10-20", home: "A", away: "B" }), null);
  assert.equal(await streamForMatch({ slug: "test-b-vs-a", home: "B", away: "A" }), null);
  await updateLiveStream(made.entry.id, { status: "disabled" });
  assert.equal(await streamForMatch({ slug: "test-a-vs-b-2026-10-09" }), null);
});
test("broadcast persistence fails closed in production and status is validated", async () => {
  const env = process.env as Record<string, string | undefined>; const old = env.NODE_ENV; env.NODE_ENV = "production";
  try { assert.equal((await upsertOverride("qa-only", { homeScore: 2 })).ok, false); const result = await createBroadcaster({ competitionId: "test", competitionName: "Test", broadcasterName: "Test", broadcastWebsite: "https://www.beinsports.com", verificationSource: "test-only" }); assert.equal(result.ok, false); }
  finally { env.NODE_ENV = old; }
  assert.equal(await setBroadcasterStatus("missing", "bogus" as never), false);
});
test("preferences validate, deduplicate and never cross provider ID namespaces", () => {
  assert.deepEqual(parsePreferences("{bad"), emptyPreferences()); assert.deepEqual(parsePreferences('{"version":2}'), emptyPreferences());
  const prefs = parsePreferences(JSON.stringify({ version: 1, teams: [{ id: "one:a", name: "A" }, { id: "one:a", name: "A" }, { id: 4, name: "bad" }], competitions: [], players: [] }));
  assert.equal(prefs.teams.length, 1); assert.equal(favoriteMatch(fixture(), prefs, "one"), true); assert.equal(favoriteMatch(fixture(), prefs, "two"), false);
});
test("Scout excludes incomplete, negative, duplicate and non-final results", () => {
  const a = fixture({ status: "finished", homeScore: 2, awayScore: 1 });
  const b = fixture({ providerId: "reverse", status: "finished", homeProviderId: "b", awayProviderId: "a", homeScore: 0, awayScore: 0 });
  const data = [a, a, b, fixture({ providerId: "live", status: "live", homeScore: 9, awayScore: 0 }), fixture({ providerId: "invalid", status: "finished", homeScore: -1, awayScore: 0 })];
  const summary = teamSample(data, "a"); assert.equal(summary.played, 2); assert.equal(summary.won, 1); assert.equal(summary.drawn, 1); assert.equal(summary.goalsFor, 2); assert.equal(summary.goalsAgainst, 1);
  assert.equal(teamSample(data, "a", "away").played, 1); assert.equal(headToHead(data, "a", "b").length, 2); assert.equal(headToHead(data, "a", "a").length, 0);
});
test("calendar uses UTC, stable UID, no invented duration and injection-safe folded text", () => {
  const f = fixture({ homeName: "اختبار".repeat(40) + "\r\nBEGIN:VEVENT", venueName: "A;B,C" });
  const ics = matchCalendar(f, "https://example.com", "2026-10-09T00:00:00Z");
  assert.match(ics, /DTSTART:20261008T223000Z/); assert.equal((ics.match(/\r\nBEGIN:VEVENT\r\n/g) ?? []).length, 1);
  assert.ok(!ics.includes("DTEND:")); assert.ok(!ics.includes("VALARM"));
  for (const line of ics.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75);
  assert.equal(foldCalendarLine("a".repeat(76)), "a".repeat(75) + "\r\n a");
});

test("a scheduled match whose kickoff day passed is no longer an upcoming stream", () => {
  const now = new Date("2026-10-10T12:00:00Z"); // Cairo 15:00 on Oct 10
  assert.equal(streamPhase("scheduled", "2026-10-10T09:00:00Z", now), "upcoming", "same site day keeps the player");
  assert.equal(streamPhase("scheduled", "2026-10-09T19:00:00Z", now), "inactive", "a previous site day deactivates the player");
  assert.equal(streamPhase("live", "2026-10-09T19:00:00Z", now), "live", "a live status always wins over the calendar");
  assert.equal(streamPhase("finished", "2026-10-10T09:00:00Z", now), "inactive");
  assert.equal(streamPhase("scheduled", undefined, now), "upcoming", "no kickoff information keeps the stored status");
  assert.equal(streamPhase("scheduled", "not-a-date", now), "upcoming", "an invalid kickoff keeps the stored status");
});

test("admin fixtures stay inside a scoped fixtures query", () => {
  const saudis = fixture({ providerId: "al-fateh-vs-al-ahli", competitionProviderId: "saudi-pro-league", competitionName: "دوري روشن السعودي", scheduledAt: "2026-10-09T14:55:00Z" });
  const dortmund = fixture({ providerId: "borussia-dortmund-vs-werder-bremen", competitionProviderId: "bundesliga", competitionName: "الدوري الألماني", scheduledAt: "2026-10-09T18:30:00Z" });
  const scope = (competitionProviderId?: string, date?: string) => ({ competitionProviderId, date });
  // The Premier League page (SportScore slug) sees neither foreign match …
  assert.equal(adminFixtureInScope(saudis, scope("english-premier-league")), false);
  assert.equal(adminFixtureInScope(dortmund, scope("english-premier-league")), false);
  // … the Saudi page sees its own league by provider slug or canonical slug …
  assert.equal(adminFixtureInScope(saudis, scope("saudi-professional-league")), true);
  assert.equal(adminFixtureInScope(saudis, scope("saudi-pro-league")), true);
  // … the Bundesliga page sees Dortmund only …
  assert.equal(adminFixtureInScope(dortmund, scope("bundesliga")), true);
  assert.equal(adminFixtureInScope(saudis, scope("bundesliga")), false);
  // … and a day filter keeps other days out even inside the right league.
  assert.equal(adminFixtureInScope(saudis, scope("saudi-professional-league", "2026-10-09")), true);
  assert.equal(adminFixtureInScope(saudis, scope("saudi-professional-league", "2026-10-10")), false);
  assert.equal(adminFixtureInScope(saudis, scope("english-premier-league", "2026-10-09")), false, "competition and day must BOTH match");
  // Unscoped queries (admin panel, /matches, sitemap) keep the full merge.
  assert.equal(adminFixtureInScope(saudis, scope()), true);
  assert.equal(adminFixtureInScope(dortmund, scope()), true);
});

test("news category links canonicalize Arabic labels to the stored English name", () => {
  assert.equal(canonicalCategoryParam("انتقالات"), "Transfers");
  assert.equal(canonicalCategoryParam("الانتقالات"), "Transfers");
  assert.equal(canonicalCategoryParam("رياضة"), "Sports");
  assert.equal(canonicalCategoryParam("Sports"), "Sports");
  assert.equal(canonicalCategoryParam("Egyptian Football"), "Egyptian Football");
  assert.equal(canonicalCategoryParam("egyptian football"), "Egyptian Football");
  assert.equal(canonicalCategoryParam("كرة السلة"), "Basketball");
  assert.equal(canonicalCategoryParam("تحليل"), "تحليل", "unknown labels pass through and stay honest-empty");
  assert.equal(canonicalCategoryParam(""), "");
});

test("Newsroom groups similar same-day titles without deleting publisher records", () => {
  const story = { title: "Football league announces new season fixtures", publicationDate: "2026-10-09T08:00:00Z", id: "a", sourceDomain: "publisher-a.test" } as NewsArticle;
  const second = { ...story, id: "b", sourceDomain: "publisher-b.test" };
  const nextDay = { ...story, id: "c", publicationDate: "2026-10-10T08:00:00Z" };
  const unrelated = { ...story, id: "d", title: "Basketball team wins international tournament" };
  const groups = groupSimilarStories([story, second, nextDay, unrelated]);
  assert.equal(groups.length, 3); assert.equal(groups[0].length, 2); assert.equal(groups.flat().length, 4);
});

test("inactive stream notices are clean Arabic for every terminal status", () => {
  // Regression: the walkover/awarded notice shipped with a Latin fragment
  // pasted into the middle of the Arabic sentence ("… لمignation يعُد …"), which
  // visitors read verbatim in place of the player.
  const latin = /[A-Za-z]/;
  for (const status of ["finished", "postponed", "cancelled", "suspended", "abandoned", "walkover", "awarded", "", null, undefined]) {
    const note = inactiveStreamNote(status as string | null | undefined);
    assert.equal(latin.test(note), false, `note for ${String(status)} contains Latin characters: ${note}`);
    assert.ok(note.length > 10, `note for ${String(status)} is too short`);
  }
  assert.match(inactiveStreamNote("walkover"), /انتهت المباراة بقرار رسمي/);
});

test("the footer analysis link resolves to a real pipeline category", () => {
  // Regression: /news?category=تحليل (the footer "تحليلات" link) matched no
  // category at all and rendered a permanently empty feed.
  assert.ok(CATEGORIES.some((category) => category.name === "Analysis"));
  assert.equal(canonicalCategoryParam("تحليلات"), "Analysis");
  assert.equal(canonicalCategoryParam("التحليلات"), "Analysis");
  assert.equal(canonicalCategoryParam("analysis"), "Analysis");
  // A lone analysis signal now lands in Analysis instead of falling through to
  // the generic Sports bucket, while a real report keeps Match Reports.
  assert.equal(categorizeArticle("Tactical analysis of the derby", "").primary, "Analysis");
  assert.equal(categorizeArticle("Match report and highlights", "").primary, "Match Reports");
});

test("every /news competition sidebar link filters a category the store can match", () => {
  // Regression: the sidebar listed offline-preview competition slugs; three of
  // them (saudi-pro-league, bundesliga, ligue-1) have no news entity, so those
  // links always resolved to an empty feed.
  const ids = newsCompetitions().map((competition) => competition.id);
  assert.ok(ids.length > 0);
  for (const dead of ["saudi-pro-league", "bundesliga", "ligue-1", "eredivisie", "primeira-liga"]) {
    assert.equal(ids.includes(dead), false, `${dead} is not a news entity and must not be linked`);
  }
  assert.deepEqual(ids, [...new Set(ids)], "competition ids are unique");
});

test("the /news page actually applies canonicalCategoryParam to the query", () => {
  // Regression: PR #26 added the import to app/news/page.tsx but never used it,
  // so /news?category=انتقالات still queried the store for an article whose
  // category literally equals the Arabic label and returned nothing. An import
  // is not a fix, so assert the call sits in the value the page queries with.
  const page = readFileSync(join(process.cwd(), "app", "news", "page.tsx"), "utf8");
  assert.match(
    page,
    /const category = canonicalCategoryParam\(/,
    "app/news/page.tsx must canonicalize sp.category before it reaches getNewsFeed",
  );
  const feedCall = page.slice(page.indexOf("getNewsFeed("));
  assert.match(feedCall, /category \}/, "the canonical category is what getNewsFeed receives");
});

test("an Arabic category label resolves to a stored article category", async () => {
  const source = await createSource({ query: "arabic category link", language: "en" });
  const date = new Date().toUTCString();
  const xml = `<rss><channel><item><title>Transfer talks: football club agrees a loan deal</title><link>https://example.com/arabic-category</link><pubDate>${date}</pubDate><source>Transfer Desk</source></item></channel></rss>`;
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(xml, { headers: { "content-type": "application/rss+xml" } });
  try {
    const run = await runSource(source, { force: true });
    assert.equal(run.inserted, 1);
    const stored = await listArticles({ sourceId: source.id });
    assert.ok(stored.items.length > 0);
    const canonical = canonicalCategoryParam("انتقالات");
    const viaArabicLabel = await listArticles({ sourceId: source.id, category: canonical });
    assert.equal(viaArabicLabel.items.length, stored.items.length, "the Arabic footer label must select the same rows as the English name");
    const viaRawLabel = await listArticles({ sourceId: source.id, category: "انتقالات" });
    assert.equal(viaRawLabel.items.length, 0, "the raw Arabic label is not what the store stores");
  } finally {
    globalThis.fetch = original;
  }
});

/* ── every public sport's match page must resolve ──────────────────────────
   `/matches/[slug]` used to hard-code `sdlMatchDetail("football", slug)`. The
   list pages link basketball / tennis / cricket too, so every one of those
   links 404'd — 50 of the 158 matches on the production "today" page. The
   page must ask for the sport the fixture actually belongs to. */
test("the match page never hard-codes football as the detail sport", () => {
  const src = readFileSync(join(process.cwd(), "app", "matches", "[slug]", "page.tsx"), "utf8");
  assert.ok(!/sdlMatchDetail\(\s*"football"/.test(src), "match detail must resolve the fixture\'s own sport");
  assert.ok(/sportForMatchId/.test(src), "the page must read the sport off the listed fixture");
});

/* The per-match glyph must follow the fixture's sport, not the page default. */
test("event glyphs follow the sport of the fixture being rendered", () => {
  const src = readFileSync(join(process.cwd(), "app", "matches", "[slug]", "page.tsx"), "utf8");
  assert.ok(/EVENT_GLYPH_BY_SPORT/.test(src), "a football goal glyph must not be shown for a basketball match");
  for (const sport of ["football", "basketball", "tennis", "cricket"]) {
    assert.ok(new RegExp(`${sport}:`).test(src), `no glyph mapped for ${sport}`);
  }
});
