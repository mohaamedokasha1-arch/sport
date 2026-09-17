import type { MetadataRoute } from "next";
import { SITE_URL, demoContentVisible, hasProviderKeys } from "@/lib/site";
import { liveMatches, fixtures } from "@/lib/sdl-gateway";

/**
 * Sitemap policy — only URLs that actually exist, return 200 and carry real
 * content may appear here.
 * ─────────────────────────────────────────────────────────────
 * 1. Every URL starts with SITE_URL (lib/site.ts) — the host that actually
 *    serves this sitemap.
 * 2. Data sections (/matches, /live …) are listed only when the site is
 *    indexable — i.e. a real data provider is active (the same condition
 *    robotsForDataSource() uses for index,follow).
 * 3. Match URLs come from the REAL provider feed (SportScore via the SDL),
 *    keyed by real provider slugs; if the feed is unreachable the sitemap
 *    simply omits them — never placeholder URLs.
 * 4. /search (noindex utility page) and /admin, /account, /api are never
 *    listed.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const indexable = hasProviderKeys() && !demoContentVisible();

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
  const entries: MetadataRoute.Sitemap = [
    ...always.map((path, i) => ({
      url: `${SITE_URL}${path}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: i === 0 ? 1 : 0.6,
    })),
    ...(indexable
      ? dataSections.map((path) => ({
          url: `${SITE_URL}${path}`,
          lastModified: now,
          changeFrequency: "daily" as const,
          priority: 0.8,
        }))
      : []),
  ];

  // Real match pages (provider slugs) — live matches first, then the rest of
  // the feed. Capped to keep the file meaningful (real pages only).
  if (indexable) {
    try {
      const [liveRes, feedRes] = await Promise.all([liveMatches("football"), fixtures({ sport: "football" })]);
      const slugs = new Set<string>();
      if (liveRes.ok) for (const f of liveRes.data) slugs.add(f.providerId);
      if (feedRes.ok) for (const f of feedRes.data) slugs.add(f.providerId);
      let i = 0;
      for (const slug of slugs) {
        if (i++ >= 200) break;
        entries.push({
          url: `${SITE_URL}/matches/${slug}`,
          lastModified: now,
          changeFrequency: "hourly",
          priority: 0.9,
        });
      }
    } catch {
      // feed unreachable → omit match URLs (never emit dead links)
    }
  }

  return entries;
}
