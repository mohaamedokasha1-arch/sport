/**
 * NEMO Sports · news service (public read path)
 * ─────────────────────────────────────────────
 * Cache-based lazy refresh: the public feed never blocks on RSS. If the
 * newest article is older than `FEED_STALE_AFTER_MIN`, one background
 * refresh is kicked off (coalesced per process) while the cached feed is
 * served immediately with its staleness disclosed.
 *
 * On Vercel, /api/cron/fetch-news keeps the store warm; this fallback keeps
 * every other host (and Hobby-plan cron limits) working with zero config.
 */

import { ingestAllSources } from "./pipeline";
import { feedCategories, listArticles, listSources, type ArticleFilter } from "./store";
import type { NewsArticle } from "./types";

export const FEED_STALE_AFTER_MIN = 30;

/** In-memory feed cache: key → { data, fetchedAt }. */
const feedCache = new Map<string, { items: NewsArticle[]; total: number; fetchedAt: number }>();
const FEED_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

let refreshInFlight: Promise<unknown> | null = null;
let lastRefreshAt = 0;
const REFRESH_COALESCE_MS = 60_000; // max one background refresh per minute

function cacheKey(f: ArticleFilter): string {
  return JSON.stringify({
    c: f.category ?? "",
    t: f.team ?? "",
    p: f.player ?? "",
    comp: f.competition ?? "",
    l: f.limit ?? 24,
    o: f.offset ?? 0,
  });
}

async function maybeRefresh(): Promise<void> {
  const now = Date.now();
  if (refreshInFlight || now - lastRefreshAt < REFRESH_COALESCE_MS) return;
  lastRefreshAt = now;
  refreshInFlight = ingestAllSources()
    .catch(() => {})
    .finally(() => {
      refreshInFlight = null;
      feedCache.clear(); // refreshed store → drop cached feeds
    });
  // Intentionally not awaited: serve cache now, refresh behind.
  void refreshInFlight;
}

export interface NewsFeed {
  items: NewsArticle[];
  total: number;
  /** newest article's fetch time (ISO) — for "last updated" UI */
  lastUpdated: string | null;
  /** true when the feed is older than FEED_STALE_AFTER_MIN */
  stale: boolean;
  categories: { name: string; count: number }[];
}

export async function getNewsFeed(filter: ArticleFilter = {}): Promise<NewsFeed> {
  const key = cacheKey(filter);
  const now = Date.now();
  const cached = feedCache.get(key);
  if (cached && now - cached.fetchedAt < FEED_CACHE_TTL_MS) {
    return buildFeed(cached.items, cached.total);
  }

  const { items, total } = await listArticles({ ...filter, limit: filter.limit ?? 24 });
  feedCache.set(key, { items, total, fetchedAt: now });

  // Staleness check on the GLOBAL newest article, not this slice.
  const newest = await listArticles({ limit: 1 });
  const newestAt = newest.items[0]?.fetchedDate ?? null;
  const ageMin = newestAt ? (now - Date.parse(newestAt)) / 60000 : Infinity;
  if (ageMin > FEED_STALE_AFTER_MIN) void maybeRefresh();

  return buildFeed(items, total);
}

async function buildFeed(items: NewsArticle[], total: number): Promise<NewsFeed> {
  const newest = await listArticles({ limit: 1 });
  const lastUpdated = newest.items[0]?.fetchedDate ?? null;
  const stale = lastUpdated ? Date.now() - Date.parse(lastUpdated) > FEED_STALE_AFTER_MIN * 60000 : true;
  const categories = await feedCategories();
  return { items, total, lastUpdated, stale, categories };
}

/** Articles linked to one entity (team/player/competition page cross-refs). */
export async function getNewsForEntity(
  kind: "team" | "player" | "competition",
  internalId: string,
  limit = 5,
): Promise<NewsArticle[]> {
  const f: ArticleFilter = { limit };
  if (kind === "team") f.team = internalId;
  else if (kind === "player") f.player = internalId;
  else f.competition = internalId;
  const { items } = await listArticles(f);
  return items;
}

export async function newsHealthSummary(): Promise<{
  sourcesTotal: number;
  sourcesEnabled: number;
  sourcesHealthy: number;
  lastFetchAt: string | null;
}> {
  const sources = await listSources();
  const enabled = sources.filter((s) => s.enabled);
  const healthy = enabled.filter((s) => s.consecutiveFailures === 0);
  const lastFetchAt =
    enabled
      .map((s) => s.lastSuccessfulFetch)
      .filter((x): x is string => !!x)
      .sort()
      .pop() ?? null;
  return {
    sourcesTotal: sources.length,
    sourcesEnabled: enabled.length,
    sourcesHealthy: healthy.length,
    lastFetchAt,
  };
}
