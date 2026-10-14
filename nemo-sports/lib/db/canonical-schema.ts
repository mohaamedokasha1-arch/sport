/**
 * NEMO Sports · canonical schema — idempotent self-healing bootstrap
 * ──────────────────────────────────────────────────────────────────
 * The problem this module exists for: `DATABASE_URL` points at a database
 * that was never initialised (a fresh Neon/Supabase branch, a restored dump
 * that lost the canonical tables, a deployment whose `db:setup` step was
 * skipped). Every request-time writer then dies with
 *
 *     error: relation "sports" does not exist
 *
 * and `GET /api/cron/update-matches` answered 500 instead of updating
 * anything. "Run db:setup manually" is not a fix a visitor can apply, so the
 * platform now heals itself before it reads or writes:
 *
 *   · ONE cheap probe (`to_regclass`) per process — if every table exists, no
 *     DDL is ever sent (a healthy production database pays one round trip per
 *     instance and nothing else);
 *   · only when something is missing, the canonical / pipeline / read-model
 *     tables are created with `CREATE TABLE IF NOT EXISTS` — additive only,
 *     never destructive, never re-creating what exists, never touching rows;
 *   · the statements are the SAME DDL as `db/schema.sql`, `db/migration-0006`
 *     and `db/migration-0007`, and `scripts/verify-db-selfheal.test.ts` fails
 *     if they ever drift apart;
 *   · every failure is collected, sanitised and returned — this function
 *     never throws, because a database that cannot be prepared must produce an
 *     honest 200 answer from the route, not an unhandled exception;
 *   · `NEMO_DB_AUTO_MIGRATE=0` disables the DDL for operators who want schema
 *     changes to go through `npm run db:setup` only.
 *
 * This module deliberately does NOT import the pg driver: it takes any
 * `SqlClient`, which keeps `lib/db/pg.ts → canonical-schema.ts` a one-way
 * dependency and lets the tests drive it with PGlite.
 *
 * What it does NOT do: alter an existing table whose shape is older than the
 * canonical schema, and create indexes/constraints on tables that already
 * exist (the pre-check is table-level). `npm run db:setup` remains the way to
 * apply schema *changes*; this is the way to survive a schema that is absent.
 */

import type { SqlClient } from "@/packages/sdl/src";
import { sanitizeDbMessage } from "./sanitize";

export type DdlStatement = {
  /** The object this statement creates — used for reporting and diagnostics. */
  object: string;
  sql: string;
};

/* ─── canonical entities (db/schema.sql, migration 0001) ─────────────────── */

