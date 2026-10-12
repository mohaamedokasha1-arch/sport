/**
 * NEMO Sports · Pipeline · logger + run bookkeeping
 * ────────────────────────────────────────────────
 * §2.4 of the brief: every fetch and every update is recorded, with retries for
 * transient failures. Two layers:
 *
 *   · structured log lines (JSON on one line) — greppable in any log sink,
 *     never containing a credential;
 *   · `sync_runs` / `sync_state` rows — the durable, queryable run history the
 *     admin page and `npm run pipeline:status` read.
 *
 * Every function here tolerates a missing database (the platform boots without
 * one): the run still happens, the history is simply not persisted.
 */

import { getDb } from "@/lib/db/pg";
import type { JobName, RunStatus, SourceName, SyncRun, SyncState, TriggerName } from "./types";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

const CREDENTIAL_HINTS = /(x-auth-token|api[-_]?key|apikey|token|authorization|secret|password)/i;

/** Remove anything credential-shaped from a value before it is logged. */
export function scrub(value: unknown, key = ""): unknown {
  if (CREDENTIAL_HINTS.test(key)) return "***";
  if (typeof value === "string") {
    return value
      .replace(/([?&](?:api[-_]?key|apikey|key|token)=)[^&\s]*/gi, "$1***")
      .replace(/\/json\/[A-Za-z0-9_-]{6,}/g, "/json/***")
      .replace(/(X-Auth-Token|X-API-KEY)["':\s]+[^",\s}]+/gi, "$1:***");
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, key));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrub(v, k);
    return out;
  }
  return value;
}

export type PipelineLogger = (level: LogLevel, message: string, fields?: LogFields) => void;

