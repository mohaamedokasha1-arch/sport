import test from "node:test";
import assert from "node:assert/strict";

/**
 * Adapter tests run against canned payloads shaped exactly as each provider's
 * documentation describes, with an injected fetch. They verify the contract the
 * rest of the platform depends on: provider payloads never escape the adapter.
 */

import { ApiFootballAdapter, AF_STATUS } from "../src/adapters/api-football";
import { SportmonksAdapter, SM_STATUS, EVENT_TYPE_ID } from "../src/adapters/sportmonks";
import { SportradarAdapter, SR_STATUS } from "../src/adapters/sportradar";
import { TheSportsDbAdapter } from "../src/adapters/thesportsdb";

type Route = { match: (url: URL) => boolean; status?: number; body: unknown; headers?: Record<string, string> };

function fakeFetch(routes: Route[], calls: string[] = []): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    const route = routes.find((r) => r.match(url));
    if (!route) {
      return new Response(JSON.stringify({ error: "no route for " + url.pathname }), { status: 404, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify(route.body), { status: route.status ?? 200, headers: { "content-type": "application/json", ...(route.headers ?? {}) } });
  }) as typeof fetch;
}

/* ── API-Football ──────────────────────────────────────────── */

const afFixtureEnvelope = {
  get: "fixtures",
  parameters: { id: "12345" },
  errors: [],
  results: 1,
  paging: { current: 1, total: 1 },
  response: [
    {
      fixture: {
        id: 12345,
        referee: "M. Oliver",
        timezone: "UTC",
        date: "2026-04-10T18:00:00+00:00",
        timestamp: 1775930400,
        periods: { first: 1775930400, second: null },
        venue: { id: 556, name: "Cairo International Stadium", city: "Cairo" },
        status: { long: "First Half", short: "1H", elapsed: 34, extra: null },
      },
      league: { id: 1440, name: "Egyptian Premier League", country: "Egypt", logo: "https://cdn/1440.png", season: 2026, round: "Regular Season - 18" },
      teams: {
        home: { id: 1063, name: "Al Ahly", logo: "https://cdn/1063.png", winner: null },
        away: { id: 1064, name: "Zamalek", logo: "https://cdn/1064.png", winner: null },
      },
      goals: { home: 1, away: 0 },
      score: {
        halftime: { home: 0, away: 0 },
        fulltime: { home: null, away: null },
        extratime: { home: null, away: null },
        penalty: { home: null, away: null },
      },
    },
  ],
};

