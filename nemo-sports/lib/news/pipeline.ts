import { StoreWriteError } from "@/lib/db/store-policy";
import { getDb } from "@/lib/db/pg";
/**
 * NEMO Sports · news ingestion pipeline
 * ─────────────────────────────────────
 * FETCH → PARSE → NORMALIZE → DEDUPLICATE → VALIDATE → CATEGORIZE →
 * ENTITY-MATCH → STORE → PUBLISH.
 *
 * Runs from Vercel Cron (/api/cron/fetch-news) and from lazy refresh
 * (lib/news/service.ts). Respects per-source refresh intervals + backoff,
 * uses HTTP caching (ETag/If-Modified-Since), 10s timeout per feed.
 */

import { randomUUID } from "node:crypto";
import { buildFeedUrl } from "./sources";
import { parseRss } from "./parse";
import {
  canonicalizeUrl,
  cleanText,
  extractDomain,
  fingerprint,
  resolvePublisherUrl,
  sourceBadge,
  toIsoDate,
  validateArticle,
} from "./normalize";
import { checkDuplicate, type DedupCandidate } from "./dedup";
import { sportsRelevance } from "./relevance";
import { categorizeArticle } from "./categorize";
import { matchEntities } from "./entities";
import {
  countArticlesBySource,
  findByCanonicalUrl,
  insertArticle,
  listSources,
  logFetch,
  recentByDomain,
  recordSourceFailure,
  recordSourceSuccess,
} from "./store";
import type { IngestStats, NewsArticle, RSSSource } from "./types";

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = "NEMO-Sports/1.0 (+https://nemo-sports.vercel.app)";

export interface SourceRunResult {
  sourceId: string;
  query: string;
  ok: boolean;
  skipped?: string;
  processed: number;
  inserted: number;
  duplicates: number;
  validationFailures: number;
  parseErrors: number;
  entityMatches: number;
  notModified?: boolean;
  error?: string;
  ms: number;
}

function eligibleNow(source: RSSSource, now: number): string | null {
  if (!source.enabled) return "disabled";
  if (source.nextEligibleFetch && Date.parse(source.nextEligibleFetch) > now) {
    return `backoff until ${source.nextEligibleFetch}`;
  }
  if (source.lastSuccessfulFetch) {
    const elapsedMin = (now - Date.parse(source.lastSuccessfulFetch)) / 60000;
    if (elapsedMin < source.refreshInterval) {
      return `refreshed ${Math.round(elapsedMin)}m ago (interval ${source.refreshInterval}m)`;
    }
  }
  return null;
}

async function fetchFeed(source: RSSSource): Promise<{
  status: number;
  xml: string;
  etag: string | null;
  lastModified: string | null;
}> {
  const url = buildFeedUrl(source.query, source.language, source.country);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "user-agent": USER_AGENT,
      accept: "application/rss+xml, application/xml, text/xml;q=0.9",
    };
    if (source.etag) headers["if-none-match"] = source.etag;
    if (source.lastModified) headers["if-modified-since"] = source.lastModified;
    const res = await fetch(url, { headers, signal: ctrl.signal, redirect: "error" });
    if (res.status === 304) {
      return { status: 304, xml: "", etag: source.etag ?? null, lastModified: source.lastModified ?? null };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (Number(res.headers.get("content-length") ?? 0) > 2_000_000) throw new Error("Feed too large");
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Empty feed");
    const decoder = new TextDecoder();
    let xml = ""; let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2_000_000) { await reader.cancel(); throw new Error("Feed too large"); }
      xml += decoder.decode(value, { stream: true });
    }
    xml += decoder.decode();
    return {
      status: res.status,
      xml,
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
    };
  } finally {
    clearTimeout(t);
  }
}

function qualityScore(input: { title: string; description: string; entities: number; categoryConfidence: number }): number {
  let s = 50;
  if (input.title.length > 40) s += 10;
  if (input.description.length > 80) s += 10;
  s += Math.min(20, input.entities * 5);
  s += Math.round(input.categoryConfidence / 10);
  return Math.min(100, Math.max(0, s));
}

/**
 * Fetch + process ONE source. Returns quickly on skip (interval/backoff).
 * `force` bypasses the interval check (admin "Test fetch" / "Retry now").
 */
