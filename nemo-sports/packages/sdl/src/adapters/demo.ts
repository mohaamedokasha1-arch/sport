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

import { withDefaults, type HttpOptions } from "./base";
import type {
  DataType,
  NormalizedCompetition,
  NormalizedEvent,
  NormalizedFixture,
  NormalizedSeason,
  NormalizedStandingRow,
  NormalizedStat,
  NormalizedTeam,
  NormalizedTopScorer,
  ProviderResult,
} from "../provider";
import type { ProviderHealth } from "../provider";

export type DemoConfig = HttpOptions & {
  fixtures?: NormalizedFixture[];
  teams?: NormalizedTeam[];
  events?: NormalizedEvent[];
  standings?: NormalizedStandingRow[];
  scorers?: NormalizedTopScorer[];
  competitions?: NormalizedCompetition[];
  seasons?: NormalizedSeason[];
  stats?: NormalizedStat[];
  /** simulate provider faults in tests */
  failWith?: { dataType: DataType; error: string; code?: "network" | "timeout" | "rate_limited" | "auth" } | null;
  latencyMs?: number;
};

const hourFromNow = (h: number, min = 0) => new Date(Date.now() + h * 3600_000 + min * 60_000).toISOString();

export const DEMO_FIXTURES: NormalizedFixture[] = [
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

export const DEMO_TEAMS: NormalizedTeam[] = [
  { providerId: "demo-ars", name: "Arsenal", shortName: "Arsenal", abbreviation: "ARS", countryCode: "GB", countryName: "England", logoUrl: null, foundedYear: 1886, venueName: "Emirates Stadium", primaryColor: "#EF0107", secondaryColor: "#023474", isNationalTeam: false },
  { providerId: "demo-chel", name: "Chelsea", shortName: "Chelsea", abbreviation: "CHE", countryCode: "GB", countryName: "England", logoUrl: null, foundedYear: 1905, venueName: "Stamford Bridge", primaryColor: "#034694", secondaryColor: "#DBA111", isNationalTeam: false },
  { providerId: "demo-liv", name: "Liverpool", shortName: "Liverpool", abbreviation: "LIV", countryCode: "GB", countryName: "England", logoUrl: null, foundedYear: 1892, venueName: "Anfield", primaryColor: "#C8102E", secondaryColor: "#00B2A9", isNationalTeam: false },
  { providerId: "demo-mci", name: "Manchester City", shortName: "Man City", abbreviation: "MCI", countryCode: "GB", countryName: "England", logoUrl: null, foundedYear: 1880, venueName: "Etihad Stadium", primaryColor: "#6CABDD", secondaryColor: "#1C2C5B", isNationalTeam: false },
  { providerId: "demo-ahly", name: "Al Ahly", shortName: "Al Ahly", abbreviation: "AHL", countryCode: "EG", countryName: "Egypt", logoUrl: null, foundedYear: 1907, venueName: "Cairo International Stadium", primaryColor: "#C8102E", secondaryColor: "#FFFFFF", isNationalTeam: false },
  { providerId: "demo-zamalek", name: "Zamalek", shortName: "Zamalek", abbreviation: "ZAM", countryCode: "EG", countryName: "Egypt", logoUrl: null, foundedYear: 1911, venueName: "Cairo International Stadium", primaryColor: "#FFFFFF", secondaryColor: "#C8102E", isNationalTeam: false },
];

export const DEMO_EVENTS: NormalizedEvent[] = [
  { providerEventId: "e1", providerMatchId: "demo-1002", type: "goal", minute: 23, additionalMinute: null, teamProviderId: "demo-liv", playerProviderId: "demo-p1", secondaryPlayerProviderId: null, description: "Opening goal" },
  { providerEventId: "e2", providerMatchId: "demo-1002", type: "goal", minute: 41, additionalMinute: null, teamProviderId: "demo-mci", playerProviderId: "demo-p2", secondaryPlayerProviderId: null, description: "Equaliser" },
  { providerEventId: "e3", providerMatchId: "demo-1002", type: "yellow_card", minute: 55, additionalMinute: null, teamProviderId: "demo-mci", playerProviderId: "demo-p3", secondaryPlayerProviderId: null, description: "Tactical foul" },
  { providerEventId: "e4", providerMatchId: "demo-1002", type: "goal", minute: 66, additionalMinute: null, teamProviderId: "demo-liv", playerProviderId: "demo-p4", secondaryPlayerProviderId: null, description: "Winner" },
];

export const DEMO_STANDINGS: NormalizedStandingRow[] = [
  { teamProviderId: "demo-liv", group: null, position: 1, played: 23, won: 16, drawn: 5, lost: 2, goalsFor: 51, goalsAgainst: 20, points: 53, form: ["W", "W", "D", "W", "L"], status: "champion" },
  { teamProviderId: "demo-ars", group: null, position: 2, played: 23, won: 15, drawn: 6, lost: 2, goalsFor: 47, goalsAgainst: 18, points: 51, form: ["W", "D", "W", "W", "W"], status: "promotion" },
  { teamProviderId: "demo-mci", group: null, position: 3, played: 23, won: 14, drawn: 4, lost: 5, goalsFor: 49, goalsAgainst: 27, points: 46, form: ["W", "W", "L", "W", "D"], status: "cup_position" },
  { teamProviderId: "demo-chel", group: null, position: 4, played: 23, won: 12, drawn: 7, lost: 4, goalsFor: 44, goalsAgainst: 29, points: 43, form: ["D", "W", "D", "L", "W"], status: "cup_position" },
];

export const DEMO_SCORERS: NormalizedTopScorer[] = [
  { playerProviderId: "demo-p1", teamProviderId: "demo-liv", goals: 19, appearances: 22, penalties: 3 },
  { playerProviderId: "demo-p2", teamProviderId: "demo-mci", goals: 17, appearances: 21, penalties: 2 },
  { playerProviderId: "demo-p5", teamProviderId: "demo-ars", goals: 15, appearances: 23, penalties: 0 },
];

export const DEMO_COMPETITIONS: NormalizedCompetition[] = [
  { providerId: "demo-pl", name: "Premier League", shortName: "EPL", countryCode: "GB", countryName: "England", type: "league", logoUrl: null },
  { providerId: "demo-epl-eg", name: "Egyptian Premier League", shortName: "Egypt PL", countryCode: "EG", countryName: "Egypt", type: "league", logoUrl: null },
];

export class DemoAdapter extends withDefaults("demo") {
  readonly capabilities: DataType[] = ["fixtures", "live_matches", "match_detail", "match_events", "match_stats", "team", "competition", "competition_seasons", "standings", "top_scorers", "health"];
  readonly supportedSports = ["football", "basketball", "tennis", "volleyball", "handball", "hockey", "baseball", "boxing"];

  private cfg: Required<Pick<DemoConfig, "failWith" | "latencyMs">> & DemoConfig;

  constructor(cfg: DemoConfig = {}) {
    super({ timeoutMs: cfg.timeoutMs ?? 2000, retries: cfg.retries ?? 0, fetchImpl: cfg.fetchImpl });
    this.cfg = { ...cfg, failWith: cfg.failWith ?? null, latencyMs: cfg.latencyMs ?? 0 };
  }

  /** @internal */ override baseUrl(): string {
    return "demo://local";
  }

  /** Fault injection so failover/health behaviour is testable. */
  setFault(fault: DemoConfig["failWith"]): void {
    this.cfg.failWith = fault ?? null;
  }

  mutate(fixtureId: string, patch: Partial<NormalizedFixture>): void {
    const list = this.cfg.fixtures ?? DEMO_FIXTURES;
    const f = list.find((x) => x.providerId === fixtureId);
    if (f) Object.assign(f, patch);
  }

  private async gate<T>(dataType: DataType, endpoint: string, params: Record<string, unknown>): Promise<ProviderResult<T> | null> {
    if (this.cfg.latencyMs) await new Promise((r) => setTimeout(r, this.cfg.latencyMs));
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

  private ok<T>(data: T, endpoint: string, params: Record<string, unknown>): ProviderResult<T> {
    return { ok: true, data, provider: this.name, fetchedAt: new Date().toISOString(), requestKey: this.key(endpoint, params), fromCache: false };
  }

  override async getFixtures(input: { sport: string; competitionProviderId?: string; range?: { from: string; to: string }; date?: string }): Promise<ProviderResult<NormalizedFixture[]>> {
    const faulted = await this.gate<NormalizedFixture[]>("fixtures", "fixtures", input);
    if (faulted) return faulted;
    let list = [...(this.cfg.fixtures ?? DEMO_FIXTURES)];
    if (input.sport) list = list.filter((f) => f.sport === input.sport);
    if (input.competitionProviderId) list = list.filter((f) => f.competitionProviderId === input.competitionProviderId);
    if (input.date) list = list.filter((f) => f.scheduledAt.slice(0, 10) === input.date);
    if (input.range) list = list.filter((f) => f.scheduledAt >= input.range!.from && f.scheduledAt <= input.range!.to);
    return this.ok(list, "fixtures", input);
  }

  override async getLiveMatches(input: { sport: string }): Promise<ProviderResult<NormalizedFixture[]>> {
    const faulted = await this.gate<NormalizedFixture[]>("live_matches", "live", input);
    if (faulted) return faulted;
    const list = (this.cfg.fixtures ?? DEMO_FIXTURES).filter((f) => f.sport === input.sport && (f.status === "live" || f.status === "halftime" || f.status === "extra_time" || f.status === "penalty_shootout"));
    return this.ok(list, "live", input);
  }

  override async getMatchDetail(input: { providerMatchId: string }): Promise<ProviderResult<NormalizedFixture>> {
    const faulted = await this.gate<NormalizedFixture>("match_detail", "match", input);
    if (faulted) return faulted;
    const f = (this.cfg.fixtures ?? DEMO_FIXTURES).find((x) => x.providerId === input.providerMatchId);
    if (!f) return { ok: false, provider: this.name, requestKey: this.key("match", input), fromCache: false, error: { code: "not_found", message: `demo fixture ${input.providerMatchId} not found` } };
    return this.ok(f, "match", input);
  }

  override async getMatchEvents(input: { providerMatchId: string }): Promise<ProviderResult<NormalizedEvent[]>> {
    const faulted = await this.gate<NormalizedEvent[]>("match_events", "events", input);
    if (faulted) return faulted;
    return this.ok((this.cfg.events ?? DEMO_EVENTS).filter((e) => e.providerMatchId === input.providerMatchId), "events", input);
  }

  override async getMatchStats(input: { providerMatchId: string }): Promise<ProviderResult<NormalizedStat[]>> {
    const faulted = await this.gate<NormalizedStat[]>("match_stats", "stats", input);
    if (faulted) return faulted;
    return this.ok(this.cfg.stats ?? [], "stats", input);
  }

  override async getTeam(input: { providerTeamId: string }): Promise<ProviderResult<NormalizedTeam>> {
    const faulted = await this.gate<NormalizedTeam>("team", "team", input);
    if (faulted) return faulted;
    const t = (this.cfg.teams ?? DEMO_TEAMS).find((x) => x.providerId === input.providerTeamId);
    if (!t) return { ok: false, provider: this.name, requestKey: this.key("team", input), fromCache: false, error: { code: "not_found", message: `demo team ${input.providerTeamId} not found` } };
    return this.ok(t, "team", input);
  }

  override async getCompetition(input: { providerCompetitionId: string }): Promise<ProviderResult<NormalizedCompetition>> {
    const faulted = await this.gate<NormalizedCompetition>("competition", "competition", input);
    if (faulted) return faulted;
    const c = (this.cfg.competitions ?? DEMO_COMPETITIONS).find((x) => x.providerId === input.providerCompetitionId);
    if (!c) return { ok: false, provider: this.name, requestKey: this.key("competition", input), fromCache: false, error: { code: "not_found", message: `demo competition ${input.providerCompetitionId} not found` } };
    return this.ok(c, "competition", input);
  }

  override async getCompetitionSeasons(input: { providerCompetitionId: string }): Promise<ProviderResult<NormalizedSeason[]>> {
    const faulted = await this.gate<NormalizedSeason[]>("competition_seasons", "seasons", input);
    if (faulted) return faulted;
    const year = new Date().getFullYear();
    const list =
      this.cfg.seasons ??
      [year - 1, year].map((y) => ({ providerId: `${input.providerCompetitionId}-${y}`, competitionProviderId: input.providerCompetitionId, name: `${y - 1}/${y}`, isCurrent: y === year, startDate: null, endDate: null }));
    return this.ok(list, "seasons", input);
  }

  override async getStandings(input: { providerCompetitionId: string; season?: string }): Promise<ProviderResult<NormalizedStandingRow[]>> {
    const faulted = await this.gate<NormalizedStandingRow[]>("standings", "standings", input);
    if (faulted) return faulted;
    return this.ok(this.cfg.standings ?? DEMO_STANDINGS, "standings", input);
  }

  override async getTopScorers(input: { providerCompetitionId: string; season?: string }): Promise<ProviderResult<NormalizedTopScorer[]>> {
    const faulted = await this.gate<NormalizedTopScorer[]>("top_scorers", "top_scorers", input);
    if (faulted) return faulted;
    return this.ok(this.cfg.scorers ?? DEMO_SCORERS, "top_scorers", input);
  }

  override async healthCheck(): Promise<ProviderResult<ProviderHealth>> {
    const faulted = await this.gate<ProviderHealth>("health", "health", {});
    if (faulted) return faulted;
    const at = new Date().toISOString();
    return this.ok({ provider: this.name, reachable: true, checkedAt: at, latencyMs: this.cfg.latencyMs, quotaRemaining: null, detail: "in-memory demo provider" }, "health", {});
  }
}
