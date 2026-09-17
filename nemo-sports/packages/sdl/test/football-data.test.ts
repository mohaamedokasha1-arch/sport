/**
 * Football-Data.org adapter — unit tests against doc-shaped v4 payloads.
 * ──────────────────────────────────────────────────────────────────────
 * The fixtures under test/fixtures/football-data/ mirror the response bodies
 * published at docs.football-data.org (v4) — including the standings envelope
 * that carries TOTAL + HOME + AWAY tables, and the 403 plan-restriction body.
 * The transport is injected, so the real production code path is exercised
 * (auth header → status translation → normalization) without the network.
 *
 * What these tests protect:
 *   · the API key travels in a header only — never in a URL or a payload;
 *   · HOME/AWAY tables never leak into the canonical league table;
 *   · a scheduled match has null scores (never 0);
 *   · a plan-restricted endpoint is `not_supported`, not `auth` (the chain
 *     must keep working on the free tier instead of dropping the provider);
 *   · no provider payload escapes: only `Normalized*` shapes come out.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FootballDataAdapter, footballDataCode } from "../src/adapters/football-data";
import { createSdl, PriorityConfig, SportsDataLayer } from "../src/index";

// compiled tests run from dist-test/test/ — fixtures live in test/fixtures/
const here = join(__dirname, "../../test");
const fx = (name: string) => JSON.parse(readFileSync(join(here, "fixtures", "football-data", name), "utf8"));

type Seen = { url: string; headers: Record<string, string> };

/** Replay stub: routes by path, records URLs + headers, exposes an upstream counter. */
function stub(routes: { path: string; status?: number; body: unknown; headers?: Record<string, string> }[], seen: Seen[] = []) {
  let hits = 0;
  const impl = (async (input: string | URL, init?: RequestInit) => {
    hits++;
    const url = new URL(String(input));
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    seen.push({ url: url.toString(), headers });
    const route = routes.find((r) => url.pathname.endsWith(r.path));
    if (!route) return new Response(JSON.stringify({ message: "no route" }), { status: 404, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify(route.body), { status: route.status ?? 200, headers: { "content-type": "application/json", ...(route.headers ?? {}) } });
  }) as typeof fetch;
  return { impl, hits: () => hits };
}

const adapter = (transport: typeof fetch, cfg: Record<string, unknown> = {}) =>
  new FootballDataAdapter({ apiKey: "test-token", baseUrl: "https://api.football-data.org/v4", fetchImpl: transport, retries: 0, ...cfg });

test("competition identifiers: codes, slugs, names and ids all resolve to the official code", () => {
  assert.equal(footballDataCode("PL"), "PL");
  assert.equal(footballDataCode("pl"), "PL");
  assert.equal(footballDataCode("english-premier-league"), "PL");
  assert.equal(footballDataCode("Premier League"), "PL");
  assert.equal(footballDataCode("الدوري الإنجليزي الممتاز"), "PL");
  assert.equal(footballDataCode("uefa-champions-league"), "CL");
  assert.equal(footballDataCode("french-ligue-1"), "FL1");
  assert.equal(footballDataCode("2021"), "PL");
  assert.equal(footballDataCode("egyptian-premier-league"), null, "unmapped competitions must not be guessed");
});

test("auth: the token is sent as X-Auth-Token and never appears in the URL", async () => {
  const seen: Seen[] = [];
  const t = stub([{ path: "/competitions/PL/standings", body: fx("standings.json") }], seen);
  const res = await adapter(t.impl).getStandings({ providerCompetitionId: "english-premier-league" });
  assert.equal(res.ok, true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].headers["X-Auth-Token"], "test-token");
  assert.ok(!seen[0].url.includes("test-token"), "the key must never be part of a URL");
  assert.equal(new URL(seen[0].url).pathname, "/v4/competitions/PL/standings", "the SportScore slug resolves to the PL code");
});

