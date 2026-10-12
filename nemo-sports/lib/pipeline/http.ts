/**
 * NEMO Sports · Pipeline · HTTP client
 * ────────────────────────────────────
 * The single door every connector goes through. It exists so the rules in §2
 * and §5 of the brief are implemented once, not per connector:
 *
 *   · the URL is taken EXACTLY as configured — no rewriting, no proxying, no
 *     "helpful" normalisation of an upstream path;
 *   · timeouts on every attempt, exponential backoff with jitter on 429/5xx/
 *     network failures, `Retry-After` honoured when the provider sends it;
 *   · conditional requests (`If-None-Match` / `If-Modified-Since`) so an
 *     unchanged resource costs one cheap 304 instead of a full transfer;
 *   · robots.txt is consulted before any `mode: scrape` request, and a
 *     Disallow is final — the pipeline does not retry, disguise or bypass it;
 *   · per-source pacing (minimum interval + window budgets) so a provider is
 *     never hammered, and the local budget refuses before the provider 429s;
 *   · every exchange is archived (status, etag, hash, body) with credentials
 *     stripped, and every attempt is countable.
 *
 * Nothing here escalates access: a 401/403/404 is reported as-is.
 */

import { archiveRaw, sha256 } from "./raw-store";
import { EMPTY_ROBOTS, parseRobots, robotsDecision, type RobotsFile } from "./robots";
import type { PipelineLogger } from "./state";
import { consoleLogger, scrub } from "./state";
import { loadState, loadValidators, saveState } from "./state";
import type { EndpointSpec, PipelineConfig, RawRecord, SourceName, SourceSpec } from "./types";
import { endpointByName, sourceByName } from "./config";

export type HttpSource = Pick<SourceSpec, "name" | "base_url" | "auth" | "policy" | "rate_limit" | "mode" | "endpoints">;

export type RequestOptions = {
  /** values for `{placeholders}` inside the endpoint path */
  pathParams?: Record<string, string>;
  /** query parameters, merged over the endpoint's own defaults */
  params?: Record<string, string | number | null | undefined>;
  /** sync_state key: when given, conditional headers are sent and updated */
  conditional?: { job: string } | null;
  runId?: string | null;
  accept?: string;
  /** skip the archive (used by the doctor's connectivity probe) */
  archive?: boolean;
  /** do not send/record conditional headers, even with a state row */
  force?: boolean;
  /**
   * A competition-specific page URL taken from the registry (`targets[].ref.url`).
   * It is honoured only when it shares the source's configured origin — the
   * pipeline never fetches a host that the registry did not name.
   */
  overrideUrl?: string;
};

export type HttpDeps = {
  logger?: PipelineLogger;
  sleep?: (ms: number) => Promise<void>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** disable the archive entirely (offline tests) */
  archive?: boolean;
  robotsFetchImpl?: typeof fetch;
};

type PersistInput = {
  source: SourceName;
  endpoint: string;
  url: string;
  statusCode: number | null;
  etag: string | null;
  lastModified: string | null;
  contentType: string | null;
  payload: unknown;
  payloadText: string | null;
  payloadHash?: string | null;
  durationMs: number;
  attempts: number;
  notModified: boolean;
  error: string | null;
  runId: string | null;
};

