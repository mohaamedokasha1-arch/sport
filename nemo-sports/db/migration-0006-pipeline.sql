-- ═══════════════════════════════════════════════════════════════════════════
--  NEMO SPORTS · MIGRATION 0006 — data pipeline (ingestion & sync history)
--  PostgreSQL 15+ · idempotent (safe to re-run)
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Adds the three tables the brief asks for, plus the per-source id map:
--
--    sync_runs      — one row per job execution, per source (run history)
--    sync_state     — cursor / ETag / last-success per (source, job)
--    raw_payloads   — append-only archive of every HTTP exchange (audit)
--    source_id_map  — provider id  →  canonical uuid, with last_seen_at
--
--  Rationale for the two mapping tables:
--    · `source_id_map` is the pipeline's own table in the exact shape the brief
--      specifies and is written by every connector;
--    · `provider_entity_map` (migration 0001) stays the Sports-Data-Layer's
--      table, read by the request-time resolver.
--    Both are written in ONE transaction by `recordSourceMapping()` in
--    lib/pipeline/upsert.ts, which is the only writer — so they cannot drift.
--
--  Discrepancies between sources are NOT duplicated here: they are written to
--  the existing `data_conflicts` table (migration 0001), which already has the
--  severity / values / providers / resolution columns an audit needs.

-- ─── run history ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job          text        NOT NULL,
  -- NULL = a job that spans several sources; otherwise the source that ran
  source       text,
  trigger      text        NOT NULL DEFAULT 'cron'
               CHECK (trigger IN ('cron','manual','cli','backfill','bootstrap')),
  status       text        NOT NULL DEFAULT 'running'
               CHECK (status IN ('running','ok','partial','skipped','failed')),
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  duration_ms  integer,
  attempt      smallint    NOT NULL DEFAULT 1,
  -- counters actually produced by the run (fetched, normalized, created,
  -- updated, skipped, conflicts, not_modified, failed, pruned …)
  stats        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  error        text,
  notes        text,
  CONSTRAINT chk_sync_runs_finished CHECK (finished_at IS NULL OR finished_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_started  ON sync_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_job      ON sync_runs(job, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_source   ON sync_runs(source, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_running  ON sync_runs(started_at) WHERE status = 'running';

-- ─── cursor / conditional-request state ────────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_state (
  source               text        NOT NULL,
  job                  text        NOT NULL,
  -- free-form per-source cursor: page token, last season fetched, discovered
  -- provider ids (see `discovery` in config/pipeline/endpoints.yml) …
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
);

CREATE INDEX IF NOT EXISTS idx_sync_state_due  ON sync_state(next_due_at) WHERE next_due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sync_state_fail ON sync_state(consecutive_failures DESC) WHERE consecutive_failures > 0;

-- ─── raw archive ───────────────────────────────────────────────────────────
--  Append-only by design: an UPDATE or DELETE from application code is a bug.
--  Retention is enforced by `pruneRaw()` (config: defaults.raw_retention_days).

CREATE TABLE IF NOT EXISTS raw_payloads (
  id            bigserial   PRIMARY KEY,
  source        text        NOT NULL,
  endpoint      text        NOT NULL,
  -- URL exactly as called, with any credential replaced by ***
  request_url   text,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  status_code   integer,
  etag          text,
  last_modified text,
  content_type  text,
  payload_hash  text,
  -- parsed JSON body (NULL for HTML/text, for 304s and for failures)
  payload_json  jsonb,
  -- body for non-JSON endpoints, truncated at MAX_ARCHIVED_BYTES (512 KiB);
  -- payload_hash always covers the full, untruncated body
  payload_text  text,
  bytes         integer,
  duration_ms   integer,
  run_id        uuid REFERENCES sync_runs(id) ON DELETE SET NULL,
  not_modified  boolean     NOT NULL DEFAULT false,
  attempts      smallint    NOT NULL DEFAULT 1,
  error         text
);

CREATE INDEX IF NOT EXISTS idx_raw_source_endpoint ON raw_payloads(source, endpoint, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_fetched         ON raw_payloads(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_failures        ON raw_payloads(source, fetched_at DESC)
  WHERE status_code IS NULL OR status_code >= 400;
CREATE INDEX IF NOT EXISTS idx_raw_run             ON raw_payloads(run_id) WHERE run_id IS NOT NULL;

-- ─── source id map ─────────────────────────────────────────────────────────
--  `source_id_map(source, entity_type, source_id, internal_id, last_seen_at,
--   extra_json)` exactly as specified in the brief. Upsert is idempotent on the
--  natural key (source, entity_type, source_id).

CREATE TABLE IF NOT EXISTS source_id_map (
  source       text        NOT NULL,
  entity_type  text        NOT NULL
               CHECK (entity_type IN ('sport','country','competition','season','venue','team','player','match','standing')),
  source_id    text        NOT NULL,
  internal_id  uuid        NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  extra_json   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, entity_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_source_id_map_internal ON source_id_map(entity_type, internal_id);
CREATE INDEX IF NOT EXISTS idx_source_id_map_seen     ON source_id_map(last_seen_at DESC);

-- ─── pipeline control helpers ──────────────────────────────────────────────

-- A run that was killed mid-flight (deploy, timeout, OOM) must not stay
-- 'running' forever: the doctor and the admin page call this to close them.
CREATE OR REPLACE FUNCTION pipeline_close_stale_runs(older_than_minutes integer DEFAULT 30)
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
$$ LANGUAGE plpgsql;

-- Cheap, indexed source of truth for "is this job due?", used by the scheduler
-- tick and by the cron routes (they skip instead of spending provider quota).
CREATE OR REPLACE VIEW pipeline_job_due AS
SELECT job,
       max(last_attempt_at)                        AS last_attempt_at,
       max(last_success_at)                        AS last_success_at,
       max(consecutive_failures)                   AS consecutive_failures,
       array_agg(source ORDER BY source)           AS sources
  FROM sync_state
 GROUP BY job;

COMMENT ON TABLE raw_payloads  IS 'Append-only archive of every pipeline HTTP exchange (audit trail, retention = defaults.raw_retention_days).';
COMMENT ON TABLE sync_runs     IS 'One row per job execution per source — the run history shown in /admin/pipeline.';
COMMENT ON TABLE sync_state    IS 'Cursor, ETag/If-Modified-Since state, last success and failure streak per (source, job).';
COMMENT ON TABLE source_id_map IS 'Provider id → canonical uuid, with extra_json for provider-specific fields (brief §3B).';