test("getStandings: TOTAL table only, real team names, honest numeric fields", async () => {
  const t = stub([{ path: "/competitions/PL/standings", body: fx("standings.json") }]);
  const res = await adapter(t.impl).getStandings({ providerCompetitionId: "PL" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.data.length, 3, "HOME/AWAY tables must be filtered out");
  const first = res.data[0];
  assert.deepEqual(
    { id: first.teamProviderId, name: first.teamName, pos: first.position, played: first.played, won: first.won, drawn: first.drawn, lost: first.lost, gf: first.goalsFor, ga: first.goalsAgainst, pts: first.points },
    { id: "64", name: "Liverpool FC", pos: 1, played: 5, won: 4, drawn: 1, lost: 0, gf: 12, ga: 4, pts: 13 },
  );
  assert.deepEqual(first.form, ["W", "W", "D", "W", "L"]);
  assert.equal(first.teamLogoUrl, "https://crests.football-data.org/64.png");
  assert.equal(first.group, null);
});

test("getTopScorers: player/team display metadata is attached without leaving provider shapes", async () => {
  const t = stub([{ path: "/competitions/PL/scorers", body: fx("scorers.json") }]);
  const res = await adapter(t.impl).getTopScorers({ providerCompetitionId: "PL" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.data.length, 3);
  assert.deepEqual(res.data[0], {
    playerProviderId: "3550",
    playerName: "Erling Haaland",
    teamProviderId: "65",
    teamName: "Man City",
    goals: 7,
    appearances: 5,
    penalties: 1,
    assists: 1,
    playerPhotoUrl: null,
  });
});

test("plan restriction: 403 on scorers is not_supported (chain continues), never auth", async () => {
  const t = stub([{ path: "/competitions/PL/scorers", status: 403, body: fx("restricted-scorers.json") }]);
  const res = await adapter(t.impl).getTopScorers({ providerCompetitionId: "PL" });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.error.code, "not_supported");
  assert.match(res.error.message, /current plan/i);
  assert.equal(res.error.httpStatus, 403);
});

test("getFixtures: a day request carries the date + monitored competitions, scores stay null when unplayed", async () => {
  const seen: Seen[] = [];
  const t = stub([{ path: "/v4/matches", body: fx("matches.json") }], seen);
  const res = await adapter(t.impl).getFixtures({ sport: "football", date: "2026-09-17" });
  assert.equal(res.ok, true);
  if (!res.ok) return;

  const url = new URL(seen[0].url);
  assert.equal(url.pathname, "/v4/matches");
  assert.equal(url.searchParams.get("date"), "2026-09-17");
  assert.equal(url.searchParams.get("competitions"), "PL,PD,SA,BL1,FL1,CL", "only the monitored competitions are requested");

  const [finished, scheduled, live] = res.data;
  assert.equal(finished.status, "finished");
  assert.equal(finished.homeScore, 3);
  assert.equal(finished.awayScore, 1);
  assert.equal(finished.homeName, "Liverpool");
  assert.equal(finished.competitionProviderId, "PL");
  assert.equal(finished.competitionName, "Premier League");
  assert.deepEqual(finished.periods, [{ label: "1H", home: 1, away: 1 }, { label: "FT", home: 3, away: 1 }]);

  assert.equal(scheduled.status, "scheduled");
  assert.equal(scheduled.homeScore, null, "an unplayed match is null — never 0");
  assert.equal(scheduled.awayScore, null);
  assert.deepEqual(scheduled.periods, []);

  assert.equal(live.status, "live");
  assert.equal(live.minute, 63);
  assert.equal(live.homeScore, 2);
});

test("getFixtures: an unscoped request covers the configured window (dateTo is exclusive in v4)", async () => {
  const seen: Seen[] = [];
  const t = stub([{ path: "/v4/matches", body: fx("matches.json") }], seen);
  await adapter(t.impl).getFixtures({ sport: "football" });
  const url = new URL(seen[0].url);
  assert.ok(url.searchParams.get("dateFrom"), "a range is used when no date is given");
  assert.ok(url.searchParams.get("dateTo"));
  assert.equal(url.searchParams.get("status"), null);
});

test("getLiveMatches: an empty live board is an honest empty list, not an invented fixture", async () => {
  const t = stub([{ path: "/v4/matches", status: 200, body: { filters: { status: "LIVE" }, resultSet: { count: 0 }, matches: [] } }]);
  const res = await adapter(t.impl).getLiveMatches({ sport: "football" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.data, []);
});

test("getMatchDetail: non-numeric ids fail fast instead of calling the API", async () => {
  const t = stub([]);
  const res = await adapter(t.impl).getMatchDetail({ providerMatchId: "cruz-azul-vs-inter-miami-cf" });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.error.code, "not_found");
  assert.equal(t.hits(), 0, "no upstream call is spent on an id this provider cannot have");
});

test("unknown competitions are not guessed: the chain may fall through to another provider", async () => {
  const t = stub([]);
  const res = await adapter(t.impl).getStandings({ providerCompetitionId: "egyptian-premier-league" });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.error.code, "not_found");
  assert.match(res.error.message, /not one of the codes/);
  assert.equal(t.hits(), 0);
});

