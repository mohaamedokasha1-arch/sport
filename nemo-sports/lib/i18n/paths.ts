/**
 * NEMO Sports · locale-aware paths
 * ─────────────────────────────────────────────────────────────────────────────
 * One place decides how a path is spelled in each language, and which paths
 * have an English counterpart at all.
 *
 * The mapping is deliberately *identifier-based*: `/matches/{providerSlug}`
 * becomes `/en/matches/{providerSlug}` with the SAME slug. Slugs are never
 * translated, so switching language can never land on a different match, team,
 * competition or article — and a slug that only exists in the provider feed is
 * still resolvable in both languages.
 */

import { DEFAULT_LOCALE, EN_PREFIX, type Locale } from "./locales";

/**
 * First path segments that have a working English page.
 *
 * Anything NOT listed here has no English route (e.g. `/admin`, `/api`,
 * `/ad-frame`, `/icon.svg`), and the language switcher falls back to the
 * English homepage instead of linking to a 404. `/admin` is excluded on
 * purpose: `middleware.ts` guards `/admin/:path*`, and an `/en/admin` route
 * would sit outside that matcher.
 *
 * Keep this list in sync with the tree under `app/(en)/en/`.
 * `scripts/verify-i18n.test.ts` asserts that every root here really has a
 * route file and that no route file is missing from this list.
 */
export const EN_ROUTE_ROOTS: readonly string[] = [
  "", // homepage
  "about",
  "account",
  "broadcast-rights",
  "competitions",
  "contact",
  "copyright",
  "faq",
  "fixtures",
  "learn",
  "live",
  "match",
  "matches",
  "my-day",
  "news",
  "players",
  "privacy",
  "results",
  "scout",
  "search",
  "sports",
  "standings",
  "teams",
  "terms",
  "today",
  "tomorrow",
  "watch",
];

/** Drop a leading `/en` (and only `/en`) from a path. Query strings survive. */
export function stripLocalePrefix(path: string): string {
  const value = path || "/";
  if (value === EN_PREFIX) return "/";
  if (value.startsWith(`${EN_PREFIX}/`)) return value.slice(EN_PREFIX.length) || "/";
  return value;
}

/** The first path segment ("" for the homepage), ignoring any query string. */
export function routeRoot(path: string): string {
  const clean = stripLocalePrefix(path).split(/[?#]/, 1)[0] ?? "/";
  const segments = clean.split("/");
  return segments[1] ?? "";
}

/** True when this path (in either language) has an English page. */
export function hasEnglishEquivalent(path: string): boolean {
  return EN_ROUTE_ROOTS.includes(routeRoot(path));
}

/**
 * Spell `path` for `locale`, preserving the query string and any trailing
 * segments. Arabic returns the bare path, so existing links and canonicals are
 * emitted exactly as they are today.
 */
export function localizePath(path: string, locale: Locale): string {
  const clean = stripLocalePrefix(path);
  if (locale === DEFAULT_LOCALE) return clean;
  if (clean === "/") return EN_PREFIX;
  return `${EN_PREFIX}${clean}`;
}

/**
 * Where the language switcher sends a visitor standing on `pathname`.
 *
 * Equivalent page when one exists (same entity, same filters and pagination,
 * because the query string is carried over); otherwise the closest valid
 * fallback — the English homepage — never a broken link.
 */
export function equivalentPathFor(pathname: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return stripLocalePrefix(pathname);
  return hasEnglishEquivalent(pathname) ? localizePath(pathname, locale) : EN_PREFIX;
}

/** Absolute-path guard used by the metadata helpers. */
export function asAbsolutePath(path: string): string {
  if (!path) return "/";
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      return `${url.pathname}${url.search}`;
    } catch {
      return "/";
    }
  }
  return path.startsWith("/") ? path : `/${path}`;
}
