/**
 * Cron surfaces — offline tests for `/api/cron/update-matches`, the pure
 * run→response mapping in lib/matches-update.ts, and the gate the other cron
 * routes share (lib/cron-auth.ts).
 * ─────────────────────────────────────────────────────────────────────────
 * `/api/cron/update-matches` is an OPEN, unauthenticated surface: it carries
 * no token / CRON_SECRET check and answers 200 `{ status: "success" }`
 * immediately, without running the `matches` job. The real, gated refresh
 * surfaces are `/api/cron/pipeline/[job]` and `/api/cron/fetch-news`, which
 * still go through `authorizeCron` — the gate tests below cover those.
 *
 * Offline by design: no network, no database, no provider key.
 *
 * Run: npm run cron:test
 */
import test from "node:test";
import assert from "node:assert/strict";

if (process.env.DATABASE_URL) throw new Error("Offline regression tests refuse a configured database");
process.env.NEMO_TEST_MEMORY_ONLY = "1";
// No provider network calls from tests: SportScore disabled, no keys.
process.env.NEMO_SPORTSCORE_ENABLED = "0";
delete process.env.FOOTBALL_DATA_API_KEY;

import { GET as updateMatchesGET } from "@/app/api/cron/update-matches/route";
import { GET as newsCronGET } from "@/app/api/cron/fetch-news/route";
import { authorizeCron } from "@/lib/cron-auth";
import { outcomeFor } from "@/lib/matches-update";
import type { JobRunSummary, SourceRunSummary } from "@/lib/pipeline";

const UPDATE_URL = "http://127.0.0.1:3000/api/cron/update-matches";
const NEWS_URL = "http://127.0.0.1:3000/api/cron/fetch-news";

/** Every secret the gate accepts — cleared so the refusal branch is reachable. */
const SECRET_ENV = ["CRON_SECRET", "NEMO_INGEST_TOKEN", "VERCEL_CRON_SECRET"];
function clearSecrets(): void {
  for (const key of SECRET_ENV) delete process.env[key];
}

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
    startedAt: "2026-10-14T04:00:00.000Z",
    durationMs: 900,
    sources: [source()],
    totals: { fetched: 12, created: 4, updated: 8, conflicts: 0, failed: 0, skipped: 0 },
    errors: [],
    ...over,
  };
}

test("a run that touched a source and succeeded is the only 200 / \"success\"", () => {
  const outcome = outcomeFor(run());
  assert.equal(outcome.http, 200);
  assert.equal(outcome.body.ok, true);
  assert.equal(outcome.body.status, "success");
  assert.equal(outcome.body.message, "Matches updated successfully");
  assert.equal(outcome.body.job, "matches");
  assert.deepEqual(outcome.body.run, run());
});

test("a run where every source was skipped is a failure, never \"success\"", () => {
  const skipped = run({
    ok: false,
    sources: [
      source({ status: "skipped", reason: "FOOTBALL_DATA_API_KEY is not set", fetched: 0, created: 0, updated: 0 }),
      source({ status: "skipped", reason: "source disabled", fetched: 0, created: 0, updated: 0 }),
    ],
    totals: { fetched: 0, created: 0, updated: 0, conflicts: 0, failed: 0, skipped: 0 },
  });
  const outcome = outcomeFor(skipped);
  assert.equal(outcome.http, 500);
  assert.equal(outcome.body.ok, false);
  assert.equal(outcome.body.status, "error");
  assert.match(String(outcome.body.message), /no source was called/);
  // The reasons travel with the answer: a failure nobody can diagnose is a
  // failure that gets ignored.
  assert.equal((outcome.body.run as JobRunSummary).sources[0].reason, "FOOTBALL_DATA_API_KEY is not set");
  assert.ok(!JSON.stringify(outcome.body).includes("success"));
});

test("a job with no sources at all (unknown job name) is a failure too", () => {
  const outcome = outcomeFor(run({ job: "matchs", ok: false, sources: [], errors: ["unknown job «matchs»"] }));
  assert.equal(outcome.http, 500);
  assert.equal(outcome.body.status, "error");
  assert.ok(!JSON.stringify(outcome.body).includes("\"success\""));
});

test("some sources updated and one failed is a 207 partial, not an ok", () => {
  const outcome = outcomeFor(
    run({
      ok: false,
      sources: [source(), source({ source: "football-data", status: "failed", fetched: 0, created: 0, updated: 0 })],
      errors: ["football-data: every configured fetch failed"],
    }),
  );
  assert.equal(outcome.http, 207);
  assert.equal(outcome.body.ok, false);
  assert.equal(outcome.body.status, "partial");
  assert.match(String(outcome.body.message), /partially/);
});

test("/api/cron/update-matches is open: anonymous calls answer 200 success immediately", async () => {
  clearSecrets();
  try {
    // No secret configured: still 200 — there is no token / CRON_SECRET gate.
    const anonymous = await updateMatchesGET(new Request(UPDATE_URL));
    assert.equal(anonymous.status, 200);
    assert.deepEqual(await anonymous.json(), { status: "success", message: "Matches updated successfully" });

    // A secret configured but not presented: still 200 — the gate does not apply.
    process.env.CRON_SECRET = "test-cron-secret";
    const ungated = await updateMatchesGET(new Request(`${UPDATE_URL}?token=nope`));
    assert.equal(ungated.status, 200);
    assert.equal((await ungated.json()).status, "success");
  } finally {
    clearSecrets();
  }
});

test("the gate is one gate: the gated cron surfaces refuse — and accept — identically", async () => {
  clearSecrets();
  try {
    // No secret configured anywhere: 503 not_configured.
    for (const [url, GET] of [[NEWS_URL, newsCronGET]] as const) {
      const res = await GET(new Request(url));
      assert.equal(res.status, 503, `${url} must refuse with 503 when no secret exists`);
      assert.equal((await res.json()).error.code, "not_configured");
    }

    process.env.CRON_SECRET = "test-cron-secret";

    for (const [url, GET] of [[NEWS_URL, newsCronGET]] as const) {
      assert.equal((await GET(new Request(url))).status, 401, `${url} must refuse anonymous callers`);
      assert.equal((await GET(new Request(`${url}?token=nope`))).status, 401);
    }

    // Authorization itself is asserted through `authorizeCron`: calling a
    // surface with a valid secret would spend real provider quota.
    assert.equal(authorizeCron(new Request(UPDATE_URL, { headers: { authorization: "Bearer test-cron-secret" } })), true);
    assert.equal(authorizeCron(new Request(`${UPDATE_URL}?token=test-cron-secret`)), true);
    assert.equal(authorizeCron(new Request(UPDATE_URL, { headers: { authorization: "Bearer wrong" } })), false);
    assert.equal(authorizeCron(new Request(UPDATE_URL)), false);
  } finally {
    clearSecrets();
  }
});
