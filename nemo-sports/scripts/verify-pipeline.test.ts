import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Data pipeline — offline contract tests.
 * ───────────────────────────────────────
 * These exercise the shipped functions (never copies), with a fake transport
 * and NO database and NO network — the same conditions CI runs under.
 *
 * What is pinned here is what an operator would be angry to lose:
 *
 *   · the registry (endpoints.yml) parses, validates, and keeps the brief's
 *     priority order with the two scrape switches closed;
 *   · the committed JSON mirror cannot drift from the YAML;
 *   · robots.txt is obeyed, including "longest match wins" and Crawl-delay;
 *   · retries happen for 429/5xx only, `Retry-After` is honoured, and a 4xx is
 *     never retried;
 *   · a lower-priority source never overwrites a higher-priority value, and the
 *     disagreement is reported;
 *   · every normalizer maps real-shaped payloads and counts what it skipped;
 *   · a source whose licence/credentials are missing is skipped, not called.
 */

import { parseYaml, YamlLiteError } from "../lib/pipeline/yaml-lite";
import { loadPipelineConfig, validatePipelineConfig, sourceGate, competitionBySlug, jobByName, configurationReport } from "../lib/pipeline/config";
import { EMPTY_ROBOTS, parseRobots, robotsDecision, selectGroup } from "../lib/pipeline/robots";
import { decideField, rankOf, sortByPriority } from "../lib/pipeline/priority";
import { normalizeFdStandings, normalizeFdMatches, normalizeFdSeasons } from "../lib/pipeline/normalizers/football-data";
import { normalizeTsdMatches, normalizeTsdTable, discoverLeagueId, tsdStatus } from "../lib/pipeline/normalizers/thesportsdb";
import { normalizeWebMatches, normalizeWebStandings } from "../lib/pipeline/normalizers/egyptian-sites";
import { extractTables, extractJsonLd, parseDateCell, parseScoreCell } from "../lib/pipeline/normalizers/web";
import { PipelineHttp } from "../lib/pipeline/http";
import { CollectingPipelineLogger } from "../lib/pipeline/state";
import { runJob } from "../lib/pipeline/runner";

const ROOT = join(import.meta.dirname, "..");
const YAML = readFileSync(join(ROOT, "config/pipeline/endpoints.yml"), "utf8");
const JSON_MIRROR = JSON.parse(readFileSync(join(ROOT, "config/pipeline/endpoints.json"), "utf8")) as unknown;

/* ─── registry ───────────────────────────────────────────────────────────── */

test("endpoints.yml parses and validates", () => {
  const raw = parseYaml(YAML);
  const cfg = validatePipelineConfig(raw, "yaml");
  assert.equal(cfg.version, 1);
  assert.deepEqual(cfg.priority, ["egyptianproleague", "efa", "fifa", "football_data", "thesportsdb"]);
  assert.equal(cfg.sources.length, 5);
  for (const expected of ["egyptian-premier-league", "egypt-cup", "egyptian-super-cup"]) {
    assert.ok(competitionBySlug(cfg, expected), `missing competition ${expected}`);
  }
});

test("priority ranks follow the registry order (EPL first, TheSportsDB last)", () => {
  const cfg = loadPipelineConfig();
  assert.equal(rankOf(cfg, "egyptianproleague"), 0);
  assert.equal(rankOf(cfg, "thesportsdb"), 4);
  assert.deepEqual(sortByPriority(cfg, ["thesportsdb", "efa", "football_data"]), ["efa", "football_data", "thesportsdb"]);
});

test("the committed JSON mirror matches the YAML", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(parseYaml(YAML))) as unknown, JSON.parse(JSON.stringify(JSON_MIRROR)) as unknown);
});

