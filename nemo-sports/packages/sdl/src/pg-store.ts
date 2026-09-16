/**
 * SDL · Postgres implementation of `CanonicalStore`
 * ─────────────────────────────────────────────────
 * Dependency inversion: this file knows SQL, but it does NOT know `pg`.
 * The driver lives outside the package (`lib/db/pg.ts` in the app), so the SDL
 * keeps zero runtime dependencies and the mapping logic stays testable with a
 * fake SQL client.
 *
 * Every table and column referenced here exists in `db/schema.sql`.
 */

import type { CanonicalStore, Repo } from "./store";
import type {
  Competition,
  Country,
  EntityType,
  Match,
  MatchEvent,
  MatchStat,
  Player,
  ProviderMapping,
  ProviderName,
  Season,
  Sport,
  Standing,
  StandingStatus,
  Team,
  TopScorer,
  UUID,
  Venue,
} from "./types";

/** The narrow slice of a SQL driver the store needs. */
export interface SqlClient {
  select<T extends object>(sql: string, params: unknown[]): Promise<T[]>;
  run(sql: string, params: unknown[]): Promise<void>;
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
}

type Row = Record<string, unknown>;

/* ─── value coercion (Postgres → TS and back) ──────────────── */

export const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
export const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
export const intOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
export const numOr = (v: unknown, fallback: number): number => (v === null || v === undefined ? fallback : Number(v));
export const bool = (v: unknown): boolean => v === true || v === "t" || v === "true" || v === 1;

export const toJson = <T,>(v: unknown, fallback: T): T => {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
};

export const stringify = (v: unknown): unknown => JSON.stringify(v ?? null);
export const fromDate = (v: unknown): unknown => (v ? new Date(String(v)).toISOString() : null);
export const formToText = (v: unknown): unknown => (Array.isArray(v) ? v.join("") : v ?? null);
export const parseForm = (v: unknown): ("W" | "D" | "L")[] =>
  str(v)
    .split("")
    .filter((c): c is "W" | "D" | "L" => c === "W" || c === "D" || c === "L");

const localized = (ar: unknown, en: unknown) => ({ ar: str(ar), en: str(en) });

/* ─── row → entity mappers ─────────────────────────────────── */

export const toSport = (r: Row): Sport => ({
  id: str(r.id),
  slug: str(r.slug),
  name: localized(r.name_ar, r.name_en),
  shortName: localized(r.short_name_ar, r.short_name_en),
  icon: strOrNull(r.icon),
  isActive: bool(r.is_active),
  displayOrder: numOr(r.display_order, 100),
  config: toJson<Record<string, unknown>>(r.config, {}),
});

export const toCountry = (r: Row): Country => ({
  id: str(r.id),
  iso2: str(r.iso2),
  iso3: str(r.iso3),
  name: localized(r.name_ar, r.name_en),
  continent: str(r.continent),
  flagUrl: strOrNull(r.flag_url),
});

export const toCompetition = (r: Row): Competition => ({
  id: str(r.id),
  sportId: str(r.sport_id),
  countryId: strOrNull(r.country_id),
  name: localized(r.name_ar, r.name_en),
  shortName: localized(r.short_name_ar, r.short_name_en),
  slug: str(r.slug),
  logoUrl: strOrNull(r.logo_url),
  type: (str(r.type) || "league") as Competition["type"],
  gender: (str(r.gender) || "male") as Competition["gender"],
  ageCategory: (str(r.age_category) || "senior") as Competition["ageCategory"],
  isActive: bool(r.is_active),
  isFeatured: bool(r.is_featured),
  displayOrder: numOr(r.display_order, 100),
  currentSeasonId: strOrNull(r.current_season_id),
});

export const toSeason = (r: Row): Season => ({
  id: str(r.id),
  competitionId: str(r.competition_id),
  name: str(r.name),
  slug: str(r.slug),
  startDate: strOrNull(r.start_date),
  endDate: strOrNull(r.end_date),
  isCurrent: bool(r.is_current),
  status: (str(r.status) || "upcoming") as Season["status"],
});

export const toVenue = (r: Row): Venue => ({
  id: str(r.id),
  name: localized(r.name_ar, r.name_en),
  city: r.city_en || r.city_ar ? localized(r.city_ar, r.city_en) : null,
  countryId: strOrNull(r.country_id),
  capacity: intOrNull(r.capacity),
  surface: strOrNull(r.surface),
  lat: intOrNull(r.lat),
  lng: intOrNull(r.lng),
  imageUrl: strOrNull(r.image_url),
});

