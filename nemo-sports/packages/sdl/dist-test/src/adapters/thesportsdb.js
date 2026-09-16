"use strict";
/**
 * SDL · TheSportsDB adapter — v1/v2, doc-verified.
 *
 * v1 base : https://www.thesportsdb.com/api/v1/json/{apikey}/…   (key in path)
 * v2 base : https://www.thesportsdb.com/api/v2/json/…            (key in X-API-KEY header)
 *
 * IMPORTANT constraints that shape how this provider is used:
 *  · the public test keys (`123`, `3`) are shared, rate limited (~30 req/min)
 *    and have some methods disabled — NEVER used for production live data;
 *  · this provider's real value is artwork and descriptive metadata
 *    (team logos, player photos, venue images, banners);
 *  · images are supplied by a community database, so every image URL is stored
 *    with `photoAttribution` and must be reviewed for licence before display
 *    (legal-only rule, §8.1). It is therefore placed on the `images` data type
 *    in the default priority chain and never on live scores.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TheSportsDbAdapter = void 0;
const base_1 = require("./base");
class TheSportsDbAdapter extends (0, base_1.withDefaults)("thesportsdb") {
    capabilities = ["team", "team_squad", "player", "competition", "competition_seasons", "venue", "images", "fixtures", "health"];
    supportedSports = ["football", "basketball", "tennis", "volleyball", "handball", "hockey", "baseball", "boxing"];
    apiKey;
    version;
    constructor(cfg = {}) {
        super(cfg);
        this.apiKey = cfg.apiKey ?? process.env.THESPORTSDB_KEY ?? null;
        this.version = cfg.version ?? 2;
        // community endpoints are strict: 1 rps and short retries
        this.timeoutMs = cfg.timeoutMs ?? 6000;
        this.retries = cfg.retries ?? 0;
    }
    /** @internal */ baseUrl() {
        return this.version === 2 ? "https://www.thesportsdb.com/api/v2/json" : `https://www.thesportsdb.com/api/v1/json/${this.apiKey ?? "123"}`;
    }
    /** @internal */ auth() {
        return this.version === 2 ? { headers: { "X-API-KEY": this.apiKey ?? "" } } : { headers: {} };
    }
    /** TheSportsDB returns nulls and empty arrays interchangeably. */
    unwrap(res) {
        if (!res.ok)
            return res;
        const first = Object.values(res.data)[0];
        const arr = Array.isArray(first) ? first : [];
        return { ok: true, data: arr, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
    }
    /** Images are licensed by a community DB — attribution travels with the URL. */
    static ATTRIBUTION = "TheSportsDB (community metadata — verify licence before display)";
    async getTeam(input) {
        const res = await this.getJson("lookupteam.php", { id: input.providerTeamId });
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        const t = list.data[0];
        if (!t)
            return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `team ${input.providerTeamId} not found` } };
        return {
            ok: true,
            data: {
                providerId: t.idTeam,
                name: t.strTeam,
                shortName: (0, base_1.str)(t.strTeamShort),
                abbreviation: null,
                countryCode: (0, base_1.str)(t.strCountryCode),
                countryName: (0, base_1.str)(t.strCountry),
                logoUrl: (0, base_1.str)(t.strTeamBadge),
                foundedYear: (0, base_1.toInt)(t.intFormedYear),
                venueName: (0, base_1.str)(t.strStadium),
                primaryColor: null,
                secondaryColor: null,
                isNationalTeam: !!t.idLeague && t.idLeague === "4480",
            },
            provider: this.name,
            fetchedAt: list.fetchedAt,
            requestKey: list.requestKey,
            fromCache: false,
        };
    }
    /** Squad feed doubles as the player-photo source (the actual reason we call it). */
    async getTeamSquad(input) {
        const res = await this.getJson("lookup_all_players.php", { id: input.providerTeamId });
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        const data = list.data.map((p) => ({
            providerId: p.idPlayer,
            name: p.strPlayer,
            position: (0, base_1.str)(p.strPosition),
            jerseyNumber: (0, base_1.toInt)(p.strNationalTeamNo),
            dateOfBirth: (0, base_1.toIso)(p.dateBorn),
            countryCode: null,
            photoUrl: (0, base_1.str)(p.strThumb) ?? (0, base_1.str)(p.strCutout),
            photoAttribution: (0, base_1.str)(p.strThumb) || (0, base_1.str)(p.strCutout) ? TheSportsDbAdapter.ATTRIBUTION : null,
        }));
        return { ok: true, data, provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
    }
    async getPlayer(input) {
        const res = await this.getJson("lookupplayer.php", { id: input.providerPlayerId });
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        const p = list.data[0];
        if (!p)
            return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `player ${input.providerPlayerId} not found` } };
        const foot = (0, base_1.str)(p.strFoot)?.toLowerCase();
        return {
            ok: true,
            data: {
                providerId: p.idPlayer,
                fullName: p.strPlayer,
                dateOfBirth: (0, base_1.toIso)(p.dateBorn),
                countryCode: null,
                position: (0, base_1.str)(p.strPosition),
                photoUrl: (0, base_1.str)(p.strCutout) ?? (0, base_1.str)(p.strThumb),
                photoAttribution: (0, base_1.str)(p.strCutout) || (0, base_1.str)(p.strThumb) ? TheSportsDbAdapter.ATTRIBUTION : null,
                heightCm: p.strHeight ? Math.round(toCm(p.strHeight) ?? 0) || null : null,
                weightKg: p.strWeight ? (0, base_1.toInt)(p.strWeight) : null,
                footPreference: foot === "right" || foot === "left" || foot === "both" ? foot : null,
                teamProviderId: (0, base_1.str)(p.idTeam),
            },
            provider: this.name,
            fetchedAt: list.fetchedAt,
            requestKey: list.requestKey,
            fromCache: false,
        };
    }
    async getCompetition(input) {
        const res = await this.getJson("lookupleague.php", { id: input.providerCompetitionId });
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        const l = list.data[0];
        if (!l)
            return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `league ${input.providerCompetitionId} not found` } };
        return {
            ok: true,
            data: { providerId: l.idLeague, name: l.strLeague, shortName: (0, base_1.str)(l.strLeagueAlternate), countryCode: null, countryName: (0, base_1.str)(l.strCountry), type: (0, base_1.str)(l.strSport)?.toLowerCase() ?? null, logoUrl: (0, base_1.str)(l.strBadge) ?? (0, base_1.str)(l.strLogo) },
            provider: this.name,
            fetchedAt: list.fetchedAt,
            requestKey: list.requestKey,
            fromCache: false,
        };
    }
    async getCompetitionSeasons(input) {
        const res = await this.getJson("search_all_seasons.php", { id: input.providerCompetitionId });
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        const data = list.data.map((s) => ({
            providerId: s.idSeason,
            competitionProviderId: s.idLeague ?? input.providerCompetitionId,
            name: s.strSeason,
            isCurrent: s.strSeason === String(new Date().getFullYear()),
            startDate: null,
            endDate: null,
        }));
        return { ok: true, data, provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
    }
    /** Only used for artwork enrichment (`images`), never for live scores. */
    async getFixtures(input) {
        if (!input.date) {
            return { ok: false, provider: this.name, requestKey: this.key("events", {}), fromCache: false, error: { code: "bad_response", message: "thesportsdb events need a date (eventsday.php)" } };
        }
        const params = { d: input.date.slice(0, 10), s: input.sport === "football" ? "Soccer" : input.sport };
        const res = await this.getJson("eventsday.php", params);
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        const data = list.data.map((e) => ({
            providerId: e.idEvent,
            sport: input.sport,
            competitionProviderId: (0, base_1.str)(e.idLeague) ?? "",
            seasonProviderId: (0, base_1.str)(e.idSeason),
            round: (0, base_1.str)(e.intRound),
            homeProviderId: (0, base_1.str)(e.idHomeTeam),
            awayProviderId: (0, base_1.str)(e.idAwayTeam),
            scheduledAt: (0, base_1.toIso)(e.strTimestamp) ?? (0, base_1.toIso)(`${e.dateEvent}T${e.strTime ?? "00:00:00+00:00"}`) ?? new Date().toISOString(),
            status: mapTsdStatus(e.strStatus),
            homeScore: (0, base_1.toInt)(e.intHomeScore),
            awayScore: (0, base_1.toInt)(e.intAwayScore),
            periods: [],
            venueProviderId: null,
            venueName: (0, base_1.str)(e.strVenue),
            attendance: null,
            minute: null,
        }));
        return { ok: true, data, provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
    }
    async getVenue(input) {
        const res = await this.getJson("lookupeventvenue.php", { id: input.providerVenueId });
        const list = this.unwrap(res);
        if (!list.ok)
            return list;
        const v = list.data[0];
        if (!v)
            return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `venue ${input.providerVenueId} not found` } };
        return {
            ok: true,
            data: { providerId: v.idVenue, name: v.strVenue, city: (0, base_1.str)(v.strCity), countryCode: null, capacity: (0, base_1.toInt)(v.intCapacity), lat: null, lng: null },
            provider: this.name,
            fetchedAt: list.fetchedAt,
            requestKey: list.requestKey,
            fromCache: false,
        };
    }
    async healthCheck() {
        const started = Date.now();
        const res = await this.getJson("search_all_leagues.php", { c: "England" });
        const at = new Date().toISOString();
        if (!res.ok) {
            return { ok: true, data: { provider: this.name, reachable: false, checkedAt: at, latencyMs: Date.now() - started, quotaRemaining: null, detail: res.error.message }, provider: this.name, fetchedAt: at, requestKey: res.requestKey, fromCache: false };
        }
        const count = Object.values(res.data)[0]?.length ?? 0;
        return {
            ok: true,
            data: { provider: this.name, reachable: true, checkedAt: at, latencyMs: Date.now() - started, quotaRemaining: null, detail: `${count} english leagues listed` },
            provider: this.name,
            fetchedAt: at,
            requestKey: res.requestKey,
            fromCache: false,
        };
    }
}
exports.TheSportsDbAdapter = TheSportsDbAdapter;
function toCm(raw) {
    const text = raw.toLowerCase();
    if (text.includes("ft") || text.includes("'")) {
        const feet = Number.parseFloat(text);
        const inchesMatch = text.match(/(\d+)\s*(?:in|"|''|$)/);
        const inches = inchesMatch ? Number.parseFloat(inchesMatch[1]) : 0;
        if (!Number.isFinite(feet))
            return null;
        return Math.round((feet * 12 + inches) * 2.54);
    }
    const n = Number.parseFloat(text);
    return Number.isFinite(n) ? Math.round(n) : null;
}
function mapTsdStatus(status) {
    const s = (status ?? "").toLowerCase();
    if (s.includes("ft") || s.includes("match finished") || s.includes("full"))
        return "finished";
    if (s.includes("ns") || s.includes("not started"))
        return "scheduled";
    if (s.includes("ht"))
        return "halftime";
    if (s.includes("pst"))
        return "postponed";
    if (s.includes("canc"))
        return "cancelled";
    if (s.match(/^\d+'?$/))
        return "live";
    return "scheduled";
}
