import { persistOrThrow, StoreWriteError, STORE_WRITE_FAILED_AR } from "@/lib/db/store-policy";
/**
 * NEMO Sports · news store (Postgres when configured, memory otherwise)
 * ─────────────────────────────────────────────────────────────────────
 * Same graceful-degradation contract as the rest of the platform: boots
 * without DATABASE_URL (in-process memory, lost on restart) and persists
 * when it is set. Schema is created idempotently on first use so a fresh
 * free-tier Postgres works with zero manual steps; db/migration-0002-news.sql
 * holds the same DDL for `npm run db:setup` review.
 */

import { getDb, sanitizeDbMessage } from "@/lib/db/pg";
import { defaultSources } from "./sources";
import type { NewsArticle, NewsEntityRef, RSSSource } from "./types";

export const MAX_ARTICLES_PER_SOURCE = 100;
export const MAX_ARTICLE_AGE_DAYS = 30;

const DDL = `
CREATE TABLE IF NOT EXISTS rss_sources (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  country TEXT NOT NULL DEFAULT 'US',
  category TEXT,
  priority INTEGER NOT NULL DEFAULT 2,
  enabled BOOLEAN NOT NULL DEFAULT true,
  refresh_interval_minutes INTEGER NOT NULL DEFAULT 30,
  last_successful_fetch TIMESTAMPTZ,
  last_failed_fetch TIMESTAMPTZ,
  last_error TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  next_eligible_fetch TIMESTAMPTZ,
  article_count INTEGER NOT NULL DEFAULT 0,
  etag TEXT,
  last_modified TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS news_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  canonical_url TEXT NOT NULL UNIQUE,
  source_name TEXT NOT NULL,
  source_domain TEXT NOT NULL,
  publication_date TIMESTAMPTZ NOT NULL,
  fetched_date TIMESTAMPTZ NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Sports',
  secondary_categories TEXT[] NOT NULL DEFAULT '{}',
  category_confidence INTEGER NOT NULL DEFAULT 0,
  related_entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  rss_source_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  is_duplicate BOOLEAN NOT NULL DEFAULT false,
  duplicate_of TEXT,
  quality_score INTEGER NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'published',
  source_badge TEXT NOT NULL DEFAULT '📰',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_news_category ON news_articles(category);
CREATE INDEX IF NOT EXISTS idx_news_status ON news_articles(status);
CREATE INDEX IF NOT EXISTS idx_news_date ON news_articles(publication_date DESC);
CREATE INDEX IF NOT EXISTS idx_news_domain_date ON news_articles(source_domain, publication_date DESC);
CREATE INDEX IF NOT EXISTS idx_news_fingerprint ON news_articles(fingerprint);
CREATE TABLE IF NOT EXISTS news_fetch_log (
  id BIGSERIAL PRIMARY KEY,
  source_id TEXT NOT NULL,
  ok BOOLEAN NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  inserted INTEGER NOT NULL DEFAULT 0,
  duplicates INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fetch_log_day ON news_fetch_log(created_at DESC);
`;

/* ── memory fallback ─────────────────────────────────────────── */

const memSources = new Map<string, RSSSource>();
const memArticles = new Map<string, NewsArticle>(); // id → article
const memByCanonical = new Map<string, string>(); // canonicalUrl → id
let memSeeded = false;
let memDaily = { day: "", processed: 0, duplicates: 0 };

