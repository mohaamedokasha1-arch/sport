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
import { SportScoreAdapter, competitionSlug, competitionWindowDays, entitySlugFromUrl, mapStatus, matchSlugFromUrl } from "../src/adapters/sportscore";

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

test("competitionSlug: display names and slugs compare equal (no substring matching)", () => {
  assert.equal(competitionSlug("English Premier League"), "english-premier-league");
  assert.equal(competitionSlug("CAF Champions League"), "caf-champions-league");
  assert.equal(competitionSlug("CONCACAF League Champions Cup"), "concacaf-league-champions-cup");
  assert.notEqual(competitionSlug("CAF Champions League"), competitionSlug("CAF Confederation Cup"));
});

/** Transport for REST v1 `fixtures/`: answers per requested UTC day; records every URL. */
function v1Transport(byDay: Record<string, unknown>, opts: { failDay?: string } = {}) {
  const urls: string[] = [];
  const impl = (async (url: string) => {
    urls.push(url);
    const u = new URL(url);
    const day = u.searchParams.get("date") ?? "";
    if (opts.failDay && day === opts.failDay) return { ok: false, status: 503, headers: new Headers(), json: async () => ({}) } as unknown as Response;
    const body = byDay[day] ?? { sport: "football", date: day, count: 0, matches: [] };
    return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => body } as unknown as Response;
  }) as typeof fetch;
  return { impl, urls, calls: () => urls.length };
}

const v1Adapter = (transport: typeof fetch, baseUrl = "https://sportscore.com/api/widget") =>
  new SportScoreAdapter({ baseUrl, fetchImpl: transport, retries: 0 });

