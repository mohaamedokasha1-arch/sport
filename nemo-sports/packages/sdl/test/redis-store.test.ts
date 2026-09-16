/**
 * RedisKvStore - the SDL's distributed cache layer.
 *
 * Verified against a fake client that counts calls, so the assertions are about
 * the contract the cache layer depends on: wrapped values with their own
 * expiry, prefix invalidation by SCAN (never KEYS/FLUSH), and - most
 * importantly - that a Redis outage degrades to a cache miss instead of
 * failing the request (§14.3: no single point of failure).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { RedisKvStore, type RedisLike } from "../src/redis-store";

class FakeRedis implements RedisLike {
  data = new Map<string, string>();
  calls = { get: 0, set: 0, del: 0, scans: 0 };
  failNext = false;
  withScan = true;
  withTtl = true;
  withInfo = true;

  async get(key: string): Promise<string | null> {
    this.calls.get++;
    if (this.failNext) throw new Error("ECONNREFUSED");
    return this.data.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<unknown> {
    this.calls.set++;
    if (this.failNext) throw new Error("ECONNREFUSED");
    this.data.set(key, value);
    return "OK";
  }

  async del(key: string): Promise<unknown> {
    this.calls.del++;
    if (this.failNext) throw new Error("ECONNREFUSED");
    return this.data.delete(key) ? 1 : 0;
  }

  async ttl(key: string): Promise<number> {
    if (!this.withTtl) throw new Error("no ttl");
    return this.data.has(key) ? 42 : -2;
  }

  async info(): Promise<string> {
    if (!this.withInfo) throw new Error("no info");
    return "# Server\r\nredis_version:7.2.4\r\n# Memory\r\nused_memory_human:12.3M\r\n";
  }

  /** Attached conditionally so the "no SCAN" path is genuinely exercised. */
  get scanKeys(): ((pattern: string) => Promise<string[]>) | undefined {
    if (!this.withScan) return undefined;
    return async (pattern: string) => {
      this.calls.scans++;
      const prefix = pattern.replace(/\*$/, "");
      return [...this.data.keys()].filter((k) => k.startsWith(prefix));
    };
  }
}

/** `RedisLike` is structural, so build the object the store receives explicitly. */
function makeStore(fake: FakeRedis, opts: { keyPrefix?: string } = {}) {
  const client: RedisLike = {
    get: (k) => fake.get(k),
    set: (k, v) => fake.set(k, v),
    del: (k) => fake.del(k),
    ...(fake.withScan ? { scanKeys: (p: string) => (fake.scanKeys as (p: string) => Promise<string[]>)(p) } : {}),
    ...(fake.withTtl ? { ttl: (k: string) => fake.ttl(k) } : {}),
    ...(fake.withInfo ? { info: () => fake.info() } : {}),
  };
  return new RedisKvStore(client, opts);
}

