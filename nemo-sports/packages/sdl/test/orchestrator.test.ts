import test from "node:test";
import assert from "node:assert/strict";

import { CollectingLogger, PriorityConfig, SportsDataLayer, type DataType } from "../src/index";
import { DemoAdapter, DEMO_FIXTURES } from "../src/adapters/demo";
import { RequestCoalescer } from "../src/rate-limit";
import type { NormalizedFixture } from "../src/provider";
import type { ProviderName } from "../src/types";

/**
 * A second demo instance stands in for a real secondary provider. The cast is
 * deliberate: `ProviderName` is a closed production union and test doubles must
 * not widen it, so the second adapter is typed locally instead.
 */
type TestProviderName = ProviderName | "demo_b";

/** Build an SDL wired to two demo providers with a deterministic chain. */
function setup(opts: {
  rules?: { provider: TestProviderName; role: "primary" | "secondary" | "fallback"; dataType?: DataType }[];
  rawTtl?: number;
  canonicalTtl?: number;
  staleGrace?: number;
  perDay?: number;
} = {}) {
  const priority = new PriorityConfig();
  const rules = opts.rules ?? [
    { provider: "demo" as const, role: "primary" as const },
    { provider: "demo_b" as const, role: "fallback" as const },
  ];
  rules.forEach((r, i) =>
    priority.upsert({
      id: `t-${i}`,
      sport: "football",
      competition: "*",
      dataType: r.dataType ?? "live_matches",
      // the cast is test-only: ProviderName is a closed production union
      provider: r.provider as "demo",
      role: r.role,
      enabled: true,
    }),
  );

  const logger = new CollectingLogger();
  const sdl = new SportsDataLayer({
    priority,
    logger,
    cachePolicy: { live_matches: { raw: opts.rawTtl ?? 5, canonical: opts.canonicalTtl ?? 10, staleGrace: opts.staleGrace ?? 120 } },
    rateLimits: opts.perDay ? { demo: { perDay: opts.perDay, perSecond: null, perMinute: null, perHour: null, perMonth: null, concurrency: null, throttleAt: 0.85 } } : undefined,
  });

  const primary = new DemoAdapter();
  const backup = new DemoAdapter();
  (backup as unknown as { name: TestProviderName }).name = "demo_b";
  sdl.register(primary).register(backup);
  return { sdl, primary, backup, logger };
}

const liveQuery = (sdl: SportsDataLayer) =>
  sdl.fetch<NormalizedFixture[]>({
    sport: "football",
    dataType: "live_matches",
    endpoint: "live",
    params: { sport: "football" },
    call: (p) => p.getLiveMatches({ sport: "football" }),
  });

test("fetch returns normalized data from the primary provider", async () => {
  const { sdl } = setup();
  const res = await liveQuery(sdl);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.value.provider, "demo");
  assert.equal(res.value.role, "primary");
  assert.equal(res.value.degraded, false);
  assert.equal(res.value.fromCache, false);
  assert.equal(res.value.attempts.length, 1);
  assert.equal(res.value.attempts[0].ok, true);
  assert.ok(res.value.data.length >= 1, "demo feed has a live match");
  assert.equal(res.value.data[0].sport, "football");
});

test("failover: when the primary fails the fallback serves the request", async () => {
  const { sdl, primary } = setup();
  primary.setFault({ dataType: "live_matches", error: "upstream socket closed", code: "network" });

  const res = await liveQuery(sdl);
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.value.provider, "demo_b");
  assert.equal(res.value.role, "fallback");
  assert.equal(res.value.attempts.length, 2);
  assert.equal(res.value.attempts[0].provider, "demo");
  assert.equal(res.value.attempts[0].ok, false);
  assert.match(res.value.attempts[0].error ?? "", /upstream socket closed/);
  assert.ok(res.value.data.length >= 1);
});

test("health: three consecutive failures mark the provider down and drop it from the chain", async () => {
  // zero TTLs: every request must actually reach the providers
  const { sdl, primary } = setup({ rawTtl: 0, canonicalTtl: 0, staleGrace: 0 });
  primary.setFault({ dataType: "live_matches", error: "503 from provider", code: "network" });

  for (let i = 0; i < 3; i++) {
    const res = await liveQuery(sdl);
    assert.equal(res.ok, true);
  }

  const record = sdl.health.record("demo");
  assert.equal(record.status, "down");
  assert.equal(record.consecutiveFailures, 3);
  assert.equal(record.failoverActive, true);
  assert.equal(sdl.health.available("demo"), false);

  // the chain must no longer include the down provider
  const chain = sdl.chainFor("football", null, "live_matches");
  assert.deepEqual(chain.map((c) => c.provider), ["demo_b"]);

  const res = await liveQuery(sdl);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.value.attempts.length, 1, "a down provider must not be called at all");
    assert.equal(res.value.provider, "demo_b");
  }
});

test("health: consecutive successes clear failover", async () => {
  const { sdl, primary } = setup({ rawTtl: 0, canonicalTtl: 0, staleGrace: 0 });
  primary.setFault({ dataType: "live_matches", error: "timeout", code: "timeout" });
  for (let i = 0; i < 3; i++) await liveQuery(sdl);
  assert.equal(sdl.health.record("demo").status, "down");

  primary.setFault(null);
  for (let i = 0; i < 5; i++) {
    sdl.health.setEnabled("demo", true);
    sdl.health.record("demo").status = "healthy";
    sdl.health.record("demo").failoverActive = true;
    sdl.health.noteSuccess("demo", 12);
  }
  assert.equal(sdl.health.record("demo").failoverActive, false);
  assert.equal(sdl.health.record("demo").status, "healthy");
});

