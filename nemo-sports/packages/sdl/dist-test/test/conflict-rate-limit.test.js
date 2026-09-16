"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const conflict_1 = require("../src/conflict");
const cache_1 = require("../src/cache");
const rate_limit_1 = require("../src/rate-limit");
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
const base = {
    entityType: "match",
    entityId: "match-1",
    field: "score",
    storedProvider: "sportradar",
    incomingProvider: "api_football",
    primaryProvider: "sportradar",
    valuesAreEqual: (a, b) => a === b,
};
(0, node_test_1.default)("no conflict when the value is unchanged or absent", () => {
    const d = new conflict_1.ConflictDetector();
    const same = d.evaluate({ ...base, stored: "2-1", incoming: "2-1", storedAt: iso(-1000), incomingAt: iso(0) });
    strict_1.default.equal(same.accept, true);
    strict_1.default.equal(same.conflict, null);
    const fresh = d.evaluate({ ...base, stored: null, incoming: "2-1", storedAt: iso(-1000), incomingAt: iso(0) });
    strict_1.default.equal(fresh.accept, true);
    strict_1.default.equal(d.all().length, 0);
});
(0, node_test_1.default)("critical: a secondary provider cannot overwrite the primary's score", () => {
    const d = new conflict_1.ConflictDetector();
    const res = d.evaluate({ ...base, stored: "2-1", incoming: "2-2", storedAt: iso(-60_000), incomingAt: iso(0) });
    strict_1.default.equal(res.accept, false, "incoming value must be rejected");
    strict_1.default.equal(res.conflict?.severity, "critical");
    strict_1.default.equal(res.conflict?.field, "score");
    strict_1.default.equal(res.conflict?.resolved, false);
    strict_1.default.deepEqual(Object.keys(res.conflict.values).sort(), ["api_football", "sportradar"]);
    strict_1.default.equal(d.open().length, 1);
    strict_1.default.equal(d.summary().critical, 1);
});
(0, node_test_1.default)("critical: the primary provider's correction is accepted", () => {
    const d = new conflict_1.ConflictDetector();
    const res = d.evaluate({
        ...base,
        stored: "2-1",
        incoming: "3-1",
        storedProvider: "api_football",
        incomingProvider: "sportradar",
        storedAt: iso(-60_000),
        incomingAt: iso(0),
    });
    strict_1.default.equal(res.accept, true);
    strict_1.default.equal(res.conflict?.resolution, "automatic");
    strict_1.default.equal(res.conflict?.resolvedValue, "3-1");
    strict_1.default.equal(d.open().length, 0, "resolved conflicts leave the open queue");
});
(0, node_test_1.default)("most_recent_wins: a newer value is accepted, an older one is rejected", () => {
    const d = new conflict_1.ConflictDetector();
    d.setRules("lineup", { severity: "medium", strategy: "most_recent_wins" });
    const newer = d.evaluate({ ...base, field: "lineup", stored: "4-3-3", incoming: "4-2-3-1", storedAt: iso(-60_000), incomingAt: iso(0) });
    strict_1.default.equal(newer.accept, true);
    const older = d.evaluate({ ...base, field: "lineup", stored: "4-2-3-1", incoming: "4-3-3", storedAt: iso(0), incomingAt: iso(-60_000) });
    strict_1.default.equal(older.accept, false);
    strict_1.default.equal(older.conflict?.severity, "medium");
});
(0, node_test_1.default)("manual_review: neither value wins until an editor decides", () => {
    const d = new conflict_1.ConflictDetector();
    d.setRules("kickoff", { severity: "medium", strategy: "manual_review" });
    const res = d.evaluate({
        ...base,
        field: "kickoff",
        stored: "2026-04-10T18:00:00.000Z",
        incoming: "2026-04-10T19:00:00.000Z",
        storedAt: iso(-60_000),
        incomingAt: iso(0),
    });
    strict_1.default.equal(res.accept, false);
    strict_1.default.equal(d.open().length, 1);
    const resolved = d.resolveManually(res.conflict.id, "2026-04-10T19:00:00.000Z", "broadcaster schedule is authoritative");
    strict_1.default.equal(resolved?.resolution, "manual");
    strict_1.default.equal(resolved?.resolved, true);
    strict_1.default.equal(d.open().length, 0);
});
(0, node_test_1.default)("the same disagreement is not duplicated on every poll", () => {
    const d = new conflict_1.ConflictDetector();
    for (let i = 0; i < 5; i++) {
        d.evaluate({ ...base, stored: "2-1", incoming: "2-2", storedAt: iso(-60_000), incomingAt: iso(i * 1000) });
    }
    strict_1.default.equal(d.all().length, 1, "one open conflict per entity+field");
    strict_1.default.equal(d.open()[0].providers.length, 2);
});
(0, node_test_1.default)("open conflicts are ordered by severity", () => {
    const d = new conflict_1.ConflictDetector();
    d.evaluate({ ...base, entityId: "match-2", stored: "1-0", incoming: "1-1", storedAt: iso(-1), incomingAt: iso(0) });
    d.evaluate({ ...base, entityId: "match-3", field: "status", stored: "live", incoming: "finished", storedAt: iso(-1), incomingAt: iso(0) });
    const open = d.open();
    strict_1.default.equal(open.length, 2);
    strict_1.default.equal(open[0].severity, "critical", "critical comes first");
    strict_1.default.equal(open[0].entityId, "match-2");
    strict_1.default.equal(open[1].severity, "high");
    strict_1.default.equal(conflict_1.DEFAULT_CONFLICT_RULES.score.severity, "critical");
    strict_1.default.equal(conflict_1.DEFAULT_CONFLICT_RULES.metadata.severity, "low");
});
(0, node_test_1.default)("low-severity stat conflicts auto-resolve and leave the queue", () => {
    const d = new conflict_1.ConflictDetector();
    const res = d.evaluate({ ...base, field: "stat", stored: 10, incoming: 12, storedAt: iso(-1), incomingAt: iso(0) });
    strict_1.default.equal(res.accept, true);
    strict_1.default.equal(res.conflict?.resolution, "automatic");
    strict_1.default.equal(d.open().length, 0, "resolved conflicts must not clutter the admin queue");
    strict_1.default.equal(d.summary().total, 1, "but they stay in the audit trail");
});
/* ── rate limiting ─────────────────────────────────────────── */
const cfg = (provider, over = {}) => ({
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
(0, node_test_1.default)("rate limiter allows calls until a window is exhausted", async () => {
    const limiter = new rate_limit_1.RateLimiter(new cache_1.MemoryStore(), new Map([["api_football", cfg("api_football", { perDay: 10 })]]));
    strict_1.default.equal((await limiter.check("api_football")).allowed, true);
    for (let i = 0; i < 8; i++)
        await limiter.record("api_football");
    strict_1.default.equal(await limiter.shouldThrottle("api_football"), false, "8/10 is below the 85% threshold");
    strict_1.default.equal((await limiter.check("api_football")).allowed, true);
    await limiter.record("api_football");
    strict_1.default.equal(await limiter.shouldThrottle("api_football"), true, "9/10 crosses the 85% throttle threshold");
    strict_1.default.equal((await limiter.check("api_football")).allowed, true, "throttling slows polling, it does not block");
    await limiter.record("api_football");
    const blocked = await limiter.check("api_football");
    strict_1.default.equal(blocked.allowed, false);
    if (blocked.allowed)
        return;
    strict_1.default.equal(blocked.reason, "exhausted");
    strict_1.default.ok(blocked.retryAfterSeconds > 0);
    const day = blocked.usage.find((u) => u.window === "day");
    strict_1.default.equal(day?.used, 10);
    strict_1.default.equal(day?.limit, 10);
});
(0, node_test_1.default)("rate limiter enforces concurrency separately from quotas", async () => {
    const limiter = new rate_limit_1.RateLimiter(new cache_1.MemoryStore(), new Map([["api_football", cfg("api_football", { concurrency: 1 })]]));
    limiter.begin("api_football");
    const blocked = await limiter.check("api_football");
    strict_1.default.equal(blocked.allowed, false);
    if (blocked.allowed)
        return;
    strict_1.default.equal(blocked.reason, "concurrency");
    limiter.end("api_football");
    strict_1.default.equal((await limiter.check("api_football")).allowed, true);
});
(0, node_test_1.default)("throttle threshold is configurable and defaults to 85%", async () => {
    const store = new cache_1.MemoryStore();
    const limiter = new rate_limit_1.RateLimiter(store, new Map([["api_football", cfg("api_football", { perDay: 100 })]]));
    for (let i = 0; i < 84; i++)
        await limiter.record("api_football");
    strict_1.default.equal(await limiter.shouldThrottle("api_football"), false);
    await limiter.record("api_football");
    strict_1.default.equal(await limiter.shouldThrottle("api_football"), true);
});
(0, node_test_1.default)("per-second windows reset on the next second", async () => {
    const limiter = new rate_limit_1.RateLimiter(new cache_1.MemoryStore(), new Map([["api_football", cfg("api_football", { perSecond: 1 })]]));
    await limiter.record("api_football");
    const blocked = await limiter.check("api_football");
    strict_1.default.equal(blocked.allowed, false);
    await new Promise((r) => setTimeout(r, 1100));
    strict_1.default.equal((await limiter.check("api_football")).allowed, true);
});