export const consoleLogger: PipelineLogger = (level, message, fields) => {
  const payload = { at: new Date().toISOString(), level, msg: message, ...(fields ? (scrub(fields) as object) : {}) };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

/** Collects lines for tests and for the run summary returned to a cron caller. */
export class CollectingPipelineLogger {
  readonly lines: { level: LogLevel; message: string; fields?: LogFields }[] = [];
  readonly log: PipelineLogger = (level, message, fields) => {
    this.lines.push({ level, message, fields });
  };
}

/* ─── durable run history ────────────────────────────────────────────────── */

export type RunHandle = {
  id: string | null;
  job: JobName;
  source: SourceName | null;
  attempt: number;
  finish(status: RunStatus, stats?: Record<string, number>, error?: string | null, notes?: string | null): Promise<void>;
  stats: Record<string, number>;
};

const nowIso = () => new Date().toISOString();

export async function startRun(input: {
  job: JobName;
  source?: SourceName | null;
  trigger: TriggerName;
  attempt?: number;
  notes?: string | null;
}): Promise<RunHandle> {
  const db = await getDb().catch(() => null);
  let id: string | null = null;
  const stats: Record<string, number> = {};

  if (db) {
    try {
      const rows = await db.select<{ id: string }>(
        `INSERT INTO sync_runs (job, source, trigger, status, attempt, notes)
         VALUES ($1, $2, $3, 'running', $4, $5) RETURNING id`,
        [input.job, input.source ?? null, input.trigger, input.attempt ?? 1, input.notes ?? null],
      );
      id = rows[0]?.id ?? null;
    } catch {
      id = null; // history is best-effort; never break a sync because logging failed
    }
  }

  return {
    id,
    job: input.job,
    source: input.source ?? null,
    attempt: input.attempt ?? 1,
    stats,
    async finish(status, extra, error = null, notes = null) {
      if (extra) for (const [k, v] of Object.entries(extra)) stats[k] = (stats[k] ?? 0) + v;
      if (!db || !id) return;
      try {
        await db.run(
          `UPDATE sync_runs
              SET status = $2, finished_at = now(),
                  duration_ms = (EXTRACT(EPOCH FROM (now() - started_at)) * 1000)::int,
                  stats = $3::jsonb, error = $4, notes = $5
            WHERE id = $1`,
          [id, status, JSON.stringify(stats), error, notes],
        );
      } catch {
        /* best-effort */
      }
    },
  };
}

export async function finishStaleRuns(olderThanMinutes = 30): Promise<number> {
  const db = await getDb().catch(() => null);
  if (!db) return 0;
  try {
    const rows = await db.select<{ id: string }>(
      `UPDATE sync_runs
          SET status = 'failed', finished_at = now(),
              error = COALESCE(error, 'run abandoned (process ended before it reported)')
        WHERE status = 'running' AND started_at < now() - ($1::int * interval '1 minute')
        RETURNING id`,
      [olderThanMinutes],
    );
    return rows.length;
  } catch {
    return 0;
  }
}

/* ─── cursors / conditional-request state ────────────────────────────────── */

export type StatePatch = Partial<Pick<SyncState, "cursor" | "etag" | "lastModified" | "nextDueAt">> & {
  success?: boolean;
  error?: string | null;
};

export async function loadState(source: SourceName, job: JobName): Promise<SyncState | null> {
  const db = await getDb().catch(() => null);
  if (!db) return null;
  try {
    const rows = await db.select<{
      source: string;
      job: string;
      cursor: unknown;
      etag: string | null;
      last_modified: string | null;
      last_success_at: string | Date | null;
      last_attempt_at: string | Date | null;
      last_error: string | null;
      consecutive_failures: number;
      next_due_at: string | Date | null;
    }>(`SELECT source, job, cursor, etag, last_modified, last_success_at, last_attempt_at, last_error, consecutive_failures, next_due_at
          FROM sync_state WHERE source = $1 AND job = $2`, [source, job]);
    const r = rows[0];
    if (!r) return null;
    const iso = (v: string | Date | null) => (v ? new Date(v).toISOString() : null);
    return {
      source: r.source,
      job: r.job,
      cursor: (typeof r.cursor === "string" ? (JSON.parse(r.cursor) as Record<string, unknown>) : r.cursor) as Record<string, unknown> ?? {},
      etag: r.etag,
      lastModified: r.last_modified,
      lastSuccessAt: iso(r.last_success_at),
      lastAttemptAt: iso(r.last_attempt_at),
      lastError: r.last_error,
      consecutiveFailures: Number(r.consecutive_failures ?? 0),
      nextDueAt: iso(r.next_due_at),
    };
  } catch {
    return null;
  }
}

/**
 * Conditional-request validators, merged across every job of one source.
 *
 * A validator is a property of the *URL*: `/competitions/{code}/standings` is
 * fetched by both the `standings` job and `bootstrap`. Cursors are stored per
 * (source, job) — cadence must stay per job — so a job that has never run would
 * otherwise re-download everything its sibling already has. Writes stay keyed by
 * (source, job); only the *read* is merged.
 */
export function mergeValidatorRows(rows: { cursor: unknown }[]): {
  etags: Record<string, string>;
  lastModified: Record<string, string>;
} {
  const etags: Record<string, string> = {};
  const lastModified: Record<string, string> = {};
  for (const row of rows) {
    let cursor: Record<string, unknown> | null = null;
    try {
      cursor = (typeof row.cursor === "string" ? (JSON.parse(row.cursor) as Record<string, unknown>) : row.cursor) as Record<string, unknown> | null;
    } catch {
      cursor = null; // a corrupt cursor must not cost the other rows their tags
    }
    const rowEtags = (cursor?.etags ?? {}) as Record<string, string | null | undefined>;
    const rowModified = (cursor?.last_modified ?? {}) as Record<string, string | null | undefined>;
    for (const [endpoint, value] of Object.entries(rowEtags)) if (value) etags[endpoint] = value;
    for (const [endpoint, value] of Object.entries(rowModified)) if (value) lastModified[endpoint] = value;
  }
  return { etags, lastModified };
}

export async function loadValidators(source: SourceName): Promise<{
  etags: Record<string, string>;
  lastModified: Record<string, string>;
}> {
  const db = await getDb().catch(() => null);
  if (!db) return { etags: {}, lastModified: {} };
  try {
    const rows = await db.select<{ cursor: unknown }>(`SELECT cursor FROM sync_state WHERE source = $1`, [source]);
    return mergeValidatorRows(rows);
  } catch {
    return { etags: {}, lastModified: {} }; // best-effort: costs one conditional-free fetch
  }
}

export async function saveState(source: SourceName, job: JobName, patch: StatePatch): Promise<void> {
  const db = await getDb().catch(() => null);
  if (!db) return;
  const success = patch.success === true;
  try {
    await db.run(
      `INSERT INTO sync_state (source, job, cursor, etag, last_modified, last_success_at, last_attempt_at, last_error, consecutive_failures, next_due_at)
       VALUES ($1, $2, COALESCE($3::jsonb, '{}'::jsonb), $4, $5, CASE WHEN $6 THEN now() ELSE NULL END, now(), $7,
               CASE WHEN $6 THEN 0 ELSE 1 END, $8)
       ON CONFLICT (source, job) DO UPDATE SET
         cursor = COALESCE($3::jsonb, sync_state.cursor),
         etag = COALESCE($4, sync_state.etag),
         last_modified = COALESCE($5, sync_state.last_modified),
         last_success_at = CASE WHEN $6 THEN now() ELSE sync_state.last_success_at END,
         last_attempt_at = now(),
         last_error = $7,
         consecutive_failures = CASE WHEN $6 THEN 0 ELSE sync_state.consecutive_failures + 1 END,
         next_due_at = COALESCE($8, sync_state.next_due_at),
         updated_at = now()`,
      [
        source,
        job,
        patch.cursor ? JSON.stringify(patch.cursor) : null,
        patch.etag ?? null,
        patch.lastModified ?? null,
        success,
        patch.error ?? null,
        patch.nextDueAt ? new Date(patch.nextDueAt).toISOString() : null,
      ],
    );
  } catch (error) {
    // Best-effort, but never silent: losing the cursor costs a full refetch on
    // the next run, and losing the ETag costs quota on every run.
    consoleLogger("warn", "pipeline.state_write_failed", {
      source,
      job,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/* ─── run history reads (admin page + `pipeline:status`) ─────────────────── */

export async function recentRuns(limit = 25): Promise<SyncRun[]> {
  const db = await getDb().catch(() => null);
  if (!db) return [];
  try {
    const rows = await db.select<{
      id: string;
      job: string;
      source: string | null;
      trigger: string;
      status: string;
      started_at: string;
      finished_at: string | null;
      duration_ms: number | null;
      attempt: number;
      stats: unknown;
      error: string | null;
      notes: string | null;
    }>(`SELECT id, job, source, trigger, status, started_at, finished_at, duration_ms, attempt, stats, error, notes
          FROM sync_runs ORDER BY started_at DESC LIMIT $1`, [limit]);
    return rows.map((r) => ({
      id: r.id,
      job: r.job,
      source: r.source,
      trigger: r.trigger as SyncRun["trigger"],
      status: r.status as RunStatus,
      startedAt: new Date(r.started_at).toISOString(),
      finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
      durationMs: r.duration_ms === null ? null : Number(r.duration_ms),
      attempt: Number(r.attempt ?? 1),
      stats: (typeof r.stats === "string" ? (JSON.parse(r.stats) as Record<string, number>) : (r.stats as Record<string, number>)) ?? {},
      error: r.error,
      notes: r.notes,
    }));
  } catch {
    return [];
  }
}

export async function allStates(): Promise<SyncState[]> {
  const db = await getDb().catch(() => null);
  if (!db) return [];
  try {
    const rows = await db.select<{ source: string; job: string }>(`SELECT source, job FROM sync_state ORDER BY source, job`, []);
    const out: SyncState[] = [];
    for (const r of rows) {
      const state = await loadState(r.source, r.job);
      if (state) out.push(state);
    }
    return out;
  } catch {
    return [];
  }
}

export { nowIso };
