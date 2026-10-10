/**
 * Regression tests — news freshness and update schedule (priority 1).
 * Offline: no network, no database. Run: npm run freshness:test
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  allowedAgeMinutes,
  FRESHNESS_FLOOR_MIN,
  sourceFreshness,
} from "@/lib/news/freshness";
import { FEED_STALE_AFTER_MIN } from "@/lib/news/service";
import { NEWS_CRON_PATH, NEWS_CRON_SCHEDULE_UTC, defaultSources } from "@/lib/news/sources";
import { DurableStorageRequiredError, IngestBusyError } from "@/lib/news/pipeline";

process.env.NEMO_TEST_MEMORY_ONLY = "1";

const MIN = 60_000;
const NOW = Date.parse("2026-10-10T12:00:00.000Z");
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * MIN).toISOString();
const base = { enabled: true, refreshInterval: 30, lastSuccessfulFetch: at(5), consecutiveFailures: 0 };

test("a source is fresh inside its own grace window and stale after it", () => {
  // 30-minute source: grace = max(floor 30, 2 × 30) = 60 minutes.
  assert.equal(sourceFreshness({ ...base, lastSuccessfulFetch: at(59) }, NOW), "fresh");
  assert.equal(sourceFreshness({ ...base, lastSuccessfulFetch: at(61) }, NOW), "stale");
});

test("a 120-minute source is NOT stale at 31 minutes (old global 30-min rule flagged it)", () => {
  const twoHour = { ...base, refreshInterval: 120, lastSuccessfulFetch: at(31) };
  assert.equal(sourceFreshness(twoHour, NOW), "fresh");
  assert.equal(sourceFreshness({ ...twoHour, lastSuccessfulFetch: at(241) }, NOW), "stale");
});

test("grace never drops below the baseline floor", () => {
  assert.equal(allowedAgeMinutes({ refreshInterval: 5 }), FRESHNESS_FLOOR_MIN * 1);
  assert.equal(allowedAgeMinutes({ refreshInterval: 0 }), FRESHNESS_FLOOR_MIN);
  assert.equal(allowedAgeMinutes({ refreshInterval: Number.NaN }), FRESHNESS_FLOOR_MIN);
  assert.equal(FEED_STALE_AFTER_MIN, FRESHNESS_FLOOR_MIN);
});

test("disabled, never-fetched and failing sources are reported as such", () => {
  assert.equal(sourceFreshness({ ...base, enabled: false }, NOW), "disabled");
  assert.equal(sourceFreshness({ ...base, lastSuccessfulFetch: null }, NOW), "never");
  assert.equal(sourceFreshness({ ...base, lastSuccessfulFetch: "not-a-date" }, NOW), "never");
  // Recent success but failing since then: must not be reported as healthy.
  assert.equal(sourceFreshness({ ...base, consecutiveFailures: 2 }, NOW), "failing");
});

test("a source that stopped succeeding days ago is never fresh (admin showed it as «سليم»)", () => {
  assert.equal(sourceFreshness({ ...base, lastSuccessfulFetch: at(3 * 24 * 60) }, NOW), "stale");
});

test("the schedule the public copy describes matches vercel.json", () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")) as {
    crons: { path: string; schedule: string }[];
  };
  const entry = vercel.crons.find((c) => c.path === NEWS_CRON_PATH);
  assert.ok(entry, "vercel.json must schedule the news cron");
  assert.equal(entry.schedule, NEWS_CRON_SCHEDULE_UTC);
});

test("seeded sources expose a target interval that the freshness rule can read", () => {
  for (const s of defaultSources(new Date(NOW).toISOString())) {
    assert.ok(s.refreshInterval > 0, `${s.query} has a positive interval`);
    assert.equal(sourceFreshness(s, NOW), "never", `${s.query} has never succeeded yet`);
  }
});

test("scheduler-facing errors are distinct classes with the original messages", () => {
  const busy = new IngestBusyError();
  assert.ok(busy instanceof Error);
  assert.match(busy.message, /already running/);
  const durable = new DurableStorageRequiredError();
  assert.match(durable.message, /Durable news storage is required/);
  assert.ok(!(busy instanceof DurableStorageRequiredError));
});
