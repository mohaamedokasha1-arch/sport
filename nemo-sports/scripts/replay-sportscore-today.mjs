#!/usr/bin/env node
/**
 * SportScore replay for TODAY — end-to-end harness for the live-consistency fix.
 * ────────────────────────────────────────────────────────────────────────────
 * Serves the provider's CURRENT payload shapes (captured 2026-10-11: permalinks
 * with a trailing id, coarse `status` + real `status_text` such as "Half time",
 * "1st half", "2nd quarter", `upcoming`+"Postponed") for several sports, with
 * kickoffs shifted relative to "now" so the harness works whenever it runs.
 *
 *   node scripts/replay-sportscore-today.mjs [port]      (default 7788)
 *   GET /__control?set=fail            every endpoint answers 502 (outage)
 *   GET /__control?set=fail&sport=basketball   only that sport fails
 *   GET /__control?set=ok              recover
 *   GET /__expected                    the counts a correct site must show
 *
 * Point the app at it with SPORTSCORE_BASE_URL=http://127.0.0.1:<port>/api/widget
 *   (the REST v1 root is derived from the same host: /api/v1/fixtures/)
 */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => JSON.parse(readFileSync(join(here, "../packages/sdl/test/fixtures/sportscore", name), "utf8"));
const MIN = 60_000;

/** UTC instant of today's midnight in Africa/Cairo. */
function cairoMidnight(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  const sinceMidnight = ((Number(parts.hour) % 24) * 60 + Number(parts.minute)) * MIN;
  return Math.floor((now - sinceMidnight) / MIN) * MIN;
}

const iso = (ms) => new Date(ms).toISOString().replace(".000Z", "+00:00");
const logo = (sport, n) => `https://img.thesports.com/${sport}/team/${n}.png`;
function m(sport, home, away, slug, id, status, status_text, kickoff, hs, as, competition, opts = {}) {
  return {
    home, away,
    home_logo: opts.noHomeLogo ? "" : logo(sport, `${slug}-h`),
    away_logo: logo(sport, `${slug}-a`),
    home_score: hs === null ? null : String(hs), away_score: as === null ? null : String(as),
    status, status_text, time: iso(kickoff), competition,
    competition_logo: null,
    url: `/${sport}/match/${slug}/${id}/`,
  };
}

function feeds(now) {
  // Keep every kickoff inside today's Cairo day (except the overnight case), so
  // the counts the harness expects never depend on what time it runs.
  const mid = cairoMidnight(now);
  const sinceMid = now - mid;
  const ago = (min) => Math.max(mid + 2 * MIN, now - Math.min(min * MIN, Math.max(0, sinceMid - 2 * MIN)));
  const ahead = (min) => Math.min(mid + 24 * 60 * MIN - 2 * MIN, now + min * MIN);
  const football = [
    m("football", "São Paulo - SP", "Vitória - BA", "sao-paulo-vs-vitoria-ba", "k82rekhg0vyzrep", "live", "Half time", ago(50), 1, 1, "Brazilian Serie A"),
    m("football", "Universitario De Deportes", "FBC Melgar", "universitario-de-deportes-vs-fbc-melgar", "l5ergph4je8er8k", "live", "2nd half", ago(65), 0, 1, "Peruvian Liga 1"),
    m("football", "La Tribu de Cd. Juarez", "FC Santiago", "la-tribu-de-cd-juarez-vs-fc-santiago", "zp5rzgh3ydezq82", "live", "1st half", ago(20), 0, 0, "MEX Liga Premier"),
    m("football", "Vaqueros Reynosa", "Atletico Saltillo", "atletico-saltillo-vs-vaqueros-reynosa", "1l4rjnhnydpxm7v", "live", "61'", ago(70), 1, 1, "MEX Liga Premier", { noHomeLogo: true }),
    m("football", "River Plate", "Estudiantes Rio Cuarto", "river-plate-vs-estudiantes-rio-cuarto", "y0or5jh8w69jqwz", "live", "45+2'", ago(48), 1, 0, "Argentine Division 1"),
    // kicked off before Cairo midnight and still running → belongs to "today"
    m("football", "Corpus Christi FC", "FC Naples", "corpus-christi-fc-vs-fc-naples", "4jwq2ghngxd2m0v", "live", "2nd half", mid - 10 * MIN, 0, 0, "USL League One"),
    m("football", "Pembroke Hamilton Club", "Devonshire Cougars", "pembroke-hamilton-club-vs-devonshire-cougars", "dn1m1gh9vy09moe", "upcoming", "Postponed", ago(30), null, null, "Bermuda Premier League"),
    m("football", "Al Ahly", "Zamalek", "al-ahly-vs-zamalek", "ahlyzam00000001", "upcoming", "", ahead(120), null, null, "Egyptian Premier League"),
    m("football", "Pyramids FC", "Ismaily SC", "pyramids-fc-vs-ismaily-sc", "pyrism00000001", "upcoming", "Delayed", ahead(180), null, null, "Egyptian Premier League"),
    m("football", "Inter Miami CF", "Cruz Azul", "cruz-azul-vs-inter-miami-cf", "imcz00000000001", "finished", "Finished", ago(180), 2, 0, "CONCACAF League Champions Cup"),
  ];
  const basketball = [
    m("basketball", "Miami Heat", "Minnesota Timberwolves", "miami-heat-vs-minnesota-timberwolves", "b0000000000001", "live", "2nd quarter", ago(40), 46, 49, "National Basketball Association"),
    m("basketball", "Boston Celtics", "Philadelphia 76ers", "boston-celtics-vs-philadelphia-76ers", "b0000000000002", "live", "Halftime", ago(55), 46, 33, "National Basketball Association"),
    m("basketball", "Quimsa", "Boca Juniors", "quimsa-vs-boca-juniors", "b0000000000003", "live", "3rd quarter", ago(60), 44, 54, "Argentinian Liga Nacional de Bosquetbol"),
    m("basketball", "Golden State Warriors", "Sacramento Kings", "golden-state-warriors-vs-sacramento-kings", "b0000000000004", "upcoming", "", ahead(240), null, null, "National Basketball Association"),
  ];
  const tennis = [m("tennis", "Carlos Alcaraz", "Jannik Sinner", "carlos-alcaraz-vs-jannik-sinner", "t000000000001", "live", "2nd set", ago(45), 1, 0, "ATP Shanghai")];
  return { football, basketball, tennis, cricket: [] };
}

