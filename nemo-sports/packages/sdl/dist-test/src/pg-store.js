"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PgCanonicalStore = exports.memberRepos = exports.toMapping = exports.toTopScorer = exports.toStanding = exports.toStat = exports.toEvent = exports.toMatch = exports.toPlayer = exports.toTeam = exports.toVenue = exports.toSeason = exports.toCompetition = exports.toCountry = exports.toSport = exports.parseForm = exports.formToText = exports.fromDate = exports.stringify = exports.toJson = exports.bool = exports.numOr = exports.intOrNull = exports.strOrNull = exports.str = void 0;
/* ─── value coercion (Postgres → TS and back) ──────────────── */
const str = (v) => (v === null || v === undefined ? "" : String(v));
exports.str = str;
const strOrNull = (v) => (v === null || v === undefined ? null : String(v));
exports.strOrNull = strOrNull;
const intOrNull = (v) => (v === null || v === undefined ? null : Number(v));
exports.intOrNull = intOrNull;
const numOr = (v, fallback) => (v === null || v === undefined ? fallback : Number(v));
exports.numOr = numOr;
const bool = (v) => v === true || v === "t" || v === "true" || v === 1;
exports.bool = bool;
const toJson = (v, fallback) => {
    if (v === null || v === undefined)
        return fallback;
    if (typeof v === "string") {
        try {
            return JSON.parse(v);
        }
        catch {
            return fallback;
        }
    }
    return v;
};
exports.toJson = toJson;
const stringify = (v) => JSON.stringify(v ?? null);
exports.stringify = stringify;
const fromDate = (v) => (v ? new Date(String(v)).toISOString() : null);
exports.fromDate = fromDate;
const formToText = (v) => (Array.isArray(v) ? v.join("") : v ?? null);
exports.formToText = formToText;
const parseForm = (v) => (0, exports.str)(v)
    .split("")
    .filter((c) => c === "W" || c === "D" || c === "L");
