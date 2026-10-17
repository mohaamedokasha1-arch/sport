/**
 * Public link integrity — team hrefs, match identity and the sitemap.
 * ─────────────────────────────────────────────────────────────────────
 * Regression cover for two production defects found by crawling
 * https://nemo-sports.vercel.app on 2026-10-12:
 *
 *   1. `/competitions/egyptian-league` rendered a real 20-row table whose every
 *      team link (`/teams/Al%20Ahly%20FC`) answered 404, because the link was
 *      built from a display name while the team page resolved ids out of the
 *      Football-Data featured leagues only — the Egyptian league is not one of
 *      them.
 *   2. `/sitemap.xml` advertised `/matches/team-4wyrn4h9jwyq86p-vs-
 *      team-dn1m1gh15xlmoep`: a URL for a fixture with no team names.
 *
 * Run: npm run links:test
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  coveredFootballCompetitionIds,
  findTeamRow,
  rowLookupKeys,
  resolveTeamFromTables,
  teamHref,
  teamHasFixtureInWindow,
  teamIdFromHref,
  teamLinkSlug,
  teamLookupKeys,
} from "@/lib/team-lookup";
import { canonicalCompetitions } from "@/lib/competition-catalog";
import { fixtureHasIdentity, isBracketSlotFixture, isBracketSlotName, isPlaceholderIdentity } from "@/lib/match-identity";
import { resolveMatchSlug, sideKeys, slugSides } from "@/lib/match-links";

/* ── 1 · the link builder and the resolver must agree ─────────────────────── */

/** A SportScore Egyptian standings row, in the shape the adapter now produces. */
const ahly = { teamProviderId: "Al Ahly FC", teamName: "Al Ahly FC", teamProviderSlug: "al-ahly-fc", position: 1 };
const pyramids = { teamProviderId: "Pyramids FC", teamName: "Pyramids FC", teamProviderSlug: "pyramids-fc", position: 2 };
/** A row whose provider published no slug (seen live for Bank El Ahly). */
const bank = { teamProviderId: "Bank El Ahly", teamName: "Bank El Ahly", teamProviderSlug: null, position: 13 };
/** A club whose name carries Arabic letters and a hamza. */
const masry = { teamProviderId: "المصري", teamName: "المصري", teamProviderSlug: "al-masry", position: 12 };
const rows = [ahly, pyramids, bank, masry];

test("every rendered team href resolves back to its own row", () => {
  for (const row of rows) {
    const href = teamHref(row);
    assert.ok(href, `a named row must produce a link (${row.teamProviderId})`);
    assert.ok(href.startsWith("/teams/"), `team links stay under /teams: ${href}`);
    const id = teamIdFromHref(href);
    assert.ok(id, "the href carries a resolvable id");
    const found = findTeamRow(rows, id!);
    assert.equal(found, row, `round trip href → id → row failed for ${href}`);
  }
});

test("a slug link resolves, and so does the legacy name form already in the wild", () => {
  // New links (provider slug) and the ones already published/indexed
  // (display name) must BOTH resolve — no redirect dance, no 404 for a URL
  // someone bookmarked last week.
  assert.equal(findTeamRow(rows, "al-ahly-fc"), ahly);
  assert.equal(findTeamRow(rows, "Al Ahly FC"), ahly);
  assert.equal(findTeamRow(rows, "al-ahly-fc")?.position, 1);
});

test("a provider slug from a standings row resolves to that row in a team page lookup", () => {
  assert.deepEqual(
    resolveTeamFromTables(
      [{
        competitionId: "egyptian-premier-league",
        result: { ok: true, data: [pyramids], source: { provider: "sportscore" } },
      }],
      "pyramids-fc",
    ),
    {
      kind: "found",
      tableIndex: 0,
      competitionId: "egyptian-premier-league",
      row: pyramids,
      provider: "sportscore",
    },
  );
});