test("scrape sources stay closed until licence AND env switch are set", () => {
  const cfg = loadPipelineConfig();
  const epl = cfg.sources.find((s) => s.name === "egyptianproleague")!;
  assert.equal(epl.mode, "scrape");
  assert.equal(epl.enabled, false);
  assert.equal(epl.scraping_licensed, false);
  assert.equal(epl.policy.respect_robots, true);

  // closed by default, and closed even if the env switch alone is flipped
  assert.equal(sourceGate(epl, {}).callable, false);
  assert.equal(sourceGate(epl, { PIPELINE_SCRAPING_LICENSED: "1" }).callable, false);

  // open only when the operator has done all three: enabled, licensed, env
  const licensed = { ...epl, enabled: true, scraping_licensed: true };
  assert.equal(sourceGate(licensed, {}).callable, false);
  assert.equal(sourceGate(licensed, { PIPELINE_SCRAPING_LICENSED: "1" }).callable, true);
});

test("API sources need their credential in the environment, never in the file", () => {
  const cfg = loadPipelineConfig();
  const fd = cfg.sources.find((s) => s.name === "football_data")!;
  assert.equal(fd.auth?.env, "FOOTBALL_DATA_API_KEY");
  assert.equal(sourceGate(fd, {}).callable, false);
  assert.equal(sourceGate(fd, { FOOTBALL_DATA_API_KEY: "k" }).callable, true);
  assert.ok(!YAML.includes("X-Auth-Token:"), "the registry must not carry a credential value");
  const report = configurationReport(cfg);
  assert.ok(report.sources.every((s) => s.endpoints.length > 0));
});

test("job cadence matches the brief (2-5 min on match days, weekly catalogs)", () => {
  const cfg = loadPipelineConfig();
  const matches = jobByName(cfg, "matches")!;
  const standings = jobByName(cfg, "standings")!;
  const competitions = jobByName(cfg, "competitions")!;
  assert.ok(matches.matchday_interval_minutes! >= 2 && matches.matchday_interval_minutes! <= 5);
  assert.ok(matches.interval_minutes >= 30 && matches.interval_minutes <= 60);
  assert.ok(standings.interval_minutes >= 360 && standings.interval_minutes <= 720);
  assert.equal(competitions.interval_minutes, 7 * 24 * 60);
  assert.ok((matches.min_interval_minutes ?? 0) >= 2);
});

test("yaml-lite rejects the dangerous constructs instead of guessing", () => {
  assert.throws(() => parseYaml("a: 1\na: 2"), YamlLiteError);
  assert.throws(() => parseYaml("a:\n\tb: 1"), YamlLiteError);
  assert.throws(() => parseYaml("a: &anchor 1"), YamlLiteError);
  assert.throws(() => parseYaml("a: |\n  text"), YamlLiteError);
  assert.deepEqual(parseYaml("a: [1, two, true]\nb: {c: 3}"), { a: [1, "two", true], b: { c: 3 } });
  assert.deepEqual(parseYaml("list:\n  - x: 1\n    y: 2\n  - x: 3"), { list: [{ x: 1, y: 2 }, { x: 3 }] });
  assert.deepEqual(parseYaml("# only a comment\na: \"# not a comment\""), { a: "# not a comment" });
});

/* ─── robots.txt ─────────────────────────────────────────────────────────── */

test("robots.txt decisions follow longest-match with Allow winning ties", () => {
  const robots = parseRobots(
    ["User-agent: *", "Disallow: /", "Allow: /matches", "", "User-agent: NemoSportsDataBot", "Disallow: /private", "Allow: /private/ok", "Crawl-delay: 5"].join("\n"),
  );
  assert.equal(selectGroup(robots, "NemoSportsDataBot/1.0")?.crawlDelaySeconds, 5);
  // our own token has a dedicated group, which replaces the `*` group entirely
  assert.equal(robotsDecision(robots, "/private/x", "NemoSportsDataBot").allowed, false);
  assert.equal(robotsDecision(robots, "/private/ok/x", "NemoSportsDataBot").allowed, true);
  // an agent with no dedicated group falls back to `*`: longest match wins
  assert.equal(robotsDecision(robots, "/matches/1", "OtherBot").allowed, true);
  assert.equal(robotsDecision(robots, "/news", "OtherBot").allowed, false);

  // An empty (but fetched) robots.txt means "no rules" — distinct from a
  // robots.txt we could not read at all, which is recorded as `no-file`.
  assert.equal(robotsDecision(parseRobots(""), "/anything", "NemoSportsDataBot").rule, "no-rule");
  assert.equal(robotsDecision(EMPTY_ROBOTS, "/anything", "NemoSportsDataBot").rule, "no-file");
  assert.equal(robotsDecision(parseRobots("User-agent: *\nDisallow: /matches*"), "/matches/2025", "NemoSportsDataBot").allowed, false);
});

