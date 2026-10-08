/* ─────────────────────────────────────────────────────────────
   NEMO Sports · Site configuration — single source of truth
   ─────────────────────────────────────────────────────────────
   Every SEO surface (metadataBase, canonical, Open Graph, JSON-LD,
   sitemap.xml, robots.txt, admin dashboards) MUST derive its origin
   from here instead of hardcoding a domain.

   Resolution order (first match wins):
     1. NEXT_PUBLIC_SITE_URL            — explicit override (recommended)
     2. VERCEL_PROJECT_PRODUCTION_URL   — set automatically by Vercel
                                          on production builds (hostname only)
     3. VERCEL_URL                      — per-deployment hostname (Vercel)
     4. https://nemo-sports.vercel.app  — the current production deployment

   The old hardcoded "https://nemo.sports" is gone: that domain is not
   connected to this project, which is exactly what made Google Search
   Console reject every submitted URL ("URL غير مسموح به"). When a custom
   domain is actually attached and serving traffic, set NEXT_PUBLIC_SITE_URL
   to it once and every canonical/sitemap/robots URL follows.
   ───────────────────────────────────────────────────────────── */

function normalizeOrigin(raw: string): string {
  let origin = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(origin)) origin = `https://${origin}`;
  // Only https is served; an accidental http:// env value must not leak
  // into canonicals or the sitemap.
  origin = origin.replace(/^http:\/\//i, "https://");
  return origin;
}

const RAW_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  process.env.VERCEL_URL ||
  "nemo-sports.vercel.app";

/** Production origin, always https and without a trailing slash. */
export const SITE_URL = normalizeOrigin(RAW_ORIGIN);

/** Absolute URL for a site path — `absoluteUrl("/matches")`. */
export function absoluteUrl(path = ""): string {
  return `${SITE_URL}${path.startsWith("/") || path === "" ? path : `/${path}`}`;
}

export const SITE_NAME = "NEMO Sports";
export const SITE_NAME_AR = "نيمو سبورتس";

/* ── content mode ──────────────────────────────────────────── */

/**
 * True when at least one real sports-data source is configured. SportScore is
 * keyless and open, so it counts as a real source whenever it is enabled
 * (default). `NEMO_SDL_MODE=demo` forces the offline demo adapter instead.
 */
export function hasProviderKeys(): boolean {
  if (process.env.NEMO_SDL_MODE === "demo") return false;
  return (
    process.env.NEMO_SPORTSCORE_ENABLED !== "0" ||
    Boolean(
      process.env.SPORTRADAR_KEY ||
        process.env.SPORTMONKS_TOKEN ||
        process.env.SPORTMONKS_API_TOKEN ||
        process.env.API_FOOTBALL_KEY ||
        process.env.THESPORTSDB_KEY ||
        process.env.THESPORTSDB_API_KEY ||
        process.env.FOOTBALL_DATA_API_KEY,
    )
  );
}

/**
 * Is the offline demo dataset allowed to render?
 *
 * The demo data in `lib/data.ts` (fixtures, live scores, news, standings,
 * players) exists so the product can be developed and demonstrated without
 * provider keys. It must never reach end users in production unless the
 * explicit demo-deployment override is enabled.
 *
 *   - development / preview  → visible when no provider is configured
 *   - production, no keys    → hidden (honest "data unavailable" states)
 *   - production, with keys  → hidden (pages show real SDL data only)
 *   - NEXT_PUBLIC_DEMO_CONTENT=1 → explicit public override (demo only)
 *
 * The public flag is checked first so server and browser bundles agree. A
 * browser cannot read private provider credentials, and checking those before
 * the public flag caused demo entities to disappear during hydration.
 * When hidden, the site is also non-indexable by design (Instruction 6 in
 * `lib/sdl-gateway.ts`) and `app/sitemap.ts` lists only real static pages.
 */
export function demoContentVisible(): boolean {
  if (process.env.NEXT_PUBLIC_DEMO_CONTENT === "1") return true;
  if (hasProviderKeys()) return false;
  if (process.env.NODE_ENV !== "production") return true;
  return false;
}
