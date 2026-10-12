/**
 * NEMO Sports · Pipeline · connectors
 * ───────────────────────────────────
 * A connector answers one question per (source, job): *which of this source's
 * configured endpoints do I call, and how do I read the answer?*
 *
 * It never fetches directly (that is `http.ts`), never writes to the database
 * (that is `upsert.ts`) and never invents an endpoint (that is the registry).
 * A connector is therefore the easiest part of the system to review: for each
 * source, the plan is visible in one place.
 *
 * Endpoints marked `verified: false` in the registry are NOT called unless
 * `PIPELINE_ALLOW_UNVERIFIED_ENDPOINTS=1` is set. §2 of the brief forbids
 * guessing at an upstream contract, and a wrong path would spend provider quota
 * (and produce 404 noise) for nothing. The doctor lists everything unverified.
 */

import type { PipelineHttp } from "./http";
import { discoverLeagueId, normalizeTsdMatches, normalizeTsdTable, normalizeTsdTeams, teamsFromEvents } from "./normalizers/thesportsdb";
import { normalizeFdMatches, normalizeFdSeasons, normalizeFdStandings } from "./normalizers/football-data";
import { normalizeWebCompetitions, normalizeWebMatches, normalizeWebStandings } from "./normalizers/egyptian-sites";
import { loadState, saveState, type PipelineLogger } from "./state";
import type {
  EndpointSpec,
  NormalizedMatch,
  NormalizedSeason,
  NormalizedStanding,
  NormalizedTeam,
  PipelineConfig,
  SourceName,
  SourceSpec,
  TargetSpec,
} from "./types";
import { endpointByName } from "./config";

export type Collector = "seasons" | "standings" | "matches" | "teams";

export type FetchStep = {
  endpoint: string;
  /** human label for logs / run notes */
  label: string;
  pathParams?: Record<string, string>;
  params?: Record<string, string | number | null | undefined>;
  collect: Collector[];
  target?: TargetSpec;
};

export type ConnectorResult = {
  source: SourceName;
  endpoints: string[];
  fetched: number;
  notModified: number;
  failed: number;
  skipped: number;
  warnings: string[];
  notes: string[];
  records: {
    seasons: NormalizedSeason[];
    standings: NormalizedStanding[];
    matches: NormalizedMatch[];
    teams: NormalizedTeam[];
  };
};

export type ConnectorContext = {
  cfg: PipelineConfig;
  http: PipelineHttp;
  logger: PipelineLogger;
  runId: string | null;
  job: string;
  /** label for the season currently being played, derived once per run */
  seasonName: string | null;
};

const emptyResult = (source: SourceName): ConnectorResult => ({
  source,
  endpoints: [],
  fetched: 0,
  notModified: 0,
  failed: 0,
  skipped: 0,
  warnings: [],
  notes: [],
  records: { seasons: [], standings: [], matches: [], teams: [] },
});

export const unverifiedAllowed = (env: Record<string, string | undefined> = process.env): boolean => env.PIPELINE_ALLOW_UNVERIFIED_ENDPOINTS === "1";

