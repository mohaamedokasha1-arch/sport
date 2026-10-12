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
  teamHref,
  teamIdFromHref,
  teamLinkSlug,
  teamLookupKeys,
} from "@/lib/team-lookup";
import { canonicalCompetitions } from "@/lib/competition-catalog";
import { fixtureHasIdentity, isPlaceholderIdentity } from "@/lib/match-identity";
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
