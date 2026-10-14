/**
 * Canonical schema self-healing — offline test against a REAL Postgres.
 * ──────────────────────────────────────────────────────────────────────
 * The production failure this suite pins down:
 *
 *     /api/cron/update-matches → 500
 *     error: relation "sports" does not exist
 *
 * …on a `DATABASE_URL` that was configured but never initialised. Three
 * guarantees are asserted here, in this order:
 *
 *   1. **Auto-migration** (`lib/db/canonical-schema.ts`): one call prepares a
 *      completely empty database — `sports` and every other canonical, pipeline
 *      and read-model table — and the second call sends no DDL at all.
 *   2. **The writes then work**: the pipeline's own functions (`ensureSport`,
 *      `ensureCountry`, `upsertCompetition`, `upsertSeason`, `upsertTeam`,
 *      `upsertMatch`, `recordSourceMapping`) run against that freshly prepared
 *      database and their rows can be read back.
 *   3. **Nothing throws at the caller**: a database that refuses DDL, and any
 *      other unexpected failure, produce a 200 OK from the route with an honest
 *      `ok:false` body — never a 500 with a raw driver message.
 *
 * The database is PGlite (PostgreSQL compiled to WASM, a devDependency): a real
 * Postgres parser and planner, in-process, no server, no network, no data.
 *
 * Run: npm run db:selfheal:test
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

if (process.env.DATABASE_URL) throw new Error("Offline regression tests refuse a configured database");
process.env.NEMO_TEST_MEMORY_ONLY = "1";
process.env.NEMO_SPORTSCORE_ENABLED = "0";
delete process.env.FOOTBALL_DATA_API_KEY;
delete process.env.THESPORTSDB_API_KEY;

import {
  CORE_TABLES,
  SCHEMA_GROUPS,
  SCHEMA_STATEMENTS,
  autoMigrateEnabled,
  ensureCanonicalSchema,
  missingCoreTables,
  resetSchemaBootstrap,
} from "@/lib/db/canonical-schema";
import { ensureCountry, ensureSport, recordSourceMapping, upsertCompetition, upsertMatch, upsertSeason, upsertTeam } from "@/lib/pipeline/upsert";
import { loadPipelineConfig } from "@/lib/pipeline/config";
import { outcomeFor, failureOutcome } from "@/lib/matches-update";
import { sanitizeDbMessage } from "@/lib/db/sanitize";
import type { JobRunSummary, SourceRunSummary } from "@/lib/pipeline";
import type { SqlClient } from "@/packages/sdl/src";
import type { PgDriver } from "@/lib/db/pg";

/* ─── a real Postgres, in process ────────────────────────────────────────── */

/** Adapt PGlite to the driver the app injects — same interface, real Postgres. */
function fromPglite(pg: PGlite): PgDriver {
  const client: PgDriver = {
    async select<T extends object>(sql: string, params: unknown[] = []): Promise<T[]> {
      const result = await pg.query(sql, params as unknown[]);
      return result.rows as T[];
    },
    async run(sql: string, params: unknown[] = []): Promise<void> {
      await pg.query(sql, params as unknown[]);
    },
    // Never called by the pipeline; present because the real driver has it.
    async end() {
      await pg.close();
    },
    // Mirrors lib/db/pg.ts: BEGIN/COMMIT/ROLLBACK on one connection, and a
    // nested call reuses the same transaction instead of opening a second one.
    async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
      await pg.query("BEGIN");
      try {
        const out = await fn({ ...client, transaction: (inner) => inner(client) });
        await pg.query("COMMIT");
        return out;
      } catch (e) {
        await pg.query("ROLLBACK").catch(() => undefined);
        throw e;
      }
    },
  };
  return client;
}

/** A client that answers the existence probe with «nothing exists» and refuses DDL. */
function readOnlyClient(error = "permission denied for schema public"): SqlClient {
  return {
    select: async <T extends object>(sql: string): Promise<T[]> =>
      (sql.includes("to_regclass") ? CORE_TABLES.map((name) => ({ name, present: false })) : []) as unknown as T[],
    run: async () => {
      throw new Error(error);
    },
    transaction: () => {
      throw new Error("no transactions");
    },
  };
}

/* ─── 1 · auto-migration on an empty database ────────────────────────────── */