export type BudgetSnapshot = {
  source: SourceName;
  window: "minute" | "day";
  limit: number | null;
  used: number;
  remaining: number | null;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class PipelineHttp {
  private readonly logger: PipelineLogger;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly doFetch: typeof fetch;
  private readonly now: () => number;
  private readonly archive: boolean;

  private readonly lastCallAt = new Map<string, number>();
  private readonly calls = new Map<string, number[]>();
  private readonly robotsCache = new Map<string, { file: RobotsFile; at: number }>();
  private readonly robotsFetch: typeof fetch;

  constructor(
    private readonly cfg: PipelineConfig,
    deps: HttpDeps = {},
  ) {
    this.logger = deps.logger ?? consoleLogger;
    this.sleep = deps.sleep ?? defaultSleep;
    this.doFetch = deps.fetchImpl ?? ((...args) => globalThis.fetch(...args));
    this.robotsFetch = deps.robotsFetchImpl ?? this.doFetch;
    this.now = deps.now ?? (() => Date.now());
    this.archive = deps.archive !== false;
  }

  /** User-Agent with an optional operator contact, never a credential. */
  userAgent(): string {
    const contact = process.env.PIPELINE_CONTACT?.trim();
    const base = this.cfg.defaults.user_agent;
    return contact ? `${base} contact=${contact}` : base;
  }

  private uaToken(): string {
    return this.userAgent().split(/[\s/]/)[0] ?? "NemoSportsDataBot";
  }

  /** Resolve a URL exactly as configured. Exported for the doctor + tests. */
  resolveUrl(
    source: HttpSource,
    endpoint: EndpointSpec,
    opts: { pathParams?: Record<string, string>; params?: Record<string, string | number | null | undefined> } = {},
  ): URL {
    const path = endpoint.path.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, key: string) => {
      const value = opts.pathParams?.[key];
      if (value === undefined || value === null || value === "") {
        throw new Error(`${source.name}/${endpoint.name}: missing path parameter «${key}»`);
      }
      return encodeURIComponent(value);
    });

    const base = source.base_url.endsWith("/") ? source.base_url : `${source.base_url}/`;
    const url = new URL(path.replace(/^\//, ""), base);

    const put = (key: string, raw: string | number | null | undefined) => {
      if (raw === undefined || raw === null || raw === "") return;
      const replaced = String(raw).replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, k: string) => opts.pathParams?.[k] ?? "");
      if (replaced === "") return;
      url.searchParams.set(key, replaced);
    };

    for (const [key, value] of Object.entries(endpoint.params ?? {})) put(key, value);
    for (const [key, value] of Object.entries(opts.params ?? {})) put(key, value);

    if (source.auth?.type === "query" && source.auth.param) {
      const credential = process.env[source.auth.env];
      if (credential) url.searchParams.set(source.auth.param, credential);
    }
    return url;
  }

  /** URL as it may be logged/stored: credentials replaced by `***`. */
  redactUrl(url: URL, source: HttpSource): string {
    const clone = new URL(url.toString());
    if (source.auth?.type === "query" && source.auth.param) clone.searchParams.set(source.auth.param, "***");
    for (const key of [...clone.searchParams.keys()]) {
      if (/^(api[-_]?key|apikey|key|token|auth)$/i.test(key)) clone.searchParams.set(key, "***");
    }
    return clone.toString();
  }

  private authHeaders(source: HttpSource): Record<string, string> {
    const headers: Record<string, string> = {};
    if (source.auth?.type === "header" && source.auth.header) {
      const credential = process.env[source.auth.env];
      if (credential && credential.trim() !== "") headers[source.auth.header] = credential.trim();
    }
    return headers;
  }

  /** Consume the budget for a source window; returns false when exhausted. */
  private charge(source: SourceName, window: "minute" | "day"): boolean {
    const source_ = sourceByName(this.cfg, source);
    const limit = window === "minute" ? source_?.rate_limit?.per_minute ?? null : source_?.rate_limit?.per_day ?? null;
    if (!limit || limit <= 0) return true;
    const span = window === "minute" ? 60_000 : 86_400_000;
    const key = `${source}:${window}`;
    const cutoff = this.now() - span;
    const stamps = (this.calls.get(key) ?? []).filter((t) => t > cutoff);
    if (stamps.length >= limit) {
      this.calls.set(key, stamps);
      return false;
    }
    stamps.push(this.now());
    this.calls.set(key, stamps);
    return true;
  }

  budget(source: SourceName): { perMinute: number | null; perDay: number | null; usedMinute: number; usedDay: number } {
    const spec = sourceByName(this.cfg, source);
    const cutoffMin = this.now() - 60_000;
    const cutoffDay = this.now() - 86_400_000;
    const minute = (this.calls.get(`${source}:minute`) ?? []).filter((t) => t > cutoffMin).length;
    const day = (this.calls.get(`${source}:day`) ?? []).filter((t) => t > cutoffDay).length;
    return { perMinute: spec?.rate_limit?.per_minute ?? null, perDay: spec?.rate_limit?.per_day ?? null, usedMinute: minute, usedDay: day };
  }

  /** Pacing between two requests to the same source, honouring Crawl-delay. */
  private async pace(source: HttpSource, extraDelayMs = 0): Promise<void> {
    const min = Math.max(source.policy.min_interval_ms, extraDelayMs);
    const last = this.lastCallAt.get(source.name) ?? 0;
    const wait = last + min - this.now();
    if (wait > 0) await this.sleep(wait);
    this.lastCallAt.set(source.name, this.now());
  }

  private async robotsFor(source: HttpSource): Promise<RobotsFile> {
    const cached = this.robotsCache.get(source.name);
    if (cached && this.now() - cached.at < this.cfg.defaults.robots_ttl_seconds * 1000) return cached.file;

    let file: RobotsFile = EMPTY_ROBOTS;
    try {
      const url = new URL("/robots.txt", source.base_url);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await this.robotsFetch(url.toString(), { headers: { "user-agent": this.userAgent() }, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) file = parseRobots(await res.text());
      else file = { ...EMPTY_ROBOTS, present: true }; // an explicit 4xx robots.txt = no rules published
    } catch {
      file = EMPTY_ROBOTS;
    }
    this.robotsCache.set(source.name, { file, at: this.now() });
    return file;
  }

  private backoffMs(attempt: number, retryAfterSeconds: number | null): number {
    if (retryAfterSeconds !== null && retryAfterSeconds >= 0) return Math.min(retryAfterSeconds * 1000, this.cfg.defaults.backoff_max_ms);
    const base = this.cfg.defaults.backoff_base_ms * 2 ** attempt;
    const jitter = Math.floor(Math.random() * (this.cfg.defaults.backoff_base_ms / 2));
    return Math.min(base + jitter, this.cfg.defaults.backoff_max_ms);
  }

  /**
   * One HTTP exchange with retries, conditional headers, robots gate, pacing
   * and archiving. Never throws for an HTTP/network failure — it returns a
   * `RawRecord` whose `error` explains what happened, so a failed fetch is a
   * recorded outcome instead of a stack trace.
   */
  async execute(sourceName: SourceName, endpointName: string, opts: RequestOptions = {}): Promise<RawRecord> {
    const source = sourceByName(this.cfg, sourceName);
    const endpoint = source ? endpointByName(source, endpointName) : null;
    if (!source || !endpoint) {
      return this.failure(sourceName, endpointName, `unknown ${source ? "endpoint" : "source"} «${source ? endpointName : sourceName}»`);
    }

    let url: URL;
    try {
      url = this.resolveUrl(source, endpoint, opts);
      if (opts.overrideUrl) {
        const override = new URL(opts.overrideUrl);
        const base = new URL(source.base_url);
        if (override.origin !== base.origin) {
          return this.failure(
            source.name,
            endpoint.name,
            `refusing to fetch ${override.origin}: the registry only authorises ${base.origin}`,
          );
        }
        url = override;
      }
    } catch (e) {
      return this.failure(source.name, endpoint.name, e instanceof Error ? e.message : String(e));
    }

    const stored = this.redactUrl(url, source);
    const started = this.now();
    const attemptsLimit = Math.max(1, this.cfg.defaults.retries + 1);
    let attempts = 0;
    let lastError: string | null = null;
    let lastStatus: number | null = null;

    // ── robots gate (scrape sources only) ──────────────────────────────────
    let crawlDelayMs = 0;
    if (source.mode === "scrape" && source.policy.respect_robots) {
      const robots = await this.robotsFor(source);
      const decision = robotsDecision(robots, `${url.pathname}${url.search}`, this.uaToken());
      if (!decision.allowed) {
        const record = this.failure(source.name, endpoint.name, `robots.txt disallows ${url.pathname}`, { url: stored, notModified: false, durationMs: this.now() - started });
        this.logger("warn", "pipeline.robots_denied", { source: source.name, endpoint: endpoint.name, path: url.pathname });
        return record;
      }
      crawlDelayMs = (decision.crawlDelaySeconds ?? 0) * 1000;
    }

    // ── local budget ───────────────────────────────────────────────────────
    for (const window of ["minute", "day"] as const) {
      if (!this.charge(source.name, window)) {
        const budget = this.budget(source.name);
        this.logger("warn", "pipeline.budget_exhausted", { source: source.name, window, budget });
        return this.failure(source.name, endpoint.name, `local ${window} budget exhausted (rate_limited)`, {
          url: stored,
          durationMs: this.now() - started,
        });
      }
    }

    // ── conditional request state ──────────────────────────────────────────
    // One job can touch several endpoints, so the validator is kept per
    // endpoint inside `cursor` (JSON) while the top-level columns stay as the
    // brief's `sync_state` shape and keep working for single-endpoint jobs.
    let etag: string | null = null;
    let lastModified: string | null = null;
    let stateCursor: Record<string, unknown> = {};
    if (opts.conditional?.job && !opts.force) {
      const state = await loadState(source.name, opts.conditional.job);
      stateCursor = state?.cursor ?? {};
      // Two rules, both learned the hard way:
      //   · only this endpoint's own validator may be sent (the top-level
      //     columns hold the *last* validator of the job, and reusing it for a
      //     different path asks the provider "has THIS url changed?" wrongly);
      //   · the validator belongs to the URL, not to the job, so it is read
      //     across every job of the source (bootstrap vs standings) — otherwise
      //     each job re-downloads what its sibling already has.
      const validators = await loadValidators(source.name);
      etag = validators.etags[endpoint.name] ?? null;
      lastModified = validators.lastModified[endpoint.name] ?? null;
    }

    const headers: Record<string, string> = {
      "user-agent": this.userAgent(),
      accept: opts.accept ?? (endpoint.kind === "json" ? "application/json" : "text/html,application/xhtml+xml"),
      ...this.authHeaders(source),
      ...(endpoint.headers ?? {}),
    };
    if (etag) headers["if-none-match"] = etag;
    if (lastModified) headers["if-modified-since"] = lastModified;

    await this.pace(source, crawlDelayMs);

    for (let attempt = 0; attempt < attemptsLimit; attempt += 1) {
      attempts += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), source.policy.timeout_ms);
      const attemptStart = this.now();
      try {
        const res = await this.doFetch(url.toString(), { headers, signal: controller.signal });
        clearTimeout(timer);
        lastStatus = res.status;
        const responseEtag = res.headers.get("etag");
        const responseLastModified = res.headers.get("last-modified");
        const contentType = res.headers.get("content-type");

        if (res.status === 304) {
          const record = await this.persist({
            source: source.name,
            endpoint: endpoint.name,
            url: stored,
            statusCode: 304,
            etag: responseEtag ?? etag,
            lastModified: responseLastModified ?? lastModified,
            contentType,
            payload: null,
            payloadText: null,
            durationMs: this.now() - started,
            attempts,
            notModified: true,
            error: null,
            runId: opts.runId ?? null,
          }, opts);
          if (opts.conditional?.job) {
            await saveState(source.name, opts.conditional.job, {
              success: true,
              etag: record.etag ?? undefined,
              lastModified: record.lastModified ?? undefined,
              cursor: this.cursorWithValidator(stateCursor, endpoint.name, record.etag, record.lastModified),
              error: null,
            });
          }
          this.logger("debug", "pipeline.not_modified", { source: source.name, endpoint: endpoint.name, ms: this.now() - started });
          return record;
        }

        const text = await res.text();

        if (res.status === 429 || res.status >= 500 || res.status === 408 || res.status === 425) {
          const retryAfter = res.headers.get("retry-after");
          const retryAfterSeconds = retryAfter === null ? null : Number(retryAfter);
          lastError = `HTTP ${res.status}`;
          if (attempt < attemptsLimit - 1) {
            const wait = this.backoffMs(attempt, Number.isFinite(retryAfterSeconds as number) ? (retryAfterSeconds as number) : null);
            this.logger("warn", "pipeline.retry", { source: source.name, endpoint: endpoint.name, status: res.status, attempt: attempt + 1, wait_ms: wait });
            await this.sleep(wait);
            continue;
          }
          return this.persist(
            {
              source: source.name,
              endpoint: endpoint.name,
              url: stored,
              statusCode: res.status,
              etag: responseEtag,
              lastModified: responseLastModified,
              contentType,
              payload: null,
              payloadText: text.slice(0, 2000),
              payloadHash: sha256(text),
              durationMs: this.now() - started,
              attempts,
              notModified: false,
              error: `HTTP ${res.status}`,
              runId: opts.runId ?? null,
            },
            opts,
          );
        }

        if (!res.ok) {
          // 4xx other than 429: retrying cannot help, so it is reported as-is.
          return this.persist(
            {
              source: source.name,
              endpoint: endpoint.name,
              url: stored,
              statusCode: res.status,
              etag: responseEtag,
              lastModified: responseLastModified,
              contentType,
              payload: null,
              payloadText: text.slice(0, 2000),
              payloadHash: sha256(text),
              durationMs: this.now() - started,
              attempts,
              notModified: false,
              error: `HTTP ${res.status}`,
              runId: opts.runId ?? null,
            },
            opts,
          );
        }

        const isJson = (contentType ?? "").includes("json") || endpoint.kind === "json";
        let payload: unknown = null;
        if (isJson) {
          try {
            payload = JSON.parse(text) as unknown;
          } catch {
            payload = null;
            lastError = "response was not valid JSON";
          }
        } else {
          payload = text;
        }

        const record = await this.persist(
          {
            source: source.name,
            endpoint: endpoint.name,
            url: stored,
            statusCode: res.status,
            etag: responseEtag,
            lastModified: responseLastModified,
            contentType,
            payload,
            payloadText: text,
            payloadHash: sha256(text),
            durationMs: this.now() - started,
            attempts,
            notModified: false,
            error: lastError,
            runId: opts.runId ?? null,
          },
          opts,
        );

        if (opts.conditional?.job) {
          await saveState(source.name, opts.conditional.job, {
            success: true,
            etag: record.etag ?? undefined,
            lastModified: record.lastModified ?? undefined,
            cursor: this.cursorWithValidator(stateCursor, endpoint.name, record.etag, record.lastModified),
            error: null,
          });
        }
        this.logger("info", "pipeline.fetched", {
          source: source.name,
          endpoint: endpoint.name,
          status: res.status,
          attempt: attempt + 1,
          bytes: record.bytes,
          ms: record.durationMs,
          attemptMs: this.now() - attemptStart,
        });
        return record;
      } catch (e) {
        clearTimeout(timer);
        const aborted = e instanceof Error && e.name === "AbortError";
        lastError = aborted ? `timeout after ${source.policy.timeout_ms}ms` : e instanceof Error ? e.message : String(e);
        if (attempt < attemptsLimit - 1) {
          const wait = this.backoffMs(attempt, null);
          this.logger("warn", "pipeline.retry", { source: source.name, endpoint: endpoint.name, error: lastError, attempt: attempt + 1, wait_ms: wait });
          await this.sleep(wait);
          continue;
        }
      }
    }

    return this.persist(
      {
        source: source.name,
        endpoint: endpoint.name,
        url: stored,
        statusCode: lastStatus,
        etag: null,
        lastModified: null,
        contentType: null,
        payload: null,
        payloadText: null,
        payloadHash: null,
        durationMs: this.now() - started,
        attempts,
        notModified: false,
        error: lastError ?? "request failed",
        runId: opts.runId ?? null,
      },
      opts,
    );
  }

  /** Merge this endpoint's validator into the job cursor (dropping nulls). */
  private cursorWithValidator(
    cursor: Record<string, unknown>,
    endpoint: string,
    etag: string | null,
    lastModified: string | null,
  ): Record<string, unknown> {
    const etags = { ...((cursor.etags ?? {}) as Record<string, string | null>) };
    const modified = { ...((cursor.last_modified ?? {}) as Record<string, string | null>) };
    if (etag) etags[endpoint] = etag;
    else delete etags[endpoint];
    if (lastModified) modified[endpoint] = lastModified;
    else delete modified[endpoint];
    return { ...cursor, etags, last_modified: modified };
  }

  private async persist(input: PersistInput, opts: RequestOptions): Promise<RawRecord> {
    const payloadText = input.payloadText ?? null;
    const payloadHash = input.payloadHash ?? (payloadText ? sha256(payloadText) : null);
    const bytes = payloadText ? Buffer.byteLength(payloadText, "utf8") : null;
    const record: Omit<RawRecord, "id"> & { payloadText: string | null } = {
      source: input.source,
      endpoint: input.endpoint,
      url: input.url,
      fetchedAt: new Date(this.now()).toISOString(),
      statusCode: input.statusCode,
      etag: input.etag,
      lastModified: input.lastModified,
      contentType: input.contentType,
      payloadHash,
      payload: input.payload ?? null,
      bytes,
      durationMs: input.durationMs,
      runId: input.runId,
      notModified: input.notModified,
      attempts: input.attempts,
      error: input.error,
      payloadText,
    };
    const payloadJson = input.payload && typeof input.payload === "object" ? input.payload : null;
    const shouldArchive = this.archive && opts.archive !== false;
    const id = shouldArchive
      ? await archiveRaw({
          source: record.source,
          endpoint: record.endpoint,
          url: record.url,
          fetchedAt: record.fetchedAt,
          statusCode: record.statusCode,
          etag: record.etag,
          lastModified: record.lastModified,
          contentType: record.contentType,
          payloadHash: record.payloadHash,
          payload: record.payload,
          payloadJson,
          payloadText,
          bytes,
          durationMs: record.durationMs,
          runId: record.runId,
          notModified: record.notModified,
          attempts: record.attempts,
          error: record.error,
        } as Parameters<typeof archiveRaw>[0])
      : null;

    if (record.error && record.statusCode !== 304) {
      this.logger("warn", "pipeline.fetch_failed", {
        source: record.source,
        endpoint: record.endpoint,
        status: record.statusCode,
        attempts: record.attempts,
        error: record.error,
      });
    }
    return { ...record, id };
  }

  private failure(
    source: SourceName,
    endpoint: string,
    error: string,
    extra: Partial<RawRecord> & { archiveHint?: string } = {},
  ): RawRecord {
    return {
      id: null,
      source,
      endpoint,
      url: extra.url ?? "",
      fetchedAt: new Date(this.now()).toISOString(),
      statusCode: null,
      etag: null,
      lastModified: null,
      contentType: null,
      payloadHash: null,
      payload: null,
      bytes: null,
      durationMs: extra.durationMs ?? null,
      runId: null,
      notModified: false,
      attempts: 0,
      error: extra.archiveHint ?? error,
    };
  }

  /**
   * A `fetch` implementation that routes through this client, so an SDL
   * adapter used by a connector gets the same retries, pacing, robots gate and
   * raw archive as any other pipeline call.
   *
   * The adapter sees a normal `Response`; the archive sees the exact bytes.
   */
  recordingFetch(sourceName: SourceName, opts: { runId?: string | null; endpointLabel?: string } = {}): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const source = sourceByName(this.cfg, sourceName);
      if (!source) throw new Error(`pipeline: unknown source «${sourceName}»`);
      const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const url = new URL(raw);
      const label = opts.endpointLabel ?? `${url.pathname}${url.search ? "?…" : ""}`;
      const stored = this.redactUrl(url, source);

      if (source.mode === "scrape" && source.policy.respect_robots) {
        const robots = await this.robotsFor(source);
        const decision = robotsDecision(robots, `${url.pathname}${url.search}`, this.uaToken());
        if (!decision.allowed) throw new Error(`robots.txt disallows ${url.pathname}`);
      }
      for (const window of ["minute", "day"] as const) {
        if (!this.charge(source.name, window)) throw new Error(`local ${window} budget exhausted for ${source.name}`);
      }
      await this.pace(source);

      const headers = new Headers(init?.headers ?? {});
      if (!headers.has("user-agent")) headers.set("user-agent", this.userAgent());
      const attemptsLimit = Math.max(1, this.cfg.defaults.retries + 1);
      let lastError: unknown = null;

      for (let attempt = 0; attempt < attemptsLimit; attempt += 1) {
        const started = this.now();
        try {
          const res = await this.doFetch(url.toString(), { ...init, headers });
          const text = await res.text();
          await this.persist(
            {
              source: source.name,
              endpoint: label,
              url: stored,
              statusCode: res.status,
              etag: res.headers.get("etag"),
              lastModified: res.headers.get("last-modified"),
              contentType: res.headers.get("content-type"),
              payload: null,
              payloadText: text,
              payloadHash: sha256(text),
              durationMs: this.now() - started,
              attempts: attempt + 1,
              notModified: res.status === 304,
              error: res.ok ? null : `HTTP ${res.status}`,
              runId: opts.runId ?? null,
            } as Parameters<typeof this.persist>[0],
            {},
          );
          if ((res.status === 429 || res.status >= 500) && attempt < attemptsLimit - 1) {
            const retryAfter = Number(res.headers.get("retry-after"));
            await this.sleep(this.backoffMs(attempt, Number.isFinite(retryAfter) ? retryAfter : null));
            continue;
          }
          return new Response(res.status === 304 || res.status === 204 ? null : text, {
            status: res.status,
            statusText: res.statusText,
            headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
          });
        } catch (e) {
          lastError = e;
          if (attempt < attemptsLimit - 1) {
            await this.sleep(this.backoffMs(attempt, null));
            continue;
          }
        }
      }
      throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "request failed"));
    }) as typeof fetch;
  }
}

/** Convenience factory used by the runners and the CLI. */
export function createHttp(cfg: PipelineConfig, deps: HttpDeps = {}): PipelineHttp {
  return new PipelineHttp(cfg, deps);
}

export { scrub };