export async function runSource(source: RSSSource, opts: { force?: boolean } = {}): Promise<SourceRunResult> {
  const started = Date.now();
  const base = {
    sourceId: source.id,
    query: source.query,
    processed: 0,
    inserted: 0,
    duplicates: 0,
    validationFailures: 0,
    parseErrors: 0,
    entityMatches: 0,
  };

  if (!opts.force) {
    const skip = eligibleNow(source, started);
    if (skip) {
      return { ...base, ok: true, skipped: skip, ms: Date.now() - started };
    }
  }

  try {
    const feed = await fetchFeed(source);
    if (feed.status === 304) {
      await recordSourceSuccess(source.id, {
        articleCount: await countArticlesBySource(source.id),
        etag: feed.etag,
        lastModified: feed.lastModified,
      });
      await logFetch({ sourceId: source.id, ok: true, processed: 0, inserted: 0, duplicates: 0, ms: Date.now() - started });
      return { ...base, ok: true, notModified: true, ms: Date.now() - started };
    }

    const parsed = parseRss(feed.xml, source.query);
    base.processed = parsed.items.length;
    base.parseErrors = parsed.errors.length + parsed.skipped;

    for (const raw of parsed.items.slice(0, 100)) {
      if (Date.now() - started > 35_000) throw new Error("source processing budget reached; remaining items deferred");
      try {
        // NORMALIZE
        const title = cleanText(raw.title).slice(0, 300);
        const resolvedUrl = await resolvePublisherUrl(raw.link);
        const canonical = canonicalizeUrl(resolvedUrl);
        if (!canonical) {
          base.validationFailures++;
          continue;
        }
        const publicationDate = toIsoDate(raw.pubDate);
        const domain = isGoogleWrapper(resolvedUrl) ? "news.google.com" : extractDomain(resolvedUrl);
        const sourceName = cleanText(raw.sourceName ?? domain).slice(0, 120) || domain;

        // VALIDATE
        const validation = validateArticle({ title, sourceUrl: resolvedUrl, publicationDate });
        if (!validation.valid || !publicationDate) {
          base.validationFailures++;
          continue;
        }

        const relevance = sportsRelevance(title, cleanText(raw.description));
        if (relevance === "reject") { base.validationFailures++; continue; }

        // DEDUPLICATE — L1/L2 global, L3–L5 against the domain window
        const existing = await findByCanonicalUrl(canonical);
        if (existing) {
          base.duplicates++;
          continue;
        }
        const candidate: DedupCandidate = {
          sourceUrl: resolvedUrl,
          canonicalUrl: canonical,
          title,
          description: raw.description,
          sourceDomain: domain,
          publicationDate,
        };
        const window = await recentByDomain(domain, 3, 60);
        let dupOf: string | null = null;
        for (const w of window) {
          const check = checkDuplicate(candidate, w);
          if (check.isDuplicate) {
            dupOf = w.id;
            break;
          }
        }
        if (dupOf) {
          base.duplicates++;
          continue;
        }

        // CATEGORIZE + ENTITY MATCH
        const cat = categorizeArticle(title, raw.description);
        const entities = matchEntities(title, raw.description);
        base.entityMatches += entities.length;

        // STORE (metadata only — never the full body)
        const now = new Date().toISOString();
        const article: NewsArticle = {
          id: randomUUID(),
          title,
          sourceUrl: resolvedUrl.slice(0, 2000),
          canonicalUrl: canonical,
          sourceName,
          sourceDomain: domain,
          publicationDate,
          fetchedDate: now,
          description: raw.description.slice(0, 300),
          category: cat.primary,
          secondaryCategories: cat.secondary,
          categoryConfidence: cat.confidence,
          relatedEntities: entities,
          rssSourceId: source.id,
          fingerprint: fingerprint(canonical, title),
          isDuplicate: false,
          duplicateOf: null,
          qualityScore: qualityScore({
            title,
            description: raw.description,
            entities: entities.length,
            categoryConfidence: cat.confidence,
          }),
          status: relevance === "publish" ? "published" : "hidden",
          sourceBadge: sourceBadge(sourceName),
          createdAt: now,
          updatedAt: now,
        };
        await insertArticle(article);
        base.inserted++;
      } catch (error) {
        if (error instanceof StoreWriteError) throw error;
        base.validationFailures++;
      }
    }

    // Retention is an explicit maintenance operation; ingestion never deletes valid data.
    await recordSourceSuccess(source.id, {
      articleCount: await countArticlesBySource(source.id),
      etag: feed.etag,
      lastModified: feed.lastModified,
    });
    await logFetch({
      sourceId: source.id,
      ok: true,
      processed: base.processed,
      inserted: base.inserted,
      duplicates: base.duplicates,
      ms: Date.now() - started,
    });
    return { ...base, ok: true, ms: Date.now() - started };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const friendly = /abort/i.test(message) ? "timeout after 10s" : message.slice(0, 300);
    await recordSourceFailure(source.id, friendly);
    await logFetch({
      sourceId: source.id,
      ok: false,
      processed: 0,
      inserted: 0,
      duplicates: 0,
      error: friendly,
      ms: Date.now() - started,
    });
    return { ...base, ok: false, error: friendly, ms: Date.now() - started };
  }
}

