/**
 * NEMO Sports · Data Pipeline — registry loader & validation
 * ─────────────────────────────────────────────────────────
 * `config/pipeline/endpoints.yml` is the single place a source URL, id, quota,
 * credential *name* or cadence is written. This module turns that file into a
 * typed, validated `PipelineConfig` and then answers every question the rest of
 * the pipeline asks about it.
 *
 * Loading precedence (first hit wins):
 *   1. `PIPELINE_CONFIG_PATH`                 — explicit file (ops/tests)
 *   2. config/pipeline/endpoints.local.json   — machine-local override (git-ignored)
 *   3. config/pipeline/endpoints.yml          — the source of truth
 *   4. config/pipeline/endpoints.json         — generated mirror (what ships)
 *
 * The mirror exists because a serverless bundle only reliably ships files that
 * are imported statically; `npm run pipeline:config:sync` regenerates it and
 * `npm run pipeline:config:check` fails the build when the two drift apart.
 *
 * Validation is deliberately strict and fails *closed*: an unknown competition,
 * a duplicated endpoint name or a scrape source without an explicit licence flag
 * stops the pipeline instead of quietly fetching the wrong thing.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseYamlMap, YamlLiteError } from "./yaml-lite";
import {
  PipelineConfigError,
  type CompetitionSpec,
  type CompetitionType,
  type ConfigOrigin,
  type DiscoverySpec,
  type EndpointKind,
  type EndpointSpec,
  type JobSpec,
  type PipelineConfig,
  type PipelineDefaults,
  type PipelineEntity,
  type RateLimitSpec,
  type SourceName,
  type SourceSpec,
  type TargetSpec,
} from "./types";

export { PipelineConfigError };

export const CONFIG_DIR = "config/pipeline";
export const CONFIG_YAML = resolve(process.cwd(), CONFIG_DIR, "endpoints.yml");
export const CONFIG_JSON = resolve(process.cwd(), CONFIG_DIR, "endpoints.json");
export const CONFIG_LOCAL = resolve(process.cwd(), CONFIG_DIR, "endpoints.local.json");

const COMPETITION_TYPES = new Set<string>(["league", "cup", "tournament", "friendly", "international", "playoff"]);
const ENDPOINT_KINDS = new Set<string>(["json", "html", "text"]);
const ENTITIES = new Set<string>(["competition", "season", "team", "match", "standing", "venue", "player"]);

type Rec = Record<string, unknown>;

const isRecord = (value: unknown): value is Rec => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function asRecord(value: unknown): Rec {
  return isRecord(value) ? value : {};
}

function listOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

/* ─────────────────────────────── small coercions ───────────────────────── */

function textOf(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function numberOf(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const n = typeof value === "number" ? value : Number(textOf(value, ""));
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

function optionalNumber(value: unknown, min = 0): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(textOf(value, ""));
  return Number.isFinite(n) && n >= min ? n : null;
}

function boolOf(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const t = textOf(value).toLowerCase();
  if (t === "true" || t === "yes" || t === "on" || t === "1") return true;
  if (t === "false" || t === "no" || t === "off" || t === "0") return false;
  return fallback;
}

/** `{a: 1}` → `{a: "1"}`; values used in URL templates are always strings. */
function paramMap(value: unknown): Record<string, string | number | null | undefined> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, string | number | null | undefined> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (raw === null || raw === undefined) out[key] = null;
    else if (typeof raw === "number" || typeof raw === "string") out[key] = raw;
    else if (typeof raw === "boolean") out[key] = String(raw);
    else continue;
  }
  return Object.keys(out).length ? out : undefined;
}

function headerMap(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    const text = textOf(raw);
    if (text) out[key] = text;
  }
  return Object.keys(out).length ? out : undefined;
}

/* ──────────────────────────────── validation ───────────────────────────── */

/**
 * Validates a raw registry (parsed YAML/JSON) and returns the typed config.
 * Collects every problem before throwing, so one `--doctor` run shows them all.
 */
