"use strict";
/**
 * NEMO Sports · Sports Data Layer — public surface
 * ────────────────────────────────────────────────
 * This is the ONLY module the API server, background jobs or admin dashboard
 * may import. Adapters and transport helpers stay internal.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisKvStore = exports.PgCanonicalStore = exports.DEMO_COMPETITIONS = exports.DEMO_SCORERS = exports.DEMO_STANDINGS = exports.DEMO_EVENTS = exports.DEMO_TEAMS = exports.DEMO_FIXTURES = exports.DemoAdapter = exports.TheSportsDbAdapter = exports.SR_STATUS = exports.SportradarAdapter = exports.EVENT_TYPE_ID = exports.SM_STATUS = exports.SportmonksAdapter = exports.AF_STATUS = exports.ApiFootballAdapter = exports.parseMinute = exports.BaseAdapter = exports.DEFAULT_CACHE_POLICY = exports.CollectingLogger = exports.SportsDataLayer = exports.nowIso = exports.seededId = exports.withinMinutes = exports.dayKey = exports.rankCandidates = exports.requestKey = exports.fingerprint = exports.compactKey = exports.normalizeName = exports.similarity = exports.POLLING_TABLE = exports.profileFor = exports.slugify = exports.CanonicalMapper = exports.devKv = exports.canonicalId = exports.MemoryCanonicalStore = exports.EntityResolver = exports.DEFAULT_PRIORITY_RULES = exports.PriorityConfig = exports.DEFAULT_CONFLICT_RULES = exports.ConflictDetector = exports.HealthMonitor = exports.RequestCoalescer = exports.RateLimiter = exports.MemoryStore = exports.SdlCache = exports.notSupported = void 0;
exports.createSdl = createSdl;
exports.configureSdl = configureSdl;
exports.getSdl = getSdl;
__exportStar(require("./types"), exports);
var provider_1 = require("./provider");
Object.defineProperty(exports, "notSupported", { enumerable: true, get: function () { return provider_1.notSupported; } });
var cache_1 = require("./cache");
Object.defineProperty(exports, "SdlCache", { enumerable: true, get: function () { return cache_1.SdlCache; } });
Object.defineProperty(exports, "MemoryStore", { enumerable: true, get: function () { return cache_1.MemoryStore; } });
var rate_limit_1 = require("./rate-limit");
Object.defineProperty(exports, "RateLimiter", { enumerable: true, get: function () { return rate_limit_1.RateLimiter; } });
Object.defineProperty(exports, "RequestCoalescer", { enumerable: true, get: function () { return rate_limit_1.RequestCoalescer; } });
var health_1 = require("./health");
Object.defineProperty(exports, "HealthMonitor", { enumerable: true, get: function () { return health_1.HealthMonitor; } });
var conflict_1 = require("./conflict");
Object.defineProperty(exports, "ConflictDetector", { enumerable: true, get: function () { return conflict_1.ConflictDetector; } });
Object.defineProperty(exports, "DEFAULT_CONFLICT_RULES", { enumerable: true, get: function () { return conflict_1.DEFAULT_CONFLICT_RULES; } });
var priority_1 = require("./priority");
Object.defineProperty(exports, "PriorityConfig", { enumerable: true, get: function () { return priority_1.PriorityConfig; } });
Object.defineProperty(exports, "DEFAULT_PRIORITY_RULES", { enumerable: true, get: function () { return priority_1.DEFAULT_PRIORITY_RULES; } });
var entity_resolver_1 = require("./entity-resolver");
Object.defineProperty(exports, "EntityResolver", { enumerable: true, get: function () { return entity_resolver_1.EntityResolver; } });
var store_1 = require("./store");
Object.defineProperty(exports, "MemoryCanonicalStore", { enumerable: true, get: function () { return store_1.MemoryCanonicalStore; } });
Object.defineProperty(exports, "canonicalId", { enumerable: true, get: function () { return store_1.canonicalId; } });
Object.defineProperty(exports, "devKv", { enumerable: true, get: function () { return store_1.devKv; } });
var mapper_1 = require("./mapper");
Object.defineProperty(exports, "CanonicalMapper", { enumerable: true, get: function () { return mapper_1.CanonicalMapper; } });
Object.defineProperty(exports, "slugify", { enumerable: true, get: function () { return mapper_1.slugify; } });
var polling_1 = require("./polling");
Object.defineProperty(exports, "profileFor", { enumerable: true, get: function () { return polling_1.profileFor; } });
Object.defineProperty(exports, "POLLING_TABLE", { enumerable: true, get: function () { return polling_1.POLLING_TABLE; } });
var normalize_1 = require("./normalize");
Object.defineProperty(exports, "similarity", { enumerable: true, get: function () { return normalize_1.similarity; } });
Object.defineProperty(exports, "normalizeName", { enumerable: true, get: function () { return normalize_1.normalizeName; } });
Object.defineProperty(exports, "compactKey", { enumerable: true, get: function () { return normalize_1.compactKey; } });
Object.defineProperty(exports, "fingerprint", { enumerable: true, get: function () { return normalize_1.fingerprint; } });
Object.defineProperty(exports, "requestKey", { enumerable: true, get: function () { return normalize_1.requestKey; } });
Object.defineProperty(exports, "rankCandidates", { enumerable: true, get: function () { return normalize_1.rankCandidates; } });
Object.defineProperty(exports, "dayKey", { enumerable: true, get: function () { return normalize_1.dayKey; } });
Object.defineProperty(exports, "withinMinutes", { enumerable: true, get: function () { return normalize_1.withinMinutes; } });
Object.defineProperty(exports, "seededId", { enumerable: true, get: function () { return normalize_1.seededId; } });
Object.defineProperty(exports, "nowIso", { enumerable: true, get: function () { return normalize_1.nowIso; } });
var orchestrator_1 = require("./orchestrator");
Object.defineProperty(exports, "SportsDataLayer", { enumerable: true, get: function () { return orchestrator_1.SportsDataLayer; } });
Object.defineProperty(exports, "CollectingLogger", { enumerable: true, get: function () { return orchestrator_1.CollectingLogger; } });
Object.defineProperty(exports, "DEFAULT_CACHE_POLICY", { enumerable: true, get: function () { return orchestrator_1.DEFAULT_CACHE_POLICY; } });
/* ── adapters: exported so the composition root can register them, and so
   tests can drive them with a fake transport. Nothing else should import these. */
