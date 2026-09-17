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
  if (path.endsWith("/standings")) return json(200, ROUTES.standings);
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