test("an empty database is prepared in one call: `sports` and every canonical table exist afterwards", async () => {
  const pg = new PGlite();
  const db = fromPglite(pg);
  resetSchemaBootstrap();

  const before = await missingCoreTables(db);
  assert.equal(before.length, CORE_TABLES.length, "a fresh database is missing every table");
  assert.ok(before.includes("sports"), "the failing relation from the incident is among them");

  const result = await ensureCanonicalSchema(db, { force: true });
  assert.equal(result.ok, true, JSON.stringify(result.failures));
  assert.equal(result.ran, true, "DDL was sent because the schema was absent");
  assert.deepEqual(result.missing, [], "nothing is missing after the bootstrap");
  assert.deepEqual(result.failures, []);
  assert.ok(result.created.includes("sports"), `expected sports to be created, got ${result.created.join(",")}`);
  assert.ok(result.created.length >= 20, `expected the whole canonical schema, created ${result.created.length} tables`);

  assert.deepEqual(await missingCoreTables(db), [], "the probe now finds a complete schema");
  await pg.close();
});

test("the second call sends no DDL: a healthy database pays one probe per process", async () => {
  const pg = new PGlite();
  const db = fromPglite(pg);
  resetSchemaBootstrap();

  const first = await ensureCanonicalSchema(db, { force: true });
  assert.equal(first.ran, true);

  const second = await ensureCanonicalSchema(db, { force: true });
  assert.equal(second.ran, false);
  assert.equal(second.reason, "already complete");
  assert.equal(second.ok, true);

  // Memoised for the process: the same verdict comes back without touching the
  // database at all (a client that would throw proves it is never queried).
  resetSchemaBootstrap();
  await ensureCanonicalSchema(db);
  const replayed = await ensureCanonicalSchema(readOnlyClient("this client must never be queried"));
  assert.equal(replayed.ok, true, "the memoised verdict is reused");
  assert.equal(replayed.cached, true, "a replayed verdict is marked as such (so it is not re-logged)");
  await pg.close();
});

test("NEMO_DB_AUTO_MIGRATE=0 switches the runtime DDL off (operators keep db:setup in charge)", async () => {
  const pg = new PGlite();
  resetSchemaBootstrap();
  process.env.NEMO_DB_AUTO_MIGRATE = "0";
  try {
    assert.equal(autoMigrateEnabled(), false);
    const result = await ensureCanonicalSchema(fromPglite(pg), { force: true });
    assert.equal(result.ran, false);
    assert.equal(result.ok, false);
    assert.match(String(result.reason), /disabled/);
    assert.ok((await missingCoreTables(fromPglite(pg))).includes("sports"), "nothing was created");
  } finally {
    delete process.env.NEMO_DB_AUTO_MIGRATE;
    resetSchemaBootstrap();
  }
  await pg.close();
});

/* ─── 2 · the pipeline then reads and writes normally ────────────────────── */

