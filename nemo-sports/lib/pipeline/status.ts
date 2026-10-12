/**
 * NEMO Sports · Pipeline · observability snapshot
 * ──────────────────────────────────────────────
 * Everything an operator needs in one object: which sources are configured and
 * callable, which endpoints are unverified, when each job last ran, how it
 * went, how much raw history is archived and which disagreements are open.
 *
 * Read-only, never throws, and always answers even with no database (the
 * platform boots without one).
 */

import { getDb } from "@/lib/db/pg";
import { configurationReport, loadPipelineConfig, sourceGate } from "./config";
import { allStates, recentRuns } from "./state";
import { rawStats, type RawStats } from "./raw-store";
import { conflictCounts } from "./discrepancies";
import type { PipelineConfig, RunStatus, SyncRun, SyncState } from "./types";

export type SourceStatus = {
  name: string;
  label_ar: string;
  label_en: string;
  mode: string;
  home: string;
  rank: number;
  enabled: boolean;
  callable: boolean;
  blocked_by: string[];
  endpoints: { name: string; path: string; verified: boolean; kind: string }[];
  unverified_endpoints: string[];
  targets: { competition: string; enabled: boolean; foreign: boolean }[];
  auth_env: string | null;
  rate_limit: { per_minute?: number | null; per_day?: number | null } | null;
};

export type JobStatus = {
  name: string;
  description?: string;
  sources: string[];
  interval_minutes: number;
  matchday_interval_minutes: number | null;
  lastRun: { status: RunStatus; startedAt: string; finishedAt: string | null; durationMs: number | null; job: string } | null;
  states: Pick<SyncState, "source" | "job" | "lastSuccessAt" | "lastAttemptAt" | "lastError" | "consecutiveFailures" | "nextDueAt">[];
};

export type PipelineStatus = {
  database: boolean;
  configOrigin: PipelineConfig["origin"];
  priority: string[];
  sources: SourceStatus[];
  jobs: JobStatus[];
  raw: RawStats;
  conflicts: { total: number; critical: number; high: number };
  runs: SyncRun[];
  warnings: string[];
};

export async function pipelineStatus(runLimit = 15): Promise<PipelineStatus> {
  const cfg = loadPipelineConfig();
  const report = configurationReport(cfg);
  const db = await getDb().catch(() => null);

  const [states, runs, raw, conflicts] = db
    ? await Promise.all([allStates(), recentRuns(runLimit), rawStats(), conflictCounts()])
    : [[], [], { rows: 0, bytes: 0, oldest: null, newest: null, failures24h: 0 } as RawStats, { total: 0, critical: 0, high: 0 }];

  const warnings: string[] = [];
  const sources: SourceStatus[] = cfg.sources
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((source) => {
      const gate = sourceGate(source);
      const unverified = source.endpoints.filter((e) => !e.verified).map((e) => e.name);
      if (unverified.length) {
        warnings.push(`${source.name}: ${unverified.length} endpoint(s) not yet confirmed — ${unverified.join(", ")}`);
      }
      return {
        name: source.name,
        label_ar: source.label_ar,
        label_en: source.label_en,
        mode: source.mode,
        home: source.home,
        rank: source.rank,
        enabled: source.enabled,
        callable: gate.callable,
        blocked_by: gate.missing,
        endpoints: source.endpoints.map((e) => ({ name: e.name, path: e.path, verified: e.verified, kind: e.kind })),
        unverified_endpoints: unverified,
        targets: source.targets.map((t) => ({ competition: t.competition, enabled: t.enabled, foreign: Boolean(t.foreign) })),
        auth_env: source.auth?.env ?? null,
        rate_limit: source.rate_limit ?? null,
      };
    });

  const jobs: JobStatus[] = cfg.jobs.map((job) => ({
    name: job.name,
    description: job.description,
    sources: job.sources,
    interval_minutes: job.interval_minutes,
    matchday_interval_minutes: job.matchday_interval_minutes ?? null,
    lastRun: (() => {
      const last = runs.find((r) => r.job === job.name);
      return last ? { status: last.status, startedAt: last.startedAt, finishedAt: last.finishedAt, durationMs: last.durationMs, job: last.job } : null;
    })(),
    states: states
      .filter((s) => s.job === job.name)
      .map((s) => ({
        source: s.source,
        job: s.job,
        lastSuccessAt: s.lastSuccessAt,
        lastAttemptAt: s.lastAttemptAt,
        lastError: s.lastError,
        consecutiveFailures: s.consecutiveFailures,
        nextDueAt: s.nextDueAt,
      })),
  }));

  if (!db) warnings.push("DATABASE_URL غير مضبوط — لا سجل تشغيل ولا أرشيف خام (التشغيل يعمل لكن بلا حفظ)");

  return {
    database: Boolean(db),
    configOrigin: report.origin,
    priority: report.priority,
    sources,
    jobs,
    raw,
    conflicts,
    runs,
    warnings,
  };
}