test("cache: the second identical call never reaches a provider", async () => {
  const { sdl } = setup();
  const first = await liveQuery(sdl);
  const second = await liveQuery(sdl);
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(first.value.fromCache, false);
  assert.equal(second.value.fromCache, true);
  assert.equal(second.value.attempts.length, 0);
  assert.equal(sdl.costReport().find((c) => c.provider === "demo")?.calls, 1);
  assert.equal(sdl.costReport().find((c) => c.provider === "demo")?.cacheHits, 1);
});

test("targeted invalidation forces a refetch without touching other keys", async () => {
  const { sdl } = setup({ rawTtl: 300, canonicalTtl: 300 });
  await liveQuery(sdl);
  // canonical entry + its :stale twin + the provider's raw response
  const removed = await sdl.invalidate("sdl:canonical:live_matches:");
  assert.equal(removed, 3);
  const again = await liveQuery(sdl);
  if (!again.ok) throw new Error("expected success");
  assert.equal(again.value.fromCache, false);
});

test("rate limit: exceeding the daily budget skips the provider instead of calling it", async () => {
  const { sdl } = setup({ perDay: 1, rawTtl: 0, canonicalTtl: 0, staleGrace: 0 });
  const first = await liveQuery(sdl);
  assert.equal(first.ok, true);
  await sdl.invalidate("sdl:canonical:");

  const second = await liveQuery(sdl);
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.value.provider, "demo_b", "must fall through to the fallback when the primary is over quota");
  const skipped = second.value.attempts.find((a) => a.provider === "demo");
  assert.ok(skipped && !skipped.ok);
  assert.match(skipped?.error ?? "", /rate limit/);
  const cost = sdl.costReport().find((c) => c.provider === "demo");
  assert.equal(cost?.calls, 1);
  assert.equal(cost?.avoided, 1);
});

test("graceful degradation: with every provider down the last good value is served", async () => {
  const { sdl, primary, backup } = setup({ rawTtl: 0, canonicalTtl: 0, staleGrace: 600 });

  const first = await liveQuery(sdl);
  assert.equal(first.ok, true);
  if (first.ok) assert.equal(first.value.stale, false);

  primary.setFault({ dataType: "live_matches", error: "down", code: "network" });
  backup.setFault({ dataType: "live_matches", error: "down", code: "network" });

  const degraded = await liveQuery(sdl);
  assert.equal(degraded.ok, true, "must not surface an error to the user");
  if (!degraded.ok) return;
  assert.equal(degraded.value.stale, true);
  assert.equal(degraded.value.degraded, true);
  assert.ok(degraded.value.data.length >= 1);
  assert.equal(degraded.value.attempts.filter((a) => !a.ok).length, 2);
});

test("hard failure only when there is no provider and no cached value", async () => {
  const priority = new PriorityConfig();
  const sdl = new SportsDataLayer({ priority, logger: new CollectingLogger() });
  sdl.register(new DemoAdapter());
  // one registered provider but no rule for this data type → nothing can serve it
  priority.upsert({ id: "only", sport: "basketball", competition: "*", dataType: "live_matches", provider: "demo", role: "primary", enabled: true });
  const res = await liveQuery(sdl);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.equal(res.error.kind, "no_provider_configured");
  assert.equal(res.error.dataType, "live_matches");
});

test("coalescer: concurrent identical requests share one call", async () => {
  const coalescer = new RequestCoalescer();
  let calls = 0;
  const work = () =>
    coalescer.run("same-key", async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return calls;
    });
  const results = await Promise.all([work(), work(), work()]);
  assert.deepEqual(results, [1, 1, 1]);
  assert.equal(calls, 1);
  assert.equal(coalescer.size, 0);
});

test("coalescer: different keys are independent", async () => {
  const coalescer = new RequestCoalescer();
  let calls = 0;
  const work = (k: string) =>
    coalescer.run(k, async () => {
      calls++;
      return k;
    });
  await Promise.all([work("a"), work("b")]);
  assert.equal(calls, 2);
});

test("diagnostics expose providers, cost, cache and conflict state", async () => {
  const { sdl, primary } = setup();
  primary.setFault({ dataType: "live_matches", error: "boom", code: "network" });
  await liveQuery(sdl);
  const d = sdl.diagnostics();
  assert.equal(d.providers.length, 2);
  assert.ok(d.health.length >= 1);
  assert.ok(d.cache.length === 2);
  assert.equal(typeof d.conflicts.open, "number");
  assert.deepEqual(d.throttled, []);
});

test("apply hook normalizes into the canonical store before caching", async () => {
  const { sdl } = setup({ rules: [{ provider: "demo", role: "primary", dataType: "fixtures" }] });
  let applied = 0;
  const res = await sdl.fetch<NormalizedFixture[]>({
    sport: "football",
    dataType: "fixtures",
    endpoint: "fixtures",
    params: { sport: "football" },
    canonicalKey: "sdl:canonical:fixtures:test",
    call: (p) => p.getFixtures({ sport: "football" }),
    apply: async (data) => {
      applied++;
      return data;
    },
  });
  assert.equal(res.ok, true);
  assert.equal(applied, 1);
  if (res.ok) assert.equal(res.value.data.length, DEMO_FIXTURES.length);
});
