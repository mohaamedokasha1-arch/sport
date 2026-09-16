"use strict";
/**
 * SDL · Demo adapter (offline / zero-key)
 * ──────────────────────────────────────
 * Purpose: the platform must run and be demonstrable with no provider keys,
 * and every adapter must be testable without hitting a paid API. This adapter
 * implements the *same* interface from a deterministic in-memory fixture set,
 * so it exercises failover, caching, conflict detection and canonical mapping
 * exactly as a real provider would.
 *
 * It is NOT a data source for production: pages fed by it are marked
 * non-indexable (Instruction 6 — no placeholder data on indexed pages).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DemoAdapter = exports.DEMO_COMPETITIONS = exports.DEMO_SCORERS = exports.DEMO_STANDINGS = exports.DEMO_EVENTS = exports.DEMO_TEAMS = exports.DEMO_FIXTURES = void 0;
const base_1 = require("./base");
const hourFromNow = (h, min = 0) => new Date(Date.now() + h * 3600_000 + min * 60_000).toISOString();
exports.DEMO_FIXTURES = [
    {
        providerId: "demo-1001",
        sport: "football",
        competitionProviderId: "demo-pl",
        seasonProviderId: "2026",
        round: "Matchday 24",
        homeProviderId: "demo-ars",
        awayProviderId: "demo-chel",
        scheduledAt: hourFromNow(2),
        status: "scheduled",
        homeScore: null,
        awayScore: null,
        periods: [],
        venueProviderId: "demo-emirates",
        venueName: "Emirates Stadium",
        attendance: null,
        minute: null,
    },
    {
        providerId: "demo-1002",
        sport: "football",
        competitionProviderId: "demo-pl",
        seasonProviderId: "2026",
        round: "Matchday 24",
        homeProviderId: "demo-liv",
        awayProviderId: "demo-mci",
        scheduledAt: hourFromNow(-1, -12),
        status: "live",
        homeScore: 2,
        awayScore: 1,
        periods: [{ label: "1H", home: 1, away: 1 }],
        venueProviderId: "demo-anfield",
        venueName: "Anfield",
        attendance: 61000,
        minute: 67,
    },
    {
        providerId: "demo-1003",
        sport: "football",
        competitionProviderId: "demo-epl-eg",
        seasonProviderId: "2026",
        round: "Matchday 18",
        homeProviderId: "demo-ahly",
        awayProviderId: "demo-zamalek",
        scheduledAt: hourFromNow(-2, -30),
        status: "finished",
        homeScore: 3,
        awayScore: 0,
        periods: [
            { label: "1H", home: 1, away: 0 },
            { label: "FT", home: 3, away: 0 },
        ],
        venueProviderId: "demo-cairo",
        venueName: "Cairo International Stadium",
        attendance: 74000,
        minute: 90,
    },
];
exports.DEMO_TEAMS = [
    { providerId: "demo-ars", name: "Arsenal", shortName: "Arsenal", abbreviation: "ARS", countryCode: "GB", countryName: "England", logoUrl: null, foundedYear: 1886, venueName: "Emirates Stadium", primaryColor: "#EF0107", secondaryColor: "#023474", isNationalTeam: false },
    { providerId: "demo-chel", name: "Chelsea", shortName: "Chelsea", abbreviation: "CHE", countryCode: "GB", countryName: "England", logoUrl: null, foundedYear: 1905, venueName: "Stamford Bridge", primaryColor: "#034694", secondaryColor: "#DBA111", isNationalTeam: false },
    { providerId: "demo-liv", name: "Liverpool", shortName: "Liverpool", abbreviation: "LIV", countryCode: "GB", countryName: "England", logoUrl: null, foundedYear: 1892, venueName: "Anfield", primaryColor: "#C8102E", secondaryColor: "#00B2A9", isNationalTeam: false },
    { providerId: "demo-mci", name: "Manchester City", shortName: "Man City", abbreviation: "MCI", countryCode: "GB", countryName: "England", logoUrl: null, foundedYear: 1880, venueName: "Etihad Stadium", primaryColor: "#6CABDD", secondaryColor: "#1C2C5B", isNationalTeam: false },
    { providerId: "demo-ahly", name: "Al Ahly", shortName: "Al Ahly", abbreviation: "AHL", countryCode: "EG", countryName: "Egypt", logoUrl: null, foundedYear: 1907, venueName: "Cairo International Stadium", primaryColor: "#C8102E", secondaryColor: "#FFFFFF", isNationalTeam: false },
    { providerId: "demo-zamalek", name: "Zamalek", shortName: "Zamalek", abbreviation: "ZAM", countryCode: "EG", countryName: "Egypt", logoUrl: null, foundedYear: 1911, venueName: "Cairo International Stadium", primaryColor: "#FFFFFF", secondaryColor: "#C8102E", isNationalTeam: false },
];
exports.DEMO_EVENTS = [
    { providerEventId: "e1", providerMatchId: "demo-1002", type: "goal", minute: 23, additionalMinute: null, teamProviderId: "demo-liv", playerProviderId: "demo-p1", secondaryPlayerProviderId: null, description: "Opening goal" },
    { providerEventId: "e2", providerMatchId: "demo-1002", type: "goal", minute: 41, additionalMinute: null, teamProviderId: "demo-mci", playerProviderId: "demo-p2", secondaryPlayerProviderId: null, description: "Equaliser" },
    { providerEventId: "e3", providerMatchId: "demo-1002", type: "yellow_card", minute: 55, additionalMinute: null, teamProviderId: "demo-mci", playerProviderId: "demo-p3", secondaryPlayerProviderId: null, description: "Tactical foul" },
    { providerEventId: "e4", providerMatchId: "demo-1002", type: "goal", minute: 66, additionalMinute: null, teamProviderId: "demo-liv", playerProviderId: "demo-p4", secondaryPlayerProviderId: null, description: "Winner" },
];
exports.DEMO_STANDINGS = [
    { teamProviderId: "demo-liv", group: null, position: 1, played: 23, won: 16, drawn: 5, lost: 2, goalsFor: 51, goalsAgainst: 20, points: 53, form: ["W", "W", "D", "W", "L"], status: "champion" },
    { teamProviderId: "demo-ars", group: null, position: 2, played: 23, won: 15, drawn: 6, lost: 2, goalsFor: 47, goalsAgainst: 18, points: 51, form: ["W", "D", "W", "W", "W"], status: "promotion" },
    { teamProviderId: "demo-mci", group: null, position: 3, played: 23, won: 14, drawn: 4, lost: 5, goalsFor: 49, goalsAgainst: 27, points: 46, form: ["W", "W", "L", "W", "D"], status: "cup_position" },
    { teamProviderId: "demo-chel", group: null, position: 4, played: 23, won: 12, drawn: 7, lost: 4, goalsFor: 44, goalsAgainst: 29, points: 43, form: ["D", "W", "D", "L", "W"], status: "cup_position" },
];
exports.DEMO_SCORERS = [
    { playerProviderId: "demo-p1", teamProviderId: "demo-liv", goals: 19, appearances: 22, penalties: 3 },
    { playerProviderId: "demo-p2", teamProviderId: "demo-mci", goals: 17, appearances: 21, penalties: 2 },
    { playerProviderId: "demo-p5", teamProviderId: "demo-ars", goals: 15, appearances: 23, penalties: 0 },
];
exports.DEMO_COMPETITIONS = [
    { providerId: "demo-pl", name: "Premier League", shortName: "EPL", countryCode: "GB", countryName: "England", type: "league", logoUrl: null },
    { providerId: "demo-epl-eg", name: "Egyptian Premier League", shortName: "Egypt PL", countryCode: "EG", countryName: "Egypt", type: "league", logoUrl: null },
];
class DemoAdapter extends (0, base_1.withDefaults)("demo") {
    capabilities = ["fixtures", "live_matches", "match_detail", "match_events", "match_stats", "team", "competition", "competition_seasons", "standings", "top_scorers", "health"];
    supportedSports = ["football", "basketball", "tennis", "volleyball", "handball", "hockey", "baseball", "boxing"];
    cfg;
    constructor(cfg = {}) {
        super({ timeoutMs: cfg.timeoutMs ?? 2000, retries: cfg.retries ?? 0, fetchImpl: cfg.fetchImpl });
        this.cfg = { ...cfg, failWith: cfg.failWith ?? null, latencyMs: cfg.latencyMs ?? 0 };
    }
    /** @internal */ baseUrl() {
        return "demo://local";
    }
    /** Fault injection so failover/health behaviour is testable. */
    setFault(fault) {
        this.cfg.failWith = fault ?? null;
    }
    mutate(fixtureId, patch) {
        const list = this.cfg.fixtures ?? exports.DEMO_FIXTURES;
        const f = list.find((x) => x.providerId === fixtureId);
        if (f)
            Object.assign(f, patch);
    }
    async gate(dataType, endpoint, params) {
        if (this.cfg.latencyMs)
            await new Promise((r) => setTimeout(r, this.cfg.latencyMs));
        const fault = this.cfg.failWith;
        if (fault && fault.dataType === dataType) {
            return {
                ok: false,
                provider: this.name,
                requestKey: this.key(endpoint, params),
                fromCache: false,
                error: { code: fault.code ?? "network", message: fault.error },
            };
        }
        return null;
    }
    ok(data, endpoint, params) {
        return { ok: true, data, provider: this.name, fetchedAt: new Date().toISOString(), requestKey: this.key(endpoint, params), fromCache: false };
    }
    async getFixtures(input) {
        const faulted = await this.gate("fixtures", "fixtures", input);
        if (faulted)
            return faulted;
        let list = [...(this.cfg.fixtures ?? exports.DEMO_FIXTURES)];
        if (input.sport)
            list = list.filter((f) => f.sport === input.sport);
        if (input.competitionProviderId)
            list = list.filter((f) => f.competitionProviderId === input.competitionProviderId);
        if (input.date)
            list = list.filter((f) => f.scheduledAt.slice(0, 10) === input.date);
        if (input.range)
            list = list.filter((f) => f.scheduledAt >= input.range.from && f.scheduledAt <= input.range.to);
        return this.ok(list, "fixtures", input);
    }
    async getLiveMatches(input) {
        const faulted = await this.gate("live_matches", "live", input);
        if (faulted)
            return faulted;
        const list = (this.cfg.fixtures ?? exports.DEMO_FIXTURES).filter((f) => f.sport === input.sport && (f.status === "live" || f.status === "halftime" || f.status === "extra_time" || f.status === "penalty_shootout"));
        return this.ok(list, "live", input);
    }
    async getMatchDetail(input) {
        const faulted = await this.gate("match_detail", "match", input);
        if (faulted)
            return faulted;
        const f = (this.cfg.fixtures ?? exports.DEMO_FIXTURES).find((x) => x.providerId === input.providerMatchId);
        if (!f)
            return { ok: false, provider: this.name, requestKey: this.key("match", input), fromCache: false, error: { code: "not_found", message: `demo fixture ${input.providerMatchId} not found` } };
        return this.ok(f, "match", input);
    }
    async getMatchEvents(input) {
        const faulted = await this.gate("match_events", "events", input);
        if (faulted)
            return faulted;
        return this.ok((this.cfg.events ?? exports.DEMO_EVENTS).filter((e) => e.providerMatchId === input.providerMatchId), "events", input);
    }
    async getMatchStats(input) {
        const faulted = await this.gate("match_stats", "stats", input);
        if (faulted)
            return faulted;
        return this.ok(this.cfg.stats ?? [], "stats", input);
    }
    async getTeam(input) {
        const faulted = await this.gate("team", "team", input);
        if (faulted)
            return faulted;
        const t = (this.cfg.teams ?? exports.DEMO_TEAMS).find((x) => x.providerId === input.providerTeamId);
        if (!t)
            return { ok: false, provider: this.name, requestKey: this.key("team", input), fromCache: false, error: { code: "not_found", message: `demo team ${input.providerTeamId} not found` } };
        return this.ok(t, "team", input);
    }
    async getCompetition(input) {
        const faulted = await this.gate("competition", "competition", input);
        if (faulted)
            return faulted;
        const c = (this.cfg.competitions ?? exports.DEMO_COMPETITIONS).find((x) => x.providerId === input.providerCompetitionId);
        if (!c)
            return { ok: false, provider: this.name, requestKey: this.key("competition", input), fromCache: false, error: { code: "not_found", message: `demo competition ${input.providerCompetitionId} not found` } };
        return this.ok(c, "competition", input);
    }
    async getCompetitionSeasons(input) {
        const faulted = await this.gate("competition_seasons", "seasons", input);
        if (faulted)
            return faulted;
        const year = new Date().getFullYear();
        const list = this.cfg.seasons ??
            [year - 1, year].map((y) => ({ providerId: `${input.providerCompetitionId}-${y}`, competitionProviderId: input.providerCompetitionId, name: `${y - 1}/${y}`, isCurrent: y === year, startDate: null, endDate: null }));
        return this.ok(list, "seasons", input);
    }
    async getStandings(input) {
        const faulted = await this.gate("standings", "standings", input);
        if (faulted)
            return faulted;
        return this.ok(this.cfg.standings ?? exports.DEMO_STANDINGS, "standings", input);
    }
    async getTopScorers(input) {
        const faulted = await this.gate("top_scorers", "top_scorers", input);
        if (faulted)
            return faulted;
        return this.ok(this.cfg.scorers ?? exports.DEMO_SCORERS, "top_scorers", input);
    }
    async healthCheck() {
        const faulted = await this.gate("health", "health", {});
        if (faulted)
            return faulted;
        const at = new Date().toISOString();
        return this.ok({ provider: this.name, reachable: true, checkedAt: at, latencyMs: this.cfg.latencyMs, quotaRemaining: null, detail: "in-memory demo provider" }, "health", {});
    }
}
exports.DemoAdapter = DemoAdapter;
