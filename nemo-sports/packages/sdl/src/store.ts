/**
 * SDL · Canonical store (§3.4)
 * Repository interface + in-memory implementation. The Postgres implementation
 * in `db/migrations` satisfies the same contract; swapping it changes nothing
 * above this file.
 */

import { MemoryStore, type KvStore } from "./cache";
import { compactKey, nowIso, normalizeName, seededId } from "./normalize";
import type {
  Competition,
  Country,
  EntityType,
  Match,
  MatchEvent,
  MatchStat,
  Player,
  ProviderMapping,
  Season,
  Sport,
  Standing,
  Team,
  TopScorer,
  UUID,
  Venue,
} from "./types";

export interface CanonicalStore {
  sports: Repo<Sport>;
  countries: Repo<Country>;
  competitions: Repo<Competition>;
  seasons: Repo<Season>;
  venues: Repo<Venue>;
  teams: Repo<Team>;
  players: Repo<Player>;
  matches: Repo<Match>;
  standings: Repo<Standing>;
  topScorers: Repo<TopScorer>;

  events: { upsert(e: MatchEvent): Promise<void>; forMatch(matchId: UUID): Promise<MatchEvent[]> };
  stats: { upsert(s: MatchStat): Promise<void>; forMatch(matchId: UUID): Promise<MatchStat[]> };

  mappings: {
    find(entityType: EntityType, provider: string, providerId: string): Promise<ProviderMapping | null>;
    forEntity(entityType: EntityType, canonicalId: UUID): Promise<ProviderMapping[]>;
    put(m: Omit<ProviderMapping, "id" | "createdAt" | "updatedAt">): Promise<ProviderMapping>;
    verify(id: string, verified: boolean): Promise<void>;
    pending(limit?: number): Promise<ProviderMapping[]>;
    all(): Promise<ProviderMapping[]>;
  };
}

export interface Repo<T> {
  get(id: string): Promise<T | null>;
  list(): Promise<T[]>;
  put(entity: T): Promise<T>;
  count(): Promise<number>;
}

class MemoryRepo<T extends { id: string }> implements Repo<T> {
  protected map = new Map<string, T>();
  constructor(protected seed: T[] = []) {
    for (const e of seed) this.map.set(e.id, e);
  }
  async get(id: string): Promise<T | null> {
    return this.map.get(id) ?? null;
  }
  async list(): Promise<T[]> {
    return [...this.map.values()];
  }
  async put(entity: T): Promise<T> {
    this.map.set(entity.id, { ...entity });
    return entity;
  }
  async count(): Promise<number> {
    return this.map.size;
  }
}

export class MemoryCanonicalStore implements CanonicalStore {
  sports = new MemoryRepo<Sport>();
  countries = new MemoryRepo<Country>();
  competitions = new MemoryRepo<Competition>();
  seasons = new MemoryRepo<Season>();
  venues = new MemoryRepo<Venue>();
  teams = new MemoryRepo<Team>();
  players = new MemoryRepo<Player>();
  matches = new MemoryRepo<Match>();
  standings = new MemoryRepo<Standing>();
  topScorers = new MemoryRepo<TopScorer>();

  private eventMap = new Map<UUID, MatchEvent[]>();
  private statMap = new Map<UUID, MatchStat[]>();
  private mappingRows: ProviderMapping[] = [];

  events = {
    upsert: async (e: MatchEvent) => {
      const list = this.eventMap.get(e.matchId) ?? [];
      const idx = list.findIndex((x) => x.id === e.id);
      if (idx >= 0) list[idx] = e;
      else list.push(e);
      list.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
      this.eventMap.set(e.matchId, list);
    },
    forMatch: async (matchId: UUID) => [...(this.eventMap.get(matchId) ?? [])],
  };

  stats = {
    upsert: async (s: MatchStat) => {
      const list = this.statMap.get(s.matchId) ?? [];
      const idx = list.findIndex((x) => x.teamId === s.teamId && x.type === s.type && x.period === s.period);
      if (idx >= 0) list[idx] = s;
      else list.push(s);
      this.statMap.set(s.matchId, list);
    },
    forMatch: async (matchId: UUID) => [...(this.statMap.get(matchId) ?? [])],
  };

  mappings = {
    find: async (entityType: EntityType, provider: string, providerId: string) =>
      this.mappingRows.find((m) => m.entityType === entityType && m.provider === provider && m.providerId === providerId) ?? null,

    forEntity: async (entityType: EntityType, canonicalId: UUID) =>
      this.mappingRows.filter((m) => m.entityType === entityType && m.canonicalId === canonicalId),

    put: async (m: Omit<ProviderMapping, "id" | "createdAt" | "updatedAt">) => {
      const existing = this.mappingRows.find(
        (x) => x.entityType === m.entityType && x.provider === m.provider && x.providerId === m.providerId,
      );
      const row: ProviderMapping = {
        ...m,
        id: existing?.id ?? seededId(`map:${m.entityType}:${m.provider}:${m.providerId}`),
        createdAt: existing?.createdAt ?? nowIso(),
        updatedAt: nowIso(),
      };
      if (existing) Object.assign(existing, row);
      else this.mappingRows.push(row);
      return row;
    },

    verify: async (id: string, verified: boolean) => {
      const row = this.mappingRows.find((m) => m.id === id);
      if (row) {
        row.verified = verified;
        row.updatedAt = nowIso();
      }
    },

    pending: async (limit = 50) => this.mappingRows.filter((m) => !m.verified).slice(0, limit),

    all: async () => [...this.mappingRows],
  };
}

/** Deterministic id for a canonical entity created from provider data. */
export const canonicalId = (entityType: EntityType, seed: string): UUID =>
  seededId(`canon:${entityType}:${normalizeName(seed) || compactKey(seed)}`);

/** Convenience KV for the SDL when Redis is not wired (dev/test). */
export const devKv = (): KvStore => new MemoryStore();