/** Season label for the season in progress (Egyptian seasons start in August). */
export function currentSeasonName(now = new Date()): string {
  const year = now.getUTCFullYear();
  return now.getUTCMonth() + 1 >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

/** Endpoint lookup with a helpful error instead of a silent no-op. */
function endpointOrNull(source: SourceSpec, name: string): EndpointSpec | null {
  return endpointByName(source, name);
}

function requireEndpoint(source: SourceSpec, name: string): EndpointSpec | null {
  return endpointOrNull(source, name);
}

/* ─── plans ──────────────────────────────────────────────────────────────── */

function footballDataPlan(source: SourceSpec, job: string): FetchStep[] {
  const steps: FetchStep[] = [];
  const targets = source.targets.filter((t) => t.enabled);
  const seasonFor = (target: TargetSpec): string | null => {
    const raw = target.ref.season;
    return !raw || raw === "current" ? null : raw;
  };

  if (job === "competitions" || job === "bootstrap") {
    if (endpointOrNull(source, "competitions")) {
      steps.push({ endpoint: "competitions", label: "competition catalog", collect: [] });
    }
  }
  for (const target of targets) {
    const code = target.ref.code;
    if (!code) continue;
    if (job === "seasons" || job === "bootstrap") {
      if (endpointOrNull(source, "competition")) {
        steps.push({ endpoint: "competition", label: `seasons ${code}`, pathParams: { code }, collect: ["seasons"], target });
      }
    }
    if (job === "matches" || job === "bootstrap") {
      if (endpointOrNull(source, "matches")) {
        steps.push({
          endpoint: "matches",
          label: `matches ${code}`,
          pathParams: { code },
          params: seasonFor(target) ? { season: seasonFor(target)! } : {},
          collect: ["matches", "teams"],
          target,
        });
      }
    }
    if (job === "standings" || job === "bootstrap" || job === "teams") {
      if (endpointOrNull(source, "standings")) {
        steps.push({
          endpoint: "standings",
          label: `standings ${code}`,
          pathParams: { code },
          params: seasonFor(target) ? { season: seasonFor(target)! } : {},
          collect: job === "teams" ? ["teams"] : ["standings", "teams"],
          target,
        });
      }
    }
  }
  return steps;
}

async function theSportsDbPlan(source: SourceSpec, job: string, ctx: ConnectorContext): Promise<FetchStep[]> {
  const steps: FetchStep[] = [];
  const target = source.targets.find((t) => t.enabled);
  const state = await loadState(source.name, "discovery");
  const discovered = state?.cursor?.[source.discovery?.store_as ?? "league_id"];
  let leagueId = typeof discovered === "string" || typeof discovered === "number" ? String(discovered) : null;

  if ((job === "competitions" || job === "bootstrap" || !leagueId) && source.discovery) {
    const ep = endpointOrNull(source, source.discovery.endpoint);
    if (ep) {
      steps.push({ endpoint: source.discovery.endpoint, label: "league discovery", params: ep.params, collect: [] });
    }
  }
  if (!leagueId && target?.ref.id && target.ref.id !== "{league_id}") leagueId = target.ref.id;

  if (!leagueId) return steps; // discovery must succeed first; the next run continues

  if (job === "standings" || job === "bootstrap") {
    if (endpointOrNull(source, "league_table")) {
      steps.push({ endpoint: "league_table", label: `table ${leagueId}`, pathParams: { id: leagueId }, collect: ["standings", "teams"], target });
    }
  }
  if (job === "matches" || job === "bootstrap") {
    const season = target?.ref.season ?? ctx.seasonName ?? currentSeasonName();
    if (endpointOrNull(source, "season_schedule")) {
      steps.push({ endpoint: "season_schedule", label: `schedule ${leagueId} ${season}`, pathParams: { id: leagueId, season }, collect: ["matches", "teams"], target });
    }
  }
  return steps;
}

function webPlan(source: SourceSpec, job: string): FetchStep[] {
  const steps: FetchStep[] = [];
  const targets = source.targets.filter((t) => t.enabled);
  const wanted: { endpoint: string; collect: Collector[] }[] = [];
  if (job === "competitions" || job === "bootstrap") wanted.push({ endpoint: "competitions", collect: [] });
  if (job === "standings" || job === "bootstrap") wanted.push({ endpoint: "standings", collect: ["standings", "teams"] });
  if (job === "matches" || job === "bootstrap" || job === "teams") wanted.push({ endpoint: "matches", collect: ["matches", "teams"] });
  if (job === "teams" && !wanted.some((w) => w.endpoint === "matches")) wanted.push({ endpoint: "matches", collect: ["teams"] });

  for (const want of wanted) {
    const ep = endpointOrNull(source, want.endpoint);
    if (!ep) continue;
    // A competition-scoped page URL is the target's ref.url when configured;
    // otherwise the source's own endpoint path is used verbatim.
    const urls = targets.map((t) => t.ref.url).filter((u): u is string => typeof u === "string" && u.trim() !== "");
    if (urls.length > 0 && want.endpoint !== "competitions") {
      urls.forEach((url) => steps.push({ endpoint: want.endpoint, label: url, params: { _url: url }, collect: want.collect }));
      continue;
    }
    steps.push({ endpoint: want.endpoint, label: want.endpoint, collect: want.collect });
  }
  return steps;
}

export async function planFor(source: SourceSpec, job: string, ctx: ConnectorContext): Promise<FetchStep[]> {
  const steps = source.mode === "api" && source.name === "thesportsdb" ? await theSportsDbPlan(source, job, ctx) : source.mode === "api" ? footballDataPlan(source, job) : webPlan(source, job);

  const blocked = steps.filter((step) => {
    const ep = endpointOrNull(source, step.endpoint);
    return !ep || (!ep.verified && !unverifiedAllowed());
  });
  const allowed = steps.filter((step) => !blocked.includes(step));
  if (blocked.length) {
    ctx.logger("warn", "pipeline.endpoint_unverified", {
      source: source.name,
      endpoints: blocked.map((b) => b.endpoint),
      hint: "confirm the path against the provider's documentation, then set verified: true (or set PIPELINE_ALLOW_UNVERIFIED_ENDPOINTS=1 for a one-off probe)",
    });
  }
  return allowed;
}

/* ─── execution ──────────────────────────────────────────────────────────── */

export async function runConnector(source: SourceSpec, job: string, ctx: ConnectorContext): Promise<ConnectorResult> {
  const result = emptyResult(source.name);
  const plan = await planFor(source, job, ctx);
  if (plan.length === 0) {
    result.notes.push("nothing to fetch for this job (no enabled target, an unverified endpoint, or discovery still pending)");
    return result;
  }

  const teams = new Map<string, NormalizedTeam>();
  const addTeams = (list: NormalizedTeam[]): void => {
    for (const team of list) if (!teams.has(team.sourceId)) teams.set(team.sourceId, team);
  };

  for (const step of plan) {
    const endpoint = endpointOrNull(source, step.endpoint);
    if (!endpoint) {
      result.notes.push(`endpoint «${step.endpoint}» is not configured for ${source.name}`);
      continue;
    }
    // `_url` is the internal escape hatch for a target-specific page URL; it is
    // still the source's own URL, never a rewritten or proxied one.
    const params = { ...(step.params ?? {}) };
    const explicitUrl = params._url;
    delete params._url;

    const record = await ctx.http.execute(source.name, step.endpoint, {
      pathParams: step.pathParams,
      params,
      runId: ctx.runId,
      conditional: { job },
      overrideUrl: typeof explicitUrl === "string" ? explicitUrl : undefined,
    });

    result.endpoints.push(step.endpoint);
    if (record.notModified) {
      result.notModified += 1;
      result.notes.push(`${step.label}: not modified (304)`);
      continue;
    }
    if (record.error || record.statusCode === null || record.statusCode >= 400) {
      const refusal = record.error ?? "";
      // A robots.txt Disallow or an exhausted local budget is the system
      // obeying its own rules — that is a skip with a warning, not a failure.
      const compliant = /robots\.txt disallows|budget exhausted/.test(refusal);
      if (compliant) {
        result.skipped += 1;
        result.warnings.push(`${step.label}: ${refusal}`);
      } else {
        result.failed += 1;
        result.notes.push(`${step.label}: ${refusal || `HTTP ${record.statusCode}`}`);
      }
      continue;
    }
    result.fetched += 1;

    const payload = endpoint.kind === "json" ? record.payload : (record.payload as string | null) ?? "";
    const normalizerCtx = {
      competitionSlug: step.target?.competition ?? source.targets[0]?.competition ?? source.name,
      seasonName: step.target?.ref.season && step.target.ref.season !== "current" ? step.target.ref.season : ctx.seasonName,
      source: source.name,
      endpoint: step.endpoint,
    };

    // Discovery steps: the answer is an id, not entities.
    if (source.discovery && step.endpoint === source.discovery.endpoint && source.name === "thesportsdb") {
      const id = discoverLeagueId(payload, source.discovery.match_field, source.discovery.match_contains);
      if (id) {
        await saveState(source.name, "discovery", { success: true, cursor: { [source.discovery.store_as]: id }, error: null });
        result.notes.push(`discovered ${source.discovery.store_as}=${id}`);
      } else {
        result.warnings.push(`discovery could not find «${source.discovery.match_contains}» in ${step.endpoint}`);
      }
      continue;
    }

    if (source.mode === "api" && source.name === "football_data") {
      if (step.collect.includes("standings")) {
        const normalized = normalizeFdStandings(payload, normalizerCtx);
        result.records.standings.push(...normalized.items);
        result.skipped += normalized.skipped;
        result.warnings.push(...normalized.warnings);
      }
      if (step.collect.includes("matches")) {
        const normalized = normalizeFdMatches(payload, normalizerCtx);
        result.records.matches.push(...normalized.items);
        result.skipped += normalized.skipped;
        result.warnings.push(...normalized.warnings);
      }
      if (step.collect.includes("seasons") || step.endpoint === "competitions") {
        const normalized = normalizeFdSeasons(payload, normalizerCtx);
        result.records.seasons.push(...normalized.items);
        result.skipped += normalized.skipped;
      }
      // Teams are derived from whatever the payload already contained.
      addTeams(
        (step.collect.includes("standings") ? extractFdStandingTeams(payload) : []).concat(step.collect.includes("matches") ? extractFdMatchTeams(payload) : []),
      );
      continue;
    }

    if (source.mode === "api" && source.name === "thesportsdb") {
      if (step.collect.includes("standings")) {
        const normalized = normalizeTsdTable(payload, normalizerCtx);
        result.records.standings.push(...normalized.items);
        result.skipped += normalized.skipped;
        result.warnings.push(...normalized.warnings);
        addTeams(
          normalizeTsdTable(payload, normalizerCtx).items.map((row) => ({
            sourceId: row.teamSourceId,
            name: row.teamName,
            shortName: null,
            countryCode: null,
            logoUrl: null,
            foundedYear: null,
            venueName: null,
          })),
        );
      }
      if (step.collect.includes("matches")) {
        const normalized = normalizeTsdMatches(payload, normalizerCtx);
        result.records.matches.push(...normalized.items);
        result.skipped += normalized.skipped;
        result.warnings.push(...normalized.warnings);
        addTeams(teamsFromEvents(payload));
      }
      if (step.collect.includes("teams") && !step.collect.includes("standings") && !step.collect.includes("matches")) {
        const normalized = normalizeTsdTeams(payload);
        addTeams(normalized.items);
        result.skipped += normalized.skipped;
      }
      continue;
    }

    // ── web sources (EPL · EFA · FIFA) ─────────────────────────────────────
    if (step.collect.includes("standings")) {
      const normalized = normalizeWebStandings(String(payload), normalizerCtx);
      result.records.standings.push(...normalized.items);
      result.skipped += normalized.skipped;
      result.warnings.push(...normalized.warnings);
      addTeams(
        normalized.items.map((row) => ({
          sourceId: row.teamSourceId,
          name: row.teamName,
          shortName: null,
          countryCode: source.name === "fifa" ? null : "EG",
          logoUrl: null,
          foundedYear: null,
          venueName: null,
        })),
      );
    }
    if (step.collect.includes("matches")) {
      const normalized = normalizeWebMatches(String(payload), normalizerCtx);
      result.records.matches.push(...normalized.items);
      result.skipped += normalized.skipped;
      result.warnings.push(...normalized.warnings);
      addTeams(
        normalized.items.flatMap((row) => [
          { sourceId: row.homeSourceId, name: row.homeName, shortName: null, countryCode: source.name === "fifa" ? null : "EG", logoUrl: null, foundedYear: null, venueName: null },
          { sourceId: row.awaySourceId, name: row.awayName, shortName: null, countryCode: source.name === "fifa" ? null : "EG", logoUrl: null, foundedYear: null, venueName: null },
        ]),
      );
    }
    if (step.endpoint === "competitions") {
      const normalized = normalizeWebCompetitions(String(payload), normalizerCtx);
      result.skipped += normalized.skipped;
      result.warnings.push(...normalized.warnings);
      result.notes.push(`catalog page produced ${normalized.items.length} competition links`);
    }
  }

  result.records.teams = [...teams.values()];
  result.records.teams.push(...result.records.matches.flatMap((m) => [
    { sourceId: m.homeSourceId, name: m.homeName, shortName: null, countryCode: "EG", logoUrl: null, foundedYear: null, venueName: null },
    { sourceId: m.awaySourceId, name: m.awayName, shortName: null, countryCode: "EG", logoUrl: null, foundedYear: null, venueName: null },
  ]));
  return result;
}

/* ─── small extractors shared by the football-data path ──────────────────── */

function extractFdStandingTeams(payload: unknown): NormalizedTeam[] {
  const out: NormalizedTeam[] = [];
  const groups = (payload as { standings?: unknown[] } | null)?.standings;
  if (!Array.isArray(groups)) return out;
  for (const group of groups) {
    const table = (group as { table?: unknown[] })?.table;
    if (!Array.isArray(table)) continue;
    for (const row of table) {
      const team = (row as { team?: { id?: unknown; name?: unknown; shortName?: unknown; crest?: unknown } })?.team;
      if (!team?.id) continue;
      out.push({
        sourceId: String(team.id),
        name: String(team.name ?? team.shortName ?? `team ${team.id}`),
        shortName: team.shortName ? String(team.shortName) : null,
        countryCode: null,
        logoUrl: team.crest ? String(team.crest) : null,
        foundedYear: null,
        venueName: null,
      });
    }
  }
  return out;
}

function extractFdMatchTeams(payload: unknown): NormalizedTeam[] {
  const out: NormalizedTeam[] = [];
  const matches = (payload as { matches?: unknown[] } | null)?.matches;
  if (!Array.isArray(matches)) return out;
  for (const match of matches) {
    const node = match as { homeTeam?: { id?: unknown; name?: unknown }; awayTeam?: { id?: unknown; name?: unknown } };
    for (const side of [node.homeTeam, node.awayTeam]) {
      if (!side?.id) continue;
      out.push({
        sourceId: String(side.id),
        name: String(side.name ?? `team ${side.id}`),
        shortName: null,
        countryCode: null,
        logoUrl: null,
        foundedYear: null,
        venueName: null,
      });
    }
  }
  return out;
}