/* ─── priority & conflicts ───────────────────────────────────────────────── */

test("a lower-priority source cannot overwrite a higher-priority value", () => {
  const cfg = loadPipelineConfig();
  const decision = decideField(cfg, { field: "homeScore", stored: 2, incoming: 3, storedSource: "egyptianproleague", incomingSource: "thesportsdb" });
  assert.equal(decision.value, 2);
  assert.equal(decision.applied, false);
  assert.equal(decision.conflict, true);
  assert.equal(decision.reason, "existing-wins");
});

test("a higher-priority source wins and the disagreement is flagged", () => {
  const cfg = loadPipelineConfig();
  const decision = decideField(cfg, { field: "homeScore", stored: 2, incoming: 3, storedSource: "thesportsdb", incomingSource: "egyptianproleague" });
  assert.equal(decision.value, 3);
  assert.equal(decision.applied, true);
  assert.equal(decision.conflict, true);
});

test("a provider correcting its own value is not a conflict", () => {
  const cfg = loadPipelineConfig();
  const decision = decideField(cfg, { field: "status", stored: "scheduled", incoming: "live", storedSource: "football_data", incomingSource: "football_data" });
  assert.equal(decision.value, "live");
  assert.equal(decision.conflict, false);
  assert.equal(decision.reason, "same-source");
});

test("equal values never produce a conflict, kickoff tolerance is respected", () => {
  const cfg = loadPipelineConfig();
  assert.equal(decideField(cfg, { field: "status", stored: "live", incoming: "live", storedSource: "efa", incomingSource: "thesportsdb" }).conflict, false);
  const scheduled = decideField(cfg, {
    field: "scheduledAt",
    stored: "2025-09-12T18:00:00.000Z",
    incoming: "2025-09-12T18:00:30.000Z",
    storedSource: "football_data",
    incomingSource: "thesportsdb",
    equal: (a, b) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 60_000,
  });
  assert.equal(scheduled.conflict, false);
});

/* ─── normalizers: Football-Data.org ─────────────────────────────────────── */

const FD_STANDINGS = {
  competition: { id: 2021, name: "Premier League" },
  season: { startDate: "2025-08-15", endDate: "2026-05-24" },
  standings: [
    {
      stage: "REGULAR_SEASON",
      type: "TOTAL",
      group: null,
      table: [
        { position: 1, team: { id: 57, name: "Arsenal", shortName: "Arsenal" }, playedGames: 10, form: "WWDLW", won: 7, draw: 2, lost: 1, points: 23, goalsFor: 20, goalsAgainst: 8 },
        { position: 2, team: { id: 61, name: "Chelsea" }, playedGames: 10, won: 6, draw: 3, lost: 1, points: 21, goalsFor: 18, goalsAgainst: 9 },
      ],
    },
    { stage: "REGULAR_SEASON", type: "HOME", group: null, table: [{ position: 1, team: { id: 57, name: "Arsenal" }, playedGames: 5, points: 13 }] },
  ],
};

test("football-data standings: only the TOTAL table is used", () => {
  const result = normalizeFdStandings(FD_STANDINGS, { competitionSlug: "england-premier-league", source: "football_data", endpoint: "standings", seasonName: "2025-2026" });
  assert.equal(result.items.length, 2);
  assert.equal(result.skipped, 0);
  assert.equal(result.items[0]!.teamName, "Arsenal");
  assert.equal(result.items[0]!.points, 23);
  assert.equal(result.items[0]!.seasonName, "2025-2026");
  assert.ok(result.items[0]!.sourceId.includes("57"));
});

