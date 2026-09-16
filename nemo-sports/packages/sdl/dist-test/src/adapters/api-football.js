"use strict";
/**
 * SDL · API-Football (api-sports.io) adapter — v3, doc-verified.
 *
 * Base URL : https://v3.football.api-sports.io
 * Auth     : `x-apisports-key` (direct) or `x-rapidapi-key` + host header
 * Envelope : { get, parameters, errors, results, paging, response[] }
 * Notes    : free tier ≈100 requests/day → always last in the chain, and the
 *            daily quota is checked before any call (Instruction 9).
 *            `/fixtures?ids=` accepts a maximum of 20 ids per request.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiFootballAdapter = exports.AF_STATUS = void 0;
const base_1 = require("./base");
/** API-Football short status → NEMO canonical status. */
exports.AF_STATUS = {
    TBD: "scheduled",
    NS: "scheduled",
    "1H": "live",
    HT: "halftime",
    "2H": "live",
    ET: "extra_time",
    BT: "extra_time_halftime",
    P: "penalty_shootout",
    SUSP: "suspended",
    INT: "suspended",
    FT: "finished",
    AET: "finished",
    PEN: "finished",
    PST: "postponed",
    CANC: "cancelled",
    ABD: "abandoned",
    AWD: "awarded",
    WO: "walkover",
};
class ApiFootballAdapter extends (0, base_1.withDefaults)("api_football") {
    capabilities = [
        "fixtures",
        "live_matches",
        "match_detail",
        "match_events",
        "match_stats",
        "match_lineups",
        "team",
        "player",
        "player_stats",
        "competition",
        "standings",
        "top_scorers",
        "venue",
        "health",
    ];
    supportedSports = ["football"];
    apiKey;
    host;
    constructor(cfg = {}) {
        super(cfg);
        this.apiKey = cfg.apiKey ?? process.env.API_FOOTBALL_KEY ?? null;
        this.host = cfg.host ?? null;
    }
    /** @internal */ baseUrl() {
        return "https://v3.football.api-sports.io";
    }
    /** @internal */ auth() {
        const headers = {};
        if (this.host) {
            // RapidAPI surface
            headers["x-rapidapi-key"] = this.apiKey ?? "";
            headers["x-rapidapi-host"] = this.host;
        }
        else {
            headers["x-apisports-key"] = this.apiKey ?? "";
        }
        return { headers };
    }
    /** Envelope check: API-Football returns HTTP 200 even for quota/auth errors. */
    unwrap(res) {
        if (!res.ok)
            return res;
        const errors = res.data.errors;
        const errList = Array.isArray(errors) ? errors : errors ? Object.values(errors) : [];
        const fatal = errList.filter((e) => e && String(e).length);
        if (fatal.length) {
            const msg = fatal.join("; ");
            const code = /quota|limit/i.test(msg) ? "rate_limited" : /key|token|auth/i.test(msg) ? "auth" : "bad_response";
            return { ok: false, provider: this.name, requestKey: res.requestKey, fromCache: false, error: { code, message: `api-football: ${msg}` } };
        }
        return { ok: true, data: res.data.response ?? [], provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
    }
    fixture(f) {
        const minute = f.fixture.status.elapsed ?? null;
        return {
            providerId: String(f.fixture.id),
            sport: "football",
            competitionProviderId: String(f.league.id),
            seasonProviderId: f.league.season ? String(f.league.season) : null,
            round: (0, base_1.str)(f.league.round),
            homeProviderId: f.teams.home?.id != null ? String(f.teams.home.id) : null,
            awayProviderId: f.teams.away?.id != null ? String(f.teams.away.id) : null,
            scheduledAt: (0, base_1.toIso)(f.fixture.date) ?? new Date(f.fixture.timestamp * 1000).toISOString(),
            status: exports.AF_STATUS[f.fixture.status.short] ?? "scheduled",
            homeScore: f.goals.home ?? null,
            awayScore: f.goals.away ?? null,
            periods: [
                { label: "HT", home: f.score.halftime.home, away: f.score.halftime.away },
                { label: "FT", home: f.score.fulltime.home, away: f.score.fulltime.away },
                { label: "ET", home: f.score.extratime.home, away: f.score.extratime.away },
                { label: "PEN", home: f.score.penalty.home, away: f.score.penalty.away },
            ].filter((p) => p.home !== null || p.away !== null),
            venueProviderId: f.fixture.venue?.id != null ? String(f.fixture.venue.id) : null,
            venueName: (0, base_1.str)(f.fixture.venue?.name),
            attendance: null,
            minute,
        };
    }
    async getFixtures(input) {
        if (input.sport !== "football") {
            return { ok: false, provider: this.name, requestKey: this.key("fixtures", input), fromCache: false, error: { code: "not_supported", message: "api-football is football-only" } };
        }
        const params = {};
        if (input.date)
            params.date = input.date;
        if (input.range) {
            params.from = input.range.from.slice(0, 10);
            params.to = input.range.to.slice(0, 10);
        }
        if (input.competitionProviderId) {
            params.league = input.competitionProviderId;
            if (!input.range && !input.date)
                params.season = new Date().getFullYear();
        }
        const res = await this.getJson("fixtures", params);
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        return { ok: true, data: list.data.map((f) => this.fixture(f)), provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
    }
    async getLiveMatches(input) {
        if (input.sport !== "football") {
            return { ok: false, provider: this.name, requestKey: this.key("fixtures", { live: "all" }), fromCache: false, error: { code: "not_supported", message: "api-football is football-only" } };
        }
        const res = await this.getJson("fixtures", { live: "all" });
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        return { ok: true, data: list.data.map((f) => this.fixture(f)), provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
    }
    async getMatchDetail(input) {
        const res = await this.getJson("fixtures", { id: input.providerMatchId });
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        if (!list.data.length)
            return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `fixture ${input.providerMatchId} not found` } };
        return { ok: true, data: this.fixture(list.data[0]), provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
    }
    async getMatchEvents(input) {
        const res = await this.getJson("fixtures/events", { fixture: input.providerMatchId });
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        const data = list.data.map((e) => {
            const m = (0, base_1.parseMinute)(e.time?.elapsed != null && e.time.extra != null ? `${e.time.elapsed}+${e.time.extra}` : e.time?.elapsed);
            const detail = (e.detail ?? "").toLowerCase();
            return {
                providerEventId: `${e.team.id}-${e.time.elapsed}-${e.detail}-${e.player?.id ?? ""}`,
                providerMatchId: input.providerMatchId,
                type: mapEventType(e.type, detail),
                minute: m.minute,
                additionalMinute: m.additional,
                teamProviderId: e.team?.id != null ? String(e.team.id) : null,
                playerProviderId: e.player?.id != null ? String(e.player.id) : null,
                secondaryPlayerProviderId: e.assist?.id != null ? String(e.assist.id) : null,
                description: (0, base_1.str)(e.comments) ?? (0, base_1.str)(e.detail),
            };
        });
        return { ok: true, data, provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
    }
    async getMatchStats(input) {
        const res = await this.getJson("fixtures/statistics", { fixture: input.providerMatchId });
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        const out = [];
        for (const block of list.data) {
            for (const s of block.statistics) {
                out.push({
                    teamProviderId: String(block.team.id),
                    type: s.type.toLowerCase().replace(/\s+/g, "_"),
                    value: s.value === null ? 0 : s.value,
                    period: "total",
                });
            }
        }
        return { ok: true, data: out, provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
    }
    async getTeam(input) {
        const res = await this.getJson("teams", { id: input.providerTeamId });
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        const t = list.data[0];
        if (!t)
            return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `team ${input.providerTeamId} not found` } };
        return {
            ok: true,
            data: {
                providerId: String(t.team.id),
                name: t.team.name,
                shortName: null,
                abbreviation: (0, base_1.str)(t.team.code),
                countryCode: null,
                countryName: (0, base_1.str)(t.team.country),
                logoUrl: (0, base_1.str)(t.team.logo),
                foundedYear: (0, base_1.toInt)(t.team.founded),
                venueName: (0, base_1.str)(t.venue?.name),
                primaryColor: null,
                secondaryColor: null,
                isNationalTeam: !!t.team.national,
            },
            provider: this.name,
            fetchedAt: list.fetchedAt,
            requestKey: list.requestKey,
            fromCache: false,
        };
    }
    async getPlayer(input) {
        const res = await this.getJson("players", { id: input.providerPlayerId });
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        const p = list.data[0];
        if (!p)
            return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `player ${input.providerPlayerId} not found` } };
        const heightCm = p.player.height ? (0, base_1.toInt)(parseFloat(p.player.height)) : null;
        const weightKg = p.player.weight ? (0, base_1.toInt)(parseFloat(p.player.weight)) : null;
        return {
            ok: true,
            data: {
                providerId: String(p.player.id),
                fullName: p.player.name,
                dateOfBirth: (0, base_1.toIso)(p.player.birth?.date),
                countryCode: null,
                position: (0, base_1.str)(p.statistics?.[0]?.games?.[0]?.position),
                photoUrl: (0, base_1.str)(p.player.photo),
                photoAttribution: (0, base_1.str)(p.player.photo) ? "API-Football (api-sports.io)" : null,
                heightCm,
                weightKg,
                footPreference: null,
                teamProviderId: p.statistics?.[0]?.team?.id != null ? String(p.statistics[0].team.id) : null,
            },
            provider: this.name,
            fetchedAt: list.fetchedAt,
            requestKey: list.requestKey,
            fromCache: false,
        };
    }
    async getPlayerStats(input) {
        const params = { id: input.providerPlayerId };
        if (input.season)
            params.season = input.season;
        const res = await this.getJson("players", params);
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        const st = list.data[0]?.statistics?.[0];
        if (!st)
            return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `no stats for player ${input.providerPlayerId}` } };
        return {
            ok: true,
            data: {
                providerId: input.providerPlayerId,
                seasonName: st.league?.season ? String(st.league.season) : null,
                appearances: (0, base_1.toInt)(st.games?.appearences),
                goals: (0, base_1.toInt)(st.goals?.total),
                assists: null,
                minutes: (0, base_1.toInt)(st.games?.minutes),
                yellowCards: (0, base_1.toInt)(st.cards?.yellow),
                redCards: (0, base_1.toInt)(st.cards?.red),
                rating: st.games?.rating ? Number(st.games.rating) : null,
                extra: { penalties: (0, base_1.toInt)(st.goals?.penalty) ?? 0, position: st.games?.position ?? "" },
            },
            provider: this.name,
            fetchedAt: list.fetchedAt,
            requestKey: list.requestKey,
            fromCache: false,
        };
    }
    async getCompetition(input) {
        const res = await this.getJson("leagues", { id: input.providerCompetitionId });
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        const l = list.data[0];
        if (!l)
            return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `league ${input.providerCompetitionId} not found` } };
        return {
            ok: true,
            data: {
                providerId: String(l.league.id),
                name: l.league.name,
                shortName: null,
                countryCode: (0, base_1.str)(l.country?.code),
                countryName: (0, base_1.str)(l.country?.name),
                type: (0, base_1.str)(l.league.type)?.toLowerCase() ?? null,
                logoUrl: (0, base_1.str)(l.league.logo),
            },
            provider: this.name,
            fetchedAt: list.fetchedAt,
            requestKey: list.requestKey,
            fromCache: false,
        };
    }
    async getStandings(input) {
        const params = { league: input.providerCompetitionId, season: input.season ?? new Date().getFullYear() };
        const res = await this.getJson("standings", params);
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        const groups = list.data[0]?.league?.standings ?? [];
        const out = [];
        for (const group of groups) {
            for (const row of group) {
                out.push({
                    teamProviderId: String(row.team.id),
                    group: (0, base_1.str)(row.group),
                    position: row.rank,
                    played: row.all.played,
                    won: row.all.win,
                    drawn: row.all.draw,
                    lost: row.all.lose,
                    goalsFor: row.all.goals.for,
                    goalsAgainst: row.all.goals.against,
                    points: row.points,
                    form: parseForm(row.form),
                    status: mapStandingStatus(row.description),
                });
            }
        }
        return { ok: true, data: out, provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
    }
    async getTopScorers(input) {
        const params = { league: input.providerCompetitionId, season: input.season ?? new Date().getFullYear() };
        const res = await this.getJson("players/topscorers", params);
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        const out = list.data.map((row) => {
            const st = row.statistics?.[0];
            return {
                playerProviderId: String(row.player.id),
                teamProviderId: st?.team?.id != null ? String(st.team.id) : null,
                goals: (0, base_1.toInt)(st?.goals?.total) ?? 0,
                appearances: (0, base_1.toInt)(st?.games?.appearences),
                penalties: (0, base_1.toInt)(st?.goals?.penalty),
            };
        });
        return { ok: true, data: out, provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
    }
    async getVenue(input) {
        const res = await this.getJson("venues", { id: input.providerVenueId });
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        const v = list.data[0];
        if (!v)
            return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `venue ${input.providerVenueId} not found` } };
        return {
            ok: true,
            data: { providerId: String(v.id), name: v.name, city: (0, base_1.str)(v.city), countryCode: null, capacity: (0, base_1.toInt)(v.capacity), lat: null, lng: null },
            provider: this.name,
            fetchedAt: list.fetchedAt,
            requestKey: list.requestKey,
            fromCache: false,
        };
    }
    /** `/status` doubles as the health check and returns the remaining quota. */
    async healthCheck() {
        const startedAt = Date.now();
        const res = await this.getJson("status", {});
        const at = new Date().toISOString();
        const key = this.key("status", {});
        if (!res.ok) {
            return {
                ok: true,
                data: { provider: this.name, reachable: false, checkedAt: at, latencyMs: Date.now() - startedAt, quotaRemaining: null, detail: res.error.message },
                provider: this.name,
                fetchedAt: at,
                requestKey: key,
                fromCache: false,
            };
        }
        return {
            ok: true,
            data: { provider: this.name, reachable: true, checkedAt: at, latencyMs: Date.now() - startedAt, quotaRemaining: null, detail: `status ok, results=${res.data.results ?? 0}` },
            provider: this.name,
            fetchedAt: at,
            requestKey: key,
            fromCache: false,
        };
    }
}
exports.ApiFootballAdapter = ApiFootballAdapter;
function mapEventType(type, detail) {
    if (type === "Goal")
        return detail.includes("own") ? "own_goal" : "goal";
    if (type === "Card") {
        if (detail.includes("red") && detail.includes("yellow"))
            return "yellow_red_card";
        return detail.includes("red") ? "red_card" : "yellow_card";
    }
    if (type === "subst")
        return "substitution";
    if (type === "Var")
        return detail.includes("cancelled") || detail.includes("goal cancelled") ? "var_decision" : "var_review";
    return detail.toLowerCase().replace(/\s+/g, "_") || "unknown";
}
function parseForm(form) {
    if (!form)
        return [];
    return form
        .split("")
        .filter((c) => c === "W" || c === "D" || c === "L")
        .slice(-5);
}
function mapStandingStatus(description) {
    if (!description)
        return null;
    const d = description.toLowerCase();
    if (d.includes("champions league") || d.includes("promotion"))
        return d.includes("playoff") ? "promotion_playoff" : "promotion";
    if (d.includes("relegation"))
        return d.includes("playoff") ? "relegation_playoff" : "relegation";
    if (d.includes("europa") || d.includes("conference") || d.includes("cup"))
        return "cup_position";
    return null;
}
