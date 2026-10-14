/**
 * NEMO Sports · locale primitives
 * ─────────────────────────────────────────────────────────────────────────────
 * The site is Arabic-first. Arabic keeps the URL structure it already has and
 * is indexed under (`/`, `/matches`, `/matches/{slug}` …) — nothing moves.
 * English is added as a *sibling* tree under the `/en` prefix.
 *
 * Why a prefix tree instead of a cookie/header switch:
 *   · Arabic URLs stay byte-for-byte identical, so every indexed URL, every
 *     backlink and every canonical already published keeps working.
 *   · Both languages prerender (static / ISR exactly like today). A cookie or
 *     header switch would force `headers()` into the root layout and turn
 *     every currently-static page into a per-request render.
 *   · `dir`/`lang` live on `<html>`, which only a root layout may render, so
 *     each language needs its own root layout (route groups).
 */

export const LOCALES = ["ar", "en"] as const;

export type Locale = (typeof LOCALES)[number];

/** Arabic is the default and the unprefixed language. */
export const DEFAULT_LOCALE: Locale = "ar";

/** URL prefix of the non-default locale. */
export const EN_PREFIX = "/en";

/**
 * Cookie that remembers an explicit choice. It is written by the switcher and
 * read by nothing that changes routing: the URL always wins, so a direct link
 * to `/en/...` renders English even for a visitor whose last choice was
 * Arabic, and `/` always renders Arabic. That keeps crawlers and shared links
 * deterministic and rules out redirect loops.
 */
export const LOCALE_COOKIE = "nemo-locale";

/** BCP-47 tags used by `Intl` and by `og:locale`. */
export const LOCALE_INTL: Record<Locale, string> = { ar: "ar-EG", en: "en-GB" };

/** Open Graph locale tags. */
export const LOCALE_OG: Record<Locale, string> = { ar: "ar_AR", en: "en_GB" };

export function isLocale(value: unknown): value is Locale {
  return value === "ar" || value === "en";
}