export const toTeam = (r: Row): Team => ({
  id: str(r.id),
  sportId: str(r.sport_id),
  countryId: strOrNull(r.country_id),
  name: localized(r.name_ar, r.name_en),
  shortName: localized(r.short_name_ar, r.short_name_en),
  abbreviation: str(r.abbreviation),
  slug: str(r.slug),
  logoUrl: strOrNull(r.logo_url),
  foundedYear: intOrNull(r.founded_year),
  venueId: strOrNull(r.venue_id),
  primaryColor: strOrNull(r.primary_color),
  secondaryColor: strOrNull(r.secondary_color),
  isNationalTeam: bool(r.is_national),
  type: (str(r.type) || "club") as Team["type"],
  isActive: bool(r.is_active),
  social: toJson<Record<string, string>>(r.social, {}),
});

export const toPlayer = (r: Row): Player => ({
  id: str(r.id),
  sportId: str(r.sport_id),
  currentTeamId: strOrNull(r.current_team_id),
  countryId: strOrNull(r.country_id),
  fullName: localized(r.full_name_ar, r.full_name_en),
  slug: str(r.slug),
  dateOfBirth: strOrNull(r.date_of_birth),
  position: strOrNull(r.position),
  jerseyNumber: intOrNull(r.jersey_number),
  photoUrl: strOrNull(r.photo_url),
  photoAttribution: strOrNull(r.photo_attribution),
  heightCm: intOrNull(r.height_cm),
  weightKg: intOrNull(r.weight_kg),
  footPreference: (strOrNull(r.foot_preference) as Player["footPreference"]) ?? null,
  careerStartedYear: intOrNull(r.career_started_year),
  isActive: bool(r.is_active),
  biography: r.biography_en || r.biography_ar ? localized(r.biography_ar, r.biography_en) : null,
});

export const toMatch = (r: Row): Match => ({
  id: str(r.id),
  sportId: str(r.sport_id),
  competitionId: str(r.competition_id),
  seasonId: strOrNull(r.season_id),
  round: strOrNull(r.round),
  homeTeamId: strOrNull(r.home_team_id),
  awayTeamId: strOrNull(r.away_team_id),
  venueId: strOrNull(r.venue_id),
  scheduledAt: str(r.scheduled_at),
  status: (str(r.status) || "scheduled") as Match["status"],
  homeScore: intOrNull(r.home_score),
  awayScore: intOrNull(r.away_score),
  periods: toJson<Match["periods"]>(r.periods, []),
  aggregateScore:
    r.aggregate_home === null || r.aggregate_home === undefined ? null : { home: Number(r.aggregate_home), away: Number(r.aggregate_away ?? 0) },
  winner: (strOrNull(r.winner) as Match["winner"]) ?? null,
  leg: intOrNull(r.leg),
  neutralVenue: bool(r.neutral_venue),
  referee: r.referee_name ? { name: str(r.referee_name), country: strOrNull(r.referee_country) } : null,
  attendance: intOrNull(r.attendance),
  isFeatured: bool(r.is_featured),
  extension: toJson<Record<string, unknown>>(r.extension, {}),
});

export const toEvent = (r: Row): MatchEvent => ({
  id: str(r.id),
  matchId: str(r.match_id),
  type: str(r.type) as MatchEvent["type"],
  minute: intOrNull(r.minute),
  additionalMinute: intOrNull(r.additional_minute),
  teamId: strOrNull(r.team_id),
  playerId: strOrNull(r.player_id),
  secondaryPlayerId: strOrNull(r.secondary_player_id),
  description: strOrNull(r.description),
  provider: str(r.provider) as ProviderName,
  providerEventId: strOrNull(r.provider_event_id),
  receivedAt: str(r.received_at),
});

export const toStat = (r: Row): MatchStat => ({
  id: str(r.id),
  matchId: str(r.match_id),
  teamId: str(r.team_id),
  type: str(r.type),
  value: str(r.value),
  period: str(r.period),
  provider: str(r.provider) as ProviderName,
  updatedAt: str(r.updated_at),
});

