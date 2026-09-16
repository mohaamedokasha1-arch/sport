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

import { withDefaults, parseMinute, str, toInt, toIso, type HttpOptions } from "./base";
import type { DataType, ProviderResult } from "../provider";
import type {
  NormalizedCompetition,
  NormalizedEvent,
  NormalizedFixture,
  NormalizedPlayer,
  NormalizedPlayerStats,
  NormalizedStandingRow,
  NormalizedStat,
  NormalizedTeam,
  NormalizedTopScorer,
  NormalizedVenue,
} from "../provider";
import type { ProviderHealth } from "../provider";

export type ApiFootballConfig = HttpOptions & { apiKey?: string; host?: string };

type Envelope<T> = {
  get?: string;
  parameters?: Record<string, unknown>;
  errors?: Record<string, string> | string[];
  results?: number;
  paging?: { current: number; total: number };
  response?: T[];
};

type AfFixture = {
  fixture: {
    id: number;
    referee: string | null;
    timezone: string;
    date: string;
    timestamp: number;
    periods: { first: number | null; second: number | null };
    venue: { id: number | null; name: string | null; city: string | null };
    status: { long: string; short: string; elapsed: number | null; extra: number | null };
  };
  league: { id: number; name: string; country: string; logo: string; season: number; round: string | null };
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null };
    away: { id: number; name: string; logo: string; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
    extratime: { home: number | null; away: number | null };
    penalty: { home: number | null; away: number | null };
  };
};

type AfEvent = {
  time: { elapsed: number | null; extra: number | null };
  team: { id: number; name: string };
  player: { id: number | null; name: string | null };
  assist: { id: number | null; name: string | null };
  type: string;
  detail: string;
  comments: string | null;
};

type AfStatistic = { team: { id: number; name: string }; statistics: { type: string; value: string | number | null }[] };

type AfTeam = {
  team: { id: number; name: string; code: string | null; country: string; founded: number | null; national: boolean; logo: string };
  venue: { id: number | null; name: string | null; city: string | null; capacity: number | null };
};

type AfStanding = {
  league: {
    standings: {
      rank: number;
      team: { id: number; name: string };
      group: string;
      form: string | null;
      all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
      goalsDiff: number;
      points: number;
      description: string | null;
    }[][];
  };
};

