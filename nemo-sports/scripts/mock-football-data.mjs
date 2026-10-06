#!/usr/bin/env node
/**
 * Local Football-Data.org v4 mock — offline development helper.
 * ──────────────────────────────────────────────────────────────
 * Serves the doc-shaped payloads from packages/sdl/test/fixtures/football-data
 * so the whole integration (provider → SDL cache → API routes → pages) can be
 * exercised without a key, without quota and without the internet:
 *
 *   node scripts/mock-football-data.mjs              # listens on :4321
 *   FOOTBALL_DATA_API_KEY=mock \
 *   FOOTBALL_DATA_BASE_URL=http://127.0.0.1:4321/v4 \
 *   npm run dev
 *
 * It refuses to be useful in production: the adapter only ever points here when
 * FOOTBALL_DATA_BASE_URL is set explicitly, and the real key is never involved.
 * The fixture files are the single source of truth, so this mock and the unit
 * tests can never drift apart.
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..", "packages", "sdl", "test", "fixtures", "football-data");
const load = (name) => JSON.parse(readFileSync(join(fixtures, name), "utf8"));

const PORT = Number(process.env.PORT ?? 4321);
const ROUTES = {
  standings: load("standings.json"),
  scorers: load("scorers.json"),
  matches: load("matches.json"),
  restricted: load("restricted-scorers.json"),
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const path = url.pathname.replace(/^\/v4/, "");
  const json = (status, body) => {
    res.writeHead(status, { "content-type": "application/json", "x-requests-available-minute": "9" });
    res.end(JSON.stringify(body));
  };

  // `/competitions/{code}/scorers?simulate=restricted` replays the paid-plan 403
  if (path.endsWith("/scorers")) {
    if (url.searchParams.get("simulate") === "restricted") return json(403, ROUTES.restricted);
    return json(200, ROUTES.scorers);
  }

  /* Teams. Derived from the standings fixture rather than a new file, so the
   * fixture set stays the single source of truth and this mock cannot drift
   * from the unit tests. `/teams/{id}` is what FootballDataAdapter.getTeam()
   * calls; `/competitions/{code}/teams` is football-data.org's list endpoint.
   * Unknown ids answer a real 404 — the authoritative not_found the SDL chain
   * needs in order to give /teams/[slug] a stable 404 instead of a 500. */
  /* Only the TOTAL group is the real league table; HOME/AWAY are filtered views
   * of the same teams. Flat-mapping every group would list team 64 three times,
   * which the real adapter never does (it skips non-TOTAL groups) — mirroring
   * that here keeps the mock from teaching a test the wrong shape. */
  const TEAM_ROWS = ROUTES.standings.standings
    .filter((s) => String(s.type ?? "TOTAL").toUpperCase() === "TOTAL")
    .flatMap((s) => s.table);
  const teamById = (id) => TEAM_ROWS.find((r) => String(r.team.id) === String(id))?.team ?? null;

  const teamMatch = path.match(/^\/teams\/([^/?]+)$/);
  if (teamMatch) {
    const team = teamById(teamMatch[1]);
    if (!team) return json(404, { message: `team ${teamMatch[1]} not found`, errorCode: 404 });
    return json(200, {
      ...team,
      area: ROUTES.standings.area ?? { id: 2072, name: "England", code: "ENG" },
      // Deliberately omitted rather than invented: `founded`, `venue` and
      // `clubColors` are not in the fixture, and the adapter maps a missing
      // field to null. Fabricating them here would let a bug hide.
      address: null,
      website: null,
    });
  }

  if (/^\/competitions\/[A-Z0-9]+\/teams$/.test(path)) {
    return json(200, { count: TEAM_ROWS.length, competition: ROUTES.standings.competition, teams: TEAM_ROWS.map((r) => r.team) });
  }

  /* `GET /competitions/{code}/matches` — a competition's fixtures. This is the
   * endpoint FootballDataAdapter.getFixtures() calls whenever a competition id
   * is supplied, so without it a team page (which loads its league's fixtures
   * and filters them down to that team) always came back empty even though the
   * matches were sitting in ROUTES.matches. Unknown codes answer a real 404 so
   * the SDL aggregates not_found rather than a silent empty list. */
  const compMatches = path.match(/^\/competitions\/([A-Z0-9]+)\/matches$/);
  if (compMatches) {
    const code = compMatches[1];
    const known = code === (ROUTES.standings.competition?.code ?? "PL") || ROUTES.matches.matches.some((m) => (m.competition?.code ?? "") === code);
    if (!known) return json(404, { message: `competition ${code} not found`, errorCode: 404 });
    const rows = ROUTES.matches.matches.filter((m) => (m.competition?.code ?? "") === code);
    return json(200, { filters: { competition: code }, resultSet: ROUTES.matches.resultSet ?? { count: rows.length }, competition: ROUTES.standings.competition, matches: rows });
  }

  if (path.endsWith("/standings")) return json(200, ROUTES.standings);

  /* `GET /matches/{id}` — the single-match endpoint. Football-Data.org really
   * has it, and FootballDataAdapter.getMatchDetail() calls it expecting ONE
   * FdMatch object. Returning the whole list here made every match-detail
   * lookup normalize into an identity-less shell, so /matches/<id> could never
   * render and the sitemap advertised URLs that 404. An unknown id answers a
   * real 404, which is the authoritative not_found the SDL's chain aggregation
   * needs in order to give dynamic pages a stable 404 instead of a 500. */
  const detail = path.match(/^\/matches\/([^/?]+)$/);
  if (detail) {
    const id = Number(detail[1]);
    const found = Number.isFinite(id) ? ROUTES.matches.matches.find((m) => m.id === id) : null;
    if (!found) return json(404, { message: `match ${detail[1]} not found`, errorCode: 404 });
    return json(200, found);
  }

  if (path.startsWith("/matches")) return json(200, ROUTES.matches);
  if (path === "/competitions") return json(200, { count: 12, competitions: [{ code: "PL" }, { code: "PD" }] });
  if (/^\/competitions\/[A-Z0-9]+$/.test(path)) {
    return json(200, { id: 2021, name: "Premier League", code: path.split("/").pop(), type: "LEAGUE", emblem: null, area: { name: "England", code: "ENG" } });
  }
  return json(404, { message: "mock has no payload for " + path, errorCode: 404 });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Football-Data.org mock → http://127.0.0.1:${PORT}/v4 (fixtures from packages/sdl/test/fixtures/football-data)`);
  console.log("Point the app at it with FOOTBALL_DATA_BASE_URL and any FOOTBALL_DATA_API_KEY value.");
});
