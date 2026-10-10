/**
 * NEMO Sports · match URLs and sport labels (pure, shared by pages/sitemap/JSON-LD)
 * ──────────────────────────────────────────────────────────────────────────────
 * Every place that names a match page must produce the SAME string for the same
 * match: the sitemap entry, the canonical link, the JSON-LD `url`, the share
 * link and the list links. Before this module, some call sites encoded the slug
 * and others did not, so an Arabic or otherwise escaped slug could be indexed
 * under two different URLs.
 */
import { absoluteUrl } from "@/lib/site";

/** Relative path of a match detail page (URL structure is unchanged). */
export function matchPath(slug: string): string {
  return `/matches/${encodeURIComponent(slug)}`;
}

/** Absolute, canonical URL of a match detail page. */
export function matchUrl(slug: string): string {
  return absoluteUrl(matchPath(slug));
}

/**
 * schema.org `SportsEvent.sport` values. Keyed by the public sport slug. A sport
 * without an entry is named by its slug rather than mislabelled as football.
 */
const SCHEMA_SPORT_NAME: Record<string, string> = {
  football: "Football",
  basketball: "Basketball",
  tennis: "Tennis",
  cricket: "Cricket",
};

export function schemaSportName(sportSlug: string | null | undefined): string {
  const key = String(sportSlug ?? "").trim().toLowerCase();
  return SCHEMA_SPORT_NAME[key] ?? (key || "Sports");
}
