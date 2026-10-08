import type { NextConfig } from "next";
import { contentSecurityPolicy } from "./lib/security-csp";

/**
 * Site-wide security headers.
 * ─────────────────────────────────────────────────────────────────────────
 * `next.config.ts` previously had no `headers()` block at all, so the public
 * site shipped without CSP, framing protection, MIME sniffing protection,
 * referrer policy or permissions policy.
 *
 * The privileged namespaces (/admin*, /api/v1/system) get a *stricter* set
 * from `middleware.ts` — notably `no-store`, which a static config cannot
 * express per-route and which matters because /admin used to be served with
 * `s-maxage=31536000`.
 *
 * CSP NOTES — read before tightening:
 *   · `script-src`/`style-src` carry 'unsafe-inline' on purpose. Next.js emits
 *     inline bootstrap scripts for hydration and app/layout.tsx inlines a
 *     theme-init script plus JSON-LD blocks. Development adds 'unsafe-eval'
 *     for Next's dev runtime only; production never does. Removing
 *     'unsafe-inline' requires nonces wired through Next's head — real work,
 *     tracked separately. Even so this policy blocks framing, plugin embeds,
 *     base-URI hijacking and cross-origin form posts.
 *   · `img-src https: data:` — league crests come from provider CDNs
 *     (e.g. crests.football-data.org) and are rendered as plain <img>; the
 *     domain set is not known ahead of time.
 *   · No `upgrade-insecure-requests` / HSTS on a bare *.vercel.app host: they
 *     are added below only when a real production origin is configured.
 */

const CONTENT_SECURITY_POLICY = contentSecurityPolicy(process.env.NODE_ENV === "development");

/** HSTS is only safe once the site is served from an origin it controls. */
function hstsHeaders(): Record<string, string> {
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "";
  if (!origin) return {};
  return {
    // 6 months, this host only. Deliberately no `includeSubDomains` and no
    // `preload` — both are hard to walk back if the domain ever moves.
    "Strict-Transport-Security": "max-age=15552000",
    "Upgrade-Insecure-Requests": "1",
  };
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // The database and cache drivers are optional at runtime (the platform boots
  // without them). Keeping them external means the server bundle requires them
  // from node_modules only when a connection is actually configured.
  serverExternalPackages: ["pg", "ioredis"],

  async headers() {
    const base: Record<string, string> = {
      "Content-Security-Policy": CONTENT_SECURITY_POLICY,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      "Cross-Origin-Opener-Policy": "same-origin",
      ...hstsHeaders(),
    };

    return [
      {
        source: "/:path*",
        headers: Object.entries(base).map(([key, value]) => ({ key, value })),
      },
    ];
  },
};

export default nextConfig;