test("football-data matches: statuses, scores, matchday", () => {
  const payload = {
    competition: { id: 2021 },
    season: { startDate: "2025-08-15", endDate: "2026-05-24" },
    matches: [
      { id: 1, utcDate: "2025-08-15T19:00:00Z", status: "FINISHED", matchday: 1, homeTeam: { id: 57, name: "Arsenal" }, awayTeam: { id: 66, name: "Man Utd" }, score: { fullTime: { home: 2, away: 1 } } },
      { id: 2, utcDate: "2025-08-22T14:00:00Z", status: "IN_PLAY", matchday: 2, homeTeam: { id: 61, name: "Chelsea" }, awayTeam: { id: 62, name: "Everton" }, score: { fullTime: { home: null, away: null } } },
      { id: 3, utcDate: null, status: "SCHEDULED", homeTeam: { id: 1, name: "X" }, awayTeam: { id: 2, name: "Y" } },
    ],
  };
  const result = normalizeFdMatches(payload, { competitionSlug: "england-premier-league", source: "football_data", endpoint: "matches", seasonName: "2025-2026" });
  assert.equal(result.items.length, 2);
  assert.equal(result.skipped, 1);
  assert.equal(result.items[0]!.status, "finished");
  assert.equal(result.items[0]!.homeScore, 2);
  assert.equal(result.items[0]!.round, "MD1");
  assert.equal(result.items[1]!.status, "live");
  assert.equal(result.items[1]!.homeScore, null);
});

test("football-data seasons are derived from the season date window", () => {
  const payload = { id: 2021, seasons: [{ id: 1, startDate: "2025-08-15", endDate: "2026-05-24" }, { id: 2, startDate: "2024-08-16", endDate: "2025-05-25" }] };
  const result = normalizeFdSeasons(payload, { competitionSlug: "england-premier-league", source: "football_data", endpoint: "competition", seasonName: null });
  assert.deepEqual(result.items.map((s) => s.name), ["2025-2026", "2024-2025"]);
});

/* ─── normalizers: TheSportsDB ───────────────────────────────────────────── */

test("TheSportsDB accepts both wrapper and bare-array payloads", () => {
  const event = {
    idEvent: "1",
    strHomeTeam: "Al Ahly",
    strAwayTeam: "Zamalek",
    idHomeTeam: "133604",
    idAwayTeam: "133612",
    dateEvent: "2025-09-12",
    strTime: "19:00:00",
    intHomeScore: "2",
    intAwayScore: "1",
    strStatus: "Match Finished",
    strVenue: "Cairo International Stadium",
  };
  const wrapped = normalizeTsdMatches({ events: [event] }, { competitionSlug: "egyptian-premier-league", source: "thesportsdb", endpoint: "season_schedule", seasonName: "2025-2026" });
  const bare = normalizeTsdMatches([event], { competitionSlug: "egyptian-premier-league", source: "thesportsdb", endpoint: "season_schedule", seasonName: "2025-2026" });
  assert.equal(wrapped.items.length, 1);
  assert.deepEqual(bare.items[0], wrapped.items[0]);
  assert.equal(wrapped.items[0]!.status, "finished");
  assert.equal(wrapped.items[0]!.scheduledAt, "2025-09-12T19:00:00.000Z");
});

test("TheSportsDB status text maps onto the canonical vocabulary", () => {
  assert.equal(tsdStatus("Not Started", null), "scheduled");
  assert.equal(tsdStatus("1H", "1H"), "live");
  assert.equal(tsdStatus("HT", "HT"), "halftime");
  assert.equal(tsdStatus("Match Finished", null), "finished");
  assert.equal(tsdStatus("Postponed", null), "postponed");
  assert.equal(tsdStatus("Penalty Shootout", null), "penalty_shootout");
});

test("TheSportsDB table rows and league discovery", () => {
  const table = normalizeTsdTable(
    { table: [{ intPosition: "1", strTeam: "Al Ahly", idTeam: "133604", intPlayed: "5", intWin: "4", intDraw: "1", intLoss: "0", intGoalsFor: "10", intGoalsAgainst: "3", intPoints: "13" }] },
    { competitionSlug: "egyptian-premier-league", source: "thesportsdb", endpoint: "league_table", seasonName: "2025-2026" },
  );
  assert.equal(table.items[0]!.points, 13);
  assert.equal(table.items[0]!.teamName, "Al Ahly");

  const id = discoverLeagueId({ countries: [{ idLeague: "4336", strLeague: "Egyptian Premier League" }] }, "strLeague", "egypt");
  assert.equal(id, "4336");
  assert.equal(discoverLeagueId({ countries: [{ idLeague: "1", strLeague: "English Premier League" }] }, "strLeague", "egypt"), null);
});

