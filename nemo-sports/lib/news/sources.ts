/**
 * NEMO Sports · RSS source registry (Google News RSS — 100% free)
 * ─────────────────────────────────────────────────────────────
 * Google News publishes no official public RSS API, but search feeds of the
 * form below are the documented community approach and require no key:
 *
 *   https://news.google.com/rss/search?q=[QUERY]&hl=en&gl=US&ceid=US:en
 *
 * Admin can add/edit/remove sources at /admin/news. These defaults seed the
 * store (Postgres when configured, in-memory otherwise) on first boot.
 */

import type { RSSSource } from "./types";

export function buildFeedUrl(query: string, language: string, country: string): string {
  const hl = language === "ar" ? "ar" : "en";
  const gl = country.toUpperCase();
  const ceid = `${gl}:${hl}`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
}

type Seed = Pick<RSSSource, "query" | "language" | "country" | "priority" | "refreshInterval"> & {
  category?: string;
};

const SEEDS: Seed[] = [
  // Egyptian football — highest priority, fastest refresh
  { query: "Egyptian Premier League", language: "en", country: "EG", priority: 1, refreshInterval: 30, category: "Egyptian Football" },
  { query: "Al Ahly", language: "en", country: "EG", priority: 1, refreshInterval: 30, category: "Egyptian Football" },
  { query: "Zamalek", language: "en", country: "EG", priority: 1, refreshInterval: 30, category: "Egyptian Football" },
  { query: "Pyramids FC", language: "en", country: "EG", priority: 1, refreshInterval: 30, category: "Egyptian Football" },
  { query: "Ismaily SC", language: "en", country: "EG", priority: 1, refreshInterval: 30, category: "Egyptian Football" },
  { query: "CAF Champions League", language: "en", country: "EG", priority: 2, refreshInterval: 30, category: "CAF Champions League" },
  // International football
  { query: "football", language: "en", country: "US", priority: 2, refreshInterval: 30, category: "Football" },
  { query: "Premier League", language: "en", country: "GB", priority: 2, refreshInterval: 60, category: "Premier League" },
  { query: "Champions League", language: "en", country: "GB", priority: 2, refreshInterval: 60, category: "Champions League" },
  { query: "La Liga", language: "en", country: "ES", priority: 3, refreshInterval: 60, category: "La Liga" },
  { query: "Serie A", language: "en", country: "IT", priority: 3, refreshInterval: 60, category: "Serie A" },
  // Other sports
  { query: "NBA", language: "en", country: "US", priority: 3, refreshInterval: 60, category: "Basketball" },
  { query: "Tennis", language: "en", country: "US", priority: 4, refreshInterval: 120, category: "Tennis" },
  { query: "Boxing", language: "en", country: "US", priority: 4, refreshInterval: 120, category: "Boxing" },
];

function seedId(query: string, country: string, language: string): string {
  return (
    "rss_" +
    `${query}-${country}-${language}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
  );
}

export function defaultSources(now = new Date().toISOString()): RSSSource[] {
  return SEEDS.map((s) => ({
    id: seedId(s.query, s.country, s.language),
    query: s.query,
    language: s.language,
    country: s.country,
    category: s.category,
    priority: s.priority,
    enabled: true,
    refreshInterval: s.refreshInterval,
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
  }));
}

/** Refresh cadence rationale (minutes) — higher volume = faster refresh. */
export const REFRESH_RATIONALE: Record<number, string> = {
  1: "تغطية أساسية — تحديث كل 30 دقيقة",
  2: "تغطية مهمة — تحديث كل 30–60 دقيقة",
  3: "تغطية متوسطة — تحديث كل ساعة",
  4: "تغطية خفيفة — تحديث كل ساعتين",
};