function isGoogleWrapper(url: string): boolean {
  try {
    return new URL(url).hostname === "news.google.com";
  } catch {
    return false;
  }
}

/** Run every enabled source in priority order. Skips are cheap (no fetch). */
async function ingestSources(opts: { force?: boolean; sourceIds?: string[] } = {}): Promise<IngestStats> {
  const startedAt = new Date().toISOString();
  if (process.env.NEMO_NEWS_DISABLE === "1" && !opts.force) {
    return {
      totalFetches: 0,
      totalProcessed: 0,
      inserted: 0,
      duplicatesRemoved: 0,
      validationFailures: 0,
      parseErrors: 0,
      entityMatches: 0,
      avgProcessingMs: 0,
      perSource: [],
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }
  const t0 = Date.now();
  const sources = (await listSources())
    .filter((s) => s.enabled)
    .filter((s) => !opts.sourceIds || opts.sourceIds.includes(s.id))
    .sort((a, b) => (a.lastSuccessfulFetch ?? "").localeCompare(b.lastSuccessfulFetch ?? "") || a.priority - b.priority);

  const perSource: IngestStats["perSource"] = [];
  let totalProcessed = 0;
  let inserted = 0;
  let duplicatesRemoved = 0;
  let validationFailures = 0;
  let parseErrors = 0;
  let entityMatches = 0;
  let totalFetches = 0;

  for (const source of sources) {
    if (Date.now() - t0 > 40_000) break; // leave headroom under the route duration budget
    const r = await runSource(source, { force: opts.force });
    if (!r.skipped) totalFetches++;
    totalProcessed += r.processed;
    inserted += r.inserted;
    duplicatesRemoved += r.duplicates;
    validationFailures += r.validationFailures;
    parseErrors += r.parseErrors;
    entityMatches += r.entityMatches;
    perSource.push({
      sourceId: r.sourceId,
      query: r.query,
      ok: r.ok,
      processed: r.processed,
      inserted: r.inserted,
      duplicates: r.duplicates,
      ...(r.error ? { error: r.error } : {}),
      ...(r.skipped ? { error: `skipped: ${r.skipped}` } : {}),
      ms: r.ms,
    });
  }

  const ms = Date.now() - t0;
  return {
    totalFetches,
    totalProcessed,
    inserted,
    duplicatesRemoved,
    validationFailures,
    parseErrors,
    entityMatches,
    avgProcessingMs: totalProcessed ? Math.round(ms / Math.max(1, totalProcessed)) : 0,
    perSource,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

let ingestion: Promise<IngestStats> | null = null;
/** One job per process and one transaction-scoped lock across DB replicas.
 * The lock is released on disconnect/rollback, including serverless shutdown.
 */
export function ingestAllSources(opts: { force?: boolean; sourceIds?: string[] } = {}): Promise<IngestStats> {
  if (ingestion) return ingestion;
  ingestion = (async () => {
    const db = await getDb();
    if (!db) {
      if (process.env.NODE_ENV === "production") throw new Error("Durable news storage is required");
      return ingestSources(opts);
    }
    return db.transaction(async (tx) => {
      const [lock] = await tx.select<{ locked: boolean }>("SELECT pg_try_advisory_xact_lock(76321941) AS locked", []);
      if (!lock?.locked) throw new Error("News ingestion is already running");
      return ingestSources(opts);
    });
  })().finally(() => { ingestion = null; });
  return ingestion;
}
