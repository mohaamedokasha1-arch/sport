/**
 * Redis driver - the ONLY place allowed to import a Redis client.
 *
 * The SDL depends on its own `RedisLike` interface; this file adapts a real
 * client to it. Redis is optional at runtime: when `REDIS_URL` is unset (or the
 * client cannot load) this returns `null` and the SDL keeps working on its
 * in-process LRU, so a missing cache is never a reason for the site to fail.
 *
 * Connection options matter for that guarantee: `lazyConnect` avoids blocking
 * startup, `enableOfflineQueue: false` makes commands fail fast instead of
 * queueing while Redis is unreachable, and `maxRetriesPerRequest: 1` stops
 * ioredis from retrying a dead socket forever.
 */

import { RedisKvStore, type RedisLike } from "@sdl/index";
import type { Redis, RedisOptions } from "ioredis";

type RedisCtor = new (url: string, options?: RedisOptions) => Redis;

async function loadRedis(): Promise<RedisCtor | null> {
  try {
    const mod = (await import("ioredis")) as unknown as { Redis: RedisCtor; default: RedisCtor };
    return mod.Redis ?? mod.default;
  } catch {
    return null;
  }
}

let client: Redis | null = null;
let kv: RedisKvStore | null = null;
let loadFailed = false;

async function getClient(): Promise<Redis | null> {
  const url = process.env.REDIS_URL;
  if (!url || loadFailed) return null;
  if (client) return client;
  const RedisClient = await loadRedis();
  if (!RedisClient) {
    loadFailed = true;
    return null;
  }
  const options: RedisOptions = {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (times: number) => Math.min(times * 200, 2000),
  };
  client = new RedisClient(url, options);
  return client;
}

/** SCAN-based pattern deletion, so a `sdl:provider:` purge never blocks Redis. */
function asRedisLike(c: Redis): RedisLike {
  return {
    get: (key) => c.get(key),
    set: (key, value, mode, ttl) =>
      mode === "EX" && ttl !== undefined ? c.set(key, value, "EX", ttl) : c.set(key, value),
    del: (key) => c.del(key),
    ttl: (key) => c.ttl(key),
    info: () => c.info(),
    scanKeys: async (pattern: string) => {
      const out: string[] = [];
      let cursor = "0";
      do {
        const [next, batch] = await c.scan(cursor, "MATCH", pattern, "COUNT", 500);
        cursor = next;
        out.push(...batch);
      } while (cursor !== "0" && out.length < 20_000);
      return out;
    },
  };
}

/** The `KvStore` handed to the SDL, or `null` when Redis is unavailable. */
export async function getRedisKv(): Promise<RedisKvStore | null> {
  if (kv) return kv;
  const c = await getClient();
  if (!c) return null;
  kv = new RedisKvStore(asRedisLike(c), {
    keyPrefix: process.env.REDIS_KEY_PREFIX ?? "",
    onEvent: (e) => {
      if (process.env.NEMO_DEBUG === "1") console.debug("[redis]", e.op, e.key, e.hit ?? "");
    },
  });
  return kv;
}

/** Liveness probe for the admin dashboard. Never throws. */
export async function redisHealth(): Promise<{ ok: boolean; detail: string }> {
  if (!process.env.REDIS_URL) return { ok: false, detail: "REDIS_URL غير مضبوط" };
  const store = await getRedisKv();
  if (!store) return { ok: false, detail: "ioredis غير متاح" };
  const h = await store.health();
  return { ok: h.ok, detail: h.detail };
}