export function validatePipelineConfig(raw: unknown, origin: ConfigOrigin = "json"): PipelineConfig {
  const issues: string[] = [];
  const root = asRecord(raw);

  const version = numberOf(root.version, 1, 1, 99);
  if (version !== 1) issues.push(`version ${textOf(root.version)} is not supported (expected 1)`);

  const defaults = parseDefaults(asRecord(root.defaults), issues);

  const priority = listOf(root.priority).map((v) => textOf(v)).filter(Boolean);
  if (priority.length === 0) issues.push("priority: must list at least one source, highest authority first");
  const duplicates = priority.filter((name, index) => priority.indexOf(name) !== index);
  for (const dup of new Set(duplicates)) issues.push(`priority: «${dup}» is listed twice`);

  const competitions = parseCompetitions(root.competitions, issues);
  const competitionSlugs = new Set(competitions.map((c) => c.slug));

  const sources = parseSources(asRecord(root.sources), priority, issues);
  const jobSources = new Set(sources.map((s) => s.name));

  for (const name of priority) {
    if (!jobSources.has(name)) issues.push(`priority: «${name}» has no entry under sources:`);
  }
  for (const source of sources) {
    for (const target of source.targets) {
      // A foreign target intentionally references a competition this deployment
      // does not cover — that is its whole purpose (end-to-end verification).
      if (!target.foreign && !competitionSlugs.has(target.competition)) {
        issues.push(`sources.${source.name}.targets: unknown competition «${target.competition}»`);
      }
    }
    if (source.mode === "scrape" && source.policy.respect_robots !== true) {
      issues.push(`sources.${source.name}: a scrape source must set policy.respect_robots: true`);
    }
  }

  const jobs = parseJobs(asRecord(root.jobs), jobSources, issues);
  if (jobs.length === 0) issues.push("jobs: at least one job must be defined");

  if (issues.length) {
    throw new PipelineConfigError(`invalid pipeline registry (${origin})`, issues);
  }

  return { version, origin, priority, defaults, competitions, sources, jobs };
}

function parseDefaults(raw: Rec, issues: string[]): PipelineDefaults {
  const robotsTtlMinutes = numberOf(raw.robots_ttl_minutes, 360, 1, 10_080);
  const backoffBase = numberOf(raw.backoff_base_ms, 750, 50, 60_000);
  const backoffMax = numberOf(raw.backoff_max_ms, 30_000, backoffBase, 600_000);
  if (backoffMax < backoffBase) issues.push("defaults: backoff_max_ms must be >= backoff_base_ms");
  return {
    user_agent: textOf(raw.user_agent, "NemoSportsDataBot/1.0") || "NemoSportsDataBot/1.0",
    contact_env: textOf(raw.contact_env, "PIPELINE_CONTACT") || "PIPELINE_CONTACT",
    timeout_ms: numberOf(raw.timeout_ms, 12_000, 500, 120_000),
    retries: numberOf(raw.retries, 3, 0, 10),
    backoff_base_ms: backoffBase,
    backoff_max_ms: backoffMax,
    robots_ttl_seconds: numberOf(raw.robots_ttl_seconds, robotsTtlMinutes * 60, 60, 604_800),
    robots_ttl_minutes: robotsTtlMinutes,
    min_interval_ms: numberOf(raw.min_interval_ms, 1200, 0, 600_000),
    raw_retention_days: numberOf(raw.raw_retention_days, 90, 1, 3650),
    max_payload_kb: numberOf(raw.max_payload_kb, 512, 16, 8192),
  };
}

function parseCompetitions(raw: unknown, issues: string[]): CompetitionSpec[] {
  const out: CompetitionSpec[] = [];
  const seen = new Set<string>();
  listOf(raw).forEach((entry, index) => {
    const c = asRecord(entry);
    const slug = textOf(c.slug);
    if (!slug) {
      issues.push(`competitions[${index}]: slug is required`);
      return;
    }
    if (seen.has(slug)) issues.push(`competitions[${index}]: slug «${slug}» is duplicated`);
    seen.add(slug);

    const typeText = textOf(c.type, "league");
    if (!COMPETITION_TYPES.has(typeText)) {
      issues.push(`competitions[${index}] (${slug}): type «${typeText}» is not one of ${[...COMPETITION_TYPES].join(", ")}`);
    }
    out.push({
      slug,
      name_ar: textOf(c.name_ar, slug),
      name_en: textOf(c.name_en, slug),
      short_ar: textOf(c.short_ar, textOf(c.name_ar, slug)),
      short_en: textOf(c.short_en, textOf(c.name_en, slug)),
      type: (COMPETITION_TYPES.has(typeText) ? typeText : "league") as CompetitionType,
      country: textOf(c.country, "EG") || "EG",
      featured: boolOf(c.featured, false),
      tier: optionalNumber(c.tier, 1) ?? undefined,
      domestic: boolOf(c.domestic, true),
    });
  });
  if (out.length === 0) issues.push("competitions: at least one competition is required");
  return out;
}

