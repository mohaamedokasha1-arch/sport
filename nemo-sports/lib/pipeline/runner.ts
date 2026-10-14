/**
 * NEMO Sports · Pipeline · job runner
 * ───────────────────────────────────
 * One entry point — `runJob(name, { trigger })` — used by:
 *
 *   · `app/api/cron/pipeline/[job]/route.ts`  (Vercel Cron / external scheduler)
 *   · `scripts/pipeline.ts`                   (CLI, VPS cron, docker-compose)
 *   · the admin dashboard's "run now" button
 *
 * Responsibilities, in order:
 *   1. decide whether the job is due (per source, from `sync_state`);
 *   2. run each source in priority order, gated by licence/credentials;
 *   3. upsert what came back through the priority rules;
 *   4. write the run history (`sync_runs`) and the next cursor (`sync_state`).
 *
 * Sources that are enabled but have no *publishable* target (a foreign league
 * kept for verification) are still fetched and archived, but nothing is written
 * to the canonical tables — see `PUBLISH_FOREIGN`.
 */

import { getDb } from "@/lib/db/pg";
import { ensureCanonicalSchema } from "@/lib/db/canonical-schema";
import { loadPipelineConfig, jobByName, sourceGate, competitionBySlug } from "./config";
import { createHttp, type PipelineHttp } from "./http";
import { runConnector, currentSeasonName } from "./connectors";
import { finishStaleRuns, consoleLogger, loadState, saveState, startRun, type PipelineLogger } from "./state";
import { pruneRaw } from "./raw-store";
import { recordDiscrepancy } from "./discrepancies";
import { ensureCountry, ensureSport, lookupInternalId, recordSourceMapping, replaceStandings, upsertCompetition, upsertMatch, upsertSeason, upsertTeam, type Db } from "./upsert";
import type { JobSpec, PipelineConfig, RunStatus, SourceSpec, TriggerName } from "./types";

export type RunOptions = {
  trigger?: TriggerName;
  /** only these sources (default: every source listed on the job) */
  sources?: string[];
  /** ignore the cadence check */
  force?: boolean;
  /** fetch + normalise + report, write nothing (beyond the run row) */
  dryRun?: boolean;
  logger?: PipelineLogger;
  http?: PipelineHttp;
  now?: Date;
};

export type SourceRunSummary = {
  source: string;
  status: RunStatus | "skipped";
  reason?: string;
  fetched: number;
  notModified: number;
  failed: number;
  skipped: number;
  created: number;
  updated: number;
  conflicts: number;
  warnings: string[];
  notes: string[];
  durationMs: number;
  archivedOnly?: boolean;
};

export type JobRunSummary = {
  job: string;
  trigger: TriggerName;
  ok: boolean;
  dryRun: boolean;
  startedAt: string;
  durationMs: number;
  sources: SourceRunSummary[];
  totals: { fetched: number; created: number; updated: number; conflicts: number; failed: number; skipped: number };
  errors: string[];
};

const LIVE_STATUSES = ["live", "halftime", "extra_time", "extra_time_halftime", "penalty_shootout"];

const PUBLISH_FOREIGN = (): boolean => process.env.PIPELINE_PUBLISH_FOREIGN === "1";