test("api-football: fixture envelope is normalized into canonical fixture fields", async () => {
  const adapter = new ApiFootballAdapter({ apiKey: "test", fetchImpl: fakeFetch([{ match: (u) => u.pathname === "/fixtures", body: afFixtureEnvelope }]) });
  const res = await adapter.getMatchDetail({ providerMatchId: "12345" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const f = res.data;
  assert.equal(f.providerId, "12345");
  assert.equal(f.sport, "football");
  assert.equal(f.competitionProviderId, "1440");
  assert.equal(f.seasonProviderId, "2026");
  assert.equal(f.homeProviderId, "1063");
  assert.equal(f.awayProviderId, "1064");
  assert.equal(f.status, "live", "1H maps to live");
  assert.equal(f.homeScore, 1);
  assert.equal(f.minute, 34);
  assert.equal(f.scheduledAt, "2026-04-10T18:00:00.000Z", "kickoff is normalized to UTC ISO");
  assert.equal(f.venueName, "Cairo International Stadium");
  assert.equal(res.provider, "api_football");
  assert.match(res.requestKey, /^sdl:provider:api_football:/);
});

test("api-football: HTTP 200 with an errors array is a failure, not data", async () => {
  const adapter = new ApiFootballAdapter({ apiKey: "test", fetchImpl: fakeFetch([{ match: () => true, body: { get: "fixtures", errors: ["You have reached the request limit for the day"], results: 0, response: [] } }]) });
  const res = await adapter.getLiveMatches({ sport: "football" });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.error.code, "rate_limited", "quota messages must be classified as rate limiting so failover kicks in");
  assert.match(res.error.message, /request limit/);
});

test("api-football: 429 and 401 map to typed errors", async () => {
  const limited = new ApiFootballAdapter({ apiKey: "test", fetchImpl: fakeFetch([{ match: () => true, status: 429, body: {}, headers: { "retry-after": "42" } }]) });
  const a = await limited.getLiveMatches({ sport: "football" });
  assert.equal(a.ok, false);
  if (!a.ok) {
    assert.equal(a.error.code, "rate_limited");
    assert.equal(a.error.retryAfterSeconds, 42);
  }

  const unauthorized = new ApiFootballAdapter({ apiKey: "bad", fetchImpl: fakeFetch([{ match: () => true, status: 401, body: {} }]) });
  const b = await unauthorized.getLiveMatches({ sport: "football" });
  assert.equal(b.ok, false);
  if (!b.ok) assert.equal(b.error.code, "auth");
});

test("api-football: events, standings and status maps are canonical", async () => {
  const adapter = new ApiFootballAdapter({
    apiKey: "test",
    fetchImpl: fakeFetch([
      {
        match: (u) => u.pathname === "/fixtures/events",
        body: {
          results: 2,
          response: [
            { time: { elapsed: 23, extra: 2 }, team: { id: 1063, name: "Al Ahly" }, player: { id: 900, name: "M. Sherif" }, assist: { id: 901, name: "A. Maaloul" }, type: "Goal", detail: "Normal Goal", comments: null },
            { time: { elapsed: 55, extra: null }, team: { id: 1064, name: "Zamalek" }, player: { id: 910, name: "S. Jaziri" }, assist: { id: null, name: null }, type: "Card", detail: "Yellow Card", comments: "tactical foul" },
          ],
        },
      },
      {
        match: (u) => u.pathname === "/standings",
        body: {
          results: 1,
          response: [
            {
              league: {
                standings: [
                  [
                    { rank: 1, team: { id: 1063, name: "Al Ahly" }, group: "Regular Season", form: "WWDLW", all: { played: 18, win: 14, draw: 3, lose: 1, goals: { for: 40, against: 11 } }, goalsDiff: 29, points: 45, description: "Promotion - Champions League" },
                    { rank: 17, team: { id: 1099, name: "Baladiyet" }, group: "Regular Season", form: null, all: { played: 18, win: 2, draw: 4, lose: 12, goals: { for: 12, against: 38 } }, goalsDiff: -26, points: 10, description: "Relegation - Division 2" },
                  ],
                ],
              },
            },
          ],
        },
      },
    ]),
  });

  const events = await adapter.getMatchEvents({ providerMatchId: "12345" });
  assert.equal(events.ok, true);
  if (events.ok) {
    assert.equal(events.data[0].type, "goal");
    assert.equal(events.data[0].minute, 23);
    assert.equal(events.data[0].additionalMinute, 2);
    assert.equal(events.data[0].secondaryPlayerProviderId, "901");
    assert.equal(events.data[1].type, "yellow_card");
  }

  const standings = await adapter.getStandings({ providerCompetitionId: "1440", season: "2026" });
  assert.equal(standings.ok, true);
  if (standings.ok) {
    assert.equal(standings.data.length, 2);
    assert.equal(standings.data[0].teamProviderId, "1063");
    assert.deepEqual(standings.data[0].form, ["W", "W", "D", "L", "W"]);
    assert.equal(standings.data[0].status, "promotion");
    assert.equal(standings.data[1].status, "relegation");
  }

  assert.equal(AF_STATUS["HT"], "halftime");
  assert.equal(AF_STATUS["PEN"], "finished");
  assert.equal(AF_STATUS["PST"], "postponed");
});

/* ── Sportmonks ────────────────────────────────────────────── */

const smFixture = (id: number) => ({
  id,
  sport_id: 1,
  league_id: 8,
  season_id: 24614,
  stage_id: 1,
  group_id: null,
  round: "18",
  starting_at: { date_time: "2026-04-10 18:00:00", date: "2026-04-10" },
  attendance: 74000,
  venue_id: 203,
  venue: { name: "Cairo International Stadium" },
  status_id: 5,
  status: { name: "LIVE" },
  participants: [
    { id: 501, type: "home", participant: { id: 19, name: "Al Ahly" }, scores: [{ id: 1, type: "total", score: { goals: 1, overall: 1 } }] },
    { id: 502, type: "away", participant: { id: 32, name: "Zamalek" }, scores: [{ id: 2, type: "total", score: { goals: 0, overall: 0 } }] },
  ],
  scores: [
    { id: 1, participant_id: 19, type: { name: "Total" }, score: { goals: 1, overall: 1 } },
    { id: 2, participant_id: 32, type: { name: "Total" }, score: { goals: 0, overall: 0 } },
  ],
});

test("sportmonks: composed includes map to canonical fixtures", async () => {
  const calls: string[] = [];
  const adapter = new SportmonksAdapter({ apiToken: "t", fetchImpl: fakeFetch([{ match: (u) => u.pathname.includes("/fixtures/"), body: { data: [smFixture(9001)], pagination: { has_more: false, next_page: null, total: 1, count: 1, per_page: 25, current_page: 1, total_pages: 1 } } }], calls) });
  const res = await adapter.getMatchDetail({ providerMatchId: "9001" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const f = res.data;
  assert.equal(f.providerId, "9001");
  assert.equal(f.competitionProviderId, "8");
  assert.equal(f.seasonProviderId, "24614");
  assert.equal(f.homeProviderId, "19");
  assert.equal(f.awayProviderId, "32");
  assert.equal(f.homeScore, 1);
  assert.equal(f.awayScore, 0);
  assert.equal(f.status, "live", "status_id 5 maps to live");
  assert.equal(f.attendance, 74000);
  assert.equal(SM_STATUS[12], "halftime");
  assert.equal(SM_STATUS[15], "penalty_shootout");
});

test("sportmonks: pagination follows next_page while has_more is true, then stops", async () => {
  const calls: string[] = [];
  const adapter = new SportmonksAdapter({
    apiToken: "t",
    fetchImpl: fakeFetch(
      [
        { match: (u) => u.searchParams.get("page") === "1", body: { data: [smFixture(1)], pagination: { has_more: true, next_page: "https://api.sportmonks.com/v3/football/fixtures/date/2026-04-10?page=2", total: 2, count: 1, per_page: 1, current_page: 1, total_pages: 2 } } },
        { match: (u) => u.searchParams.get("page") === "2", body: { data: [smFixture(2)], pagination: { has_more: false, next_page: null, total: 2, count: 1, per_page: 1, current_page: 2, total_pages: 2 } } },
      ],
      calls,
    ),
  });
  const res = await adapter.getFixtures({ sport: "football", date: "2026-04-10" });
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.data.length, 2);
  assert.equal(calls.length, 2, "exactly two billable pages");
  assert.match(calls[0], /include=participants/, "field selection must be part of the request");
});

test("sportmonks: event type ids map to canonical event types", async () => {
  const adapter = new SportmonksAdapter({
    apiToken: "t",
    fetchImpl: fakeFetch([
      {
        match: (u) => u.pathname.endsWith("/events"),
        body: {
          data: [
            { id: 1, fixture_id: 9001, type_id: 14, team_id: 19, player_id: 275, related_player_id: null, minute: 23, extra_minute: null, order: 1 },
            { id: 2, fixture_id: 9001, type_id: 18, team_id: 32, player_id: 276, related_player_id: null, minute: 40, extra_minute: 3, order: 2 },
            { id: 3, fixture_id: 9001, type_id: 24, team_id: 19, player_id: 277, related_player_id: 278, minute: 61, extra_minute: null, order: 3 },
          ],
          pagination: { has_more: false, next_page: null, total: 3, count: 3, per_page: 100, current_page: 1, total_pages: 1 },
        },
      },
    ]),
  });
  const res = await adapter.getMatchEvents({ providerMatchId: "9001" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(
    res.data.map((e) => e.type),
    ["goal", "own_goal", "substitution"],
  );
  assert.equal(res.data[1].additionalMinute, 3);
  assert.equal(res.data[2].secondaryPlayerProviderId, "278");
  assert.equal(EVENT_TYPE_ID[19], "yellow_card");
});

test("sportmonks: live polling uses the documented livescores feeds", async () => {
  const calls: string[] = [];
  const adapter = new SportmonksAdapter({
    apiToken: "t",
    fetchImpl: fakeFetch([{ match: (u) => u.pathname.includes("/livescores/inplay"), body: { data: [smFixture(77)], pagination: { has_more: false } } }], calls),
  });
  const res = await adapter.getLiveMatches({ sport: "football" });
  assert.equal(res.ok, true);
  assert.equal(calls.length, 1, "one request for the whole platform, not one per match");
  assert.match(calls[0], /\/livescores\/inplay/, "must hit the documented inplay feed");
  assert.match(calls[0], /include=participants/, "and request only the fields it needs");
  if (res.ok) assert.equal(res.data[0].providerId, "77");

  // when /inplay is unavailable the adapter degrades to the day feed
  const calls2: string[] = [];
  const fallbackAdapter = new SportmonksAdapter({
    apiToken: "t",
    fetchImpl: fakeFetch([{ match: (u) => u.pathname.endsWith("/livescores"), body: { data: [smFixture(78)], pagination: { has_more: false } } }], calls2),
  });
  const res2 = await fallbackAdapter.getLiveMatches({ sport: "football" });
  assert.equal(res2.ok, true);
  assert.ok(calls2.some((c) => c.includes("/livescores/inplay")), "inplay is tried first");
  assert.ok(calls2.some((c) => c.endsWith("/livescores") || c.includes("/livescores?")), "then falls back to the day feed");
  if (res2.ok) assert.equal(res2.data[0].providerId, "78");
});

test("sportmonks: bearer auth header is sent", async () => {
  const seen: string[] = [];
  const adapter = new SportmonksAdapter({
    apiToken: "secret-token",
    fetchImpl: ((_input: string | URL | Request, init?: RequestInit) => {
      seen.push(String((init?.headers as Record<string, string>)?.authorization ?? ""));
      return Promise.resolve(new Response(JSON.stringify({ data: [], pagination: { has_more: false } }), { status: 200 }));
    }) as typeof fetch,
  });
  await adapter.getFixtures({ sport: "football", date: "2026-04-10" });
  assert.deepEqual(seen, ["Bearer secret-token"]);
});

/* ── Sportradar ────────────────────────────────────────────── */

const srLiveFeed = {
  generated_at: "2026-04-10T18:40:00Z",
  schemas: [],
  sport_events: [
    {
      id: "sr:sport_event:41762841",
      start_time: "2026-04-10T18:00:00+00:00",
      status: "live",
      match_time: "67",
      week: 24,
      venue: { id: "sr:venue:1234", name: "Anfield", city_name: "Liverpool", country_name: "England", capacity: 61000 },
      competitors: [
        { id: "sr:competitor:44", name: "Liverpool", abbreviation: "LIV", qualifier: "home", country: "England", country_code: "ENG" },
        { id: "sr:competitor:45", name: "Manchester City", abbreviation: "MCI", qualifier: "away", country: "England", country_code: "ENG" },
      ],
      sport_event_status: { status: "live", match_status: "2nd_half", home_score: 2, away_score: 1, period_scores: [{ number: 1, home_score: 1, away_score: 1 }], attendance: 61000 },
      tournament: { id: "sr:tournament:17", name: "Premier League" },
      tournament_round: { type: "cup", name: "Matchday 24", number: 24 },
      season: { id: "sr:season:105353", name: "Premier League 25/26", year: "2026" },
    },
  ],
};

test("sportradar: live schedule feed becomes canonical fixtures with prefixed ids intact", async () => {
  const adapter = new SportradarAdapter({ apiKey: "k", access: "production", fetchImpl: fakeFetch([{ match: (u) => u.pathname.endsWith("schedules/live/schedules.json"), body: srLiveFeed }]) });
  const res = await adapter.getLiveMatches({ sport: "football" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const f = res.data[0];
  assert.equal(f.providerId, "sr:sport_event:41762841");
  assert.equal(f.competitionProviderId, "sr:tournament:17");
  assert.equal(f.seasonProviderId, "sr:season:105353");
  assert.equal(f.homeProviderId, "sr:competitor:44");
  assert.equal(f.awayProviderId, "sr:competitor:45");
  assert.equal(f.status, "live");
  assert.equal(f.homeScore, 2);
  assert.equal(f.awayScore, 1);
  assert.equal(f.minute, 67);
  assert.equal(f.attendance, 61000);
  assert.deepEqual(f.periods, [{ label: "P1", home: 1, away: 1 }]);
  assert.equal(SR_STATUS["halftime_break"], "halftime");
  assert.equal(SR_STATUS["closed"], "finished");
});

test("sportradar: a date range is capped so one request cannot fan out unbounded", async () => {
  const calls: string[] = [];
  const adapter = new SportradarAdapter({ apiKey: "k", fetchImpl: fakeFetch([{ match: () => true, body: { sport_events: [] } }], calls) });
  await adapter.getFixtures({ sport: "football", range: { from: "2026-04-01", to: "2026-04-30" } });
  assert.equal(calls.length, 14, "each day is a billable feed, so the window is capped");
});

test("sportradar: summary timeline and statistics are normalized", async () => {
  const adapter = new SportradarAdapter({
    apiKey: "k",
    fetchImpl: fakeFetch([
      {
        match: (u) => u.pathname.endsWith("summary.json"),
        body: {
          event_timeline: {
            timeline: [
              { id: 1, type: "goal", match_time: "23", team: "sr:competitor:44", player: { id: "sr:player:1", name: "M. Salah" } },
              { id: 2, type: "yellow_card", match_time: "55", team: "sr:competitor:45", player: { id: "sr:player:2", name: "R. Dias" } },
              { id: 3, type: "substitution", match_time: "70", team: "sr:competitor:44" },
            ],
          },
          statistics: { totals: { competitors: [{ id: "sr:competitor:44", statistics: { Shots: 14, "Shots on Target": 6, Possession: 52 } }] } },
        },
      },
    ]),
  });
  const events = await adapter.getMatchEvents({ providerMatchId: "sr:sport_event:1" });
  assert.equal(events.ok, true);
  if (events.ok) assert.deepEqual(events.data.map((e) => e.type), ["goal", "yellow_card", "substitution"]);

  const stats = await adapter.getMatchStats({ providerMatchId: "sr:sport_event:1" });
  assert.equal(stats.ok, true);
  if (stats.ok) {
    assert.equal(stats.data.length, 3);
    assert.equal(stats.data[1].type, "shots_on_target");
    assert.equal(stats.data[0].period, "total");
  }
});

/* ── TheSportsDB ───────────────────────────────────────────── */

test("thesportsdb: artwork comes with attribution and never without it", async () => {
  const adapter = new TheSportsDbAdapter({
    apiKey: "premium",
    version: 2,
    fetchImpl: fakeFetch([
      {
        match: (u) => u.pathname.endsWith("lookupteam.php"),
        body: {
          teams: [
            {
              idTeam: "133604",
              idLeague: "4328",
              strTeam: "Arsenal",
              strTeamShort: "ARS",
              strLeague: "English Premier League",
              strSport: "Soccer",
              intFormedYear: "1886",
              strStadium: "Emirates Stadium",
              strCountry: "England",
              strTeamBadge: "https://www.thesportsdb.com/images/media/team/badge/arsenal.png",
            },
          ],
        },
      },
      {
        match: (u) => u.pathname.endsWith("lookupplayer.php"),
        body: {
          player: [
            { idPlayer: "34145937", idTeam: "133604", strPlayer: "Bukayo Saka", strTeam: "Arsenal", strPosition: "Right Winger", dateBorn: "2001-09-05", strThumb: "https://www.thesportsdb.com/images/media/player/thumb/saka.jpg", strCutout: "https://www.thesportsdb.com/images/media/player/cutout/saka.png", strHeight: "5 ft 10 in", strWeight: "72", strFoot: "Left" },
          ],
        },
      },
      {
        match: (u) => u.pathname.endsWith("lookup_all_players.php"),
        body: {
          player: [
            { idPlayer: "34145937", idTeam: "133604", strPlayer: "Bukayo Saka", strTeam: "Arsenal", strPosition: "Right Winger", dateBorn: "2001-09-05", strThumb: "https://www.thesportsdb.com/images/media/player/thumb/saka.jpg", strHeight: "5 ft 10 in", strWeight: "72", strFoot: "Left" },
            { idPlayer: "34145938", idTeam: "133604", strPlayer: "No Photo Player", strTeam: "Arsenal", strPosition: "Defender", dateBorn: null, strThumb: null, strHeight: null, strWeight: null, strFoot: null },
          ],
        },
      },
    ]),
  });

  const team = await adapter.getTeam({ providerTeamId: "133604" });
  assert.equal(team.ok, true);
  if (team.ok) {
    assert.equal(team.data.name, "Arsenal");
    assert.equal(team.data.foundedYear, 1886);
    assert.match(team.data.logoUrl ?? "", /thesportsdb\.com/);
  }

  const squad = await adapter.getTeamSquad({ providerTeamId: "133604" });
  assert.equal(squad.ok, true);
  if (squad.ok) {
    assert.match(squad.data[0].photoAttribution ?? "", /TheSportsDB/, "licence attribution must travel with the image");
    assert.equal(squad.data[1].photoUrl, null);
    assert.equal(squad.data[1].photoAttribution, null, "no attribution for an image we do not have");
  }

  const player = await adapter.getPlayer({ providerPlayerId: "34145937" });
  assert.equal(player.ok, true);
  if (player.ok) {
    assert.equal(player.data.heightCm, 178, "imperial heights are converted to centimetres");
    assert.equal(player.data.weightKg, 72);
    assert.equal(player.data.footPreference, "left");
  }
});

test("thesportsdb: v2 sends the key as a header, v1 puts it in the path", async () => {
  const headers: string[] = [];
  const paths: string[] = [];
  const impl = ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    paths.push(url.pathname);
    headers.push(String((init?.headers as Record<string, string>)?.["X-API-KEY"] ?? ""));
    return Promise.resolve(new Response(JSON.stringify({ teams: [] }), { status: 200 }));
  }) as typeof fetch;

  await new TheSportsDbAdapter({ apiKey: "k2", version: 2, fetchImpl: impl }).getTeam({ providerTeamId: "1" });
  await new TheSportsDbAdapter({ apiKey: "k1", version: 1, fetchImpl: impl }).getTeam({ providerTeamId: "1" });

  assert.deepEqual(headers, ["k2", ""]);
  assert.match(paths[0], /^\/api\/v2\/json\//);
  assert.match(paths[1], /^\/api\/v1\/json\/k1\//);
});

/* ── cross-provider invariants ─────────────────────────────── */

test("every adapter declares capabilities and never throws on an unsupported data type", async () => {
  const adapters = [
    new ApiFootballAdapter({ apiKey: "k", fetchImpl: fakeFetch([{ match: () => true, body: {} }]) }),
    new SportmonksAdapter({ apiToken: "t", fetchImpl: fakeFetch([{ match: () => true, body: { data: [] } }]) }),
    new SportradarAdapter({ apiKey: "k", fetchImpl: fakeFetch([{ match: () => true, body: {} }]) }),
    new TheSportsDbAdapter({ apiKey: "k", fetchImpl: fakeFetch([{ match: () => true, body: {} }]) }),
  ];
  for (const adapter of adapters) {
    assert.ok(adapter.capabilities.length > 0, `${adapter.name} must declare capabilities`);
    assert.ok(adapter.supportedSports.length > 0);

    const lineup = await adapter.getMatchLineups({ providerMatchId: "x" });
    if (adapter.capabilities.includes("match_lineups")) {
      assert.notEqual(lineup.ok && !lineup.ok, true);
    } else {
      assert.equal(lineup.ok, false);
      if (!lineup.ok) assert.equal(lineup.error.code, "not_supported", `${adapter.name} must report not_supported instead of failing`);
    }

    const stats = await adapter.getPlayerStats({ providerPlayerId: "x" });
    if (!adapter.capabilities.includes("player_stats")) {
      assert.equal(stats.ok, false);
      if (!stats.ok) assert.equal(stats.error.code, "not_supported");
    }
  }
});

test("a hung provider times out instead of blocking the platform", async () => {
  // the double honours AbortSignal exactly like real fetch, otherwise the
  // adapter's timeout could not be exercised at all
  const hanging = ((_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        reject(err);
      });
    })) as typeof fetch;
  const adapter = new ApiFootballAdapter({ apiKey: "k", timeoutMs: 60, retries: 0, fetchImpl: hanging });
  const started = Date.now();
  const res = await adapter.getLiveMatches({ sport: "football" });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, "timeout");
  assert.ok(Date.now() - started < 2000, "must give up quickly");
});
