/**
 * SDL · Football-Data.org adapter — API v4, doc-verified.
 * ──────────────────────────────────────────────────────
 * Base URL : https://api.football-data.org/v4
 * Auth     : `X-Auth-Token: <api-key>` request header
 * Plans    : free tier = 12 competitions, 10 requests/minute, delayed scores;
 *            the endpoint list is otherwise identical across plans.
 *
 * Why this adapter exists: football-data.org is the platform's free-and-
 * reliable football source. It carries the major-league surfaces — league
 * tables, the day's fixtures/results and the scorer list — while every request
 * still travels through the SDL, so caching, rate limiting, failover and
 * canonical mapping apply to it exactly as they do to a paid provider.
 *
 * Hard rules implemented here:
 *  · the API key never leaves the server: it is injected from environment
 *    variables by the composition root and only ever written into a request
 *    header — it is not part of any URL, log line, cache key or response;
 *  · no provider payload escapes: only `Normalized*` shapes are returned;
 *  · a plan-restricted resource (403 "… not available with your current plan")
 *    is reported as `not_supported` so the chain degrades to the next real
 *    provider instead of marking the whole provider unhealthy;
 *  · a failing or unavailable upstream yields a typed error — never mock data.
 *
 * Endpoints used (all GET, all under /v4):
 *   /competitions                                   → health + available codes
 *   /competitions/{code}                            → competition metadata
 *   /competitions/{code}/standings?season=YYYY      → league table (TOTAL type)
 *   /competitions/{code}/scorers?season=YYYY&limit= → top scorers
 *   /competitions/{code}/matches?…                  → matches of one competition
 *   /matches?date=|dateFrom=&dateTo=&status=LIVE    → the day's matches / live
 *   /matches/{id}                                   → match detail
 *   /teams/{id}                                     → team metadata
 *
 * NOTE on scorers: football-data.org only serves `/competitions/{code}/scorers`
 * on plans that include goal-scorer data. On the free plan the call answers
 * 403 and this adapter reports `not_supported`; the UI then shows the honest
 * "data temporarily unavailable" state for that block instead of invented names.
 */

import { parseMinute, str, toInt, toIso, withDefaults, type HttpOptions } from "./base";
import { notSupported, type DataType, type NormalizedCompetition, type NormalizedFixture, type NormalizedStandingRow, type NormalizedTeam, type NormalizedTopScorer, type ProviderError, type ProviderHealth, type ProviderResult } from "../provider";

export const FOOTBALL_DATA_BASE_URL = "https://api.football-data.org/v4";

/** Public home of the data source — the attribution link required by its terms. */
export const FOOTBALL_DATA_HOME = "https://www.football-data.org/";

export type FootballDataConfig = HttpOptions & {
  apiKey?: string;
  baseUrl?: string;
  /** season filter (the API expects the starting year, e.g. "2025") */
  season?: string;
  /** competitions used when a request is not scoped to one (default: majors) */
  competitions?: string[];
};

export type FootballDataCompetition = {
  /** official football-data.org competition code */
  code: string;
  name: string;
  nameAr: string;
  country: string;
  countryAr: string;
  /** featured = shown in the majors surfaces (the five leagues + the CL) */
  featured: boolean;
  /** alias used by the keyless SportScore provider, so one slug drives both */
  sportscoreSlug: string | null;
};

/**
 * The competitions this platform shows by default. The first six are the
 * "major leagues" surfaces; the rest belong to the free tier's 12 and are
 * reachable through the API/weekly jobs without any code change.
 */
