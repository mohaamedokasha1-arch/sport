"use strict";
/**
 * SDL · Adapter base — transport, timeouts and capability defaults.
 * Adapters only declare: base URL, auth, and how to map a response body.
 * No adapter may be imported outside the SDL (Instruction 2).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.str = exports.toIso = exports.toInt = exports.BaseAdapter = void 0;
exports.withDefaults = withDefaults;
exports.parseMinute = parseMinute;
const provider_1 = require("../provider");
const normalize_1 = require("../normalize");
class BaseAdapter {
    http;
    /** @internal */ timeoutMs;
    /** @internal */ retries;
    /** @internal */ fetchImpl;
    constructor(/** @internal */ http = {}) {
        this.http = http;
        this.timeoutMs = this.http.timeoutMs ?? 8000;
        this.retries = this.http.retries ?? 1;
        this.fetchImpl = this.http.fetchImpl ?? globalThis.fetch;
    }
    /** subclass hook: add auth headers/query */
    /** @internal */ auth(_url) {
        return { headers: {} };
    }
    /** @internal */ key(endpoint, params) {
        return (0, normalize_1.requestKey)(this.name, endpoint, params);
    }
    /** GET with timeout, retry on 5xx/network, and typed error translation. */
    /** @internal */ async getJson(endpoint, params) {
        const key = this.key(endpoint, params);
        const url = new URL(`${this.baseUrl()}/${endpoint.replace(/^\//, "")}`);
        for (const [k, v] of Object.entries(params)) {
            if (v === undefined || v === null || v === "")
                continue;
            url.searchParams.set(k, String(v));
        }
        const auth = this.auth(url.toString());
        for (const [k, v] of Object.entries(auth.query ?? {}))
            url.searchParams.set(k, v);
        let lastError = {
            ok: false,
            provider: this.name,
            requestKey: key,
            fromCache: false,
            error: { code: "unknown", message: "request not attempted" },
        };
        for (let attempt = 0; attempt <= this.retries; attempt++) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.timeoutMs);
            try {
                const res = await this.fetchImpl(url.toString(), {
                    headers: { accept: "application/json", ...auth.headers },
                    signal: controller.signal,
                });
                if (res.status === 429) {
                    const retryAfter = Number(res.headers.get("retry-after") ?? 60);
                    return {
                        ok: false,
                        provider: this.name,
                        requestKey: key,
                        fromCache: false,
                        error: { code: "rate_limited", message: `${this.name} returned 429`, httpStatus: 429, retryAfterSeconds: retryAfter },
                    };
                }
                if (res.status === 401 || res.status === 403) {
                    return { ok: false, provider: this.name, requestKey: key, fromCache: false, error: { code: "auth", message: `${this.name} rejected credentials (${res.status})`, httpStatus: res.status } };
                }
                if (res.status === 404) {
                    return { ok: false, provider: this.name, requestKey: key, fromCache: false, error: { code: "not_found", message: `${this.name}: ${endpoint} not found`, httpStatus: 404 } };
                }
                if (!res.ok) {
                    lastError = { ok: false, provider: this.name, requestKey: key, fromCache: false, error: { code: "bad_response", message: `${this.name} HTTP ${res.status}`, httpStatus: res.status } };
                    if (res.status >= 500 && attempt < this.retries)
                        continue;
                    return lastError;
                }
                const body = (await res.json());
                return { ok: true, data: body, provider: this.name, fetchedAt: new Date().toISOString(), requestKey: key, fromCache: false };
            }
            catch (err) {
                const aborted = err instanceof Error && err.name === "AbortError";
                lastError = {
                    ok: false,
                    provider: this.name,
                    requestKey: key,
                    fromCache: false,
                    error: { code: aborted ? "timeout" : "network", message: aborted ? `${this.name} timed out after ${this.timeoutMs}ms` : err instanceof Error ? err.message : String(err) },
                };
                if (attempt < this.retries)
                    continue;
            }
            finally {
                clearTimeout(timer);
            }
        }
        return lastError;
    }
}
exports.BaseAdapter = BaseAdapter;
/* Capability defaults live in `withDefaults()` below rather than on BaseAdapter:
   a base method returning `ProviderResult<never>` cannot be widened by an
   override, and `implements SportsDataProvider` on BaseAdapter would force
   every adapter to implement all 16 methods by hand. */
