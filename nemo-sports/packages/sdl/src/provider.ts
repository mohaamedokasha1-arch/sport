/**
 * SDL · Provider Abstraction (§3.3)
 * ─────────────────────────────────
 * Every external provider is an adapter behind this interface.
 * Nothing outside `adapters/` may know a provider's URL, auth scheme or
 * payload shape (Instruction 2: no direct provider coupling).
 */

import type { ProviderName } from "./types";

export type { ProviderName };

/** What a given adapter can actually serve. Unsupported data types are declared, not thrown. */
export type DataType =
  | "fixtures"
  | "live_matches"
  | "match_detail"
  | "match_events"
  | "match_stats"
  | "match_lineups"
  | "team"
  | "team_squad"
  | "team_stats"
  | "player"
  | "player_stats"
  | "competition"
  | "competition_seasons"
  | "standings"
  | "top_scorers"
  | "fixture_list"
  | "results"
  | "venue"
  | "images"
  | "health";

export type ProviderError = {
  code:
    | "network"
    | "timeout"
    | "auth"
    | "rate_limited"
    | "not_found"
    | "bad_response"
    | "not_supported"
    | "unknown";
  message: string;
  /** provider HTTP status when the failure came from an HTTP response */
  httpStatus?: number;
  /** seconds to wait before retrying, when the provider told us */
  retryAfterSeconds?: number;
};

export type ProviderResult<T> =
  | {
      ok: true;
      data: T;
      provider: ProviderName;
      /** when the provider says the data was captured, not when we fetched it */
      fetchedAt: string;
      /** sha1 of endpoint+params — the cache and rate-limit keys derive from it */
      requestKey: string;
      fromCache: boolean;
    }
  | {
      ok: false;
      error: ProviderError;
      provider: ProviderName;
      requestKey: string;
      fromCache: false;
    };

export type DateRange = { from: string; to: string };

/* ── normalized payloads (already in NEMO's vocabulary) ─────── */

export type NormalizedFixture = {
  providerId: string;
  sport: string;
  competitionProviderId: string;
  seasonProviderId: string | null;
  round: string | null;
  homeProviderId: string | null;
  awayProviderId: string | null;
  scheduledAt: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  periods: { label: string; home: number | null; away: number | null }[];
  venueProviderId: string | null;
  venueName: string | null;
  attendance: number | null;
  minute: number | null;
  /** Optional display metadata a provider may attach (never persisted). */
  homeName?: string | null;
  awayName?: string | null;
  homeLogoUrl?: string | null;
  awayLogoUrl?: string | null;
  competitionName?: string | null;
  /** provider-side permalink for the match (attribution / deep-link) */
  sourceUrl?: string | null;
};

export type NormalizedEvent = {
  providerEventId: string;
  providerMatchId: string;
  type: string;
  minute: number | null;
  additionalMinute: number | null;
  teamProviderId: string | null;
  playerProviderId: string | null;
  secondaryPlayerProviderId: string | null;
  description: string | null;
};

export type NormalizedStat = {
  teamProviderId: string;
  type: string;
  value: number | string;
  period: string;
};

export type NormalizedLineupPlayer = {
  providerId: string;
  name: string;
  position: string | null;
  jerseyNumber: number | null;
};

export type NormalizedLineup = {
  teamProviderId: string;
  formation: string | null;
  coach: string | null;
  starters: NormalizedLineupPlayer[];
  bench: NormalizedLineupPlayer[];
};

export type NormalizedTeam = {
  providerId: string;
  name: string;
  shortName: string | null;
  abbreviation: string | null;
  countryCode: string | null;
  countryName: string | null;
  logoUrl: string | null;
  foundedYear: number | null;
  venueName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  isNationalTeam: boolean;
};

export type NormalizedSquadMember = {
  providerId: string;
  name: string;
  position: string | null;
  jerseyNumber: number | null;
  dateOfBirth: string | null;
  countryCode: string | null;
  photoUrl: string | null;
  photoAttribution: string | null;
};

export type NormalizedPlayer = {
  providerId: string;
  fullName: string;
  dateOfBirth: string | null;
  countryCode: string | null;
  position: string | null;
  photoUrl: string | null;
  photoAttribution: string | null;
  heightCm: number | null;
  weightKg: number | null;
  footPreference: "right" | "left" | "both" | null;
  teamProviderId: string | null;
};

