import test from "node:test";
import assert from "node:assert/strict";

/**
 * Standings replacement guard — offline, no database, no network.
 * A league table is replaced only when every incoming row resolves to a known
 * team. An unresolved identity must keep the stored table intact (no DELETE).
 */

import { replaceStandings, type Db } from "../lib/pipeline/upsert";
import { loadPipelineConfig } from "../lib/pipeline/config";
import type { NormalizedStanding } from "../lib/pipeline/types";

type Call = { sql: string; params: unknown[] };

function fakeDb(existingRows: { provider: string; count: string }[] = []) {
  const calls: Call[] = [];
  const tx = {
    select: async (sql: string) => {
      calls.push({ sql, params: [] });
      return sql.includes("GROUP BY provider") ? existingRows : [];
    },
    run: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return { rowCount: 1 };
    },
    transaction: undefined as unknown,
  };
  const db = {
    ...tx,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  return { db: db as unknown as Db, calls };
}

function row(i: number, sourceId: string): NormalizedStanding {
  return {
    sourceId: `st-${sourceId}`,
    competitionSlug: "egyptian-premier-league",
    seasonName: "2026-2027",
    groupName: null,
    teamSourceId: sourceId,
    teamName: `Team ${sourceId}`,
    position: i,
    played: 1,
    won: 1,
    drawn: 0,
    lost: 0,
    goalsFor: 2,
    goalsAgainst: 0,
    points: 3,
    form: null,
    status: null,
  };
}

const cfg = loadPipelineConfig();

test("a table with an unresolved team keeps the stored rows (no DELETE, no INSERT)", async () => {
  const { db, calls } = fakeDb([{ provider: "thesportsdb", count: "20" }]);
  const rows = [row(1, "t1"), row(2, "t2"), row(3, "missing")];
  const out = await replaceStandings(db, cfg, rows, {
    competitionId: "c",
    seasonId: "s",
    source: "thesportsdb",
    teamIdFor: (id) => (id === "missing" ? null : `uuid-${id}`),
  });
  assert.equal(out.applied, 0);
  assert.equal(out.skipped, 3);
  assert.equal(out.replacedOtherProviders, 0);
  assert.equal(calls.filter((c) => /^\s*(DELETE|INSERT)/i.test(c.sql)).length, 0, "no destructive statement may run");
});

test("when no team resolves at all, the stored table is not wiped", async () => {
  const { db, calls } = fakeDb([{ provider: "thesportsdb", count: "20" }]);
  const out = await replaceStandings(db, cfg, [row(1, "a"), row(2, "b")], {
    competitionId: "c",
    seasonId: "s",
    source: "thesportsdb",
    teamIdFor: () => null,
  });
  assert.equal(out.applied, 0);
  assert.equal(calls.some((c) => /DELETE FROM standings/i.test(c.sql)), false);
});

test("a fully resolved table replaces the source's rows atomically", async () => {
  const { db, calls } = fakeDb([]);
  const out = await replaceStandings(db, cfg, [row(1, "a"), row(2, "b")], {
    competitionId: "c",
    seasonId: "s",
    source: "thesportsdb",
    teamIdFor: (id) => `uuid-${id}`,
  });
  assert.equal(out.applied, 2);
  assert.equal(out.skipped, 0);
  assert.equal(calls.filter((c) => /DELETE FROM standings/i.test(c.sql)).length, 1);
  assert.equal(calls.filter((c) => /INSERT INTO standings/i.test(c.sql)).length, 2);
});
