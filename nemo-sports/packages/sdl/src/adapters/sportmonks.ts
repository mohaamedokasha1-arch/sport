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

import { withDefaults, parseMinute, str, toInt, toIso, type HttpOptions } from "./base";
import type {
  DataType,
  NormalizedCompetition,
  NormalizedEvent,
  NormalizedFixture,
  NormalizedPlayer,
  NormalizedSeason,
  NormalizedSquadMember,
  NormalizedStandingRow,
  NormalizedTeam,
  NormalizedTopScorer,
  ProviderResult,
} from "../provider";
import type { ProviderHealth } from "../provider";

export type SportmonksConfig = HttpOptions & { apiToken?: string; baseUrl?: string };

type Envelope<T> = {
  data?: T[];
  pagination?: { next_page: string | null; has_more: boolean; total: number; count: number; per_page: number; current_page: number; total_pages: number };
  subscription?: { trial: boolean; subscription_id: string };
  rate_limits?: Record<string, unknown>;
};

type SmFixture = {
  id: number;
  sport_id: number;
  league_id: number;
  season_id: number;
  stage_id: number | null;
  group_id: number | null;
  round?: string | null;
  name?: string | null;
  starting_at: { date_time: string; date: string };
  result_info?: string | null;
  attendance?: number | null;
  venue_id?: number | null;
  venue?: { name: string | null } | null;
  status_id?: number;
  status?: { name?: string } | null;
  participants?: {
    id: number;
    type: "home" | "away";
    participant?: { id: number; name: string };
    scores?: { id: number; type?: string; description?: string; score?: { goals?: number | null; overall?: number | null }; participant?: { id: number } }[];
    meta?: { winner?: boolean; position?: number } | null;
  }[];
  scores?: { id: number; participant_id: number; type?: { name?: string }; description?: string; score?: { goals?: number | null; overall?: number | null } }[];
};

type SmEvent = {
  id: number;
  fixture_id: number;
  type_id: number;
  team_id: number | null;
  player_id: number | null;
  related_player_id: number | null;
  minute: number | null;
  extra_minute: number | null;
  order: number;
};

type SmTeam = {
  id: number;
  name: string;
  short_code?: string | null;
  image_path?: string | null;
  national_team?: boolean;
  country_id?: number | null;
  country?: { name?: string; image_path?: string } | null;
  founded?: number | null;
  venue_id?: number | null;
  venue?: { name?: string | null; city?: string | null; capacity?: number | null } | null;
  colors?: { primary?: { color?: string } | null; secondary?: { color?: string } | null } | null;
};

type SmPlayer = {
  id: number;
  name: string;
  display_name?: string | null;
  date_of_birth?: string | null;
  country_id?: number | null;
  image_path?: string | null;
  height?: number | null;
  weight?: number | null;
  position_id?: number | null;
  current_team_id?: number | null;
  current_season_id?: number | null;
  position?: { name?: string } | null;
  nationality?: { name?: string } | null;
};

type SmStandingRow = {
  id: number;
  participant_id: number;
  stage_id: number;
  position: number;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  points: number;
  form?: string | null;
  recent_form?: { won: number; draw: number; lost: number } | null;
  status?: string | null;
  group?: { name?: string } | null;
  stage?: { name?: string } | null;
};