export const FOOTBALL_DATA_COMPETITIONS: FootballDataCompetition[] = [
  { code: "PL", name: "Premier League", nameAr: "الدوري الإنجليزي الممتاز", country: "England", countryAr: "إنجلترا", featured: true, sportscoreSlug: "english-premier-league" },
  { code: "PD", name: "La Liga", nameAr: "الدوري الإسباني", country: "Spain", countryAr: "إسبانيا", featured: true, sportscoreSlug: "spanish-la-liga" },
  { code: "SA", name: "Serie A", nameAr: "الدوري الإيطالي", country: "Italy", countryAr: "إيطاليا", featured: true, sportscoreSlug: "italian-serie-a" },
  { code: "BL1", name: "Bundesliga", nameAr: "الدوري الألماني", country: "Germany", countryAr: "ألمانيا", featured: true, sportscoreSlug: "bundesliga" },
  { code: "FL1", name: "Ligue 1", nameAr: "الدوري الفرنسي", country: "France", countryAr: "فرنسا", featured: true, sportscoreSlug: "french-ligue-1" },
  { code: "CL", name: "UEFA Champions League", nameAr: "دوري أبطال أوروبا", country: "Europe", countryAr: "أوروبا", featured: true, sportscoreSlug: "uefa-champions-league" },
  { code: "DED", name: "Eredivisie", nameAr: "الدوري الهولندي", country: "Netherlands", countryAr: "هولندا", featured: false, sportscoreSlug: "eredivisie" },
  { code: "PPL", name: "Primeira Liga", nameAr: "الدوري البرتغالي", country: "Portugal", countryAr: "البرتغال", featured: false, sportscoreSlug: "portuguese-primeira-liga" },
  { code: "ELC", name: "Championship", nameAr: "دوري البطولة الإنجليزية", country: "England", countryAr: "إنجلترا", featured: false, sportscoreSlug: "english-championship" },
  { code: "BSA", name: "Campeonato Brasileiro Série A", nameAr: "الدوري البرازيلي", country: "Brazil", countryAr: "البرازيل", featured: false, sportscoreSlug: "brazilian-serie-a" },
  { code: "WC", name: "FIFA World Cup", nameAr: "كأس العالم", country: "World", countryAr: "العالم", featured: false, sportscoreSlug: "fifa-world-cup" },
  { code: "EC", name: "European Championship", nameAr: "كأس أوروبا", country: "Europe", countryAr: "أوروبا", featured: false, sportscoreSlug: "uefa-euro" },
];

/** Codes shown in the majors surfaces unless the operator overrides them. */
export const FOOTBALL_DATA_DEFAULT_CODES: string[] = FOOTBALL_DATA_COMPETITIONS.filter((c) => c.featured).map((c) => c.code);

/** Competition metadata by code (names are rendered from the provider's own data too). */
export const footballDataCompetition = (code: string): FootballDataCompetition | undefined =>
  FOOTBALL_DATA_COMPETITIONS.find((c) => c.code === code.toUpperCase());

/**
 * Alias index: every spelling a caller may use (official code, SportScore slug,
 * English/Arabic name, common short forms) resolves to the official code.
 */
const ALIASES: Map<string, string> = (() => {
  const map = new Map<string, string>();
  const key = (v: string | null | undefined) =>
    (v ?? "")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[_\s]+/g, "-")
      .replace(/[^a-z0-9\u0600-\u06ff-]/g, "");
  const add = (alias: string | null | undefined, code: string) => {
    const k = key(alias);
    if (k && !map.has(k)) map.set(k, code);
  };
  for (const c of FOOTBALL_DATA_COMPETITIONS) {
    add(c.code, c.code);
    add(c.name, c.code);
    add(c.nameAr, c.code);
    add(c.sportscoreSlug, c.code);
    add(`${c.code}-${c.name}`, c.code);
  }
  // short forms people actually type
  const short: Record<string, string> = {
    epl: "PL",
    "premier-league": "PL",
    "english-premier-league": "PL",
    "la-liga": "PD",
    laliga: "PD",
    "spanish-la-liga": "PD",
    "primera-division": "PD",
    "serie-a": "SA",
    "italian-serie-a": "SA",
    bundesliga: "BL1",
    "german-bundesliga": "BL1",
    "ligue-1": "FL1",
    "french-ligue-1": "FL1",
    "champions-league": "CL",
    "uefa-champions-league": "CL",
    ucl: "CL",
    eredivisie: "DED",
    "primeira-liga": "PPL",
    "championship": "ELC",
    "brasileirao": "BSA",
    "world-cup": "WC",
    "euro": "EC",
  };
  for (const [alias, code] of Object.entries(short)) add(alias, code);
  return map;
})();

