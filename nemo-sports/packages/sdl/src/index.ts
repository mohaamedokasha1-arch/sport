/**
 * NEMO Sports · Sports Data Layer — public surface
 * ────────────────────────────────────────────────
 * This is the ONLY module the API server, background jobs or admin dashboard
 * may import. Adapters and transport helpers stay internal.
 */

export * from "./types";
export type {
  DataType,
  ProviderError,
  ProviderResult,
  SportsDataProvider,
  NormalizedFixture,
  NormalizedEvent,
  NormalizedStat,
  NormalizedLineup,
  NormalizedLineupPlayer,
  NormalizedTeam,
  NormalizedSquadMember,
  NormalizedPlayer,
  NormalizedPlayerStats,
  NormalizedCompetition,
  NormalizedSeason,
  NormalizedStandingRow,
  NormalizedTopScorer,
  NormalizedVenue,
  ProviderHealth,
} from "./provider";
export { notSupported } from "./provider";

export { SdlCache, MemoryStore, type KvStore, type CacheStats } from "./cache";
export { RateLimiter, RequestCoalescer, type RateLimitConfig, type RateLimitVerdict, type WindowUsage } from "./rate-limit";
export { HealthMonitor, type HealthStatus, type ProviderHealthRecord, type HealthEvent } from "./health";
export { ConflictDetector, DEFAULT_CONFLICT_RULES, type Conflict, type ConflictField, type ConflictRules, type Severity, type ResolutionStrategy } from "./conflict";
export { PriorityConfig, DEFAULT_PRIORITY_RULES, type PriorityRule, type PriorityRole, type ResolvedChain } from "./priority";
export { EntityResolver, type Resolution } from "./entity-resolver";
export { MemoryCanonicalStore, canonicalId, devKv, type CanonicalStore, type Repo } from "./store";
export { CanonicalMapper, slugify, type MapperDeps, type UpsertReport } from "./mapper";
export { profileFor, POLLING_TABLE, type PollingProfile } from "./polling";
export { similarity, normalizeName, compactKey, fingerprint, requestKey, rankCandidates, dayKey, withinMinutes, seededId, nowIso } from "./normalize";
export {
  SportsDataLayer,
  CollectingLogger,
  DEFAULT_CACHE_POLICY,
  type SdlOptions,
  type SdlResult,
  type SdlFailure,
  type FetchReport,
  type SdlLogEntry,
  type SdlLogger,
  type CostLedger,
} from "./orchestrator";

/* ── adapters: exported so the composition root can register them, and so
   tests can drive them with a fake transport. Nothing else should import these. */
export { BaseAdapter, parseMinute } from "./adapters/base";
export { ApiFootballAdapter, AF_STATUS, type ApiFootballConfig } from "./adapters/api-football";
export { SportmonksAdapter, SM_STATUS, EVENT_TYPE_ID, type SportmonksConfig } from "./adapters/sportmonks";
export { SportradarAdapter, SR_STATUS, type SportradarConfig } from "./adapters/sportradar";
export { TheSportsDbAdapter, type TheSportsDbConfig } from "./adapters/thesportsdb";
export { SportScoreAdapter, mapStatus as mapSportScoreStatus, matchSlugFromUrl as sportScoreMatchSlugFromUrl, type SportScoreConfig } from "./adapters/sportscore";
export { DemoAdapter, DEMO_FIXTURES, DEMO_TEAMS, DEMO_EVENTS, DEMO_STANDINGS, DEMO_SCORERS, DEMO_COMPETITIONS, type DemoConfig } from "./adapters/demo";

import { SportsDataLayer, type SdlOptions } from "./orchestrator";
import { ApiFootballAdapter } from "./adapters/api-football";
import { SportmonksAdapter } from "./adapters/sportmonks";
import { SportradarAdapter } from "./adapters/sportradar";
import { TheSportsDbAdapter } from "./adapters/thesportsdb";
import { SportScoreAdapter } from "./adapters/sportscore";
import { DemoAdapter } from "./adapters/demo";

export { PgCanonicalStore } from "./pg-store";
export type { SqlClient, Field, FieldMap } from "./pg-store";
export { RedisKvStore } from "./redis-store";
export type { RedisLike, RedisKvOptions } from "./redis-store";

export type SdlEnv = {
  SPORTRADAR_KEY?: string;
  SPORTMONKS_TOKEN?: string;
  API_FOOTBALL_KEY?: string;
  THESPORTSDB_KEY?: string;
  /** disable the keyless SportScore open API (default: enabled) */
  NEMO_SPORTSCORE_ENABLED?: string;
  /** force the offline demo provider even when keys exist (dev/CI) */
  NEMO_SDL_MODE?: "auto" | "demo";
};

/**
 * Composition root. Providers are registered only when credentials exist, so a
 * deployment with zero paid keys still runs — on the keyless SportScore open
 * API — instead of crashing.
 *
 * Demo-data policy (Instruction 10/12): the offline demo adapter is registered
 * ONLY in development/explicit demo mode, and NEVER as a production fallback.
 * When SportScore (or a paid provider) fails in production the failure is
 * surfaced honestly ("البيانات غير متوفرة") — no fabricated matches, scores
 * or minutes are ever shown.
 */
