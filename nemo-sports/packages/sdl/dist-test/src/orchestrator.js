"use strict";
/**
 * SDL · Orchestrator (§3.1)
 * ──────────────────────────
 * The only component that talks to providers. Everything upstream (API server,
 * jobs, admin dashboard) calls this class and receives canonical data or a
 * documented failure — never a provider error, never a provider shape.
 *
 * Responsibilities implemented here:
 *   · provider orchestration with failover (§3.10)
 *   · priority chain resolution (§3.5)
 *   · cache layers 1–3 + invalidation (§3.7)
 *   · rate limiting, in-flight dedup, cost accounting (§3.8 / Instruction 9)
 *   · normalization → canonical entity resolution → conflict resolution
 *   · health monitoring + structured audit logging
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SportsDataLayer = exports.DEFAULT_CACHE_POLICY = exports.CollectingLogger = void 0;
const cache_1 = require("./cache");
const conflict_1 = require("./conflict");
const entity_resolver_1 = require("./entity-resolver");
const health_1 = require("./health");
const normalize_1 = require("./normalize");
const rate_limit_1 = require("./rate-limit");
const priority_1 = require("./priority");
const store_1 = require("./store");
class CollectingLogger {
    max;
    entries = [];
    constructor(max = 1000) {
        this.max = max;
    }
    log(entry) {
        this.entries.unshift(entry);
        if (this.entries.length > this.max)
            this.entries.length = this.max;
    }
    drain() {
        const out = this.entries;
        this.entries = [];
        return out;
    }
    peek() {
        return [...this.entries];
    }
}
exports.CollectingLogger = CollectingLogger;
exports.DEFAULT_CACHE_POLICY = {
    live_matches: { raw: 5, canonical: 10, staleGrace: 120 },
    match_events: { raw: 5, canonical: 10, staleGrace: 120 },
    match_stats: { raw: 10, canonical: 20, staleGrace: 180 },
    match_lineups: { raw: 60, canonical: 120, staleGrace: 600 },
    match_detail: { raw: 10, canonical: 20, staleGrace: 300 },
    fixtures: { raw: 120, canonical: 300, staleGrace: 3600 },
    fixture_list: { raw: 120, canonical: 300, staleGrace: 3600 },
    results: { raw: 600, canonical: 1800, staleGrace: 86400 },
    standings: { raw: 300, canonical: 600, staleGrace: 7200 },
    top_scorers: { raw: 600, canonical: 1800, staleGrace: 86400 },
    team: { raw: 3600, canonical: 21600, staleGrace: 259200 },
    team_squad: { raw: 1800, canonical: 7200, staleGrace: 259200 },
    team_stats: { raw: 3600, canonical: 21600, staleGrace: 86400 },
    player: { raw: 3600, canonical: 21600, staleGrace: 259200 },
    player_stats: { raw: 1800, canonical: 7200, staleGrace: 86400 },
    competition: { raw: 3600, canonical: 21600, staleGrace: 259200 },
    competition_seasons: { raw: 3600, canonical: 43200, staleGrace: 259200 },
    venue: { raw: 7200, canonical: 86400, staleGrace: 604800 },
    images: { raw: 7200, canonical: 86400, staleGrace: 604800 },
    health: { raw: 30, canonical: 30, staleGrace: 300 },
};
class SportsDataLayer {
    cache;
    priority;
    health;
    conflicts;
    resolver;
    rateLimiter;
    canonical;
    logger;
    coalescer = new rate_limit_1.RequestCoalescer();
    providers = new Map();
    cost = new Map();
    policy;
    now;
    /** set by the scheduler; forces conservative polling intervals */
    throttledProviders = new Set();
    /** appended to every chain as the last link so a chain is never empty */
    offlineFallback = null;
    kv;
    constructor(opts = {}) {
        this.health = new health_1.HealthMonitor();
        this.logger = opts.logger ?? new CollectingLogger();
        this.now = opts.now ?? (() => Date.now());
        this.kv = opts.store ?? new cache_1.MemoryStore();
        this.cache = new cache_1.SdlCache(this.kv);
        this.canonical = opts.canonical ?? new store_1.MemoryCanonicalStore();
        this.priority = opts.priority ?? new priority_1.PriorityConfig(priority_1.DEFAULT_PRIORITY_RULES);
        this.conflicts = new conflict_1.ConflictDetector(opts.conflictRules ?? conflict_1.DEFAULT_CONFLICT_RULES);
        this.resolver = new entity_resolver_1.EntityResolver(this.canonical, {});
        this.policy = { ...exports.DEFAULT_CACHE_POLICY, ...(opts.cachePolicy ?? {}) };
        const rateLimits = new Map();
        const defaults = {
            // documented published limits; unknown → conservative 1 rps burst cap
            sportradar: { perSecond: 2, perMinute: 60, perHour: 3000, perDay: 50000, perMonth: null, concurrency: 2, throttleAt: 0.85 },
            sportmonks: { perSecond: null, perMinute: 3000, perHour: null, perDay: null, perMonth: 500000, concurrency: 4, throttleAt: 0.85 },
            api_football: { perSecond: 1, perMinute: 10, perHour: 50, perDay: 100, perMonth: 3000, concurrency: 1, throttleAt: 0.85 },
            thesportsdb: { perSecond: 1, perMinute: 30, perHour: 500, perDay: 5000, perMonth: null, concurrency: 1, throttleAt: 0.85 },
            demo: { perSecond: 100, perMinute: null, perHour: null, perDay: null, perMonth: null, concurrency: null, throttleAt: 0.85 },
        };
        for (const [name, cfg] of Object.entries(defaults)) {
            rateLimits.set(name, { provider: name, ...cfg, ...(opts.rateLimits?.[name] ?? {}) });
        }
        this.rateLimiter = new rate_limit_1.RateLimiter(this.kv, rateLimits);
    }
    /* ── registration ───────────────────────────────────────── */
    register(provider) {
        this.providers.set(provider.name, provider);
        this.cost.set(provider.name, { provider: provider.name, calls: 0, cacheHits: 0, coalesced: 0, avoided: 0 });
        this.logger.log({ at: (0, normalize_1.nowIso)(), level: "info", area: "provider", message: `registered ${provider.name}`, provider: provider.name, meta: { capabilities: provider.capabilities } });
        return this;
    }
    provider(name) {
        return this.providers.get(name);
    }
    registeredProviders() {
        return [...this.providers.values()].map((p) => ({
            name: p.name,
            capabilities: p.capabilities,
            available: this.health.available(p.name),
            health: this.health.record(p.name).status,
        }));
    }
    /** Called by the scheduler when a provider crosses the throttle threshold. */
    setThrottled(provider, throttled) {
        if (throttled)
            this.throttledProviders.add(provider);
        else
            this.throttledProviders.delete(provider);
        this.logger.log({ at: (0, normalize_1.nowIso)(), level: throttled ? "warn" : "info", area: "cost", message: `${provider} throttle ${throttled ? "on" : "off"}`, provider });
    }
    isThrottled(provider) {
        return this.throttledProviders.has(provider);
    }
    /* ── chain resolution ───────────────────────────────────── */
    /**
     * Registers a provider that is appended to every chain as the final link.
     * `createSdl()` uses this for the offline demo adapter, which keeps the
     * platform functional with zero provider keys. It never masks a configured
     * provider: it is only reached once the whole real chain has failed.
     */
    setOfflineFallback(provider) {
        this.offlineFallback = provider;
    }
    chainFor(sport, competition, dataType) {
        const chain = this.priority.resolve(sport, competition, dataType);
        const usable = chain.filter((link) => {
            const p = this.providers.get(link.provider);
            if (!p)
                return false;
            if (!p.capabilities.includes(dataType))
                return false;
            if (!this.health.available(link.provider))
                return false;
            return link.role !== "disabled";
        });
        const fallback = this.offlineFallback;
        if (fallback && !usable.some((l) => l.provider === fallback)) {
            const p = this.providers.get(fallback);
            if (p && p.capabilities.includes(dataType) && this.health.available(fallback)) {
                usable.push({ provider: fallback, role: "fallback" });
            }
        }
        return usable;
    }
    /* ── core execution ─────────────────────────────────────── */
    /**
     * Run one data type through its priority chain with cache, failover,
     * rate limiting and graceful degradation to stale data.
     */
    async fetch(input) {
        const policy = this.policy[input.dataType];
        const canonicalKey = input.canonicalKey ?? `sdl:canonical:${input.dataType}:${(0, normalize_1.requestKey)("canon", input.endpoint, input.params)}`;
        const attempts = [];
        const raised = [];
        // Layer 2: canonical cache (shared across providers)
        const cached = await this.cache.getCanonical(canonicalKey);
        if (cached) {
            const cost = this.cost.get(cached.provider);
            if (cost)
                cost.cacheHits++;
            this.logger.log({ at: (0, normalize_1.nowIso)(), level: "debug", area: "cache", message: `canonical cache hit ${input.dataType}`, provider: cached.provider, dataType: input.dataType });
            return {
                ok: true,
                value: {
                    data: cached.data,
                    provider: cached.provider,
                    role: cached.role,
                    fromCache: true,
                    stale: false,
                    fetchedAt: cached.at,
                    attempts: [],
                    degraded: false,
                    conflicts: [],
                },
            };
        }
        const chain = this.chainFor(input.sport, input.competition ?? null, input.dataType);
        if (!chain.length) {
            this.logger.log({ at: (0, normalize_1.nowIso)(), level: "error", area: "provider", message: `no available provider for ${input.dataType}`, dataType: input.dataType });
            return { ok: false, error: { kind: "no_provider_configured", message: `No available provider for ${input.dataType}`, dataType: input.dataType, attempts } };
        }
        for (const link of chain) {
            const provider = this.providers.get(link.provider);
            const key = (0, normalize_1.requestKey)(link.provider, input.endpoint, input.params);
            // Layer 1: raw provider response cache — avoids a paid duplicate call
            const raw = await this.cache.getRaw(key);
            if (raw) {
                const cost = this.cost.get(link.provider);
                if (cost)
                    cost.cacheHits++;
                const data = input.apply ? await input.apply(raw.data, link.provider) : raw.data;
                await this.cache.setCanonical(canonicalKey, { data, provider: link.provider, role: link.role, at: raw.at }, policy.canonical);
                return {
                    ok: true,
                    value: { data, provider: link.provider, role: link.role, fromCache: true, stale: false, fetchedAt: raw.at, attempts, degraded: false, conflicts: raised },
                };
            }
            const verdict = await this.rateLimiter.check(link.provider);
            if (!verdict.allowed) {
                attempts.push({ provider: link.provider, ok: false, error: `rate limit: ${verdict.reason}`, ms: 0 });
                const cost = this.cost.get(link.provider);
                if (cost)
                    cost.avoided++;
                this.logger.log({ at: (0, normalize_1.nowIso)(), level: "warn", area: "cost", message: `skipped ${link.provider} — ${verdict.reason}, retry in ${verdict.retryAfterSeconds}s`, provider: link.provider, dataType: input.dataType });
                continue;
            }
            const started = this.now();
            const result = await this.coalescer.run(key, () => this.execute(provider, input, key));
            const ms = this.now() - started;
            const cost = this.cost.get(link.provider);
            if (!result.ok) {
                attempts.push({ provider: link.provider, ok: false, error: result.error.message, ms });
                if (result.error.code === "not_supported") {
                    // capability drift: log and continue the chain rather than failing
                    this.logger.log({ at: (0, normalize_1.nowIso)(), level: "warn", area: "provider", message: result.error.message, provider: link.provider, dataType: input.dataType });
                    continue;
                }
                this.health.noteFailure(link.provider, result.error.message, result.error.code === "rate_limited");
                if (result.error.code === "rate_limited") {
                    this.setThrottled(link.provider, true);
                    if (cost)
                        cost.avoided++;
                }
                continue;
            }
            if (cost)
                cost.calls++;
            await this.rateLimiter.record(link.provider);
            this.health.noteSuccess(link.provider, ms);
            attempts.push({ provider: link.provider, ok: true, ms });
            await this.cache.setRaw(key, { data: result.data, at: result.fetchedAt }, policy.raw);
            // keep the last good value beyond its TTL so a provider outage degrades
            // instead of failing (§14.1). Written on every successful fetch.
            await this.cache.setCanonical(`${canonicalKey}:stale`, { data: result.data, provider: link.provider, at: result.fetchedAt }, policy.staleGrace);
            const data = input.apply ? await input.apply(result.data, link.provider) : result.data;
            await this.cache.setCanonical(canonicalKey, { data, provider: link.provider, role: link.role, at: result.fetchedAt }, policy.canonical);
            this.logger.log({ at: (0, normalize_1.nowIso)(), level: "info", area: "provider", message: `${input.dataType} from ${link.provider} (${link.role}) in ${ms}ms`, provider: link.provider, dataType: input.dataType, meta: { key } });
            return { ok: true, value: { data, provider: link.provider, role: link.role, fromCache: false, stale: false, fetchedAt: result.fetchedAt, attempts, degraded: false, conflicts: raised } };
        }
        // Every provider failed → degrade to the last known good value (§14.1)
        const staleKey = `${canonicalKey}:stale`;
        const stale = await this.cache.getCanonical(staleKey);
        if (stale && (Date.now() - +new Date(stale.at)) / 1000 <= policy.staleGrace) {
            this.logger.log({ at: (0, normalize_1.nowIso)(), level: "warn", area: "provider", message: `serving stale ${input.dataType} (${Math.round((Date.now() - +new Date(stale.at)) / 1000)}s old)`, dataType: input.dataType });
            return {
                ok: true,
                value: { data: stale.data, provider: stale.provider, role: "fallback", fromCache: true, stale: true, fetchedAt: stale.at, attempts, degraded: true, conflicts: raised },
            };
        }
        return {
            ok: false,
            error: { kind: "all_providers_failed", message: `All providers failed for ${input.dataType}`, dataType: input.dataType, attempts },
        };
    }
    async execute(provider, input, key) {
        this.rateLimiter.begin(provider.name);
        try {
            const res = await input.call(provider);
            // normalise the request key so cache + logs correlate regardless of adapter
            if (res.ok)
                return { ...res, requestKey: key };
            return { ...res, requestKey: key };
        }
        catch (err) {
            return {
                ok: false,
                provider: provider.name,
                requestKey: key,
                fromCache: false,
                error: { code: "unknown", message: err instanceof Error ? err.message : String(err) },
            };
        }
        finally {
            this.rateLimiter.end(provider.name);
        }
    }
    /* ── conflict helper exposed to normalization steps ─────── */
    compare(input) {
        const res = this.conflicts.evaluate({
            entityType: input.entityType,
            entityId: input.entityId,
            field: input.field,
            stored: input.stored,
            incoming: input.incoming,
            storedProvider: input.storedProvider,
            incomingProvider: input.incomingProvider,
            primaryProvider: input.primaryProvider,
            storedAt: input.storedAt,
            incomingAt: (0, normalize_1.nowIso)(),
            valuesAreEqual: input.equal ?? ((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        });
        if (res.conflict && !res.conflict.resolved) {
            this.health.noteConflict(input.incomingProvider, `${input.field} on ${input.entityType}:${input.entityId}`);
            this.logger.log({ at: (0, normalize_1.nowIso)(), level: res.conflict.severity === "critical" ? "error" : "warn", area: "conflict", message: `${res.conflict.severity} ${input.field} conflict on ${input.entityId}`, provider: input.incomingProvider });
        }
        return { accept: res.accept, conflict: res.conflict };
    }
    /* ── observability ──────────────────────────────────────── */
    costReport() {
        return [...this.cost.values()];
    }
    cacheStats() {
        return this.cache.stats();
    }
    /**
     * Invalidation always spans both layers: dropping the canonical entry while
     * leaving the raw provider response cached would make the next request look
     * like a fresh fetch and silently re-serve the value we just invalidated.
     */
    async invalidate(prefix) {
        this.logger.log({ at: (0, normalize_1.nowIso)(), level: "info", area: "cache", message: `invalidate ${prefix}` });
        let removed = await this.cache.invalidate(prefix);
        if (prefix.startsWith("sdl:canonical:")) {
            // raw keys are namespaced by provider (sdl:provider:{name}:{endpoint}:{hash}),
            // so the same targeted invalidation has to sweep that layer separately
            removed += await this.cache.invalidate("sdl:provider:");
        }
        return removed;
    }
    /** Targeted invalidation used after a goal / status change (§3.7). */
    invalidateMatch(matchId) {
        return this.invalidate(`sdl:canonical:match:${matchId}`);
    }
    diagnostics() {
        return {
            providers: this.registeredProviders(),
            health: this.health.snapshot(),
            cost: this.costReport(),
            cache: this.cacheStats(),
            conflicts: this.conflicts.summary(),
            inFlight: this.coalescer.size,
            throttled: [...this.throttledProviders],
        };
    }
}
exports.SportsDataLayer = SportsDataLayer;
