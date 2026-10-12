/**
 * NEMO Sports · Data Pipeline — shared vocabulary
 * ──────────────────────────────────────────────
 * Every module in `lib/pipeline/` speaks these types, and they come from two
 * places only:
 *
 *   · the registry (`config/pipeline/endpoints.yml`) → `PipelineConfig`,
 *     `SourceSpec`, `EndpointSpec`, `JobSpec`, `CompetitionSpec`;
 *   · a provider payload → the `Normalized*` entities, which are provider
 *     agnostic and deliberately free of any source-specific shape.
 *
 * Nothing here imports from a source module, so the whole vocabulary can be
 * unit-tested (and reviewed by a data engineer) without a network or a database.
 */

/* ─────────────────────────────── names & enums ─────────────────────────── */

/** A source as named in `sources:` — `egyptianproleague`, `football_data`, … */
export type SourceName = string;
/** A job as named in `jobs:` — `matches`, `standings`, … */
export type JobName = string;

export type SourceMode = "api" | "scrape";
export type EndpointKind = "json" | "html" | "text";

export type RunStatus = "running" | "ok" | "partial" | "failed" | "skipped";

export type TriggerName = "cron" | "manual" | "cli" | "backfill" | "bootstrap";

/** Which layer of the config was actually loaded (shown in the doctor/UI). */
export type ConfigOrigin = "yaml" | "json" | "local" | "path";

export type Severity = "critical" | "high" | "medium" | "low";

/** Canonical match status — the vocabulary the SDL and the site already use. */
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

/** Position qualifier a provider may attach to a table row. */
export type StandingStatus =
  | "champion"
  | "promotion"
  | "promotion_playoff"
  | "cup_position"
  | "relegation_playoff"
  | "relegation";

/** Row kinds a normalizer can produce; mirrors `CompetitionSpec.entities`. */
export type PipelineEntity = "competition" | "season" | "team" | "match" | "standing" | "venue" | "player";

/* ──────────────────────────────── registry ─────────────────────────────── */

export type AuthSpec = {
  /** Where the credential goes. Never *in* the registry, only its env name. */
  type: "header" | "query";
  header?: string;
  param?: string;
  /** Name of the environment variable holding the credential. */
  env: string;
};

export type RateLimitSpec = {
  /** Local window budgets — refuse before the provider has to 429 us. */
  per_minute?: number | null;
  per_day?: number | null;
  /** Extra floor on top of `policy.min_interval_ms`. */
  min_interval_ms?: number;
};

export type SourcePolicy = {
  respect_robots: boolean;
  min_interval_ms: number;
  timeout_ms: number;
};

export type EndpointSpec = {
  name: string;
  /** Path relative to `base_url`, used verbatim; `{placeholder}` allowed. */
  path: string;
  kind: EndpointKind;
  /**
   * `false` = not confirmed against the provider's documentation.
   * Unverified endpoints are never called unless the operator explicitly
   * overrides with PIPELINE_ALLOW_UNVERIFIED_ENDPOINTS=1.
   */
  verified: boolean;
  params?: Record<string, string | number | null | undefined>;
  headers?: Record<string, string>;
  notes?: string;
  docs?: string;
};

/** Used by TheSportsDB: find a provider id at runtime instead of guessing it. */
export type DiscoverySpec = {
  endpoint: string;
  store_as: string;
  match_field: string;
  match_contains: string;
};

export type TargetSpec = {
  competition: string;
  enabled: boolean;
  /**
   * `true` = a competition outside this deployment's coverage, kept so the
   * pipeline can be verified end to end. Nothing is published for it unless
   * PIPELINE_PUBLISH_FOREIGN=1.
   */
  foreign?: boolean;
  /**
   * Provider-specific references used to build paths/params — always strings
   * (`{code: EGP, season: current}`), so they can be dropped into a URL
   * template without a conversion step at every call site.
   */
  ref: Record<string, string>;
  notes?: string;
};

export type SourceSpec = {
  name: SourceName;
  label_ar: string;
  label_en: string;
  /** The provider's public entry point, exactly as published. */
  home: string;
  /** Origin + API root; the HTTP client refuses to leave this origin. */
  base_url: string;
  mode: SourceMode;
  enabled: boolean;
  /** Written permission to collect from this site; `false` until confirmed. */
  scraping_licensed: boolean;
  license_note?: string;
  docs?: string;
  /** Priority rank derived from `priority:` (0 = highest authority). */
  rank: number;
  policy: SourcePolicy;
  auth?: AuthSpec;
  rate_limit: RateLimitSpec;
  endpoints: EndpointSpec[];
  discovery?: DiscoverySpec;
  targets: TargetSpec[];
};

export type CompetitionType = "league" | "cup" | "tournament" | "friendly" | "international" | "playoff";

