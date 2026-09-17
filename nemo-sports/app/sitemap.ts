import type { MetadataRoute } from "next";
import { SITE_URL, demoContentVisible, hasProviderKeys } from "@/lib/site";

/**
 * Sitemap policy — only URLs that actually exist, return 200 and carry real
 * content may appear here.
 * ─────────────────────────────────────────────────────────────
 * Root cause of the Search Console error "URL غير مسموح به": the previous
 * sitemap hardcoded BASE = "https://nemo.sports" (a domain not connected to
 * this deployment) and listed demo match/team/player/article URLs whose slugs
 * are recomputed from "now" on every build (they 404 afterwards).
 *
 * Rules now:
 *   1. Every URL starts with SITE_URL (lib/site.ts) — the host that actually
 *      serves this sitemap. Cross-host URLs are never emitted.
 *   2. The data-section indexes (/matches, /live, /news …) are listed only
 *      when the site is actually indexable — i.e. the SDL runs on real
 *      provider keys, the exact same condition `robotsForDataSource()` uses
 *      to flip robots meta to index,follow. A demo/no-data build is noindex,
 *      so submitting its section URLs would only produce
 *      "Submitted URL marked noindex" reports in Search Console.
 *   3. Demo entity pages (match/team/player/article details) are NEVER listed:
 *      their slugs are recomputed from "now" per build and would 404 later.
 *      When public pages are fed from the SDL, entity URLs must come from
 *      real provider IDs — see the TODO below.
 *   4. /search (query-driven utility page, noindex) and everything under
 *      /admin, /account, /api are never listed.
 *
 * `force-dynamic` keeps the file honest on long-lived deployments: it is
 * regenerated per request instead of being frozen at build time.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const indexable = hasProviderKeys() && !demoContentVisible();

  // Pages that exist and hold real content in every mode.
  const always: string[] = [
    "", // homepage
    "/about",
    "/contact",
    "/faq",
    "/broadcast-rights",
    "/privacy",
    "/terms",
    "/copyright",
  ];

  // Section indexes — only meaningful (and indexable) with real data.
  const dataSections: string[] = [
    "/matches",
    "/live",
    "/results",
    "/fixtures",
    "/competitions",
    "/standings",
    "/teams",
    "/players",
    "/news",
    "/watch",
  ];

  const now = new Date();

  const paths = [
    ...always.map((path, i) => ({ path, priority: i === 0 ? 1 : 0.6, changeFrequency: "weekly" as const })),
    ...(indexable ? dataSections.map((path) => ({ path, priority: 0.8, changeFrequency: "daily" as const })) : []),
    // TODO(live data): when the public match/news/team pages are fed from the
    // SDL gateway, append their URLs here from `fixtures()` / articles repo —
    // derived from real provider IDs only, and capped to pages that render
    // actual content (no filler pages).
  ];

  return paths.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