/* ─── normalizers: web (EPL · EFA · FIFA) ────────────────────────────────── */

test("HTML tables are extracted with headers and cells", () => {
  const html = `<table><caption>الترتيب</caption><tr><th>#</th><th>الفريق</th><th>لعب</th><th>نقاط</th></tr><tr><td>1</td><td>الأهلي</td><td>5</td><td>13</td></tr></table>`;
  const tables = extractTables(html);
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0]!.headers, ["#", "الفريق", "لعب", "نقاط"]);
  assert.deepEqual(tables[0]!.rows[0], ["1", "الأهلي", "5", "13"]);
});

test("an Arabic standings table is recognised (team + points), junk tables are not", () => {
  const html = `
    <table><tr><th>عنوان</th><th>قيمة</th></tr><tr><td>x</td><td>y</td></tr></table>
    <table>
      <tr><th>#</th><th>الفريق</th><th>لعب</th><th>فاز</th><th>تعادل</th><th>خسر</th><th>له</th><th>عليه</th><th>نقاط</th></tr>
      <tr><td>1</td><td>الأهلي</td><td>5</td><td>4</td><td>1</td><td>0</td><td>10</td><td>3</td><td>13</td></tr>
      <tr><td>2</td><td>الزمالك</td><td>5</td><td>3</td><td>1</td><td>1</td><td>8</td><td>5</td><td>10</td></tr>
    </table>`;
  const result = normalizeWebStandings(html, { competitionSlug: "egyptian-premier-league", source: "egyptianproleague", endpoint: "standings", seasonName: "2025-2026" });
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]!.teamName, "الأهلي");
  assert.equal(result.items[0]!.points, 13);
  assert.equal(result.items[0]!.position, 1);
});

test("schema.org SportsEvent JSON-LD is preferred for fixtures", () => {
  const html = `<html><head><script type="application/ld+json">
    {"@type":"ItemList","itemListElement":[{"@type":"SportsEvent","name":"Al Ahly vs Zamalek","startDate":"2025-09-12T19:00:00Z",
     "homeTeam":{"@type":"SportsTeam","name":"Al Ahly"},"awayTeam":{"@type":"SportsTeam","name":"Zamalek"},
     "location":{"@type":"Place","name":"Cairo Stadium"}}]}
  </script></head><body></body></html>`;
  assert.equal(extractJsonLd(html).length, 1);
  const result = normalizeWebMatches(html, { competitionSlug: "egyptian-premier-league", source: "egyptianproleague", endpoint: "matches", seasonName: "2025-2026" });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]!.homeName, "Al Ahly");
  assert.equal(result.items[0]!.awayName, "Zamalek");
  assert.equal(result.items[0]!.venueName, "Cairo Stadium");
  assert.equal(result.items[0]!.status, "scheduled");
});

test("date and score cells parse in the shapes Egyptian sites publish", () => {
  assert.equal(parseDateCell("12/09/2025"), "2025-09-12T00:00:00Z");
  assert.equal(parseDateCell("2025-09-12"), "2025-09-12T00:00:00Z");
  assert.equal(parseDateCell("12 Sep 2025"), "2025-09-12T00:00:00Z");
  assert.equal(parseDateCell("no date here"), null);
  assert.deepEqual(parseScoreCell("2 - 1"), [2, 1]);
  assert.deepEqual(parseScoreCell("0–0"), [0, 0]);
  assert.equal(parseScoreCell("vs"), null);
});

/* ─── HTTP client ────────────────────────────────────────────────────────── */

const cfg = loadPipelineConfig();