const CANONICAL: DdlStatement[] = [
  {
    object: "sports",
    sql: `CREATE TABLE IF NOT EXISTS sports (
  id              uuid PRIMARY KEY,
  slug            text        NOT NULL UNIQUE,
  name_ar         text        NOT NULL,
  name_en         text        NOT NULL,
  short_name_ar   text        NOT NULL,
  short_name_en   text        NOT NULL,
  icon            text,
  is_active       boolean     NOT NULL DEFAULT true,
  display_order   integer     NOT NULL DEFAULT 100,
  config          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
)`,
  },
  {
    object: "countries",
    sql: `CREATE TABLE IF NOT EXISTS countries (
  id          uuid PRIMARY KEY,
  iso2        char(2)     NOT NULL UNIQUE,
  iso3        char(3)     NOT NULL UNIQUE,
  name_ar     text        NOT NULL,
  name_en     text        NOT NULL,
  continent   text,
  flag_url    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
)`,
  },
  {
    object: "competitions",
    sql: `CREATE TABLE IF NOT EXISTS competitions (
  id                uuid PRIMARY KEY,
  sport_id          uuid NOT NULL REFERENCES sports(id),
  country_id        uuid REFERENCES countries(id),
  name_ar           text NOT NULL,
  name_en           text NOT NULL,
  short_name_ar     text NOT NULL,
  short_name_en     text NOT NULL,
  slug              text NOT NULL UNIQUE,
  logo_url          text,
  type              text NOT NULL DEFAULT 'league'
                    CHECK (type IN ('league','cup','tournament','friendly','international','playoff')),
  gender            text NOT NULL DEFAULT 'male' CHECK (gender IN ('male','female','mixed')),
  age_category      text NOT NULL DEFAULT 'senior'
                    CHECK (age_category IN ('senior','u23','u21','u19','u18','youth')),
  is_active         boolean NOT NULL DEFAULT true,
  is_featured       boolean NOT NULL DEFAULT false,
  display_order     integer NOT NULL DEFAULT 100,
  current_season_id uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
)`,
  },
  { object: "idx_competitions_sport", sql: `CREATE INDEX IF NOT EXISTS idx_competitions_sport  ON competitions(sport_id) WHERE is_active` },
  { object: "idx_competitions_feat", sql: `CREATE INDEX IF NOT EXISTS idx_competitions_feat   ON competitions(display_order) WHERE is_featured AND is_active` },
  {
    object: "seasons",
    sql: `CREATE TABLE IF NOT EXISTS seasons (
  id             uuid PRIMARY KEY,
  competition_id uuid NOT NULL REFERENCES competitions(id),
  name           text NOT NULL,
  slug           text NOT NULL,
  start_date     date,
  end_date       date,
  is_current     boolean NOT NULL DEFAULT false,
  status         text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','active','completed')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_id, slug)
)`,
  },
  { object: "idx_seasons_one_current", sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_seasons_one_current ON seasons(competition_id) WHERE is_current` },
  {
    object: "fk_competitions_current_season",
    sql: `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_competitions_current_season') THEN
    ALTER TABLE competitions
      ADD CONSTRAINT fk_competitions_current_season
      FOREIGN KEY (current_season_id) REFERENCES seasons(id) DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$`,
  },
  {
    object: "venues",
    sql: `CREATE TABLE IF NOT EXISTS venues (
  id           uuid PRIMARY KEY,
  name_ar      text NOT NULL,
  name_en      text NOT NULL,
  city_ar      text,
  city_en      text,
  country_id   uuid REFERENCES countries(id),
  capacity     integer CHECK (capacity IS NULL OR capacity >= 0),
  surface      text,
  lat          numeric(9,6),
  lng          numeric(9,6),
  image_url    text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
)`,
  },
  {
    object: "teams",
    sql: `CREATE TABLE IF NOT EXISTS teams (
  id              uuid PRIMARY KEY,
  sport_id        uuid NOT NULL REFERENCES sports(id),
  country_id      uuid REFERENCES countries(id),
  name_ar         text NOT NULL,
  name_en         text NOT NULL,
  short_name_ar   text NOT NULL,
  short_name_en   text NOT NULL,
  abbreviation    text NOT NULL,
  slug            text NOT NULL UNIQUE,
  logo_url        text,
  logo_source     text,
  founded_year    smallint,
  venue_id        uuid REFERENCES venues(id),
  primary_color   char(7),
  secondary_color char(7),
  is_national     boolean NOT NULL DEFAULT false,
  type            text NOT NULL DEFAULT 'club' CHECK (type IN ('club','national','franchise')),
  is_active       boolean NOT NULL DEFAULT true,
  social          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
)`,
  },
  { object: "idx_teams_sport", sql: `CREATE INDEX IF NOT EXISTS idx_teams_sport ON teams(sport_id) WHERE is_active` },
  { object: "idx_teams_name", sql: `CREATE INDEX IF NOT EXISTS idx_teams_name  ON teams USING gin (to_tsvector('simple', name_en || ' ' || name_ar))` },
  {
    object: "players",
    sql: `CREATE TABLE IF NOT EXISTS players (
  id                  uuid PRIMARY KEY,
  sport_id            uuid NOT NULL REFERENCES sports(id),
  current_team_id     uuid REFERENCES teams(id),
  country_id          uuid REFERENCES countries(id),
  full_name_ar        text NOT NULL,
  full_name_en        text NOT NULL,
  slug                text NOT NULL UNIQUE,
  date_of_birth       date,
  position            text,
  jersey_number       smallint,
  photo_url           text,
  photo_attribution   text,
  photo_licence_ok    boolean NOT NULL DEFAULT false,
  height_cm           smallint,
  weight_kg           smallint,
  foot_preference     text CHECK (foot_preference IN ('right','left','both')),
  career_started_year smallint,
  is_active           boolean NOT NULL DEFAULT true,
  biography_ar        text,
  biography_en        text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
)`,
  },
  { object: "idx_players_team", sql: `CREATE INDEX IF NOT EXISTS idx_players_team ON players(current_team_id) WHERE is_active` },
  { object: "idx_players_name", sql: `CREATE INDEX IF NOT EXISTS idx_players_name ON players USING gin (to_tsvector('simple', full_name_en || ' ' || full_name_ar))` },
  {
    object: "matches",
    sql: `CREATE TABLE IF NOT EXISTS matches (
  id               uuid PRIMARY KEY,
  sport_id         uuid NOT NULL REFERENCES sports(id),
  competition_id   uuid NOT NULL REFERENCES competitions(id),
  season_id        uuid REFERENCES seasons(id),
  round            text,
  home_team_id     uuid REFERENCES teams(id),
  away_team_id     uuid REFERENCES teams(id),
  venue_id         uuid REFERENCES venues(id),
  scheduled_at     timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'scheduled'
                   CHECK (status IN ('scheduled','live','halftime','extra_time','extra_time_halftime',
                                     'penalty_shootout','finished','postponed','cancelled','suspended',
                                     'abandoned','walkover','awarded')),
  home_score       smallint,
  away_score       smallint,
  periods          jsonb NOT NULL DEFAULT '[]'::jsonb,
  aggregate_home   smallint,
  aggregate_away   smallint,
  winner           text CHECK (winner IN ('home','away','draw')),
  leg              smallint,
  neutral_venue    boolean NOT NULL DEFAULT false,
  referee_name     text,
  referee_country  text,
  attendance       integer,
  is_featured      boolean NOT NULL DEFAULT false,
  extension        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_score_consistency CHECK (
    (status IN ('finished','live','halftime','extra_time','extra_time_halftime','penalty_shootout','awarded','walkover'))
    OR (home_score IS NULL AND away_score IS NULL)
  )
)`,
  },
  { object: "idx_matches_day", sql: `CREATE INDEX IF NOT EXISTS idx_matches_day        ON matches(scheduled_at)` },
  { object: "idx_matches_competition", sql: `CREATE INDEX IF NOT EXISTS idx_matches_competition ON matches(competition_id, scheduled_at)` },
  { object: "idx_matches_status", sql: `CREATE INDEX IF NOT EXISTS idx_matches_status     ON matches(status) WHERE status IN ('live','halftime','extra_time','penalty_shootout')` },
  { object: "idx_matches_teams", sql: `CREATE INDEX IF NOT EXISTS idx_matches_teams      ON matches(home_team_id, scheduled_at DESC)` },
  { object: "idx_matches_away_teams", sql: `CREATE INDEX IF NOT EXISTS idx_matches_away_teams ON matches(away_team_id, scheduled_at DESC)` },
  {
    object: "match_events",
    sql: `CREATE TABLE IF NOT EXISTS match_events (
  id                  text PRIMARY KEY,
  match_id            uuid NOT NULL REFERENCES matches(id),
  type                text NOT NULL,
  minute              smallint,
  additional_minute   smallint,
  team_id             uuid REFERENCES teams(id),
  player_id           uuid REFERENCES players(id),
  secondary_player_id uuid REFERENCES players(id),
  description         text,
  provider            text NOT NULL,
  provider_event_id   text,
  received_at         timestamptz NOT NULL DEFAULT now()
)`,
  },
  { object: "idx_events_match", sql: `CREATE INDEX IF NOT EXISTS idx_events_match ON match_events(match_id, minute)` },
  {
    object: "match_stats",
    sql: `CREATE TABLE IF NOT EXISTS match_stats (
  id          text PRIMARY KEY,
  match_id    uuid NOT NULL REFERENCES matches(id),
  team_id     uuid NOT NULL REFERENCES teams(id),
  type        text NOT NULL,
  value       text NOT NULL,
  period      text NOT NULL DEFAULT 'total',
  provider    text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, team_id, type, period)
)`,
  },
  {
    object: "standings",
    sql: `CREATE TABLE IF NOT EXISTS standings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id  uuid NOT NULL REFERENCES competitions(id),
  season_id       uuid NOT NULL REFERENCES seasons(id),
  group_name      text,
  team_id         uuid NOT NULL REFERENCES teams(id),
  position        smallint NOT NULL,
  played          smallint NOT NULL DEFAULT 0,
  won             smallint NOT NULL DEFAULT 0,
  drawn           smallint NOT NULL DEFAULT 0,
  lost            smallint NOT NULL DEFAULT 0,
  goals_for       smallint NOT NULL DEFAULT 0,
  goals_against   smallint NOT NULL DEFAULT 0,
  goal_difference smallint GENERATED ALWAYS AS (goals_for - goals_against) STORED,
  points          smallint NOT NULL DEFAULT 0,
  form            text,
  status          text CHECK (status IN ('champion','promotion','promotion_playoff','cup_position',
                                         'relegation_playoff','relegation')),
  provider        text NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, group_name, team_id)
)`,
  },
  { object: "idx_standings_season", sql: `CREATE INDEX IF NOT EXISTS idx_standings_season ON standings(season_id, group_name, position)` },
  {
    object: "top_scorers",
    sql: `CREATE TABLE IF NOT EXISTS top_scorers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES competitions(id),
  season_id     uuid NOT NULL REFERENCES seasons(id),
  player_id     uuid NOT NULL REFERENCES players(id),
  team_id       uuid REFERENCES teams(id),
  goals         smallint NOT NULL DEFAULT 0,
  appearances   smallint NOT NULL DEFAULT 0,
  penalties     smallint NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, player_id)
)`,
  },
  {
    object: "provider_entity_map",
    sql: `CREATE TABLE IF NOT EXISTS provider_entity_map (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   text NOT NULL
                CHECK (entity_type IN ('sport','competition','season','match','team','player','venue','country','standing')),
  canonical_id  uuid NOT NULL,
  provider      text NOT NULL,
  provider_id   text NOT NULL,
  confidence    numeric(4,3) NOT NULL DEFAULT 1 CHECK (confidence BETWEEN 0 AND 1),
  verified      boolean NOT NULL DEFAULT false,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, provider, provider_id)
)`,
  },
  { object: "idx_mapping_canonical", sql: `CREATE INDEX IF NOT EXISTS idx_mapping_canonical ON provider_entity_map(entity_type, canonical_id)` },
  { object: "idx_mapping_review", sql: `CREATE INDEX IF NOT EXISTS idx_mapping_review    ON provider_entity_map(updated_at) WHERE NOT verified` },
  {
    object: "provider_priority",
    sql: `CREATE TABLE IF NOT EXISTS provider_priority (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sport         text NOT NULL DEFAULT '*',
  competition   text NOT NULL DEFAULT '*',
  data_type     text NOT NULL,
  provider      text NOT NULL,
  role          text NOT NULL CHECK (role IN ('primary','secondary','fallback','disabled')),
  enabled       boolean NOT NULL DEFAULT true,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid,
  UNIQUE (sport, competition, data_type, provider)
)`,
  },
  {
    object: "provider_rate_limits",
    sql: `CREATE TABLE IF NOT EXISTS provider_rate_limits (
  provider      text PRIMARY KEY,
  per_second    integer,
  per_minute    integer,
  per_hour      integer,
  per_day       integer,
  per_month     integer,
  concurrency   integer,
  throttle_at   numeric(3,2) NOT NULL DEFAULT 0.85,
  updated_at    timestamptz NOT NULL DEFAULT now()
)`,
  },
  {
    object: "provider_health",
    sql: `CREATE TABLE IF NOT EXISTS provider_health (
  provider              text PRIMARY KEY,
  status                text NOT NULL DEFAULT 'healthy'
                        CHECK (status IN ('healthy','degraded','rate_limited','down','disabled')),
  enabled               boolean NOT NULL DEFAULT true,
  last_success_at       timestamptz,
  last_failure_at       timestamptz,
  latency_avg_1h_ms     integer,
  latency_avg_24h_ms    integer,
  error_rate            numeric(5,4) NOT NULL DEFAULT 0,
  conflicts_24h         integer NOT NULL DEFAULT 0,
  freshness_score       numeric(4,3) NOT NULL DEFAULT 1,
  consecutive_failures  integer NOT NULL DEFAULT 0,
  consecutive_successes integer NOT NULL DEFAULT 0,
  failover_active       boolean NOT NULL DEFAULT false,
  failover_since        timestamptz,
  updated_at            timestamptz NOT NULL DEFAULT now()
)`,
  },
  {
    object: "data_conflicts",
    sql: `CREATE TABLE IF NOT EXISTS data_conflicts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity       text NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  field          text NOT NULL,
  entity_type    text NOT NULL,
  entity_id      text NOT NULL,
  values         jsonb NOT NULL DEFAULT '{}'::jsonb,
  providers      text[] NOT NULL DEFAULT '{}',
  detected_at    timestamptz NOT NULL DEFAULT now(),
  resolved       boolean NOT NULL DEFAULT false,
  resolved_value jsonb,
  resolution     text CHECK (resolution IN ('automatic','manual')),
  resolved_at    timestamptz,
  resolved_by    uuid,
  notes          text
)`,
  },
  { object: "idx_conflicts_open", sql: `CREATE INDEX IF NOT EXISTS idx_conflicts_open ON data_conflicts(severity, detected_at) WHERE NOT resolved` },
  {
    object: "conflict_rules",
    sql: `CREATE TABLE IF NOT EXISTS conflict_rules (
  field      text PRIMARY KEY,
  severity   text NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  strategy   text NOT NULL CHECK (strategy IN ('primary_provider_wins','most_recent_wins','manual_review','reject_change')),
  updated_at timestamptz NOT NULL DEFAULT now()
)`,
  },
  {
    object: "provider_call_log",
    sql: `CREATE TABLE IF NOT EXISTS provider_call_log (
  id           bigserial PRIMARY KEY,
  provider     text NOT NULL,
  data_type    text NOT NULL,
  request_key  text NOT NULL,
  outcome      text NOT NULL CHECK (outcome IN ('success','cached','coalesced','rate_limited','error','skipped')),
  duration_ms  integer,
  http_status  smallint,
  created_at   timestamptz NOT NULL DEFAULT now()
)`,
  },
  { object: "idx_call_log_provider", sql: `CREATE INDEX IF NOT EXISTS idx_call_log_provider ON provider_call_log(provider, created_at DESC)` },
  { object: "idx_call_log_day", sql: `CREATE INDEX IF NOT EXISTS idx_call_log_day      ON provider_call_log(created_at)` },
  {
    object: "audit_log",
    sql: `CREATE TABLE IF NOT EXISTS audit_log (
  id          bigserial PRIMARY KEY,
  actor_id    uuid,
  actor_role  text,
  action      text NOT NULL,
  entity_type text,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  ip          inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
)`,
  },
  { object: "idx_audit_entity", sql: `CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id, created_at DESC)` },
  { object: "idx_audit_actor", sql: `CREATE INDEX IF NOT EXISTS idx_audit_actor  ON audit_log(actor_id, created_at DESC)` },
  {
    object: "audit_log_rules",
    sql: `DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_rules WHERE tablename = 'audit_log' AND rulename = 'audit_log_no_update') THEN
    CREATE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_rules WHERE tablename = 'audit_log' AND rulename = 'audit_log_no_delete') THEN
    CREATE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;
  END IF;
