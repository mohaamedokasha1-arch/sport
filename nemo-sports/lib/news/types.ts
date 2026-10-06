/**
 * NEMO Sports · News pipeline types (zero-cost edition)
 * ─────────────────────────────────────────────────────
 * The automatic news system: RSS discovery → fetch → parse → normalize →
 * deduplicate → validate → categorize → entity-match → store → publish.
 *
 * LEGAL: we store/display metadata only (title, source, timestamp, short
 * RSS-provided snippet where permitted, category, entities). We NEVER copy
 * full article bodies. Clicking an article always opens the ORIGINAL
 * publisher in a new tab.
 */

export type RssLanguage = "en" | "ar";
export type RssCountry = "US" | "EG" | "GB" | "ES" | "IT" | "SA" | "AE" | "FR" | "DE";

export interface RSSSource {
  id: string;
  /** Google News search query, e.g. "Egyptian Premier League" */
  query: string;
  language: RssLanguage;
  country: RssCountry;
  category?: string;
  /** 1 (highest) – 5 (lowest) */
  priority: number;
  enabled: boolean;
  /** minutes between fetches */
  refreshInterval: number;
  lastSuccessfulFetch?: string | null;
  lastFailedFetch?: string | null;
  lastError?: string | null;
  failureCount: number;
  consecutiveFailures: number;
  /** next eligible fetch (ISO) — backoff aware */
  nextEligibleFetch?: string | null;
  articleCount: number;
  /** HTTP caching */
  etag?: string | null;
  lastModified?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewsEntityRef {
  type: "team" | "player" | "competition";
  /** our internal slug/id */
  internalId: string;
  /** display name in Arabic where known */
  displayName: string;
  /** name as extracted from the article */
  extractedName: string;
  confidence: number;
  foundIn: "title" | "description" | "both";
}

export type ArticleStatus = "published" | "hidden" | "archived";

export interface NewsArticle {
  id: string;
  title: string;
  /** original article URL (Google News redirect resolved when possible) */
  sourceUrl: string;
  /** canonical URL used for dedup (tracking params stripped) */
  canonicalUrl: string;
  sourceName: string;
  sourceDomain: string;
  /** original publication timestamp (ISO) */
  publicationDate: string;
  /** when WE fetched it (ISO) */
  fetchedDate: string;
  /** short RSS snippet only — never the full body */
  description: string;
  category: string;
  secondaryCategories: string[];
  categoryConfidence: number;
  relatedEntities: NewsEntityRef[];
  rssSourceId: string;
  /** sha256(url + title) — dedup fingerprint */
  fingerprint: string;
  isDuplicate: boolean;
  duplicateOf?: string | null;
  qualityScore: number;
  status: ArticleStatus;
  /** publisher logo/badge hint (initials) */
  sourceBadge: string;
  createdAt: string;
  updatedAt: string;
}

export interface DuplicateCheck {
  exactUrlMatch: boolean;
  canonicalUrlMatch: boolean;
  titleSimilarity: number;
  titleIsDuplicate: boolean;
  descriptionSimilarity: number;
  descriptionIsDuplicate: boolean;
  domainDateCollision: boolean;
  isDuplicate: boolean;
  confidence: number;
  reason: string;
}

export type FeedStatus = "healthy" | "warning" | "unhealthy" | "disabled";

export interface FeedHealth {
  sourceId: string;
  sourceName: string;
  status: FeedStatus;
  lastSuccessfulFetch: string | null;
  lastFailedFetch: string | null;
  nextScheduledFetch: string;
  lastError: string | null;
  failureCount: number;
  consecutiveFailures: number;
  cachedArticleCount: number;
  articlesProcessedToday: number;
  duplicatesRemovedToday: number;
}

export interface IngestStats {
  totalFetches: number;
  totalProcessed: number;
  inserted: number;
  duplicatesRemoved: number;
  validationFailures: number;
  parseErrors: number;
  entityMatches: number;
  avgProcessingMs: number;
  perSource: {
    sourceId: string;
    query: string;
    ok: boolean;
    processed: number;
    inserted: number;
    duplicates: number;
    error?: string;
    ms: number;
  }[];
  startedAt: string;
  finishedAt: string;
}

/** Raw item straight out of the RSS parser, before normalization. */
export interface RawRssItem {
  title: string;
  link: string;
  pubDate: string | null;
  description: string;
  sourceName: string | null;
  guid: string | null;
  categories: string[];
}
