/**
 * SportScore adapter — unit tests against REAL captured API payloads.
 * ─────────────────────────────────────────────────────────────
 * The JSON bodies under test/fixtures/sportscore/ were captured live from
 * https://sportscore.com/api/widget/* (open tier, 2026-09). The adapter's
 * fetch is injected, so these tests exercise the exact production code path
 * (transport → status mapping → normalization) without the network.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SportScoreAdapter, mapStatus, matchSlugFromUrl } from "../src/adapters/sportscore";

// compiled tests run from dist-test/test/ — fixtures live in test/fixtures/
const here = join(__dirname, "../../test");
const fx = (name: string) => JSON.parse(readFileSync(join(here, "fixtures", "sportscore", name), "utf8"));

/** fetch stub that replays captured payloads and counts upstream hits */
function stubTransport(routes: Record<string, unknown>, opts: { failWith?: Error } = {}) {
  let hits = 0;
  const impl = (async (url: string) => {
    hits++;
    if (opts.failWith) throw opts.failWith;
    const u = new URL(url);
    const key = `${u.pathname.replace(/^\/api\/widget\/?/, "").replace(/\/$/, "")}?${u.searchParams.get("sport") ?? ""}:${u.searchParams.get("slug") ?? u.searchParams.get("limit") ?? ""}`;
    if (key in routes) {
      return { ok: true, status: 200, json: async () => routes[key] } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  }) as typeof fetch;
  return { impl, hits: () => hits };
}

const adapter = (transport: typeof fetch) => new SportScoreAdapter({ baseUrl: "https://sportscore.com/api/widget", fetchImpl: transport, retries: 0 });

test("mapStatus: real status values map onto the canonical vocabulary", () => {
  assert.equal(mapStatus("finished", "Finished").status, "finished");
  assert.equal(mapStatus("upcoming", "Delayed").status, "scheduled");
  assert.equal(mapStatus("live", "61'").status, "live");
  assert.equal(mapStatus("live", "61'").minute, 61);
  assert.equal(mapStatus("halftime", "HT").status, "halftime");
  assert.equal(mapStatus("postponed", "Postponed").status, "postponed");
  assert.equal(mapStatus("weird-unknown", "weird-unknown").status, "scheduled");
});

test("matchSlugFromUrl: extracts the provider match slug from the permalink", () => {
  assert.equal(matchSlugFromUrl("/football/match/cruz-azul-vs-inter-miami-cf/"), "cruz-azul-vs-inter-miami-cf");
  assert.equal(matchSlugFromUrl(null), null);
});

test("getLiveMatches: returns only live fixtures with real names and minute", async () => {
  const t = stubTransport({ "matches?football:50": fx("feed.json") });
  const res = await adapter(t.impl).getLiveMatches({ sport: "football" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.data.length, 1);
  const f = res.data[0];
  assert.equal(f.providerId, "rebels-fc-vs-meg");
  assert.equal(f.status, "live");
  assert.equal(f.minute, 61);
  assert.equal(f.homeProviderId, "Rebels FC");
  assert.equal(f.awayProviderId, "MEG");
  assert.equal(f.homeScore, 1);
  assert.equal(f.awayScore, 0);
  assert.equal(f.competitionName, "I-League");
  assert.equal(f.sourceUrl, "https://sportscore.com/football/match/rebels-fc-vs-meg/");
});

test("getFixtures: full feed normalizes (finished + upcoming, no invented fields)", async () => {
  const t = stubTransport({ "matches?football:50": fx("feed.json") });
  const res = await adapter(t.impl).getFixtures({ sport: "football" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.data.length, 5);
  const finished = res.data.find((f) => f.providerId === "cruz-azul-vs-inter-miami-cf");
  assert.ok(finished);
  assert.equal(finished.status, "finished");
  assert.equal(finished.homeScore, 2);
  assert.equal(finished.awayScore, 0);
  assert.equal(finished.homeLogoUrl, "https://img.thesports.com/football/team/976fe1d29c112f4baeb844cdda2f04cb.png");
  const upcoming = res.data.find((f) => f.providerId === "parkland-sc-vs-florida-wolves-fc");
  assert.ok(upcoming);
  assert.equal(upcoming.homeScore, null); // null stays null — never 0
  assert.equal(upcoming.status, "scheduled");
});

test("getMatchDetail: real detail payload → normalized fixture with HT periods", async () => {
  const t = stubTransport({ "match?football:cruz-azul-vs-inter-miami-cf": fx("match-detail.json") });
  const res = await adapter(t.impl).getMatchDetail({ providerMatchId: "cruz-azul-vs-inter-miami-cf", sport: "football" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const f = res.data;
  assert.equal(f.homeProviderId, "Inter Miami CF");
  assert.equal(f.status, "finished");
  assert.equal(f.periods.length, 1);
  assert.equal(f.periods[0].home, 1); // home_ht_score
  assert.equal(f.periods[0].away, 0);
});

test("getMatchEvents: incidents → canonical events (goal, card, sub with in/out)", async () => {
  const t = stubTransport({ "match?football:cruz-azul-vs-inter-miami-cf": fx("match-detail.json") });
  const res = await adapter(t.impl).getMatchEvents({ providerMatchId: "cruz-azul-vs-inter-miami-cf", sport: "football" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  const types = res.data.map((e) => e.type);
  assert.deepEqual(types, ["goal", "yellow", "sub-in", "goal", "yellow"]);
  const messiGoal = res.data[0];
  assert.equal(messiGoal.minute, 24);
  assert.equal(messiGoal.playerProviderId, "Lionel Messi");
  assert.equal(messiGoal.teamProviderId, "Inter Miami CF");
  const sub = res.data[2];
  assert.equal(sub.playerProviderId, "Omar Campos"); // player_in
  assert.equal(sub.secondaryPlayerProviderId, "Carlos Rotondi"); // player_out
  assert.match(sub.description ?? "", /in: Omar Campos/);
});

test("getMatchStats: empty provider stats → empty array (no invented numbers)", async () => {
  const t = stubTransport({ "match?football:cruz-azul-vs-inter-miami-cf": fx("match-detail.json") });
  const res = await adapter(t.impl).getMatchStats({ providerMatchId: "cruz-azul-vs-inter-miami-cf", sport: "football" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.data, []);
});

test("getMatchLineups: real XI/bench → normalized lineups with formation", async () => {
  const t = stubTransport({ "match?football:cruz-azul-vs-inter-miami-cf": fx("match-detail.json") });
  const res = await adapter(t.impl).getMatchLineups({ providerMatchId: "cruz-azul-vs-inter-miami-cf", sport: "football" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.data.length, 2);
  const home = res.data.find((l) => l.teamProviderId === "Inter Miami CF");
  assert.ok(home);
  assert.equal(home.formation, "4-3-3");
  assert.equal(home.coach, null); // provider has null coach → null, not invented
  const messi = home.starters.find((p) => p.name === "Lionel Messi");
  assert.ok(messi);
  assert.equal(messi.jerseyNumber, 10);
  assert.equal(messi.position, "F");
});

test("getStandings: real UCL rows → normalized (points, status)", async () => {
  const t = stubTransport({ "standings?football:uefa-champions-league": fx("standings.json") });
  const res = await adapter(t.impl).getStandings({ providerCompetitionId: "uefa-champions-league", sport: "football" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.data[0].teamProviderId, "Paris Saint Germain");
  assert.equal(res.data[0].position, 1);
  assert.equal(res.data[0].points, 3);
  assert.equal(res.data[0].status, "Qualified");
  const second = res.data.find((r) => r.position === 2);
  assert.equal(second?.goalsFor, 5);
});

test("getStandings: provider error body ('No current season') → typed not_found", async () => {
  const t = stubTransport({ "standings?football:premier-league": fx("standings-error.json") });
  const res = await adapter(t.impl).getStandings({ providerCompetitionId: "premier-league", sport: "football" });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.error.code, "not_found");
  assert.match(res.error.message, /No current season/);
});

test("getTopScorers: real scorers → normalized (goals, appearances)", async () => {
  const t = stubTransport({ "topscorers?football:uefa-champions-league": fx("topscorers.json") });
  const res = await adapter(t.impl).getTopScorers({ providerCompetitionId: "uefa-champions-league", sport: "football" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.data.length, 4);
  assert.equal(res.data[0].playerProviderId, "ermedin-demirovic");
  assert.equal(res.data[0].goals, 3);
  assert.equal(res.data[0].appearances, 1);
});

test("getPlayerStats: real player stats → normalized; rating scale NOT invented", async () => {
  const t = stubTransport({ "player?football:erling-haaland": fx("player.json") });
  const res = await adapter(t.impl).getPlayerStats({ providerPlayerId: "erling-haaland", sport: "football" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.data.appearances, 4);
  assert.equal(res.data.goals, 4);
  assert.equal(res.data.minutes, 360);
  assert.equal(res.data.rating, null); // undocumented scale → not rescaled
  assert.equal(res.data.extra.ratingRaw, 3124); // passed through verbatim
  assert.equal(res.data.extra.team, "Manchester City");
});

test("network failure → typed network error (never a fabricated payload)", async () => {
  const t = stubTransport({}, { failWith: new Error("ECONNRESET") });
  const res = await adapter(t.impl).getLiveMatches({ sport: "football" });
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.error.code, "network");
});

test("self-identification: src=nemo-sports is sent on every request", async () => {
  let seen = new URL("https://sportscore.com/api/widget/");
  const impl = (async (url: string) => {
    seen = new URL(url);
    const key = `${seen.pathname.replace(/\/$/, "").split("/").pop()}?${seen.searchParams.get("sport") ?? ""}:`;
    return { ok: true, status: 200, json: async () => (key.startsWith("matches?") ? fx("feed.json") : {}) } as unknown as Response;
  }) as typeof fetch;
  await adapter(impl).getLiveMatches({ sport: "football" });
  assert.equal(seen?.searchParams.get("src"), "nemo-sports");
});