END $$`,
  },
  {
    object: "touch_updated_at",
    sql: `CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql`,
  },
  {
    object: "trg_*_updated",
    sql: `DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sports','countries','competitions','seasons','venues','teams','players','matches']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = format('trg_%s_updated', t)) THEN
      EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t, t);
    END IF;
  END LOOP;
END $$`,
  },
];

/* ─── pipeline bookkeeping (db/migration-0006-pipeline.sql) ──────────────── */

const PIPELINE: DdlStatement[] = [
  {
    object: "sync_runs",
    sql: `CREATE TABLE IF NOT EXISTS sync_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job          text        NOT NULL,
  source       text,
  trigger      text        NOT NULL DEFAULT 'cron'
               CHECK (trigger IN ('cron','manual','cli','backfill','bootstrap')),
  status       text        NOT NULL DEFAULT 'running'
               CHECK (status IN ('running','ok','partial','skipped','failed')),
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  duration_ms  integer,
  attempt      smallint    NOT NULL DEFAULT 1,
  stats        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error        text,
  notes        text,
  CONSTRAINT chk_sync_runs_finished CHECK (finished_at IS NULL OR finished_at >= started_at)
)`,
  },
  { object: "idx_sync_runs_started", sql: `CREATE INDEX IF NOT EXISTS idx_sync_runs_started  ON sync_runs(started_at DESC)` },
  { object: "idx_sync_runs_job", sql: `CREATE INDEX IF NOT EXISTS idx_sync_runs_job      ON sync_runs(job, started_at DESC)` },
  { object: "idx_sync_runs_source", sql: `CREATE INDEX IF NOT EXISTS idx_sync_runs_source   ON sync_runs(source, started_at DESC)` },
  { object: "idx_sync_runs_running", sql: `CREATE INDEX IF NOT EXISTS idx_sync_runs_running  ON sync_runs(started_at) WHERE status = 'running'` },
  {
    object: "sync_state",
    sql: `CREATE TABLE IF NOT EXISTS sync_state (
  source               text        NOT NULL,
  job                  text        NOT NULL,
  cursor               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  etag                 text,
  last_modified        text,
  last_success_at      timestamptz,
  last_attempt_at      timestamptz,
  last_error           text,
  consecutive_failures integer     NOT NULL DEFAULT 0,
  next_due_at          timestamptz,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, job)
)`,
  },
  { object: "idx_sync_state_due", sql: `CREATE INDEX IF NOT EXISTS idx_sync_state_due  ON sync_state(next_due_at) WHERE next_due_at IS NOT NULL` },
  { object: "idx_sync_state_fail", sql: `CREATE INDEX IF NOT EXISTS idx_sync_state_fail ON sync_state(consecutive_failures DESC) WHERE consecutive_failures > 0` },
  {
    object: "raw_payloads",
    sql: `CREATE TABLE IF NOT EXISTS raw_payloads (
  id            bigserial   PRIMARY KEY,
  source        text        NOT NULL,
  endpoint      text        NOT NULL,
  request_url   text,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  status_code   integer,
  etag          text,
  last_modified text,
  content_type  text,
  payload_hash  text,
  payload_json  jsonb,
  payload_text  text,
  bytes         integer,
  duration_ms   integer,
  run_id        uuid REFERENCES sync_runs(id) ON DELETE SET NULL,
  not_modified  boolean     NOT NULL DEFAULT false,
  attempts      smallint    NOT NULL DEFAULT 1,
  error         text
)`,
  },
  { object: "idx_raw_source_endpoint", sql: `CREATE INDEX IF NOT EXISTS idx_raw_source_endpoint ON raw_payloads(source, endpoint, fetched_at DESC)` },
  { object: "idx_raw_fetched", sql: `CREATE INDEX IF NOT EXISTS idx_raw_fetched         ON raw_payloads(fetched_at DESC)` },
  {
    object: "idx_raw_failures",
    sql: `CREATE INDEX IF NOT EXISTS idx_raw_failures        ON raw_payloads(source, fetched_at DESC)
  WHERE status_code IS NULL OR status_code >= 400`,
  },
  { object: "idx_raw_run", sql: `CREATE INDEX IF NOT EXISTS idx_raw_run             ON raw_payloads(run_id) WHERE run_id IS NOT NULL` },
  {
    object: "source_id_map",
    sql: `CREATE TABLE IF NOT EXISTS source_id_map (
  source       text        NOT NULL,
  entity_type  text        NOT NULL
               CHECK (entity_type IN ('sport','country','competition','season','venue','team','player','match','standing')),
  source_id    text        NOT NULL,
  internal_id  uuid        NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  extra_json   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, entity_type, source_id)
)`,
  },
  { object: "idx_source_id_map_internal", sql: `CREATE INDEX IF NOT EXISTS idx_source_id_map_internal ON source_id_map(entity_type, internal_id)` },
  { object: "idx_source_id_map_seen", sql: `CREATE INDEX IF NOT EXISTS idx_source_id_map_seen     ON source_id_map(last_seen_at DESC)` },
  {
    object: "pipeline_close_stale_runs",
    sql: `CREATE OR REPLACE FUNCTION pipeline_close_stale_runs(older_than_minutes integer DEFAULT 30)
