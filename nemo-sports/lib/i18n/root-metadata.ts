/**
 * NEMO Sports · shared root-layout metadata
 * ─────────────────────────────────────────────────────────────────────────────
 * Both root layouts (`app/(ar)/layout.tsx` and `app/(en)/layout.tsx`) build
 * their metadata here so the two languages cannot drift apart. The operator's
 * saved `site_settings` values still win for name/description/keywords — this
 * only adds the locale-dependent parts (title suffix, `og:locale`, and the
 * hreflang pair for the home page).
 *
 * Nothing here reads a request-scoped API, so both trees stay prerenderable.
 */

import type { Metadata } from "next";
import { robotsForDataSource } from "@/lib/sdl-gateway";
import { robotsWithDiscovery } from "@/lib/seo-discovery";
import { SITE_URL, absoluteUrl } from "@/lib/site";
import { getSiteSettingsCached, publicBaseMetadata } from "@/lib/site-settings";
import { ogLocale } from "@/lib/i18n/metadata";
import { localizePath } from "@/lib/i18n/paths";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";

/** English suffix used on the English home page title. */
const EN_SUFFIX = "Live scores, results and fixtures";

export async function rootMetadata(locale: Locale): Promise<Metadata> {
  const [robots, settings] = await Promise.all([robotsForDataSource(), getSiteSettingsCached()]);
  const base = publicBaseMetadata(settings, locale);

  if (locale === DEFAULT_LOCALE) {
    // Byte-for-byte the metadata the site already ships.
    return { ...base, robots: robotsWithDiscovery(robots.index, robots.follow) };
  }

  const brand = String(base.openGraph?.siteName ?? "NEMO Sports");
  const title = `${brand} | ${EN_SUFFIX}`;
  return {
    ...base,
    title: { default: title, template: `%s | ${brand}` },
    alternates: {
      canonical: "/en",
      languages: {
        ar: absoluteUrl("/"),
        en: absoluteUrl("/en"),
        "x-default": absoluteUrl("/"),
      },
    },
    openGraph: {
      ...base.openGraph,
      title,
      locale: ogLocale(locale),
      alternateLocale: ogLocale(DEFAULT_LOCALE),
      url: absoluteUrl(localizePath("/", locale)),
    },
    robots: robotsWithDiscovery(robots.index, robots.follow),
  };
}

/** `themeColor` — identical in both trees. */
export const rootViewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0F1B2E" },
    { media: "(prefers-color-scheme: dark)", color: "#050B15" },
  ],
  width: "device-width",
  initialScale: 1,
} as const;

export { SITE_URL };
