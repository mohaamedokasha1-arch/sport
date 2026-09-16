"use strict";
/**
 * SDL · Sportradar adapter — Soccer API v4, doc-verified.
 *
 * Base URL : https://api.sportradar.com/soccer/{access}/v4/{lang}/{feed}.json
 * Auth     : `x-api-key` header (+ `accept: application/json`)
 * Notes    : entity ids are prefixed strings (sr:competitor:44, sr:season:105353,
 *            sr:sport_event:41762841). Feeds return complete payloads — there is
 *            no pagination, so a single request per feed is the whole cost.
 *            Coverage (Live / Standings / Lineups / Leaders) depends on the
 *            subscription tier per competition, hence the capability list is
 *            declarative and failover covers the gaps (§3.10).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SportradarAdapter = exports.SR_STATUS = void 0;
const base_1 = require("./base");
/** Sportradar `sport_event_status.status` / `match_status` → canonical status. */
exports.SR_STATUS = {
    not_started: "scheduled",
    live: "live",
    ended: "finished",
    closed: "finished",
    cancelled: "cancelled",
    postponed: "postponed",
    delayed: "suspended",
    suspended: "suspended",
    abandoned: "abandoned",
    awarded: "awarded",
    walkover: "walkover",
    "1st_half": "live",
    "2nd_half": "live",
    halftime: "halftime",
    halftime_break: "halftime",
    extra_time: "extra_time",
    extra_time_break: "extra_time_halftime",
    penalty_shootout: "penalty_shootout",
    penalties: "penalty_shootout",
    awaiting_extra_time: "extra_time",
    awaiting_penalties: "penalty_shootout",
};
class SportradarAdapter extends (0, base_1.withDefaults)("sportradar") {
    capabilities = ["fixtures", "live_matches", "match_detail", "match_events", "match_stats", "match_lineups", "team", "competition", "competition_seasons", "standings", "health"];
    supportedSports = ["football", "basketball", "nfl"];
    apiKey;
    access;
    lang;
    sport;
    version;
    constructor(cfg = {}) {
        super(cfg);
        this.apiKey = cfg.apiKey ?? process.env.SPORTRADAR_KEY ?? null;
        this.access = cfg.access ?? "trial";
        this.lang = cfg.lang ?? "en";
        this.sport = cfg.sport ?? "soccer";
        this.version = cfg.version ?? 4;
    }
    /** @internal */ baseUrl() {
        return `https://api.sportradar.com/${this.sport}/${this.access}/v${this.version}/${this.lang}`;
    }
    /** @internal */ auth() {
        return { headers: this.apiKey ? { "x-api-key": this.apiKey } : {} };
    }
    fixture(e) {
        const home = e.competitors?.find((c) => c.qualifier === "home");
        const away = e.competitors?.find((c) => c.qualifier === "away");
        const st = e.sport_event_status ?? { status: e.status, match_status: e.status };
        const periods = (st.period_scores ?? []).map((p) => ({
            label: `P${p.number}`,
            home: (0, base_1.toInt)(p.home_score),
            away: (0, base_1.toInt)(p.away_score),
        }));
        return {
            providerId: e.id,
            sport: this.sport === "soccer" ? "football" : this.sport,
            competitionProviderId: e.tournament?.id ?? "",
            seasonProviderId: e.season?.id ?? null,
            round: (0, base_1.str)(e.tournament_round?.name) ?? (0, base_1.str)(e.round?.name) ?? (e.week != null ? `Week ${e.week}` : null),
            homeProviderId: home?.id ?? null,
            awayProviderId: away?.id ?? null,
            scheduledAt: (0, base_1.toIso)(e.start_time) ?? new Date().toISOString(),
            status: exports.SR_STATUS[st.status] ?? exports.SR_STATUS[st.match_status] ?? "scheduled",
            homeScore: (0, base_1.toInt)(st.home_score),
            awayScore: (0, base_1.toInt)(st.away_score),
            periods,
            venueProviderId: (0, base_1.str)(e.venue?.id),
            venueName: (0, base_1.str)(e.venue?.name),
            attendance: (0, base_1.toInt)(st.attendance),
            minute: (0, base_1.parseMinute)(e.match_time ?? st.match_time).minute,
        };
    }
    async getFixtures(input) {
        // Sportradar serves a per-day schedule feed; a range is fetched day by day
        // and hard-capped, because each day is a separate billable call.
        const days = [];
        if (input.date)
            days.push(input.date.slice(0, 10));
        else if (input.range) {
            const from = +new Date(input.range.from);
            const to = +new Date(input.range.to);
            const MAX_DAYS = 14;
            for (let t = from; t <= to && days.length < MAX_DAYS; t += 86_400_000)
                days.push(new Date(t).toISOString().slice(0, 10));
        }
        else
            days.push(new Date().toISOString().slice(0, 10));
        const all = [];
        let fetchedAt = new Date().toISOString();
        let key = this.key("schedules", { days: days.join(",") });
        let lastError = null;
        for (const day of days) {
            const res = await this.getJson(`schedules/${day}/schedules.json`, {});
            if (!res.ok) {
                lastError = res;
                continue;
            }
            fetchedAt = res.fetchedAt;
            key = res.requestKey;
            for (const e of res.data.sport_events ?? [])
                all.push(this.fixture(e));
        }
        if (!all.length && lastError)
            return lastError;
        const filtered = input.competitionProviderId ? all.filter((f) => f.competitionProviderId === input.competitionProviderId) : all;
        return { ok: true, data: filtered, provider: this.name, fetchedAt, requestKey: key, fromCache: false };
    }
    /** One request for every live match on the platform — the cheapest live poll. */
    async getLiveMatches(input) {
        const res = await this.getJson("schedules/live/schedules.json", { sport: input.sport });
        if (!res.ok)
            return res;
        const data = (res.data.sport_events ?? []).map((e) => this.fixture(e));
        return { ok: true, data, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
    }
    async getMatchDetail(input) {
        const res = await this.getJson(`sport_events/${input.providerMatchId}/schedules.json`, {});
        if (!res.ok)
            return res;
        const e = res.data.sport_event;
        if (!e)
            return { ok: false, provider: this.name, requestKey: res.requestKey, fromCache: false, error: { code: "not_found", message: `sport_event ${input.providerMatchId} not found` } };
        return { ok: true, data: this.fixture(e), provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
    }
    async getMatchEvents(input) {
        const res = await this.getJson(`sport_events/${input.providerMatchId}/summary.json`, {});
        if (!res.ok)
            return res;
        const timeline = res.data.event_timeline?.timeline ?? [];
        const data = timeline.map((t) => {
            const m = (0, base_1.parseMinute)(t.match_time);
            return {
                providerEventId: String(t.id),
                providerMatchId: input.providerMatchId,
                type: mapSrEventType(t.type),
                minute: m.minute,
                additionalMinute: m.additional,
                teamProviderId: (0, base_1.str)(t.team),
                playerProviderId: (0, base_1.str)(t.player?.id),
                secondaryPlayerProviderId: null,
                description: (0, base_1.str)(t.type),
            };
        });
        return { ok: true, data, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
    }
    async getMatchStats(input) {
        const res = await this.getJson(`sport_events/${input.providerMatchId}/summary.json`, {});
        if (!res.ok)
            return res;
        const out = [];
        const totals = res.data.statistics?.totals?.competitors ?? [];
        for (const c of totals) {
            for (const [type, value] of Object.entries(c.statistics ?? {})) {
                out.push({ teamProviderId: c.id, type: type.toLowerCase().replace(/\s+/g, "_"), value, period: "total" });
            }
        }
        for (const period of res.data.statistics?.periods ?? []) {
            for (const c of period.competitors ?? []) {
                for (const [type, value] of Object.entries(c.statistics ?? {})) {
                    out.push({ teamProviderId: c.id, type: type.toLowerCase().replace(/\s+/g, "_"), value, period: `period_${period.number ?? 0}` });
                }
            }
        }
        return { ok: true, data: out, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
    }
    async getMatchLineups(input) {
        const res = await this.getJson(`sport_events/${input.providerMatchId}/lineups.json`, {});
        if (!res.ok)
            return res;
        const data = (res.data.lineups?.team ?? []).map((t) => {
            const players = (t.players ?? []).map((p) => ({
                providerId: p.id,
                name: p.name,
                position: (0, base_1.str)(p.position),
                jerseyNumber: (0, base_1.toInt)(p.jersey_number),
            }));
            return {
                teamProviderId: t.id,
                formation: (0, base_1.str)(t.formation),
                coach: (0, base_1.str)(t.coaches?.[0]?.name),
                starters: players.filter((_, i) => i < 11),
                bench: players.filter((_, i) => i >= 11),
            };
        });
        return { ok: true, data, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
    }
    async getTeam(input) {
        const res = await this.getJson(`competitors/${input.providerTeamId}/profile.json`, {});
        if (!res.ok)
            return res;
        const c = res.data;
        if (!c?.id)
            return { ok: false, provider: this.name, requestKey: res.requestKey, fromCache: false, error: { code: "not_found", message: `competitor ${input.providerTeamId} not found` } };
        return {
            ok: true,
            data: {
                providerId: c.id,
                name: c.name,
                shortName: null,
                abbreviation: (0, base_1.str)(c.abbreviation),
                countryCode: (0, base_1.str)(c.country_code),
                countryName: (0, base_1.str)(c.country),
                logoUrl: null,
                foundedYear: (0, base_1.toInt)(c.founded),
                venueName: (0, base_1.str)(c.venue?.name),
                primaryColor: null,
                secondaryColor: null,
                isNationalTeam: c.gender === "na" || !!c.country_code,
            },
            provider: this.name,
            fetchedAt: res.fetchedAt,
            requestKey: res.requestKey,
            fromCache: false,
        };
    }
    async getCompetition(input) {
        const res = await this.getJson("competitions.json", {});
        if (!res.ok)
            return res;
        const t = (res.data.tournaments ?? []).find((x) => x.id === input.providerCompetitionId);
        if (!t)
            return { ok: false, provider: this.name, requestKey: res.requestKey, fromCache: false, error: { code: "not_found", message: `tournament ${input.providerCompetitionId} not in competitions feed` } };
        return {
            ok: true,
            data: { providerId: t.id, name: t.name, shortName: null, countryCode: (0, base_1.str)(t.category?.country_code), countryName: (0, base_1.str)(t.category?.name), type: null, logoUrl: null },
            provider: this.name,
            fetchedAt: res.fetchedAt,
            requestKey: res.requestKey,
            fromCache: false,
        };
    }
    async getCompetitionSeasons(input) {
        const res = await this.getJson(`tournaments/${input.providerCompetitionId}/info.json`, {});
        if (!res.ok)
            return res;
        const data = (res.data.tournament?.seasons ?? []).map((s) => ({
            providerId: s.id,
            competitionProviderId: input.providerCompetitionId,
            name: s.name,
            isCurrent: false,
            startDate: (0, base_1.toIso)(s.start_date),
            endDate: (0, base_1.toIso)(s.end_date),
        }));
        return { ok: true, data, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
    }
    async getStandings(input) {
        if (!input.season) {
            return { ok: false, provider: this.name, requestKey: this.key("standings", input), fromCache: false, error: { code: "bad_response", message: "sportradar standings require a season id (sr:season:…)" } };
        }
        const res = await this.getJson(`seasons/${input.season}/standings.json`, {});
        if (!res.ok)
            return res;
        const out = [];
        for (const group of res.data.standings?.groups ?? []) {
            for (const r of group.standings ?? []) {
                out.push({
                    teamProviderId: r.team.id,
                    group: (0, base_1.str)(group.name),
                    position: r.rank,
                    played: r.played,
                    won: r.win,
                    drawn: r.draw,
                    lost: r.loss,
                    goalsFor: r.goals_for,
                    goalsAgainst: r.goals_against,
                    points: r.points,
                    form: parseForm(r.form),
                    status: null,
                });
            }
        }
        return { ok: true, data: out, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
    }
    async healthCheck() {
        const started = Date.now();
        const res = await this.getJson("competitions.json", {});
        const at = new Date().toISOString();
        if (!res.ok) {
            return { ok: true, data: { provider: this.name, reachable: false, checkedAt: at, latencyMs: Date.now() - started, quotaRemaining: null, detail: res.error.message }, provider: this.name, fetchedAt: at, requestKey: res.requestKey, fromCache: false };
        }
        return {
            ok: true,
            data: { provider: this.name, reachable: true, checkedAt: at, latencyMs: Date.now() - started, quotaRemaining: null, detail: `${(res.data.tournaments ?? []).length} tournaments listed` },
            provider: this.name,
            fetchedAt: at,
            requestKey: res.requestKey,
            fromCache: false,
        };
    }
}
exports.SportradarAdapter = SportradarAdapter;
function mapSrEventType(type) {
    const t = type.toLowerCase();
    if (t.includes("goal"))
        return t.includes("own") ? "own_goal" : "goal";
    if (t.includes("yellow_red"))
        return "yellow_red_card";
    if (t.includes("red_card"))
        return "red_card";
    if (t.includes("yellow"))
        return "yellow_card";
    if (t.includes("substitut"))
        return "substitution";
    if (t.includes("var"))
        return t.includes("decision") ? "var_decision" : "var_review";
    if (t.includes("injur"))
        return "injury";
    if (t.includes("match_start"))
        return "match_start";
    if (t.includes("period"))
        return t.includes("end") ? "period_end" : "period_start";
    return t.replace(/\s+/g, "_") || "unknown";
}
function parseForm(form) {
    if (!form)
        return [];
    return form
        .split("")
        .filter((c) => c === "W" || c === "D" || c === "L")
        .slice(-5);
}
