/**
 * NEMO Sports · structured data for editorial articles
 * ─────────────────────────────────────────────────────────────────────
 * The JSON-LD an editorial article ships with, as pure functions, so the exact
 * objects Google receives can be asserted in a test instead of being inferred
 * from rendered markup (scripts/verify-discover-seo.test.ts).
 *
 * Two graphs are emitted on /news/<slug>:
 *
 *   · NewsArticle — `headline`, `image`, `datePublished`, `dateModified`,
 *     `articleSection`, `author`, `publisher` and `mainEntityOfPage`. These are
 *     the properties the news surfaces (Google News/Discover) require before an
 *     article is treated as a first-class news item rather than a generic page.
 *     `dateModified` is the REAL edit time, so an updated story is understood as
 *     updated, not as a duplicate.
 *   · BreadcrumbList — home → news → headline.
 *
 * Rules kept from the rest of the platform: nothing is invented (a missing
 * image simply omits `image`), the source is attributed as a citation, and the
 * whole graph is serialized through `serializeJsonLd` so stored copy can never
 * close its own script tag.
 */

import type { ManualNews } from "@/lib/manual-news";
import { SITE_NAME, absoluteUrl } from "@/lib/site";
import { serializeJsonLd } from "@/lib/json-ld";
import { absoluteMediaUrl } from "@/lib/seo-discovery";
import { localizePath } from "@/lib/i18n/paths";
import type { Locale } from "@/lib/i18n/locales";

/** The headline of a record in the reader's language — never blank, never invented. */
function headlineFor(article: ManualNews, locale: Locale): string {
  return (locale === "ar" ? article.title : article.titleEn || article.title) || article.title;
}

export function editorialNewsArticleLd(article: ManualNews, locale: Locale = "ar"): Record<string, unknown> {
  const image = absoluteMediaUrl(article.imageUrl);
  const url = absoluteUrl(localizePath(`/news/${encodeURIComponent(article.slug)}`, locale));
  const headline = headlineFor(article, locale);
  const alternative = locale === "ar" ? article.titleEn : article.title;
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline,
    description: article.description || headline,
    inLanguage: locale === "ar" ? "ar" : "en",
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    articleSection: article.category,
    ...(alternative && alternative !== headline ? { alternativeHeadline: alternative } : {}),
    ...(image ? { image: [image] } : {}),
    author: { "@type": "Organization", name: SITE_NAME },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: absoluteUrl("/icon.svg") },
    },
    ...(article.sourceName
      ? { citation: { "@type": "CreativeWork", name: article.sourceName, url: article.sourceUrl } }
      : {}),
  };
}

export function editorialBreadcrumbLd(article: ManualNews, locale: Locale = "ar"): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: locale === "ar" ? "الرئيسية" : "Home", item: absoluteUrl(localizePath("/", locale)) },
      { "@type": "ListItem", position: 2, name: locale === "ar" ? "الأخبار" : "News", item: absoluteUrl(localizePath("/news", locale)) },
      { "@type": "ListItem", position: 3, name: headlineFor(article, locale), item: absoluteUrl(localizePath(`/news/${encodeURIComponent(article.slug)}`, locale)) },
    ],
  };
}

/** Both graph nodes, ready to be embedded as `<script type="application/ld+json">`. */
export function editorialStructuredData(article: ManualNews, locale: Locale = "ar"): string[] {
  return [serializeJsonLd(editorialNewsArticleLd(article, locale)), serializeJsonLd(editorialBreadcrumbLd(article, locale))];
}