export type CompetitionSpec = {
  slug: string;
  name_ar: string;
  name_en: string;
  short_ar: string;
  short_en: string;
  /** Must stay within the `competitions.type` CHECK of db/schema.sql. */
  type: CompetitionType;
  country: string;
  /** Surfaced first on the site and in the admin lists. */
  featured: boolean;
  tier?: number;
  domestic?: boolean;
};

export type JobSpec = {
  name: JobName;
  description?: string;
  /** Sources this job may touch, in priority order. */
  sources: SourceName[];
  interval_minutes: number;
  matchday_interval_minutes?: number | null;
  min_interval_minutes?: number | null;
  /** Kickoff window that turns a normal day into a match day. */
  match_window_minutes?: number | null;
  /** Run on the first tick after a deploy (bootstrap only). */
  run_on_boot?: boolean;
  entities?: PipelineEntity[];
};

export type PipelineDefaults = {
  user_agent: string;
  contact_env: string;
  timeout_ms: number;
  retries: number;
  backoff_base_ms: number;
  backoff_max_ms: number;
  /** Cache lifetime of a fetched robots.txt. */
  robots_ttl_seconds: number;
  robots_ttl_minutes: number;
  min_interval_ms: number;
  raw_retention_days: number;
  max_payload_kb: number;
};

export type PipelineConfig = {
  version: number;
  /** Which file the config came from — surfaced by the doctor and the UI. */
  origin: ConfigOrigin;
  /** Ordered authority list: index 0 wins every conflict. */
  priority: SourceName[];
  defaults: PipelineDefaults;
  competitions: CompetitionSpec[];
  sources: SourceSpec[];
  jobs: JobSpec[];
};

export class PipelineConfigError extends Error {
  readonly issues: string[];
  constructor(message: string, issues: string[] = []) {
    super(issues.length ? `${message}: ${issues.join("; ")}` : message);
    this.name = "PipelineConfigError";
    this.issues = issues;
  }
}

/* ───────────────────────── canonical (normalized) rows ─────────────────── */

export type NormalizedTeam = {
  sourceId: string;
  name: string;
  shortName: string | null;
  countryCode: string | null;
  logoUrl: string | null;
  foundedYear: number | null;
  venueName: string | null;
};

export type NormalizedMatch = {
  sourceId: string;
  competitionSlug: string;
  seasonName: string | null;
  round: string | null;
  homeSourceId: string;
  awaySourceId: string;
  homeName: string;
  awayName: string;
  /** ISO-8601 UTC. Providers that omit it are skipped, never guessed. */
  scheduledAt: string;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  venueName: string | null;
};

export type NormalizedStanding = {
  sourceId: string;
  competitionSlug: string;
  seasonName: string | null;
  groupName: string | null;
  teamSourceId: string;
  teamName: string;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  form: string | null;
  status: StandingStatus | null;
};

export type NormalizedSeason = {
  sourceId: string;
  competitionSlug: string;
  /** "2025-2026" — derived from the provider's date window when possible. */
  name: string;
  /** Optional: a season may be known by name before its window is published. */
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  status: "upcoming" | "active" | "completed";
};

export type NormalizedCompetition = {
  sourceId: string;
  slug: string;
  name: string;
};

export type NormalizerContext = {
  competitionSlug: string;
  seasonName: string | null;
  source: SourceName;
  endpoint: string;
};

export type NormalizerResult<T> = {
  items: T[];
  /** Rows the normalizer saw but could not map — never silently dropped. */
  skipped: number;
  warnings: string[];
  notes?: string[];
};

/* ─────────────────────────────── HTTP layer ────────────────────────────── */

/** The result of one HTTP exchange, archived or not. */
export type RawRecord = {
  /** `raw_payloads.id` when the body was archived. */
  id: number | null;
  source: SourceName;
  endpoint: string;
  /** URL as called, credentials replaced by `***`. */
  url: string;
  fetchedAt: string;
  statusCode: number | null;
  etag: string | null;
  lastModified: string | null;
  contentType: string | null;
  payloadHash: string | null;
  /** Parsed JSON body (null for HTML/text, 304s and failures). */
  payload: unknown;
  /** Raw body, kept for HTML/text endpoints. */
  payloadText?: string | null;
  bytes: number | null;
  durationMs: number | null;
  runId: string | null;
  notModified: boolean;
  attempts: number;
  error: string | null;
};

/* ───────────────────────────── run bookkeeping ─────────────────────────── */

export type SyncRun = {
  id: string;
  job: JobName;
  source: SourceName | null;
  trigger: TriggerName;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  attempt: number;
  stats: Record<string, number>;
  error: string | null;
  notes: string | null;
};

export type SyncState = {
  source: SourceName;
  job: JobName;
  cursor: Record<string, unknown>;
  etag: string | null;
  lastModified: string | null;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  nextDueAt: string | null;
};