/**
 * Mixin that supplies every interface method with a `not_supported` result.
 * Adapters extend this and `override` only the data types they really serve,
 * so an unsupported call degrades the chain instead of throwing.
 */
function withDefaults(name) {
    class AdapterWithDefaults extends BaseAdapter {
        name = name;
        getFixtures(_input) {
            return Promise.resolve((0, provider_1.notSupported)(this.name, "fixtures", this.key("fixtures", _input)));
        }
        getLiveMatches(_input) {
            return Promise.resolve((0, provider_1.notSupported)(this.name, "live_matches", this.key("live_matches", _input)));
        }
        getMatchDetail(_input) {
            return Promise.resolve((0, provider_1.notSupported)(this.name, "match_detail", this.key("match_detail", _input)));
        }
        getMatchEvents(_input) {
            return Promise.resolve((0, provider_1.notSupported)(this.name, "match_events", this.key("match_events", _input)));
        }
        getMatchStats(_input) {
            return Promise.resolve((0, provider_1.notSupported)(this.name, "match_stats", this.key("match_stats", _input)));
        }
        getMatchLineups(_input) {
            return Promise.resolve((0, provider_1.notSupported)(this.name, "match_lineups", this.key("match_lineups", _input)));
        }
        getTeam(_input) {
            return Promise.resolve((0, provider_1.notSupported)(this.name, "team", this.key("team", _input)));
        }
        getTeamSquad(_input) {
            return Promise.resolve((0, provider_1.notSupported)(this.name, "team_squad", this.key("team_squad", _input)));
        }
        getPlayer(_input) {
            return Promise.resolve((0, provider_1.notSupported)(this.name, "player", this.key("player", _input)));
        }
        getPlayerStats(_input) {
            return Promise.resolve((0, provider_1.notSupported)(this.name, "player_stats", this.key("player_stats", _input)));
        }
        getCompetition(_input) {
            return Promise.resolve((0, provider_1.notSupported)(this.name, "competition", this.key("competition", _input)));
        }
        getCompetitionSeasons(_input) {
            return Promise.resolve((0, provider_1.notSupported)(this.name, "competition_seasons", this.key("competition_seasons", _input)));
        }
        getStandings(_input) {
            return Promise.resolve((0, provider_1.notSupported)(this.name, "standings", this.key("standings", _input)));
        }
        getTopScorers(_input) {
            return Promise.resolve((0, provider_1.notSupported)(this.name, "top_scorers", this.key("top_scorers", _input)));
        }
        getVenue(_input) {
            return Promise.resolve((0, provider_1.notSupported)(this.name, "venue", this.key("venue", _input)));
        }
        healthCheck() {
            return Promise.resolve((0, provider_1.notSupported)(this.name, "health", this.key("health", {})));
        }
    }
    return AdapterWithDefaults;
}
/** Parse "45+2", "90+3'" etc. into {minute, additional}. */
function parseMinute(raw) {
    if (raw === null || raw === undefined || raw === "")
        return { minute: null, additional: null };
    const s = String(raw).trim();
    const m = s.match(/^(\d+)\s*(?:\+\s*(\d+))?/);
    if (!m)
        return { minute: null, additional: null };
    return { minute: Number(m[1]), additional: m[2] ? Number(m[2]) : null };
}
const toInt = (v) => {
    if (v === null || v === undefined || v === "")
        return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
};
exports.toInt = toInt;
const toIso = (v) => {
    if (!v)
        return null;
    const d = new Date(String(v));
    return Number.isNaN(+d) ? null : d.toISOString();
};
exports.toIso = toIso;
const str = (v) => {
    if (v === null || v === undefined)
        return null;
    const s = String(v).trim();
    return s ? s : null;
};
exports.str = str;
