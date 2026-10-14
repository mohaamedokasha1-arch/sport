/**
 * NEMO Sports · locale-aware SEO metadata
 * ─────────────────────────────────────────────────────────────────────────────
 * Rules this module enforces:
 *
 *   · Arabic canonicals are emitted EXACTLY as the site has always emitted them
 *     (`/matches`, `/teams/{slug}` …). Adding English never rewrites an
 *     existing canonical, so nothing already indexed changes address.
 *   · An English page canonicalises to its own `/en/...` URL — never to the
 *     Arabic page. Two genuinely distinct localised pages must not share a
 *     canonical.
 *   · hreflang is only emitted when BOTH sides exist. A page with no English
 *     route gets no `languages` block at all, so no hreflang ever points at a
 *     URL that 404s. `x-default` points at Arabic, which is the site's real
 *     default destination.
 *   · URLs are absolute (hreflang requires it) and derived from `SITE_URL`, so
 *     they always agree with robots.txt and the sitemap.
 */

import type { Metadata } from "next";

/** `Metadata["alternates"]` — Next 15 does not export the `Alternates` alias. */
type Alternates = NonNullable<Metadata["alternates"]>;
import { absoluteUrl } from "@/lib/site";
import { DEFAULT_LOCALE, LOCALE_OG, type Locale } from "./locales";
import { asAbsolutePath, hasEnglishEquivalent, localizePath, stripLocalePrefix } from "./paths";

export type LocaleAlternatesOptions = {
  /**
   * Canonical path of the entity, WITHOUT locale prefix. Used when a page's
   * canonical differs from the requested path (e.g. an alias slug canonicalising
   * to its canonical slug). Both language URLs are then derived from it.
   */
  canonical?: string;
  /** Force hreflang off (thin / noindex utility pages). */
  noHreflang?: boolean;
};

/**
 * Build `alternates` for a page.
 *
 * @param locale  locale currently rendering
 * @param path    the page's own path (with or without the `/en` prefix)
 */
export function localeAlternates(
  locale: Locale,
  path: string,
  options: LocaleAlternatesOptions = {},
): Alternates {
  const basePath = asAbsolutePath(stripLocalePrefix(options.canonical ?? path));
  const ownPath = locale === DEFAULT_LOCALE ? basePath : localizePath(basePath, locale);

  const alternates: Alternates = { canonical: ownPath };

  const translated = !options.noHreflang && hasEnglishEquivalent(basePath);
  if (translated) {
    const arabic = absoluteUrl(basePath);
    const english = absoluteUrl(localizePath(basePath, "en"));
    alternates.languages = {
      ar: arabic,
      en: english,
      "x-default": arabic,
    };
  }

  return alternates;
}

/** Open Graph locale for a page (`ar_AR` / `en_GB`) plus its alternates. */
export function ogLocale(locale: Locale): string {
  return LOCALE_OG[locale] ?? LOCALE_OG[DEFAULT_LOCALE]!;
}

/** The other language, for reciprocal links. */
export function otherLocale(locale: Locale): Locale {
  return locale === "ar" ? "en" : "ar";
}
