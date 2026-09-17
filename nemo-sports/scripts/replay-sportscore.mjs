#!/usr/bin/env node
/**
 * SportScore replay server — e2e test harness.
 * ────────────────────────────────────────────────────────────
 * The sandbox's egress firewall blocks sportscore.com (verified: SSL reset,
 * while github.com works), so this server replays the REAL payloads captured
 * live from https://sportscore.com/api/widget/* so the FULL production stack
 * (adapter → SDL cache → gateway → pages) can be exercised end-to-end.
 * In production (Vercel) the identical code path hits the live API — the
 * base URL is simply the default https://sportscore.com/api/widget.
 *
 * Usage: node scripts/replay-sportscore.mjs [port]   (default 7777)
 * It also reports every upstream "hit" so cache behaviour is observable.
 */

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => JSON.parse(readFileSync(join(here, "../packages/sdl/test/fixtures/sportscore", name), "utf8"));

const feed = () => fx("feed.json");
const detailTemplate = () => fx("match-detail.json");

/* Match detail: synthesize a payload consistent with the requested slug by
 * cloning the captured real payload and rewriting match.url + team names from
 * the feed (the real API returns each slug's own payload; a replay server
 * only has one capture). Players/incidents stay from the template — fine for
 * a rendering harness. */
function detailFor(slug) {
  const m = feed().matches.find((x) => {
    const tail = String(x.url ?? "").replace(/\/+$/, "").split("/").pop();
    return tail === slug;
  });
  if (!m) return { error: "not found" };
  const d = detailTemplate();
  d.match = { ...d.match, home: m.home, away: m.away, url: `/football/match/${slug}/` };
  return d;
}

const ROUTES = {
  "/api/widget/matches/": (q) => (q.get("sport") === "football" ? feed() : { error: "unsupported sport" }),
  "/api/widget/match/": (q) => detailFor(q.get("slug") ?? ""),
  "/api/widget/standings/": (q) =>
    q.get("slug") === "uefa-champions-league" ? fx("standings.json") : { error: "No current season" },
  "/api/widget/topscorers/": (q) =>
    q.get("slug") === "uefa-champions-league" ? fx("topscorers.json") : { error: "No current season" },
  "/api/widget/player/": (q) => (q.get("slug") === "erling-haaland" ? fx("player.json") : { error: "not found" }),
};

let hits = 0;
let failing = false;

const server = createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname === "/__control") {
    const action = u.searchParams.get("set");
    if (action === "fail") failing = true;
    if (action === "ok") failing = false;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, failing, hits }));
    return;
  }
  hits++;
  if (failing) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "upstream exploded (simulated)" }));
    return;
  }
  const handler = ROUTES[u.pathname];
  const body = handler ? handler(u.searchParams) : { error: "unknown endpoint" };
  res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body));
});

const port = Number(process.argv[2] ?? 7777);
server.listen(port, "127.0.0.1", () => {
  console.log(`[replay] SportScore replay on http://127.0.0.1:${port} (set /__control?set=fail to simulate outage)`);
});