var base_1 = require("./adapters/base");
Object.defineProperty(exports, "BaseAdapter", { enumerable: true, get: function () { return base_1.BaseAdapter; } });
Object.defineProperty(exports, "parseMinute", { enumerable: true, get: function () { return base_1.parseMinute; } });
var api_football_1 = require("./adapters/api-football");
Object.defineProperty(exports, "ApiFootballAdapter", { enumerable: true, get: function () { return api_football_1.ApiFootballAdapter; } });
Object.defineProperty(exports, "AF_STATUS", { enumerable: true, get: function () { return api_football_1.AF_STATUS; } });
var sportmonks_1 = require("./adapters/sportmonks");
Object.defineProperty(exports, "SportmonksAdapter", { enumerable: true, get: function () { return sportmonks_1.SportmonksAdapter; } });
Object.defineProperty(exports, "SM_STATUS", { enumerable: true, get: function () { return sportmonks_1.SM_STATUS; } });
Object.defineProperty(exports, "EVENT_TYPE_ID", { enumerable: true, get: function () { return sportmonks_1.EVENT_TYPE_ID; } });
var sportradar_1 = require("./adapters/sportradar");
Object.defineProperty(exports, "SportradarAdapter", { enumerable: true, get: function () { return sportradar_1.SportradarAdapter; } });
Object.defineProperty(exports, "SR_STATUS", { enumerable: true, get: function () { return sportradar_1.SR_STATUS; } });
var thesportsdb_1 = require("./adapters/thesportsdb");
Object.defineProperty(exports, "TheSportsDbAdapter", { enumerable: true, get: function () { return thesportsdb_1.TheSportsDbAdapter; } });
var demo_1 = require("./adapters/demo");
Object.defineProperty(exports, "DemoAdapter", { enumerable: true, get: function () { return demo_1.DemoAdapter; } });
Object.defineProperty(exports, "DEMO_FIXTURES", { enumerable: true, get: function () { return demo_1.DEMO_FIXTURES; } });
Object.defineProperty(exports, "DEMO_TEAMS", { enumerable: true, get: function () { return demo_1.DEMO_TEAMS; } });
Object.defineProperty(exports, "DEMO_EVENTS", { enumerable: true, get: function () { return demo_1.DEMO_EVENTS; } });
Object.defineProperty(exports, "DEMO_STANDINGS", { enumerable: true, get: function () { return demo_1.DEMO_STANDINGS; } });
Object.defineProperty(exports, "DEMO_SCORERS", { enumerable: true, get: function () { return demo_1.DEMO_SCORERS; } });
Object.defineProperty(exports, "DEMO_COMPETITIONS", { enumerable: true, get: function () { return demo_1.DEMO_COMPETITIONS; } });
const orchestrator_2 = require("./orchestrator");
const api_football_2 = require("./adapters/api-football");
const sportmonks_2 = require("./adapters/sportmonks");
const sportradar_2 = require("./adapters/sportradar");
const thesportsdb_2 = require("./adapters/thesportsdb");
const demo_2 = require("./adapters/demo");
var pg_store_1 = require("./pg-store");
Object.defineProperty(exports, "PgCanonicalStore", { enumerable: true, get: function () { return pg_store_1.PgCanonicalStore; } });
var redis_store_1 = require("./redis-store");
Object.defineProperty(exports, "RedisKvStore", { enumerable: true, get: function () { return redis_store_1.RedisKvStore; } });
/**
 * Composition root. Providers are registered only when credentials exist, so a
 * deployment with zero keys still runs (on the demo adapter) instead of
 * crashing — and pages fed by the demo provider are marked non-indexable.
 */
