import test from "node:test";
import assert from "node:assert/strict";

/**
 * Competition CATALOG discovery — adapter contract tests.
 * ───────────────────────────────────────────────────────
 * These pin the behaviour the automatic competition sync depends on, using
 * injected fetch and doc-shaped payloads. The distinction they guard is the one
 * that keeps the platform honest: a provider that cannot enumerate a catalog
 * must say `not_supported`, and a provider that answers with nothing must say
 * "empty" — because those two facts need opposite reactions.
 */

import { TheSportsDbAdapter } from "../src/adapters/thesportsdb";
import { FootballDataAdapter } from "../src/adapters/football-data";
import { SportScoreAdapter } from "../src/adapters/sportscore";
import { DemoAdapter } from "../src/adapters/demo";

type Route = { match: (url: URL) => boolean; status?: number; body: unknown; headers?: Record<string, string> };

function fakeFetch(routes: Route[], calls: string[] = []): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    const route = routes.find((r) => r.match(url));
    if (!route) {
      return new Response(JSON.stringify({ error: "no route for " + url.pathname }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { "content-type": "application/json", ...(route.headers ?? {}) },
    });
  }) as typeof fetch;
}

/** Every capability except `listed` must leave an adapter as null, never false. */
function assertUnverifiedCapabilities(caps: Record<string, unknown>) {
  assert.equal(caps.listed, true, "a catalog row is by definition listed");
  for (const key of ["fixtures", "live", "results", "standings", "teams", "players"]) {
    assert.equal(caps[key], null, `${key} must be null (unverified), not false — a listing proves nothing about coverage`);
  }
}

/* ── TheSportsDB: the multi-sport catalog ──────────────────── */

test("thesportsdb getCompetitions maps a doc-shaped league listing", async () => {
  const calls: string[] = [];
  const adapter = new TheSportsDbAdapter({
    apiKey: "test-key",
    fetchImpl: fakeFetch(
      [
        {
          match: (u) => u.pathname.endsWith("search_all_leagues.php"),
          body: {
            leagues: [
              { idLeague: "4328", strLeague: "English Premier League", strLeagueAlternate: "EPL", strSport: "Soccer", strCountry: "England", strBadge: "https://cdn/4328.png" },
              { idLeague: "4387", strLeague: "NBA", strSport: "Basketball", strCountry: "USA" },
            ],
          },
        },
      ],
      calls,
    ),
  });

  const res = await adapter.getCompetitions({ sport: "football" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.data.length, 2);

  const [epl, nba] = res.data;
  assert.equal(epl.providerId, "4328");
  assert.equal(epl.name, "English Premier League");
  assert.equal(epl.shortName, "EPL");
  assert.equal(epl.countryName, "England");
  assert.equal(epl.logoUrl, "https://cdn/4328.png");
  assertUnverifiedCapabilities(epl.capabilities);

  // The adapter lowercases the provider's own sport vocabulary rather than
  // inventing NEMO's, so the sync layer decides the mapping.
  assert.equal(nba.sport, "basketball");
  assert.equal(nba.logoUrl, null, "a league with no artwork must not get a fabricated logo");

  // `football` is translated to the provider's own word for it.
  assert.ok(calls[0].includes("s=Soccer"), `expected the provider's sport vocabulary, got ${calls[0]}`);
});

test("thesportsdb refuses an unfiltered listing instead of reporting an empty catalog", async () => {
  const adapter = new TheSportsDbAdapter({ apiKey: "test-key", fetchImpl: fakeFetch([]) });
  const res = await adapter.getCompetitions({});
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.error.code, "not_supported");
  assert.match(res.error.message, /sport|country/);
});