function makeHttp(opts: { responses: (() => Response | Promise<Response>)[]; sleep?: number[]; fetcher?: typeof fetch }) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  let index = 0;
  const fetchImpl: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headers: Record<string, string> = {};
    new Headers(init?.headers ?? {}).forEach((v, k) => {
      headers[k] = v;
    });
    calls.push({ url, headers });
    const next = opts.responses[Math.min(index, opts.responses.length - 1)];
    index += 1;
    if (!next) throw new Error("no response queued");
    return next();
  }) as typeof fetch;

  const sleeps: number[] = [];
  const http = new PipelineHttp(cfg, {
    fetchImpl: opts.fetcher ?? fetchImpl,
    archive: false,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      opts.sleep?.push(ms);
    },
    logger: new CollectingPipelineLogger().log,
  });
  return { http, calls, sleeps };
}

test("a 5xx is retried and a later success is returned", async () => {
  const { http, calls, sleeps } = makeHttp({
    responses: [() => new Response("boom", { status: 503 }), () => Response.json({ ok: true }, { headers: { etag: "abc" } })],
  });
  process.env.FOOTBALL_DATA_API_KEY = "test-key";
  const record = await http.execute("football_data", "competitions", { archive: false });
  assert.equal(record.statusCode, 200);
  assert.equal(record.attempts, 2);
  assert.equal(record.etag, "abc");
  assert.equal(calls.length, 2);
  assert.ok(sleeps.length >= 1, "backoff must be awaited between attempts");
  assert.equal(calls[0]!.headers["x-auth-token"], "test-key");
  assert.ok(record.url.startsWith("https://api.football-data.org/v4/competitions"), record.url);
});

test("429 is retried after Retry-After, a 404 is not retried", async () => {
  const throttled = makeHttp({ responses: [() => new Response("slow down", { status: 429, headers: { "retry-after": "2" } }), () => Response.json({ ok: true })] });
  const ok = await throttled.http.execute("football_data", "competitions", { archive: false });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.attempts, 2);
  assert.equal(throttled.sleeps[0], 2000);

  const missing = makeHttp({ responses: [() => new Response("nope", { status: 404 })] });
  const record = await missing.http.execute("football_data", "competitions", { archive: false });
  assert.equal(record.statusCode, 404);
  assert.equal(record.attempts, 1);
  assert.equal(missing.calls.length, 1);
});

test("304 short-circuits and preserves the stored etag", async () => {
  const { http } = makeHttp({ responses: [() => new Response(null, { status: 304, headers: { etag: "v2" } })] });
  const record = await http.execute("football_data", "standings", { pathParams: { code: "PL" }, archive: false });
  assert.equal(record.notModified, true);
  assert.equal(record.statusCode, 304);
  assert.equal(record.etag, "v2");
  assert.equal(record.payload, null);
});

test("a robots.txt Disallow stops the request before it is sent", async () => {
  const robots = "User-agent: *\nDisallow: /matches";
  const fetcher: typeof fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/robots.txt")) return new Response(robots, { status: 200 });
    throw new Error(`should not have been fetched: ${url}`);
  }) as typeof fetch;

  const cfgWithScrape = { ...cfg, sources: cfg.sources.map((s) => (s.name === "egyptianproleague" ? { ...s, enabled: true, scraping_licensed: true, mode: "scrape" as const } : s)) };
  const http = new PipelineHttp(cfgWithScrape, { fetchImpl: fetcher, archive: false, sleep: async () => {} });
  process.env.PIPELINE_SCRAPING_LICENSED = "1";
  const record = await http.execute("egyptianproleague", "matches", { archive: false });
  assert.equal(record.statusCode, null);
  assert.match(record.error ?? "", /robots\.txt disallows/);
  delete process.env.PIPELINE_SCRAPING_LICENSED;
});

test("a URL outside the configured origin is refused", async () => {
  const { http } = makeHttp({ responses: [() => Response.json({})] });
  const record = await http.execute("football_data", "competitions", { overrideUrl: "https://evil.example.com/steal", archive: false });
  assert.equal(record.statusCode, null);
  assert.match(record.error ?? "", /refusing to fetch/);
});

