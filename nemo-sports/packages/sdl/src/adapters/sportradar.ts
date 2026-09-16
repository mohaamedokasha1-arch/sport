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

import { withDefaults, parseMinute, str, toInt, toIso, type HttpOptions } from "./base";
import type {
  DataType,
  NormalizedCompetition,
  NormalizedEvent,
  NormalizedFixture,
  NormalizedLineup,
  NormalizedSeason,
  NormalizedStandingRow,
  NormalizedStat,
  NormalizedTeam,
  ProviderResult,
} from "../provider";
import type { ProviderHealth } from "../provider";

export type SportradarConfig = HttpOptions & {
  apiKey?: string;
  /** "trial" for evaluation, "production" for the paid feed */
  access?: "trial" | "production";
  lang?: string;
  sport?: "soccer" | "nfl" | "basketball";
  version?: number;
};

type SrSportEvent = {
  id: string;
  start_time: string;
  status: string;
  match_time?: string | null;
  week?: number | null;
  round?: { name?: string; number?: number } | null;
  venue?: { id?: string; name?: string; city_name?: string; country_name?: string; capacity?: number } | null;
  competitors?: { id: string; name: string; abbreviation?: string; qualifier: "home" | "away"; country?: string; country_code?: string }[];
  sport_event_status?: { status: string; match_status: string; match_time?: string | null; home_score?: number; away_score?: number; period_scores?: { number: number; home_score: number; away_score: number }[]; winner_id?: string | null; attendance?: number };
  tournament?: { id: string; name: string; sport?: { name?: string } };
  tournament_round?: { type?: string; name?: string; number?: number; group?: string };
  season?: { id: string; name?: string; year?: string };
};

type SrSummary = {
  sport_event?: SrSportEvent;
  sport_event_status?: SrSportEvent["sport_event_status"];
  event_timeline?: {
    timeline?: { id: number; type: string; match_time?: string; team?: string; player?: { id: string; name: string }; home_score?: number; away_score?: number; period_type?: string; period_number?: number }[];
  };
  statistics?: {
    totals?: { competitors?: { id: string; statistics?: Record<string, number> }[] };
    periods?: { number?: number; competitors?: { id: string; statistics?: Record<string, number> }[] }[];
  };
  lineups?: { team?: { id: string; formation?: string; players?: { id: string; name: string; jersey_number?: number; position?: string; type?: string }[]; coaches?: { id: string; name: string }[] }[] };
};

type SrCompetitor = {
  id: string;
  name: string;
  abbreviation?: string;
  country?: string;
  country_code?: string;
  venue?: { name?: string; city_name?: string; capacity?: number };
  gender?: string;
  founded?: string;
};