test("after the bootstrap the pipeline's own writes work: sport, country, competition, season, team, match, mapping", async () => {
  const pg = new PGlite();
  const db = fromPglite(pg);
  resetSchemaBootstrap();
  await ensureCanonicalSchema(db, { force: true });

  const cfg = loadPipelineConfig();
  const spec = cfg.competitions[0];
  assert.ok(spec, "the pipeline config lists at least one competition");

  const sportId = await ensureSport(db, "football");
  const countryId = await ensureCountry(db, "EG", "مصر", "Egypt");
  const competitionId = await upsertCompetition(db, spec, sportId, countryId);
  const season = await upsertSeason(db, competitionId, { name: "2026/2027", isCurrent: true, status: "active" });

  const team = { sourceId: "qa-home", name: "QA Home", shortName: null, countryCode: "EG", logoUrl: null, foundedYear: null, venueName: null };
  const away = { sourceId: "qa-away", name: "QA Away", shortName: null, countryCode: "EG", logoUrl: null, foundedYear: null, venueName: null };
  const homeTeam = await upsertTeam(db, cfg, team, { sportId, countryId, source: "demo" });
  const awayTeam = await upsertTeam(db, cfg, away, { sportId, countryId, source: "demo" });

  const match = await upsertMatch(
    db,
    cfg,
    {
      sourceId: "qa-match-1",
      competitionSlug: spec.slug,
      seasonName: "2026/2027",
      round: "1",
      homeSourceId: "qa-home",
      awaySourceId: "qa-away",
      homeName: "QA Home",
      awayName: "QA Away",
      scheduledAt: "2026-10-20T18:00:00.000Z",
      status: "scheduled",
      homeScore: null,
      awayScore: null,
      venueName: null,
    },
    { sportId, competitionId, seasonId: season.id, homeTeamId: homeTeam.id, awayTeamId: awayTeam.id, countryId, source: "demo" },
  );
  await recordSourceMapping(db, { source: "demo", entityType: "match", sourceId: "qa-match-1", internalId: match.id });

  // Read back through the same client: the rows are in the permanent tables.
  const written = await db.select<{ slug: string }>(`SELECT slug FROM sports WHERE id = $1`, [sportId]);
  assert.equal(written[0]?.slug, "football");
  const stored = await db.select<{ status: string; competition_id: string }>(`SELECT status, competition_id FROM matches WHERE id = $1`, [match.id]);
  assert.equal(stored[0]?.status, "scheduled");
  assert.equal(stored[0]?.competition_id, competitionId);
  const mapping = await db.select<{ internal_id: string }>(
    `SELECT internal_id FROM source_id_map WHERE source = $1 AND entity_type = $2 AND source_id = $3`,
    ["demo", "match", "qa-match-1"],
  );
  assert.equal(mapping[0]?.internal_id, match.id);

  // Re-running the same match is idempotent — no duplicate row, no new id.
  const again = await upsertMatch(
    db,
    cfg,
    {
      sourceId: "qa-match-1",
      competitionSlug: spec.slug,
      seasonName: "2026/2027",
      round: "1",
      homeSourceId: "qa-home",
      awaySourceId: "qa-away",
      homeName: "QA Home",
      awayName: "QA Away",
      scheduledAt: "2026-10-20T18:00:00.000Z",
      status: "finished",
      homeScore: 2,
      awayScore: 1,
      venueName: null,
    },
    { sportId, competitionId, seasonId: season.id, homeTeamId: homeTeam.id, awayTeamId: awayTeam.id, countryId, source: "demo" },
  );
  assert.equal(again.id, match.id, "identity is stable across runs");
  const rows = await db.select<{ n: string }>(`SELECT count(*)::text AS n FROM matches`, []);
  assert.equal(rows[0]?.n, "1");
  await pg.close();
});

/* ─── 3 · nothing reaches the caller as an exception ─────────────────────── */

test("a database that refuses DDL is reported, never thrown — and the message is sanitised", async () => {
  resetSchemaBootstrap();
  const result = await ensureCanonicalSchema(readOnlyClient("permission denied for schema public"), { force: true });
  assert.equal(result.ok, false);
  assert.equal(result.ran, true);
  assert.ok(result.failures.length > 0, "every failed statement is recorded");
  assert.match(result.failures[0].error, /permission denied/);
  assert.ok(result.missing.includes("sports"), "what is still missing is named");
  resetSchemaBootstrap();
});

test("the schema error explains the remedy and hides the credentials", () => {
  const cause = new Error("connection to server at «db.example.com» failed: password=sup3r-s3cret");
  const message = sanitizeDbMessage(cause.message);
  assert.ok(!message.includes("sup3r-s3cret"), "a password never reaches a log or a response body");
  assert.match(message, /password=\*\*\*/);
  const url = sanitizeDbMessage("postgres://user:pa55@host/db is unreachable");
  assert.ok(!url.includes("pa55"));
});

/* ─── the response contract of /api/cron/update-matches ──────────────────── */

function source(over: Partial<SourceRunSummary> = {}): SourceRunSummary {
  return {
    source: "sportscore",
    status: "ok",
    fetched: 12,
    notModified: 0,
    failed: 0,
    skipped: 0,
    created: 4,
    updated: 8,
    conflicts: 0,
    warnings: [],
    notes: [],
    durationMs: 120,
    ...over,
  };
}

function run(over: Partial<JobRunSummary> = {}): JobRunSummary {
  return {
    job: "matches",
    trigger: "cron",
    ok: true,
    dryRun: false,
    startedAt: "2026-10-15T04:00:00.000Z",
    durationMs: 900,
    sources: [source()],
    totals: { fetched: 12, created: 4, updated: 8, conflicts: 0, failed: 0, skipped: 0 },
    errors: [],
    ...over,
  };
}