test("quota headers are observed so the SDL can back off before a 429", async () => {
  const t = stub([
    { path: "/competitions/PL/standings", body: fx("standings.json"), headers: { "x-requests-available-minute": "4", "x-requestcounter-reset": "37" } },
  ]);
  const a = adapter(t.impl);
  await a.getStandings({ providerCompetitionId: "PL" });
  assert.deepEqual(
    { available: a.quotaSnapshot().requestsAvailableMinute, reset: a.quotaSnapshot().resetSeconds },
    { available: 4, reset: 37 },
  );
});

test("composition root: the key registers the provider, raises its budget and leads the static chains", () => {
  const { sdl, mode, missing } = createSdl({ FOOTBALL_DATA_API_KEY: "env-token", NEMO_SPORTSCORE_ENABLED: "0" });
  assert.equal(mode, "live");
  assert.ok(!missing.includes("football_data"));
  assert.deepEqual(sdl.chainFor("football", null, "standings").map((l) => l.provider), ["football_data"]);
  assert.deepEqual(sdl.chainFor("football", null, "top_scorers").map((l) => l.provider), ["football_data"]);
  assert.equal(sdl.rateLimiter.config("football_data")?.perMinute, 8, "the free-tier budget leaves headroom under the published 10/min");

  const paid = createSdl({ FOOTBALL_DATA_API_KEY: "env-token", FOOTBALL_DATA_REQUESTS_PER_MINUTE: "55", NEMO_SPORTSCORE_ENABLED: "0" });
  assert.equal(paid.sdl.rateLimiter.config("football_data")?.perMinute, 55, "a paid plan raises the budget through one env var");
});

test("through the SDL: repeated requests are served from cache — one upstream call, not two", async () => {
  const seen: Seen[] = [];
  const t = stub([{ path: "/competitions/PL/standings", body: fx("standings.json") }], seen);
  const { sdl } = createSdl(
    { FOOTBALL_DATA_API_KEY: "env-token", NEMO_SPORTSCORE_ENABLED: "0" },
    { rateLimits: { football_data: { perSecond: null, perMinute: null, perHour: null, perDay: null, perMonth: null, concurrency: null, throttleAt: 0.85 } } },
  );
  // swap the registered adapter for one that replays the fixture and counts
  const layer = sdl as unknown as { providers: Map<string, unknown> };
  layer.providers.set("football_data", adapter(t.impl));

  const call = () =>
    sdl.fetch<{ position: number }[]>({
      sport: "football",
      dataType: "standings",
      endpoint: "standings",
      params: { sport: "football", competitionProviderId: "PL" },
      call: (p) => p.getStandings({ providerCompetitionId: "PL", sport: "football" }),
    });

  const first = await call();
  const second = await call();
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(t.hits(), 1, "the second request must be answered by the cache");
  assert.equal(first.value.fromCache, false);
  assert.equal(second.value.fromCache, true);
  assert.equal(second.value.provider, "football_data");
  assert.equal(sdl.cachePolicy("standings").canonical, 900, "league tables are cached 15 minutes under this provider");
  assert.equal(sdl.cachePolicy("top_scorers").canonical, 3600, "scorer lists are cached for an hour");
});

test("composition root: without the key the provider is absent from every chain", () => {
  const { sdl, missing } = createSdl({ NEMO_SPORTSCORE_ENABLED: "0", NEMO_SDL_MODE: "demo" });
  assert.ok(missing.includes("football_data"));
  assert.deepEqual(sdl.chainFor("football", null, "standings").map((l) => l.provider), ["demo"]);
});

