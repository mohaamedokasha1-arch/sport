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

/* ── 2026-10-11: scheduler cadence, stale threshold and source intervals are compatible ── */

import { cronIntervalMinutes, effectiveIntervalMinutes, schedulerCadence } from "@/lib/news/schedule";
import { summarizeFreshness } from "@/lib/news/service";
import type { RSSSource } from "@/lib/news/types";

test("the shipped cron is daily, and the derived cadence says so", () => {
  assert.equal(cronIntervalMinutes(NEWS_CRON_SCHEDULE_UTC), 24 * 60);
  assert.equal(cronIntervalMinutes("*/15 * * * *"), 15);
  assert.equal(cronIntervalMinutes("0 * * * *"), 60);
  assert.equal(cronIntervalMinutes("0 */6 * * *"), 360);
  assert.equal(cronIntervalMinutes("nonsense"), null);
  const cadence = schedulerCadence({});
  assert.equal(cadence.minutes, 24 * 60);
  assert.equal(cadence.source, "vercel-cron");
});

test("with a daily scheduler a 30-minute source is NOT stale an hour later (it can only refresh daily)", () => {
  const daily = schedulerCadence({}).minutes;
  const s = { ...base, refreshInterval: 30 };
  assert.equal(sourceFreshness({ ...s, lastSuccessfulFetch: at(61) }, NOW, daily), "fresh", "old rule: stale after 60 min");
  assert.equal(sourceFreshness({ ...s, lastSuccessfulFetch: at(23 * 60) }, NOW, daily), "fresh", "a whole day between runs is normal");
  assert.equal(allowedAgeMinutes(s, daily), 2 * 24 * 60, "one missed daily run is tolerated");
  assert.equal(sourceFreshness({ ...s, lastSuccessfulFetch: at(49 * 60) }, NOW, daily), "stale", "two missed runs → stale");
});

test("an operator-declared external scheduler tightens the threshold; invalid declarations are ignored", () => {
  const ext = schedulerCadence({ NEMO_NEWS_SCHEDULER_INTERVAL_MINUTES: "15" });
  assert.equal(ext.minutes, 15);
  assert.equal(ext.source, "external");
  assert.equal(effectiveIntervalMinutes(30, ext), 30, "a source never refreshes faster than its own target");
  assert.equal(effectiveIntervalMinutes(30, schedulerCadence({})), 24 * 60);
  for (const bad of ["0", "-5", "abc", "100000", "2.5"]) {
    assert.equal(schedulerCadence({ NEMO_NEWS_SCHEDULER_INTERVAL_MINUTES: bad }).source, "vercel-cron", bad);
  }
});

const src = (over: Partial<RSSSource>): RSSSource => ({
  ...defaultSources(new Date(NOW).toISOString())[0],
  ...over,
});

test("freshness metadata separates a successful update from a failed attempt", () => {
  const daily = schedulerCadence({});
  // nothing ever ran (production on 2026-10-11: lastUpdated null)
  const never = summarizeFreshness([src({ id: "a" }), src({ id: "b" })], NOW, daily);
  assert.equal(never.state, "never");
  assert.equal(never.lastSuccessAt, null);
  assert.equal(never.lastAttemptAt, null);
  assert.equal(never.lastAttemptOk, null);
  // attempts happened but all failed
  const onlyFailures = summarizeFreshness([src({ id: "a", lastFailedFetch: at(10), consecutiveFailures: 1 })], NOW, daily);
  assert.equal(onlyFailures.state, "never");
  assert.equal(onlyFailures.lastFailureAt, at(10));
  assert.equal(onlyFailures.lastAttemptOk, false);
  // success, then a newer failure → failing, and the success time is still reported
  const failing = summarizeFreshness([src({ id: "a", lastSuccessfulFetch: at(120), lastFailedFetch: at(5), consecutiveFailures: 1 })], NOW, daily);
  assert.equal(failing.state, "failing");
  assert.equal(failing.lastSuccessAt, at(120));
  assert.equal(failing.lastFailureAt, at(5));
  assert.equal(failing.lastAttemptAt, at(5));
  // success newer than an old failure → fresh
  const fresh = summarizeFreshness([src({ id: "a", lastSuccessfulFetch: at(5), lastFailedFetch: at(600) })], NOW, daily);
  assert.equal(fresh.state, "fresh");
  assert.equal(fresh.lastAttemptOk, true);
  assert.equal(fresh.schedule.intervalMinutes, 24 * 60);
  assert.equal(fresh.schedule.staleAfterMinutes, 2 * 24 * 60);
  // no enabled source
  assert.equal(summarizeFreshness([src({ id: "a", enabled: false })], NOW, daily).state, "no_sources");
});