RETURNS integer AS $$
DECLARE
  closed integer;
BEGIN
  UPDATE sync_runs
     SET status = 'failed',
         finished_at = now(),
         error = COALESCE(error, 'run abandoned (process ended before it reported)')
   WHERE status = 'running'
     AND started_at < now() - (older_than_minutes || ' minutes')::interval;
  GET DIAGNOSTICS closed = ROW_COUNT;
  RETURN closed;
END;
$$ LANGUAGE plpgsql`,
  },
  {
    object: "pipeline_job_due",
    sql: `CREATE OR REPLACE VIEW pipeline_job_due AS
SELECT job,
       max(last_attempt_at)                        AS last_attempt_at,
       max(last_success_at)                        AS last_success_at,
       max(consecutive_failures)                   AS consecutive_failures,
       array_agg(source ORDER BY source)           AS sources
  FROM sync_state
 GROUP BY job`,
  },
];

/* ─── source-provenanced read model (db/migration-0007-sports-discovery.sql) */

const SPORTS_SYNC: DdlStatement[] = [
  {
    object: "sports_sync_records",
    sql: `CREATE TABLE IF NOT EXISTS sports_sync_records (
  kind text NOT NULL, provider text NOT NULL, source_key text NOT NULL,
  payload jsonb NOT NULL, PRIMARY KEY (kind, provider, source_key)
)`,
  },
  { object: "sports_sync_unique_slug", sql: `CREATE UNIQUE INDEX IF NOT EXISTS sports_sync_unique_slug ON sports_sync_records(kind, (payload->>'slug'))` },
  { object: "sports_sync_competition", sql: `CREATE INDEX IF NOT EXISTS sports_sync_competition ON sports_sync_records(provider, (payload->>'competitionKey'))` },
  { object: "sports_sync_state", sql: `CREATE TABLE IF NOT EXISTS sports_sync_state (job text PRIMARY KEY, payload jsonb NOT NULL)` },
  { object: "sports_sync_runs", sql: `CREATE TABLE IF NOT EXISTS sports_sync_runs (id text PRIMARY KEY, started_at timestamptz NOT NULL, payload jsonb NOT NULL)` },
  { object: "sports_sync_lease", sql: `CREATE TABLE IF NOT EXISTS sports_sync_lease (id text PRIMARY KEY, owner text NOT NULL, expires_at timestamptz NOT NULL)` },
  { object: "sports_sync_issues", sql: `CREATE TABLE IF NOT EXISTS sports_sync_issues (id bigserial PRIMARY KEY, observed_at timestamptz NOT NULL DEFAULT now(), code text NOT NULL, detail text NOT NULL)` },
];

/** Every statement, in dependency order — parents before children. */
export const SCHEMA_STATEMENTS: readonly DdlStatement[] = [...CANONICAL, ...PIPELINE, ...SPORTS_SYNC];

/** The three groups, exported so the drift test can compare them file by file. */
export const SCHEMA_GROUPS = { canonical: CANONICAL, pipeline: PIPELINE, sportsSync: SPORTS_SYNC } as const;

/**
 * The tables whose absence turns a request into `relation "…" does not exist`.
 * Checked with ONE query (`to_regclass`, no table access, no locks).
 */
export const CORE_TABLES: readonly string[] = [
  "sports",
  "countries",
  "competitions",
  "seasons",
  "venues",
  "teams",
  "players",
  "matches",
  "match_events",
  "match_stats",
  "standings",
  "top_scorers",
  "provider_entity_map",
  "provider_priority",
  "provider_rate_limits",
  "provider_health",
  "data_conflicts",
  "conflict_rules",
  "provider_call_log",
  "audit_log",
  "sync_runs",
  "sync_state",
  "raw_payloads",
  "source_id_map",
  "sports_sync_records",
  "sports_sync_state",
  "sports_sync_runs",
  "sports_sync_lease",
  "sports_sync_issues",
];

export type SchemaBootstrapResult = {
  /** `DATABASE_URL` was configured when this ran. */
  configured: boolean;
  /** Every table existed (or now exists) and nothing failed. */
  ok: boolean;
  /** DDL was actually sent (false when the probe found a complete schema). */
  ran: boolean;
  /** This verdict is the memoised result of an earlier call in this process. */
  cached: boolean;
  /** `NEMO_DB_AUTO_MIGRATE` is not disabled. */
  autoMigrate: boolean;
  /** Tables the probe found missing before the attempt. */
  missingBefore: string[];
  /** Tables still missing after the attempt. */
  missing: string[];
  /** Tables this bootstrap created. */
  created: string[];
  /** Statement-level failures, sanitised — short and operator-safe. */
  failures: { object: string; error: string }[];
  durationMs: number;
  /** Why nothing ran — "already complete" / "no database configured" / … */
  reason?: string;
};

const FAILURE_RETRY_MS = 60_000;

let cached: SchemaBootstrapResult | null = null;
let lastAttemptAt = 0;
let inflight: Promise<SchemaBootstrapResult> | null = null;

/**
 * Wrap a database failure on a canonical table with the remedy, so the reason
 * reaches the run summary (`run.errors`) and the admin log instead of a bare
 * `relation "sports" does not exist`.
 */
export function canonicalSchemaError(objectName: string, cause: unknown): Error {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new Error(
    `canonical table «${objectName}» unavailable — automatic schema preparation failed (${detail}). ` +
      `Remedy: run «npm run db:setup» against the same DATABASE_URL, or grant the app role CREATE rights on the schema.`,
  );
}

/** Whether runtime DDL is allowed. Default ON: a missing table is an outage. */
export function autoMigrateEnabled(): boolean {
  const flag = process.env.NEMO_DB_AUTO_MIGRATE;
  return flag !== "0" && flag !== "false" && flag !== "off";
}

/** Last known bootstrap result for diagnostics (`/api/v1/system`, tests). */
export function schemaBootstrapSnapshot(): SchemaBootstrapResult | null {
  return cached;
}

/** Forget the memoised result (tests, and after an operator fixes a database). */
export function resetSchemaBootstrap(): void {
  cached = null;
  inflight = null;
  lastAttemptAt = 0;
}

/** The short, sanitised, single-line form used in logs and response bodies. */
function safeError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return sanitizeDbMessage(raw.split("\n")[0] ?? raw).slice(0, 300);
}

/** Which core tables are absent — one query, no rows read from the tables. */
export async function missingCoreTables(db: SqlClient): Promise<string[]> {
  const values = CORE_TABLES.map((t) => `('${t}')`).join(", ");
  const rows = await db.select<{ name: string; present: boolean }>(
    `SELECT name, to_regclass('public.' || name) IS NOT NULL AS present FROM (VALUES ${values}) AS t(name)`,
    [],
  );
  return rows.filter((r) => !r.present).map((r) => r.name);
}

function skipped(reason: string, extra: Partial<SchemaBootstrapResult> = {}): SchemaBootstrapResult {
  return {
    configured: Boolean(process.env.DATABASE_URL),
    ok: false,
    ran: false,
    cached: false,
    autoMigrate: autoMigrateEnabled(),
    missingBefore: [],
    missing: [],
    created: [],
    failures: [],
    durationMs: 0,
    reason,
    ...extra,
  };
}

/**
 * Prepare the canonical schema for use — idempotent, additive, never throwing.
 *
 * Memoised per process: the first caller pays the probe (and the DDL when
 * needed), later callers get the same verdict for free. A FAILED attempt is
 * retried at most once a minute so a database that denies DDL is not hammered
 * on every request.
 */
export async function ensureCanonicalSchema(db: SqlClient | null, opts: { force?: boolean } = {}): Promise<SchemaBootstrapResult> {
  if (!db) return skipped("no database configured");
  if (!autoMigrateEnabled()) return skipped("auto-migration disabled (NEMO_DB_AUTO_MIGRATE=0)");

  if (!opts.force && cached) {
    if (cached.ok) return { ...cached, cached: true };
    if (Date.now() - lastAttemptAt < FAILURE_RETRY_MS) return { ...cached, cached: true };
  }
  if (inflight) return inflight;

  inflight = runBootstrap(db)
    .then((result) => {
      cached = result;
      return result;
    })
    .finally(() => {
      inflight = null;
      lastAttemptAt = Date.now();
    });

  return inflight;
}

async function runBootstrap(db: SqlClient): Promise<SchemaBootstrapResult> {
  const started = Date.now();
  let missingBefore: string[] = [];
  try {
    missingBefore = await missingCoreTables(db);
  } catch (e) {
    // The probe itself failed (connection, permissions). Still attempt the
    // DDL: every statement is IF NOT EXISTS, so the worst case is noise.
    missingBefore = [...CORE_TABLES];
    console.warn("[db] canonical schema probe failed:", safeError(e));
  }

  if (missingBefore.length === 0) {
    return {
      configured: true,
      ok: true,
      ran: false,
      cached: false,
      autoMigrate: true,
      missingBefore: [],
      missing: [],
      created: [],
      failures: [],
      durationMs: Date.now() - started,
      reason: "already complete",
    };
  }

  const failures: { object: string; error: string }[] = [];
  for (const statement of SCHEMA_STATEMENTS) {
    try {
      await db.run(statement.sql, []);
    } catch (e) {
      // One statement (a missing privilege, a duplicate index on dirty data)
      // must not abandon the rest — the tables a route needs come first.
      failures.push({ object: statement.object, error: safeError(e) });
    }
  }

  let missing: string[] = [];
  try {
    missing = await missingCoreTables(db);
  } catch (e) {
    failures.push({ object: "probe:after", error: safeError(e) });
    missing = missingBefore;
  }

  const created = missingBefore.filter((t) => !missing.includes(t));
  const ok = failures.length === 0 && missing.length === 0;
  const result: SchemaBootstrapResult = {
    configured: true,
    ok,
    ran: true,
    cached: false,
    autoMigrate: true,
    missingBefore,
    missing,
    created,
    failures,
    durationMs: Date.now() - started,
    reason: ok ? `created ${created.length} table(s)` : "incomplete",
  };

  if (created.length > 0) {
    console.info(
      `[db] canonical schema bootstrap: created ${created.length} table(s) [${created.join(", ")}] in ${result.durationMs}ms`,
    );
  }
  if (failures.length > 0) {
    console.warn(
      `[db] canonical schema bootstrap finished with ${failures.length} failure(s): ` +
        failures.slice(0, 5).map((f) => `${f.object}: ${f.error}`).join(" | "),
    );
  }
  return result;
}
