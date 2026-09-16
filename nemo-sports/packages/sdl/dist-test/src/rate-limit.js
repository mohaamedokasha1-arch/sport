"use strict";
/**
 * SDL · Provider rate limit management (§3.8)
 * Counters live in the shared KvStore so horizontally-scaled SDL instances
 * share one budget instead of each thinking it owns the whole quota.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestCoalescer = exports.RateLimiter = void 0;
const WINDOWS = [
    { key: "second", seconds: 1 },
    { key: "minute", seconds: 60 },
    { key: "hour", seconds: 3600 },
    { key: "day", seconds: 86_400 },
    { key: "month", seconds: 2_592_000 },
];
class RateLimiter {
    store;
    configs;
    inflight = new Map();
    constructor(store, configs) {
        this.store = store;
        this.configs = configs;
    }
    setConfig(cfg) {
        this.configs.set(cfg.provider, cfg);
    }
    config(provider) {
        return this.configs.get(provider);
    }
    key(provider, window, bucket) {
        return `sdl:rl:${provider}:${window}:${bucket}`;
    }
    async read(provider) {
        const cfg = this.configs.get(provider);
        if (!cfg)
            return [];
        const now = Math.floor(Date.now() / 1000);
        const out = [];
        for (const w of WINDOWS) {
            const limit = cfg[w.key === "second" ? "perSecond" : w.key === "minute" ? "perMinute" : w.key === "hour" ? "perHour" : w.key === "day" ? "perDay" : "perMonth"];
            if (!limit)
                continue;
            const bucket = Math.floor(now / w.seconds);
            const used = Number((await this.store.get(this.key(provider, w.key, bucket)))?.value ?? 0);
            out.push({ window: w.key, used, limit, ratio: used / limit });
        }
        return out;
    }
    /** Call before every provider request. Never throws. */
    async check(provider) {
        const cfg = this.configs.get(provider);
        const usage = await this.read(provider);
        if (!cfg)
            return { allowed: true, reason: "ok", usage };
        if (cfg.concurrency) {
            const live = this.inflight.get(provider) ?? 0;
            if (live >= cfg.concurrency) {
                return { allowed: false, reason: "concurrency", usage, retryAfterSeconds: 1 };
            }
        }
        for (const u of usage) {
            if (u.used >= u.limit) {
                const w = WINDOWS.find((x) => x.key === u.window);
                const now = Math.floor(Date.now() / 1000);
                const bucket = Math.floor(now / w.seconds);
                return {
                    allowed: false,
                    reason: "exhausted",
                    usage,
                    retryAfterSeconds: Math.max(1, (bucket + 1) * w.seconds - now),
                };
            }
        }
        return { allowed: true, reason: "ok", usage };
    }
    /** True when usage passed the throttle threshold — polling frequency drops. */
    async shouldThrottle(provider) {
        const cfg = this.configs.get(provider);
        if (!cfg)
            return false;
        const usage = await this.read(provider);
        return usage.some((u) => u.ratio >= cfg.throttleAt);
    }
    /** Record one completed request against every configured window. */
    async record(provider) {
        const cfg = this.configs.get(provider);
        if (!cfg)
            return;
        const now = Math.floor(Date.now() / 1000);
        for (const w of WINDOWS) {
            const limit = cfg[w.key === "second" ? "perSecond" : w.key === "minute" ? "perMinute" : w.key === "hour" ? "perHour" : w.key === "day" ? "perDay" : "perMonth"];
            if (!limit)
                continue;
            const bucket = Math.floor(now / w.seconds);
            const k = this.key(provider, w.key, bucket);
            const cur = Number((await this.store.get(k))?.value ?? 0);
            await this.store.set(k, cur + 1, w.seconds + 5);
        }
    }
    begin(provider) {
        this.inflight.set(provider, (this.inflight.get(provider) ?? 0) + 1);
    }
    end(provider) {
        this.inflight.set(provider, Math.max(0, (this.inflight.get(provider) ?? 0) - 1));
    }
    usage(provider) {
        return this.read(provider);
    }
}
exports.RateLimiter = RateLimiter;
/** In-flight dedup: identical requests share one network call (§3.8). */
class RequestCoalescer {
    pending = new Map();
    async run(key, fn) {
        const existing = this.pending.get(key);
        if (existing)
            return existing;
        const p = fn().finally(() => this.pending.delete(key));
        this.pending.set(key, p);
        return p;
    }
    get size() {
        return this.pending.size;
    }
}
exports.RequestCoalescer = RequestCoalescer;