function parseEndpoints(raw: unknown, sourceName: string, issues: string[]): EndpointSpec[] {
  const out: EndpointSpec[] = [];
  const seen = new Set<string>();
  listOf(raw).forEach((entry, index) => {
    const e = asRecord(entry);
    const label = `sources.${sourceName}.endpoints[${index}]`;
    const name = textOf(e.name);
    if (!name) {
      issues.push(`${label}: name is required`);
      return;
    }
    if (seen.has(name)) issues.push(`${label}: endpoint name «${name}» is duplicated`);
    seen.add(name);

    const path = textOf(e.path);
    if (!path.startsWith("/")) issues.push(`${label} (${name}): path must start with "/"`);

    const kindText = textOf(e.kind, "json");
    if (!ENDPOINT_KINDS.has(kindText)) issues.push(`${label} (${name}): kind must be json|html|text`);

    out.push({
      name,
      path,
      kind: (ENDPOINT_KINDS.has(kindText) ? kindText : "json") as EndpointKind,
      // Unverified unless the registry says otherwise — never the reverse.
      verified: boolOf(e.verified, false),
      params: paramMap(e.params),
      headers: headerMap(e.headers),
      notes: textOf(e.notes) || undefined,
      docs: textOf(e.docs) || undefined,
    });
  });
  if (out.length === 0) issues.push(`sources.${sourceName}: at least one endpoint is required`);
  return out;
}

function parseTargets(raw: unknown, sourceName: string, issues: string[]): TargetSpec[] {
  const out: TargetSpec[] = [];
  listOf(raw).forEach((entry, index) => {
    const t = asRecord(entry);
    const competition = textOf(t.competition);
    if (!competition) {
      issues.push(`sources.${sourceName}.targets[${index}]: competition is required`);
      return;
    }
    const ref: Record<string, string> = {};
    const refRaw = t.ref;
    if (isRecord(refRaw)) {
      for (const [key, value] of Object.entries(refRaw)) {
        const text = textOf(value);
        if (text !== "") ref[key] = text;
      }
    } else if (refRaw !== undefined && refRaw !== null) {
      issues.push(`sources.${sourceName}.targets[${index}].ref must be a mapping`);
    }
    const enabled = boolOf(t.enabled, true);
    const foreign = boolOf(t.foreign, false);
    if (enabled && !foreign && Object.keys(ref).length === 0) {
      // Not fatal — several providers need no reference at all — but a target
      // that is enabled with nothing to point at is worth an operator's eye.
      issues.push(`sources.${sourceName}.targets[${index}] (${competition}): enabled but ref is empty`);
    }
    out.push({ competition, enabled, foreign, ref, notes: textOf(t.notes) || undefined });
  });
  return out;
}

