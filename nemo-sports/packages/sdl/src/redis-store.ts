/**
 * SDL - Redis implementation of `KvStore`
 * ---------------------------------------
 * Dependency inversion: this file speaks Redis through the narrow `RedisLike`
 * interface. The client itself is created outside the package
 * (`lib/cache/redis.ts` in the app), so the SDL keeps zero runtime
 * dependencies and this class stays testable with a fake.
 *
 * Keys are exactly the ones the cache layer builds:
 *   sdl:provider:{provider}:{endpoint}:{fingerprint}
 *   sdl:rl:{provider}:{window}:{bucket}
 *   sdl:canonical:{dataType}:{requestKey}   (+ `:stale` mirror)
 *
 * Values are wrapped as { value, expiresAt } so an entry carries its own
 * logical expiry; the Redis TTL is a second line of defence that keeps memory
 * bounded. A cache failure never propagates: every method degrades to a miss.
 */

import type { KvStore } from "./cache";

/** The subset of a Redis client the SDL needs. `ioredis` and `node-redis` both satisfy it. */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: "EX", ttlSeconds?: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
  /** Delete by pattern. SCAN, not KEYS, so a large keyspace never blocks. */
  scanKeys?(pattern: string): Promise<string[]>;
  /** Optional: native TTL query, used by `remainingSeconds`. */
  ttl?(key: string): Promise<number>;
  info?(): Promise<string>;
}

export type RedisKvOptions = {
  /** Prefix prepended to every key, so environments can share one Redis. */
  keyPrefix?: string;
  onEvent?: (e: { op: "get" | "set" | "del" | "scan"; key: string; hit?: boolean; bytes?: number }) => void;
};

type Wrapped<T> = { value: T; expiresAt: number };

const SCAN_BATCH = 500;
const SCAN_CEILING = 20_000;

export class RedisKvStore implements KvStore {
  private prefix: string;
  private onEvent: NonNullable<RedisKvOptions["onEvent"]>;
  /** Consecutive transport failures, surfaced as a `healthy: false` diagnostic. */
  private failures = 0;

  constructor(
    private client: RedisLike,
    options: RedisKvOptions = {},
  ) {
    this.prefix = options.keyPrefix ?? "";
    this.onEvent = options.onEvent ?? (() => {});
  }

  private k(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get<T>(key: string): Promise<{ value: T; expiresAt: number } | null> {
    try {
      const raw = await this.client.get(this.k(key));
      this.failures = 0;
      const hit = raw !== null && raw !== undefined;
      this.onEvent({ op: "get", key, hit });
      if (!hit) return null;

      let parsed: Wrapped<T>;
      try {
        parsed = JSON.parse(raw as string) as Wrapped<T>;
      } catch {
        return null; // corrupt entry: a miss, never an exception
      }
      if (!parsed || typeof parsed !== "object" || !("value" in parsed)) return null;

      const expiresAt = typeof parsed.expiresAt === "number" ? parsed.expiresAt : Infinity;
      if (expiresAt <= Date.now()) {
        void this.del(key); // lazy expiry for anything Redis outlived
        return null;
      }
      return { value: parsed.value, expiresAt };
    } catch {
      this.failures++;
      this.onEvent({ op: "get", key, hit: false });
      return null; // the cache is never the reason a request fails
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const wrapped: Wrapped<T> = {
        value,
        expiresAt: ttlSeconds && ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : Infinity,
      };
      const payload = JSON.stringify(wrapped);
      if (ttlSeconds !== undefined && ttlSeconds > 0) {
        await this.client.set(this.k(key), payload, "EX", Math.max(1, Math.floor(ttlSeconds)));
      } else {
        await this.client.set(this.k(key), payload);
      }
      this.failures = 0;
      this.onEvent({ op: "set", key, bytes: payload.length });
    } catch {
      this.failures++;
      this.onEvent({ op: "set", key });
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(this.k(key));
      this.failures = 0;
      this.onEvent({ op: "del", key });
    } catch {
      this.failures++;
      this.onEvent({ op: "del", key });
    }
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  /** Delete every key under a prefix and report how many went (targeted invalidation, never a flush). */
  async delPrefix(prefix: string): Promise<number> {
    const pattern = `${this.k(prefix)}*`;
    if (!this.client.scanKeys) {
      await this.del(pattern); // best effort for clients without SCAN
      return 0;
    }
    try {
      const keys = await this.client.scanKeys(pattern);
      this.onEvent({ op: "scan", key: pattern });
      for (let i = 0; i < keys.length; i += SCAN_BATCH) {
        await Promise.all(keys.slice(i, i + SCAN_BATCH).map((k) => this.client.del(k)));
      }
      this.failures = 0;
      return keys.length;
    } catch {
      this.failures++;
      return 0;
    }
  }

  /** Keys under a prefix, with the store prefix stripped back off. */
  async keys(prefix: string): Promise<string[]> {
    if (!this.client.scanKeys) return [];
    try {
      const found = await this.client.scanKeys(`${this.k(prefix)}*`);
      return found.map((k) => (this.prefix ? k.slice(this.prefix.length) : k));
    } catch {
      return [];
    }
  }

  /** TTL left on a key in seconds; `0` when unknown or absent. */
  async remainingSeconds(key: string): Promise<number> {
    if (!this.client.ttl) return 0;
    try {
      const t = await this.client.ttl(this.k(key));
      return t > 0 ? t : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Liveness probe for the admin dashboard. Never throws.
   *
   * It performs a real round-trip (write + read + delete of a probe key)
   * rather than trusting the absence of errors, so a client that simply does
   * not implement INFO cannot report a healthy cache it cannot use.
   */
  async health(): Promise<{ ok: boolean; detail: string; failures: number }> {
    const probeKey = `${this.prefix}sdl:health:probe`;
    let version = "unknown";
    let used = "?";

    if (this.client.info) {
      try {
        const info = await this.client.info();
        version = /redis_version:([^\r\n]+)/.exec(info)?.[1] ?? "unknown";
        used = /used_memory_human:([^\r\n]+)/.exec(info)?.[1] ?? "?";
      } catch (e) {
        this.failures++;
        return { ok: false, detail: e instanceof Error ? e.message : String(e), failures: this.failures };
      }
    }

    try {
      await this.client.set(probeKey, JSON.stringify({ value: 1, expiresAt: Date.now() + 10_000 }), "EX", 10);
      const back = await this.client.get(probeKey);
      await this.client.del(probeKey);
      if (back === null || back === undefined) throw new Error("probe key did not round-trip");
      this.failures = 0;
      return { ok: true, detail: `redis ${version}, ${used}, probe ok`, failures: 0 };
    } catch (e) {
      this.failures++;
      return { ok: false, detail: e instanceof Error ? e.message : String(e), failures: this.failures };
    }
  }
}

/** SCAN ceiling shared with the app-side driver so both agree on the stop condition. */
export const REDIS_SCAN_CEILING = SCAN_CEILING;
