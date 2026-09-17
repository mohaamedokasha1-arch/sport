/**
 * SDL · Adapter base — transport, timeouts and capability defaults.
 * Adapters only declare: base URL, auth, and how to map a response body.
 * No adapter may be imported outside the SDL (Instruction 2).
 */

import {
  notSupported,
  type DataType,
  type DateRange,
  type NormalizedCompetition,
  type NormalizedEvent,
  type NormalizedFixture,
  type NormalizedLineup,
  type NormalizedPlayer,
  type NormalizedPlayerStats,
  type NormalizedSeason,
  type NormalizedSquadMember,
  type NormalizedStandingRow,
  type NormalizedStat,
  type NormalizedTeam,
  type NormalizedTopScorer,
  type NormalizedVenue,
  type ProviderHealth,
  type ProviderName,
  type ProviderResult,
  type SportsDataProvider,
} from "../provider";
import { requestKey } from "../normalize";

export type HttpOptions = {
  /** hard timeout — a hung provider must never hang the platform */
  timeoutMs?: number;
  retries?: number;
  /** injected for tests; production uses global fetch */
  fetchImpl?: typeof fetch;
};

export abstract class BaseAdapter {
  abstract readonly name: ProviderName;
  abstract readonly capabilities: DataType[];
  abstract readonly supportedSports: string[];

  /** @internal */ timeoutMs: number;
  /** @internal */ retries: number;
  /** @internal */ fetchImpl: typeof fetch;

  constructor(/** @internal */ public http: HttpOptions = {}) {
    this.timeoutMs = this.http.timeoutMs ?? 8000;
    this.retries = this.http.retries ?? 1;
    this.fetchImpl = this.http.fetchImpl ?? (globalThis.fetch as typeof fetch);
  }

  /** subclass hook: add auth headers/query */
  /** @internal */ auth(_url: string): { headers: Record<string, string>; query?: Record<string, string> } {
    return { headers: {} };
  }

  /** @internal */ key(endpoint: string, params: Record<string, unknown>): string {
    return requestKey(this.name, endpoint, params);
  }

