import test from "node:test";
import assert from "node:assert/strict";

import { ConflictDetector, DEFAULT_CONFLICT_RULES } from "../src/conflict";
import { MemoryStore } from "../src/cache";
import { RateLimiter, type RateLimitConfig } from "../src/rate-limit";

const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

const base = {
  entityType: "match" as const,
  entityId: "match-1",
  field: "score" as const,
  storedProvider: "sportradar" as const,
  incomingProvider: "api_football" as const,
  primaryProvider: "sportradar" as const,
  valuesAreEqual: (a: unknown, b: unknown) => a === b,
};

test("no conflict when the value is unchanged or absent", () => {
  const d = new ConflictDetector();
  const same = d.evaluate({ ...base, stored: "2-1", incoming: "2-1", storedAt: iso(-1000), incomingAt: iso(0) });
  assert.equal(same.accept, true);
  assert.equal(same.conflict, null);

  const fresh = d.evaluate({ ...base, stored: null, incoming: "2-1", storedAt: iso(-1000), incomingAt: iso(0) });
  assert.equal(fresh.accept, true);
  assert.equal(d.all().length, 0);
});

test("critical: a secondary provider cannot overwrite the primary's score", () => {
  const d = new ConflictDetector();
  const res = d.evaluate({ ...base, stored: "2-1", incoming: "2-2", storedAt: iso(-60_000), incomingAt: iso(0) });
  assert.equal(res.accept, false, "incoming value must be rejected");
  assert.equal(res.conflict?.severity, "critical");
  assert.equal(res.conflict?.field, "score");
  assert.equal(res.conflict?.resolved, false);
  assert.deepEqual(Object.keys(res.conflict!.values).sort(), ["api_football", "sportradar"]);
  assert.equal(d.open().length, 1);
  assert.equal(d.summary().critical, 1);
});

test("critical: the primary provider's correction is accepted", () => {
  const d = new ConflictDetector();
  const res = d.evaluate({
    ...base,
    stored: "2-1",
    incoming: "3-1",
    storedProvider: "api_football",
    incomingProvider: "sportradar",
    storedAt: iso(-60_000),
    incomingAt: iso(0),
  });
  assert.equal(res.accept, true);
  assert.equal(res.conflict?.resolution, "automatic");
  assert.equal(res.conflict?.resolvedValue, "3-1");
  assert.equal(d.open().length, 0, "resolved conflicts leave the open queue");
});

test("most_recent_wins: a newer value is accepted, an older one is rejected", () => {
  const d = new ConflictDetector();
  d.setRules("lineup", { severity: "medium", strategy: "most_recent_wins" });

  const newer = d.evaluate({ ...base, field: "lineup", stored: "4-3-3", incoming: "4-2-3-1", storedAt: iso(-60_000), incomingAt: iso(0) });
  assert.equal(newer.accept, true);

  const older = d.evaluate({ ...base, field: "lineup", stored: "4-2-3-1", incoming: "4-3-3", storedAt: iso(0), incomingAt: iso(-60_000) });
  assert.equal(older.accept, false);
  assert.equal(older.conflict?.severity, "medium");
});

test("manual_review: neither value wins until an editor decides", () => {
  const d = new ConflictDetector();
  d.setRules("kickoff", { severity: "medium", strategy: "manual_review" });
  const res = d.evaluate({
    ...base,
    field: "kickoff",
    stored: "2026-04-10T18:00:00.000Z",
    incoming: "2026-04-10T19:00:00.000Z",
    storedAt: iso(-60_000),
    incomingAt: iso(0),
  });
  assert.equal(res.accept, false);
  assert.equal(d.open().length, 1);

  const resolved = d.resolveManually(res.conflict!.id, "2026-04-10T19:00:00.000Z", "broadcaster schedule is authoritative");
  assert.equal(resolved?.resolution, "manual");
  assert.equal(resolved?.resolved, true);
  assert.equal(d.open().length, 0);
});

test("the same disagreement is not duplicated on every poll", () => {
  const d = new ConflictDetector();
  for (let i = 0; i < 5; i++) {
    d.evaluate({ ...base, stored: "2-1", incoming: "2-2", storedAt: iso(-60_000), incomingAt: iso(i * 1000) });
  }
  assert.equal(d.all().length, 1, "one open conflict per entity+field");
  assert.equal(d.open()[0].providers.length, 2);
});