test("REST v1 day endpoint: a date request returns that whole UTC day, not the 50-match feed sample", async () => {
  const t = v1Transport({ "2026-10-12": fx("v1-fixtures-egypt-2026-10-12.json") });
  const res = await v1Adapter(t.impl).getFixtures({ sport: "football", date: "2026-10-12" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(t.calls(), 1, "one provider call for one day");
  assert.match(t.urls[0], /^https:\/\/sportscore\.com\/api\/v1\/fixtures\/\?/, "uses the documented v1 root");
  assert.equal(res.data.length, 4, "all four captured Egyptian fixtures are kept");
  assert.deepEqual(res.data.map((f) => f.competitionProviderId), Array(4).fill("Egyptian Premier League"));
  assert.ok(res.data.every((f) => f.status === "finished"), "finished results stay finished");
});

test("REST v1 competition request: one call per day of the window, scoped to the competition slug", async () => {
  const t = v1Transport({ "2026-10-12": fx("v1-fixtures-egypt-2026-10-12.json") });
  const res = await v1Adapter(t.impl).getFixtures({ sport: "football", competitionProviderId: "egyptian-premier-league" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(t.calls(), 11, "±5 days around today");
  assert.ok(t.urls.every((u) => u.includes("competition=egyptian-premier-league")), "competition slug is sent to the provider");
  assert.equal(res.data.length, 4, "the day that has matches contributes its fixtures, once each");
  assert.equal(new Set(res.data.map((f) => f.providerId)).size, 4, "no duplicated fixtures");
});

test("REST v1 competition request: another competition's rows never leak in", async () => {
  const t = v1Transport({ "2026-10-12": fx("v1-fixtures-egypt-2026-10-12.json") });
  const res = await v1Adapter(t.impl).getFixtures({ sport: "football", competitionProviderId: "english-premier-league" });
  assert.ok(res.ok && res.data.length === 0, "a competition with no rows in the answer yields [] — not the Egyptian rows the stub returned");
});

test("REST v1: a failed day fails the whole request — a partial schedule is never presented as complete", async () => {
  const t = v1Transport({ "2026-10-12": fx("v1-fixtures-egypt-2026-10-12.json") }, { failDay: "2026-10-10" });
  const res = await v1Adapter(t.impl).getFixtures({ sport: "football", competitionProviderId: "egyptian-premier-league" });
  assert.equal(res.ok, false, "a provider failure is not an empty result");
});

test("REST v1: an empty day is a genuine empty result (ok, zero rows)", async () => {
  const t = v1Transport({});
  const res = await v1Adapter(t.impl).getFixtures({ sport: "football", date: "2026-10-13" });
  assert.ok(res.ok && res.data.length === 0);
});

test("REST v1: the compatibility relay cannot serve day fixtures and says so instead of guessing", async () => {
  const t = v1Transport({});
  const res = await v1Adapter(t.impl, "https://nemo.example/api/v1/sportscore-relay").getFixtures({ sport: "football", date: "2026-10-12" });
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, "not_supported");
  assert.equal(t.calls(), 0, "no request is attempted through the relay");
});

test("competitionWindowDays: today ± window by default, explicit range honoured, bad or huge ranges handled", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  const def = competitionWindowDays(undefined, now);
  assert.ok(def);
  assert.equal(def?.length, 11);
  assert.equal(def?.[0], "2026-10-08");
  assert.equal(def?.[10], "2026-10-18");
  assert.equal(competitionWindowDays({ from: "2026-10-10", to: "2026-10-12" }, now)?.length, 3);
  assert.equal(competitionWindowDays({ from: "2026-10-12", to: "2026-10-10" }, now), null, "reversed range rejected");
  assert.equal(competitionWindowDays({ from: "nope", to: "2026-10-10" }, now), null, "unparseable range rejected");
  assert.equal(competitionWindowDays({ from: "2026-01-01", to: "2026-12-31" }, now)?.length, 14, "capped at 14 provider calls");
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

/* ── standings identity: what a team LINK is built from ─────────────────────
 * Captured live from `standings/?sport=football&slug=egyptian-premier-league`
 * on 2026-10-12. The row ships four identity fields (`team`, `team_slug`,
 * `team_url`, `team_logo`); the adapter used to read only `team`, so NEMO built
 * `/teams/Al%20Ahly%20FC` from a display name, no crest was rendered, and the
 * Egyptian clubs linked to 404s on a page that displayed their real table. */
const egyptStandings = () => {
  const t = stubTransport({ "standings?football:egyptian-premier-league": fx("standings-egypt.json") });
  return adapter(t.impl).getStandings({ providerCompetitionId: "egyptian-premier-league", sport: "football" });
};

test("getStandings: canonical entity id stays the provider name (no new/duplicate entities)", async () => {
  const res = await egyptStandings();
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.data.length, 4);
  assert.equal(res.data[0].teamProviderId, "Al Ahly FC");
  assert.equal(res.data[0].teamName, "Al Ahly FC");
  assert.equal(res.data[0].position, 1);
  assert.equal(res.data[0].points, 16);
});

test("getStandings: team_slug becomes the linkable id; team_logo the crest", async () => {
  const res = await egyptStandings();
  if (!res.ok) return assert.fail("standings should resolve");
  assert.equal(res.data[0].teamProviderSlug, "al-ahly-fc");
  assert.equal(res.data[1].teamProviderSlug, "pyramids-fc");
  assert.equal(res.data[0].teamLogoUrl, "https://img.thesports.com/football/team/e40a14044c93d0e5e2f9d558aa1640fa.png");
});

test("getStandings: missing slug/logo degrade to 'no slug' and 'no logo', never junk", async () => {
  const res = await egyptStandings();
  if (!res.ok) return assert.fail("standings should resolve");
  const bank = res.data.find((r) => r.teamProviderId === "Bank El Ahly");
  assert.ok(bank, "row without team_slug/team_url is still a standing");
  assert.equal(bank?.teamProviderSlug, null);
  // `blob:` is not an embeddable image; it must never reach an <img src>.
  const ghazl = res.data.find((r) => r.position === 20);
  assert.equal(ghazl?.teamLogoUrl, null);
  assert.equal(ghazl?.status, null);
});

test("entitySlugFromUrl: reads the id out of the provider permalink only", () => {
  assert.equal(entitySlugFromUrl("/football/team/al-ahly-fc/"), "al-ahly-fc");
  assert.equal(entitySlugFromUrl("/football/competition/uefa-champions-league/"), "uefa-champions-league");
  assert.equal(entitySlugFromUrl("/football/match/al-ahly-fc-vs-zamalek-sc/abc123/"), null);
  assert.equal(entitySlugFromUrl(""), null);
  assert.equal(entitySlugFromUrl(null), null);
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
  assert.equal(res.data[0].playerName, "Ermedin Demirović");
  assert.equal(res.data[0].teamName, "VfB Stuttgart");
  assert.equal(res.data[0].profileAvailable, true);
  assert.equal(res.data[0].goals, 3);
  assert.equal(res.data[0].appearances, 1);
});

test("getPlayerStats: real player stats → normalized; rating scale NOT invented", async () => {
  const t = stubTransport({ "player?football:erling-haaland": fx("player.json") });
  const res = await adapter(t.impl).getPlayerStats({ providerPlayerId: "erling-haaland", sport: "football" });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.data.playerName, "Erling Haaland");
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

/* ── 2026-10-11 production regression: status_text carries the real state ── */

test("mapStatus: period labels are not minutes ('1st half' was rendered as 1')", () => {
  assert.deepEqual(mapStatus("live", "1st half"), { status: "live", minute: null });
  assert.deepEqual(mapStatus("live", "2nd half"), { status: "live", minute: null });
  // basketball / tennis / cricket period labels
  assert.deepEqual(mapStatus("live", "2nd quarter"), { status: "live", minute: null });
  assert.deepEqual(mapStatus("live", "3rd set"), { status: "live", minute: null });
  assert.deepEqual(mapStatus("live", "1st innings"), { status: "live", minute: null });
  // real clocks still parse
  assert.deepEqual(mapStatus("live", "61'"), { status: "live", minute: 61 });
  assert.deepEqual(mapStatus("live", "45+2'"), { status: "live", minute: 45 });
  assert.deepEqual(mapStatus("live", "90'+3"), { status: "live", minute: 90 });
});

test("mapStatus: a live match at 'Half time' is a half-time break, not a generic live match", () => {
  assert.deepEqual(mapStatus("live", "Half time"), { status: "halftime", minute: null });
  assert.deepEqual(mapStatus("live", "HT"), { status: "halftime", minute: null });
  assert.equal(mapStatus("live", "Halftime").status, "halftime");
  assert.equal(mapStatus("live", "Extra time").status, "extra_time");
  assert.equal(mapStatus("live", "Penalties").status, "penalty_shootout");
  assert.equal(mapStatus("extra_time_halftime", "").status, "extra_time_halftime");
});

test("mapStatus: 'upcoming' + 'Postponed' / 'Cancelled' is not an upcoming fixture", () => {
  assert.deepEqual(mapStatus("upcoming", "Postponed"), { status: "postponed", minute: null });
  assert.deepEqual(mapStatus("upcoming", "Cancelled"), { status: "cancelled", minute: null });
  assert.equal(mapStatus("upcoming", "Abandoned").status, "abandoned");
  assert.equal(mapStatus("upcoming", "Interrupted").status, "suspended");
  // an explicit not-started status never becomes live because of decoration
  assert.equal(mapStatus("upcoming", "1st leg").status, "scheduled");
  assert.equal(mapStatus("upcoming", "Delayed").status, "scheduled");
  assert.equal(mapStatus("finished", "AET").status, "finished");
});

test("production feed 2026-10-11: live view keeps half-time matches, drops the postponed one, invents no minute", async () => {
  const t = stubTransport({ "matches?football:50": fx("feed-2026-10-11.json") });
  const a = new SportScoreAdapter({ baseUrl: "https://sportscore.com/api/widget", fetchImpl: t.impl, retries: 0 });
  const live = await a.getLiveMatches({ sport: "football" });
  assert.equal(live.ok, true);
  if (!live.ok) return;
  const ids = live.data.map((f) => f.providerId).sort();
  assert.deepEqual(ids, [
    "atletico-saltillo-vs-vaqueros-reynosa",
    "la-tribu-de-cd-juarez-vs-fc-santiago",
    "rebels-fc-vs-meg",
    "river-plate-vs-estudiantes-rio-cuarto",
    "sao-paulo-vs-vitoria-ba",
  ]);
  const byId = new Map(live.data.map((f) => [f.providerId, f]));
  assert.equal(byId.get("sao-paulo-vs-vitoria-ba")!.status, "halftime");
  assert.equal(byId.get("sao-paulo-vs-vitoria-ba")!.minute, null);
  assert.equal(byId.get("la-tribu-de-cd-juarez-vs-fc-santiago")!.minute, null, "'1st half' is not minute 1");
  assert.equal(byId.get("rebels-fc-vs-meg")!.minute, 90);

  const all = await a.getFixtures({ sport: "football" });
  assert.equal(all.ok, true);
  if (!all.ok) return;
  const postponed = all.data.find((f) => f.providerId === "pembroke-hamilton-club-vs-devonshire-cougars");
  assert.equal(postponed?.status, "postponed");
  assert.equal(t.hits(), 1, "the live view and the fixtures view share one upstream snapshot");
});

test("feed snapshot sharing can be disabled (feedTtlMs: 0) and never caches failures", async () => {
  const t = stubTransport({ "matches?football:50": fx("feed-2026-10-11.json") });
  const a = new SportScoreAdapter({ baseUrl: "https://sportscore.com/api/widget", fetchImpl: t.impl, retries: 0, feedTtlMs: 0 });
  await a.getLiveMatches({ sport: "football" });
  await a.getFixtures({ sport: "football" });
  assert.equal(t.hits(), 2);

  const failing = stubTransport({}, { failWith: new Error("network down") });
  const b = new SportScoreAdapter({ baseUrl: "https://sportscore.com/api/widget", fetchImpl: failing.impl, retries: 0 });
  assert.equal((await b.getLiveMatches({ sport: "football" })).ok, false);
  assert.equal((await b.getLiveMatches({ sport: "football" })).ok, false);
  assert.equal(failing.hits(), 2, "a failure is retried on the next call, not replayed from memory");
});

test("matchSlugFromUrl: the new permalink format with a trailing id keeps the provider slug", () => {
  assert.equal(matchSlugFromUrl("/football/match/sao-paulo-vs-vitoria-ba/k82rekhg0vyzrep/"), "sao-paulo-vs-vitoria-ba");
  assert.equal(matchSlugFromUrl("/football/match/atletico-saltillo-vs-vaqueros-reynosa/1l4rjnhnydpxm7v/"), "atletico-saltillo-vs-vaqueros-reynosa");
  assert.equal(matchSlugFromUrl("/basketball/match/miami-heat-vs-minnesota-timberwolves/"), "miami-heat-vs-minnesota-timberwolves");
  assert.equal(matchSlugFromUrl("/football/standings/x/"), null);
});
