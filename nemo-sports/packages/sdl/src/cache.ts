/**
 * SDL · Cache layers 1 & 2 (§3.7)
 * A pluggable KV store: an in-memory LRU is shipped for dev/tests, and the
 * same interface is satisfied by Redis in production (multi-instance shared).
 */

export interface KvStore {
  get<T>(key: string): Promise<{ value: T; expiresAt: number } | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  /** invalidate by prefix — targeted, never a global flush (§3.7) */
  delPrefix(prefix: string): Promise<number>;
  keys(prefix: string): Promise<string[]>;
}

export class MemoryStore implements KvStore {
  private map = new Map<string, { value: unknown; expiresAt: number }>();
  private hits = 0;
  private misses = 0;

  constructor(private maxEntries = 5000) {}

  async get<T>(key: string): Promise<{ value: T; expiresAt: number } | null> {
    const entry = this.map.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      this.misses++;
      return null;
    }
    // LRU touch
    this.map.delete(key);
    this.map.set(key, entry);
    this.hits++;
    return { value: entry.value as T, expiresAt: entry.expiresAt };
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest) this.map.delete(oldest);
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    this.map.delete(key);
  }

  async delPrefix(prefix: string): Promise<number> {
    let n = 0;
    for (const k of [...this.map.keys()]) {
      if (k.startsWith(prefix)) {
        this.map.delete(k);
        n++;
      }
    }
    return n;
  }

  async keys(prefix: string): Promise<string[]> {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix));
  }

  stats() {
    const total = this.hits + this.misses;
    return { hits: this.hits, misses: this.misses, size: this.map.size, hitRate: total ? this.hits / total : 0 };
  }
}

export type CacheStats = { layer: string; hits: number; misses: number; hitRate: number };

/**
 * Two-tier cache: raw provider responses (layer 1) and normalized canonical
 * data (layer 2). Layer 2 outlives layer 1 so a provider outage still yields
 * the last known value instead of an error (§14.1).
 */
export class SdlCache {
  constructor(private store: KvStore = new MemoryStore()) {}

  private layerStats = { raw: { hits: 0, misses: 0 }, canonical: { hits: 0, misses: 0 } };

  async getRaw<T>(key: string): Promise<T | null> {
    const hit = await this.store.get<T>(key);
    if (hit) this.layerStats.raw.hits++;
    else this.layerStats.raw.misses++;
    return hit ? hit.value : null;
  }

  async setRaw<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.store.set(key, value, ttlSeconds);
  }

  async getCanonical<T>(key: string): Promise<T | null> {
    const hit = await this.store.get<T>(key);
    if (hit) this.layerStats.canonical.hits++;
    else this.layerStats.canonical.misses++;
    return hit ? hit.value : null;
  }

  async setCanonical<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.store.set(key, value, ttlSeconds);
  }

  /** targeted invalidation, e.g. `sdl:canonical:match:{id}` on a goal event */
  async invalidate(prefix: string): Promise<number> {
    return this.store.delPrefix(prefix);
  }

  stats(): CacheStats[] {
    const rate = (s: { hits: number; misses: number }) =>
      s.hits + s.misses ? s.hits / (s.hits + s.misses) : 0;
    return [
      { layer: "provider_response", ...this.layerStats.raw, hitRate: rate(this.layerStats.raw) },
      { layer: "canonical_data", ...this.layerStats.canonical, hitRate: rate(this.layerStats.canonical) },
    ];
  }
}