/** Sportmonks `/events` type_id → canonical event type (verify per subscription). */
export const EVENT_TYPE_ID: Record<number, string> = {
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
export const SM_STATUS: Record<number, string> = {
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

export class SportmonksAdapter extends withDefaults("sportmonks") {
  readonly capabilities: DataType[] = [
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
  readonly supportedSports = ["football"];

  private token: string | null;
  private base: string;
  /** cap pagination so a bad date range cannot burn the monthly quota */
  private maxPages: number;

  constructor(cfg: SportmonksConfig = {}) {
    super(cfg);
    this.token = cfg.apiToken ?? process.env.SPORTMONKS_TOKEN ?? null;
    this.base = cfg.baseUrl ?? "https://api.sportmonks.com/v3/football";
    this.maxPages = 5;
  }

  /** @internal */ override baseUrl(): string {
    return this.base;
  }

  /** @internal */ override auth(): { headers: Record<string, string> } {
    return { headers: this.token ? { authorization: `Bearer ${this.token}` } : {} };
  }

  private unwrap<T>(res: ProviderResult<Envelope<T>>): ProviderResult<T[]> {
    if (!res.ok) return res;
    return { ok: true, data: res.data.data ?? [], provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  /** Walks `pagination.next_page` while `has_more`, bounded by maxPages. */
  private async paginate<T>(endpoint: string, params: Record<string, unknown>): Promise<ProviderResult<T[]>> {
    const all: T[] = [];
    let page = 1;
    let nextUrl: string | null = null;
    let first: ProviderResult<Envelope<T>> | null = null;

    while (page <= this.maxPages) {
      const res = await this.getJson<Envelope<T>>(endpoint, { ...params, page });
      if (!res.ok) {
        if (page === 1) return res;
        break; // keep what we already have rather than discarding a paid page
      }
      first = first ?? res;
      all.push(...(res.data.data ?? []));
      nextUrl = res.data.pagination?.next_page ?? null;
      const hasMore = !!res.data.pagination?.has_more;
      if (!hasMore || !nextUrl) break;
      page++;
    }

    if (!first) return { ok: false, provider: this.name, requestKey: this.key(endpoint, params), fromCache: false, error: { code: "bad_response", message: "empty paginated response" } };
    return { ok: true, data: all, provider: this.name, fetchedAt: first.fetchedAt, requestKey: first.requestKey, fromCache: false };
  }

  private fixture(f: SmFixture): NormalizedFixture {
    const home = f.participants?.find((p) => p.type === "home");
    const away = f.participants?.find((p) => p.type === "away");
    const scoreFor = (p?: typeof home): number | null => {
      const s = p?.scores?.[0];
      return s?.score?.goals ?? s?.score?.overall ?? null;
    };
    const statusId = f.status_id ?? 1;
    const periods: NormalizedFixture["periods"] = [];
    const allScores = f.scores ?? [];
    for (const s of allScores) {
      if (!s.type?.name) continue;
      const isHome = s.participant_id === home?.participant?.id;
      const goals = s.score?.goals ?? s.score?.overall ?? null;
      const label = s.type.name.toUpperCase().replace(/\s+/g, "");
      const existing = periods.find((p) => p.label === label);
      if (existing) {
        if (isHome) existing.home = goals;
        else existing.away = goals;
      } else {
        periods.push({ label, home: isHome ? goals : null, away: isHome ? null : goals });
      }
    }
    return {
      providerId: String(f.id),
      sport: "football",
      competitionProviderId: String(f.league_id),
      seasonProviderId: f.season_id != null ? String(f.season_id) : null,
      round: str(f.round) ?? str(f.name),
      homeProviderId: home?.participant?.id != null ? String(home.participant.id) : null,
      awayProviderId: away?.participant?.id != null ? String(away.participant.id) : null,
      scheduledAt: toIso(f.starting_at?.date_time) ?? new Date().toISOString(),
      status: SM_STATUS[statusId] ?? "scheduled",
      homeScore: scoreFor(home),
      awayScore: scoreFor(away),
      periods,
      venueProviderId: f.venue_id != null ? String(f.venue_id) : null,
      venueName: str(f.venue?.name),
      attendance: toInt(f.attendance),
      minute: null,
    };
  }

  private static readonly FIXTURE_INCLUDES = "participants;scores;venue";

  override async getFixtures(input: { sport: string; competitionProviderId?: string; range?: { from: string; to: string }; date?: string }): Promise<ProviderResult<NormalizedFixture[]>> {
    let endpoint: string;
    const params: Record<string, unknown> = { include: SportmonksAdapter.FIXTURE_INCLUDES };
    if (input.date) {
      endpoint = `fixtures/date/${input.date.slice(0, 10)}`;
    } else if (input.range) {
      endpoint = `fixtures/between/${input.range.from.slice(0, 10)}/${input.range.to.slice(0, 10)}`;
    } else if (input.competitionProviderId) {
      endpoint = `fixtures`;
      params.leagues = input.competitionProviderId;
      params.seasons = new Date().getFullYear();
    } else {
      return { ok: false, provider: this.name, requestKey: this.key("fixtures", {}), fromCache: false, error: { code: "bad_response", message: "sportmonks fixtures need a date, range or league" } };
    }
    const res = await this.paginate<SmFixture>(endpoint, params);
    if (!res.ok) return res;
    return { ok: true, data: res.data.map((f) => this.fixture(f)), provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  /**
   * Live polling uses the documented livescores feeds, not the fixtures feeds:
   *   GET /livescores/inplay — matches in the ±15 min in-play window
   *   GET /livescores        — all of today's livescores (fallback)
   * One request covers the whole platform, which is why live polling is not
   * implemented as one call per match (Instruction 9).
   */
  override async getLiveMatches(input: { sport: string }): Promise<ProviderResult<NormalizedFixture[]>> {
    const includes = { include: SportmonksAdapter.FIXTURE_INCLUDES, sport: input.sport };

    const inplay = await this.getJson<Envelope<SmFixture>>("livescores/inplay", includes);
    if (inplay.ok) {
      const list = this.unwrap(inplay);
      if (!list.ok) return list;
      return { ok: true, data: list.data.map((f) => this.fixture(f)), provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
    }

    // /inplay is not on every plan → fall back to the whole-day livescore feed
    // and keep only what is actually in play
    const all = await this.getJson<Envelope<SmFixture>>("livescores", includes);
    if (!all.ok) return all;
    const list = this.unwrap(all);
    if (!list.ok) return list;
    const live = list.data
      .map((f) => this.fixture(f))
      .filter((f) => f.status !== "scheduled" && f.status !== "finished" && f.status !== "postponed" && f.status !== "cancelled");
    return { ok: true, data: live, provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
  }

  override async getMatchDetail(input: { providerMatchId: string }): Promise<ProviderResult<NormalizedFixture>> {
    const res = await this.getJson<Envelope<SmFixture>>(`fixtures/${input.providerMatchId}`, { include: `${SportmonksAdapter.FIXTURE_INCLUDES};status` });
    const list = this.unwrap(res);
    if (!list.ok) return list;
    const f = list.data[0];
    if (!f) return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `fixture ${input.providerMatchId} not found` } };
    return { ok: true, data: this.fixture(f), provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
  }

  override async getMatchEvents(input: { providerMatchId: string }): Promise<ProviderResult<NormalizedEvent[]>> {
    const res = await this.paginate<SmEvent>(`fixtures/${input.providerMatchId}/events`, { per_page: 100 });
    if (!res.ok) return res;
    const data = res.data.map((e) => {
      const m = parseMinute(e.minute != null && e.extra_minute != null ? `${e.minute}+${e.extra_minute}` : e.minute);
      return {
        providerEventId: String(e.id),
        providerMatchId: String(e.fixture_id),
        type: EVENT_TYPE_ID[e.type_id] ?? `type_${e.type_id}`,
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

  override async getTeam(input: { providerTeamId: string }): Promise<ProviderResult<NormalizedTeam>> {
    const res = await this.getJson<Envelope<SmTeam>>(`teams/${input.providerTeamId}`, { include: "country;venue;colors" });
    const list = this.unwrap(res);
    if (!list.ok) return list;
    const t = list.data[0];
    if (!t) return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `team ${input.providerTeamId} not found` } };
    return {
      ok: true,
      data: {
        providerId: String(t.id),
        name: t.name,
        shortName: null,
        abbreviation: str(t.short_code),
        countryCode: null,
        countryName: str(t.country?.name),
        logoUrl: str(t.image_path),
        foundedYear: toInt(t.founded),
        venueName: str(t.venue?.name),
        primaryColor: str(t.colors?.primary?.color),
        secondaryColor: str(t.colors?.secondary?.color),
        isNationalTeam: !!t.national_team,
      },
      provider: this.name,
      fetchedAt: list.fetchedAt,
      requestKey: list.requestKey,
      fromCache: false,
    };
  }

  override async getTeamSquad(input: { providerTeamId: string }): Promise<ProviderResult<NormalizedSquadMember[]>> {
    const res = await this.paginate<SmPlayer>(`teams/${input.providerTeamId}/squad`, { per_page: 50 });
    if (!res.ok) return res;
    const data = res.data.map((p) => ({
      providerId: String(p.id),
      name: p.name,
      position: str(p.position?.name),
      jerseyNumber: null,
      dateOfBirth: toIso(p.date_of_birth),
      countryCode: null,
      photoUrl: str(p.image_path),
      photoAttribution: str(p.image_path) ? "Sportmonks" : null,
    }));
    return { ok: true, data, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  override async getPlayer(input: { providerPlayerId: string }): Promise<ProviderResult<NormalizedPlayer>> {
    const res = await this.getJson<Envelope<SmPlayer>>(`players/${input.providerPlayerId}`, { include: "position;nationality" });
    const list = this.unwrap(res);
    if (!list.ok) return list;
    const p = list.data[0];
    if (!p) return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `player ${input.providerPlayerId} not found` } };
    return {
      ok: true,
      data: {
        providerId: String(p.id),
        fullName: str(p.display_name) ?? p.name,
        dateOfBirth: toIso(p.date_of_birth),
        countryCode: null,
        position: str(p.position?.name),
        photoUrl: str(p.image_path),
        photoAttribution: str(p.image_path) ? "Sportmonks" : null,
        heightCm: toInt(p.height),
        weightKg: toInt(p.weight),
        footPreference: null,
        teamProviderId: p.current_team_id != null ? String(p.current_team_id) : null,
      },
      provider: this.name,
      fetchedAt: list.fetchedAt,
      requestKey: list.requestKey,
      fromCache: false,
    };
  }

  override async getCompetition(input: { providerCompetitionId: string }): Promise<ProviderResult<NormalizedCompetition>> {
    const res = await this.getJson<Envelope<{ id: number; name: string; short_code?: string; logo_path?: string; type?: string; country?: { name?: string; image_path?: string } }>>(`leagues/${input.providerCompetitionId}`, { include: "country" });
    const list = this.unwrap(res);
    if (!list.ok) return list;
    const l = list.data[0];
    if (!l) return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `league ${input.providerCompetitionId} not found` } };
    return {
      ok: true,
      data: { providerId: String(l.id), name: l.name, shortName: str(l.short_code), countryCode: null, countryName: str(l.country?.name), type: str(l.type)?.toLowerCase() ?? null, logoUrl: str(l.logo_path) },
      provider: this.name,
      fetchedAt: list.fetchedAt,
      requestKey: list.requestKey,
      fromCache: false,
    };
  }

  override async getCompetitionSeasons(input: { providerCompetitionId: string }): Promise<ProviderResult<NormalizedSeason[]>> {
    const res = await this.paginate<{ id: number; name: string; league_id: number; is_current_season: boolean; starting_at?: string; ending_at?: string }>(`leagues/${input.providerCompetitionId}/seasons`, { per_page: 50 });
    if (!res.ok) return res;
    const data = res.data.map((s) => ({
      providerId: String(s.id),
      competitionProviderId: String(s.league_id),
      name: s.name,
      isCurrent: !!s.is_current_season,
      startDate: toIso(s.starting_at),
      endDate: toIso(s.ending_at),
    }));
    return { ok: true, data, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  override async getStandings(input: { providerCompetitionId: string; season?: string }): Promise<ProviderResult<NormalizedStandingRow[]>> {
    const params: Record<string, unknown> = { per_page: 100 };
    if (input.season) params.seasons = input.season;
    const res = await this.paginate<SmStandingRow>(`leagues/${input.providerCompetitionId}/standings`, params);
    if (!res.ok) return res;
    const data = res.data.map((r) => ({
      teamProviderId: String(r.participant_id),
      group: str(r.group?.name) ?? str(r.stage?.name),
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

  override async getTopScorers(input: { providerCompetitionId: string; season?: string }): Promise<ProviderResult<NormalizedTopScorer[]>> {
    const params: Record<string, unknown> = { per_page: 50, type: "goals" };
    if (input.season) params.seasons = input.season;
    const res = await this.paginate<{ player_id: number; team_id: number | null; goals: number; appearances?: number; penalty_goals?: number }>(
      `leagues/${input.providerCompetitionId}/topscorers/goals`,
      params,
    );
    if (!res.ok) return res;
    const data = res.data.map((r) => ({
      playerProviderId: String(r.player_id),
      teamProviderId: r.team_id != null ? String(r.team_id) : null,
      goals: toInt(r.goals) ?? 0,
      appearances: toInt(r.appearances),
      penalties: toInt(r.penalty_goals),
    }));
    return { ok: true, data, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  override async healthCheck(): Promise<ProviderResult<ProviderHealth>> {
    const started = Date.now();
    const res = await this.getJson<Envelope<unknown>>("sports", { per_page: 1 });
    const at = new Date().toISOString();
    if (!res.ok) {
      return { ok: true, data: { provider: this.name, reachable: false, checkedAt: at, latencyMs: Date.now() - started, quotaRemaining: null, detail: res.error.message }, provider: this.name, fetchedAt: at, requestKey: res.requestKey, fromCache: false };
    }
    const rl = res.data.rate_limits as { remaining?: number } | undefined;
    return {
      ok: true,
      data: { provider: this.name, reachable: true, checkedAt: at, latencyMs: Date.now() - started, quotaRemaining: toInt(rl?.remaining ?? null), detail: "sports endpoint reachable" },
      provider: this.name,
      fetchedAt: at,
      requestKey: res.requestKey,
      fromCache: false,
    };
  }
}

function parseForm(form: string | null | undefined): ("W" | "D" | "L")[] {
  if (!form) return [];
  return form
    .split("")
    .filter((c): c is "W" | "D" | "L" => c === "W" || c === "D" || c === "L")
    .slice(-5);
}

function mapStandingStatus(status: string | null | undefined): string | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s.includes("champion")) return "champion";
  if (s.includes("relegation playoff")) return "relegation_playoff";
  if (s.includes("relegation")) return "relegation";
  if (s.includes("promotion playoff")) return "promotion_playoff";
  if (s.includes("promotion")) return "promotion";
  return null;
}
