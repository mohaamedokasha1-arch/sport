/** Public read path: moderation-consistent store reads, honest source-check freshness.
 * Updates run only through awaited cron/admin jobs, never fire-and-forget.
 */
import { feedCategories, listArticles, listSources, type ArticleFilter } from "./store";
import { allowedAgeMinutes, sourceFreshness, type SourceFreshness } from "./freshness";
import { schedulerCadence, type SchedulerCadence } from "./schedule";
import type { NewsArticle, RSSSource } from "./types";

/** Baseline age (minutes) used by the freshness rule; see lib/news/freshness.ts. */
export { FRESHNESS_FLOOR_MIN as FEED_STALE_AFTER_MIN } from "./freshness";

/**
 * Feed-level freshness. A successful update and a failed attempt are reported
 * separately: production showed 13 items and no update time at all, and the
 * old metadata could not tell "never succeeded" from "last run failed" from
 * "nothing ran".
 */
export interface NewsFreshness {
  /**
   * fresh      — every enabled source succeeded within its allowed age
   * stale      — at least one source is older than allowed (or never ran) and the last attempt did not fail
   * failing    — the most recent attempt failed after the last success
   * never      — no source has ever completed a successful fetch
   * no_sources — no enabled source is configured
   */
  state: "fresh" | "stale" | "failing" | "never" | "no_sources";
  /** newest successful source fetch (ISO) */
  lastSuccessAt: string | null;
  /** newest failed source fetch (ISO) */
  lastFailureAt: string | null;
  /** newest attempt of either kind (ISO) */
  lastAttemptAt: string | null;
  /** did the newest attempt succeed? null when nothing ever ran */
  lastAttemptOk: boolean | null;
  sources: { enabled: number } & Record<Exclude<SourceFreshness, "disabled">, number>;
  /** the cadence ingestion actually runs at, and the resulting stale threshold */
  schedule: { intervalMinutes: number; source: SchedulerCadence["source"]; descriptionAr: string; staleAfterMinutes: number };
}

export interface NewsFeed {
  items: NewsArticle[];
  total: number;
  /** most recent SUCCESSFUL source check (ISO) — for "last updated" UI */
  lastUpdated: string | null;
  /** true unless every enabled source is fresh */
  stale: boolean;
  freshness: NewsFreshness;
  categories: { name: string; count: number }[];
}

const newest = (values: (string | null | undefined)[]): string | null =>
  values.filter((v): v is string => Boolean(v) && Number.isFinite(Date.parse(String(v)))).sort().pop() ?? null;

/** Pure: summarise source health into feed freshness (exported for tests). */
export function summarizeFreshness(
  sources: RSSSource[],
  now = Date.now(),
  cadence: SchedulerCadence = schedulerCadence(),
): NewsFreshness {
  const enabled = sources.filter((s) => s.enabled);
  const counts = { enabled: enabled.length, fresh: 0, stale: 0, failing: 0, never: 0 };
  for (const s of enabled) {
    const f = sourceFreshness(s, now, cadence.minutes);
    if (f !== "disabled") counts[f]++;
  }
  const lastSuccessAt = newest(enabled.map((s) => s.lastSuccessfulFetch));
  const lastFailureAt = newest(enabled.map((s) => s.lastFailedFetch));
  const lastAttemptAt = newest([lastSuccessAt, lastFailureAt]);
  const lastAttemptOk = lastAttemptAt === null ? null : lastAttemptAt === lastSuccessAt && lastSuccessAt !== lastFailureAt;
  const shortest = enabled.length ? Math.min(...enabled.map((s) => allowedAgeMinutes(s, cadence.minutes))) : allowedAgeMinutes({ refreshInterval: 0 }, cadence.minutes);

  let state: NewsFreshness["state"];
  if (enabled.length === 0) state = "no_sources";
  else if (!lastSuccessAt) state = "never";
  else if (lastAttemptOk === false) state = "failing";
  else if (counts.fresh === enabled.length) state = "fresh";
  else state = "stale";

  return {
    state,
    lastSuccessAt,
    lastFailureAt,
    lastAttemptAt,
    lastAttemptOk,
    sources: counts,
    schedule: { intervalMinutes: cadence.minutes, source: cadence.source, descriptionAr: cadence.descriptionAr, staleAfterMinutes: shortest },
  };
}

export async function getNewsFeed(filter: ArticleFilter = {}): Promise<NewsFeed> {
  // Read the durable store directly: moderation must survive replica changes
  // and cannot remain visible in a five-minute per-process feed cache.
  const { items, total } = await listArticles({ ...filter, limit: filter.limit ?? 24 });
  return buildFeed(items, total);
}

async function buildFeed(items: NewsArticle[], total: number): Promise<NewsFeed> {
  const freshness = summarizeFreshness(await listSources());
  const categories = await feedCategories();
  return { items, total, lastUpdated: freshness.lastSuccessAt, stale: freshness.state !== "fresh", freshness, categories };
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
  lastFailureAt: string | null;
}> {
  const sources = await listSources();
  const enabled = sources.filter((s) => s.enabled);
  const healthy = enabled.filter((s) => s.consecutiveFailures === 0);
  return {
    sourcesTotal: sources.length,
    sourcesEnabled: enabled.length,
    sourcesHealthy: healthy.length,
    lastFetchAt: newest(enabled.map((s) => s.lastSuccessfulFetch)),
    lastFailureAt: newest(enabled.map((s) => s.lastFailedFetch)),
  };
}
