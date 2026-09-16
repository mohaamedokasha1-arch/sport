"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../src/index");
const demo_1 = require("../src/adapters/demo");
const rate_limit_1 = require("../src/rate-limit");
/** Build an SDL wired to two demo providers with a deterministic chain. */
function setup(opts = {}) {
    const priority = new index_1.PriorityConfig();
    const rules = opts.rules ?? [
        { provider: "demo", role: "primary" },
        { provider: "demo_b", role: "fallback" },
    ];
    rules.forEach((r, i) => priority.upsert({
        id: `t-${i}`,
        sport: "football",
        competition: "*",
        dataType: r.dataType ?? "live_matches",
        // the cast is test-only: ProviderName is a closed production union
        provider: r.provider,
        role: r.role,
        enabled: true,
    }));
    const logger = new index_1.CollectingLogger();
    const sdl = new index_1.SportsDataLayer({
        priority,
        logger,
        cachePolicy: { live_matches: { raw: opts.rawTtl ?? 5, canonical: opts.canonicalTtl ?? 10, staleGrace: opts.staleGrace ?? 120 } },
        rateLimits: opts.perDay ? { demo: { perDay: opts.perDay, perSecond: null, perMinute: null, perHour: null, perMonth: null, concurrency: null, throttleAt: 0.85 } } : undefined,
    });
    const primary = new demo_1.DemoAdapter();
    const backup = new demo_1.DemoAdapter();
    backup.name = "demo_b";
    sdl.register(primary).register(backup);
    return { sdl, primary, backup, logger };
}
const liveQuery = (sdl) => sdl.fetch({
    sport: "football",
    dataType: "live_matches",
    endpoint: "live",
    params: { sport: "football" },
    call: (p) => p.getLiveMatches({ sport: "football" }),
});
(0, node_test_1.default)("fetch returns normalized data from the primary provider", async () => {
    const { sdl } = setup();
    const res = await liveQuery(sdl);
    strict_1.default.equal(res.ok, true);
    if (!res.ok)
        return;
    strict_1.default.equal(res.value.provider, "demo");
    strict_1.default.equal(res.value.role, "primary");
    strict_1.default.equal(res.value.degraded, false);
    strict_1.default.equal(res.value.fromCache, false);
    strict_1.default.equal(res.value.attempts.length, 1);
    strict_1.default.equal(res.value.attempts[0].ok, true);
    strict_1.default.ok(res.value.data.length >= 1, "demo feed has a live match");
    strict_1.default.equal(res.value.data[0].sport, "football");
});
(0, node_test_1.default)("failover: when the primary fails the fallback serves the request", async () => {
    const { sdl, primary } = setup();
    primary.setFault({ dataType: "live_matches", error: "upstream socket closed", code: "network" });
    const res = await liveQuery(sdl);
    strict_1.default.equal(res.ok, true);
    if (!res.ok)
        return;
    strict_1.default.equal(res.value.provider, "demo_b");
    strict_1.default.equal(res.value.role, "fallback");
    strict_1.default.equal(res.value.attempts.length, 2);
    strict_1.default.equal(res.value.attempts[0].provider, "demo");
    strict_1.default.equal(res.value.attempts[0].ok, false);
    strict_1.default.match(res.value.attempts[0].error ?? "", /upstream socket closed/);
    strict_1.default.ok(res.value.data.length >= 1);
});
(0, node_test_1.default)("health: three consecutive failures mark the provider down and drop it from the chain", async () => {
    // zero TTLs: every request must actually reach the providers
    const { sdl, primary } = setup({ rawTtl: 0, canonicalTtl: 0, staleGrace: 0 });
    primary.setFault({ dataType: "live_matches", error: "503 from provider", code: "network" });
    for (let i = 0; i < 3; i++) {
        const res = await liveQuery(sdl);
        strict_1.default.equal(res.ok, true);
    }
    const record = sdl.health.record("demo");
    strict_1.default.equal(record.status, "down");
    strict_1.default.equal(record.consecutiveFailures, 3);
    strict_1.default.equal(record.failoverActive, true);
    strict_1.default.equal(sdl.health.available("demo"), false);
    // the chain must no longer include the down provider
    const chain = sdl.chainFor("football", null, "live_matches");
    strict_1.default.deepEqual(chain.map((c) => c.provider), ["demo_b"]);
    const res = await liveQuery(sdl);
    strict_1.default.equal(res.ok, true);
    if (res.ok) {
        strict_1.default.equal(res.value.attempts.length, 1, "a down provider must not be called at all");
        strict_1.default.equal(res.value.provider, "demo_b");
    }
});
(0, node_test_1.default)("health: consecutive successes clear failover", async () => {
    const { sdl, primary } = setup({ rawTtl: 0, canonicalTtl: 0, staleGrace: 0 });
    primary.setFault({ dataType: "live_matches", error: "timeout", code: "timeout" });
    for (let i = 0; i < 3; i++)
        await liveQuery(sdl);
    strict_1.default.equal(sdl.health.record("demo").status, "down");
    primary.setFault(null);
    for (let i = 0; i < 5; i++) {
        sdl.health.setEnabled("demo", true);
        sdl.health.record("demo").status = "healthy";
        sdl.health.record("demo").failoverActive = true;
        sdl.health.noteSuccess("demo", 12);
    }
    strict_1.default.equal(sdl.health.record("demo").failoverActive, false);
    strict_1.default.equal(sdl.health.record("demo").status, "healthy");
});
(0, node_test_1.default)("cache: the second identical call never reaches a provider", async () => {
    const { sdl } = setup();
    const first = await liveQuery(sdl);
    const second = await liveQuery(sdl);
    strict_1.default.equal(first.ok && second.ok, true);
    if (!first.ok || !second.ok)
        return;
    strict_1.default.equal(first.value.fromCache, false);
    strict_1.default.equal(second.value.fromCache, true);
    strict_1.default.equal(second.value.attempts.length, 0);
    strict_1.default.equal(sdl.costReport().find((c) => c.provider === "demo")?.calls, 1);
    strict_1.default.equal(sdl.costReport().find((c) => c.provider === "demo")?.cacheHits, 1);
});
(0, node_test_1.default)("targeted invalidation forces a refetch without touching other keys", async () => {
    const { sdl } = setup({ rawTtl: 300, canonicalTtl: 300 });
    await liveQuery(sdl);
    // canonical entry + its :stale twin + the provider's raw response
    const removed = await sdl.invalidate("sdl:canonical:live_matches:");
    strict_1.default.equal(removed, 3);
    const again = await liveQuery(sdl);
    if (!again.ok)
        throw new Error("expected success");
    strict_1.default.equal(again.value.fromCache, false);
});
(0, node_test_1.default)("rate limit: exceeding the daily budget skips the provider instead of calling it", async () => {
    const { sdl } = setup({ perDay: 1, rawTtl: 0, canonicalTtl: 0, staleGrace: 0 });
    const first = await liveQuery(sdl);
    strict_1.default.equal(first.ok, true);
    await sdl.invalidate("sdl:canonical:");
    const second = await liveQuery(sdl);
    strict_1.default.equal(second.ok, true);
    if (!second.ok)
        return;
    strict_1.default.equal(second.value.provider, "demo_b", "must fall through to the fallback when the primary is over quota");
    const skipped = second.value.attempts.find((a) => a.provider === "demo");
    strict_1.default.ok(skipped && !skipped.ok);
    strict_1.default.match(skipped?.error ?? "", /rate limit/);
    const cost = sdl.costReport().find((c) => c.provider === "demo");
    strict_1.default.equal(cost?.calls, 1);
    strict_1.default.equal(cost?.avoided, 1);
});
(0, node_test_1.default)("graceful degradation: with every provider down the last good value is served", async () => {
    const { sdl, primary, backup } = setup({ rawTtl: 0, canonicalTtl: 0, staleGrace: 600 });
    const first = await liveQuery(sdl);
    strict_1.default.equal(first.ok, true);
    if (first.ok)
        strict_1.default.equal(first.value.stale, false);
    primary.setFault({ dataType: "live_matches", error: "down", code: "network" });
    backup.setFault({ dataType: "live_matches", error: "down", code: "network" });
    const degraded = await liveQuery(sdl);
    strict_1.default.equal(degraded.ok, true, "must not surface an error to the user");
    if (!degraded.ok)
        return;
    strict_1.default.equal(degraded.value.stale, true);
    strict_1.default.equal(degraded.value.degraded, true);
    strict_1.default.ok(degraded.value.data.length >= 1);
    strict_1.default.equal(degraded.value.attempts.filter((a) => !a.ok).length, 2);
});
(0, node_test_1.default)("hard failure only when there is no provider and no cached value", async () => {
    const priority = new index_1.PriorityConfig();
    const sdl = new index_1.SportsDataLayer({ priority, logger: new index_1.CollectingLogger() });
    sdl.register(new demo_1.DemoAdapter());
    // one registered provider but no rule for this data type → nothing can serve it
    priority.upsert({ id: "only", sport: "basketball", competition: "*", dataType: "live_matches", provider: "demo", role: "primary", enabled: true });
    const res = await liveQuery(sdl);
    strict_1.default.equal(res.ok, false);
    if (res.ok)
        return;
    strict_1.default.equal(res.error.kind, "no_provider_configured");
    strict_1.default.equal(res.error.dataType, "live_matches");
});
(0, node_test_1.default)("coalescer: concurrent identical requests share one call", async () => {
    const coalescer = new rate_limit_1.RequestCoalescer();
    let calls = 0;
    const work = () => coalescer.run("same-key", async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 10));
        return calls;
    });
    const results = await Promise.all([work(), work(), work()]);
    strict_1.default.deepEqual(results, [1, 1, 1]);
    strict_1.default.equal(calls, 1);
    strict_1.default.equal(coalescer.size, 0);
});
(0, node_test_1.default)("coalescer: different keys are independent", async () => {
    const coalescer = new rate_limit_1.RequestCoalescer();
    let calls = 0;
    const work = (k) => coalescer.run(k, async () => {
        calls++;
        return k;
    });
    await Promise.all([work("a"), work("b")]);
    strict_1.default.equal(calls, 2);
});
(0, node_test_1.default)("diagnostics expose providers, cost, cache and conflict state", async () => {
    const { sdl, primary } = setup();
    primary.setFault({ dataType: "live_matches", error: "boom", code: "network" });
    await liveQuery(sdl);
    const d = sdl.diagnostics();
    strict_1.default.equal(d.providers.length, 2);
    strict_1.default.ok(d.health.length >= 1);
    strict_1.default.ok(d.cache.length === 2);
    strict_1.default.equal(typeof d.conflicts.open, "number");
    strict_1.default.deepEqual(d.throttled, []);
});
(0, node_test_1.default)("apply hook normalizes into the canonical store before caching", async () => {
    const { sdl } = setup({ rules: [{ provider: "demo", role: "primary", dataType: "fixtures" }] });
    let applied = 0;
    const res = await sdl.fetch({
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
    strict_1.default.equal(res.ok, true);
    strict_1.default.equal(applied, 1);
    if (res.ok)
        strict_1.default.equal(res.value.data.length, demo_1.DEMO_FIXTURES.length);
});