test("a temporary standings failure is not classified as a nonexistent team", () => {
  assert.deepEqual(
    resolveTeamFromTables(
      [{ competitionId: "egyptian-premier-league", result: { ok: false, error: { code: "unavailable", attempts: [{ provider: "sportscore" }] } } }],
      "pyramids-fc",
    ),
    { kind: "unavailable" },
  );
});

test("missing provider configuration still permits an honest not-found for an unknown slug", () => {
  assert.deepEqual(
    resolveTeamFromTables(
      [{ competitionId: "egyptian-premier-league", result: { ok: false, error: { code: "unavailable", attempts: [] } } }],
      "unknown-team",
    ),
    { kind: "not_found" },
  );
});

test("a confirmed row wins over an unrelated standings outage", () => {
  assert.deepEqual(
    resolveTeamFromTables(
      [
        { competitionId: "premier-league", result: { ok: false, error: { code: "unavailable" } } },
        { competitionId: "egyptian-premier-league", result: { ok: true, data: [pyramids], source: { provider: "sportscore" } } },
      ],
      "pyramids-fc",
    ),
    {
      kind: "found",
      tableIndex: 1,
      competitionId: "egyptian-premier-league",
      row: pyramids,
      provider: "sportscore",
    },
  );
});

test("an unknown team stays not found when no lookup encountered a temporary failure", () => {
  assert.deepEqual(
    resolveTeamFromTables(
      [
        { competitionId: "premier-league", result: { ok: true, data: [ahly], source: { provider: "sportscore" } } },
        { competitionId: "egyptian-premier-league", result: { ok: false, error: { code: "not_found" } } },
      ],
      "unknown-team",
    ),
    { kind: "not_found" },
  );
});

test("an unnamed row renders no link instead of a guaranteed 404", () => {
  assert.equal(teamHref({ teamProviderId: "", teamName: null }), null);
  assert.equal(teamHref({}), null);
  assert.equal(teamLinkSlug({ teamProviderSlug: "  ", teamProviderId: "  " }), null);
});

test("lookup is whole-string, so a short name never steals a longer club", () => {
  // «المصري» matching a different club is exactly how a false positive reached
  // the Egyptian category before; matching stays exact on the normalized form.
  assert.equal(findTeamRow(rows, "المصري"), masry);
  assert.equal(findTeamRow(rows, "الاهلي"), null);
  assert.equal(findTeamRow(rows, "Zamalek SC"), null);
  assert.equal(findTeamRow(rows, ""), null);
});

test("href percent-escapes; the decoder reads it back verbatim", () => {
  const href = teamHref(bank);
  assert.equal(href, `/teams/${encodeURIComponent("Bank El Ahly")}`);
  assert.equal(teamIdFromHref(href), "Bank El Ahly");
  // A malformed percent escape is data, not an exception.
  assert.equal(teamIdFromHref("/teams/100%"), "100%");
  assert.equal(teamIdFromHref("/players/x"), null);
  assert.equal(teamIdFromHref(null), null);
});

test("alias keys cover space/hyphen forms of the same club only", () => {
  assert.deepEqual(new Set(teamLookupKeys("Al-Ahly FC")), new Set(["al ahly fc", "al-ahly-fc"]));
  assert.equal(teamLookupKeys("   ").length, 0);
  assert.ok(rowLookupKeys(ahly).includes("al-ahly-fc"));
});

/* ── 2 · the table set that a team page may search ───────────────────────── */

test("every covered competition is searchable from a team page", () => {
  const ids = coveredFootballCompetitionIds();
  // The Egyptian league is the case that 404s in production: it is in the
  // catalogue, it is not a Football-Data featured league.
  assert.ok(ids.includes("egyptian-premier-league"), "Egypt must be scanned for team lookups");
  for (const competition of canonicalCompetitions) {
    const wanted = competition.providerId || competition.slug || competition.code;
    assert.ok(ids.includes(wanted), `covered list is missing ${wanted}`);
  }
  assert.equal(new Set(ids).size, ids.length, "no competition is scanned twice");
  assert.ok(ids.length >= canonicalCompetitions.length, "the covered list is at least the catalogue");
});