test("thesportsdb treats a null league array as an empty catalog, not a failure", async () => {
  const adapter = new TheSportsDbAdapter({
    apiKey: "test-key",
    fetchImpl: fakeFetch([{ match: (u) => u.pathname.endsWith("search_all_leagues.php"), body: { leagues: null } }]),
  });
  const res = await adapter.getCompetitions({ country: "Egypt" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.data, [], "the provider's null/[] interchangeability must not become an error");
});

test("thesportsdb drops catalog rows without a stable id or a name", async () => {
  const adapter = new TheSportsDbAdapter({
    apiKey: "test-key",
    fetchImpl: fakeFetch([
      {
        match: (u) => u.pathname.endsWith("search_all_leagues.php"),
        body: {
          leagues: [
            { idLeague: "", strLeague: "No id", strSport: "Soccer" },
            { idLeague: "1", strLeague: "", strSport: "Soccer" },
            { idLeague: "4328", strLeague: "English Premier League", strSport: "Soccer" },
          ],
        },
      },
    ]),
  });
  const res = await adapter.getCompetitions({ sport: "football" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.data.length, 1, "an unmappable row must be dropped, not stored half-formed");
  assert.equal(res.data[0].providerId, "4328");
});

test("thesportsdb surfaces a rate limit as a typed failure, not an empty list", async () => {
  const adapter = new TheSportsDbAdapter({
    apiKey: "test-key",
    retries: 0,
    fetchImpl: fakeFetch([{ match: () => true, status: 429, body: { error: "rate limited" } }]),
  });
  const res = await adapter.getCompetitions({ sport: "football" });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.error.code, "rate_limited");
  assert.equal(res.error.httpStatus, 429);
});

/* ── Football-Data.org: the authoritative football catalog ─── */

const fdCatalog = {
  count: 3,
  competitions: [
    { id: 2021, code: "PL", name: "Premier League", type: "LEAGUE", emblem: "https://cdn/pl.png", area: { name: "England", code: "ENG" } },
    { id: 2146, code: "BSA", name: "Campeonato Brasileiro Série A", type: "LEAGUE", emblem: null, area: { name: "Brazil", code: "BRA" } },
    // A row the free tier can list but that carries no usable identity.
    { id: 2999, code: null, name: null, type: "CUP", area: null },
  ],
};

test("football-data getCompetitions returns the codes the key can actually serve", async () => {
  const adapter = new FootballDataAdapter({
    apiKey: "test",
    fetchImpl: fakeFetch([{ match: (u) => u.pathname.endsWith("/competitions"), body: fdCatalog }]),
  });
  const res = await adapter.getCompetitions({});
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.data.length, 2, "the identity-less row must be dropped");
  assert.equal(res.data[0].providerId, "PL");
  assert.equal(res.data[0].name, "Premier League");
  assert.equal(res.data[0].countryCode, "ENG");
  assert.equal(res.data[0].sport, "football");
  assertUnverifiedCapabilities(res.data[0].capabilities);
  assert.equal(res.data[1].logoUrl, null);
});

test("football-data answers an empty list for a sport it does not cover", async () => {
  const adapter = new FootballDataAdapter({ apiKey: "test", fetchImpl: fakeFetch([]) });
  const res = await adapter.getCompetitions({ sport: "basketball" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.data, [], "football-data.org is football-only; asking for basketball is not a provider error");
});

test("football-data filters the catalog by country", async () => {
  const adapter = new FootballDataAdapter({
    apiKey: "test",
    fetchImpl: fakeFetch([{ match: (u) => u.pathname.endsWith("/competitions"), body: fdCatalog }]),
  });
  const res = await adapter.getCompetitions({ sport: "football", country: "Brazil" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.data.length, 1);
  assert.equal(res.data[0].providerId, "BSA");
});

test("football-data propagates an auth failure instead of returning an empty catalog", async () => {
  const adapter = new FootballDataAdapter({
    apiKey: "bad",
    retries: 0,
    fetchImpl: fakeFetch([{ match: () => true, status: 403, body: { message: "The token you provided is invalid", errorCode: 403 } }]),
  });
  const res = await adapter.getCompetitions({});
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.error.code, "auth");
});

/* ── the primary provider cannot enumerate ─────────────────── */

test("sportscore reports not_supported for catalog discovery", async () => {
  // SportScore's documented widget API has no competition-listing route. The
  // adapter must say so, so the sync layer asks a different provider rather
  // than reading "no competitions" from the platform's primary live source.
  const adapter = new SportScoreAdapter({ fetchImpl: fakeFetch([]) });
  const res = await adapter.getCompetitions({ sport: "football" });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.error.code, "not_supported");
  assert.equal(adapter.capabilities.includes("competitions"), false);
});

test("demo adapter does not claim catalog discovery either", async () => {
  const adapter = new DemoAdapter();
  const res = await adapter.getCompetitions({ sport: "football" });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.error.code, "not_supported", "a demo catalog must never be mistaken for a discovered one");
});

/* ── capability declaration ────────────────────────────────── */

test("only the two providers with a documented listing endpoint declare it", async () => {
  const declaring = [new FootballDataAdapter({ apiKey: "t" }), new TheSportsDbAdapter({ apiKey: "t" })];
  for (const a of declaring) assert.equal(a.capabilities.includes("competitions"), true, `${a.name} should declare catalog discovery`);

  const silent = [new SportScoreAdapter(), new DemoAdapter()];
  for (const a of silent) assert.equal(a.capabilities.includes("competitions"), false, `${a.name} must not declare catalog discovery`);
});
