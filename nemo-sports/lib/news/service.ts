/** Public read path: moderation-consistent store reads, honest source-check freshness.
 * Updates run only through awaited cron/admin jobs, never fire-and-forget.
 */
import { feedCategories, listArticles, listSources, type ArticleFilter } from "./store";
import { sourceFreshness } from "./freshness";
import type { NewsArticle } from "./types";

/** Baseline age (minutes) used by the freshness rule; see lib/news/freshness.ts. */
export { FRESHNESS_FLOOR_MIN as FEED_STALE_AFTER_MIN } from "./freshness";

export interface NewsFeed {
  items: NewsArticle[];
  total: number;
  /** most recent successful source check (ISO) — for "last updated" UI */
  lastUpdated: string | null;
  /** true when at least one enabled source is not fresh (see sourceFreshness) */
  stale: boolean;
  categories: { name: string; count: number }[];
}

export async function getNewsFeed(filter: ArticleFilter = {}): Promise<NewsFeed> {
  // Read the durable store directly: moderation must survive replica changes
  // and cannot remain visible in a five-minute per-process feed cache.
  const { items, total } = await listArticles({ ...filter, limit: filter.limit ?? 24 });
  return buildFeed(items, total);
}

async function buildFeed(items: NewsArticle[], total: number): Promise<NewsFeed> {
  const health = await newsHealthSummary();
  const lastUpdated = health.lastFetchAt;
  const sources = (await listSources()).filter((s) => s.enabled);
  const now = Date.now();
  const stale = sources.length === 0 || sources.some((s) => sourceFreshness(s, now) !== "fresh");
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
