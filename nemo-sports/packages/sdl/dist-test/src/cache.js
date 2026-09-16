"use strict";
/**
 * SDL · Cache layers 1 & 2 (§3.7)
 * A pluggable KV store: an in-memory LRU is shipped for dev/tests, and the
 * same interface is satisfied by Redis in production (multi-instance shared).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SdlCache = exports.MemoryStore = void 0;
class MemoryStore {
    maxEntries;
    map = new Map();
    hits = 0;
    misses = 0;
    constructor(maxEntries = 5000) {
        this.maxEntries = maxEntries;
    }
    async get(key) {
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
        return { value: entry.value, expiresAt: entry.expiresAt };
    }
    async set(key, value, ttlSeconds) {
        if (this.map.size >= this.maxEntries) {
            const oldest = this.map.keys().next().value;
            if (oldest)
                this.map.delete(oldest);
        }
        this.map.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    }
    async del(key) {
        this.map.delete(key);
    }
    async delPrefix(prefix) {
        let n = 0;
        for (const k of [...this.map.keys()]) {
            if (k.startsWith(prefix)) {
                this.map.delete(k);
                n++;
            }
        }
        return n;
    }
    async keys(prefix) {
        return [...this.map.keys()].filter((k) => k.startsWith(prefix));
    }
    stats() {
        const total = this.hits + this.misses;
        return { hits: this.hits, misses: this.misses, size: this.map.size, hitRate: total ? this.hits / total : 0 };
    }
}
exports.MemoryStore = MemoryStore;
/**
 * Two-tier cache: raw provider responses (layer 1) and normalized canonical
 * data (layer 2). Layer 2 outlives layer 1 so a provider outage still yields
 * the last known value instead of an error (§14.1).
 */
class SdlCache {
    store;
    constructor(store = new MemoryStore()) {
        this.store = store;
    }
    layerStats = { raw: { hits: 0, misses: 0 }, canonical: { hits: 0, misses: 0 } };
    async getRaw(key) {
        const hit = await this.store.get(key);
        if (hit)
            this.layerStats.raw.hits++;
        else
            this.layerStats.raw.misses++;
        return hit ? hit.value : null;
    }
    async setRaw(key, value, ttlSeconds) {
        await this.store.set(key, value, ttlSeconds);
    }
    async getCanonical(key) {
        const hit = await this.store.get(key);
        if (hit)
            this.layerStats.canonical.hits++;
        else
            this.layerStats.canonical.misses++;
        return hit ? hit.value : null;
    }
    async setCanonical(key, value, ttlSeconds) {
        await this.store.set(key, value, ttlSeconds);
    }
    /** targeted invalidation, e.g. `sdl:canonical:match:{id}` on a goal event */
    async invalidate(prefix) {
        return this.store.delPrefix(prefix);
    }
    stats() {
        const rate = (s) => s.hits + s.misses ? s.hits / (s.hits + s.misses) : 0;
        return [
            { layer: "provider_response", ...this.layerStats.raw, hitRate: rate(this.layerStats.raw) },
            { layer: "canonical_data", ...this.layerStats.canonical, hitRate: rate(this.layerStats.canonical) },
        ];
    }
}
exports.SdlCache = SdlCache;
