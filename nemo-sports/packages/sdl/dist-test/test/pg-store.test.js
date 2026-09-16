"use strict";
/**
 * PgCanonicalStore - verified against the real `db/schema.sql`.
 *
 * There is no PostgreSQL in CI, so instead of mocking blindly this test does
 * two things a mock cannot:
 *
 *  1. parses `db/schema.sql` and asserts every column the store writes
 *     actually exists in that table - a renamed or dropped column fails here
 *     rather than silently writing NULL in production;
 *  2. runs the store against a recording fake `SqlClient` that implements the
 *     exact statements the store emits (INSERT ... ON CONFLICT, SELECT * FROM,
 *     COUNT, INSERT ... RETURNING) and fails loudly with the SQL text on
 *     anything else.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_test_1 = require("node:test");
const pg_store_1 = require("../src/pg-store");
const store_1 = require("../src/store");
/* ─── schema.sql introspection ─────────────────────────────── */
/**
 * Resolved from the compiled location (`packages/sdl/dist-test/test`) and from
 * the source location (`packages/sdl/test`), so the test finds the real schema
 * either way instead of depending on the process cwd.
 */
function findSchema() {
    const candidates = [
        (0, node_path_1.join)(__dirname, "..", "..", "..", "..", "db", "schema.sql"),
        (0, node_path_1.join)(__dirname, "..", "..", "..", "db", "schema.sql"),
    ];
    for (const c of candidates)
        if ((0, node_fs_1.existsSync)(c))
            return c;
    throw new Error(`db/schema.sql not found; looked in ${candidates.join(" and ")}`);
}
function parseSchema(sql) {
    const tables = new Map();
    const createRe = /CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z_]+)\s*\(([\s\S]*?)\n\);/gi;
    for (const m of sql.matchAll(createRe)) {
        const cols = new Set();
        for (const line of m[2].split("\n")) {
            const col = /^\s{2,}([a-z_][a-z0-9_]*)\s+(TEXT|UUID|CHAR|CHARACTER|VARCHAR|INT|INTEGER|BIGINT|SMALLINT|BOOLEAN|TIMESTAMPTZ|JSONB|NUMERIC|SERIAL|DATE)/i.exec(line);
            if (col)
                cols.add(col[1]);
        }
        tables.set(m[1], cols);
    }
    return tables;
}
const SCHEMA = parseSchema((0, node_fs_1.readFileSync)(findSchema(), "utf8"));
function columnsOf(table) {
    const cols = SCHEMA.get(table);
    strict_1.default.ok(cols, `db/schema.sql has no CREATE TABLE ${table}`);
    return cols;
}
class FakeSql {
    rows = new Map();
    recorded = [];
    log(sql, params) {
        this.recorded.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
    }
    async select(sql, params) {
        this.log(sql, params);
        const flat = sql.replace(/\s+/g, " ");
        if (flat.startsWith("SELECT COUNT(*)::text AS n FROM ")) {
            const table = /FROM ([a-z_]+)/.exec(flat)[1];
            return [{ n: String([...this.rows.keys()].filter((k) => k.startsWith(`${table}:`)).length) }];
        }
        if (flat.includes("INSERT INTO provider_entity_map")) {
            const [entityType, canonical, provider, providerId, confidence, verified, notes] = params;
            const id = `map_${entityType}_${provider}_${providerId}`;
            const row = {
                id,
                entity_type: entityType,
                canonical_id: canonical,
                provider,
                provider_id: providerId,
                confidence,
                verified,
                notes,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            this.rows.set(`provider_entity_map:${id}`, row);
            return [row];
        }
        if (flat.startsWith("SELECT * FROM provider_entity_map WHERE NOT verified")) {
            return [...this.rows.values()].filter((r) => r.verified === false);
        }
        if (flat.startsWith("SELECT * FROM provider_entity_map WHERE entity_type = $1 AND provider = $2")) {
            return [...this.rows.values()].filter((r) => r.entity_type === params[0] && r.provider === params[1] && r.provider_id === params[2]);
        }
        if (flat.startsWith("SELECT * FROM provider_entity_map")) {
            return [...this.rows.values()];
        }
        if (flat.startsWith("SELECT * FROM match_events WHERE match_id = $1")) {
            return [...this.rows.values()].filter((r) => r.__table === "match_events" && r.match_id === params[0]);
        }
        if (flat.startsWith("SELECT * FROM match_stats WHERE match_id = $1")) {
            return [...this.rows.values()].filter((r) => r.__table === "match_stats" && r.match_id === params[0]);
        }
        const select = /^SELECT \* FROM ([a-z_]+)(?: WHERE ([a-z_]+) = \$1)?/.exec(flat);
        if (select) {
            const [, table, whereCol] = select;
            return [...this.rows.values()].filter((r) => r.__table === table && (!whereCol || r[whereCol] === params[0]));
        }
        throw new Error(`FakeSql.select: unhandled statement -> ${flat}`);
    }
    async run(sql, params) {
        this.log(sql, params);
        const flat = sql.replace(/\s+/g, " ");
        const insert = /^INSERT INTO ([a-z_]+) \(([^)]+)\) VALUES \(([^)]+)\)/.exec(flat);
        const update = /^UPDATE ([a-z_]+) SET (.*?) WHERE id = \$1/.exec(flat);
        if (update) {
            const [, table, sets] = update;
            const id = params[0];
            const row = this.rows.get(`${table}:${id}`);
            if (!row)
                throw new Error(`FakeSql.run: UPDATE ${table} for missing id ${id}`);
            for (const assign of sets.split(",")) {
                const [col, value] = assign.split("=").map((x) => x.trim());
                row[col] = /^\$\d+$/.test(value) ? params[Number(value.slice(1)) - 1] : value.replace(/^now\(\)$/, new Date().toISOString());
            }
            return;
        }
        if (!insert)
            throw new Error(`FakeSql.run: unhandled statement -> ${flat}`);
        const [, table, colsRaw, valuesRaw] = insert;
        const cols = colsRaw.split(",").map((c) => c.trim());
        const placeholders = valuesRaw.split(",").map((v) => v.trim());
        strict_1.default.equal(cols.length, placeholders.length, `${table}: column/placeholder count mismatch`);
        strict_1.default.equal(cols.length, params.length, `${table}: expected ${cols.length} params, got ${params.length}`);
        const row = { __table: table };
        cols.forEach((c, i) => {
            row[c] = params[i];
        });
        if (!("id" in row))
            throw new Error(`${table}: upsert without an id column`);
        this.rows.set(`${table}:${row.id}`, row);
    }
    async transaction(fn) {
        return fn(this);
    }
}
/* ─── entities used by the tests ───────────────────────────── */
const sport = {
    id: (0, store_1.canonicalId)("sport", "football"),
    slug: "football",
    name: { ar: "كرة القدم", en: "Football" },
    shortName: { ar: "قدم", en: "Football" },
    icon: "football",
    isActive: true,
    displayOrder: 1,
    config: {},
};
const team = {
    id: (0, store_1.canonicalId)("team", "ahly"),
    sportId: sport.id,
    countryId: null,
    name: { ar: "الأهلي", en: "Al Ahly" },
    shortName: { ar: "الأهلي", en: "Ahly" },
    abbreviation: "AHL",
    slug: "al-ahly",
    logoUrl: null,
    foundedYear: 1907,
    venueId: null,
    primaryColor: "#c8102e",
    secondaryColor: null,
    isNationalTeam: false,
    type: "club",
    isActive: true,
    social: { x: "https://x.com/AlAhly" },
};
const match = {
    id: (0, store_1.canonicalId)("match", "ahly-zamalek"),
    sportId: sport.id,
    competitionId: (0, store_1.canonicalId)("competition", "epl"),
    seasonId: null,
    round: "الجولة 12",
    homeTeamId: team.id,
    awayTeamId: (0, store_1.canonicalId)("team", "zamalek"),
    venueId: null,
    scheduledAt: "2026-02-14T19:00:00.000Z",
    status: "live",
    homeScore: 2,
    awayScore: 1,
    periods: [{ label: "الشوط الأول", home: 1, away: 0 }],
    aggregateScore: null,
    winner: null,
    leg: null,
    neutralVenue: false,
    referee: { name: "محمد معروف", country: "EG" },
    attendance: 30000,
    isFeatured: true,
    extension: { competitionStage: "league" },
};
const standing = {
    id: (0, store_1.canonicalId)("standing", "ahly"),
    competitionId: match.competitionId,
    seasonId: (0, store_1.canonicalId)("season", "epl-2026"),
    group: null,
    teamId: team.id,
    position: 1,
    played: 11,
    won: 8,
    drawn: 2,
    lost: 1,
    goalsFor: 24,
    goalsAgainst: 9,
    goalDifference: 15,
    points: 26,
    form: ["W", "W", "D", "L", "W"],
    status: "champion",
    provider: "sportmonks",
    updatedAt: "2026-02-14T19:00:00.000Z",
};
/* ─── tests ────────────────────────────────────────────────── */
(0, node_test_1.describe)("schema.sql covers every column the store writes", () => {
    const cases = [
        ["sports", ["id", "slug", "name_ar", "name_en", "short_name_ar", "short_name_en", "icon", "is_active", "display_order", "config"]],
        ["countries", ["id", "iso2", "iso3", "name_ar", "name_en", "continent", "flag_url"]],
        [
            "competitions",
            ["id", "sport_id", "country_id", "name_ar", "name_en", "short_name_ar", "short_name_en", "slug", "logo_url", "type", "gender", "age_category", "is_active", "is_featured", "display_order", "current_season_id"],
        ],
        ["seasons", ["id", "competition_id", "name", "slug", "start_date", "end_date", "is_current", "status"]],
        ["venues", ["id", "name_ar", "name_en", "city_ar", "city_en", "country_id", "capacity", "surface", "lat", "lng", "image_url"]],
        [
            "teams",
            ["id", "sport_id", "country_id", "name_ar", "name_en", "short_name_ar", "short_name_en", "abbreviation", "slug", "logo_url", "founded_year", "venue_id", "primary_color", "secondary_color", "is_national", "type", "is_active", "social"],
        ],
        [
            "players",
            ["id", "sport_id", "current_team_id", "country_id", "full_name_ar", "full_name_en", "slug", "date_of_birth", "position", "jersey_number", "photo_url", "photo_attribution", "height_cm", "weight_kg", "foot_preference", "career_started_year", "is_active", "biography_ar", "biography_en"],
        ],
        [
            "matches",
            ["id", "sport_id", "competition_id", "season_id", "round", "home_team_id", "away_team_id", "venue_id", "scheduled_at", "status", "home_score", "away_score", "periods", "aggregate_home", "aggregate_away", "winner", "leg", "neutral_venue", "referee_name", "referee_country", "attendance", "is_featured", "extension"],
        ],
        [
            "standings",
            ["id", "competition_id", "season_id", "group_name", "team_id", "position", "played", "won", "drawn", "lost", "goals_for", "goals_against", "points", "form", "status", "provider", "updated_at"],
        ],
        ["top_scorers", ["id", "competition_id", "season_id", "player_id", "team_id", "goals", "appearances", "penalties", "updated_at"]],
        ["match_events", ["id", "match_id", "type", "minute", "additional_minute", "team_id", "player_id", "secondary_player_id", "description", "provider", "provider_event_id", "received_at"]],
        ["match_stats", ["id", "match_id", "team_id", "type", "value", "period", "provider", "updated_at"]],
        ["provider_entity_map", ["id", "entity_type", "canonical_id", "provider", "provider_id", "confidence", "verified", "notes"]],
    ];
    for (const [table, cols] of cases) {
        (0, node_test_1.it)(`${table}: every mapped column exists`, () => {
            const have = columnsOf(table);
            for (const c of cols)
                strict_1.default.ok(have.has(c), `${table}.${c} is mapped by pg-store but missing from db/schema.sql`);
        });
    }
});
(0, node_test_1.describe)("PgCanonicalStore", () => {
    (0, node_test_1.it)("upserts a sport with one parameter per column, then reads it back", async () => {
        const sql = new FakeSql();
        const store = new pg_store_1.PgCanonicalStore(sql);
        await store.sports.put(sport);
        const insert = sql.recorded.find((r) => r.sql.startsWith("INSERT INTO sports"));
        strict_1.default.ok(insert, "expected an INSERT INTO sports");
        strict_1.default.equal(insert.params.length, 10);
        strict_1.default.ok(insert.sql.includes("ON CONFLICT (id) DO UPDATE SET"));
        const back = await store.sports.get(sport.id);
        strict_1.default.equal(back?.name.ar, "كرة القدم");
        strict_1.default.equal(back?.slug, "football");
        strict_1.default.equal(back?.isActive, true);
        strict_1.default.equal(back?.displayOrder, 1);
    });
    (0, node_test_1.it)("round-trips a team including nested social JSON", async () => {
        const sql = new FakeSql();
        const store = new pg_store_1.PgCanonicalStore(sql);
        await store.teams.put(team);
        const row = sql.rows.get(`teams:${team.id}`);
        strict_1.default.equal(row.social, '{"x":"https://x.com/AlAhly"}'); // encoded as JSON text, not an object
        const back = await store.teams.get(team.id);
        strict_1.default.equal(back?.social.x, "https://x.com/AlAhly");
        strict_1.default.equal(back?.abbreviation, "AHL");
        strict_1.default.equal(back?.foundedYear, 1907);
        strict_1.default.equal(back?.isNationalTeam, false);
    });
    (0, node_test_1.it)("stores timestamps as ISO strings and periods as JSON", async () => {
        const sql = new FakeSql();
        const store = new pg_store_1.PgCanonicalStore(sql);
        await store.matches.put(match);
        const row = sql.rows.get(`matches:${match.id}`);
        strict_1.default.equal(row.scheduled_at, "2026-02-14T19:00:00.000Z");
        strict_1.default.equal(row.referee_name, "محمد معروف");
        strict_1.default.equal(row.aggregate_home, null);
        const back = await store.matches.get(match.id);
        strict_1.default.equal(back?.periods[0]?.home, 1);
        strict_1.default.equal(back?.status, "live");
        strict_1.default.equal(back?.extension.competitionStage, "league");
    });
    (0, node_test_1.it)("encodes form as a compact string and decodes it back", async () => {
        const sql = new FakeSql();
        const store = new pg_store_1.PgCanonicalStore(sql);
        await store.standings.put(standing);
        strict_1.default.equal(sql.rows.get(`standings:${standing.id}`).form, "WWDLW");
        const back = await store.standings.get(standing.id);
        strict_1.default.deepEqual(back?.form, ["W", "W", "D", "L", "W"]);
        strict_1.default.equal(back?.status, "champion");
    });
    (0, node_test_1.it)("counts rows with COUNT(*)::text", async () => {
        const sql = new FakeSql();
        const store = new pg_store_1.PgCanonicalStore(sql);
        await store.teams.put(team);
        await store.teams.put({ ...team, id: (0, store_1.canonicalId)("team", "zamalek"), slug: "zamalek" });
        strict_1.default.equal(await store.teams.count(), 2);
    });
    (0, node_test_1.it)("returns null for an unknown id instead of throwing", async () => {
        const store = new pg_store_1.PgCanonicalStore(new FakeSql());
        strict_1.default.equal(await store.players.get("nope"), null);
    });
    (0, node_test_1.it)("writes and reads match events", async () => {
        const sql = new FakeSql();
        const store = new pg_store_1.PgCanonicalStore(sql);
        await store.events.upsert({
            id: "ev_1",
            matchId: match.id,
            type: "goal",
            minute: 23,
            additionalMinute: null,
            teamId: team.id,
            playerId: (0, store_1.canonicalId)("player", "one"),
            secondaryPlayerId: null,
            description: "هدف أول",
            provider: "sportmonks",
            providerEventId: "sm_9",
            receivedAt: "2026-02-14T19:23:00.000Z",
        });
        const events = await store.events.forMatch(match.id);
        strict_1.default.equal(events.length, 1);
        strict_1.default.equal(events[0].type, "goal");
        strict_1.default.equal(events[0].minute, 23);
    });
    (0, node_test_1.it)("maps provider ids to canonical ids and lists pending review", async () => {
        const sql = new FakeSql();
        const store = new pg_store_1.PgCanonicalStore(sql);
        const written = await store.mappings.put({
            entityType: "team",
            canonicalId: team.id,
            provider: "sportmonks",
            providerId: "19",
            confidence: 0.62,
            verified: false,
            notes: "fuzzy match on short name",
        });
        strict_1.default.equal(written.canonicalId, team.id);
        const found = await store.mappings.find("team", "sportmonks", "19");
        strict_1.default.equal(found?.confidence, 0.62);
        strict_1.default.equal(found?.verified, false);
        const pending = await store.mappings.pending();
        strict_1.default.equal(pending.length, 1);
        await store.mappings.verify(written.id, true);
        strict_1.default.equal((await store.mappings.pending()).length, 0);
    });
    (0, node_test_1.it)("runs a unit of work through withTransaction", async () => {
        const sql = new FakeSql();
        const store = new pg_store_1.PgCanonicalStore(sql);
        const out = await store.withTransaction(async (tx) => {
            await tx.sports.put(sport);
            await tx.teams.put(team);
            return (await tx.sports.get(sport.id))?.slug ?? null;
        });
        strict_1.default.equal(out, "football");
        strict_1.default.ok(await store.teams.get(team.id));
    });
});
