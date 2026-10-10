/**
 * NEMO Sports · news source freshness (pure, no I/O)
 * ───────────────────────────────────────────────────
 * One rule for "is this source's data current?", shared by the public feed
 * (lib/news/service.ts) and the admin panel, so both surfaces always agree.
 *
 * A source is judged against ITS OWN refresh interval, not one global number.
 * The previous global 30-minute threshold flagged every 120-minute source as
 * stale for 90 minutes of each cycle, and the admin panel showed a source that
 * had not succeeded for days as «سليم» (healthy).
 *
 * Grace: one missed cycle is tolerated (2 × interval), never less than the
 * baseline below, so a single slow run does not flip the whole site to
 * "possibly stale".
 */
import type { RSSSource } from "./types";

/** Minimum age (minutes) before a successful fetch is considered old. */
export const FRESHNESS_FLOOR_MIN = 30;
/** How many of the source's own intervals may elapse before it is stale. */
export const FRESHNESS_GRACE_FACTOR = 2;

export type SourceFreshness = "disabled" | "never" | "failing" | "stale" | "fresh";

/** Maximum age (minutes) of the last successful fetch before it counts as stale. */
export function allowedAgeMinutes(source: Pick<RSSSource, "refreshInterval">): number {
  // A missing or invalid interval falls back to the baseline itself, not to a
  // doubled baseline: unknown cadence must not silently relax the rule.
  if (!Number.isFinite(source.refreshInterval) || source.refreshInterval <= 0) return FRESHNESS_FLOOR_MIN;
  return Math.max(FRESHNESS_FLOOR_MIN, source.refreshInterval * FRESHNESS_GRACE_FACTOR);
}

export function sourceFreshness(
  source: Pick<RSSSource, "enabled" | "refreshInterval" | "lastSuccessfulFetch" | "consecutiveFailures">,
  now = Date.now(),
): SourceFreshness {
  if (!source.enabled) return "disabled";
  if (!source.lastSuccessfulFetch) return "never";
  const at = Date.parse(source.lastSuccessfulFetch);
  if (!Number.isFinite(at)) return "never";
  // A source that failed since its last success is reported as failing, even
  // when its last success is still within the allowed age.
  if (source.consecutiveFailures > 0) return "failing";
  const ageMin = (now - at) / 60000;
  return ageMin > allowedAgeMinutes(source) ? "stale" : "fresh";
}