test("featured leagues are scanned first so the common lookup stops early", () => {
  const ids = coveredFootballCompetitionIds();
  const featuredFirst = canonicalCompetitions
    .filter((c) => c.featured)
    .map((c) => c.providerId || c.slug || c.code)
    .filter((id) => ids.includes(id));
  assert.deepEqual(ids.slice(0, featuredFirst.length), featuredFirst, "featured competitions lead the scan");
});

/* ── 3 · match identity (lists, pages and the sitemap share one rule) ───── */

test("a fixture with placeholder sides has no identity", () => {
  const junk = {
    homeProviderId: "team-4wyrn4h9jwyq86p",
    awayProviderId: "team-dn1m1gh15xlmoep",
    homeName: "team-4wyrn4h9jwyq86p",
    awayName: "team-dn1m1gh15xlmoep",
    scheduledAt: "2026-10-12T01:00:00Z",
  };
  assert.equal(isPlaceholderIdentity(junk.homeProviderId), true);
  assert.equal(fixtureHasIdentity(junk), false, "team-<opaque id> is not a readable match");
});

test("a real match keeps its identity; a missing side or time does not", () => {
  const base = { homeName: "Al Ahly FC", awayName: "Zamalek SC", scheduledAt: "2026-10-12T19:00:00Z" };
  assert.equal(fixtureHasIdentity(base), true);
  assert.equal(fixtureHasIdentity({ ...base, awayName: "", awayProviderId: "" }), false);
  assert.equal(fixtureHasIdentity({ ...base, scheduledAt: null }), false);
  assert.equal(fixtureHasIdentity(null), false);
  // A club whose real name merely starts with the word "Team" is kept.
  assert.equal(isPlaceholderIdentity("Team Wellbeing"), false);
  assert.equal(isPlaceholderIdentity("Al Ahly FC"), false);
  assert.equal(isPlaceholderIdentity(null), true);
});

test("a provider opaque id shown as a display name is a placeholder (2026-10-12 production)", () => {
  // Production page: title «Team dn1m1gh15xlmoep ضد Team 4wyrn4h9jwyq86p» was indexable.
  const junk = {
    homeName: "Team dn1m1gh15xlmoep",
    awayName: "Team 4wyrn4h9jwyq86p",
    scheduledAt: "2026-10-12T19:00:00Z",
  };
  assert.equal(isPlaceholderIdentity(junk.homeName), true);
  assert.equal(isPlaceholderIdentity(junk.awayName), true);
  assert.equal(fixtureHasIdentity(junk), false);
  // Real clubs with a "Team" prefix and no opaque digit tail stay readable.
  assert.equal(isPlaceholderIdentity("Team Galaxy"), false);
  assert.equal(isPlaceholderIdentity("Team Stavanger"), false);
  assert.equal(isPlaceholderIdentity("Team Galaxy 2"), false);
});

/* ── 3b · bracket slots are kept out of the index, real names are not ────── */

test("unresolved bracket slots are flagged for SEO (sitemap + noindex)", () => {
  // Both live production cases from the 2026-10-12 crawl.
  const pearl = { homeName: "1st Place Team", awayName: "2nd Place Team", scheduledAt: "2026-10-12T18:00:00Z" };
  const atp = { homeName: "R32P27", awayName: "R32P28", scheduledAt: "2026-10-12T10:00:00Z" };
  assert.equal(isBracketSlotFixture(pearl), true);
  assert.equal(isBracketSlotFixture(atp), true);
  assert.equal(isBracketSlotName("3rd-place-team"), true, "hyphenated slug form");
  assert.equal(isBracketSlotName("Winner of Match 12"), true);
  assert.equal(isBracketSlotName("TBD"), true);
  assert.equal(isBracketSlotName("W1"), true);
  assert.equal(isBracketSlotFixture({ homeName: "Al Ahly FC", awayName: "1st Place Team" }), true, "one side is enough");
});