  /** GET with timeout, retry on 5xx/network, and typed error translation.
   *  Identical concurrent GETs (same final URL) share one in-flight request
   *  — a match page firing detail+events+stats+lineups simultaneously hits
   *  the provider once, not four times (§3.8 source protection). */
  /** @internal */ async getJson<T>(endpoint: string, params: Record<string, unknown>): Promise<ProviderResult<T>> {
    const key = this.key(endpoint, params);
    const url = new URL(`${this.baseUrl()}/${endpoint.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
    const auth = this.auth(url.toString());
    for (const [k, v] of Object.entries(auth.query ?? {})) url.searchParams.set(k, v);

    const flightKey = url.toString();
    const existing = this.inflight.get(flightKey);
    if (existing) return existing as Promise<ProviderResult<T>>;
    const flight = this.getJsonFresh<T>(url, endpoint, key, { ...auth.headers });
    this.inflight.set(flightKey, flight as Promise<ProviderResult<unknown>>);
    void flight.then(
      () => {
        if (this.inflight.get(flightKey) === flight) this.inflight.delete(flightKey);
      },
      () => {
        if (this.inflight.get(flightKey) === flight) this.inflight.delete(flightKey);
      },
    );
    return flight;
  }

  /** @internal */ inflight = new Map<string, Promise<ProviderResult<unknown>>>();

  /** Single network flight for one exact URL (called via getJson). */
  /** @internal */ async getJsonFresh<T>(url: URL, endpoint: string, key: string, headers: Record<string, string>): Promise<ProviderResult<T>> {
    let lastError: ProviderResult<T> = {
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
          headers: { accept: "application/json", ...headers },
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
          if (res.status >= 500 && attempt < this.retries) continue;
          return lastError;
        }

        const body = (await res.json()) as T;
        return { ok: true, data: body, provider: this.name, fetchedAt: new Date().toISOString(), requestKey: key, fromCache: false };
      } catch (err) {
        const aborted = err instanceof Error && err.name === "AbortError";
        lastError = {
          ok: false,
          provider: this.name,
          requestKey: key,
          fromCache: false,
          error: { code: aborted ? "timeout" : "network", message: aborted ? `${this.name} timed out after ${this.timeoutMs}ms` : err instanceof Error ? err.message : String(err) },
        };
        if (attempt < this.retries) continue;
      } finally {
        clearTimeout(timer);
      }
    }
    return lastError;
  }

  /** @internal */ abstract baseUrl(): string;
}

/* Capability defaults live in `withDefaults()` below rather than on BaseAdapter:
   a base method returning `ProviderResult<never>` cannot be widened by an
   override, and `implements SportsDataProvider` on BaseAdapter would force
   every adapter to implement all 16 methods by hand. */

/**
 * Mixin that supplies every interface method with a `not_supported` result.
 * Adapters extend this and `override` only the data types they really serve,
 * so an unsupported call degrades the chain instead of throwing.
 */
export function withDefaults<N extends ProviderName>(name: N) {
  abstract class AdapterWithDefaults extends BaseAdapter implements SportsDataProvider {
    readonly name = name;

    getFixtures(_input: { sport: string; competitionProviderId?: string; range?: DateRange; date?: string }): Promise<ProviderResult<NormalizedFixture[]>> {
      return Promise.resolve(notSupported(this.name, "fixtures", this.key("fixtures", _input)));
    }
    getLiveMatches(_input: { sport: string }): Promise<ProviderResult<NormalizedFixture[]>> {
      return Promise.resolve(notSupported(this.name, "live_matches", this.key("live_matches", _input)));
    }
    getMatchDetail(_input: { providerMatchId: string; sport?: string }): Promise<ProviderResult<NormalizedFixture>> {
      return Promise.resolve(notSupported(this.name, "match_detail", this.key("match_detail", _input)));
    }
    getMatchEvents(_input: { providerMatchId: string; sport?: string }): Promise<ProviderResult<NormalizedEvent[]>> {
      return Promise.resolve(notSupported(this.name, "match_events", this.key("match_events", _input)));
    }
    getMatchStats(_input: { providerMatchId: string; sport?: string }): Promise<ProviderResult<NormalizedStat[]>> {
      return Promise.resolve(notSupported(this.name, "match_stats", this.key("match_stats", _input)));
    }
    getMatchLineups(_input: { providerMatchId: string; sport?: string }): Promise<ProviderResult<NormalizedLineup[]>> {
      return Promise.resolve(notSupported(this.name, "match_lineups", this.key("match_lineups", _input)));
    }
    getTeam(_input: { providerTeamId: string }): Promise<ProviderResult<NormalizedTeam>> {
      return Promise.resolve(notSupported(this.name, "team", this.key("team", _input)));
    }
    getTeamSquad(_input: { providerTeamId: string }): Promise<ProviderResult<NormalizedSquadMember[]>> {
      return Promise.resolve(notSupported(this.name, "team_squad", this.key("team_squad", _input)));
    }
    getPlayer(_input: { providerPlayerId: string }): Promise<ProviderResult<NormalizedPlayer>> {
      return Promise.resolve(notSupported(this.name, "player", this.key("player", _input)));
    }
    getPlayerStats(_input: { providerPlayerId: string; season?: string; sport?: string }): Promise<ProviderResult<NormalizedPlayerStats>> {
      return Promise.resolve(notSupported(this.name, "player_stats", this.key("player_stats", _input)));
    }
    getCompetition(_input: { providerCompetitionId: string }): Promise<ProviderResult<NormalizedCompetition>> {
      return Promise.resolve(notSupported(this.name, "competition", this.key("competition", _input)));
    }
    getCompetitionSeasons(_input: { providerCompetitionId: string }): Promise<ProviderResult<NormalizedSeason[]>> {
      return Promise.resolve(notSupported(this.name, "competition_seasons", this.key("competition_seasons", _input)));
    }
    getStandings(_input: { providerCompetitionId: string; season?: string; sport?: string }): Promise<ProviderResult<NormalizedStandingRow[]>> {
      return Promise.resolve(notSupported(this.name, "standings", this.key("standings", _input)));
    }
    getTopScorers(_input: { providerCompetitionId: string; season?: string; sport?: string }): Promise<ProviderResult<NormalizedTopScorer[]>> {
      return Promise.resolve(notSupported(this.name, "top_scorers", this.key("top_scorers", _input)));
    }
    getVenue(_input: { providerVenueId: string }): Promise<ProviderResult<NormalizedVenue>> {
      return Promise.resolve(notSupported(this.name, "venue", this.key("venue", _input)));
    }
    healthCheck(): Promise<ProviderResult<ProviderHealth>> {
      return Promise.resolve(notSupported(this.name, "health", this.key("health", {})));
    }
  }
  return AdapterWithDefaults;
}

/** Parse "45+2", "90+3'" etc. into {minute, additional}. */
export function parseMinute(raw: unknown): { minute: number | null; additional: number | null } {
  if (raw === null || raw === undefined || raw === "") return { minute: null, additional: null };
  const s = String(raw).trim();
  const m = s.match(/^(\d+)\s*(?:\+\s*(\d+))?/);
  if (!m) return { minute: null, additional: null };
  return { minute: Number(m[1]), additional: m[2] ? Number(m[2]) : null };
}

export const toInt = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

export const toIso = (v: unknown): string | null => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(+d) ? null : d.toISOString();
};

export const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};