export function createSdl(env: SdlEnv = {}, opts: SdlOptions = {}): { sdl: SportsDataLayer; mode: "live" | "demo"; missing: string[] } {
  // When the keyless SportScore API serves the platform, the cache policy
  // rides on its documented 60 s edge cache: asking sooner gains nothing and
  // the free tier allows only ~10k requests/day/IP. Callers may still widen
  // individual TTLs via opts.cachePolicy.
  const usingSportScore = env.NEMO_SPORTSCORE_ENABLED !== "0" && env.NEMO_SDL_MODE !== "demo";
  const effectiveOpts: SdlOptions = usingSportScore
    ? {
        ...opts,
        cachePolicy: {
          live_matches: { raw: 45, canonical: 50, staleGrace: 120 },
          match_detail: { raw: 45, canonical: 50, staleGrace: 300 },
          match_events: { raw: 45, canonical: 50, staleGrace: 120 },
          fixtures: { raw: 60, canonical: 120, staleGrace: 3600 },
          standings: { raw: 300, canonical: 600, staleGrace: 7200 },
          top_scorers: { raw: 600, canonical: 1800, staleGrace: 86400 },
          player_stats: { raw: 600, canonical: 1800, staleGrace: 86400 },
          ...opts.cachePolicy,
        },
      }
    : opts;
  const sdl = new SportsDataLayer(effectiveOpts);
  const missing: string[] = [];
  let registered = 0;

  if (env.NEMO_SDL_MODE !== "demo") {
    // SportScore is keyless and open — enabled unless explicitly disabled.
    if (env.NEMO_SPORTSCORE_ENABLED !== "0") {
      sdl.register(new SportScoreAdapter());
      registered++;
    } else {
      missing.push("sportscore");
    }
    if (env.SPORTRADAR_KEY) {
      sdl.register(new SportradarAdapter({ apiKey: env.SPORTRADAR_KEY }));
      registered++;
    } else missing.push("sportradar");
    if (env.SPORTMONKS_TOKEN) {
      sdl.register(new SportmonksAdapter({ apiToken: env.SPORTMONKS_TOKEN }));
      registered++;
    } else missing.push("sportmonks");
    if (env.API_FOOTBALL_KEY) {
      sdl.register(new ApiFootballAdapter({ apiKey: env.API_FOOTBALL_KEY }));
      registered++;
    } else missing.push("api_football");
    if (env.THESPORTSDB_KEY) {
      sdl.register(new TheSportsDbAdapter({ apiKey: env.THESPORTSDB_KEY }));
      registered++;
    } else missing.push("thesportsdb");
  } else {
    missing.push("sportscore", "sportradar", "sportmonks", "api_football", "thesportsdb");
  }

  // The offline demo adapter exists so the platform can be developed and
  // demoed with zero connectivity. It is NOT registered in production (a
  // production failure must show an honest error, not demo data) and it is
  // never a silent fallback for a live provider in dev either — dev opts into
  // it through the demo chain explicitly.
  const allowDemo = env.NEMO_SDL_MODE === "demo" || process.env.NODE_ENV !== "production";
  if (allowDemo) {
    sdl.register(new DemoAdapter());
    if (registered === 0) sdl.setOfflineFallback("demo");
  }

  return { sdl, mode: registered > 0 ? "live" : "demo", missing };
}

import type { CanonicalStore } from "./store";
import type { KvStore } from "./cache";
import type { PriorityConfig } from "./priority";
import type { SdlLogger } from "./orchestrator";

/**
 * Infrastructure the host application may inject. The SDL never imports a
 * database or cache driver itself — that would put runtime dependencies in the
 * package and make the mapping logic untestable. Instead the app builds them
 * (`lib/db/pg.ts`, `lib/cache/redis.ts`) and hands them over here.
 */
export type SdlInfra = {
  /** Durable canonical store (Postgres). Absent ⇒ in-memory store. */
  canonical?: CanonicalStore;
  /** Distributed cache (Redis) for layers 2–5. Absent ⇒ in-process LRU. */
  store?: KvStore;
  priority?: PriorityConfig;
  logger?: SdlLogger;
};

/** Singleton used by the API server (one cache, one rate-limit budget). */
let singleton: { sdl: SportsDataLayer; mode: "live" | "demo"; missing: string[] } | null = null;
let infra: SdlInfra = {};

/**
 * Register infrastructure before the first `getSdl()`. Calling it afterwards
 * rebuilds the singleton so an operator who adds a database does not have to
 * restart with a half-wired layer.
 */
export function configureSdl(next: SdlInfra): void {
  infra = { ...infra, ...next };
  singleton = null;
}

export function getSdl(): { sdl: SportsDataLayer; mode: "live" | "demo"; missing: string[] } {
  if (!singleton) {
    singleton = createSdl(
      {
        SPORTRADAR_KEY: process.env.SPORTRADAR_KEY,
        SPORTMONKS_TOKEN: process.env.SPORTMONKS_TOKEN,
        API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY,
        THESPORTSDB_KEY: process.env.THESPORTSDB_KEY,
        NEMO_SDL_MODE: (process.env.NEMO_SDL_MODE as SdlEnv["NEMO_SDL_MODE"]) ?? "auto",
      },
      {
        ...(infra.canonical ? { canonical: infra.canonical } : {}),
        ...(infra.store ? { store: infra.store } : {}),
        ...(infra.priority ? { priority: infra.priority } : {}),
        ...(infra.logger ? { logger: infra.logger } : {}),
      },
    );
  }
  return singleton;
}
