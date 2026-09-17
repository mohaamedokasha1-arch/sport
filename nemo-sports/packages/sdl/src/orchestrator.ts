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

import { MemoryStore, SdlCache, type KvStore } from "./cache";
import { ConflictDetector, DEFAULT_CONFLICT_RULES, type Conflict, type ConflictField, type ConflictRules } from "./conflict";
import { EntityResolver } from "./entity-resolver";
import { HealthMonitor } from "./health";
import { nowIso, requestKey } from "./normalize";
import { RequestCoalescer, RateLimiter, type RateLimitConfig } from "./rate-limit";
import { PriorityConfig, DEFAULT_PRIORITY_RULES, type PriorityRole } from "./priority";
import { MemoryCanonicalStore, type CanonicalStore } from "./store";
import type { DataType, ProviderResult, SportsDataProvider } from "./provider";
import type { ProviderName, UUID } from "./types";

export type SdlLogEntry = {
  at: string;
  level: "debug" | "info" | "warn" | "error";
  area: "provider" | "cache" | "conflict" | "mapping" | "cost" | "health";
  message: string;
  provider?: ProviderName;
  dataType?: DataType;
  meta?: Record<string, unknown>;
};

export type CostLedger = {
  provider: ProviderName;
  calls: number;
  cacheHits: number;
  coalesced: number;
  /** calls we deliberately avoided — the justification trail (Instruction 9) */
  avoided: number;
};

export type FetchReport<T> = {
  data: T;
  provider: ProviderName;
  role: Exclude<PriorityRole, "disabled">;
  fromCache: boolean;
  stale: boolean;
  fetchedAt: string;
  attempts: { provider: ProviderName; ok: boolean; error?: string; ms: number }[];
  /** populated when we served stale data because every provider failed (§14.1) */
  degraded: boolean;
  conflicts: Conflict[];
};

export type SdlFailure = {
  kind: "no_provider_configured" | "all_providers_failed" | "unsupported" | "not_found";
  message: string;
  dataType: DataType;
  attempts: { provider: ProviderName; ok: boolean; error?: string; ms: number }[];
};

export type SdlResult<T> = { ok: true; value: FetchReport<T> } | { ok: false; error: SdlFailure };

export interface SdlLogger {
  log(entry: SdlLogEntry): void;
  drain(): SdlLogEntry[];
}

export class CollectingLogger implements SdlLogger {
  private entries: SdlLogEntry[] = [];
  constructor(private max = 1000) {}
  log(entry: SdlLogEntry): void {
    this.entries.unshift(entry);
    if (this.entries.length > this.max) this.entries.length = this.max;
  }
  drain(): SdlLogEntry[] {
    const out = this.entries;
    this.entries = [];
    return out;
  }
  peek(): SdlLogEntry[] {
    return [...this.entries];
  }
}

/** Cache lifetimes per data type (seconds) — layer 1 raw, layer 2 canonical, stale grace. */
export type CachePolicy = { dataType: DataType; raw: number; canonical: number; staleGrace: number };

