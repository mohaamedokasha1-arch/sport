import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { liveMatches, fixtures, dataServable, hasMatchIdentity } from "@/lib/sdl-gateway";
import { listAdminTeams } from "@/lib/admin-teams";
import { listAdminPlayers } from "@/lib/admin-players";
import { listAdminCompetitions } from "@/lib/admin-competitions";
import { listManualNews } from "@/lib/manual-news";
import type { NormalizedFixture } from "@/packages/sdl/src";

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
  // Same rule as robotsForDataSource(): listing data sections requires that the
  // platform can actually serve data, not merely that a provider is registered.
  // Previously this was `hasProviderKeys() && !demoContentVisible()`, and
  // because SportScore is keyless-and-enabled-by-default hasProviderKeys() was
  // always true — so the sitemap advertised data sections even while every one
  // of them rendered "Data temporarily unavailable".
  const indexable = await dataServable();

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

  // Admin-published content (real, operator-entered; only published items).
  try {
    const [teams, players, comps, news] = await Promise.all([
      listAdminTeams({ publishedOnly: true, limit: 500 }),
      listAdminPlayers({ publishedOnly: true, limit: 500 }),
      listAdminCompetitions({ publishedOnly: true, limit: 200 }),
      listManualNews({ publishedOnly: true, limit: 500 }),
    ]);
    for (const t of teams) entries.push({ url: `${SITE_URL}/teams/${t.slug}`, lastModified: new Date(t.updatedAt), changeFrequency: "weekly", priority: 0.6 });
    for (const p of players) entries.push({ url: `${SITE_URL}/players/${p.slug}`, lastModified: new Date(p.updatedAt), changeFrequency: "weekly", priority: 0.5 });
    for (const c of comps) entries.push({ url: `${SITE_URL}/competitions/${c.slug}`, lastModified: new Date(c.updatedAt), changeFrequency: "weekly", priority: 0.6 });
    for (const n of news) entries.push({ url: `${SITE_URL}/news/${n.slug}`, lastModified: new Date(n.updatedAt), changeFrequency: "weekly", priority: 0.6 });
  } catch {
    // never fail the sitemap because of admin content
  }

  // Real match pages (provider slugs) — live matches first, then the rest of
  // the feed. Capped to keep the file meaningful (real pages only).
  if (indexable) {
    try {
      const [liveRes, feedRes] = await Promise.all([liveMatches("football"), fixtures({ sport: "football" })]);
      const slugs = new Set<string>();
      // Only fixtures that can actually render a page. A provider can return a
      // shell with no team identities; listing it here would advertise a URL
      // whose page 404s (see hasMatchIdentity in lib/sdl-gateway.ts).
      const add = (list: NormalizedFixture[]) => {
        for (const f of list) if (f.providerId && hasMatchIdentity(f)) slugs.add(f.providerId);
      };
      if (liveRes.ok) add(liveRes.data);
      if (feedRes.ok) add(feedRes.data);
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