function seedMemory(): void {
  if (memSeeded) return;
  memSeeded = true;
  for (const s of defaultSources()) memSources.set(s.id, { ...s });
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function bumpDaily(processed: number, duplicates: number): void {
  const day = todayKey();
  if (memDaily.day !== day) memDaily = { day, processed: 0, duplicates: 0 };
  memDaily.processed += processed;
  memDaily.duplicates += duplicates;
}

/* ── row mapping ─────────────────────────────────────────────── */

type SourceRow = Record<string, unknown>;
type ArticleRow = Record<string, unknown>;

const str = (v: unknown): string => String(v ?? "");
const num = (v: unknown, d = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const iso = (v: unknown): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isFinite(+d) ? d.toISOString() : null;
};

function sourceFromRow(r: SourceRow): RSSSource {
  const now = new Date().toISOString();
  return {
    id: str(r.id),
    query: str(r.query),
    language: (r.language === "ar" ? "ar" : "en"),
    country: (str(r.country) || "US") as RSSSource["country"],
    category: (r.category as string) ?? undefined,
    priority: num(r.priority, 2),
    enabled: r.enabled !== false,
    refreshInterval: num(r.refresh_interval_minutes, 30),
    lastSuccessfulFetch: iso(r.last_successful_fetch),
    lastFailedFetch: iso(r.last_failed_fetch),
    lastError: (r.last_error as string) ?? null,
    failureCount: num(r.failure_count),
    consecutiveFailures: num(r.consecutive_failures),
    nextEligibleFetch: iso(r.next_eligible_fetch),
    articleCount: num(r.article_count),
    etag: (r.etag as string) ?? null,
    lastModified: (r.last_modified as string) ?? null,
    createdAt: iso(r.created_at) ?? now,
    updatedAt: iso(r.updated_at) ?? now,
  };
}

function articleFromRow(r: ArticleRow): NewsArticle {
  const now = new Date().toISOString();
  let entities: NewsEntityRef[] = [];
  try {
    const raw = r.related_entities;
    entities = Array.isArray(raw) ? (raw as NewsEntityRef[]) : JSON.parse(String(raw ?? "[]"));
  } catch {
    entities = [];
  }
  return {
    id: str(r.id),
    title: str(r.title),
    sourceUrl: str(r.source_url),
    canonicalUrl: str(r.canonical_url),
    sourceName: str(r.source_name),
    sourceDomain: str(r.source_domain),
    publicationDate: iso(r.publication_date) ?? now,
    fetchedDate: iso(r.fetched_date) ?? now,
    description: str(r.description),
    category: str(r.category) || "Sports",
    secondaryCategories: Array.isArray(r.secondary_categories) ? (r.secondary_categories as string[]) : [],
    categoryConfidence: num(r.category_confidence),
    relatedEntities: entities,
    rssSourceId: str(r.rss_source_id),
    fingerprint: str(r.fingerprint),
    isDuplicate: r.is_duplicate === true,
    duplicateOf: (r.duplicate_of as string) ?? null,
    qualityScore: num(r.quality_score, 50),
    status: (str(r.status) as NewsArticle["status"]) || "published",
    sourceBadge: str(r.source_badge) || "📰",
    createdAt: iso(r.created_at) ?? now,
    updatedAt: iso(r.updated_at) ?? now,
  };
}

/* ── backend detection ───────────────────────────────────────── */

let schemaEnsured = false;
let warnedUnusable = false;

/**
 * DATABASE_URL set but unusable (wrong host/port/password, unreachable, no
 * driver). Without this warning the store silently serves memory: the admin
 * sees "success" and the data disappears on the next restart.
 */
function warnUnusable(reason: string) {
  if (warnedUnusable) return;
  warnedUnusable = true;
  console.error(`[news] DATABASE_URL is set but Postgres is unusable; durable writes are refused. ${reason}`);
}

async function pg() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const db = await getDb();
    if (!db) {
      warnUnusable("driver or connection could not start");
      return null;
    }
    if (!schemaEnsured) {
      schemaEnsured = true;
      try {
        // Split: pg driver runs one statement per call.
        for (const stmt of DDL.split(";").map((s) => s.trim()).filter(Boolean)) {
          await db.run(stmt, []);
        }
        // Seed default sources on a fresh database.
        const existing = await db.select<{ c: string }>("SELECT COUNT(*)::text AS c FROM rss_sources", []);
        if (existing[0]?.c === "0") {
          for (const s of defaultSources()) {
            await db.run(
              `INSERT INTO rss_sources (id, query, language, country, category, priority, enabled, refresh_interval_minutes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
              [s.id, s.query, s.language, s.country, s.category ?? null, s.priority, s.enabled, s.refreshInterval],
            );
          }
        }
      } catch (e) {
        // A read-only / restricted DB must not break reads; fall through to memory.
        warnUnusable(sanitizeDbMessage(e instanceof Error ? e.message : String(e)));
        return null;
      }
    }
    return db;
  } catch (e) {
    warnUnusable(sanitizeDbMessage(e instanceof Error ? e.message : String(e)));
    return null;
  }
}

export async function newsBackend(): Promise<"postgres" | "memory"> {
  return (await pg()) ? "postgres" : "memory";
}

/* ── sources ─────────────────────────────────────────────────── */

export async function listSources(): Promise<RSSSource[]> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<SourceRow>(
        "SELECT * FROM rss_sources ORDER BY priority ASC, query ASC", [],
      );
      return rows.map(sourceFromRow);
    } catch {
      // fall through to memory
    }
  }
  seedMemory();
  return [...memSources.values()].sort((a, b) => a.priority - b.priority || a.query.localeCompare(b.query));
}

export async function getSource(id: string): Promise<RSSSource | null> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<SourceRow>("SELECT * FROM rss_sources WHERE id = $1", [id]);
      return rows[0] ? sourceFromRow(rows[0]) : null;
    } catch {
      // fall through
    }
  }
  seedMemory();
  return memSources.get(id) ?? null;
}

export interface SourceInput {
  query: string;
  language?: "en" | "ar";
  country?: string;
  category?: string;
  priority?: number;
  enabled?: boolean;
  refreshInterval?: number;
}

function newSourceId(query: string, country: string, language: string): string {
  const slug = `${query}-${country}-${language}-${Date.now().toString(36)}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `rss_${slug}`;
}

function validateSourceInput(input: Partial<SourceInput>): void {
  if (input.query !== undefined && (!input.query.trim() || input.query.length > 200)) throw new Error("Invalid source query");
  if (input.country !== undefined && !["US", "EG", "GB", "ES", "IT", "SA", "AE", "FR", "DE"].includes(input.country.toUpperCase())) throw new Error("Invalid source country");
  if (input.language !== undefined && !["ar", "en"].includes(input.language)) throw new Error("Invalid source language");
  for (const value of [input.priority, input.refreshInterval]) if (value !== undefined && !Number.isFinite(value)) throw new Error("Invalid source interval or priority");
}

export async function createSource(input: SourceInput): Promise<RSSSource> {
  validateSourceInput(input);
  const now = new Date().toISOString();
  const s: RSSSource = {
    id: newSourceId(input.query, input.country ?? "US", input.language ?? "en"),
    query: input.query.trim().slice(0, 200),
    language: input.language === "ar" ? "ar" : "en",
    country: (input.country ?? "US").toUpperCase().slice(0, 4) as RSSSource["country"],
    category: input.category?.slice(0, 80) || undefined,
    priority: Math.min(5, Math.max(1, input.priority ?? 3)),
    enabled: input.enabled !== false,
    refreshInterval: Math.min(1440, Math.max(5, input.refreshInterval ?? 30)),
    lastSuccessfulFetch: null,
    lastFailedFetch: null,
    lastError: null,
    failureCount: 0,
    consecutiveFailures: 0,
    nextEligibleFetch: null,
    articleCount: 0,
    etag: null,
    lastModified: null,
    createdAt: now,
    updatedAt: now,
  };
  const db = await pg();
  if (!db) await persistOrThrow(null, async () => {});
  if (db) {
    try {
      await db.run(
        `INSERT INTO rss_sources (id, query, language, country, category, priority, enabled, refresh_interval_minutes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [s.id, s.query, s.language, s.country, s.category ?? null, s.priority, s.enabled, s.refreshInterval],
      );
      return s;
    } catch {
      // fall through to memory
    }
  }
  seedMemory();
  memSources.set(s.id, s);
  return s;
}

export async function updateSource(id: string, patch: Partial<SourceInput>): Promise<RSSSource | null> {
  validateSourceInput(patch);
  const db = await pg();
  if (!db) await persistOrThrow(null, async () => {});
  if (db) {
    try {
      const cur = await getSource(id);
      if (!cur) return null;
      const next: RSSSource = {
        ...cur,
        ...(patch.query ? { query: patch.query.trim().slice(0, 200) } : {}),
        ...(patch.language ? { language: patch.language } : {}),
        ...(patch.country ? { country: patch.country.toUpperCase().slice(0, 4) as RSSSource["country"] } : {}),
        ...(patch.category !== undefined ? { category: patch.category?.slice(0, 80) || undefined } : {}),
        ...(patch.priority !== undefined ? { priority: Math.min(5, Math.max(1, patch.priority)) } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.refreshInterval !== undefined
          ? { refreshInterval: Math.min(1440, Math.max(5, patch.refreshInterval)) }
          : {}),
        updatedAt: new Date().toISOString(),
      };
      await db.run(
        `UPDATE rss_sources SET query=$2, language=$3, country=$4, category=$5, priority=$6,
         enabled=$7, refresh_interval_minutes=$8, updated_at=now() WHERE id=$1`,
        [id, next.query, next.language, next.country, next.category ?? null, next.priority, next.enabled, next.refreshInterval],
      );
      return next;
    } catch {
      throw new StoreWriteError(STORE_WRITE_FAILED_AR);
    }
  }
  seedMemory();
  const cur = memSources.get(id);
  if (!cur) return null;
  const next: RSSSource = {
    ...cur,
    ...(patch.query ? { query: patch.query.trim().slice(0, 200) } : {}),
    ...(patch.language ? { language: patch.language } : {}),
    ...(patch.country ? { country: patch.country.toUpperCase().slice(0, 4) as RSSSource["country"] } : {}),
    ...(patch.category !== undefined ? { category: patch.category?.slice(0, 80) || undefined } : {}),
    ...(patch.priority !== undefined ? { priority: Math.min(5, Math.max(1, patch.priority)) } : {}),
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    ...(patch.refreshInterval !== undefined
      ? { refreshInterval: Math.min(1440, Math.max(5, patch.refreshInterval)) }
      : {}),
    updatedAt: new Date().toISOString(),
  };
  memSources.set(id, next);
  return next;
}

export async function deleteSource(id: string): Promise<boolean> {
  const db = await pg();
  if (!db) await persistOrThrow(null, async () => {});
  if (db) {
    try {
      await db.run("DELETE FROM rss_sources WHERE id = $1", [id]);
      return true;
    } catch {
      throw new StoreWriteError(STORE_WRITE_FAILED_AR);
    }
  }
  seedMemory();
  return memSources.delete(id);
}

export async function recordSourceSuccess(
  id: string,
  info: { articleCount: number; etag?: string | null; lastModified?: string | null },
): Promise<void> {
  const db = await pg();
  if (!db) await persistOrThrow(null, async () => {});
  if (db) {
    try {
      await db.run(
        `UPDATE rss_sources SET last_successful_fetch=now(), consecutive_failures=0,
         article_count=$2, etag=$3, last_modified=$4, next_eligible_fetch=NULL, updated_at=now() WHERE id=$1`,
        [id, info.articleCount, info.etag ?? null, info.lastModified ?? null],
      );
      return;
    } catch {
      throw new StoreWriteError(STORE_WRITE_FAILED_AR);
    }
  }
  seedMemory();
  const s = memSources.get(id);
  if (s) {
    memSources.set(id, {
      ...s,
      lastSuccessfulFetch: new Date().toISOString(),
      consecutiveFailures: 0,
      articleCount: info.articleCount,
      etag: info.etag ?? null,
      lastModified: info.lastModified ?? null,
      nextEligibleFetch: null,
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function recordSourceFailure(id: string, error: string): Promise<void> {
  // Exponential backoff: 5 → 10 → 20 → 30 (cap) minutes.
  const db = await pg();
  if (!db) await persistOrThrow(null, async () => {});
  if (db) {
    try {
      const rows = await db.select<{ consecutive_failures: number }>(
        "SELECT consecutive_failures FROM rss_sources WHERE id = $1", [id],
      );
      const consecutive = (Number(rows[0]?.consecutive_failures) || 0) + 1;
      const backoffMin = Math.min(30, 5 * 2 ** Math.min(consecutive - 1, 3));
      await db.run(
        `UPDATE rss_sources SET last_failed_fetch=now(), last_error=$2,
         failure_count=failure_count+1, consecutive_failures=$3,
         next_eligible_fetch=now() + make_interval(mins => $4), updated_at=now() WHERE id=$1`,
        [id, error.slice(0, 500), consecutive, backoffMin],
      );
      return;
    } catch {
      throw new StoreWriteError(STORE_WRITE_FAILED_AR);
    }
  }
  seedMemory();
  const s = memSources.get(id);
  if (s) {
    const consecutive = s.consecutiveFailures + 1;
    const backoffMin = Math.min(30, 5 * 2 ** Math.min(consecutive - 1, 3));
    memSources.set(id, {
      ...s,
      lastFailedFetch: new Date().toISOString(),
      lastError: error.slice(0, 500),
      failureCount: s.failureCount + 1,
      consecutiveFailures: consecutive,
      nextEligibleFetch: new Date(Date.now() + backoffMin * 60000).toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
}

/* ── articles ────────────────────────────────────────────────── */

export interface ArticleFilter {
  category?: string;
  team?: string;
  player?: string;
  competition?: string;
  sourceId?: string;
  status?: NewsArticle["status"];
  limit?: number;
  offset?: number;
  /** include hidden/archived (admin) */
  includeNonPublished?: boolean;
}

export async function findByCanonicalUrl(canonicalUrl: string): Promise<NewsArticle | null> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<ArticleRow>("SELECT * FROM news_articles WHERE canonical_url = $1", [canonicalUrl]);
      return rows[0] ? articleFromRow(rows[0]) : null;
    } catch {
      // fall through
    }
  }
  seedMemory();
  const id = memByCanonical.get(canonicalUrl);
  return id ? memArticles.get(id) ?? null : null;
}

/** Recent articles from the same domain — the dedup comparison window. */
export async function recentByDomain(domain: string, days = 3, limit = 60): Promise<NewsArticle[]> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<ArticleRow>(
        `SELECT * FROM news_articles WHERE source_domain = $1
         AND publication_date > now() - make_interval(days => $2)
         ORDER BY publication_date DESC LIMIT $3`,
        [domain, days, limit],
      );
      return rows.map(articleFromRow);
    } catch {
      // fall through
    }
  }
  seedMemory();
  const cutoff = Date.now() - days * 86400_000;
  return [...memArticles.values()]
    .filter((a) => a.sourceDomain === domain && Date.parse(a.publicationDate) > cutoff)
    .sort((a, b) => +new Date(b.publicationDate) - +new Date(a.publicationDate))
    .slice(0, limit);
}

export async function insertArticle(a: NewsArticle): Promise<void> {
  const db = await pg();
  if (!db) await persistOrThrow(null, async () => {});
  if (db) {
    try {
      await db.run(
        `INSERT INTO news_articles (id, title, source_url, canonical_url, source_name, source_domain,
          publication_date, fetched_date, description, category, secondary_categories, category_confidence,
          related_entities, rss_source_id, fingerprint, is_duplicate, duplicate_of, quality_score, status, source_badge)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         ON CONFLICT (canonical_url) DO NOTHING`,
        [
          a.id, a.title, a.sourceUrl, a.canonicalUrl, a.sourceName, a.sourceDomain,
          a.publicationDate, a.fetchedDate, a.description, a.category, a.secondaryCategories,
          a.categoryConfidence, JSON.stringify(a.relatedEntities), a.rssSourceId, a.fingerprint,
          a.isDuplicate, a.duplicateOf ?? null, a.qualityScore, a.status, a.sourceBadge,
        ],
      );
      return;
    } catch {
      throw new StoreWriteError(STORE_WRITE_FAILED_AR);
    }
  }
  seedMemory();
  if (memByCanonical.has(a.canonicalUrl)) return;
  memArticles.set(a.id, a);
  memByCanonical.set(a.canonicalUrl, a.id);
}

export async function listArticles(f: ArticleFilter = {}): Promise<{ items: NewsArticle[]; total: number }> {
  const limit = Math.min(100, Math.max(1, f.limit ?? 24));
  const offset = Math.max(0, f.offset ?? 0);
  const db = await pg();
  if (db) {
    try {
      const where: string[] = [];
      const params: unknown[] = [];
      const push = (sql: string, v: unknown) => {
        params.push(v);
        where.push(sql.replace("?", `$${params.length}`));
      };
      if (!f.includeNonPublished) push("status = ?", "published");
      else if (f.status) push("status = ?", f.status);
      if (f.category) push("category = ?", f.category);
      if (f.sourceId) push("rss_source_id = ?", f.sourceId);
      if (f.team) push("related_entities @> ?", JSON.stringify([{ type: "team", internalId: f.team }]));
      if (f.player) push("related_entities @> ?", JSON.stringify([{ type: "player", internalId: f.player }]));
      if (f.competition) push("related_entities @> ?", JSON.stringify([{ type: "competition", internalId: f.competition }]));
      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const totalRows = await db.select<{ c: string }>(`SELECT COUNT(*)::text AS c FROM news_articles ${whereSql}`, params);
      const rows = await db.select<ArticleRow>(
        `SELECT * FROM news_articles ${whereSql} ORDER BY publication_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );
      return { items: rows.map(articleFromRow), total: Number(totalRows[0]?.c ?? 0) };
    } catch {
      // fall through
    }
  }
  seedMemory();
  let items = [...memArticles.values()];
  if (!f.includeNonPublished) items = items.filter((a) => a.status === "published");
  else if (f.status) items = items.filter((a) => a.status === f.status);
  if (f.category) items = items.filter((a) => a.category === f.category);
  if (f.sourceId) items = items.filter((a) => a.rssSourceId === f.sourceId);
  if (f.team) items = items.filter((a) => a.relatedEntities.some((e) => e.type === "team" && e.internalId === f.team));
  if (f.player) items = items.filter((a) => a.relatedEntities.some((e) => e.type === "player" && e.internalId === f.player));
  if (f.competition) items = items.filter((a) => a.relatedEntities.some((e) => e.type === "competition" && e.internalId === f.competition));
  items.sort((a, b) => +new Date(b.publicationDate) - +new Date(a.publicationDate));
  const total = items.length;
  return { items: items.slice(offset, offset + limit), total };
}

export async function getArticle(id: string): Promise<NewsArticle | null> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<ArticleRow>("SELECT * FROM news_articles WHERE id = $1", [id]);
      return rows[0] ? articleFromRow(rows[0]) : null;
    } catch {
      // fall through
    }
  }
  seedMemory();
  return memArticles.get(id) ?? null;
}

export async function setArticleStatus(id: string, status: NewsArticle["status"]): Promise<boolean> {
  const db = await pg();
  if (!db) await persistOrThrow(null, async () => {});
  if (db) {
    try {
      await db.run("UPDATE news_articles SET status = $2, updated_at = now() WHERE id = $1", [id, status]);
      return true;
    } catch {
      throw new StoreWriteError(STORE_WRITE_FAILED_AR);
    }
  }
  seedMemory();
  const a = memArticles.get(id);
  if (!a) return false;
  memArticles.set(id, { ...a, status, updatedAt: new Date().toISOString() });
  return true;
}

export async function deleteArticle(id: string): Promise<boolean> {
  const db = await pg();
  if (!db) await persistOrThrow(null, async () => {});
  if (db) {
    try {
      await db.run("DELETE FROM news_articles WHERE id = $1", [id]);
      return true;
    } catch {
      throw new StoreWriteError(STORE_WRITE_FAILED_AR);
    }
  }
  seedMemory();
  const a = memArticles.get(id);
  if (!a) return false;
  memArticles.delete(id);
  memByCanonical.delete(a.canonicalUrl);
  return true;
}

export async function countArticlesBySource(sourceId: string): Promise<number> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<{ c: string }>(
        "SELECT COUNT(*)::text AS c FROM news_articles WHERE rss_source_id = $1 AND status = 'published'", [sourceId],
      );
      return Number(rows[0]?.c ?? 0);
    } catch {
      // fall through
    }
  }
  seedMemory();
  return [...memArticles.values()].filter((a) => a.rssSourceId === sourceId && a.status === "published").length;
}