function parseSources(raw: Rec, priority: string[], issues: string[]): SourceSpec[] {
  const out: SourceSpec[] = [];
  for (const [name, value] of Object.entries(raw)) {
    const s = asRecord(value);
    const label = `sources.${name}`;

    const baseUrl = textOf(s.base_url).replace(/\/+$/, "");
    if (!/^https?:\/\//.test(baseUrl)) issues.push(`${label}.base_url must be an absolute http(s) URL`);

    const modeText = textOf(s.mode, "api");
    if (modeText !== "api" && modeText !== "scrape") issues.push(`${label}.mode must be api|scrape`);

    const policyRaw = asRecord(s.policy);
    const endpoints = parseEndpoints(s.endpoints, name, issues);

    // A credential is referenced by env name only — never written here.
    const authRaw = isRecord(s.auth) ? s.auth : null;
    let auth: SourceSpec["auth"];
    if (authRaw) {
      const type = textOf(authRaw.type, "header");
      if (type !== "header" && type !== "query") issues.push(`${label}.auth.type must be header|query`);
      const env = textOf(authRaw.env);
      if (!env) issues.push(`${label}.auth.env is required (the value itself must live in the environment)`);
      else if (!/^[A-Z0-9_]+$/.test(env)) issues.push(`${label}.auth.env should look like an environment variable name`);
      auth = {
        type: (type === "query" ? "query" : "header") as "header" | "query",
        header: textOf(authRaw.header) || undefined,
        param: textOf(authRaw.param) || undefined,
        env,
      };
      if (auth.type === "header" && !auth.header) issues.push(`${label}.auth.header is required for header credentials`);
      if (auth.type === "query" && !auth.param) issues.push(`${label}.auth.param is required for query credentials`);
    }

    const rateRaw = asRecord(s.rate_limit);
    const mode = (modeText === "scrape" ? "scrape" : "api") as SourceSpec["mode"];
    const enabled = boolOf(s.enabled, false);
    const licensed = boolOf(s.scraping_licensed, false);
    if (mode === "scrape" && s.scraping_licensed === undefined) {
      issues.push(`${label}.scraping_licensed must be stated explicitly for scrape sources (false until confirmed)`);
    }
    if (mode === "scrape" && enabled && !licensed) {
      issues.push(`${label}: enabled is true but scraping_licensed is false — the source would be skipped every run`);
    }

    let discovery: DiscoverySpec | undefined;
    if (isRecord(s.discovery)) {
      const endpoint = textOf(s.discovery.endpoint);
      const storeAs = textOf(s.discovery.store_as);
      const matchField = textOf(s.discovery.match_field);
      const matchContains = textOf(s.discovery.match_contains);
      if (!endpoint || !storeAs || !matchField || !matchContains) {
        issues.push(`${label}.discovery needs endpoint, store_as, match_field and match_contains`);
      } else if (!endpoints.some((e) => e.name === endpoint)) {
        issues.push(`${label}.discovery.endpoint «${endpoint}» is not one of the declared endpoints`);
      } else {
        discovery = { endpoint, store_as: storeAs, match_field: matchField, match_contains: matchContains };
      }
    }

    const rateLimit: RateLimitSpec = {
      per_minute: optionalNumber(rateRaw.per_minute, 1),
      per_day: optionalNumber(rateRaw.per_day, 1),
      min_interval_ms: optionalNumber(rateRaw.min_interval_ms, 0) ?? undefined,
    };

    const rank = priority.indexOf(name);
    out.push({
      name,
      label_ar: textOf(s.label_ar, name) || name,
      label_en: textOf(s.label_en, name) || name,
      home: textOf(s.home, baseUrl) || baseUrl,
      base_url: baseUrl,
      mode,
      enabled,
      scraping_licensed: licensed,
      license_note: textOf(s.license_note) || undefined,
      docs: textOf(s.docs) || undefined,
      rank: rank >= 0 ? rank : priority.length,
      policy: {
        respect_robots: boolOf(policyRaw.respect_robots, true),
        min_interval_ms: numberOf(policyRaw.min_interval_ms, 1200, 0, 600_000),
        timeout_ms: numberOf(policyRaw.timeout_ms, 12_000, 500, 120_000),
      },
      auth,
      rate_limit: rateLimit,
      endpoints,
      discovery,
      targets: parseTargets(s.targets, name, issues),
    });
  }

  if (out.length === 0) issues.push("sources: at least one source is required");

  // Rank must be unique so priority order is total, not partial.
  const ranks = new Map<number, string[]>();
  for (const source of out) {
    if (source.rank >= priority.length) continue;
    ranks.set(source.rank, [...(ranks.get(source.rank) ?? []), source.name]);
  }
  for (const [rank, names] of ranks) {
    if (names.length > 1) issues.push(`priority: rank ${rank} is shared by ${names.join(", ")}`);
  }
  return out;
}

function parseJobs(raw: Rec, sourceNames: Set<string>, issues: string[]): JobSpec[] {
  const out: JobSpec[] = [];
  for (const [name, value] of Object.entries(raw)) {
    const j = asRecord(value);
    const label = `jobs.${name}`;
    const sources = listOf(j.sources).map((v) => textOf(v)).filter(Boolean);
    for (const source of sources) {
      if (!sourceNames.has(source)) issues.push(`${label}.sources: unknown source «${source}»`);
    }
    const interval = numberOf(j.interval_minutes, 0, 1, 1_000_000);
    if (interval <= 0) issues.push(`${label}.interval_minutes is required and must be > 0`);

    const matchdayInterval = optionalNumber(j.matchday_interval_minutes, 1);
    if (matchdayInterval !== null && matchdayInterval > interval) {
      issues.push(`${label}.matchday_interval_minutes (${matchdayInterval}) must not exceed interval_minutes (${interval})`);
    }

    const entities = listOf(j.entities)
      .map((v) => textOf(v))
      .filter(Boolean);
    for (const entity of entities) {
      if (!ENTITIES.has(entity)) issues.push(`${label}.entities: unknown entity «${entity}»`);
    }

    out.push({
      name,
      description: textOf(j.description) || undefined,
      sources,
      interval_minutes: interval,
      matchday_interval_minutes: matchdayInterval,
      min_interval_minutes: optionalNumber(j.min_interval_minutes, 1),
      match_window_minutes: optionalNumber(j.match_window_minutes, 1),
      run_on_boot: j.run_on_boot === undefined ? undefined : boolOf(j.run_on_boot, false),
      entities: entities.length ? (entities as PipelineEntity[]) : undefined,
    });
  }
  return out;
}

/* ──────────────────────────────── loading ─────────────────────────────── */

function readIfPresent(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function parseByShape(path: string, text: string, issues: string[]): unknown | null {
  const trimmed = text.trim();
  if (trimmed === "") {
    issues.push(`${path} is empty`);
    return null;
  }
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch (error) {
      issues.push(`${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
  try {
    return parseYamlMap(trimmed);
  } catch (error) {
    issues.push(`${path}: ${error instanceof YamlLiteError ? error.message : String(error)}`);
    return null;
  }
}

export type LoadOptions = { refresh?: boolean };

let cached: PipelineConfig | null = null;

/**
 * The typed registry. Fails closed: if no source can be read, this throws
 * rather than returning an empty config (an empty registry would silently
 * disable the whole pipeline, which is worse than a loud error).
 */
export function loadPipelineConfig(opts: LoadOptions = {}): PipelineConfig {
  if (cached && !opts.refresh) return cached;

  const candidates: { path: string; origin: ConfigOrigin }[] = [];
  const explicit = process.env.PIPELINE_CONFIG_PATH;
  if (explicit) candidates.push({ path: resolve(explicit), origin: "path" });
  candidates.push({ path: CONFIG_LOCAL, origin: "local" });
  candidates.push({ path: CONFIG_YAML, origin: "yaml" });
  candidates.push({ path: CONFIG_JSON, origin: "json" });

  const issues: string[] = [];
  for (const candidate of candidates) {
    const raw = readIfPresent(candidate.path);
    if (raw === null) {
      if (candidate.origin === "path") issues.push(`PIPELINE_CONFIG_PATH → ${candidate.path} does not exist`);
      continue;
    }
    const parsed = parseByShape(candidate.path, raw, issues);
    if (parsed === null) continue;
    const config = validatePipelineConfig(parsed, candidate.origin);
    cached = config;
    return config;
  }

  throw new PipelineConfigError(
    "no readable pipeline registry (looked for endpoints.yml, endpoints.json and PIPELINE_CONFIG_PATH)",
    issues,
  );
}

/** Forget the memoised registry — used by tests and by `--refresh` in the CLI. */
export function resetPipelineConfig(): void {
  cached = null;
}

/* ──────────────────────────────── lookups ─────────────────────────────── */

export function sourceByName(config: PipelineConfig, name: SourceName): SourceSpec | null {
  return config.sources.find((s) => s.name === name) ?? null;
}

export function jobByName(config: PipelineConfig, name: string): JobSpec | null {
  return config.jobs.find((j) => j.name === name) ?? null;
}

export function endpointByName(source: SourceSpec, name: string): EndpointSpec | null {
  return source.endpoints.find((e) => e.name === name) ?? null;
}

export function competitionBySlug(config: PipelineConfig, slug: string): CompetitionSpec | null {
  return config.competitions.find((c) => c.slug === slug) ?? null;
}

/** The credential value for a source, read from the environment only. */
export function sourceCredential(source: SourceSpec, env: Record<string, string | undefined> = process.env): string | null {
  if (!source.auth) return null;
  const value = env[source.auth.env];
  return value && value.trim() !== "" ? value.trim() : null;
}

/* ─────────────────────────────── gatekeeping ──────────────────────────── */

export type SourceGate = {
  /** Every precondition for calling this source is satisfied. */
  callable: boolean;
  /** What is missing, in operator-readable words (empty when callable). */
  missing: string[];
};

/**
 * The three independent switches a scraped source needs, and the single switch
 * an API source needs. Nothing else in the codebase decides this.
 */
export function sourceGate(source: SourceSpec, env: Record<string, string | undefined> = process.env): SourceGate {
  const missing: string[] = [];
  if (!source.enabled) missing.push("source disabled in config");
  if (source.auth && !sourceCredential(source, env)) missing.push(`${source.auth.env} is not set`);
  if (source.mode === "scrape") {
    if (!source.scraping_licensed) missing.push("scraping not licensed (config: scraping_licensed=false)");
    if (env.PIPELINE_SCRAPING_LICENSED !== "1") missing.push("PIPELINE_SCRAPING_LICENSED is not 1");
  }
  return { callable: missing.length === 0, missing };
}

/** Sources that may be called right now, highest priority first. */
export function callableSources(config: PipelineConfig, env: Record<string, string | undefined> = process.env): SourceSpec[] {
  return config.sources
    .filter((source) => sourceGate(source, env).callable)
    .sort((a, b) => a.rank - b.rank);
}

/** Unverified endpoints are only reachable behind an explicit, temporary switch. */
export function unverifiedAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.PIPELINE_ALLOW_UNVERIFIED_ENDPOINTS === "1";
}

/** `true` when a target's data must stay in the raw archive only. */
export function isForeignTarget(target: TargetSpec | null | undefined): boolean {
  return Boolean(target?.foreign);
}

/* ─────────────────────────── operator-facing report ───────────────────── */

export type ConfigurationSource = {
  name: SourceName;
  label_ar: string;
  label_en: string;
  home: string;
  mode: SourceSpec["mode"];
  rank: number;
  enabled: boolean;
  scraping_licensed: boolean;
  callable: boolean;
  blocked_by: string[];
  auth_env: string | null;
  policy: SourceSpec["policy"];
  rate_limit: RateLimitSpec;
  endpoints: EndpointSpec[];
  unverified_endpoints: string[];
  targets: TargetSpec[];
  license_note?: string;
  docs?: string;
};

export type ConfigurationJob = {
  name: string;
  description?: string;
  sources: string[];
  interval_minutes: number;
  matchday_interval_minutes: number | null;
  min_interval_minutes: number | null;
  entities: PipelineEntity[];
};

export type ConfigurationReport = {
  version: number;
  origin: ConfigOrigin;
  path: string;
  priority: SourceName[];
  competitions: CompetitionSpec[];
  defaults: PipelineDefaults;
  sources: ConfigurationSource[];
  jobs: ConfigurationJob[];
  warnings: string[];
};

/**
 * One object that answers "what is configured, what is open, and what still
 * needs a human?" — used by `pipeline:doctor` and by `/admin/pipeline`.
 */
export function configurationReport(
  config: PipelineConfig,
  env: Record<string, string | undefined> = process.env,
): ConfigurationReport {
  const warnings: string[] = [];
  const sources: ConfigurationSource[] = config.sources
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((source) => {
      const gate = sourceGate(source, env);
      const unverified = source.endpoints.filter((e) => !e.verified).map((e) => e.name);
      if (!gate.callable && source.enabled) warnings.push(`${source.name}: enabled but blocked — ${gate.missing.join("; ")}`);
      if (unverified.length) warnings.push(`${source.name}: ${unverified.length} endpoint(s) still unverified — ${unverified.join(", ")}`);
      if (source.mode === "scrape" && !source.scraping_licensed) {
        warnings.push(`${source.name}: scraping is not licensed yet — the connector will not run`);
      }
      return {
        name: source.name,
        label_ar: source.label_ar,
        label_en: source.label_en,
        home: source.home,
        mode: source.mode,
        rank: source.rank,
        enabled: source.enabled,
        scraping_licensed: source.scraping_licensed,
        callable: gate.callable,
        blocked_by: gate.missing,
        auth_env: source.auth?.env ?? null,
        policy: source.policy,
        rate_limit: source.rate_limit,
        endpoints: source.endpoints,
        unverified_endpoints: unverified,
        targets: source.targets,
        license_note: source.license_note,
        docs: source.docs,
      };
    });

  return {
    version: config.version,
    origin: config.origin,
    path: config.origin === "local" ? CONFIG_LOCAL : config.origin === "yaml" ? CONFIG_YAML : CONFIG_JSON,
    priority: config.priority,
    competitions: config.competitions,
    defaults: config.defaults,
    sources,
    jobs: config.jobs.map((job) => ({
      name: job.name,
      description: job.description,
      sources: job.sources,
      interval_minutes: job.interval_minutes,
      matchday_interval_minutes: job.matchday_interval_minutes ?? null,
      min_interval_minutes: job.min_interval_minutes ?? null,
      entities: job.entities ?? [],
    })),
    warnings,
  };
}