/** True while a tracked fixture is live or starts within three hours. */
export async function isMatchday(db: Db | null): Promise<boolean> {
  if (!db) return false;
  try {
    const rows = await db.select<{ n: string }>(
      `SELECT count(*)::text AS n FROM matches
        WHERE status = ANY($1::text[])
           OR (status = 'scheduled' AND scheduled_at BETWEEN now() - interval '15 minutes' AND now() + interval '3 hours')`,
      [LIVE_STATUSES],
    );
    return Number(rows[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Did any match finish after the standings job last succeeded? */
async function standingsStaleSinceKickoff(db: Db | null, lastSuccessAt: string | null): Promise<boolean> {
  if (!db) return false;
  try {
    const rows = await db.select<{ n: string }>(
      `SELECT count(*)::text AS n FROM matches
        WHERE status IN ('finished','awarded','walkover')
          AND scheduled_at > COALESCE($1::timestamptz, now() - interval '12 hours')`,
      [lastSuccessAt],
    );
    return Number(rows[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

function cadenceMs(job: JobSpec, matchday: boolean): number {
  const minutes = matchday && job.matchday_interval_minutes ? job.matchday_interval_minutes : job.interval_minutes;
  return minutes * 60_000;
}

/** Sources that can publish into the canonical tables for the configured competitions. */
function isPublishSource(source: SourceSpec, publishForeign: boolean): boolean {
  const enabledTargets = source.targets.filter((t) => t.enabled);
  if (enabledTargets.length === 0) return false;
  if (enabledTargets.some((t) => !t.foreign)) return true;
  return publishForeign;
}

export async function runJob(jobName: string, opts: RunOptions = {}): Promise<JobRunSummary> {
  const startedAt = new Date();
  const cfg: PipelineConfig = loadPipelineConfig();
  const logger = opts.logger ?? consoleLogger;
  const job = jobByName(cfg, jobName);
  const errors: string[] = [];
  const summaries: SourceRunSummary[] = [];

  if (!job) {
    return {
      job: jobName,
      trigger: opts.trigger ?? "manual",
      ok: false,
      dryRun: Boolean(opts.dryRun),
      startedAt: startedAt.toISOString(),
      durationMs: 0,
      sources: [],
      totals: { fetched: 0, created: 0, updated: 0, conflicts: 0, failed: 0, skipped: 0 },
      errors: [`unknown job «${jobName}»`],
    };
  }

  const db = await getDb().catch(() => null);
  if (db) {
    await finishStaleRuns(30).catch(() => 0);
    // Self-healing schema (lib/db/canonical-schema.ts): a database that was
    // never initialised (`relation "sports" does not exist`) or one that lost
    // the canonical tables is repaired here, before anything is read or
    // written. Additive and idempotent; the probe is one query per process.
    const schema = await ensureCanonicalSchema(db);
    // Only the call that actually sent the DDL announces it: a memoised verdict
    // (`cached`) is not news, and "created …" must never be logged twice.
    if (schema.ran && !schema.cached && schema.created.length > 0) {
      logger("info", "pipeline.schema_bootstrapped", { job: job.name, created: schema.created, durationMs: schema.durationMs });
    }
    if (schema.failures.length > 0 && !schema.cached) {
      logger("error", "pipeline.schema_bootstrap_failed", { job: job.name, failures: schema.failures.slice(0, 5), missing: schema.missing });
    }
  }
  const matchday = await isMatchday(db);
  const http = opts.http ?? createHttp(cfg, { logger });
  const seasonName = currentSeasonName(opts.now ?? startedAt);

  const wanted = opts.sources && opts.sources.length > 0 ? job.sources.filter((s) => opts.sources!.includes(s)) : job.sources;
  const ordered = wanted
    .map((name) => cfg.sources.find((s) => s.name === name))
    .filter((s): s is SourceSpec => Boolean(s))
    .sort((a, b) => a.rank - b.rank);

  logger("info", "pipeline.job_start", { job: job.name, trigger: opts.trigger ?? "manual", sources: ordered.map((s) => s.name), matchday, dryRun: Boolean(opts.dryRun) });

  // Canonical competitions come from the registry, not from a provider: write
  // them once per run so seasons/matches/standings always have a parent row.
  //
  // This is the ONE database step that used to sit outside a try/catch, which
  // is why a database missing `sports` reached the caller as a 500
  // (`relation "sports" does not exist`). It is now guarded twice: the schema
  // is bootstrapped above, and a database that refuses the write (read-only
  // role, denied DDL) records an honest error and lets the sources archive
  // what they fetched, so the run still ends with a real summary.
  const competitionIds = new Map<string, string>();
  const countryIds = new Map<string, string>();
  if (db && !opts.dryRun) {
    try {
      const sportId = await ensureSport(db, "football");
      for (const spec of cfg.competitions) {
        const countryId = spec.country ? await ensureCountry(db, spec.country, spec.country === "EG" ? "مصر" : spec.country, spec.country === "EG" ? "Egypt" : spec.country) : null;
        if (countryId && spec.country) countryIds.set(spec.country, countryId);
        competitionIds.set(spec.slug, await upsertCompetition(db, spec, sportId, countryId));
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push(`canonical registry: ${message}`);
      logger("error", "pipeline.registry_failed", { job: job.name, error: message });
    }
  }

  for (const source of ordered) {
    const gate = sourceGate(source);
    if (!gate.callable) {
      summaries.push({
        source: source.name,
        status: "skipped",
        reason: gate.missing.join("; "),
        fetched: 0,
        notModified: 0,
        failed: 0,
        skipped: 0,
        created: 0,
        updated: 0,
        conflicts: 0,
        warnings: [],
        notes: [],
        durationMs: 0,
      });
      logger("info", "pipeline.source_skipped", { source: source.name, job: job.name, missing: gate.missing });
      continue;
    }

    const state = db ? await loadState(source.name, job.name) : null;
    // No state row = this source has never run for this job, which is exactly
    // when a boot/first run is wanted. After that the cadence applies.
    if (!opts.force && state?.lastAttemptAt) {
      const elapsed = Date.now() - new Date(state.lastAttemptAt).getTime();
      const interval = cadenceMs(job, matchday);
      if (elapsed < interval) {
        summaries.push({
          source: source.name,
          status: "skipped",
          reason: `due in ${Math.ceil((interval - elapsed) / 60_000)} min`,
          fetched: 0,
          notModified: 0,
          failed: 0,
          skipped: 0,
          created: 0,
          updated: 0,
          conflicts: 0,
          warnings: [],
          notes: [],
          durationMs: 0,
        });
        continue;
      }
    }
    if (job.name === "standings" && !opts.force && state?.lastSuccessAt && !(await standingsStaleSinceKickoff(db, state.lastSuccessAt))) {
      summaries.push({
        source: source.name,
        status: "skipped",
        reason: "no match finished since the last successful table",
        fetched: 0,
        notModified: 0,
        failed: 0,
        skipped: 0,
        created: 0,
        updated: 0,
        conflicts: 0,
        warnings: [],
        notes: [],
        durationMs: 0,
      });
      continue;
    }

    const sourceStart = Date.now();
    const run = opts.dryRun ? null : await startRun({ job: job.name, source: source.name, trigger: opts.trigger ?? "manual" });
    const summary: SourceRunSummary = {
      source: source.name,
      status: "ok",
      fetched: 0,
      notModified: 0,
      failed: 0,
      skipped: 0,
      created: 0,
      updated: 0,
      conflicts: 0,
      warnings: [],
      notes: [],
      durationMs: 0,
      archivedOnly: !isPublishSource(source, PUBLISH_FOREIGN()),
    };

    try {
      const result = await runConnector(source, job.name, {
        cfg,
        http,
        logger,
        runId: run?.id ?? null,
        job: job.name,
        seasonName,
      });

      summary.fetched = result.fetched;
      summary.notModified = result.notModified;
      summary.failed = result.failed;
      summary.skipped = result.skipped;
      summary.warnings = result.warnings;
      summary.notes = result.notes;

      if (!opts.dryRun && db && !summary.archivedOnly) {
        // A canonical table that cannot be prepared or written (denied DDL,
        // read-only role) must not turn the whole run into an exception: the
        // provider was already called, so the honest outcome is "fetched,
        // archived, 0 written" with the reason in the run summary.
        try {
          const written = await upsertRecords(db, cfg, source, result.records, { seasonName, countryIds, competitionIds, logger });
          summary.created = written.created;
          summary.updated = written.updated;
          summary.conflicts = written.conflicts;
          summary.skipped += written.skipped;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          summary.notes.push(`canonical write failed: ${message}`);
          summary.warnings.push("canonical tables unavailable — payloads fetched and archived only");
          errors.push(`${source.name}: ${message}`);
          logger("error", "pipeline.canonical_write_failed", { source: source.name, job: job.name, error: message });
        }
      } else if (summary.archivedOnly) {
        summary.notes.push("archive-only source: payloads stored, canonical rows untouched (set PIPELINE_PUBLISH_FOREIGN=1 to publish)");
      }

      // Nothing fetched is only a failure when nothing was *confirmed* either:
      // a 304 (upstream unchanged) is a successful outcome, not a failure.
      const nothingConfirmed = result.fetched === 0 && result.notModified === 0;
      summary.status = result.failed > 0 && nothingConfirmed
        ? "failed"
        : result.warnings.length > 0 && nothingConfirmed
          ? "partial"
          : "ok";
      if (summary.status === "failed") errors.push(`${source.name}: every configured fetch failed`);

      if (!opts.dryRun && db) {
        const nextDue = new Date(Date.now() + cadenceMs(job, matchday)).toISOString();
        await saveState(source.name, job.name, {
          success: summary.status === "ok" || summary.status === "partial",
          error: summary.status === "failed" ? (result.notes.filter((n) => n.includes(":")).slice(0, 3).join(" | ") || "fetch failed") : null,
          nextDueAt: nextDue,
        });
      }
    } catch (e) {
      summary.status = "failed";
      const message = e instanceof Error ? e.message : String(e);
      errors.push(`${source.name}: ${message}`);
      logger("error", "pipeline.source_failed", { source: source.name, job: job.name, error: message });
      if (!opts.dryRun && db) await saveState(source.name, job.name, { success: false, error: message }).catch(() => undefined);
    }

    summary.durationMs = Date.now() - sourceStart;
    summaries.push(summary);
    if (run) {
      await run.finish(summary.status, {
        fetched: summary.fetched,
        not_modified: summary.notModified,
        failed: summary.failed,
        skipped: summary.skipped,
        created: summary.created,
        updated: summary.updated,
        conflicts: summary.conflicts,
      }, errors.find((e) => e.startsWith(`${source.name}:`)) ?? null, summary.notes.slice(0, 3).join(" | ") || null);
    }
  }

  // Retention runs with the weekly catalog job — never on the hot path.
  if (db && !opts.dryRun && job.name === "competitions") {
    const pruned = await pruneRaw(cfg.defaults.raw_retention_days).catch(() => 0);
    if (pruned > 0) logger("info", "pipeline.raw_pruned", { rows: pruned, retention_days: cfg.defaults.raw_retention_days });
  }

  const totals = summaries.reduce(
    (acc, s) => ({
      fetched: acc.fetched + s.fetched,
      created: acc.created + s.created,
      updated: acc.updated + s.updated,
      conflicts: acc.conflicts + s.conflicts,
      failed: acc.failed + s.failed,
      skipped: acc.skipped + s.skipped,
    }),
    { fetched: 0, created: 0, updated: 0, conflicts: 0, failed: 0, skipped: 0 },
  );

  const ok = errors.length === 0 && summaries.some((s) => s.status === "ok" || s.status === "partial");
  logger("info", "pipeline.job_done", { job: job.name, ok, totals, durationMs: Date.now() - startedAt.getTime() });

  return {
    job: job.name,
    trigger: opts.trigger ?? "manual",
    ok,
    dryRun: Boolean(opts.dryRun),
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    sources: summaries,
    totals,
    errors,
  };
}

/* ─── writing normalized records ─────────────────────────────────────────── */

type Records = Awaited<ReturnType<typeof runConnector>>["records"];

async function upsertRecords(
  db: Db,
  cfg: PipelineConfig,
  source: SourceSpec,
  records: Records,
  ctx: {
    seasonName: string;
    countryIds: Map<string, string>;
    competitionIds: Map<string, string>;
    logger: PipelineLogger;
  },
): Promise<{ created: number; updated: number; conflicts: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let conflicts = 0;
  let skipped = 0;

  const sportId = await ensureSport(db, "football");
  const egCountry = await ensureCountry(db, "EG", "مصر", "Egypt");
  // A source that only has foreign targets enabled (the PL verification path)
  // must not stamp Egyptian nationality on its teams: an unmatched team gets no
  // country rather than a wrong one.
  const foreignOnly = source.targets.filter((t) => t.enabled).every((t) => Boolean(t.foreign));
  const defaultCountryId = foreignOnly ? null : egCountry;
  const teamIds = new Map<string, string>();

  const competitionIdFor = async (slug: string): Promise<string | null> => {
    const known = ctx.competitionIds.get(slug);
    if (known) return known;
    if (slug === "england-premier-league" && PUBLISH_FOREIGN()) {
      const countryId = await ensureCountry(db, "ENG", "إنجلترا", "England");
      const id = await upsertCompetition(
        db,
        { slug, name_ar: "الدوري الإنجليزي الممتاز", name_en: "Premier League", short_ar: "البريميرليج", short_en: "PL", type: "league", country: "ENG", featured: false },
        sportId,
        countryId,
      );
      ctx.competitionIds.set(slug, id);
      return id;
    }
    return null;
  };

  // 1 · teams (standings and matches both reference them)
  for (const team of records.teams) {
    try {
      const outcome = await upsertTeam(db, cfg, team, {
        sportId,
        countryId: team.countryCode && team.countryCode !== "EG" ? ctx.countryIds.get(team.countryCode) ?? null : defaultCountryId,
        source: source.name,
      });
      teamIds.set(team.sourceId, outcome.id);
      if (outcome.created) created += 1;
      else updated += 1;
      if (outcome.conflicts) conflicts += outcome.conflicts;
    } catch (e) {
      skipped += 1;
      ctx.logger("warn", "pipeline.team_skipped", { source: source.name, team: team.name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // 2 · seasons
  for (const season of records.seasons) {
    const competitionId = await competitionIdFor(season.competitionSlug);
    if (!competitionId) {
      skipped += 1;
      continue;
    }
    try {
      const outcome = await upsertSeason(db, competitionId, season);
      if (outcome.isCurrent) updated += 1;
      else created += 1;
      await recordSourceMapping(db, { source: source.name, entityType: "season", sourceId: season.sourceId, internalId: outcome.id, extra: { name: season.name } });
    } catch (e) {
      skipped += 1;
      ctx.logger("warn", "pipeline.season_skipped", { source: source.name, season: season.name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // 3 · standings (whole table replaced atomically per source)
  const standingsByCompetition = new Map<string, typeof records.standings>();
  for (const row of records.standings) {
    const list = standingsByCompetition.get(row.competitionSlug) ?? [];
    list.push(row);
    standingsByCompetition.set(row.competitionSlug, list);
  }
  for (const [slug, rows] of standingsByCompetition) {
    const competitionId = await competitionIdFor(slug);
    if (!competitionId) {
      skipped += rows.length;
      continue;
    }
    const seasonLabel = rows[0]?.seasonName ?? ctx.seasonName;
    const season = await upsertSeason(db, competitionId, { name: seasonLabel, isCurrent: true, status: "active" });
    const outcome = await replaceStandings(db, cfg, rows, {
      competitionId,
      seasonId: season.id,
      source: source.name,
      teamIdFor: (sourceId) => teamIds.get(sourceId) ?? null,
    });
    updated += outcome.applied;
    skipped += outcome.skipped;
    if (outcome.replacedOtherProviders > 0) conflicts += outcome.replacedOtherProviders;
  }

  // 4 · matches
  for (const match of records.matches) {
    const competitionId = await competitionIdFor(match.competitionSlug);
    const homeTeamId = teamIds.get(match.homeSourceId);
    const awayTeamId = teamIds.get(match.awaySourceId);
    if (!competitionId || !homeTeamId || !awayTeamId) {
      skipped += 1;
      await recordDiscrepancy({
        entityType: "match",
        entityId: match.sourceId,
        field: "identity",
        severity: "medium",
        values: { source: source.name, competition: match.competitionSlug, home: match.homeName, away: match.awayName },
        winner: source.name,
        losers: [],
        notes: "match skipped: competition or team could not be resolved",
      });
      continue;
    }
    const seasonLabel = match.seasonName ?? ctx.seasonName;
    const season = await upsertSeason(db, competitionId, { name: seasonLabel, isCurrent: true, status: "active" });
    try {
      const outcome = await upsertMatch(db, cfg, match, {
        sportId,
        competitionId,
        seasonId: season.id,
        homeTeamId,
        awayTeamId,
        countryId: egCountry,
        source: source.name,
      });
      if (outcome.created) created += 1;
      else updated += 1;
      conflicts += outcome.conflicts;
    } catch (e) {
      skipped += 1;
      ctx.logger("warn", "pipeline.match_skipped", { source: source.name, match: match.sourceId, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // 5 · competition↔provider mapping (so the admin can see who knows what)
  for (const target of source.targets.filter((t) => t.enabled)) {
    const competitionId = ctx.competitionIds.get(target.competition) ?? (await lookupInternalId(db, source.name, "competition", target.ref.code ?? target.competition));
    if (!competitionId) continue;
    const providerId = target.ref.code ?? target.ref.id ?? target.competition;
    if (!providerId || providerId.startsWith("{")) continue;
        await recordSourceMapping(db, {
      source: source.name,
      entityType: "competition",
      sourceId: String(providerId),
      internalId: competitionId,
      extra: { competition: target.competition, foreign: Boolean(target.foreign) },
      confidence: target.ref.verified === "false" ? 0.6 : 1,
    }).catch(() => undefined);
  }

  return { created, updated, conflicts, skipped };
}

export { competitionBySlug };
