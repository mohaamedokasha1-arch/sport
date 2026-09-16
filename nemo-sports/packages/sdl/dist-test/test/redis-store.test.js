"use strict";
/**
 * RedisKvStore - the SDL's distributed cache layer.
 *
 * Verified against a fake client that counts calls, so the assertions are about
 * the contract the cache layer depends on: wrapped values with their own
 * expiry, prefix invalidation by SCAN (never KEYS/FLUSH), and - most
 * importantly - that a Redis outage degrades to a cache miss instead of
 * failing the request (§14.3: no single point of failure).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const redis_store_1 = require("../src/redis-store");
class FakeRedis {
    data = new Map();
    calls = { get: 0, set: 0, del: 0, scans: 0 };
    failNext = false;
    withScan = true;
    withTtl = true;
    withInfo = true;
    async get(key) {
        this.calls.get++;
        if (this.failNext)
            throw new Error("ECONNREFUSED");
        return this.data.get(key) ?? null;
    }
    async set(key, value) {
        this.calls.set++;
        if (this.failNext)
            throw new Error("ECONNREFUSED");
        this.data.set(key, value);
        return "OK";
    }
    async del(key) {
        this.calls.del++;
        if (this.failNext)
            throw new Error("ECONNREFUSED");
        return this.data.delete(key) ? 1 : 0;
    }
    async ttl(key) {
        if (!this.withTtl)
            throw new Error("no ttl");
        return this.data.has(key) ? 42 : -2;
    }
    async info() {
        if (!this.withInfo)
            throw new Error("no info");
        return "# Server\r\nredis_version:7.2.4\r\n# Memory\r\nused_memory_human:12.3M\r\n";
    }
    /** Attached conditionally so the "no SCAN" path is genuinely exercised. */
    get scanKeys() {
        if (!this.withScan)
            return undefined;
        return async (pattern) => {
            this.calls.scans++;
            const prefix = pattern.replace(/\*$/, "");
            return [...this.data.keys()].filter((k) => k.startsWith(prefix));
        };
    }
}
/** `RedisLike` is structural, so build the object the store receives explicitly. */
function makeStore(fake, opts = {}) {
    const client = {
        get: (k) => fake.get(k),
        set: (k, v) => fake.set(k, v),
        del: (k) => fake.del(k),
        ...(fake.withScan ? { scanKeys: (p) => fake.scanKeys(p) } : {}),
        ...(fake.withTtl ? { ttl: (k) => fake.ttl(k) } : {}),
        ...(fake.withInfo ? { info: () => fake.info() } : {}),
    };
    return new redis_store_1.RedisKvStore(client, opts);
}
(0, node_test_1.describe)("RedisKvStore", () => {
    (0, node_test_1.it)("round-trips a value and reports its expiry", async () => {
        const fake = new FakeRedis();
        const store = makeStore(fake);
        await store.set("sdl:canonical:fixtures:abc", { n: 1 }, 60);
        const hit = await store.get("sdl:canonical:fixtures:abc");
        strict_1.default.equal(hit?.value.n, 1);
        strict_1.default.ok(hit.expiresAt > Date.now(), "expiry must be in the future");
        strict_1.default.ok(hit.expiresAt <= Date.now() + 60_000, "expiry must honour the TTL");
    });
    (0, node_test_1.it)("returns null for a missing key", async () => {
        const store = makeStore(new FakeRedis());
        strict_1.default.equal(await store.get("sdl:canonical:fixtures:nope"), null);
    });
    (0, node_test_1.it)("treats a logically expired entry as a miss and evicts it", async () => {
        const fake = new FakeRedis();
        const store = makeStore(fake);
        // write an already-expired entry directly
        fake.data.set("sdl:canonical:live:old", JSON.stringify({ value: { n: 1 }, expiresAt: Date.now() - 1 }));
        strict_1.default.equal(await store.get("sdl:canonical:live:old"), null);
        strict_1.default.equal(fake.data.has("sdl:canonical:live:old"), false, "expired entry should be evicted");
    });
    (0, node_test_1.it)("treats a corrupt entry as a miss rather than throwing", async () => {
        const fake = new FakeRedis();
        const store = makeStore(fake);
        fake.data.set("sdl:canonical:live:broken", "not json at all");
        strict_1.default.equal(await store.get("sdl:canonical:live:broken"), null);
    });
    (0, node_test_1.it)("applies the key prefix on every operation", async () => {
        const fake = new FakeRedis();
        const store = makeStore(fake, { keyPrefix: "staging:" });
        await store.set("sdl:canonical:fixtures:a", { n: 2 }, 30);
        strict_1.default.ok(fake.data.has("staging:sdl:canonical:fixtures:a"));
        strict_1.default.equal((await store.get("sdl:canonical:fixtures:a"))?.value.n, 2);
    });
    (0, node_test_1.it)("invalidates by prefix with SCAN and reports the count", async () => {
        const fake = new FakeRedis();
        const store = makeStore(fake);
        await store.set("sdl:provider:sportmonks:fixtures:1", { a: 1 }, 30);
        await store.set("sdl:provider:sportmonks:fixtures:2", { a: 2 }, 30);
        await store.set("sdl:canonical:fixtures:keep", { a: 3 }, 30);
        const removed = await store.delPrefix("sdl:provider:");
        strict_1.default.equal(removed, 2);
        strict_1.default.ok(fake.calls.scans >= 1, "prefix invalidation must go through SCAN, never KEYS");
        strict_1.default.equal((await store.get("sdl:canonical:fixtures:keep")) !== null, true, "unrelated keys survive");
    });
    (0, node_test_1.it)("lists keys under a prefix with the prefix stripped back off", async () => {
        const fake = new FakeRedis();
        const store = makeStore(fake, { keyPrefix: "p:" });
        await store.set("sdl:rl:sportmonks:minute:1", 5, 60);
        await store.set("sdl:rl:sportmonks:minute:2", 6, 60);
        const keys = await store.keys("sdl:rl:sportmonks:minute:");
        strict_1.default.deepEqual(keys.sort(), ["sdl:rl:sportmonks:minute:1", "sdl:rl:sportmonks:minute:2"]);
    });
    (0, node_test_1.it)("degrades to a miss when Redis is down - the request must never fail", async () => {
        const fake = new FakeRedis();
        const store = makeStore(fake);
        fake.failNext = true;
        strict_1.default.equal(await store.get("sdl:canonical:fixtures:a"), null);
        await store.set("sdl:canonical:fixtures:a", { n: 1 }, 30); // must not throw
        strict_1.default.equal(await store.del("sdl:canonical:fixtures:a"), undefined);
        strict_1.default.equal(await store.delPrefix("sdl:provider:"), 0);
    });
    (0, node_test_1.it)("reports remaining TTL, and 0 when the client cannot answer", async () => {
        const withTtl = makeStore(new FakeRedis());
        await withTtl.set("k", 1, 60);
        strict_1.default.equal(await withTtl.remainingSeconds("k"), 42);
        const fake = new FakeRedis();
        fake.withTtl = false;
        strict_1.default.equal(await makeStore(fake).remainingSeconds("k"), 0);
    });
    (0, node_test_1.it)("exposes a health probe for the admin dashboard without throwing", async () => {
        const healthy = await makeStore(new FakeRedis()).health();
        strict_1.default.equal(healthy.ok, true);
        strict_1.default.match(healthy.detail, /redis 7\.2\.4/);
        strict_1.default.match(healthy.detail, /12\.3M/);
        strict_1.default.match(healthy.detail, /probe ok/);
        // a client without INFO is still healthy when the round-trip works
        const noInfo = new FakeRedis();
        noInfo.withInfo = false;
        strict_1.default.equal((await makeStore(noInfo).health()).ok, true);
        // the case that matters: the connection is refused, so the probe fails
        const down = new FakeRedis();
        down.failNext = true;
        const bad = await makeStore(down).health();
        strict_1.default.equal(bad.ok, false);
        strict_1.default.equal(bad.failures, 1);
        strict_1.default.match(bad.detail, /ECONNREFUSED/);
    });
});