/** Enforce per-source cap + retention. Returns removed count. */
export async function pruneSource(sourceId: string): Promise<number> {
  const db = await pg();
  if (!db) await persistOrThrow(null, async () => {});
  if (db) {
    try {
      await db.run(
        `DELETE FROM news_articles WHERE rss_source_id = $1
         AND publication_date < now() - make_interval(days => $2)`,
        [sourceId, MAX_ARTICLE_AGE_DAYS],
      );
      const rows = await db.select<{ id: string }>(
        `SELECT id FROM news_articles WHERE rss_source_id = $1
         ORDER BY publication_date DESC OFFSET $2`,
        [sourceId, MAX_ARTICLES_PER_SOURCE],
      );
      for (const r of rows) await db.run("DELETE FROM news_articles WHERE id = $1", [r.id]);
      return rows.length;
    } catch {
      throw new StoreWriteError(STORE_WRITE_FAILED_AR);
    }
  }
  seedMemory();
  const cutoff = Date.now() - MAX_ARTICLE_AGE_DAYS * 86400_000;
  let removed = 0;
  const mine = [...memArticles.values()]
    .filter((a) => a.rssSourceId === sourceId)
    .sort((a, b) => +new Date(b.publicationDate) - +new Date(a.publicationDate));
  for (const a of mine) {
    if (Date.parse(a.publicationDate) < cutoff) {
      memArticles.delete(a.id);
      memByCanonical.delete(a.canonicalUrl);
      removed++;
    }
  }
  const rest = [...memArticles.values()]
    .filter((a) => a.rssSourceId === sourceId)
    .sort((a, b) => +new Date(b.publicationDate) - +new Date(a.publicationDate));
  for (const a of rest.slice(MAX_ARTICLES_PER_SOURCE)) {
    memArticles.delete(a.id);
    memByCanonical.delete(a.canonicalUrl);
    removed++;
  }
  return removed;
}