export type NormalizedPlayerStats = {
  providerId: string;
  seasonName: string | null;
  appearances: number | null;
  goals: number | null;
  assists: number | null;
  minutes: number | null;
  yellowCards: number | null;
  redCards: number | null;
  rating: number | null;
  extra: Record<string, number | string>;
};

export type NormalizedCompetition = {
  providerId: string;
  name: string;
  shortName: string | null;
  countryCode: string | null;
  countryName: string | null;
  type: string | null;
  logoUrl: string | null;
};

export type NormalizedSeason = {
  providerId: string;
  competitionProviderId: string;
  name: string;
  isCurrent: boolean;
  startDate: string | null;
  endDate: string | null;
};

export type NormalizedStandingRow = {
  teamProviderId: string;
  group: string | null;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  form: ("W" | "D" | "L")[];
  status: string | null;
};

export type NormalizedTopScorer = {
  playerProviderId: string;
  teamProviderId: string | null;
  goals: number;
  appearances: number | null;
  penalties: number | null;
};

export type NormalizedVenue = {
  providerId: string;
  name: string;
  city: string | null;
  countryCode: string | null;
  capacity: number | null;
  lat: number | null;
  lng: number | null;
};

export type ProviderHealth = {
  provider: ProviderName;
  reachable: boolean;
  checkedAt: string;
  latencyMs: number | null;
  /** quota left today, when the provider exposes it */
  quotaRemaining: number | null;
  detail: string | null;
};

/** Every adapter implements this. Methods it cannot serve return `not_supported`. */
export interface SportsDataProvider {
  readonly name: ProviderName;
  readonly capabilities: DataType[];
  readonly supportedSports: string[];

  getFixtures(input: { sport: string; competitionProviderId?: string; range?: DateRange; date?: string }): Promise<ProviderResult<NormalizedFixture[]>>;
  getLiveMatches(input: { sport: string }): Promise<ProviderResult<NormalizedFixture[]>>;
  getMatchDetail(input: { providerMatchId: string; sport?: string }): Promise<ProviderResult<NormalizedFixture>>;
  getMatchEvents(input: { providerMatchId: string; sport?: string }): Promise<ProviderResult<NormalizedEvent[]>>;
  getMatchStats(input: { providerMatchId: string; sport?: string }): Promise<ProviderResult<NormalizedStat[]>>;
  getMatchLineups(input: { providerMatchId: string; sport?: string }): Promise<ProviderResult<NormalizedLineup[]>>;
  getTeam(input: { providerTeamId: string }): Promise<ProviderResult<NormalizedTeam>>;
  getTeamSquad(input: { providerTeamId: string }): Promise<ProviderResult<NormalizedSquadMember[]>>;
  getPlayer(input: { providerPlayerId: string }): Promise<ProviderResult<NormalizedPlayer>>;
  getPlayerStats(input: { providerPlayerId: string; season?: string; sport?: string }): Promise<ProviderResult<NormalizedPlayerStats>>;
  getCompetition(input: { providerCompetitionId: string }): Promise<ProviderResult<NormalizedCompetition>>;
  getCompetitionSeasons(input: { providerCompetitionId: string }): Promise<ProviderResult<NormalizedSeason[]>>;
  getStandings(input: { providerCompetitionId: string; season?: string; sport?: string }): Promise<ProviderResult<NormalizedStandingRow[]>>;
  getTopScorers(input: { providerCompetitionId: string; season?: string; sport?: string }): Promise<ProviderResult<NormalizedTopScorer[]>>;
  getVenue(input: { providerVenueId: string }): Promise<ProviderResult<NormalizedVenue>>;
  healthCheck(): Promise<ProviderResult<ProviderHealth>>;
}

export const notSupported = (
  provider: ProviderName,
  dataType: DataType,
  requestKey: string,
): ProviderResult<never> => ({
  ok: false,
  provider,
  requestKey,
  fromCache: false,
  error: {
    code: "not_supported",
    message: `${provider} does not provide ${dataType}`,
  },
});

/** Every data type an adapter may declare support for. */
export const DATA_TYPES: DataType[] = [
  "fixtures",
  "live_matches",
  "match_detail",
  "match_events",
  "match_stats",
  "match_lineups",
  "team",
  "team_squad",
  "team_stats",
  "player",
  "player_stats",
  "competition",
  "competition_seasons",
  "standings",
  "top_scorers",
  "fixture_list",
  "results",
  "venue",
  "images",
  "health",
];
