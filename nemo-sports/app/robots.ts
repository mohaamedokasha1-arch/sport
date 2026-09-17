import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * robots.txt — the sitemap URL MUST live on the same host that serves this
 * file, otherwise Search Console rejects every submitted URL with
 * "URL غير مسموح به" (Submitted URL not allowed). The origin comes from
 * `lib/site.ts` (env-driven), never hardcoded.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private / non-content areas only. Public pages (/ , /matches,
        // /live , /news …) stay crawlable so Google can always see their
        // robots meta (a demo build marks them noindex instead of hiding
        // behind robots.txt, which would leave the index stale forever).
        disallow: ["/admin", "/account", "/api/"],
      },
    ],
    sitemap: [`${SITE_URL}/sitemap.xml`],
    host: SITE_URL,
  };
}