/** Resolve any accepted competition identifier to an official code (or null). */
export function footballDataCode(id: string | null | undefined): string | null {
  if (!id) return null;
  const raw = String(id).trim();
  if (/^\d{2,4}$/.test(raw)) {
    // numeric ids: 2000-series competition ids used by the API
    const byId: Record<string, string> = { "2021": "PL", "2014": "PD", "2019": "SA", "2002": "BL1", "2015": "FL1", "2001": "CL" };
    return byId[raw] ?? null;
  }
  return ALIASES.get(raw.toLowerCase().replace(/[_\s]+/g, "-")) ?? null;
}

/* ── provider payload shapes (v4) ─────────────────────────── */

type FdTeamRef = {
  id: number;
  name?: string | null;
  shortName?: string | null;
  tla?: string | null;
  crest?: string | null;
  address?: string | null;
  website?: string | null;
  founded?: number | null;
  clubColors?: string | null;
  venue?: string | null;
  area?: { code?: string | null; name?: string | null } | null;
};

type FdArea = { id?: number; name?: string | null; code?: string | null; flag?: string | null };

type FdCompetitionRef = { id: number; name?: string | null; code?: string | null; type?: string | null; emblem?: string | null };

type FdScore = {
  winner?: string | null;
  duration?: string | null;
  fullTime?: { home?: number | null; away?: number | null } | null;
  halfTime?: { home?: number | null; away?: number | null } | null;
  regularTime?: { home?: number | null; away?: number | null } | null;
  penalties?: { home?: number | null; away?: number | null } | null;
};

type FdMatch = {
  id: number;
  utcDate?: string | null;
  status?: string | null;
  minute?: number | string | null;
  injuryTime?: number | null;
  attendance?: number | null;
  venue?: string | null;
  matchday?: number | null;
  stage?: string | null;
  group?: string | null;
  lastUpdated?: string | null;
  homeTeam?: FdTeamRef | null;
  awayTeam?: FdTeamRef | null;
  competition?: FdCompetitionRef | null;
  season?: { id?: number; startDate?: string | null; endDate?: string | null; currentMatchday?: number | null } | null;
  area?: FdArea | null;
  score?: FdScore | null;
};

type FdStandingRow = {
  position?: number | null;
  team?: FdTeamRef | null;
  playedGames?: number | null;
  form?: string | null;
  won?: number | null;
  draw?: number | null;
  lost?: number | null;
  points?: number | null;
  goalsFor?: number | null;
  goalsAgainst?: number | null;
  goalDifference?: number | null;
};

type FdStandingsResponse = {
  competition?: FdCompetitionRef | null;
  season?: { id?: number; startDate?: string | null; endDate?: string | null } | null;
  standings?: { stage?: string | null; type?: string | null; group?: string | null; table?: FdStandingRow[] | null }[] | null;
  message?: string | null;
};

type FdScorersResponse = {
  competition?: FdCompetitionRef | null;
  season?: { id?: number; startDate?: string | null } | null;
  scorers?: {
    player?: { id?: number; name?: string | null; position?: string | null; nationality?: string | null } | null;
    team?: FdTeamRef | null;
    playedMatches?: number | null;
    goals?: number | null;
    assists?: number | null;
    penalties?: number | null;
  }[] | null;
  message?: string | null;
};

type FdMatchesResponse = { matches?: FdMatch[] | null; message?: string | null };

type FdTeamResponse = FdTeamRef & { runningCompetitions?: FdCompetitionRef[] | null; squad?: unknown[] | null; message?: string | null };

type FdErrorBody = { message?: string | null; errorCode?: number | null };

/* ── status vocabulary ────────────────────────────────────── */

/** football-data.org status → canonical NEMO match status. */
export const FD_STATUS: Record<string, string> = {
  SCHEDULED: "scheduled",
  TIMED: "scheduled",
  IN_PLAY: "live",
  PAUSED: "halftime",
  FINISHED: "finished",
  SUSPENDED: "suspended",
  POSTPONED: "postponed",
  CANCELLED: "cancelled",
  AWARDED: "awarded",
};

const mapStatus = (raw: string | null | undefined): string => FD_STATUS[(raw ?? "").toUpperCase()] ?? "scheduled";

const parseForm = (raw: string | null | undefined): ("W" | "D" | "L")[] =>
  (raw ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c): c is "W" | "D" | "L" => c === "W" || c === "D" || c === "L");

const utcDay = (offsetDays = 0): string => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

