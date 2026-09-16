/**
 * NEMO Sports · Sports Data Layer (SDL) — Canonical Data Model
 * ─────────────────────────────────────────────────────────────
 * These types are the ONLY shapes that may leave the SDL boundary.
 * No provider-specific structure is ever exported from this package.
 *
 * Every canonical entity carries a NEMO UUID that is the single source of
 * truth across the platform (Instruction 4: canonical IDs are sacred).
 */

export type UUID = string;
export type ISODate = string; // UTC

export type ProviderName = "sportradar" | "sportmonks" | "api_football" | "thesportsdb" | "demo";

/** User-facing text is stored bilingually from day one (§1.3). */
export type LocalizedText = { ar: string; en: string };

export type MatchStatus =
  | "scheduled"
  | "live"
  | "halftime"
  | "extra_time"
  | "extra_time_halftime"
  | "penalty_shootout"
  | "finished"
  | "postponed"
  | "cancelled"
  | "suspended"
  | "abandoned"
  | "walkover"
  | "awarded";

export type MatchSide = "home" | "away";

export type MatchEventType =
  | "goal"
  | "own_goal"
  | "yellow_card"
  | "red_card"
  | "yellow_red_card"
  | "substitution"
  | "var_review"
  | "var_decision"
  | "penalty_awarded"
  | "penalty_missed"
  | "period_start"
  | "period_end"
  | "match_start"
  | "match_end"
  | "injury"
  | "extra_time_start"
  | "penalty_shootout_start";

export type Country = {
  id: UUID;
  iso2: string;
  iso3: string;
  name: LocalizedText;
  continent: string;
  flagUrl: string | null;
};

export type Sport = {
  id: UUID;
  slug: string;
  name: LocalizedText;
  shortName: LocalizedText;
  icon: string | null;
  isActive: boolean;
  displayOrder: number;
  /** sport-specific knobs (scoring unit, period count, stat vocabulary…) */
  config: Record<string, unknown>;
};

export type CompetitionType = "league" | "cup" | "tournament" | "friendly" | "international" | "playoff";

export type Competition = {
  id: UUID;
  sportId: UUID;
  countryId: UUID | null;
  name: LocalizedText;
  shortName: LocalizedText;
  slug: string;
  logoUrl: string | null;
  type: CompetitionType;
  gender: "male" | "female" | "mixed";
  ageCategory: "senior" | "u23" | "u21" | "u19" | "u18" | "youth";
  isActive: boolean;
  isFeatured: boolean;
  displayOrder: number;
  currentSeasonId: UUID | null;
};

export type Season = {
  id: UUID;
  competitionId: UUID;
  name: string;
  slug: string;
  startDate: ISODate | null;
  endDate: ISODate | null;
  isCurrent: boolean;
  status: "upcoming" | "active" | "completed";
};

export type Venue = {
  id: UUID;
  name: LocalizedText;
  city: LocalizedText | null;
  countryId: UUID | null;
  capacity: number | null;
  surface: string | null;
  lat: number | null;
  lng: number | null;
  imageUrl: string | null;
};

export type TeamType = "club" | "national" | "franchise";

export type Team = {
  id: UUID;
  sportId: UUID;
  countryId: UUID | null;
  name: LocalizedText;
  shortName: LocalizedText;
  abbreviation: string;
  slug: string;
  logoUrl: string | null;
  foundedYear: number | null;
  venueId: UUID | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  isNationalTeam: boolean;
  type: TeamType;
  isActive: boolean;
  social: Record<string, string>;
};

export type Player = {
  id: UUID;
  sportId: UUID;
  currentTeamId: UUID | null;
  countryId: UUID | null;
  fullName: LocalizedText;
  slug: string;
  dateOfBirth: ISODate | null;
  position: string | null;
  jerseyNumber: number | null;
  photoUrl: string | null;
  /** provider + licence reference; null unless usage rights are confirmed (§8.1 spirit) */
  photoAttribution: string | null;
  heightCm: number | null;
  weightKg: number | null;
  footPreference: "right" | "left" | "both" | null;
  careerStartedYear: number | null;
  isActive: boolean;
  biography: LocalizedText | null;
};

export type PeriodScore = { label: string; home: number | null; away: number | null };

export type Match = {
  id: UUID;
  sportId: UUID;
  competitionId: UUID;
  seasonId: UUID | null;
  round: string | null;
  homeTeamId: UUID | null;
  awayTeamId: UUID | null;
  venueId: UUID | null;
  /** always UTC — conversion to local time happens at display time (§1.3) */
  scheduledAt: ISODate;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  periods: PeriodScore[];
  aggregateScore: { home: number; away: number } | null;
  winner: MatchSide | "draw" | null;
  leg: number | null;
  neutralVenue: boolean;
  referee: { name: string; country: string | null } | null;
  attendance: number | null;
  isFeatured: boolean;
  /** sport-specific payload — keeps football assumptions out of the core schema */
  extension: Record<string, unknown>;
};

export type MatchEvent = {
  id: string;
  matchId: UUID;
  type: MatchEventType;
  minute: number | null;
  additionalMinute: number | null;
  teamId: UUID | null;
  playerId: UUID | null;
  secondaryPlayerId: UUID | null;
  description: string | null;
  provider: ProviderName;
  providerEventId: string | null;
  receivedAt: ISODate;
};

export type MatchStat = {
  id: string;
  matchId: UUID;
  teamId: UUID;
  type: string;
  value: number | string;
  period: string;
  provider: ProviderName;
  updatedAt: ISODate;
};

export type StandingStatus =
  | "champion"
  | "promotion"
  | "promotion_playoff"
  | "cup_position"
  | "relegation_playoff"
  | "relegation"
  | null;

export type Standing = {
  id: string;
  competitionId: UUID;
  seasonId: UUID;
  group: string | null;
  teamId: UUID;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: ("W" | "D" | "L")[];
  status: StandingStatus;
  /** which provider this row came from — needed for conflict resolution */
  provider: ProviderName;
  updatedAt: ISODate;
};

export type TopScorer = {
  id: string;
  competitionId: UUID;
  seasonId: UUID;
  playerId: UUID;
  teamId: UUID | null;
  goals: number;
  appearances: number;
  penalties: number;
  updatedAt: ISODate;
};

/** One row of `provider_entity_map` — links an external ID to a canonical entity. */
export type ProviderMapping = {
  id: string;
  entityType: EntityType;
  canonicalId: UUID;
  provider: ProviderName;
  providerId: string;
  confidence: number;
  verified: boolean;
  notes: string | null;
  createdAt: ISODate;
  updatedAt: ISODate;
};

export type EntityType =
  | "sport"
  | "competition"
  | "season"
  | "match"
  | "team"
  | "player"
  | "venue"
  | "country"
  | "standing";