export const toStanding = (r: Row): Standing => ({
  id: str(r.id),
  competitionId: str(r.competition_id),
  seasonId: str(r.season_id),
  group: strOrNull(r.group_name),
  teamId: str(r.team_id),
  position: numOr(r.position, 0),
  played: numOr(r.played, 0),
  won: numOr(r.won, 0),
  drawn: numOr(r.drawn, 0),
  lost: numOr(r.lost, 0),
  goalsFor: numOr(r.goals_for, 0),
  goalsAgainst: numOr(r.goals_against, 0),
  goalDifference: numOr(r.goal_difference, 0),
  points: numOr(r.points, 0),
  form: parseForm(r.form),
  status: (strOrNull(r.status) as StandingStatus) ?? null,
  provider: str(r.provider) as ProviderName,
  updatedAt: str(r.updated_at),
});

export const toTopScorer = (r: Row): TopScorer => ({
  id: str(r.id),
  competitionId: str(r.competition_id),
  seasonId: str(r.season_id),
  playerId: str(r.player_id),
  teamId: strOrNull(r.team_id),
  goals: numOr(r.goals, 0),
  appearances: numOr(r.appearances, 0),
  penalties: numOr(r.penalties, 0),
  updatedAt: str(r.updated_at),
});

export const toMapping = (r: Row): ProviderMapping => ({
  id: str(r.id),
  entityType: str(r.entity_type) as EntityType,
  canonicalId: str(r.canonical_id),
  provider: str(r.provider) as ProviderName,
  providerId: str(r.provider_id),
  confidence: numOr(r.confidence, 1),
  verified: bool(r.verified),
  notes: strOrNull(r.notes),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

/* ─── generic upsert repository ────────────────────────────── */

/**
 * One entry per column: SQL column name + how to read it off the canonical
 * entity + optional encoder. Declared explicitly so a renamed entity field is
 * a compile error rather than a silently NULL column.
 */
export type Field<T> = { column: string; get: (e: T) => unknown; encode?: (v: unknown) => unknown };
export type FieldMap<T> = Field<T>[];

const f = <T,>(column: string, get: (e: T) => unknown, encode?: (v: unknown) => unknown): Field<T> => ({ column, get, encode });

class PgRepo<T extends { id: string }> implements Repo<T> {
  constructor(
    private db: SqlClient,
    private table: string,
    private fields: FieldMap<T>,
    private decode: (row: Row) => T,
  ) {}

  async get(id: string): Promise<T | null> {
    const rows = await this.db.select<Row>(`SELECT * FROM ${this.table} WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] ? this.decode(rows[0]) : null;
  }

  async list(): Promise<T[]> {
    const rows = await this.db.select<Row>(`SELECT * FROM ${this.table}`, []);
    return rows.map(this.decode);
  }

  async put(entity: T): Promise<T> {
    const columns = this.fields.map((x) => x.column);
    const values = this.fields.map((x) => {
      const raw = x.get(entity);
      return x.encode ? x.encode(raw) : raw ?? null;
    });
    const updates = columns
      .filter((c) => c !== "id")
      .map((c) => `${c} = EXCLUDED.${c}`)
      .join(", ");

    await this.db.run(
      `INSERT INTO ${this.table} (${columns.join(", ")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})
       ON CONFLICT (id) DO UPDATE SET ${updates}`,
      values,
    );
    return entity;
  }

  async count(): Promise<number> {
    const rows = await this.db.select<{ n: string | number }>(`SELECT COUNT(*)::text AS n FROM ${this.table}`, []);
    return Number(rows[0]?.n ?? 0);
  }
}

/* ─── non-repo member repositories (events, stats, mappings) ─ */

export const memberRepos = (db: SqlClient) => ({
  events: {
    upsert: async (e: MatchEvent): Promise<void> => {
      await db.run(
        `INSERT INTO match_events (id, match_id, type, minute, additional_minute, team_id, player_id,
           secondary_player_id, description, provider, provider_event_id, received_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET
           minute = EXCLUDED.minute, additional_minute = EXCLUDED.additional_minute,
           team_id = EXCLUDED.team_id, player_id = EXCLUDED.player_id,
           secondary_player_id = EXCLUDED.secondary_player_id, description = EXCLUDED.description,
           provider = EXCLUDED.provider, received_at = EXCLUDED.received_at`,
        [e.id, e.matchId, e.type, e.minute, e.additionalMinute, e.teamId, e.playerId, e.secondaryPlayerId, e.description, e.provider, e.providerEventId, e.receivedAt],
      );
    },
    forMatch: async (matchId: UUID): Promise<MatchEvent[]> => {
      const rows = await db.select<Row>(`SELECT * FROM match_events WHERE match_id = $1 ORDER BY minute NULLS FIRST`, [matchId]);
      return rows.map(toEvent);
    },
  },

  stats: {
    upsert: async (s: MatchStat): Promise<void> => {
      await db.run(
        `INSERT INTO match_stats (id, match_id, team_id, type, value, period, provider, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (match_id, team_id, type, period) DO UPDATE SET
           value = EXCLUDED.value, provider = EXCLUDED.provider, updated_at = EXCLUDED.updated_at`,
        [s.id, s.matchId, s.teamId, s.type, String(s.value), s.period, s.provider, s.updatedAt],
      );
    },
    forMatch: async (matchId: UUID): Promise<MatchStat[]> => {
      const rows = await db.select<Row>(`SELECT * FROM match_stats WHERE match_id = $1`, [matchId]);
      return rows.map(toStat);
    },
  },

  mappings: {
    find: async (entityType: EntityType, provider: string, providerId: string): Promise<ProviderMapping | null> => {
      const rows = await db.select<Row>(
        `SELECT * FROM provider_entity_map WHERE entity_type = $1 AND provider = $2 AND provider_id = $3 LIMIT 1`,
        [entityType, provider, providerId],
      );
      return rows[0] ? toMapping(rows[0]) : null;
    },

    forEntity: async (entityType: EntityType, canonicalId: UUID): Promise<ProviderMapping[]> => {
      const rows = await db.select<Row>(`SELECT * FROM provider_entity_map WHERE entity_type = $1 AND canonical_id = $2`, [entityType, canonicalId]);
      return rows.map(toMapping);
    },

    put: async (m: Omit<ProviderMapping, "id" | "createdAt" | "updatedAt">): Promise<ProviderMapping> => {
      const rows = await db.select<Row>(
        `INSERT INTO provider_entity_map (entity_type, canonical_id, provider, provider_id, confidence, verified, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (entity_type, provider, provider_id) DO UPDATE SET
           canonical_id = EXCLUDED.canonical_id, confidence = EXCLUDED.confidence,
           verified = EXCLUDED.verified, notes = EXCLUDED.notes, updated_at = now()
         RETURNING *`,
        [m.entityType, m.canonicalId, m.provider, m.providerId, m.confidence, m.verified, m.notes],
      );
      return toMapping(rows[0] as Row);
    },

    verify: async (id: string, verified: boolean): Promise<void> => {
      await db.run(`UPDATE provider_entity_map SET verified = $2, updated_at = now() WHERE id = $1`, [id, verified]);
    },

    pending: async (limit = 50): Promise<ProviderMapping[]> => {
      const rows = await db.select<Row>(`SELECT * FROM provider_entity_map WHERE NOT verified ORDER BY updated_at DESC LIMIT $1`, [limit]);
      return rows.map(toMapping);
    },

    all: async (): Promise<ProviderMapping[]> => {
      const rows = await db.select<Row>(`SELECT * FROM provider_entity_map ORDER BY updated_at DESC`, []);
      return rows.map(toMapping);
    },
  },
});

/* ─── the store ────────────────────────────────────────────── */

export class PgCanonicalStore implements CanonicalStore {
  private db: SqlClient;

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
  events: ReturnType<typeof memberRepos>["events"];
  stats: ReturnType<typeof memberRepos>["stats"];
  mappings: ReturnType<typeof memberRepos>["mappings"];

  constructor(db: SqlClient) {
    this.db = db;

    this.sports = new PgRepo<Sport>(
      db,
      "sports",
      [
        f<Sport>("id", (e) => e.id),
        f<Sport>("slug", (e) => e.slug),
        f<Sport>("name_ar", (e) => e.name.ar),
        f<Sport>("name_en", (e) => e.name.en),
        f<Sport>("short_name_ar", (e) => e.shortName.ar),
        f<Sport>("short_name_en", (e) => e.shortName.en),
        f<Sport>("icon", (e) => e.icon),
        f<Sport>("is_active", (e) => e.isActive),
        f<Sport>("display_order", (e) => e.displayOrder),
        f<Sport>("config", (e) => e.config, stringify),
      ],
      toSport,
    );

    this.countries = new PgRepo<Country>(
      db,
      "countries",
      [
        f<Country>("id", (e) => e.id),
        f<Country>("iso2", (e) => e.iso2),
        f<Country>("iso3", (e) => e.iso3),
        f<Country>("name_ar", (e) => e.name.ar),
        f<Country>("name_en", (e) => e.name.en),
        f<Country>("continent", (e) => e.continent),
        f<Country>("flag_url", (e) => e.flagUrl),
      ],
      toCountry,
    );

    this.competitions = new PgRepo<Competition>(
      db,
      "competitions",
      [
        f<Competition>("id", (e) => e.id),
        f<Competition>("sport_id", (e) => e.sportId),
        f<Competition>("country_id", (e) => e.countryId),
        f<Competition>("name_ar", (e) => e.name.ar),
        f<Competition>("name_en", (e) => e.name.en),
        f<Competition>("short_name_ar", (e) => e.shortName.ar),
        f<Competition>("short_name_en", (e) => e.shortName.en),
        f<Competition>("slug", (e) => e.slug),
        f<Competition>("logo_url", (e) => e.logoUrl),
        f<Competition>("type", (e) => e.type),
        f<Competition>("gender", (e) => e.gender),
        f<Competition>("age_category", (e) => e.ageCategory),
        f<Competition>("is_active", (e) => e.isActive),
        f<Competition>("is_featured", (e) => e.isFeatured),
        f<Competition>("display_order", (e) => e.displayOrder),
        f<Competition>("current_season_id", (e) => e.currentSeasonId),
      ],
      toCompetition,
    );

    this.seasons = new PgRepo<Season>(
      db,
      "seasons",
      [
        f<Season>("id", (e) => e.id),
        f<Season>("competition_id", (e) => e.competitionId),
        f<Season>("name", (e) => e.name),
        f<Season>("slug", (e) => e.slug),
        f<Season>("start_date", (e) => e.startDate),
        f<Season>("end_date", (e) => e.endDate),
        f<Season>("is_current", (e) => e.isCurrent),
        f<Season>("status", (e) => e.status),
      ],
      toSeason,
    );

    this.venues = new PgRepo<Venue>(
      db,
      "venues",
      [
        f<Venue>("id", (e) => e.id),
        f<Venue>("name_ar", (e) => e.name.ar),
        f<Venue>("name_en", (e) => e.name.en),
        f<Venue>("city_ar", (e) => e.city?.ar ?? null),
        f<Venue>("city_en", (e) => e.city?.en ?? null),
        f<Venue>("country_id", (e) => e.countryId),
        f<Venue>("capacity", (e) => e.capacity),
        f<Venue>("surface", (e) => e.surface),
        f<Venue>("lat", (e) => e.lat),
        f<Venue>("lng", (e) => e.lng),
        f<Venue>("image_url", (e) => e.imageUrl),
      ],
      toVenue,
    );

    this.teams = new PgRepo<Team>(
      db,
      "teams",
      [
        f<Team>("id", (e) => e.id),
        f<Team>("sport_id", (e) => e.sportId),
        f<Team>("country_id", (e) => e.countryId),
        f<Team>("name_ar", (e) => e.name.ar),
        f<Team>("name_en", (e) => e.name.en),
        f<Team>("short_name_ar", (e) => e.shortName.ar),
        f<Team>("short_name_en", (e) => e.shortName.en),
        f<Team>("abbreviation", (e) => e.abbreviation),
        f<Team>("slug", (e) => e.slug),
        f<Team>("logo_url", (e) => e.logoUrl),
        f<Team>("founded_year", (e) => e.foundedYear),
        f<Team>("venue_id", (e) => e.venueId),
        f<Team>("primary_color", (e) => e.primaryColor),
        f<Team>("secondary_color", (e) => e.secondaryColor),
        f<Team>("is_national", (e) => e.isNationalTeam),
        f<Team>("type", (e) => e.type),
        f<Team>("is_active", (e) => e.isActive),
        f<Team>("social", (e) => e.social, stringify),
      ],
      toTeam,
    );

    this.players = new PgRepo<Player>(
      db,
      "players",
      [
        f<Player>("id", (e) => e.id),
        f<Player>("sport_id", (e) => e.sportId),
        f<Player>("current_team_id", (e) => e.currentTeamId),
        f<Player>("country_id", (e) => e.countryId),
        f<Player>("full_name_ar", (e) => e.fullName.ar),
        f<Player>("full_name_en", (e) => e.fullName.en),
        f<Player>("slug", (e) => e.slug),
        f<Player>("date_of_birth", (e) => e.dateOfBirth),
        f<Player>("position", (e) => e.position),
        f<Player>("jersey_number", (e) => e.jerseyNumber),
        f<Player>("photo_url", (e) => e.photoUrl),
        f<Player>("photo_attribution", (e) => e.photoAttribution),
        f<Player>("height_cm", (e) => e.heightCm),
        f<Player>("weight_kg", (e) => e.weightKg),
        f<Player>("foot_preference", (e) => e.footPreference),
        f<Player>("career_started_year", (e) => e.careerStartedYear),
        f<Player>("is_active", (e) => e.isActive),
        f<Player>("biography_ar", (e) => e.biography?.ar ?? null),
        f<Player>("biography_en", (e) => e.biography?.en ?? null),
      ],
      toPlayer,
    );

    this.matches = new PgRepo<Match>(
      db,
      "matches",
      [
        f<Match>("id", (e) => e.id),
        f<Match>("sport_id", (e) => e.sportId),
        f<Match>("competition_id", (e) => e.competitionId),
        f<Match>("season_id", (e) => e.seasonId),
        f<Match>("round", (e) => e.round),
        f<Match>("home_team_id", (e) => e.homeTeamId),
        f<Match>("away_team_id", (e) => e.awayTeamId),
        f<Match>("venue_id", (e) => e.venueId),
        f<Match>("scheduled_at", (e) => e.scheduledAt, fromDate),
        f<Match>("status", (e) => e.status),
        f<Match>("home_score", (e) => e.homeScore),
        f<Match>("away_score", (e) => e.awayScore),
        f<Match>("periods", (e) => e.periods, stringify),
        f<Match>("aggregate_home", (e) => e.aggregateScore?.home ?? null),
        f<Match>("aggregate_away", (e) => e.aggregateScore?.away ?? null),
        f<Match>("winner", (e) => e.winner),
        f<Match>("leg", (e) => e.leg),
        f<Match>("neutral_venue", (e) => e.neutralVenue),
        f<Match>("referee_name", (e) => e.referee?.name ?? null),
        f<Match>("referee_country", (e) => e.referee?.country ?? null),
        f<Match>("attendance", (e) => e.attendance),
        f<Match>("is_featured", (e) => e.isFeatured),
        f<Match>("extension", (e) => e.extension, stringify),
      ],
      toMatch,
    );

    this.standings = new PgRepo<Standing>(
      db,
      "standings",
      [
        f<Standing>("id", (e) => e.id),
        f<Standing>("competition_id", (e) => e.competitionId),
        f<Standing>("season_id", (e) => e.seasonId),
        f<Standing>("group_name", (e) => e.group),
        f<Standing>("team_id", (e) => e.teamId),
        f<Standing>("position", (e) => e.position),
        f<Standing>("played", (e) => e.played),
        f<Standing>("won", (e) => e.won),
        f<Standing>("drawn", (e) => e.drawn),
        f<Standing>("lost", (e) => e.lost),
        f<Standing>("goals_for", (e) => e.goalsFor),
        f<Standing>("goals_against", (e) => e.goalsAgainst),
        f<Standing>("points", (e) => e.points),
        f<Standing>("form", (e) => e.form, formToText),
        f<Standing>("status", (e) => e.status),
        f<Standing>("provider", (e) => e.provider),
        f<Standing>("updated_at", (e) => e.updatedAt, fromDate),
      ],
      toStanding,
    );

    this.topScorers = new PgRepo<TopScorer>(
      db,
      "top_scorers",
      [
        f<TopScorer>("id", (e) => e.id),
        f<TopScorer>("competition_id", (e) => e.competitionId),
        f<TopScorer>("season_id", (e) => e.seasonId),
        f<TopScorer>("player_id", (e) => e.playerId),
        f<TopScorer>("team_id", (e) => e.teamId),
        f<TopScorer>("goals", (e) => e.goals),
        f<TopScorer>("appearances", (e) => e.appearances),
        f<TopScorer>("penalties", (e) => e.penalties),
        f<TopScorer>("updated_at", (e) => e.updatedAt, fromDate),
      ],
      toTopScorer,
    );

    const members = memberRepos(db);
    this.events = members.events;
    this.stats = members.stats;
    this.mappings = members.mappings;
  }

  /** Run a unit of work (e.g. one match upsert) inside a single transaction. */
  withTransaction<T>(fn: (store: CanonicalStore) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => fn(new PgCanonicalStore(tx)));
  }
}