export class FootballDataAdapter extends withDefaults("football_data") {
  readonly capabilities: DataType[] = ["fixtures", "live_matches", "match_detail", "results", "standings", "top_scorers", "competition", "team", "health"];
  readonly supportedSports: string[] = ["football"];

  private apiKey: string;
  private base: string;
  private season: string | null;
  private codes: string[];

  /** last quota headers seen from the API — surfaced by `quota()`, never cached as data */
  private quota: { requestsAvailableMinute: number | null; resetSeconds: number | null; at: string } = {
    requestsAvailableMinute: null,
    resetSeconds: null,
    at: new Date().toISOString(),
  };

  constructor(cfg: FootballDataConfig = {}) {
    super(cfg);
    this.apiKey = cfg.apiKey ?? "";
    this.base = (cfg.baseUrl ?? FOOTBALL_DATA_BASE_URL).replace(/\/$/, "");
    this.season = cfg.season ?? null;
    this.codes = (cfg.competitions ?? FOOTBALL_DATA_DEFAULT_CODES).map((c) => footballDataCode(c) ?? c.toUpperCase());
  }

  override baseUrl(): string {
    return this.base;
  }

  override auth(): { headers: Record<string, string> } {
    // The key is written into a header only. It is never appended to the URL,
    // never logged, never cached and never returned in a payload.
    return { headers: this.apiKey ? { "X-Auth-Token": this.apiKey } : {} };
  }

  /**
   * Read the published quota headers on every response. `X-Requests-Available-Minute`
   * is the provider telling us how much of the 10/min free budget is left — the
   * scheduler can back off before a 429 instead of after one.
   */
  override observe(res: Response): void {
    const available = res.headers.get("x-requests-available-minute");
    const reset = res.headers.get("x-requestcounter-reset");
    if (available === null && reset === null) return;
    this.quota = {
      requestsAvailableMinute: available === null ? null : toInt(available),
      resetSeconds: reset === null ? null : toInt(reset),
      at: new Date().toISOString(),
    };
  }

  /** Quota state seen on the last response (for /api/v1/football-data/status). */
  quotaSnapshot(): { requestsAvailableMinute: number | null; resetSeconds: number | null; at: string } {
    return { ...this.quota };
  }

  /**
   * 403 is overloaded by this provider: it means "your plan does not include
   * this resource" far more often than "your token is wrong". Only the second
   * case should mark the provider unhealthy; the first is a capability gap and
   * belongs in `not_supported`, which the orchestrator skips quietly.
   */
  override refineError(status: number, body: unknown, fallback: ProviderError): ProviderError {
    const message = str((body as FdErrorBody | null)?.message) ?? "";
    const lower = message.toLowerCase();
    const planRestricted =
      /plan|subscription|subscri|upgrade|not available|not included|permission|access|restricted|tier/.test(lower) ||
      (status === 403 && lower.includes("resource"));
    if (planRestricted) {
      return {
        code: "not_supported",
        message: `football_data: ${message || `resource restricted by the current plan (${status})`}`,
        httpStatus: status,
      };
    }
    if (status === 400 && /token|api key/i.test(lower)) {
      return { code: "auth", message: `football_data: ${message || "invalid API token"}`, httpStatus: status };
    }
    return message ? { ...fallback, message: `football_data: ${message}` } : fallback;
  }

  /* ── endpoints ──────────────────────────────────────────── */

