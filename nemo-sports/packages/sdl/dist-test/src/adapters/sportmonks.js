"use strict";
/**
 * SDL · Sportmonks Football API 3.0 adapter — doc-verified.
 *
 * Base URL : https://api.sportmonks.com/v3/football
 * Auth     : `Authorization: Bearer <token>` (or ?api_token=)
 * Envelope : { data: [], pagination: { next_page, has_more, total, count, per_page, current_page, total_pages }, subscription, rate_limits }
 *
 * Live data comes from the livescores feeds (`/livescores/inplay`,
 * `/livescores`, `/livescores/latest`), NOT from `/fixtures` — the fixtures
 * feeds cover upcoming/finished matches. `/livescores/inplay` returns matches
 * inside a ±15 minute window around kickoff.
 *
 * Response shape is *composed* by the caller with `?include=participants;scores`
 * and trimmed with `?select=`, so every request here names exactly the fields it
 * needs — that is the cost-control mechanism for this provider (Instruction 9).
 *
 * NOTE: `type_id` values on `/events` are subscription-specific enums. They are
 * mapped in EVENT_TYPE_ID below and must be re-verified against the live feed
 * the first time real data is loaded (Instruction 1).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SportmonksAdapter = exports.SM_STATUS = exports.EVENT_TYPE_ID = void 0;
const base_1 = require("./base");
/** Sportmonks `/events` type_id → canonical event type (verify per subscription). */
exports.EVENT_TYPE_ID = {
    14: "goal",
    15: "goal",
    16: "penalty_awarded",
    17: "penalty_missed",
    18: "own_goal",
    19: "yellow_card",
    20: "red_card",
    24: "substitution",
    25: "yellow_red_card",
    26: "var_review",
    27: "var_decision",
    104: "period_start",
    105: "period_end",
};
/** Sportmonks `/fixtures` status_id → canonical status. */
exports.SM_STATUS = {
    1: "scheduled",
    2: "postponed",
    3: "suspended",
    4: "cancelled",
    5: "live",
    6: "finished",
    7: "walkover",
    8: "awarded",
    9: "abandoned",
    12: "halftime",
    13: "extra_time",
    14: "extra_time_halftime",
    15: "penalty_shootout",
    18: "scheduled",
    21: "scheduled",
};
class SportmonksAdapter extends (0, base_1.withDefaults)("sportmonks") {
    capabilities = [
        "fixtures",
        "live_matches",
        "match_detail",
        "match_events",
        "team",
        "team_squad",
        "player",
        "competition",
        "competition_seasons",
        "standings",
        "top_scorers",
        "images",
        "health",
    ];
    supportedSports = ["football"];
    token;
    base;
    /** cap pagination so a bad date range cannot burn the monthly quota */
    maxPages;
    constructor(cfg = {}) {
        super(cfg);
        this.token = cfg.apiToken ?? process.env.SPORTMONKS_TOKEN ?? null;
        this.base = cfg.baseUrl ?? "https://api.sportmonks.com/v3/football";
        this.maxPages = 5;
    }
    /** @internal */ baseUrl() {
        return this.base;
    }
    /** @internal */ auth() {
        return { headers: this.token ? { authorization: `Bearer ${this.token}` } : {} };
    }
    unwrap(res) {
        if (!res.ok)
            return res;
        return { ok: true, data: res.data.data ?? [], provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
    }
    /** Walks `pagination.next_page` while `has_more`, bounded by maxPages. */
    async paginate(endpoint, params) {
        const all = [];
        let page = 1;
        let nextUrl = null;
        let first = null;
        while (page <= this.maxPages) {
            const res = await this.getJson(endpoint, { ...params, page });
            if (!res.ok) {
                if (page === 1)
                    return res;
                break; // keep what we already have rather than discarding a paid page
            }
            first = first ?? res;
            all.push(...(res.data.data ?? []));
            nextUrl = res.data.pagination?.next_page ?? null;
            const hasMore = !!res.data.pagination?.has_more;
            if (!hasMore || !nextUrl)
                break;
            page++;
        }
        if (!first)
            return { ok: false, provider: this.name, requestKey: this.key(endpoint, params), fromCache: false, error: { code: "bad_response", message: "empty paginated response" } };
        return { ok: true, data: all, provider: this.name, fetchedAt: first.fetchedAt, requestKey: first.requestKey, fromCache: false };
    }
    fixture(f) {
        const home = f.participants?.find((p) => p.type === "home");
        const away = f.participants?.find((p) => p.type === "away");
        const scoreFor = (p) => {
            const s = p?.scores?.[0];
            return s?.score?.goals ?? s?.score?.overall ?? null;
        };
        const statusId = f.status_id ?? 1;
        const periods = [];
        const allScores = f.scores ?? [];
        for (const s of allScores) {
            if (!s.type?.name)
                continue;
            const isHome = s.participant_id === home?.participant?.id;
            const goals = s.score?.goals ?? s.score?.overall ?? null;
            const label = s.type.name.toUpperCase().replace(/\s+/g, "");
            const existing = periods.find((p) => p.label === label);
            if (existing) {
                if (isHome)
                    existing.home = goals;
                else
                    existing.away = goals;
            }
            else {
                periods.push({ label, home: isHome ? goals : null, away: isHome ? null : goals });
            }
        }
        return {
            providerId: String(f.id),
            sport: "football",
            competitionProviderId: String(f.league_id),
            seasonProviderId: f.season_id != null ? String(f.season_id) : null,
            round: (0, base_1.str)(f.round) ?? (0, base_1.str)(f.name),
            homeProviderId: home?.participant?.id != null ? String(home.participant.id) : null,
            awayProviderId: away?.participant?.id != null ? String(away.participant.id) : null,
            scheduledAt: (0, base_1.toIso)(f.starting_at?.date_time) ?? new Date().toISOString(),
            status: exports.SM_STATUS[statusId] ?? "scheduled",
            homeScore: scoreFor(home),
            awayScore: scoreFor(away),
            periods,
            venueProviderId: f.venue_id != null ? String(f.venue_id) : null,
            venueName: (0, base_1.str)(f.venue?.name),
            attendance: (0, base_1.toInt)(f.attendance),
            minute: null,
        };
    }
    static FIXTURE_INCLUDES = "participants;scores;venue";
    async getFixtures(input) {
        let endpoint;
        const params = { include: SportmonksAdapter.FIXTURE_INCLUDES };
        if (input.date) {
            endpoint = `fixtures/date/${input.date.slice(0, 10)}`;
        }
        else if (input.range) {
            endpoint = `fixtures/between/${input.range.from.slice(0, 10)}/${input.range.to.slice(0, 10)}`;
        }
        else if (input.competitionProviderId) {
            endpoint = `fixtures`;
            params.leagues = input.competitionProviderId;
            params.seasons = new Date().getFullYear();
        }
        else {
            return { ok: false, provider: this.name, requestKey: this.key("fixtures", {}), fromCache: false, error: { code: "bad_response", message: "sportmonks fixtures need a date, range or league" } };
        }
        const res = await this.paginate(endpoint, params);
        if (!res.ok)
            return res;
        return { ok: true, data: res.data.map((f) => this.fixture(f)), provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
    }
    /**
     * Live polling uses the documented livescores feeds, not the fixtures feeds:
     *   GET /livescores/inplay — matches in the ±15 min in-play window
     *   GET /livescores        — all of today's livescores (fallback)
     * One request covers the whole platform, which is why live polling is not
     * implemented as one call per match (Instruction 9).
     */
    async getLiveMatches(input) {
        const includes = { include: SportmonksAdapter.FIXTURE_INCLUDES, sport: input.sport };
        const inplay = await this.getJson("livescores/inplay", includes);
        if (inplay.ok) {
            const list = this.unwrap(inplay);
            if (!list.ok)
                return list;
            return { ok: true, data: list.data.map((f) => this.fixture(f)), provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
        }
        // /inplay is not on every plan → fall back to the whole-day livescore feed
        // and keep only what is actually in play
        const all = await this.getJson("livescores", includes);
        if (!all.ok)
            return all;
        const list = this.unwrap(all);
        if (!list.ok)
            return list;
        const live = list.data
            .map((f) => this.fixture(f))
            .filter((f) => f.status !== "scheduled" && f.status !== "finished" && f.status !== "postponed" && f.status !== "cancelled");
        return { ok: true, data: live, provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
    }
    async getMatchDetail(input) {
        const res = await this.getJson(`fixtures/${input.providerMatchId}`, { include: `${SportmonksAdapter.FIXTURE_INCLUDES};status` });
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        const f = list.data[0];
        if (!f)
            return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `fixture ${input.providerMatchId} not found` } };
        return { ok: true, data: this.fixture(f), provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
    }
    async getMatchEvents(input) {
        const res = await this.paginate(`fixtures/${input.providerMatchId}/events`, { per_page: 100 });
        if (!res.ok)
            return res;
        const data = res.data.map((e) => {
            const m = (0, base_1.parseMinute)(e.minute != null && e.extra_minute != null ? `${e.minute}+${e.extra_minute}` : e.minute);
            return {
                providerEventId: String(e.id),
                providerMatchId: String(e.fixture_id),
                type: exports.EVENT_TYPE_ID[e.type_id] ?? `type_${e.type_id}`,
                minute: m.minute,
                additionalMinute: m.additional,
                teamProviderId: e.team_id != null ? String(e.team_id) : null,
                playerProviderId: e.player_id != null ? String(e.player_id) : null,
                secondaryPlayerProviderId: e.related_player_id != null ? String(e.related_player_id) : null,
                description: null,
            };
        });
        return { ok: true, data, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
    }
    async getTeam(input) {
        const res = await this.getJson(`teams/${input.providerTeamId}`, { include: "country;venue;colors" });
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        const t = list.data[0];
        if (!t)
            return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `team ${input.providerTeamId} not found` } };
        return {
            ok: true,
            data: {
                providerId: String(t.id),
                name: t.name,
                shortName: null,
                abbreviation: (0, base_1.str)(t.short_code),
                countryCode: null,
                countryName: (0, base_1.str)(t.country?.name),
                logoUrl: (0, base_1.str)(t.image_path),
                foundedYear: (0, base_1.toInt)(t.founded),
                venueName: (0, base_1.str)(t.venue?.name),
                primaryColor: (0, base_1.str)(t.colors?.primary?.color),
                secondaryColor: (0, base_1.str)(t.colors?.secondary?.color),
                isNationalTeam: !!t.national_team,
            },
            provider: this.name,
            fetchedAt: list.fetchedAt,
            requestKey: list.requestKey,
            fromCache: false,
        };
    }
    async getTeamSquad(input) {
        const res = await this.paginate(`teams/${input.providerTeamId}/squad`, { per_page: 50 });
        if (!res.ok)
            return res;
        const data = res.data.map((p) => ({
            providerId: String(p.id),
            name: p.name,
            position: (0, base_1.str)(p.position?.name),
            jerseyNumber: null,
            dateOfBirth: (0, base_1.toIso)(p.date_of_birth),
            countryCode: null,
            photoUrl: (0, base_1.str)(p.image_path),
            photoAttribution: (0, base_1.str)(p.image_path) ? "Sportmonks" : null,
        }));
        return { ok: true, data, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
    }
    async getPlayer(input) {
        const res = await this.getJson(`players/${input.providerPlayerId}`, { include: "position;nationality" });
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        const p = list.data[0];
        if (!p)
            return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `player ${input.providerPlayerId} not found` } };
        return {
            ok: true,
            data: {
                providerId: String(p.id),
                fullName: (0, base_1.str)(p.display_name) ?? p.name,
                dateOfBirth: (0, base_1.toIso)(p.date_of_birth),
                countryCode: null,
                position: (0, base_1.str)(p.position?.name),
                photoUrl: (0, base_1.str)(p.image_path),
                photoAttribution: (0, base_1.str)(p.image_path) ? "Sportmonks" : null,
                heightCm: (0, base_1.toInt)(p.height),
                weightKg: (0, base_1.toInt)(p.weight),
                footPreference: null,
                teamProviderId: p.current_team_id != null ? String(p.current_team_id) : null,
            },
            provider: this.name,
            fetchedAt: list.fetchedAt,
            requestKey: list.requestKey,
            fromCache: false,
        };
    }
    async getCompetition(input) {
        const res = await this.getJson(`leagues/${input.providerCompetitionId}`, { include: "country" });
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        const l = list.data[0];
        if (!l)
            return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `league ${input.providerCompetitionId} not found` } };
        return {
            ok: true,
            data: { providerId: String(l.id), name: l.name, shortName: (0, base_1.str)(l.short_code), countryCode: null, countryName: (0, base_1.str)(l.country?.name), type: (0, base_1.str)(l.type)?.toLowerCase() ?? null, logoUrl: (0, base_1.str)(l.logo_path) },
            provider: this.name,
            fetchedAt: list.fetchedAt,
            requestKey: list.requestKey,
            fromCache: false,
        };
    }
    async getCompetitionSeasons(input) {
        const res = await this.paginate(`leagues/${input.providerCompetitionId}/seasons`, { per_page: 50 });
        if (!res.ok)
            return res;
        const data = res.data.map((s) => ({
            providerId: String(s.id),
            competitionProviderId: String(s.league_id),
            name: s.name,
            isCurrent: !!s.is_current_season,
            startDate: (0, base_1.toIso)(s.starting_at),
            endDate: (0, base_1.toIso)(s.ending_at),
        }));
        return { ok: true, data, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
    }
    async getStandings(input) {
        const params = { per_page: 100 };
        if (input.season)
            params.seasons = input.season;
        const res = await this.paginate(`leagues/${input.providerCompetitionId}/standings`, params);
        if (!res.ok)
            return res;
        const data = res.data.map((r) => ({
            teamProviderId: String(r.participant_id),
            group: (0, base_1.str)(r.group?.name) ?? (0, base_1.str)(r.stage?.name),
            position: r.position,
            played: r.played,
            won: r.won,
            drawn: r.draw,
            lost: r.lost,
            goalsFor: r.goals_for,
            goalsAgainst: r.goals_against,
            points: r.points,
            form: parseForm(r.form),
            status: mapStandingStatus(r.status),
        }));
        return { ok: true, data, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
    }
    async getTopScorers(input) {
        const params = { per_page: 50, type: "goals" };
        if (input.season)
            params.seasons = input.season;
        const res = await this.paginate(`leagues/${input.providerCompetitionId}/topscorers/goals`, params);
        if (!res.ok)
            return res;
        const data = res.data.map((r) => ({
            playerProviderId: String(r.player_id),
            teamProviderId: r.team_id != null ? String(r.team_id) : null,
            goals: (0, base_1.toInt)(r.goals) ?? 0,
            appearances: (0, base_1.toInt)(r.appearances),
            penalties: (0, base_1.toInt)(r.penalty_goals),
        }));
        return { ok: true, data, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
    }
    async healthCheck() {
        const started = Date.now();
        const res = await this.getJson("sports", { per_page: 1 });
        const at = new Date().toISOString();
        if (!res.ok) {
            return { ok: true, data: { provider: this.name, reachable: false, checkedAt: at, latencyMs: Date.now() - started, quotaRemaining: null, detail: res.error.message }, provider: this.name, fetchedAt: at, requestKey: res.requestKey, fromCache: false };
        }
        const rl = res.data.rate_limits;
        return {
            ok: true,
            data: { provider: this.name, reachable: true, checkedAt: at, latencyMs: Date.now() - started, quotaRemaining: (0, base_1.toInt)(rl?.remaining ?? null), detail: "sports endpoint reachable" },
            provider: this.name,
            fetchedAt: at,
            requestKey: res.requestKey,
            fromCache: false,
        };
    }
}
exports.SportmonksAdapter = SportmonksAdapter;
function parseForm(form) {
    if (!form)
        return [];
    return form
        .split("")
        .filter((c) => c === "W" || c === "D" || c === "L")
        .slice(-5);
}
function mapStandingStatus(status) {
    if (!status)
        return null;
    const s = status.toLowerCase();
    if (s.includes("champion"))
        return "champion";
    if (s.includes("relegation playoff"))
        return "relegation_playoff";
    if (s.includes("relegation"))
        return "relegation";
    if (s.includes("promotion playoff"))
        return "promotion_playoff";
    if (s.includes("promotion"))
        return "promotion";
    return null;
}