test("real clubs and players are never flagged as bracket slots", () => {
  for (const name of [
    "Al Ahly FC",
    "Winners FC",
    "Winnipeg Stars",
    "Team Wellbeing",
    "Real Madrid",
    "Lens",
    "Ajax II",
    "Al Nassr",
    "Olimpico LDD",
    "Wolves",
  ]) {
    assert.equal(isBracketSlotName(name), false, `${name} must not be treated as a bracket slot`);
  }
  assert.equal(isBracketSlotName(null), false);
  assert.equal(isBracketSlotFixture(null), false);
  // The identity rule that the live board and the streams depend on is unchanged.
  assert.equal(fixtureHasIdentity({ homeName: "1st Place Team", awayName: "2nd Place Team", scheduledAt: "2026-10-12T18:00:00Z" }), true);
});

/* ── 3c · a team with no fixture in the window is a thin page (noindex) ──── */

test("a team counts as having match content only when a fixture names it", () => {
  const window = [
    { homeProviderId: "manchester-city", awayProviderId: "arsenal" },
    { homeProviderId: "chelsea", awayProviderId: "everton" },
  ];
  assert.equal(teamHasFixtureInWindow(window, "arsenal"), true, "away side counts");
  assert.equal(teamHasFixtureInWindow(window, "chelsea"), true, "home side counts");
  // UDIB appears in the table but not in the fixture window → thin, noindex.
  assert.equal(teamHasFixtureInWindow(window, "udib"), false);
  assert.equal(teamHasFixtureInWindow([], "udib"), false, "an empty window is thin");
  // Exact id match only: a prefix never counts as the same club.
  assert.equal(teamHasFixtureInWindow(window, "manchester"), false);
});

/* ── 4 · inbound partner links resolve to the canonical page ──────────────── */

/** The live case from the match gate on 2026-10-12, verbatim. */
const FEED = [
  { providerId: "flamengo-vs-santos-fc", homeName: "Flamengo", awayName: "Santos FC" },
  { providerId: "gremio-vs-corinthians", homeName: "Gremino", awayName: "Corinthians" },
  { providerId: "al-ahly-fc-vs-zamalek-sc", homeName: "Al Ahly FC", awayName: "Zamalek SC" },
];

test("a gate slug that differs only by a club suffix lands on the real page", () => {
  assert.equal(resolveMatchSlug("flamengo-vs-santos", FEED)?.providerId, "flamengo-vs-santos-fc");
  assert.equal(slugSides("flamengo-vs-santos")?.join("|"), "flamengo|santos");
});

test("side order never matters, and an unknown tie stays a 404", () => {
  assert.equal(resolveMatchSlug("santos-vs-flamengo", FEED)?.providerId, "flamengo-vs-santos-fc");
  assert.equal(resolveMatchSlug("al-ahly-vs-zamalek", FEED)?.providerId, "al-ahly-fc-vs-zamalek-sc");
  assert.equal(resolveMatchSlug("real-madrid-vs-barcelona", FEED), null);
  assert.equal(resolveMatchSlug("no-team-here", FEED), null);
});

test("an ambiguous tie is not resolved by guessing", () => {
  const dup = [...FEED, { providerId: "flamengo-vs-santos-u20", homeName: "Flamengo", awayName: "Santos" }];
  assert.equal(resolveMatchSlug("flamengo-vs-santos", dup), null);
});

test("a canonical slug does not redirect to itself", () => {
  assert.equal(resolveMatchSlug("flamengo-vs-santos-fc", FEED), null);
});

test("club suffixes are comparable but never invented", () => {
  assert.deepEqual(sideKeys("Santos FC"), ["santos-fc", "santos"]);
  assert.deepEqual(sideKeys("Al Ahly FC"), ["al-ahly-fc", "al-ahly"]);
  assert.deepEqual(sideKeys("Bayern"), ["bayern"]);
  assert.deepEqual(sideKeys(null), []);
});