exports.parseForm = parseForm;
const localized = (ar, en) => ({ ar: (0, exports.str)(ar), en: (0, exports.str)(en) });
/* ─── row → entity mappers ─────────────────────────────────── */
const toSport = (r) => ({
    id: (0, exports.str)(r.id),
    slug: (0, exports.str)(r.slug),
    name: localized(r.name_ar, r.name_en),
    shortName: localized(r.short_name_ar, r.short_name_en),
    icon: (0, exports.strOrNull)(r.icon),
    isActive: (0, exports.bool)(r.is_active),
    displayOrder: (0, exports.numOr)(r.display_order, 100),
    config: (0, exports.toJson)(r.config, {}),
});
exports.toSport = toSport;
const toCountry = (r) => ({
    id: (0, exports.str)(r.id),
    iso2: (0, exports.str)(r.iso2),
    iso3: (0, exports.str)(r.iso3),
    name: localized(r.name_ar, r.name_en),
    continent: (0, exports.str)(r.continent),
    flagUrl: (0, exports.strOrNull)(r.flag_url),
});
exports.toCountry = toCountry;
const toCompetition = (r) => ({
    id: (0, exports.str)(r.id),
    sportId: (0, exports.str)(r.sport_id),
    countryId: (0, exports.strOrNull)(r.country_id),
    name: localized(r.name_ar, r.name_en),
    shortName: localized(r.short_name_ar, r.short_name_en),
    slug: (0, exports.str)(r.slug),
    logoUrl: (0, exports.strOrNull)(r.logo_url),
    type: ((0, exports.str)(r.type) || "league"),
    gender: ((0, exports.str)(r.gender) || "male"),
    ageCategory: ((0, exports.str)(r.age_category) || "senior"),
    isActive: (0, exports.bool)(r.is_active),
    isFeatured: (0, exports.bool)(r.is_featured),
    displayOrder: (0, exports.numOr)(r.display_order, 100),
    currentSeasonId: (0, exports.strOrNull)(r.current_season_id),
});
exports.toCompetition = toCompetition;
const toSeason = (r) => ({
    id: (0, exports.str)(r.id),
    competitionId: (0, exports.str)(r.competition_id),
    name: (0, exports.str)(r.name),
    slug: (0, exports.str)(r.slug),
    startDate: (0, exports.strOrNull)(r.start_date),
    endDate: (0, exports.strOrNull)(r.end_date),
    isCurrent: (0, exports.bool)(r.is_current),
    status: ((0, exports.str)(r.status) || "upcoming"),
});
exports.toSeason = toSeason;
const toVenue = (r) => ({
    id: (0, exports.str)(r.id),
    name: localized(r.name_ar, r.name_en),
    city: r.city_en || r.city_ar ? localized(r.city_ar, r.city_en) : null,
    countryId: (0, exports.strOrNull)(r.country_id),
    capacity: (0, exports.intOrNull)(r.capacity),
    surface: (0, exports.strOrNull)(r.surface),
    lat: (0, exports.intOrNull)(r.lat),
    lng: (0, exports.intOrNull)(r.lng),
    imageUrl: (0, exports.strOrNull)(r.image_url),
});
exports.toVenue = toVenue;
const toTeam = (r) => ({
    id: (0, exports.str)(r.id),
    sportId: (0, exports.str)(r.sport_id),
    countryId: (0, exports.strOrNull)(r.country_id),
    name: localized(r.name_ar, r.name_en),
    shortName: localized(r.short_name_ar, r.short_name_en),
    abbreviation: (0, exports.str)(r.abbreviation),
    slug: (0, exports.str)(r.slug),
    logoUrl: (0, exports.strOrNull)(r.logo_url),
    foundedYear: (0, exports.intOrNull)(r.founded_year),
    venueId: (0, exports.strOrNull)(r.venue_id),
    primaryColor: (0, exports.strOrNull)(r.primary_color),
    secondaryColor: (0, exports.strOrNull)(r.secondary_color),
    isNationalTeam: (0, exports.bool)(r.is_national),
    type: ((0, exports.str)(r.type) || "club"),
    isActive: (0, exports.bool)(r.is_active),
    social: (0, exports.toJson)(r.social, {}),
});
exports.toTeam = toTeam;
const toPlayer = (r) => ({
    id: (0, exports.str)(r.id),
    sportId: (0, exports.str)(r.sport_id),
    currentTeamId: (0, exports.strOrNull)(r.current_team_id),
    countryId: (0, exports.strOrNull)(r.country_id),
    fullName: localized(r.full_name_ar, r.full_name_en),
    slug: (0, exports.str)(r.slug),
    dateOfBirth: (0, exports.strOrNull)(r.date_of_birth),
    position: (0, exports.strOrNull)(r.position),
    jerseyNumber: (0, exports.intOrNull)(r.jersey_number),
    photoUrl: (0, exports.strOrNull)(r.photo_url),
    photoAttribution: (0, exports.strOrNull)(r.photo_attribution),
    heightCm: (0, exports.intOrNull)(r.height_cm),
    weightKg: (0, exports.intOrNull)(r.weight_kg),
    footPreference: (0, exports.strOrNull)(r.foot_preference) ?? null,
    careerStartedYear: (0, exports.intOrNull)(r.career_started_year),
    isActive: (0, exports.bool)(r.is_active),
    biography: r.biography_en || r.biography_ar ? localized(r.biography_ar, r.biography_en) : null,
});
exports.toPlayer = toPlayer;
const toMatch = (r) => ({
    id: (0, exports.str)(r.id),
    sportId: (0, exports.str)(r.sport_id),
    competitionId: (0, exports.str)(r.competition_id),
    seasonId: (0, exports.strOrNull)(r.season_id),
    round: (0, exports.strOrNull)(r.round),
    homeTeamId: (0, exports.strOrNull)(r.home_team_id),
    awayTeamId: (0, exports.strOrNull)(r.away_team_id),
    venueId: (0, exports.strOrNull)(r.venue_id),
    scheduledAt: (0, exports.str)(r.scheduled_at),
    status: ((0, exports.str)(r.status) || "scheduled"),
    homeScore: (0, exports.intOrNull)(r.home_score),
    awayScore: (0, exports.intOrNull)(r.away_score),
    periods: (0, exports.toJson)(r.periods, []),
    aggregateScore: r.aggregate_home === null || r.aggregate_home === undefined ? null : { home: Number(r.aggregate_home), away: Number(r.aggregate_away ?? 0) },
    winner: (0, exports.strOrNull)(r.winner) ?? null,
    leg: (0, exports.intOrNull)(r.leg),
    neutralVenue: (0, exports.bool)(r.neutral_venue),
    referee: r.referee_name ? { name: (0, exports.str)(r.referee_name), country: (0, exports.strOrNull)(r.referee_country) } : null,
    attendance: (0, exports.intOrNull)(r.attendance),
    isFeatured: (0, exports.bool)(r.is_featured),
    extension: (0, exports.toJson)(r.extension, {}),
});
exports.toMatch = toMatch;
const toEvent = (r) => ({
    id: (0, exports.str)(r.id),
    matchId: (0, exports.str)(r.match_id),
    type: (0, exports.str)(r.type),
    minute: (0, exports.intOrNull)(r.minute),
    additionalMinute: (0, exports.intOrNull)(r.additional_minute),
    teamId: (0, exports.strOrNull)(r.team_id),
    playerId: (0, exports.strOrNull)(r.player_id),
    secondaryPlayerId: (0, exports.strOrNull)(r.secondary_player_id),
    description: (0, exports.strOrNull)(r.description),
    provider: (0, exports.str)(r.provider),
    providerEventId: (0, exports.strOrNull)(r.provider_event_id),
    receivedAt: (0, exports.str)(r.received_at),
});
exports.toEvent = toEvent;
const toStat = (r) => ({
    id: (0, exports.str)(r.id),
    matchId: (0, exports.str)(r.match_id),
    teamId: (0, exports.str)(r.team_id),
    type: (0, exports.str)(r.type),
    value: (0, exports.str)(r.value),
    period: (0, exports.str)(r.period),
    provider: (0, exports.str)(r.provider),
    updatedAt: (0, exports.str)(r.updated_at),
});
exports.toStat = toStat;
const toStanding = (r) => ({
    id: (0, exports.str)(r.id),
    competitionId: (0, exports.str)(r.competition_id),
    seasonId: (0, exports.str)(r.season_id),
    group: (0, exports.strOrNull)(r.group_name),
    teamId: (0, exports.str)(r.team_id),
    position: (0, exports.numOr)(r.position, 0),
    played: (0, exports.numOr)(r.played, 0),
    won: (0, exports.numOr)(r.won, 0),
    drawn: (0, exports.numOr)(r.drawn, 0),
    lost: (0, exports.numOr)(r.lost, 0),
    goalsFor: (0, exports.numOr)(r.goals_for, 0),
    goalsAgainst: (0, exports.numOr)(r.goals_against, 0),
    goalDifference: (0, exports.numOr)(r.goal_difference, 0),
    points: (0, exports.numOr)(r.points, 0),
    form: (0, exports.parseForm)(r.form),
    status: (0, exports.strOrNull)(r.status) ?? null,
    provider: (0, exports.str)(r.provider),
    updatedAt: (0, exports.str)(r.updated_at),
});
exports.toStanding = toStanding;
const toTopScorer = (r) => ({
    id: (0, exports.str)(r.id),
    competitionId: (0, exports.str)(r.competition_id),
    seasonId: (0, exports.str)(r.season_id),
    playerId: (0, exports.str)(r.player_id),
    teamId: (0, exports.strOrNull)(r.team_id),
    goals: (0, exports.numOr)(r.goals, 0),
    appearances: (0, exports.numOr)(r.appearances, 0),
    penalties: (0, exports.numOr)(r.penalties, 0),
    updatedAt: (0, exports.str)(r.updated_at),
});
exports.toTopScorer = toTopScorer;
const toMapping = (r) => ({
    id: (0, exports.str)(r.id),
    entityType: (0, exports.str)(r.entity_type),
    canonicalId: (0, exports.str)(r.canonical_id),
    provider: (0, exports.str)(r.provider),
    providerId: (0, exports.str)(r.provider_id),
    confidence: (0, exports.numOr)(r.confidence, 1),
    verified: (0, exports.bool)(r.verified),
    notes: (0, exports.strOrNull)(r.notes),
    createdAt: (0, exports.str)(r.created_at),
    updatedAt: (0, exports.str)(r.updated_at),
});
exports.toMapping = toMapping;
const f = (column, get, encode) => ({ column, get, encode });
class PgRepo {
    db;
    table;
    fields;
    decode;
    constructor(db, table, fields, decode) {
        this.db = db;
        this.table = table;
        this.fields = fields;
        this.decode = decode;
    }
    async get(id) {
        const rows = await this.db.select(`SELECT * FROM ${this.table} WHERE id = $1 LIMIT 1`, [id]);
        return rows[0] ? this.decode(rows[0]) : null;
    }
    async list() {
        const rows = await this.db.select(`SELECT * FROM ${this.table}`, []);
        return rows.map(this.decode);
    }
    async put(entity) {
        const columns = this.fields.map((x) => x.column);
        const values = this.fields.map((x) => {
            const raw = x.get(entity);
            return x.encode ? x.encode(raw) : raw ?? null;
        });
        const updates = columns
            .filter((c) => c !== "id")
            .map((c) => `${c} = EXCLUDED.${c}`)
            .join(", ");
        await this.db.run(`INSERT INTO ${this.table} (${columns.join(", ")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})
       ON CONFLICT (id) DO UPDATE SET ${updates}`, values);
        return entity;
    }
    async count() {
        const rows = await this.db.select(`SELECT COUNT(*)::text AS n FROM ${this.table}`, []);
        return Number(rows[0]?.n ?? 0);
    }
}
/* ─── non-repo member repositories (events, stats, mappings) ─ */
const memberRepos = (db) => ({
    events: {
        upsert: async (e) => {
            await db.run(`INSERT INTO match_events (id, match_id, type, minute, additional_minute, team_id, player_id,
           secondary_player_id, description, provider, provider_event_id, received_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET
           minute = EXCLUDED.minute, additional_minute = EXCLUDED.additional_minute,
           team_id = EXCLUDED.team_id, player_id = EXCLUDED.player_id,
           secondary_player_id = EXCLUDED.secondary_player_id, description = EXCLUDED.description,
           provider = EXCLUDED.provider, received_at = EXCLUDED.received_at`, [e.id, e.matchId, e.type, e.minute, e.additionalMinute, e.teamId, e.playerId, e.secondaryPlayerId, e.description, e.provider, e.providerEventId, e.receivedAt]);
        },
        forMatch: async (matchId) => {
            const rows = await db.select(`SELECT * FROM match_events WHERE match_id = $1 ORDER BY minute NULLS FIRST`, [matchId]);
            return rows.map(exports.toEvent);
        },
    },
    stats: {
        upsert: async (s) => {
            await db.run(`INSERT INTO match_stats (id, match_id, team_id, type, value, period, provider, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (match_id, team_id, type, period) DO UPDATE SET
           value = EXCLUDED.value, provider = EXCLUDED.provider, updated_at = EXCLUDED.updated_at`, [s.id, s.matchId, s.teamId, s.type, String(s.value), s.period, s.provider, s.updatedAt]);
        },
        forMatch: async (matchId) => {
            const rows = await db.select(`SELECT * FROM match_stats WHERE match_id = $1`, [matchId]);
            return rows.map(exports.toStat);
        },
    },
    mappings: {
        find: async (entityType, provider, providerId) => {
            const rows = await db.select(`SELECT * FROM provider_entity_map WHERE entity_type = $1 AND provider = $2 AND provider_id = $3 LIMIT 1`, [entityType, provider, providerId]);
            return rows[0] ? (0, exports.toMapping)(rows[0]) : null;
        },
        forEntity: async (entityType, canonicalId) => {
            const rows = await db.select(`SELECT * FROM provider_entity_map WHERE entity_type = $1 AND canonical_id = $2`, [entityType, canonicalId]);
            return rows.map(exports.toMapping);
        },
        put: async (m) => {
            const rows = await db.select(`INSERT INTO provider_entity_map (entity_type, canonical_id, provider, provider_id, confidence, verified, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (entity_type, provider, provider_id) DO UPDATE SET
           canonical_id = EXCLUDED.canonical_id, confidence = EXCLUDED.confidence,
           verified = EXCLUDED.verified, notes = EXCLUDED.notes, updated_at = now()
         RETURNING *`, [m.entityType, m.canonicalId, m.provider, m.providerId, m.confidence, m.verified, m.notes]);
            return (0, exports.toMapping)(rows[0]);
        },
        verify: async (id, verified) => {
            await db.run(`UPDATE provider_entity_map SET verified = $2, updated_at = now() WHERE id = $1`, [id, verified]);
        },
        pending: async (limit = 50) => {
            const rows = await db.select(`SELECT * FROM provider_entity_map WHERE NOT verified ORDER BY updated_at DESC LIMIT $1`, [limit]);
            return rows.map(exports.toMapping);
        },
        all: async () => {
            const rows = await db.select(`SELECT * FROM provider_entity_map ORDER BY updated_at DESC`, []);
            return rows.map(exports.toMapping);
        },
    },
});
exports.memberRepos = memberRepos;
/* ─── the store ────────────────────────────────────────────── */
class PgCanonicalStore {
    db;
    sports;
    countries;
    competitions;
    seasons;
    venues;
    teams;
    players;
    matches;
    standings;
    topScorers;
    events;
    stats;
    mappings;
    constructor(db) {
        this.db = db;
        this.sports = new PgRepo(db, "sports", [
            f("id", (e) => e.id),
            f("slug", (e) => e.slug),
            f("name_ar", (e) => e.name.ar),
            f("name_en", (e) => e.name.en),
            f("short_name_ar", (e) => e.shortName.ar),
            f("short_name_en", (e) => e.shortName.en),
            f("icon", (e) => e.icon),
            f("is_active", (e) => e.isActive),
            f("display_order", (e) => e.displayOrder),
            f("config", (e) => e.config, exports.stringify),
        ], exports.toSport);
        this.countries = new PgRepo(db, "countries", [
            f("id", (e) => e.id),
            f("iso2", (e) => e.iso2),
            f("iso3", (e) => e.iso3),
            f("name_ar", (e) => e.name.ar),
            f("name_en", (e) => e.name.en),
            f("continent", (e) => e.continent),
            f("flag_url", (e) => e.flagUrl),
        ], exports.toCountry);
        this.competitions = new PgRepo(db, "competitions", [
            f("id", (e) => e.id),
            f("sport_id", (e) => e.sportId),
            f("country_id", (e) => e.countryId),
            f("name_ar", (e) => e.name.ar),
            f("name_en", (e) => e.name.en),
            f("short_name_ar", (e) => e.shortName.ar),
            f("short_name_en", (e) => e.shortName.en),
            f("slug", (e) => e.slug),
            f("logo_url", (e) => e.logoUrl),
            f("type", (e) => e.type),
            f("gender", (e) => e.gender),
            f("age_category", (e) => e.ageCategory),
            f("is_active", (e) => e.isActive),
            f("is_featured", (e) => e.isFeatured),
            f("display_order", (e) => e.displayOrder),
            f("current_season_id", (e) => e.currentSeasonId),
        ], exports.toCompetition);
        this.seasons = new PgRepo(db, "seasons", [
            f("id", (e) => e.id),
            f("competition_id", (e) => e.competitionId),
            f("name", (e) => e.name),
            f("slug", (e) => e.slug),
            f("start_date", (e) => e.startDate),
            f("end_date", (e) => e.endDate),
            f("is_current", (e) => e.isCurrent),
            f("status", (e) => e.status),
        ], exports.toSeason);
        this.venues = new PgRepo(db, "venues", [
            f("id", (e) => e.id),
            f("name_ar", (e) => e.name.ar),
            f("name_en", (e) => e.name.en),
            f("city_ar", (e) => e.city?.ar ?? null),
            f("city_en", (e) => e.city?.en ?? null),
            f("country_id", (e) => e.countryId),
            f("capacity", (e) => e.capacity),
            f("surface", (e) => e.surface),
            f("lat", (e) => e.lat),
            f("lng", (e) => e.lng),
            f("image_url", (e) => e.imageUrl),
        ], exports.toVenue);
        this.teams = new PgRepo(db, "teams", [
            f("id", (e) => e.id),
            f("sport_id", (e) => e.sportId),
            f("country_id", (e) => e.countryId),
            f("name_ar", (e) => e.name.ar),
            f("name_en", (e) => e.name.en),
            f("short_name_ar", (e) => e.shortName.ar),
            f("short_name_en", (e) => e.shortName.en),
            f("abbreviation", (e) => e.abbreviation),
            f("slug", (e) => e.slug),
            f("logo_url", (e) => e.logoUrl),
            f("founded_year", (e) => e.foundedYear),
            f("venue_id", (e) => e.venueId),
            f("primary_color", (e) => e.primaryColor),
            f("secondary_color", (e) => e.secondaryColor),
            f("is_national", (e) => e.isNationalTeam),
            f("type", (e) => e.type),
            f("is_active", (e) => e.isActive),
            f("social", (e) => e.social, exports.stringify),
        ], exports.toTeam);
        this.players = new PgRepo(db, "players", [
            f("id", (e) => e.id),
            f("sport_id", (e) => e.sportId),
            f("current_team_id", (e) => e.currentTeamId),
            f("country_id", (e) => e.countryId),
            f("full_name_ar", (e) => e.fullName.ar),
            f("full_name_en", (e) => e.fullName.en),
            f("slug", (e) => e.slug),
            f("date_of_birth", (e) => e.dateOfBirth),
            f("position", (e) => e.position),
            f("jersey_number", (e) => e.jerseyNumber),
            f("photo_url", (e) => e.photoUrl),
            f("photo_attribution", (e) => e.photoAttribution),
            f("height_cm", (e) => e.heightCm),
            f("weight_kg", (e) => e.weightKg),
            f("foot_preference", (e) => e.footPreference),
            f("career_started_year", (e) => e.careerStartedYear),
            f("is_active", (e) => e.isActive),
            f("biography_ar", (e) => e.biography?.ar ?? null),
            f("biography_en", (e) => e.biography?.en ?? null),
        ], exports.toPlayer);
        this.matches = new PgRepo(db, "matches", [
            f("id", (e) => e.id),
            f("sport_id", (e) => e.sportId),
            f("competition_id", (e) => e.competitionId),
            f("season_id", (e) => e.seasonId),
            f("round", (e) => e.round),
            f("home_team_id", (e) => e.homeTeamId),
            f("away_team_id", (e) => e.awayTeamId),
            f("venue_id", (e) => e.venueId),
            f("scheduled_at", (e) => e.scheduledAt, exports.fromDate),
            f("status", (e) => e.status),
            f("home_score", (e) => e.homeScore),
            f("away_score", (e) => e.awayScore),
            f("periods", (e) => e.periods, exports.stringify),
            f("aggregate_home", (e) => e.aggregateScore?.home ?? null),
            f("aggregate_away", (e) => e.aggregateScore?.away ?? null),
            f("winner", (e) => e.winner),
            f("leg", (e) => e.leg),
            f("neutral_venue", (e) => e.neutralVenue),
            f("referee_name", (e) => e.referee?.name ?? null),
            f("referee_country", (e) => e.referee?.country ?? null),
            f("attendance", (e) => e.attendance),
            f("is_featured", (e) => e.isFeatured),
            f("extension", (e) => e.extension, exports.stringify),
        ], exports.toMatch);
        this.standings = new PgRepo(db, "standings", [
            f("id", (e) => e.id),
            f("competition_id", (e) => e.competitionId),
            f("season_id", (e) => e.seasonId),
            f("group_name", (e) => e.group),
            f("team_id", (e) => e.teamId),
            f("position", (e) => e.position),
            f("played", (e) => e.played),
            f("won", (e) => e.won),
            f("drawn", (e) => e.drawn),
            f("lost", (e) => e.lost),
            f("goals_for", (e) => e.goalsFor),
            f("goals_against", (e) => e.goalsAgainst),
            f("points", (e) => e.points),
            f("form", (e) => e.form, exports.formToText),
            f("status", (e) => e.status),
            f("provider", (e) => e.provider),
            f("updated_at", (e) => e.updatedAt, exports.fromDate),
        ], exports.toStanding);
        this.topScorers = new PgRepo(db, "top_scorers", [
            f("id", (e) => e.id),
            f("competition_id", (e) => e.competitionId),
            f("season_id", (e) => e.seasonId),
            f("player_id", (e) => e.playerId),
            f("team_id", (e) => e.teamId),
            f("goals", (e) => e.goals),
            f("appearances", (e) => e.appearances),
            f("penalties", (e) => e.penalties),
            f("updated_at", (e) => e.updatedAt, exports.fromDate),
        ], exports.toTopScorer);
        const members = (0, exports.memberRepos)(db);
        this.events = members.events;
        this.stats = members.stats;
        this.mappings = members.mappings;
    }
    /** Run a unit of work (e.g. one match upsert) inside a single transaction. */
    withTransaction(fn) {
        return this.db.transaction(async (tx) => fn(new PgCanonicalStore(tx)));
    }
}
exports.PgCanonicalStore = PgCanonicalStore;