describe("RedisKvStore", () => {
  it("round-trips a value and reports its expiry", async () => {
    const fake = new FakeRedis();
    const store = makeStore(fake);

    await store.set("sdl:canonical:fixtures:abc", { n: 1 }, 60);
    const hit = await store.get<{ n: number }>("sdl:canonical:fixtures:abc");

    assert.equal(hit?.value.n, 1);
    assert.ok(hit!.expiresAt > Date.now(), "expiry must be in the future");
    assert.ok(hit!.expiresAt <= Date.now() + 60_000, "expiry must honour the TTL");
  });

  it("returns null for a missing key", async () => {
    const store = makeStore(new FakeRedis());
    assert.equal(await store.get("sdl:canonical:fixtures:nope"), null);
  });

  it("treats a logically expired entry as a miss and evicts it", async () => {
    const fake = new FakeRedis();
    const store = makeStore(fake);

    // write an already-expired entry directly
    fake.data.set("sdl:canonical:live:old", JSON.stringify({ value: { n: 1 }, expiresAt: Date.now() - 1 }));
    assert.equal(await store.get("sdl:canonical:live:old"), null);
    assert.equal(fake.data.has("sdl:canonical:live:old"), false, "expired entry should be evicted");
  });

  it("treats a corrupt entry as a miss rather than throwing", async () => {
    const fake = new FakeRedis();
    const store = makeStore(fake);
    fake.data.set("sdl:canonical:live:broken", "not json at all");
    assert.equal(await store.get("sdl:canonical:live:broken"), null);
  });

  it("applies the key prefix on every operation", async () => {
    const fake = new FakeRedis();
    const store = makeStore(fake, { keyPrefix: "staging:" });
    await store.set("sdl:canonical:fixtures:a", { n: 2 }, 30);
    assert.ok(fake.data.has("staging:sdl:canonical:fixtures:a"));
    assert.equal((await store.get<{ n: number }>("sdl:canonical:fixtures:a"))?.value.n, 2);
  });

  it("invalidates by prefix with SCAN and reports the count", async () => {
    const fake = new FakeRedis();
    const store = makeStore(fake);
    await store.set("sdl:provider:sportmonks:fixtures:1", { a: 1 }, 30);
    await store.set("sdl:provider:sportmonks:fixtures:2", { a: 2 }, 30);
    await store.set("sdl:canonical:fixtures:keep", { a: 3 }, 30);

    const removed = await store.delPrefix("sdl:provider:");
    assert.equal(removed, 2);
    assert.ok(fake.calls.scans >= 1, "prefix invalidation must go through SCAN, never KEYS");
    assert.equal((await store.get("sdl:canonical:fixtures:keep")) !== null, true, "unrelated keys survive");
  });

  it("lists keys under a prefix with the prefix stripped back off", async () => {
    const fake = new FakeRedis();
    const store = makeStore(fake, { keyPrefix: "p:" });
    await store.set("sdl:rl:sportmonks:minute:1", 5, 60);
    await store.set("sdl:rl:sportmonks:minute:2", 6, 60);
    const keys = await store.keys("sdl:rl:sportmonks:minute:");
    assert.deepEqual(keys.sort(), ["sdl:rl:sportmonks:minute:1", "sdl:rl:sportmonks:minute:2"]);
  });

  it("degrades to a miss when Redis is down - the request must never fail", async () => {
    const fake = new FakeRedis();
    const store = makeStore(fake);
    fake.failNext = true;

    assert.equal(await store.get("sdl:canonical:fixtures:a"), null);
    await store.set("sdl:canonical:fixtures:a", { n: 1 }, 30); // must not throw
    assert.equal(await store.del("sdl:canonical:fixtures:a"), undefined);
    assert.equal(await store.delPrefix("sdl:provider:"), 0);
  });

  it("reports remaining TTL, and 0 when the client cannot answer", async () => {
    const withTtl = makeStore(new FakeRedis());
    await withTtl.set("k", 1, 60);
    assert.equal(await withTtl.remainingSeconds("k"), 42);

    const fake = new FakeRedis();
    fake.withTtl = false;
    assert.equal(await makeStore(fake).remainingSeconds("k"), 0);
  });

  it("exposes a health probe for the admin dashboard without throwing", async () => {
    const healthy = await makeStore(new FakeRedis()).health();
    assert.equal(healthy.ok, true);
    assert.match(healthy.detail, /redis 7\.2\.4/);
    assert.match(healthy.detail, /12\.3M/);
    assert.match(healthy.detail, /probe ok/);

    // a client without INFO is still healthy when the round-trip works
    const noInfo = new FakeRedis();
    noInfo.withInfo = false;
    assert.equal((await makeStore(noInfo).health()).ok, true);

    // the case that matters: the connection is refused, so the probe fails
    const down = new FakeRedis();
    down.failNext = true;
    const bad = await makeStore(down).health();
    assert.equal(bad.ok, false);
    assert.equal(bad.failures, 1);
    assert.match(bad.detail, /ECONNREFUSED/);
  });
});