function createSdl(env = {}, opts = {}) {
    const sdl = new orchestrator_2.SportsDataLayer(opts);
    const missing = [];
    let registered = 0;
    if (env.NEMO_SDL_MODE !== "demo") {
        if (env.SPORTRADAR_KEY) {
            sdl.register(new sportradar_2.SportradarAdapter({ apiKey: env.SPORTRADAR_KEY }));
            registered++;
        }
        else
            missing.push("sportradar");
        if (env.SPORTMONKS_TOKEN) {
            sdl.register(new sportmonks_2.SportmonksAdapter({ apiToken: env.SPORTMONKS_TOKEN }));
            registered++;
        }
        else
            missing.push("sportmonks");
        if (env.API_FOOTBALL_KEY) {
            sdl.register(new api_football_2.ApiFootballAdapter({ apiKey: env.API_FOOTBALL_KEY }));
            registered++;
        }
        else
            missing.push("api_football");
        if (env.THESPORTSDB_KEY) {
            sdl.register(new thesportsdb_2.TheSportsDbAdapter({ apiKey: env.THESPORTSDB_KEY }));
            registered++;
        }
        else
            missing.push("thesportsdb");
    }
    else {
        missing.push("sportradar", "sportmonks", "api_football", "thesportsdb");
    }
    // The demo adapter is always registered and appended to every chain as the
    // final link, so the platform runs with zero keys and a chain never ends with
    // "no provider available" (§14.1). Pages served from it carry source = "demo"
    // and are marked non-indexable (Instruction 6).
    sdl.register(new demo_2.DemoAdapter());
    sdl.setOfflineFallback("demo");
    return { sdl, mode: registered > 0 ? "live" : "demo", missing };
}
/** Singleton used by the API server (one cache, one rate-limit budget). */
let singleton = null;
let infra = {};
/**
 * Register infrastructure before the first `getSdl()`. Calling it afterwards
 * rebuilds the singleton so an operator who adds a database does not have to
 * restart with a half-wired layer.
 */
function configureSdl(next) {
    infra = { ...infra, ...next };
    singleton = null;
}
function getSdl() {
    if (!singleton) {
        singleton = createSdl({
            SPORTRADAR_KEY: process.env.SPORTRADAR_KEY,
            SPORTMONKS_TOKEN: process.env.SPORTMONKS_TOKEN,
            API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY,
            THESPORTSDB_KEY: process.env.THESPORTSDB_KEY,
            NEMO_SDL_MODE: process.env.NEMO_SDL_MODE ?? "auto",
        }, {
            ...(infra.canonical ? { canonical: infra.canonical } : {}),
            ...(infra.store ? { store: infra.store } : {}),
            ...(infra.priority ? { priority: infra.priority } : {}),
            ...(infra.logger ? { logger: infra.logger } : {}),
        });
    }
    return singleton;
}