  override async getStandings(input: { providerCompetitionId: string; season?: string; sport?: string }): Promise<ProviderResult<NormalizedStandingRow[]>> {
    const code = footballDataCode(input.providerCompetitionId);
    if (!code) return this.unknownCompetition(input.providerCompetitionId, "standings", { providerCompetitionId: input.providerCompetitionId });
    const params = this.seasonParams({ season: input.season });
    const res = await this.getJson<FdStandingsResponse>(`competitions/${code}/standings`, params);
    if (!res.ok) return res;

    const rows: NormalizedStandingRow[] = [];
    for (const table of res.data.standings ?? []) {
      const type = (table.type ?? "TOTAL").toUpperCase();
      // TOTAL is the real league table; HOME/AWAY are filtered views of it and
      // must never be merged in (they would duplicate every team).
      if (type !== "TOTAL") continue;
      const stage = (table.stage ?? "").toUpperCase();
      const group = str(table.group) ?? (stage && stage !== "REGULAR_SEASON" ? stage : null);
      for (const r of table.table ?? []) {
        const team = r.team;
        const position = toInt(r.position);
        if (!team?.id || position === null) continue;
        rows.push({
          teamProviderId: String(team.id),
          group,
          position,
          played: toInt(r.playedGames) ?? 0,
          won: toInt(r.won) ?? 0,
          drawn: toInt(r.draw) ?? 0,
          lost: toInt(r.lost) ?? 0,
          goalsFor: toInt(r.goalsFor) ?? 0,
          goalsAgainst: toInt(r.goalsAgainst) ?? 0,
          points: toInt(r.points) ?? 0,
          form: parseForm(r.form),
          status: null,
          teamName: str(team.name),
          teamShortName: str(team.shortName) ?? str(team.tla),
          teamLogoUrl: str(team.crest),
        });
      }
    }
    if (rows.length === 0) return this.empty(`no standings published for ${code} yet`, "standings", params);
    return { ok: true, data: rows, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  override async getTopScorers(input: { providerCompetitionId: string; season?: string; sport?: string }): Promise<ProviderResult<NormalizedTopScorer[]>> {
    const code = footballDataCode(input.providerCompetitionId);
    if (!code) return this.unknownCompetition(input.providerCompetitionId, "top_scorers", { providerCompetitionId: input.providerCompetitionId });
    const params = { ...this.seasonParams({ season: input.season }), limit: "20" };
    const res = await this.getJson<FdScorersResponse>(`competitions/${code}/scorers`, params);
    if (!res.ok) return res;

    const scorers: NormalizedTopScorer[] = [];
    for (const s of res.data.scorers ?? []) {
      const goals = toInt(s.goals);
      if (!s.player?.id || goals === null) continue;
      scorers.push({
        playerProviderId: String(s.player.id),
        playerName: str(s.player.name),
        teamProviderId: s.team?.id ? String(s.team.id) : null,
        teamName: str(s.team?.shortName) ?? str(s.team?.name),
        goals,
        appearances: toInt(s.playedMatches),
        penalties: toInt(s.penalties),
        assists: toInt(s.assists),
        playerPhotoUrl: null,
      });
    }
    if (scorers.length === 0) return this.empty(`no scorers published for ${code}`, "top_scorers", params);
    return { ok: true, data: scorers, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  override async getFixtures(input: { sport: string; competitionProviderId?: string; range?: { from: string; to: string }; date?: string }): Promise<ProviderResult<NormalizedFixture[]>> {
    if (input.sport && input.sport !== "football") return notSupported(this.name, "fixtures", this.key("fixtures", input));
    return this.matchesCall(input, "fixtures");
  }

  override async getLiveMatches(input: { sport: string }): Promise<ProviderResult<NormalizedFixture[]>> {
    if (input.sport && input.sport !== "football") return notSupported(this.name, "live_matches", this.key("live_matches", input));
    const params = { ...this.competitionParams(), status: "LIVE" };
    const res = await this.getJson<FdMatchesResponse>("matches", params);
    if (!res.ok) return res;
    // An empty live board is a valid answer (the free tier delays scores); it is
    // reported as an empty list, never as a fabricated fixture.
    return { ok: true, data: (res.data.matches ?? []).map((m) => this.mapMatch(m)), provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  override async getMatchDetail(input: { providerMatchId: string }): Promise<ProviderResult<NormalizedFixture>> {
    const id = String(input.providerMatchId ?? "").trim();
    if (!/^\d+$/.test(id)) return this.empty(`"${id}" is not a football-data.org match id`, "match_detail", { providerMatchId: id });
    const res = await this.getJson<FdMatch>("matches/" + id, {});
    if (!res.ok) return res;
    return { ok: true, data: this.mapMatch(res.data), provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  override async getCompetition(input: { providerCompetitionId: string }): Promise<ProviderResult<NormalizedCompetition>> {
    const code = footballDataCode(input.providerCompetitionId);
    if (!code) return this.unknownCompetition(input.providerCompetitionId, "competition", { providerCompetitionId: input.providerCompetitionId });
    const res = await this.getJson<FdCompetitionRef & { area?: FdArea | null }>(`competitions/${code}`, {});
    if (!res.ok) return res;
    const data = res.data;
    return {
      ok: true,
      data: {
        providerId: str(data.code) ?? code,
        name: str(data.name) ?? code,
        shortName: str(data.code) ?? code,
        countryCode: str(data.area?.code),
        countryName: str(data.area?.name),
        type: str(data.type)?.toLowerCase() ?? null,
        logoUrl: str(data.emblem),
      },
      provider: this.name,
      fetchedAt: res.fetchedAt,
      requestKey: res.requestKey,
      fromCache: false,
    };
  }

  override async getTeam(input: { providerTeamId: string }): Promise<ProviderResult<NormalizedTeam>> {
    const id = String(input.providerTeamId ?? "").trim();
    if (!/^\d+$/.test(id)) return this.empty(`"${id}" is not a football-data.org team id`, "team", { providerTeamId: id });
    const res = await this.getJson<FdTeamResponse>(`teams/${id}`, {});
    if (!res.ok) return res;
    const t = res.data;
    return {
      ok: true,
      data: {
        providerId: String(t.id),
        name: str(t.name) ?? String(t.id),
        shortName: str(t.shortName),
        abbreviation: str(t.tla),
        countryCode: str(t.area?.code),
        countryName: str(t.area?.name),
        logoUrl: str(t.crest),
        foundedYear: toInt(t.founded),
        venueName: str(t.venue),
        primaryColor: str(t.clubColors)?.split("/")[0]?.trim() ?? null,
        secondaryColor: str(t.clubColors)?.split("/")[1]?.trim() ?? null,
        isNationalTeam: false,
      },
      provider: this.name,
      fetchedAt: res.fetchedAt,
      requestKey: res.requestKey,
      fromCache: false,
    };
  }

  /** `/competitions` is the cheapest endpoint that proves the token works. */
  override async healthCheck(): Promise<ProviderResult<ProviderHealth>> {
    const started = Date.now();
    const res = await this.getJson<{ competitions?: { code?: string }[] | null; count?: number }>("competitions", {});
    const latency = Date.now() - started;
    const quota = this.quotaSnapshot();
    if (!res.ok) {
      return {
        ok: true,
        data: { provider: this.name, reachable: false, checkedAt: new Date().toISOString(), latencyMs: latency, quotaRemaining: quota.requestsAvailableMinute, detail: res.error.message },
        provider: this.name,
        fetchedAt: new Date().toISOString(),
        requestKey: res.requestKey,
        fromCache: false,
      };
    }
    return {
      ok: true,
      data: {
        provider: this.name,
        reachable: true,
        checkedAt: new Date().toISOString(),
        latencyMs: latency,
        quotaRemaining: quota.requestsAvailableMinute,
        detail: `${res.data.count ?? res.data.competitions?.length ?? 0} competitions visible to this key${quota.resetSeconds !== null ? ` · quota window resets in ${quota.resetSeconds}s` : ""}`,
      },
      provider: this.name,
      fetchedAt: res.fetchedAt,
      requestKey: res.requestKey,
      fromCache: false,
    };
  }

  /* ── internals ──────────────────────────────────────────── */

  private seasonParams(input: { season?: string }): Record<string, unknown> {
    const season = str(input.season) ?? this.season;
    return season ? { season } : {};
  }

  /** Competitions filter applied to unscoped list calls (keeps payload + quota small). */
  private competitionParams(): Record<string, unknown> {
    return this.codes.length ? { competitions: this.codes.join(",") } : {};
  }

  /**
   * Matches list: one competition when scoped, otherwise the day (or the
   * configured window) across the monitored competitions. `dateTo` is
   * exclusive in v4, so the default window is [today-1, today+3).
   */
  private async matchesCall(
    input: { sport: string; competitionProviderId?: string; range?: { from: string; to: string }; date?: string },
    endpoint: DataType,
  ): Promise<ProviderResult<NormalizedFixture[]>> {
    const params: Record<string, unknown> = { ...this.seasonParams({}) };
    let path: string;

    if (input.competitionProviderId) {
      const code = footballDataCode(input.competitionProviderId);
      if (!code) return this.unknownCompetition(input.competitionProviderId, endpoint, input);
      path = `competitions/${code}/matches`;
      Object.assign(params, { ...this.seasonParams({}) });
    } else {
      path = "matches";
      Object.assign(params, this.competitionParams());
    }

    if (input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
      params.date = input.date;
      // a date and a date range are mutually exclusive in v4
      delete params.dateFrom;
      delete params.dateTo;
    } else if (input.range) {
      params.dateFrom = input.range.from;
      params.dateTo = input.range.to;
    } else {
      params.dateFrom = utcDay(-1);
      params.dateTo = utcDay(3);
    }
    if (!input.competitionProviderId) params.limit = "200";

    const res = await this.getJson<FdMatchesResponse>(path, params);
    if (!res.ok) return res;
    const matches = res.data.matches ?? [];
    return {
      ok: true,
      data: matches.map((m) => this.mapMatch(m)),
      provider: this.name,
      fetchedAt: res.fetchedAt,
      requestKey: res.requestKey,
      fromCache: false,
    };
  }

  /** v4 match → canonical fixture (no provider-only field survives). */
  private mapMatch(m: FdMatch): NormalizedFixture {
    const full = m.score?.fullTime ?? null;
    const half = m.score?.halfTime ?? null;
    const status = mapStatus(m.status);
    const played = full?.home !== null && full?.home !== undefined && full?.away !== null && full?.away !== undefined;
    const periods: { label: string; home: number | null; away: number | null }[] = [];
    if (half && (half.home !== null || half.away !== null)) periods.push({ label: "1H", home: half.home ?? null, away: half.away ?? null });
    if (played) periods.push({ label: "FT", home: full?.home ?? null, away: full?.away ?? null });

    const minute = ["live", "halftime"].includes(status)
      ? parseMinute(m.minute).minute
      : status === "finished"
        ? 90
        : null;

    return {
      providerId: String(m.id),
      sport: "football",
      competitionProviderId: str(m.competition?.code) ?? "",
      seasonProviderId: m.season?.id ? String(m.season.id) : null,
      round: toInt(m.matchday) !== null ? `Matchday ${toInt(m.matchday)}` : str(m.stage),
      homeProviderId: m.homeTeam?.id ? String(m.homeTeam.id) : null,
      awayProviderId: m.awayTeam?.id ? String(m.awayTeam.id) : null,
      scheduledAt: toIso(m.utcDate) ?? new Date().toISOString(),
      status,
      homeScore: played ? (full?.home ?? null) : null,
      awayScore: played ? (full?.away ?? null) : null,
      periods,
      venueProviderId: null,
      venueName: str(m.venue),
      attendance: toInt(m.attendance),
      minute,
      homeName: str(m.homeTeam?.shortName) ?? str(m.homeTeam?.name),
      awayName: str(m.awayTeam?.shortName) ?? str(m.awayTeam?.name),
      homeLogoUrl: str(m.homeTeam?.crest),
      awayLogoUrl: str(m.awayTeam?.crest),
      competitionName: str(m.competition?.name),
      sourceUrl: null,
    };
  }

  /** A typed "this provider cannot serve that" — never a make-believe payload. */
  private unknownCompetition(id: string, dataType: DataType, params: Record<string, unknown>): ProviderResult<never> {
    const known = FOOTBALL_DATA_COMPETITIONS.map((c) => c.code).join(", ");
    return {
      ok: false,
      provider: this.name,
      requestKey: this.key(dataType, params),
      fromCache: false,
      error: {
        code: "not_found",
        message: `football_data: competition "${id}" is not one of the codes this provider serves (${known})`,
      },
    };
  }

  /**
   * A provider answering "no rows published yet" is not an outage, but it is
   * also not a valid empty league table: the caller must be able to tell the
   * difference between "0 matches today" (empty list, ok) and "this table does
   * not exist yet" (typed error, the chain may try another provider).
   */
  private empty(reason: string, dataType: DataType, params: Record<string, unknown>): ProviderResult<never> {
    return {
      ok: false,
      provider: this.name,
      requestKey: this.key(dataType, params),
      fromCache: false,
      error: { code: "not_found", message: `football_data: ${reason}`, httpStatus: 200 },
    };
  }
}