/** Sportradar `sport_event_status.status` / `match_status` → canonical status. */
export const SR_STATUS: Record<string, string> = {
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

export class SportradarAdapter extends withDefaults("sportradar") {
  readonly capabilities: DataType[] = ["fixtures", "live_matches", "match_detail", "match_events", "match_stats", "match_lineups", "team", "competition", "competition_seasons", "standings", "health"];
  readonly supportedSports = ["football", "basketball", "nfl"];

  private apiKey: string | null;
  private access: "trial" | "production";
  private lang: string;
  private sport: string;
  private version: number;

  constructor(cfg: SportradarConfig = {}) {
    super(cfg);
    this.apiKey = cfg.apiKey ?? process.env.SPORTRADAR_KEY ?? null;
    this.access = cfg.access ?? "trial";
    this.lang = cfg.lang ?? "en";
    this.sport = cfg.sport ?? "soccer";
    this.version = cfg.version ?? 4;
  }

  /** @internal */ override baseUrl(): string {
    return `https://api.sportradar.com/${this.sport}/${this.access}/v${this.version}/${this.lang}`;
  }

  /** @internal */ override auth(): { headers: Record<string, string> } {
    return { headers: this.apiKey ? { "x-api-key": this.apiKey } : {} };
  }

  private fixture(e: SrSportEvent): NormalizedFixture {
    const home = e.competitors?.find((c) => c.qualifier === "home");
    const away = e.competitors?.find((c) => c.qualifier === "away");
    const st = e.sport_event_status ?? { status: e.status, match_status: e.status };
    const periods = (st.period_scores ?? []).map((p) => ({
      label: `P${p.number}`,
      home: toInt(p.home_score),
      away: toInt(p.away_score),
    }));
    return {
      providerId: e.id,
      sport: this.sport === "soccer" ? "football" : this.sport,
      competitionProviderId: e.tournament?.id ?? "",
      seasonProviderId: e.season?.id ?? null,
      round: str(e.tournament_round?.name) ?? str(e.round?.name) ?? (e.week != null ? `Week ${e.week}` : null),
      homeProviderId: home?.id ?? null,
      awayProviderId: away?.id ?? null,
      scheduledAt: toIso(e.start_time) ?? new Date().toISOString(),
      status: SR_STATUS[st.status] ?? SR_STATUS[st.match_status] ?? "scheduled",
      homeScore: toInt(st.home_score),
      awayScore: toInt(st.away_score),
      periods,
      venueProviderId: str(e.venue?.id),
      venueName: str(e.venue?.name),
      attendance: toInt(st.attendance),
      minute: parseMinute(e.match_time ?? st.match_time).minute,
    };
  }

  override async getFixtures(input: { sport: string; competitionProviderId?: string; range?: { from: string; to: string }; date?: string }): Promise<ProviderResult<NormalizedFixture[]>> {
    // Sportradar serves a per-day schedule feed; a range is fetched day by day
    // and hard-capped, because each day is a separate billable call.
    const days: string[] = [];
    if (input.date) days.push(input.date.slice(0, 10));
    else if (input.range) {
      const from = +new Date(input.range.from);
      const to = +new Date(input.range.to);
      const MAX_DAYS = 14;
      for (let t = from; t <= to && days.length < MAX_DAYS; t += 86_400_000) days.push(new Date(t).toISOString().slice(0, 10));
    } else days.push(new Date().toISOString().slice(0, 10));

    const all: NormalizedFixture[] = [];
    let fetchedAt = new Date().toISOString();
    let key = this.key("schedules", { days: days.join(",") });
    let lastError: ProviderResult<NormalizedFixture[]> | null = null;

    for (const day of days) {
      const res = await this.getJson<{ sport_events?: SrSportEvent[] }>(`schedules/${day}/schedules.json`, {});
      if (!res.ok) {
        lastError = res;
        continue;
      }
      fetchedAt = res.fetchedAt;
      key = res.requestKey;
      for (const e of res.data.sport_events ?? []) all.push(this.fixture(e));
    }

    if (!all.length && lastError) return lastError;
    const filtered = input.competitionProviderId ? all.filter((f) => f.competitionProviderId === input.competitionProviderId) : all;
    return { ok: true, data: filtered, provider: this.name, fetchedAt, requestKey: key, fromCache: false };
  }

  /** One request for every live match on the platform — the cheapest live poll. */
  override async getLiveMatches(input: { sport: string }): Promise<ProviderResult<NormalizedFixture[]>> {
    const res = await this.getJson<{ sport_events?: SrSportEvent[] }>("schedules/live/schedules.json", { sport: input.sport });
    if (!res.ok) return res;
    const data = (res.data.sport_events ?? []).map((e) => this.fixture(e));
    return { ok: true, data, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  override async getMatchDetail(input: { providerMatchId: string }): Promise<ProviderResult<NormalizedFixture>> {
    const res = await this.getJson<{ sport_event?: SrSportEvent }>(`sport_events/${input.providerMatchId}/schedules.json`, {});
    if (!res.ok) return res;
    const e = res.data.sport_event;
    if (!e) return { ok: false, provider: this.name, requestKey: res.requestKey, fromCache: false, error: { code: "not_found", message: `sport_event ${input.providerMatchId} not found` } };
    return { ok: true, data: this.fixture(e), provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  override async getMatchEvents(input: { providerMatchId: string }): Promise<ProviderResult<NormalizedEvent[]>> {
    const res = await this.getJson<SrSummary>(`sport_events/${input.providerMatchId}/summary.json`, {});
    if (!res.ok) return res;
    const timeline = res.data.event_timeline?.timeline ?? [];
    const data = timeline.map((t) => {
      const m = parseMinute(t.match_time);
      return {
        providerEventId: String(t.id),
        providerMatchId: input.providerMatchId,
        type: mapSrEventType(t.type),
        minute: m.minute,
        additionalMinute: m.additional,
        teamProviderId: str(t.team),
        playerProviderId: str(t.player?.id),
        secondaryPlayerProviderId: null,
        description: str(t.type),
      };
    });
    return { ok: true, data, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  override async getMatchStats(input: { providerMatchId: string }): Promise<ProviderResult<NormalizedStat[]>> {
    const res = await this.getJson<SrSummary>(`sport_events/${input.providerMatchId}/summary.json`, {});
    if (!res.ok) return res;
    const out: NormalizedStat[] = [];
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

  override async getMatchLineups(input: { providerMatchId: string }): Promise<ProviderResult<NormalizedLineup[]>> {
    const res = await this.getJson<SrSummary>(`sport_events/${input.providerMatchId}/lineups.json`, {});
    if (!res.ok) return res;
    const data = (res.data.lineups?.team ?? []).map((t) => {
      const players = (t.players ?? []).map((p) => ({
        providerId: p.id,
        name: p.name,
        position: str(p.position),
        jerseyNumber: toInt(p.jersey_number),
      }));
      return {
        teamProviderId: t.id,
        formation: str(t.formation),
        coach: str(t.coaches?.[0]?.name),
        starters: players.filter((_, i) => i < 11),
        bench: players.filter((_, i) => i >= 11),
      };
    });
    return { ok: true, data, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  override async getTeam(input: { providerTeamId: string }): Promise<ProviderResult<NormalizedTeam>> {
    const res = await this.getJson<SrCompetitor>(`competitors/${input.providerTeamId}/profile.json`, {});
    if (!res.ok) return res;
    const c = res.data;
    if (!c?.id) return { ok: false, provider: this.name, requestKey: res.requestKey, fromCache: false, error: { code: "not_found", message: `competitor ${input.providerTeamId} not found` } };
    return {
      ok: true,
      data: {
        providerId: c.id,
        name: c.name,
        shortName: null,
        abbreviation: str(c.abbreviation),
        countryCode: str(c.country_code),
        countryName: str(c.country),
        logoUrl: null,
        foundedYear: toInt(c.founded),
        venueName: str(c.venue?.name),
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

  override async getCompetition(input: { providerCompetitionId: string }): Promise<ProviderResult<NormalizedCompetition>> {
    const res = await this.getJson<{ tournaments?: { id: string; name: string; category?: { name?: string; country_code?: string } }[] }>("competitions.json", {});
    if (!res.ok) return res;
    const t = (res.data.tournaments ?? []).find((x) => x.id === input.providerCompetitionId);
    if (!t) return { ok: false, provider: this.name, requestKey: res.requestKey, fromCache: false, error: { code: "not_found", message: `tournament ${input.providerCompetitionId} not in competitions feed` } };
    return {
      ok: true,
      data: { providerId: t.id, name: t.name, shortName: null, countryCode: str(t.category?.country_code), countryName: str(t.category?.name), type: null, logoUrl: null },
      provider: this.name,
      fetchedAt: res.fetchedAt,
      requestKey: res.requestKey,
      fromCache: false,
    };
  }

  override async getCompetitionSeasons(input: { providerCompetitionId: string }): Promise<ProviderResult<NormalizedSeason[]>> {
    const res = await this.getJson<{ tournament?: { seasons?: { id: string; name: string; year?: string; start_date?: string; end_date?: string }[] } }>(`tournaments/${input.providerCompetitionId}/info.json`, {});
    if (!res.ok) return res;
    const data = (res.data.tournament?.seasons ?? []).map((s) => ({
      providerId: s.id,
      competitionProviderId: input.providerCompetitionId,
      name: s.name,
      isCurrent: false,
      startDate: toIso(s.start_date),
      endDate: toIso(s.end_date),
    }));
    return { ok: true, data, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  override async getStandings(input: { providerCompetitionId: string; season?: string }): Promise<ProviderResult<NormalizedStandingRow[]>> {
    if (!input.season) {
      return { ok: false, provider: this.name, requestKey: this.key("standings", input), fromCache: false, error: { code: "bad_response", message: "sportradar standings require a season id (sr:season:…)" } };
    }
    const res = await this.getJson<{ standings?: { groups?: { name?: string; standings?: { rank: number; team: { id: string }; played: number; win: number; draw: number; loss: number; goals_for: number; goals_against: number; points: number; form?: string }[] }[] } }>(
      `seasons/${input.season}/standings.json`,
      {},
    );
    if (!res.ok) return res;
    const out: NormalizedStandingRow[] = [];
    for (const group of res.data.standings?.groups ?? []) {
      for (const r of group.standings ?? []) {
        out.push({
          teamProviderId: r.team.id,
          group: str(group.name),
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

  override async healthCheck(): Promise<ProviderResult<ProviderHealth>> {
    const started = Date.now();
    const res = await this.getJson<{ tournaments?: unknown[] }>("competitions.json", {});
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

function mapSrEventType(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("goal")) return t.includes("own") ? "own_goal" : "goal";
  if (t.includes("yellow_red")) return "yellow_red_card";
  if (t.includes("red_card")) return "red_card";
  if (t.includes("yellow")) return "yellow_card";
  if (t.includes("substitut")) return "substitution";
  if (t.includes("var")) return t.includes("decision") ? "var_decision" : "var_review";
  if (t.includes("injur")) return "injury";
  if (t.includes("match_start")) return "match_start";
  if (t.includes("period")) return t.includes("end") ? "period_end" : "period_start";
  return t.replace(/\s+/g, "_") || "unknown";
}

function parseForm(form: string | null | undefined): ("W" | "D" | "L")[] {
  if (!form) return [];
  return form
    .split("")
    .filter((c): c is "W" | "D" | "L" => c === "W" || c === "D" || c === "L")
    .slice(-5);
}
