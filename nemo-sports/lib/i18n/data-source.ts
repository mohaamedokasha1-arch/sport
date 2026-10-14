/**
 * NEMO Sports · locale-aware data-provenance labels
 * ─────────────────────────────────────────────────────────────────────────────
 * Split out of `components/data/DataSourceNote.tsx` so both server and client
 * code can ask for the same wording without importing a client component.
 * Pure functions, no React, no request state.
 *
 * Arabic output is unchanged from the original implementation.
 */

import { t } from "./translate";
import { formatClock } from "./dates";
import type { Locale } from "./locales";

const PROVIDER_BRAND: Record<string, string> = {
  football_data: "Football-Data.org",
  sportscore: "SportScore",
  sportapi: "SportAPI",
  sportradar: "Sportradar",
  sportmonks: "SportMonks",
  api_football: "API-Football",
  thesportsdb: "TheSportsDB",
};

/** Human label for a provider name coming back from the SDL. */
export function providerLabel(locale: Locale, provider: string): string {
  if (PROVIDER_BRAND[provider]) return PROVIDER_BRAND[provider]!;
  if (provider === "demo") return t(locale, "ds.provider.demo");
  if (provider === "admin") return t(locale, "ds.provider.admin");
  return provider;
}

/**
 * How the surface obtained its data.
 *
 * Only a real provider round-trip can honestly be called a live fetch.
 * Editorial matches and the offline preview dataset are read straight from
 * their own store, so labelling them a live fetch claimed a call that never
 * happened. The cache TTL travels with the cache label because that is the only
 * place it means anything to a visitor.
 */
export function originLabel(locale: Locale, provider: string, fromCache: boolean, ttlSeconds?: number): string {
  if (provider === "demo") return t(locale, "ds.fetch.demo");
  if (provider === "admin") return t(locale, "ds.fetch.admin");
  if (fromCache) {
    return ttlSeconds ? t(locale, "ds.fetch.cacheTtl", { minutes: Math.round(ttlSeconds / 60) }) : t(locale, "ds.fetch.cache");
  }
  return t(locale, "ds.fetch.live");
}

/** "· آخر تحديث 14:05" / "· last updated 14:05". */
export function fetchedAtLabel(locale: Locale, fetchedAt: string | undefined): string {
  return fetchedAt
    ? t(locale, "ds.fetchedAt", { time: formatClock(locale, fetchedAt) })
    : t(locale, "ds.noFetchTime");
}