test("every branch of the run→response contract answers 200 OK", () => {
  const success = outcomeFor(run());
  assert.equal(success.http, 200);
  assert.equal(success.body.ok, true);
  assert.equal(success.body.status, "success");

  // Every source skipped (no keys, provider disabled): the run completed and
  // updated nothing — honest in the body, still 200 on the status line.
  const skipped = outcomeFor(
    run({
      ok: false,
      sources: [source({ status: "skipped", reason: "FOOTBALL_DATA_API_KEY is not set", fetched: 0, created: 0, updated: 0 })],
      totals: { fetched: 0, created: 0, updated: 0, conflicts: 0, failed: 0, skipped: 0 },
    }),
  );
  assert.equal(skipped.http, 200);
  assert.equal(skipped.body.ok, false);
  assert.equal(skipped.body.status, "error");
  assert.match(String(skipped.body.message), /no source was called/);

  // A database that could not be written: the source ran, the canonical write
  // failed — the run reports `partial` with the reason in `run.errors`.
  const partial = outcomeFor(
    run({
      ok: false,
      sources: [source({ created: 0, updated: 0, notes: ["canonical write failed: relation \"sports\" does not exist"] })],
      errors: ['sportscore: canonical table «sports» unavailable — automatic schema preparation failed'],
    }),
  );
  assert.equal(partial.http, 200);
  assert.equal(partial.body.status, "partial");

  // Unknown job: nothing ran at all.
  const unknown = outcomeFor(run({ job: "matchs", ok: false, sources: [], errors: ["unknown job «matchs»"] }));
  assert.equal(unknown.http, 200);
  assert.equal(unknown.body.status, "error");
});

test("an unexpected exception is answered 200 with a sanitised reason — never a 500", () => {
  const outcome = failureOutcome(new Error("connect ECONNREFUSED postgres://nemo:hunter2@10.0.0.5:5432/sports"));
  assert.equal(outcome.http, 200);
  assert.equal(outcome.body.ok, false);
  assert.equal(outcome.body.status, "error");
  assert.equal(outcome.body.run, null);
  assert.ok(!JSON.stringify(outcome.body).includes("hunter2"), "no credential in the body");
  assert.match(String(outcome.body.error), /postgres:\/\/\*\*\*@/);
});

/* ─── the code's DDL must stay the SQL files' DDL ────────────────────────── */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SQL_FOR_GROUP: Record<keyof typeof SCHEMA_GROUPS, string> = {
  canonical: "db/schema.sql",
  pipeline: "db/migration-0006-pipeline.sql",
  sportsSync: "db/migration-0007-sports-discovery.sql",
};

/** Objects whose SQL files hold a different, equivalent form (conditional DO blocks). */
const REWRITTEN_ELSEWHERE = new Set(["fk_competitions_current_season", "audit_log_rules", "trg_*_updated"]);

function normalize(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/;$/, "")
    .replace(/if not exists /gi, "")
    .toLowerCase();
}

test("the bootstrap DDL is exactly the DDL of db/schema.sql and the migrations (no drift)", () => {
  const files = Object.fromEntries(
    Object.entries(SQL_FOR_GROUP).map(([group, file]) => [group, normalize(readFileSync(join(ROOT, file), "utf8"))]),
  ) as Record<keyof typeof SCHEMA_GROUPS, string>;

  let checked = 0;
  for (const [group, statements] of Object.entries(SCHEMA_GROUPS) as [keyof typeof SCHEMA_GROUPS, typeof SCHEMA_STATEMENTS][]) {
    for (const statement of statements) {
      if (REWRITTEN_ELSEWHERE.has(statement.object)) continue;
      const needle = normalize(statement.sql);
      assert.ok(
        files[group].includes(needle),
        `«${statement.object}» in the bootstrap does not match ${SQL_FOR_GROUP[group]} — the runtime DDL and the reviewed DDL must be the same statement`,
      );
      checked += 1;
    }
  }
  assert.ok(checked > 60, `expected the whole schema to be cross-checked, only ${checked} statements were`);
  assert.equal(SCHEMA_STATEMENTS.length, Object.values(SCHEMA_GROUPS).reduce((n, g) => n + g.length, 0));
  // Every table the probe watches must be created by some statement.
  const created = new Set(SCHEMA_STATEMENTS.filter((s) => /create table/i.test(s.sql)).map((s) => s.object));
  for (const table of CORE_TABLES) assert.ok(created.has(table), `CORE_TABLES lists «${table}» but no statement creates it`);
});
