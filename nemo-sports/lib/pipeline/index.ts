/**
 * NEMO Sports · Data Pipeline — public surface
 * ───────────────────────────────────────────
 * Import from here (never from the individual modules) in routes, scripts and
 * the admin dashboard:
 *
 *   · `runJob` / `pipelineStatus` — the two operations the platform performs;
 *   · the config helpers — for the doctor, the cron scheduler's cadence checks
 *     and the admin UI;
 *   · the normalizers — exported so tests and future connectors can reuse them.
 *
 * Connectors themselves are internal: nothing outside this folder should call a
 * provider. Everything a caller needs about a source is in
 * `config/pipeline/endpoints.yml`.
 */

export { loadPipelineConfig, resetPipelineConfig, validatePipelineConfig, configurationReport, sourceGate, sourceByName, jobByName, competitionBySlug, endpointByName, sourceCredential, callableSources, PipelineConfigError, CONFIG_DIR } from "./config";
export { createHttp, PipelineHttp, type HttpDeps, type RequestOptions, type BudgetSnapshot } from "./http";
export { runConnector, planFor, currentSeasonName, unverifiedAllowed, type ConnectorResult, type ConnectorContext, type FetchStep } from "./connectors";
export { runJob, isMatchday, type JobRunSummary, type RunOptions, type SourceRunSummary } from "./runner";
export { pipelineStatus, type PipelineStatus, type SourceStatus, type JobStatus } from "./status";
export {
  startRun,
  finishStaleRuns,
  loadState,
  saveState,
  recentRuns,
  allStates,
  consoleLogger,
  CollectingPipelineLogger,
  scrub,
  type PipelineLogger,
  type RunHandle,
} from "./state";
export { archiveRaw, pruneRaw, rawStats, lastRaw, sha256, MAX_ARCHIVED_BYTES } from "./raw-store";
export { recordDiscrepancy, openConflicts, conflictCounts, type Discrepancy, type OpenConflict } from "./discrepancies";
export { decideField, rankOf, outranks, sortByPriority, priorityLabel, severityForField, UNRANKED, type FieldDecision } from "./priority";
export { recordSourceMapping, lookupInternalId, ensureSport, ensureCountry, upsertCompetition, upsertSeason, upsertTeam, upsertMatch, replaceStandings, standingsOwners, seasonSlug, pipelineUuid } from "./upsert";
export { parseRobots, robotsDecision, selectGroup, EMPTY_ROBOTS, type RobotsFile, type RobotsDecision } from "./robots";
export { parseYaml, parseScalar, YamlLiteError } from "./yaml-lite";
export * from "./types";
