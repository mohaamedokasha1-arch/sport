"use strict";
/**
 * SDL · Canonical store (§3.4)
 * Repository interface + in-memory implementation. The Postgres implementation
 * in `db/migrations` satisfies the same contract; swapping it changes nothing
 * above this file.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.devKv = exports.canonicalId = exports.MemoryCanonicalStore = void 0;
const cache_1 = require("./cache");
const normalize_1 = require("./normalize");
class MemoryRepo {
    seed;
    map = new Map();
    constructor(seed = []) {
        this.seed = seed;
        for (const e of seed)
            this.map.set(e.id, e);
    }
    async get(id) {
        return this.map.get(id) ?? null;
    }
    async list() {
        return [...this.map.values()];
    }
    async put(entity) {
        this.map.set(entity.id, { ...entity });
        return entity;
    }
    async count() {
        return this.map.size;
    }
}
class MemoryCanonicalStore {
    sports = new MemoryRepo();
    countries = new MemoryRepo();
    competitions = new MemoryRepo();
    seasons = new MemoryRepo();
    venues = new MemoryRepo();
    teams = new MemoryRepo();
    players = new MemoryRepo();
    matches = new MemoryRepo();
    standings = new MemoryRepo();
    topScorers = new MemoryRepo();
    eventMap = new Map();
    statMap = new Map();
    mappingRows = [];
    events = {
        upsert: async (e) => {
            const list = this.eventMap.get(e.matchId) ?? [];
            const idx = list.findIndex((x) => x.id === e.id);
            if (idx >= 0)
                list[idx] = e;
            else
                list.push(e);
            list.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
            this.eventMap.set(e.matchId, list);
        },
        forMatch: async (matchId) => [...(this.eventMap.get(matchId) ?? [])],
    };
    stats = {
        upsert: async (s) => {
            const list = this.statMap.get(s.matchId) ?? [];
            const idx = list.findIndex((x) => x.teamId === s.teamId && x.type === s.type && x.period === s.period);
            if (idx >= 0)
                list[idx] = s;
            else
                list.push(s);
            this.statMap.set(s.matchId, list);
        },
        forMatch: async (matchId) => [...(this.statMap.get(matchId) ?? [])],
    };
    mappings = {
        find: async (entityType, provider, providerId) => this.mappingRows.find((m) => m.entityType === entityType && m.provider === provider && m.providerId === providerId) ?? null,
        forEntity: async (entityType, canonicalId) => this.mappingRows.filter((m) => m.entityType === entityType && m.canonicalId === canonicalId),
        put: async (m) => {
            const existing = this.mappingRows.find((x) => x.entityType === m.entityType && x.provider === m.provider && x.providerId === m.providerId);
            const row = {
                ...m,
                id: existing?.id ?? (0, normalize_1.seededId)(`map:${m.entityType}:${m.provider}:${m.providerId}`),
                createdAt: existing?.createdAt ?? (0, normalize_1.nowIso)(),
                updatedAt: (0, normalize_1.nowIso)(),
            };
            if (existing)
                Object.assign(existing, row);
            else
                this.mappingRows.push(row);
            return row;
        },
        verify: async (id, verified) => {
            const row = this.mappingRows.find((m) => m.id === id);
            if (row) {
                row.verified = verified;
                row.updatedAt = (0, normalize_1.nowIso)();
            }
        },
        pending: async (limit = 50) => this.mappingRows.filter((m) => !m.verified).slice(0, limit),
        all: async () => [...this.mappingRows],
    };
}
exports.MemoryCanonicalStore = MemoryCanonicalStore;
/** Deterministic id for a canonical entity created from provider data. */
const canonicalId = (entityType, seed) => (0, normalize_1.seededId)(`canon:${entityType}:${(0, normalize_1.normalizeName)(seed) || (0, normalize_1.compactKey)(seed)}`);
exports.canonicalId = canonicalId;
/** Convenience KV for the SDL when Redis is not wired (dev/test). */
const devKv = () => new cache_1.MemoryStore();
exports.devKv = devKv;