export const DEFAULT_CACHE_POLICY: Record<DataType, { raw: number; canonical: number; staleGrace: number }> = {
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

export type SdlOptions = {
  store?: KvStore;
  canonical?: CanonicalStore;
  priority?: PriorityConfig;
  rateLimits?: Partial<Record<ProviderName, Omit<RateLimitConfig, "provider">>>;
  conflictRules?: ConflictRules;
  cachePolicy?: Partial<Record<DataType, { raw: number; canonical: number; staleGrace: number }>>;
  logger?: SdlLogger;
  now?: () => number;
};

export class SportsDataLayer {
  readonly cache: SdlCache;
  readonly priority: PriorityConfig;
  readonly health: HealthMonitor;
  readonly conflicts: ConflictDetector;
  readonly resolver: EntityResolver;
  readonly rateLimiter: RateLimiter;
  readonly canonical: CanonicalStore;
  readonly logger: SdlLogger;
  readonly coalescer = new RequestCoalescer();

  private providers = new Map<ProviderName, SportsDataProvider>();
  private cost = new Map<ProviderName, CostLedger>();
  private policy: Record<DataType, { raw: number; canonical: number; staleGrace: number }>;
  private now: () => number;
  /** set by the scheduler; forces conservative polling intervals */
  private throttledProviders = new Set<ProviderName>();
  /** appended to every chain as the last link so a chain is never empty */
  private offlineFallback: ProviderName | null = null;

  private kv: KvStore;

  constructor(opts: SdlOptions = {}) {
    this.health = new HealthMonitor();
    this.logger = opts.logger ?? new CollectingLogger();
    this.now = opts.now ?? (() => Date.now());
    this.kv = opts.store ?? new MemoryStore();
    this.cache = new SdlCache(this.kv);
    this.canonical = opts.canonical ?? new MemoryCanonicalStore();
    this.priority = opts.priority ?? new PriorityConfig(DEFAULT_PRIORITY_RULES);
    this.conflicts = new ConflictDetector(opts.conflictRules ?? DEFAULT_CONFLICT_RULES);
    this.resolver = new EntityResolver(this.canonical, {});
    this.policy = { ...DEFAULT_CACHE_POLICY, ...(opts.cachePolicy ?? {}) };

    const rateLimits = new Map<ProviderName, RateLimitConfig>();
    const defaults: Record<ProviderName, Omit<RateLimitConfig, "provider">> = {
      // documented published limits; unknown → conservative 1 rps burst cap
      sportradar: { perSecond: 2, perMinute: 60, perHour: 3000, perDay: 50000, perMonth: null, concurrency: 2, throttleAt: 0.85 },
      sportmonks: { perSecond: null, perMinute: 3000, perHour: null, perDay: null, perMonth: 500000, concurrency: 4, throttleAt: 0.85 },
      api_football: { perSecond: 1, perMinute: 10, perHour: 50, perDay: 100, perMonth: 3000, concurrency: 1, throttleAt: 0.85 },
      thesportsdb: { perSecond: 1, perMinute: 30, perHour: 500, perDay: 5000, perMonth: null, concurrency: 1, throttleAt: 0.85 },
      // documented: 10 calls/minute on the free plan, 8 as the internal budget;
      // the composition root raises it for paid plans via
      // FOOTBALL_DATA_REQUESTS_PER_MINUTE (the callers share one budget).
      football_data: { perSecond: 2, perMinute: 8, perHour: null, perDay: null, perMonth: null, concurrency: 2, throttleAt: 0.85 },
      // documented: ~10,000 requests / 24 h / IP, burst friendly, 60 s edge cache
      sportscore: { perSecond: 6, perMinute: 120, perHour: 2400, perDay: 9000, perMonth: null, concurrency: 4, throttleAt: 0.85 },
      demo: { perSecond: 100, perMinute: null, perHour: null, perDay: null, perMonth: null, concurrency: null, throttleAt: 0.85 },
    };
    for (const [name, cfg] of Object.entries(defaults)) {
      rateLimits.set(name as ProviderName, { provider: name as ProviderName, ...cfg, ...(opts.rateLimits?.[name as ProviderName] ?? {}) });
    }
    this.rateLimiter = new RateLimiter(this.kv, rateLimits);
  }

  /* ── registration ───────────────────────────────────────── */

  register(provider: SportsDataProvider): this {
    this.providers.set(provider.name, provider);
    this.cost.set(provider.name, { provider: provider.name, calls: 0, cacheHits: 0, coalesced: 0, avoided: 0 });
    this.logger.log({ at: nowIso(), level: "info", area: "provider", message: `registered ${provider.name}`, provider: provider.name, meta: { capabilities: provider.capabilities } });
    return this;
  }

  provider(name: ProviderName): SportsDataProvider | undefined {
    return this.providers.get(name);
  }

  registeredProviders(): { name: ProviderName; capabilities: DataType[]; available: boolean; health: string }[] {
    return [...this.providers.values()].map((p) => ({
      name: p.name,
      capabilities: p.capabilities,
      available: this.health.available(p.name),
      health: this.health.record(p.name).status,
    }));
  }

  /** Called by the scheduler when a provider crosses the throttle threshold. */
  setThrottled(provider: ProviderName, throttled: boolean): void {
    if (throttled) this.throttledProviders.add(provider);
    else this.throttledProviders.delete(provider);
    this.logger.log({ at: nowIso(), level: throttled ? "warn" : "info", area: "cost", message: `${provider} throttle ${throttled ? "on" : "off"}`, provider });
  }

  isThrottled(provider: ProviderName): boolean {
    return this.throttledProviders.has(provider);
  }

  /**
   * Effective cache lifetimes (seconds) for one data type. Exposed so the API
   * can publish the TTL it is honouring (`meta.cache.ttlSeconds`) instead of
   * leaving clients to guess how fresh the payload can be.
   */
  cachePolicy(dataType: DataType): { raw: number; canonical: number; staleGrace: number } {
    return this.policy[dataType];
  }

  /* ── chain resolution ───────────────────────────────────── */

  /**
   * Registers a provider that is appended to every chain as the final link.
   * `createSdl()` uses this for the offline demo adapter, which keeps the
   * platform functional with zero provider keys. It never masks a configured
   * provider: it is only reached once the whole real chain has failed.
   */
  setOfflineFallback(provider: ProviderName): void {
    this.offlineFallback = provider;
  }

  chainFor(sport: string, competition: string | null, dataType: DataType): { provider: ProviderName; role: Exclude<PriorityRole, "disabled"> }[] {
    const chain = this.priority.resolve(sport, competition, dataType);
    const usable = chain.filter((link): link is { provider: ProviderName; role: Exclude<PriorityRole, "disabled"> } => {
      const p = this.providers.get(link.provider);
      if (!p) return false;
      if (!p.capabilities.includes(dataType)) return false;
      if (!this.health.available(link.provider)) return false;
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
  async fetch<T>(input: {
    sport: string;
    competition?: string | null;
    dataType: DataType;
    /** endpoint name used for cache + cost keys */
    endpoint: string;
    params: Record<string, unknown>;
    call: (provider: SportsDataProvider) => Promise<ProviderResult<T>>;
    /** optional canonical-cache key when it differs from the request key */
    canonicalKey?: string;
    /** merge provider output into canonical entities before returning */
    apply?: (data: T, provider: ProviderName) => Promise<T>;
  }): Promise<SdlResult<T>> {
    const policy = this.policy[input.dataType];
    const canonicalKey = input.canonicalKey ?? `sdl:canonical:${input.dataType}:${requestKey("canon", input.endpoint, input.params)}`;
    const attempts: { provider: ProviderName; ok: boolean; error?: string; ms: number }[] = [];
    const raised: Conflict[] = [];

    // Layer 2: canonical cache (shared across providers)
    const cached = await this.cache.getCanonical<{ data: T; provider: ProviderName; role: Exclude<PriorityRole, "disabled">; at: string }>(canonicalKey);
    if (cached) {
      const cost = this.cost.get(cached.provider);
      if (cost) cost.cacheHits++;
      this.logger.log({ at: nowIso(), level: "debug", area: "cache", message: `canonical cache hit ${input.dataType}`, provider: cached.provider, dataType: input.dataType });
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
      this.logger.log({ at: nowIso(), level: "error", area: "provider", message: `no available provider for ${input.dataType}`, dataType: input.dataType });
      return { ok: false, error: { kind: "no_provider_configured", message: `No available provider for ${input.dataType}`, dataType: input.dataType, attempts } };
    }

    for (const link of chain) {
      const provider = this.providers.get(link.provider)!;
      const key = requestKey(link.provider, input.endpoint, input.params);

      // Layer 1: raw provider response cache — avoids a paid duplicate call
      const raw = await this.cache.getRaw<{ data: T; at: string }>(key);
      if (raw) {
        const cost = this.cost.get(link.provider);
        if (cost) cost.cacheHits++;
        const data = input.apply ? await input.apply(raw.data, link.provider) : raw.data;
        await this.cache.setCanonical(canonicalKey, { data, provider: link.provider, role: link.role, at: raw.at }, policy.canonical);
        return {
          ok: true,
          value: { data, provider: link.provider, role: link.role, fromCache: true, stale: false, fetchedAt: raw.at, attempts, degraded: false, conflicts: raised },
        };
      }

      if (!(await this.rateLimiter.waitSlot(link.provider))) {
        const verdict = await this.rateLimiter.check(link.provider);
        if (!verdict.allowed) {
          // No slot opened in time (quota genuinely spent or the wait timed
          // out): skip this provider and continue the chain / fail over.
          attempts.push({ provider: link.provider, ok: false, error: `rate limit: ${verdict.reason}`, ms: 0 });
          const cost = this.cost.get(link.provider);
          if (cost) cost.avoided++;
          this.logger.log({ at: nowIso(), level: "warn", area: "cost", message: `skipped ${link.provider} — ${verdict.reason}, retry in ${verdict.retryAfterSeconds}s`, provider: link.provider, dataType: input.dataType });
          continue;
        }
        // else: a slot opened between the failed wait and the re-check — proceed.
      }

      const started = this.now();
      const result = await this.coalescer.run(key, () => this.execute(provider, input, key));
      const ms = this.now() - started;
      const cost = this.cost.get(link.provider);

      if (!result.ok) {
        attempts.push({ provider: link.provider, ok: false, error: result.error.message, ms });
        if (result.error.code === "not_supported") {
          // capability drift: log and continue the chain rather than failing
          this.logger.log({ at: nowIso(), level: "warn", area: "provider", message: result.error.message, provider: link.provider, dataType: input.dataType });
          continue;
        }
        // A typed not_found is a VALID provider answer (that entity does not
        // exist) — it must not count toward the circuit breaker, otherwise a
        // single competition with "No current season" would take the whole
        // provider out of rotation.
        if (result.error.code !== "not_found") {
          this.health.noteFailure(link.provider, result.error.message, result.error.code === "rate_limited");
        }
        if (result.error.code === "rate_limited") {
          this.setThrottled(link.provider, true);
          if (cost) cost.avoided++;
        }
        continue;
      }

      if (cost) cost.calls++;
      await this.rateLimiter.record(link.provider);
      this.health.noteSuccess(link.provider, ms);
      attempts.push({ provider: link.provider, ok: true, ms });

      await this.cache.setRaw(key, { data: result.data, at: result.fetchedAt }, policy.raw);
      // keep the last good value beyond its TTL so a provider outage degrades
      // instead of failing (§14.1). Written on every successful fetch.
      await this.cache.setCanonical(`${canonicalKey}:stale`, { data: result.data, provider: link.provider, at: result.fetchedAt }, policy.staleGrace);
      const data = input.apply ? await input.apply(result.data, link.provider) : result.data;
      await this.cache.setCanonical(canonicalKey, { data, provider: link.provider, role: link.role, at: result.fetchedAt }, policy.canonical);

      this.logger.log({ at: nowIso(), level: "info", area: "provider", message: `${input.dataType} from ${link.provider} (${link.role}) in ${ms}ms`, provider: link.provider, dataType: input.dataType, meta: { key } });
      return { ok: true, value: { data, provider: link.provider, role: link.role, fromCache: false, stale: false, fetchedAt: result.fetchedAt, attempts, degraded: false, conflicts: raised } };
    }

    // Every provider failed → degrade to the last known good value (§14.1)
    const staleKey = `${canonicalKey}:stale`;
    const stale = await this.cache.getCanonical<{ data: T; provider: ProviderName; at: string }>(staleKey);
    if (stale && (Date.now() - +new Date(stale.at)) / 1000 <= policy.staleGrace) {
      this.logger.log({ at: nowIso(), level: "warn", area: "provider", message: `serving stale ${input.dataType} (${Math.round((Date.now() - +new Date(stale.at)) / 1000)}s old)`, dataType: input.dataType });
      return {
        ok: true,
        value: { data: stale.data, provider: stale.provider, role: "fallback", fromCache: true, stale: true, fetchedAt: stale.at, attempts, degraded: true, conflicts: raised },
      };
    }

    // Preserve the typed not_found when every attempt agreed the entity does
    // not exist — callers rely on it for honest 404s (an outage must never
    // masquerade as a missing entity, nor a missing entity as an outage).
    const allNotFound = attempts.length > 0 && attempts.every((a) => a.ok === false && (a.error ?? "").includes("not found"));
    if (allNotFound) {
      return { ok: false, error: { kind: "not_found", message: attempts[0]?.error ?? "not found", dataType: input.dataType, attempts } };
    }

    return {
      ok: false,
      error: { kind: "all_providers_failed", message: `All providers failed for ${input.dataType}`, dataType: input.dataType, attempts },
    };
  }

  private async execute<T>(provider: SportsDataProvider, input: { endpoint: string; params: Record<string, unknown>; call: (p: SportsDataProvider) => Promise<ProviderResult<T>> }, key: string): Promise<ProviderResult<T>> {
    this.rateLimiter.begin(provider.name);
    try {
      const res = await input.call(provider);
      // normalise the request key so cache + logs correlate regardless of adapter
      if (res.ok) return { ...res, requestKey: key };
      return { ...res, requestKey: key };
    } catch (err) {
      return {
        ok: false,
        provider: provider.name,
        requestKey: key,
        fromCache: false,
        error: { code: "unknown", message: err instanceof Error ? err.message : String(err) },
      };
    } finally {
      this.rateLimiter.end(provider.name);
    }
  }

  /* ── conflict helper exposed to normalization steps ─────── */

  compare<T>(input: {
    entityType: Conflict["entityType"];
    entityId: string;
    field: ConflictField;
    stored: T | null;
    incoming: T;
    storedProvider: ProviderName;
    incomingProvider: ProviderName;
    primaryProvider: ProviderName | null;
    storedAt: string;
    equal?: (a: T, b: T) => boolean;
  }): { accept: boolean; conflict: Conflict | null } {
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
      incomingAt: nowIso(),
      valuesAreEqual: (input.equal as ((a: unknown, b: unknown) => boolean) | undefined) ?? ((a, b) => JSON.stringify(a) === JSON.stringify(b)),
    });
    if (res.conflict && !res.conflict.resolved) {
      this.health.noteConflict(input.incomingProvider, `${input.field} on ${input.entityType}:${input.entityId}`);
      this.logger.log({ at: nowIso(), level: res.conflict.severity === "critical" ? "error" : "warn", area: "conflict", message: `${res.conflict.severity} ${input.field} conflict on ${input.entityId}`, provider: input.incomingProvider });
    }
    return { accept: res.accept, conflict: res.conflict };
  }

  /* ── observability ──────────────────────────────────────── */

  costReport(): CostLedger[] {
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
  async invalidate(prefix: string): Promise<number> {
    this.logger.log({ at: nowIso(), level: "info", area: "cache", message: `invalidate ${prefix}` });
    let removed = await this.cache.invalidate(prefix);
    if (prefix.startsWith("sdl:canonical:")) {
      // raw keys are namespaced by provider (sdl:provider:{name}:{endpoint}:{hash}),
      // so the same targeted invalidation has to sweep that layer separately
      removed += await this.cache.invalidate("sdl:provider:");
    }
    return removed;
  }

  /** Targeted invalidation used after a goal / status change (§3.7). */
  invalidateMatch(matchId: UUID): Promise<number> {
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
