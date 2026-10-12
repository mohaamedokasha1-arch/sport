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

/* ── inbound link aliasing (partner funnels, bookmarks, old shares) ───────── */

/** Club-name suffixes a provider may or may not carry in its slug. */
const CLUB_SUFFIX_TOKENS = new Set(["fc", "cf", "sc", "ac", "af", "ca", "ba", "fk", "bk", "if", "sk", "de", "1", "2"]);

/** "Flamengo" / "flamengo-fc" / "FLAMENGO  BA" → comparable forms of one club. */
export function sideKeys(name: string | null | undefined): string[] {
  const base = String(name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  if (!base) return [];
  const tokens = base.split("-").filter(Boolean);
  const trimmed = tokens.filter((t) => !CLUB_SUFFIX_TOKENS.has(t)).join("-");
  return [...new Set([base, trimmed].filter(Boolean))];
}

/** The two sides a `home-vs-away` slug encodes, order-insensitively. */
export function slugSides(slug: string): [string, string] | null {
  const raw = String(slug ?? "").trim().toLowerCase();
  const parts = raw.split(/-vs-|-v-|__|_/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return [parts[0], parts.slice(1).join("-vs-")];
}

export type SlugLikeFixture = {
  providerId?: string | null;
  homeName?: string | null;
  awayName?: string | null;
  homeProviderId?: string | null;
  awayProviderId?: string | null;
};

/**
 * Find the fixture an inbound slug is pointing at, without guessing.
 *
 * Match pages are addressed by the provider's permalink slug, and the same
 * tie can be spelled differently wherever it is linked from: the match gate at
 * nemo-live-kora-matchat linked `/matches/flamengo-vs-santos` while SportScore
 * calls it `flamengo-vs-santos-fc`, so a live match answered 404 from a partner
 * page that was showing its score. The sides of a slug are therefore compared
 * to the two clubs of each known fixture — both sides, order-insensitively, and
 * only when EXACTLY ONE fixture qualifies. Ambiguity is a 404, never a coin
 * flip, and never a redirect to a different tie.
 */
export function resolveMatchSlug<T extends SlugLikeFixture & { providerId: string }>(
  slug: string,
  fixtures: readonly T[],
): T | null {
  const wanted = slugSides(slug);
  if (!wanted) return null;
  const [first, second] = wanted.map((side) => side.replace(/^-+|-+$/g, ""));
  if (!first || !second) return null;
  let found: T | null = null;
  for (const fixture of fixtures) {
    const home = sideKeys(fixture.homeName ?? fixture.homeProviderId);
    const away = sideKeys(fixture.awayName ?? fixture.awayProviderId);
    if (home.length === 0 || away.length === 0) continue;
    const matchesPair =
      (home.includes(first) && away.includes(second)) ||
      (home.includes(second) && away.includes(first));
    if (!matchesPair) continue;
    if (found) return null; // two candidates: ambiguous, do not pick one
    found = fixture;
  }
  if (found && found.providerId === slug) return null; // already canonical
  return found;
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