test("open conflicts are ordered by severity", () => {
  const d = new ConflictDetector();
  d.evaluate({ ...base, entityId: "match-2", stored: "1-0", incoming: "1-1", storedAt: iso(-1), incomingAt: iso(0) });
  d.evaluate({ ...base, entityId: "match-3", field: "status", stored: "live", incoming: "finished", storedAt: iso(-1), incomingAt: iso(0) });
  const open = d.open();
  assert.equal(open.length, 2);
  assert.equal(open[0].severity, "critical", "critical comes first");
  assert.equal(open[0].entityId, "match-2");
  assert.equal(open[1].severity, "high");
  assert.equal(DEFAULT_CONFLICT_RULES.score.severity, "critical");
  assert.equal(DEFAULT_CONFLICT_RULES.metadata.severity, "low");
});

test("low-severity stat conflicts auto-resolve and leave the queue", () => {
  const d = new ConflictDetector();
  const res = d.evaluate({ ...base, field: "stat", stored: 10, incoming: 12, storedAt: iso(-1), incomingAt: iso(0) });
  assert.equal(res.accept, true);
  assert.equal(res.conflict?.resolution, "automatic");
  assert.equal(d.open().length, 0, "resolved conflicts must not clutter the admin queue");
  assert.equal(d.summary().total, 1, "but they stay in the audit trail");
});

/* ── rate limiting ─────────────────────────────────────────── */

const cfg = (provider: "api_football", over: Partial<RateLimitConfig> = {}): RateLimitConfig => ({
  provider,
  perSecond: null,
  perMinute: null,
  perHour: null,
  perDay: null,
  perMonth: null,
  concurrency: null,
  throttleAt: 0.85,
  ...over,
});

test("rate limiter allows calls until a window is exhausted", async () => {
  const limiter = new RateLimiter(new MemoryStore(), new Map([["api_football", cfg("api_football", { perDay: 10 })]]));
  assert.equal((await limiter.check("api_football")).allowed, true);

  for (let i = 0; i < 8; i++) await limiter.record("api_football");
  assert.equal(await limiter.shouldThrottle("api_football"), false, "8/10 is below the 85% threshold");
  assert.equal((await limiter.check("api_football")).allowed, true);

  await limiter.record("api_football");
  assert.equal(await limiter.shouldThrottle("api_football"), true, "9/10 crosses the 85% throttle threshold");
  assert.equal((await limiter.check("api_football")).allowed, true, "throttling slows polling, it does not block");

  await limiter.record("api_football");
  const blocked = await limiter.check("api_football");
  assert.equal(blocked.allowed, false);
  if (blocked.allowed) return;
  assert.equal(blocked.reason, "exhausted");
  assert.ok(blocked.retryAfterSeconds > 0);
  const day = blocked.usage.find((u) => u.window === "day");
  assert.equal(day?.used, 10);
  assert.equal(day?.limit, 10);
});

test("rate limiter enforces concurrency separately from quotas", async () => {
  const limiter = new RateLimiter(new MemoryStore(), new Map([["api_football", cfg("api_football", { concurrency: 1 })]]));
  limiter.begin("api_football");
  const blocked = await limiter.check("api_football");
  assert.equal(blocked.allowed, false);
  if (blocked.allowed) return;
  assert.equal(blocked.reason, "concurrency");
  limiter.end("api_football");
  assert.equal((await limiter.check("api_football")).allowed, true);
});

test("throttle threshold is configurable and defaults to 85%", async () => {
  const store = new MemoryStore();
  const limiter = new RateLimiter(store, new Map([["api_football", cfg("api_football", { perDay: 100 })]]));
  for (let i = 0; i < 84; i++) await limiter.record("api_football");
  assert.equal(await limiter.shouldThrottle("api_football"), false);
  await limiter.record("api_football");
  assert.equal(await limiter.shouldThrottle("api_football"), true);
});

test("per-second windows reset on the next second", async () => {
  const limiter = new RateLimiter(new MemoryStore(), new Map([["api_football", cfg("api_football", { perSecond: 1 })]]));
  await limiter.record("api_football");
  const blocked = await limiter.check("api_football");
  assert.equal(blocked.allowed, false);
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal((await limiter.check("api_football")).allowed, true);
});