function expected(now) {
  const f = feeds(now);
  const live = (list) => list.filter((x) => x.status === "live").length;
  return {
    live: { football: live(f.football), basketball: live(f.basketball), tennis: live(f.tennis), cricket: 0, total: live(f.football) + live(f.basketball) + live(f.tennis) },
    postponed: ["pembroke-hamilton-club-vs-devonshire-cougars"],
    halftime: ["sao-paulo-vs-vitoria-ba", "boston-celtics-vs-philadelphia-76ers"],
    noFabricatedMinute: ["la-tribu-de-cd-juarez-vs-fc-santiago", "miami-heat-vs-minnesota-timberwolves"],
    overnightLive: "corpus-christi-fc-vs-fc-naples",
  };
}

const failing = new Set();
let hits = 0;

function detail(sport, slug, now) {
  const all = feeds(now)[sport] ?? [];
  const found = all.find((x) => x.url.split("/")[3] === slug);
  if (!found) return { error: "not found" };
  const minute = /^\d+/.test(found.status_text) ? String(parseInt(found.status_text, 10)) : found.status === "live" ? "52" : null;
  return { sport, match: { ...found, live_minute: minute, incidents: [], stats: [], lineups: null }, updated: new Date(now).toISOString() };
}

const server = createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify(body));
  };
  const now = Date.now();
  if (u.pathname === "/__control") {
    const set = u.searchParams.get("set");
    const sport = u.searchParams.get("sport") ?? "*";
    if (set === "fail") failing.add(sport);
    if (set === "ok") failing.clear();
    return send(200, { ok: true, failing: [...failing], hits });
  }
  if (u.pathname === "/__expected") return send(200, expected(now));
  hits++;
  const sport = u.searchParams.get("sport") ?? "football";
  if (failing.has("*") || failing.has(sport)) return send(502, { error: "upstream exploded (simulated)" });
  if (u.pathname === "/api/widget/matches/") {
    const list = feeds(now)[sport];
    if (!list) return send(200, { error: "unsupported sport" });
    return send(200, { sport, count: list.length, matches: list, updated: new Date(now).toISOString() });
  }
  // REST v1 day endpoint (documented: fixtures for one UTC day, optional competition slug).
  // The Egyptian 2026-10-12 answer is the REAL captured payload; every other day is
  // derived from this harness's own kickoffs, so other days are honest empties.
  if (u.pathname === "/api/v1/fixtures/") {
    const date = u.searchParams.get("date") ?? "";
    const comp = u.searchParams.get("competition");
    if (date === "2026-10-12" && comp === "egyptian-premier-league") return send(200, fx("v1-fixtures-egypt-2026-10-12.json"));
    const list = (feeds(now)[sport] ?? []).filter((m) => m.time.slice(0, 10) === date && (!comp || m.competition.toLowerCase().replace(/\s+/g, "-") === comp));
    return send(200, { sport, date, count: list.length, matches: list });
  }
  if (u.pathname === "/api/widget/match/") return send(200, detail(sport, u.searchParams.get("slug") ?? "", now));
  if (u.pathname === "/api/widget/standings/") return send(200, u.searchParams.get("slug") === "uefa-champions-league" ? fx("standings.json") : { error: "No current season" });
  if (u.pathname === "/api/widget/topscorers/") return send(200, u.searchParams.get("slug") === "uefa-champions-league" ? fx("topscorers.json") : { error: "No current season" });
  if (u.pathname === "/api/widget/player/") return send(200, u.searchParams.get("slug") === "erling-haaland" ? fx("player.json") : { error: "not found" });
  return send(404, { error: "unknown endpoint" });
});

const port = Number(process.argv[2] ?? 7788);
server.listen(port, "127.0.0.1", () => console.log(`[replay-today] http://127.0.0.1:${port}/api/widget (control: /__control, expectations: /__expected)`));
