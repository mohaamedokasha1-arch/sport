import test from "node:test";
import assert from "node:assert/strict";

import { compactKey, dayKey, fingerprint, normalizeName, rankCandidates, requestKey, seededId, similarity, withinMinutes } from "../src/normalize";
import { profileFor } from "../src/polling";
import { DEFAULT_CACHE_POLICY } from "../src/orchestrator";

test("normalizeName folds Arabic variants to one key", () => {
  assert.equal(normalizeName("الأهلي"), normalizeName("الاهلى"));
  assert.equal(normalizeName("  Al Ahly  "), "al ahly");
  assert.equal(normalizeName("AL-AHLY SC"), "al ahly");
  assert.equal(normalizeName("Manchester City FC"), "manchester city");
  assert.equal(normalizeName(null), "");
});

test("compactKey ignores spacing differences", () => {
  assert.equal(compactKey("Man City"), compactKey("ManCity"));
  assert.notEqual(compactKey("Man City"), compactKey("Man United"));
});

test("similarity ranks an exact match highest and rejects unrelated names", () => {
  assert.equal(similarity("Arsenal", "Arsenal"), 1);
  const close = similarity("Al Ahly SC", "Al-Ahly");
  const far = similarity("Al Ahly", "Bayern München");
  assert.ok(close > 0.85, `expected close match, got ${close}`);
  assert.ok(far < 0.3, `expected low score, got ${far}`);
});

test("rankCandidates applies the threshold and sorts by score", () => {
  const pool = [
    { id: "t1", name: "Al Ahly" },
    { id: "t2", name: "Zamalek" },
    { id: "t3", name: "Al Ahly Tripoli" },
  ];
  const ranked = rankCandidates("Al Ahly", pool, 0.5);
  assert.equal(ranked[0].id, "t1");
  assert.equal(ranked[0].score, 1);
  assert.ok(ranked.every((r) => r.score >= 0.5));
  assert.equal(rankCandidates("Al Ahly", pool, 0.99).length, 1);
});

test("fingerprint is stable and differs for different input", () => {
  assert.equal(fingerprint("abc"), fingerprint("abc"));
  assert.notEqual(fingerprint("abc"), fingerprint("abd"));
  assert.match(fingerprint("x".repeat(500)), /^[0-9a-z]+$/);
});

test("requestKey ignores parameter order and empty values", () => {
  const a = requestKey("p", "fixtures", { league: 39, season: 2026 });
  const b = requestKey("p", "fixtures", { season: 2026, league: 39 });
  const c = requestKey("p", "fixtures", { season: 2026, league: 39, extra: "" });
  assert.equal(a, b);
  assert.equal(a, c);
  assert.notEqual(a, requestKey("other", "fixtures", { league: 39, season: 2026 }));
});

test("seededId is a stable, valid v4-shaped id", () => {
  const shape = /^[0-9a-f]{8}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  for (let i = 0; i < 500; i++) {
    const id = seededId(`canon:team:seed-${i}`);
    assert.match(id, shape, `bad shape for seed ${i}: ${id}`);
  }
  assert.equal(seededId("canon:team:al ahly"), seededId("canon:team:al ahly"), "same seed must give the same id");
  assert.notEqual(seededId("canon:team:al ahly"), seededId("canon:team:zamalek"));
  assert.equal(new Set(Array.from({ length: 500 }, (_, i) => seededId(`seed-${i}`))).size, 500, "ids must not collide");
});

test("dayKey and withinMinutes work across timezones", () => {
  assert.equal(dayKey("2026-03-04T23:30:00+02:00"), "2026-03-04");
  assert.ok(withinMinutes("2026-03-04T20:00:00Z", "2026-03-04T20:20:00Z", 45));
  assert.ok(!withinMinutes("2026-03-04T20:00:00Z", "2026-03-04T21:00:00Z", 45));
});

test("polling: live matches are real-time, finished matches stop", () => {
  const live = profileFor("live");
  assert.equal(live.realtime, true);
  assert.ok(live.intervalSeconds <= 15);

  const shootout = profileFor("penalty_shootout");
  assert.ok(shootout.intervalSeconds <= live.intervalSeconds, "shootout must poll at least as fast as open play");

  const finished = profileFor("finished");
  assert.equal(finished.realtime, false);
  assert.ok(finished.intervalSeconds >= 600);

  const cancelled = profileFor("cancelled");
  assert.ok(cancelled.intervalSeconds >= 3600);
});

test("polling: kickoff window elevates a scheduled fixture", () => {
  const soon = new Date(Date.now() + 10 * 60_000).toISOString();
  const later = new Date(Date.now() + 6 * 3600_000).toISOString();
  assert.equal(profileFor("scheduled", { kickoffAt: soon }).realtime, true);
  assert.equal(profileFor("scheduled", { kickoffAt: later }).realtime, false);
  assert.ok(profileFor("scheduled", { kickoffAt: later }).intervalSeconds > profileFor("scheduled", { kickoffAt: soon }).intervalSeconds);
});

test("polling: throttling doubles intervals and caps real-time polling", () => {
  const normal = profileFor("live");
  const throttled = profileFor("live", { throttled: true });
  assert.ok(throttled.intervalSeconds > normal.intervalSeconds);
  assert.ok(throttled.intervalSeconds <= 60);
  assert.match(throttled.reason, /throttled/);
});

test("cache policy: live data TTLs are seconds, static data TTLs are hours", () => {
  assert.ok(DEFAULT_CACHE_POLICY.live_matches.raw <= 10);
  assert.ok(DEFAULT_CACHE_POLICY.team.raw >= 3600);
  assert.ok(DEFAULT_CACHE_POLICY.live_matches.staleGrace > DEFAULT_CACHE_POLICY.live_matches.canonical);
  for (const [key, p] of Object.entries(DEFAULT_CACHE_POLICY)) {
    assert.ok(p.raw <= p.canonical, `${key}: canonical TTL must outlive the raw TTL`);
  }
});