test("the local budget refuses before the provider is called", async () => {
  const { http, calls } = makeHttp({ responses: [() => Response.json({ ok: true })] });
  process.env.FOOTBALL_DATA_API_KEY = "test-key";
  // rate_limit.per_minute = 8 → the 9th call in the window must be refused
  for (let i = 0; i < 8; i += 1) await http.execute("football_data", "competitions", { archive: false });
  const before = calls.length;
  const refused = await http.execute("football_data", "competitions", { archive: false });
  assert.equal(calls.length, before, "no HTTP call may be made once the budget is exhausted");
  assert.match(refused.error ?? "", /budget exhausted/);
  const budget = http.budget("football_data");
  assert.equal(budget.usedMinute, 8);
});

/* ─── runner (no database, fake transport) ───────────────────────────────── */

test("runJob skips gated sources with a reason and never calls their host", async () => {
  const { http } = makeHttp({ responses: [() => Response.json({ competitions: [] })] });
  const logger = new CollectingPipelineLogger();
  delete process.env.FOOTBALL_DATA_API_KEY;
  delete process.env.THESPORTSDB_API_KEY;

  const summary = await runJob("matches", { trigger: "manual", dryRun: true, http, logger: logger.log, force: true });
  assert.equal(summary.job, "matches");
  const epl = summary.sources.find((s) => s.source === "egyptianproleague")!;
  assert.equal(epl.status, "skipped");
  assert.match(epl.reason ?? "", /disabled|licensed/i);
  const fd = summary.sources.find((s) => s.source === "football_data")!;
  assert.equal(fd.status, "skipped");
  assert.match(fd.reason ?? "", /FOOTBALL_DATA_API_KEY/);

  // an unknown job is refused with a clear message
  const unknown = await runJob("nope", { trigger: "manual", dryRun: true, http });
  assert.equal(unknown.ok, false);
  assert.match(unknown.errors[0]!, /unknown job/);
});

test("runJob normalizes a fake provider response end-to-end (dry run)", async () => {
  process.env.FOOTBALL_DATA_API_KEY = "test-key";
  const payload = {
    competition: { id: 2021, code: "PL" },
    season: { startDate: "2025-08-15", endDate: "2026-05-24" },
    matches: [
      { id: 9, utcDate: "2025-09-12T18:00:00Z", status: "FINISHED", matchday: 4, homeTeam: { id: 57, name: "Arsenal" }, awayTeam: { id: 66, name: "Man Utd" }, score: { fullTime: { home: 1, away: 0 } } },
    ],
  };
  const { http } = makeHttp({ responses: [() => Response.json(payload)] });
  const logger = new CollectingPipelineLogger();
  const summary = await runJob("matches", { trigger: "manual", dryRun: true, http, logger: logger.log, force: true, sources: ["football_data"] });

  const fd = summary.sources.find((s) => s.source === "football_data")!;
  assert.equal(fd.status, "ok");
  assert.equal(fd.fetched, 1);
  assert.equal(fd.notes.length > 0 || fd.warnings.length > 0, true);
  assert.ok(logger.lines.some((l) => l.message.startsWith("pipeline.")), "structured log lines must be emitted");
  delete process.env.FOOTBALL_DATA_API_KEY;
});

test("an unverified endpoint is not fetched unless explicitly allowed", async () => {
  process.env.THESPORTSDB_API_KEY = "test-key";
  const { http, calls } = makeHttp({ responses: [() => Response.json({})] });
  let summary = await runJob("standings", { trigger: "manual", dryRun: true, http, force: true, sources: ["thesportsdb"] });
  assert.equal(summary.sources[0]!.fetched, 0);
  assert.equal(calls.length, 0, "an unverified endpoint must not be called by default");

  process.env.PIPELINE_ALLOW_UNVERIFIED_ENDPOINTS = "1";
  summary = await runJob("standings", { trigger: "manual", dryRun: true, http, force: true, sources: ["thesportsdb"] });
  assert.ok(calls.length >= 1, "the explicit override must allow the probe");
  delete process.env.PIPELINE_ALLOW_UNVERIFIED_ENDPOINTS;
  delete process.env.THESPORTSDB_API_KEY;
});

/* ─── regressions found by the first live (mock-backed) run ─────────────── */

