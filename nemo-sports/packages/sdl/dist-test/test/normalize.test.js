"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const normalize_1 = require("../src/normalize");
const polling_1 = require("../src/polling");
const orchestrator_1 = require("../src/orchestrator");
(0, node_test_1.default)("normalizeName folds Arabic variants to one key", () => {
    strict_1.default.equal((0, normalize_1.normalizeName)("الأهلي"), (0, normalize_1.normalizeName)("الاهلى"));
    strict_1.default.equal((0, normalize_1.normalizeName)("  Al Ahly  "), "al ahly");
    strict_1.default.equal((0, normalize_1.normalizeName)("AL-AHLY SC"), "al ahly");
    strict_1.default.equal((0, normalize_1.normalizeName)("Manchester City FC"), "manchester city");
    strict_1.default.equal((0, normalize_1.normalizeName)(null), "");
});
(0, node_test_1.default)("compactKey ignores spacing differences", () => {
    strict_1.default.equal((0, normalize_1.compactKey)("Man City"), (0, normalize_1.compactKey)("ManCity"));
    strict_1.default.notEqual((0, normalize_1.compactKey)("Man City"), (0, normalize_1.compactKey)("Man United"));
});
(0, node_test_1.default)("similarity ranks an exact match highest and rejects unrelated names", () => {
    strict_1.default.equal((0, normalize_1.similarity)("Arsenal", "Arsenal"), 1);
    const close = (0, normalize_1.similarity)("Al Ahly SC", "Al-Ahly");
    const far = (0, normalize_1.similarity)("Al Ahly", "Bayern München");
    strict_1.default.ok(close > 0.85, `expected close match, got ${close}`);
    strict_1.default.ok(far < 0.3, `expected low score, got ${far}`);
});
(0, node_test_1.default)("rankCandidates applies the threshold and sorts by score", () => {
    const pool = [
        { id: "t1", name: "Al Ahly" },
        { id: "t2", name: "Zamalek" },
        { id: "t3", name: "Al Ahly Tripoli" },
    ];
    const ranked = (0, normalize_1.rankCandidates)("Al Ahly", pool, 0.5);
    strict_1.default.equal(ranked[0].id, "t1");
    strict_1.default.equal(ranked[0].score, 1);
    strict_1.default.ok(ranked.every((r) => r.score >= 0.5));
    strict_1.default.equal((0, normalize_1.rankCandidates)("Al Ahly", pool, 0.99).length, 1);
});
(0, node_test_1.default)("fingerprint is stable and differs for different input", () => {
    strict_1.default.equal((0, normalize_1.fingerprint)("abc"), (0, normalize_1.fingerprint)("abc"));
    strict_1.default.notEqual((0, normalize_1.fingerprint)("abc"), (0, normalize_1.fingerprint)("abd"));
    strict_1.default.match((0, normalize_1.fingerprint)("x".repeat(500)), /^[0-9a-z]+$/);
});
(0, node_test_1.default)("requestKey ignores parameter order and empty values", () => {
    const a = (0, normalize_1.requestKey)("p", "fixtures", { league: 39, season: 2026 });
    const b = (0, normalize_1.requestKey)("p", "fixtures", { season: 2026, league: 39 });
    const c = (0, normalize_1.requestKey)("p", "fixtures", { season: 2026, league: 39, extra: "" });
    strict_1.default.equal(a, b);
    strict_1.default.equal(a, c);
    strict_1.default.notEqual(a, (0, normalize_1.requestKey)("other", "fixtures", { league: 39, season: 2026 }));
});
(0, node_test_1.default)("seededId is a stable, valid v4-shaped id", () => {
    const shape = /^[0-9a-f]{8}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (let i = 0; i < 500; i++) {
        const id = (0, normalize_1.seededId)(`canon:team:seed-${i}`);
        strict_1.default.match(id, shape, `bad shape for seed ${i}: ${id}`);
    }
    strict_1.default.equal((0, normalize_1.seededId)("canon:team:al ahly"), (0, normalize_1.seededId)("canon:team:al ahly"), "same seed must give the same id");
    strict_1.default.notEqual((0, normalize_1.seededId)("canon:team:al ahly"), (0, normalize_1.seededId)("canon:team:zamalek"));
    strict_1.default.equal(new Set(Array.from({ length: 500 }, (_, i) => (0, normalize_1.seededId)(`seed-${i}`))).size, 500, "ids must not collide");
});
(0, node_test_1.default)("dayKey and withinMinutes work across timezones", () => {
    strict_1.default.equal((0, normalize_1.dayKey)("2026-03-04T23:30:00+02:00"), "2026-03-04");
    strict_1.default.ok((0, normalize_1.withinMinutes)("2026-03-04T20:00:00Z", "2026-03-04T20:20:00Z", 45));
    strict_1.default.ok(!(0, normalize_1.withinMinutes)("2026-03-04T20:00:00Z", "2026-03-04T21:00:00Z", 45));
});
(0, node_test_1.default)("polling: live matches are real-time, finished matches stop", () => {
    const live = (0, polling_1.profileFor)("live");
    strict_1.default.equal(live.realtime, true);
    strict_1.default.ok(live.intervalSeconds <= 15);
    const shootout = (0, polling_1.profileFor)("penalty_shootout");
    strict_1.default.ok(shootout.intervalSeconds <= live.intervalSeconds, "shootout must poll at least as fast as open play");
    const finished = (0, polling_1.profileFor)("finished");
    strict_1.default.equal(finished.realtime, false);
    strict_1.default.ok(finished.intervalSeconds >= 600);
    const cancelled = (0, polling_1.profileFor)("cancelled");
    strict_1.default.ok(cancelled.intervalSeconds >= 3600);
});
(0, node_test_1.default)("polling: kickoff window elevates a scheduled fixture", () => {
    const soon = new Date(Date.now() + 10 * 60_000).toISOString();
    const later = new Date(Date.now() + 6 * 3600_000).toISOString();
    strict_1.default.equal((0, polling_1.profileFor)("scheduled", { kickoffAt: soon }).realtime, true);
    strict_1.default.equal((0, polling_1.profileFor)("scheduled", { kickoffAt: later }).realtime, false);
    strict_1.default.ok((0, polling_1.profileFor)("scheduled", { kickoffAt: later }).intervalSeconds > (0, polling_1.profileFor)("scheduled", { kickoffAt: soon }).intervalSeconds);
});
(0, node_test_1.default)("polling: throttling doubles intervals and caps real-time polling", () => {
    const normal = (0, polling_1.profileFor)("live");
    const throttled = (0, polling_1.profileFor)("live", { throttled: true });
    strict_1.default.ok(throttled.intervalSeconds > normal.intervalSeconds);
    strict_1.default.ok(throttled.intervalSeconds <= 60);
    strict_1.default.match(throttled.reason, /throttled/);
});
(0, node_test_1.default)("cache policy: live data TTLs are seconds, static data TTLs are hours", () => {
    strict_1.default.ok(orchestrator_1.DEFAULT_CACHE_POLICY.live_matches.raw <= 10);
    strict_1.default.ok(orchestrator_1.DEFAULT_CACHE_POLICY.team.raw >= 3600);
    strict_1.default.ok(orchestrator_1.DEFAULT_CACHE_POLICY.live_matches.staleGrace > orchestrator_1.DEFAULT_CACHE_POLICY.live_matches.canonical);
    for (const [key, p] of Object.entries(orchestrator_1.DEFAULT_CACHE_POLICY)) {
        strict_1.default.ok(p.raw <= p.canonical, `${key}: canonical TTL must outlive the raw TTL`);
    }
});