/* ── fetch log / stats ───────────────────────────────────────── */

export async function logFetch(entry: {
  sourceId: string;
  ok: boolean;
  processed: number;
  inserted: number;
  duplicates: number;
  error?: string;
  ms: number;
}): Promise<void> {
  bumpDaily(entry.processed, entry.duplicates);
  const db = await pg();
  if (!db) return;
  try {
    await db.run(
      `INSERT INTO news_fetch_log (source_id, ok, processed, inserted, duplicates, error, duration_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [entry.sourceId, entry.ok, entry.processed, entry.inserted, entry.duplicates, entry.error?.slice(0, 500) ?? null, entry.ms],
    );
    // Keep the log small on free-tier Postgres.
    await db.run(
      `DELETE FROM news_fetch_log WHERE id NOT IN (SELECT id FROM news_fetch_log ORDER BY id DESC LIMIT 2000)`,
      [],
    );
  } catch {
    // logging must never break ingestion
  }
}

export async function fetchStats(days = 7): Promise<{ processed: number; duplicates: number; fetches: number }> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<{ p: string; d: string; f: string }>(
        `SELECT COALESCE(SUM(processed),0)::text AS p, COALESCE(SUM(duplicates),0)::text AS d,
                COUNT(*)::text AS f FROM news_fetch_log
         WHERE created_at > now() - make_interval(days => $1)`,
        [days],
      );
      return {
        processed: Number(rows[0]?.p ?? 0),
        duplicates: Number(rows[0]?.d ?? 0),
        fetches: Number(rows[0]?.f ?? 0),
      };
    } catch {
      // fall through
    }
  }
  return { processed: memDaily.processed, duplicates: memDaily.duplicates, fetches: 0 };
}

export async function recentFetchLog(limit = 20): Promise<
  { sourceId: string; ok: boolean; processed: number; inserted: number; duplicates: number; error: string | null; at: string }[]
> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<Record<string, unknown>>(
        "SELECT source_id, ok, processed, inserted, duplicates, error, created_at FROM news_fetch_log ORDER BY id DESC LIMIT $1",
        [limit],
      );
      return rows.map((r) => ({
        sourceId: str(r.source_id),
        ok: r.ok === true,
        processed: num(r.processed),
        inserted: num(r.inserted),
        duplicates: num(r.duplicates),
        error: (r.error as string) ?? null,
        at: iso(r.created_at) ?? new Date().toISOString(),
      }));
    } catch {
      return [];
    }
  }
  return [];
}

/** Distinct categories currently in the feed (for filter chips). */
export async function feedCategories(): Promise<{ name: string; count: number }[]> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<{ category: string; c: string }>(
        `SELECT category, COUNT(*)::text AS c FROM news_articles
         WHERE status = 'published' GROUP BY category ORDER BY COUNT(*) DESC LIMIT 30`,
        [],
      );
      return rows.map((r) => ({ name: r.category, count: Number(r.c) }));
    } catch {
      // fall through
    }
  }
  seedMemory();
  const counts = new Map<string, number>();
  for (const a of memArticles.values()) {
    if (a.status !== "published") continue;
    counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
}