test("a job whose every endpoint answers 304 is a success, not a failure", async () => {
  process.env.FOOTBALL_DATA_API_KEY = "test-key";
  const { http, calls } = makeHttp({ responses: [() => new Response(null, { status: 304, headers: { etag: "fd-v1" } })] });
  const summary = await runJob("standings", { trigger: "manual", dryRun: true, http, force: true, sources: ["football_data"] });
  const fd = summary.sources[0]!;
  assert.equal(fd.fetched, 0);
  assert.ok(fd.notModified >= 1, "a 304 must be counted as unchanged");
  assert.equal(fd.failed, 0);
  assert.equal(fd.status, "ok", "\"nothing changed upstream\" is a successful sync");
  assert.equal(summary.ok, true);
  assert.ok(calls.length >= 1, "the conditional request must still be sent");
  delete process.env.FOOTBALL_DATA_API_KEY;
});

test("a robots.txt refusal is a skipped step with a warning, never a failed fetch", async () => {
  const { runConnector } = await import("../lib/pipeline/connectors");
  process.env.PIPELINE_SCRAPING_LICENSED = "1";
  process.env.PIPELINE_ALLOW_UNVERIFIED_ENDPOINTS = "1";
  const fetcher: typeof fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/robots.txt")) return new Response("User-agent: *\nDisallow: /matches", { status: 200 });
    throw new Error(`should not have been fetched: ${url}`);
  }) as typeof fetch;

  const epl = cfg.sources.find((s) => s.name === "egyptianproleague")!;
  const scraped = { ...epl, enabled: true, scraping_licensed: true, mode: "scrape" as const };
  const http = new PipelineHttp({ ...cfg, sources: [scraped] }, { fetchImpl: fetcher, archive: false, sleep: async () => {} });
  const logger = new CollectingPipelineLogger();
  const result = await runConnector(scraped, "matches", { cfg, http, logger: logger.log, runId: null, job: "matches", seasonName: "2025-2026" });

  assert.equal(result.failed, 0, "obeying robots.txt is compliance, not an incident");
  assert.equal(result.skipped, 1, "the refusal must be counted as a skipped step");
  assert.match(result.warnings.join(" "), /robots\.txt disallows/);
  assert.equal(result.fetched, 0);
  delete process.env.PIPELINE_SCRAPING_LICENSED;
  delete process.env.PIPELINE_ALLOW_UNVERIFIED_ENDPOINTS;
});

test("validators merge across jobs of one source, yet stay per endpoint", async () => {
  const { mergeValidatorRows } = await import("../lib/pipeline/state");
  const merged = mergeValidatorRows([
    { cursor: { etags: { standings: "\"html-v1\"", competitions: "\"html-v2\"" }, last_modified: { standings: "Mon, 01 Jan 2026 00:00:00 GMT" } } },
    { cursor: { etags: { matches: "\"fd-v1\"" } } }, // a sibling job (bootstrap vs standings)
    { cursor: "not json at all" }, // a corrupt row must not lose the others
  ]);
  assert.deepEqual(merged.etags, { standings: "\"html-v1\"", competitions: "\"html-v2\"", matches: "\"fd-v1\"" });
  assert.deepEqual(Object.keys(merged.etags).sort(), ["competitions", "matches", "standings"]);
  assert.equal(merged.lastModified.standings, "Mon, 01 Jan 2026 00:00:00 GMT");
  assert.equal(merged.lastModified.matches, undefined, "an endpoint without a validator must not inherit one");
});

/* ─── credentials never leak ─────────────────────────────────────────────── */

test("credential-shaped values are scrubbed from logs", async () => {
  const { scrub } = await import("../lib/pipeline/state");
  const scrubbed = JSON.stringify(
    scrub({
      headers: { "X-Auth-Token": "super-secret", "user-agent": "bot" },
      url: "https://example.com/x?apikey=abc123&page=2",
      nested: { token: "another-one" },
    }),
  );
  assert.ok(!scrubbed.includes("super-secret"));
  assert.ok(!scrubbed.includes("abc123"));
  assert.ok(!scrubbed.includes("another-one"));
  assert.ok(scrubbed.includes("page=2"));
});