/* ── end-to-end over real HTTP ────────────────────────────────
   The unit tests above inject `fetch`; this one starts an actual HTTP server
   that speaks the v4 wire format, so the full path is exercised: real fetch →
   status handling → JSON parsing → normalization → SDL cache. It also proves
   the failure path returns a typed error (which the app renders as
   "Data temporarily unavailable") instead of any fabricated payload. */

test("over real HTTP: auth header, normalization and cache behave as in production", async () => {
  const { createServer } = await import("node:http");
  const received: { path: string; token: string | undefined }[] = [];
  const server = createServer((req, res) => {
    received.push({ path: req.url ?? "", token: req.headers["x-auth-token"] as string | undefined });
    const body = req.url?.includes("/scorers")
      ? fx("scorers.json")
      : req.url?.includes("/standings")
        ? fx("standings.json")
        : req.url?.startsWith("/v4/matches")
          ? fx("matches.json")
          : { message: "not found" };
    const status = req.url?.startsWith("/v4/") ? 200 : 404;
    res.writeHead(status, {
      "content-type": "application/json",
      "x-requests-available-minute": "6",
      "x-requestcounter-reset": "21",
    });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const priority = new PriorityConfig([
      { id: "ifd-1", sport: "football", competition: "*", dataType: "standings", provider: "football_data", role: "primary", enabled: true, updatedAt: new Date().toISOString() },
      { id: "ifd-2", sport: "football", competition: "*", dataType: "top_scorers", provider: "football_data", role: "primary", enabled: true, updatedAt: new Date().toISOString() },
      { id: "ifd-3", sport: "football", competition: "*", dataType: "fixtures", provider: "football_data", role: "primary", enabled: true, updatedAt: new Date().toISOString() },
    ]);
    const sdl = new SportsDataLayer({ priority, cachePolicy: { standings: { raw: 600, canonical: 900, staleGrace: 3600 } } });
    sdl.register(new FootballDataAdapter({ apiKey: "wire-token", baseUrl: `http://127.0.0.1:${port}/v4`, retries: 0 }));

    const table = await sdl.fetch<{ points: number }[]>({
      sport: "football",
      dataType: "standings",
      endpoint: "standings",
      params: { sport: "football", competitionProviderId: "PL" },
      call: (p) => p.getStandings({ providerCompetitionId: "PL", sport: "football" }),
    });
    assert.equal(table.ok, true);
    if (!table.ok) return;
    assert.equal(table.value.data[0].points, 13);
    assert.equal(table.value.provider, "football_data");

    const cached = await sdl.fetch<{ points: number }[]>({
      sport: "football",
      dataType: "standings",
      endpoint: "standings",
      params: { sport: "football", competitionProviderId: "PL" },
      call: (p) => p.getStandings({ providerCompetitionId: "PL", sport: "football" }),
    });
    assert.equal(cached.ok, true);
    if (cached.ok) assert.equal(cached.value.fromCache, true);

    assert.deepEqual(
      received.filter((r) => r.path.includes("standings")).map((r) => r.path),
      ["/v4/competitions/PL/standings"],
      "one upstream request for two SDL calls",
    );
    assert.ok(received.every((r) => r.token === "wire-token"), "every upstream request carries X-Auth-Token");
    assert.ok(received.every((r) => !r.path.includes("wire-token")), "the token never appears in a URL");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("over real HTTP: an unreachable provider yields a typed failure, never data", async () => {
  const priority = new PriorityConfig([
    { id: "ifd-9", sport: "football", competition: "*", dataType: "standings", provider: "football_data", role: "primary", enabled: true, updatedAt: new Date().toISOString() },
  ]);
  const sdl = new SportsDataLayer({ priority });
  // port 1 is a closed port: connection refused → typed network error
  sdl.register(new FootballDataAdapter({ apiKey: "wire-token", baseUrl: "http://127.0.0.1:1/v4", retries: 0, timeoutMs: 500 }));

  const res = await sdl.fetch({
    sport: "football",
    dataType: "standings",
    endpoint: "standings",
    params: { sport: "football", competitionProviderId: "PL" },
    call: (p) => p.getStandings({ providerCompetitionId: "PL", sport: "football" }),
  });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.error.kind, "all_providers_failed");
  assert.ok(!("data" in res.error), "a failure carries no payload at all");
});