/** API-Football short status → NEMO canonical status. */
export const AF_STATUS: Record<string, string> = {
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

export class ApiFootballAdapter extends withDefaults("api_football") {
  readonly capabilities: DataType[] = [
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
  readonly supportedSports = ["football"];

  private apiKey: string | null;
  private host: string | null;

  constructor(cfg: ApiFootballConfig = {}) {
    super(cfg);
    this.apiKey = cfg.apiKey ?? process.env.API_FOOTBALL_KEY ?? null;
    this.host = cfg.host ?? null;
  }

  /** @internal */ override baseUrl(): string {
    return "https://v3.football.api-sports.io";
  }

  /** @internal */ override auth(): { headers: Record<string, string> } {
    const headers: Record<string, string> = {};
    if (this.host) {
      // RapidAPI surface
      headers["x-rapidapi-key"] = this.apiKey ?? "";
      headers["x-rapidapi-host"] = this.host;
    } else {
      headers["x-apisports-key"] = this.apiKey ?? "";
    }
    return { headers };
  }

  /** Envelope check: API-Football returns HTTP 200 even for quota/auth errors. */
  private unwrap<T>(res: ProviderResult<Envelope<T>>): ProviderResult<T[]> {
    if (!res.ok) return res;
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

  private fixture(f: AfFixture): NormalizedFixture {
    const minute = f.fixture.status.elapsed ?? null;
    return {
      providerId: String(f.fixture.id),
      sport: "football",
      competitionProviderId: String(f.league.id),
      seasonProviderId: f.league.season ? String(f.league.season) : null,
      round: str(f.league.round),
      homeProviderId: f.teams.home?.id != null ? String(f.teams.home.id) : null,
      awayProviderId: f.teams.away?.id != null ? String(f.teams.away.id) : null,
      scheduledAt: toIso(f.fixture.date) ?? new Date(f.fixture.timestamp * 1000).toISOString(),
      status: AF_STATUS[f.fixture.status.short] ?? "scheduled",
      homeScore: f.goals.home ?? null,
      awayScore: f.goals.away ?? null,
      periods: [
        { label: "HT", home: f.score.halftime.home, away: f.score.halftime.away },
        { label: "FT", home: f.score.fulltime.home, away: f.score.fulltime.away },
        { label: "ET", home: f.score.extratime.home, away: f.score.extratime.away },
        { label: "PEN", home: f.score.penalty.home, away: f.score.penalty.away },
      ].filter((p) => p.home !== null || p.away !== null),
      venueProviderId: f.fixture.venue?.id != null ? String(f.fixture.venue.id) : null,
      venueName: str(f.fixture.venue?.name),
      attendance: null,
      minute,
    };
  }

  override async getFixtures(input: { sport: string; competitionProviderId?: string; range?: { from: string; to: string }; date?: string }): Promise<ProviderResult<NormalizedFixture[]>> {
    if (input.sport !== "football") {
      return { ok: false, provider: this.name, requestKey: this.key("fixtures", input), fromCache: false, error: { code: "not_supported", message: "api-football is football-only" } };
    }
    const params: Record<string, unknown> = {};
    if (input.date) params.date = input.date;
    if (input.range) {
      params.from = input.range.from.slice(0, 10);
      params.to = input.range.to.slice(0, 10);
    }
    if (input.competitionProviderId) {
      params.league = input.competitionProviderId;
      if (!input.range && !input.date) params.season = new Date().getFullYear();
    }
    const res = await this.getJson<Envelope<AfFixture>>("fixtures", params);
    const list = this.unwrap(res);
    if (!list.ok) return list;
    return { ok: true, data: list.data.map((f) => this.fixture(f)), provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
  }

  override async getLiveMatches(input: { sport: string }): Promise<ProviderResult<NormalizedFixture[]>> {
    if (input.sport !== "football") {
      return { ok: false, provider: this.name, requestKey: this.key("fixtures", { live: "all" }), fromCache: false, error: { code: "not_supported", message: "api-football is football-only" } };
    }
    const res = await this.getJson<Envelope<AfFixture>>("fixtures", { live: "all" });
    const list = this.unwrap(res);
    if (!list.ok) return list;
    return { ok: true, data: list.data.map((f) => this.fixture(f)), provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
  }

  override async getMatchDetail(input: { providerMatchId: string }): Promise<ProviderResult<NormalizedFixture>> {
    const res = await this.getJson<Envelope<AfFixture>>("fixtures", { id: input.providerMatchId });
    const list = this.unwrap(res);
    if (!list.ok) return list;
    if (!list.data.length) return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `fixture ${input.providerMatchId} not found` } };
    return { ok: true, data: this.fixture(list.data[0]), provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
  }

  override async getMatchEvents(input: { providerMatchId: string }): Promise<ProviderResult<NormalizedEvent[]>> {
    const res = await this.getJson<Envelope<AfEvent>>("fixtures/events", { fixture: input.providerMatchId });
    const list = this.unwrap(res);
    if (!list.ok) return list;
    const data = list.data.map((e) => {
      const m = parseMinute(e.time?.elapsed != null && e.time.extra != null ? `${e.time.elapsed}+${e.time.extra}` : e.time?.elapsed);
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
        description: str(e.comments) ?? str(e.detail),
      };
    });
    return { ok: true, data, provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
  }

  override async getMatchStats(input: { providerMatchId: string }): Promise<ProviderResult<NormalizedStat[]>> {
    const res = await this.getJson<Envelope<AfStatistic>>("fixtures/statistics", { fixture: input.providerMatchId });
    const list = this.unwrap(res);
    if (!list.ok) return list;
    const out: NormalizedStat[] = [];
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

  override async getTeam(input: { providerTeamId: string }): Promise<ProviderResult<NormalizedTeam>> {
    const res = await this.getJson<Envelope<AfTeam>>("teams", { id: input.providerTeamId });
    const list = this.unwrap(res);
    if (!list.ok) return list;
    const t = list.data[0];
    if (!t) return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `team ${input.providerTeamId} not found` } };
    return {
      ok: true,
      data: {
        providerId: String(t.team.id),
        name: t.team.name,
        shortName: null,
        abbreviation: str(t.team.code),
        countryCode: null,
        countryName: str(t.team.country),
        logoUrl: str(t.team.logo),
        foundedYear: toInt(t.team.founded),
        venueName: str(t.venue?.name),
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

  override async getPlayer(input: { providerPlayerId: string }): Promise<ProviderResult<NormalizedPlayer>> {
    const res = await this.getJson<Envelope<{ player: { id: number; name: string; firstname: string; lastname: string; birth: { date: string | null }; nationality: string; height: string; weight: string; photo: string }; statistics: { team: { id: number }; games: { position: string | null; number: number | null }[] }[] }>>("players", { id: input.providerPlayerId });
    const list = this.unwrap(res);
    if (!list.ok) return list;
    const p = list.data[0];
    if (!p) return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `player ${input.providerPlayerId} not found` } };
    const heightCm = p.player.height ? toInt(parseFloat(p.player.height)) : null;
    const weightKg = p.player.weight ? toInt(parseFloat(p.player.weight)) : null;
    return {
      ok: true,
      data: {
        providerId: String(p.player.id),
        fullName: p.player.name,
        dateOfBirth: toIso(p.player.birth?.date),
        countryCode: null,
        position: str(p.statistics?.[0]?.games?.[0]?.position),
        photoUrl: str(p.player.photo),
        photoAttribution: str(p.player.photo) ? "API-Football (api-sports.io)" : null,
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

  override async getPlayerStats(input: { providerPlayerId: string; season?: string }): Promise<ProviderResult<NormalizedPlayerStats>> {
    const params: Record<string, unknown> = { id: input.providerPlayerId };
    if (input.season) params.season = input.season;
    const res = await this.getJson<Envelope<{ statistics: { league: { season: number }; games: { appearences: number | null; minutes: number | null; position: string | null; rating: string | null }; goals: { total: number | null; penalty: number | null }; cards: { yellow: number | null; red: number | null }; goals_assists?: unknown; passes?: unknown }[] }>>("players", params);
    const list = this.unwrap(res);
    if (!list.ok) return list;
    const st = list.data[0]?.statistics?.[0];
    if (!st) return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `no stats for player ${input.providerPlayerId}` } };
    return {
      ok: true,
      data: {
        providerId: input.providerPlayerId,
        seasonName: st.league?.season ? String(st.league.season) : null,
        appearances: toInt(st.games?.appearences),
        goals: toInt(st.goals?.total),
        assists: null,
        minutes: toInt(st.games?.minutes),
        yellowCards: toInt(st.cards?.yellow),
        redCards: toInt(st.cards?.red),
        rating: st.games?.rating ? Number(st.games.rating) : null,
        extra: { penalties: toInt(st.goals?.penalty) ?? 0, position: st.games?.position ?? "" },
      },
      provider: this.name,
      fetchedAt: list.fetchedAt,
      requestKey: list.requestKey,
      fromCache: false,
    };
  }

  override async getCompetition(input: { providerCompetitionId: string }): Promise<ProviderResult<NormalizedCompetition>> {
    const res = await this.getJson<Envelope<{ league: { id: number; name: string; type: string; logo: string }; country: { name: string; code: string | null } }>>("leagues", { id: input.providerCompetitionId });
    const list = this.unwrap(res);
    if (!list.ok) return list;
    const l = list.data[0];
    if (!l) return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `league ${input.providerCompetitionId} not found` } };
    return {
      ok: true,
      data: {
        providerId: String(l.league.id),
        name: l.league.name,
        shortName: null,
        countryCode: str(l.country?.code),
        countryName: str(l.country?.name),
        type: str(l.league.type)?.toLowerCase() ?? null,
        logoUrl: str(l.league.logo),
      },
      provider: this.name,
      fetchedAt: list.fetchedAt,
      requestKey: list.requestKey,
      fromCache: false,
    };
  }

  override async getStandings(input: { providerCompetitionId: string; season?: string }): Promise<ProviderResult<NormalizedStandingRow[]>> {
    const params: Record<string, unknown> = { league: input.providerCompetitionId, season: input.season ?? new Date().getFullYear() };
    const res = await this.getJson<Envelope<AfStanding>>("standings", params);
    const list = this.unwrap(res);
    if (!list.ok) return list;
    const groups = list.data[0]?.league?.standings ?? [];
    const out: NormalizedStandingRow[] = [];
    for (const group of groups) {
      for (const row of group) {
        out.push({
          teamProviderId: String(row.team.id),
          group: str(row.group),
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

  override async getTopScorers(input: { providerCompetitionId: string; season?: string }): Promise<ProviderResult<NormalizedTopScorer[]>> {
    const params: Record<string, unknown> = { league: input.providerCompetitionId, season: input.season ?? new Date().getFullYear() };
    const res = await this.getJson<Envelope<{ player: { id: number; photo: string }; statistics: { team: { id: number }; goals: { total: number | null; penalty: number | null }; games: { appearences: number | null } }[] }>>("players/topscorers", params);
    const list = this.unwrap(res);
    if (!list.ok) return list;
    const out: NormalizedTopScorer[] = list.data.map((row) => {
      const st = row.statistics?.[0];
      return {
        playerProviderId: String(row.player.id),
        teamProviderId: st?.team?.id != null ? String(st.team.id) : null,
        goals: toInt(st?.goals?.total) ?? 0,
        appearances: toInt(st?.games?.appearences),
        penalties: toInt(st?.goals?.penalty),
      };
    });
    return { ok: true, data: out, provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
  }

  override async getVenue(input: { providerVenueId: string }): Promise<ProviderResult<NormalizedVenue>> {
    const res = await this.getJson<Envelope<{ id: number; name: string; city: string; capacity: number | null; address: string | null }>>("venues", { id: input.providerVenueId });
    const list = this.unwrap(res);
    if (!list.ok) return list;
    const v = list.data[0];
    if (!v) return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `venue ${input.providerVenueId} not found` } };
    return {
      ok: true,
      data: { providerId: String(v.id), name: v.name, city: str(v.city), countryCode: null, capacity: toInt(v.capacity), lat: null, lng: null },
      provider: this.name,
      fetchedAt: list.fetchedAt,
      requestKey: list.requestKey,
      fromCache: false,
    };
  }

  /** `/status` doubles as the health check and returns the remaining quota. */
  override async healthCheck(): Promise<ProviderResult<ProviderHealth>> {
    const startedAt = Date.now();
    const res = await this.getJson<{ response?: { account: unknown; subscription: unknown; rateLimit: unknown }[]; results?: number }>("status", {});
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

function mapEventType(type: string, detail: string): string {
  if (type === "Goal") return detail.includes("own") ? "own_goal" : "goal";
  if (type === "Card") {
    if (detail.includes("red") && detail.includes("yellow")) return "yellow_red_card";
    return detail.includes("red") ? "red_card" : "yellow_card";
  }
  if (type === "subst") return "substitution";
  if (type === "Var") return detail.includes("cancelled") || detail.includes("goal cancelled") ? "var_decision" : "var_review";
  return detail.toLowerCase().replace(/\s+/g, "_") || "unknown";
}

function parseForm(form: string | null | undefined): ("W" | "D" | "L")[] {
  if (!form) return [];
  return form
    .split("")
    .filter((c) => c === "W" || c === "D" || c === "L")
    .slice(-5);
}

function mapStandingStatus(description: string | null | undefined): string | null {
  if (!description) return null;
  const d = description.toLowerCase();
  if (d.includes("champions league") || d.includes("promotion")) return d.includes("playoff") ? "promotion_playoff" : "promotion";
  if (d.includes("relegation")) return d.includes("playoff") ? "relegation_playoff" : "relegation";
  if (d.includes("europa") || d.includes("conference") || d.includes("cup")) return "cup_position";
  return null;
}
