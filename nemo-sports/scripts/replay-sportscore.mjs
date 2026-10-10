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
const basketballFeed = () => fx("feed-basketball.json");
const detailTemplate = () => fx("match-detail.json");

/* Match detail: synthesize a payload consistent with the requested slug by
 * cloning the captured real payload and rewriting match.url + team names from
 * the feed (the real API returns each slug's own payload; a replay server
 * only has one capture). Players/incidents stay from the template — fine for
 * a rendering harness. */
function detailFor(slug, sport) {
  /* Search every replayed feed, not just football: a slug only resolves if the
   * provider knows it, and which feed it came from is what tells the caller
   * which sport it must ask for. */
  const sources = [feed(), basketballFeed()];
  for (const source of sources) {
    const m = source.matches.find((x) => {
      const tail = String(x.url ?? "").replace(/\/+$/, "").split("/").pop();
      return tail === slug;
    });
    if (!m) continue;
    const d = detailTemplate();
    /* Copy the fields this match owns from the feed. The captured template is
     * one football match; leaving its score/time/periods in place would make a
     * replayed basketball or tennis page report the wrong result, teaching the
     * harness the wrong thing. */
    const { home_score, away_score, time, status, status_text } = m;
    d.match = {
      ...d.match,
      home: m.home,
      away: m.away,
      competition: m.competition,
      home_score,
      away_score,
      time,
      status,
      status_text,
      // The template's incidents belong to another fixture entirely.
      incidents: [],
      // Same reasoning for the template's stats / lineups / tracker: they
      // describe a different fixture, so a replayed non-football page must not
      // show a 4-3-3 football formation.
      stats: null,
      lineups: null,
      tracker: null,
      home_ht_score: null,
      away_ht_score: null,
      live_minute: null,
      url: `/${sport || "football"}/match/${slug}/`,
    };
    return d;
  }
  return { error: "not found" };
}

const ROUTES = {
  /* A provider that covers a sport but has nothing scheduled for it answers
   * with an EMPTY feed — that is what the real API does, and the distinction
   * matters: answering `{error:...}` makes the SDL record a provider failure,
   * and three of those in a row flip SportScore's circuit breaker to "down",
   * which costs the whole site its provider data (including football) for the
   * cooldown. Returning [] keeps the honest "no fixtures" state honest. */
  "/api/widget/matches/": (q) => {
    const sport = q.get("sport");
    if (sport === "basketball") return basketballFeed();
    if (sport === "football") return feed();
    return { sport, count: 0, matches: [], updated: new Date().toISOString() };
  },
  "/api/widget/match/": (q) => detailFor(q.get("slug") ?? "", q.get("sport") ?? ""),
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
  if (process.env.REPLAY_LOG) console.log(`[replay] ${req.method} ${req.url}`);
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
