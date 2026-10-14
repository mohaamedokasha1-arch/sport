/**
 * GET /ad-frame — the document a 300×250 Adsterra banner runs in.
 *
 * Why a route instead of inlining the snippet in a client component: the
 * Adsterra tag is synchronous by design and defines a single global
 * `atOptions` (see the long note in lib/ads.ts). Loading it here gives each
 * banner placement its own real document — its own `atOptions`, its own
 * `document.write` target — so two placements on the match page cannot
 * overwrite each other and a tag that falls back to `document.write()` can
 * never wipe the reader's page: the worst case is this 300×250 frame.
 *
 * Security: the snippet is the network's own code, so the frame is served with
 * `sandbox` on the embedding side (components/ads/AdsterraBanner.tsx blocks
 * top-level navigation and unsolicited popups) and with a policy that keeps
 * every reader page strict (lib/security-csp.ts): only this one path answers
 * `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN`, and it is
 * `no-store`, `noindex` and disallowed in robots.txt.
 */

import { adFrameDocument, adsEnabled } from "@/lib/ads";
import { adFrameSecurityHeaders } from "@/lib/security-csp";

// Never prerendered: the response carries per-request security headers and the
// placements must always be re-fetched (no impression may be served from a
// shared cache entry).
export const dynamic = "force-dynamic";

export function GET(): Response {
  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    ...adFrameSecurityHeaders(process.env.NODE_ENV === "development"),
  };

  // Ads switched off (NEXT_PUBLIC_ADS_ENABLED=0): answer an inert document
  // rather than 404 — an embedded frame must stay a stable box.
  if (!adsEnabled()) {
    return new Response("<!doctype html><title>إعلان</title>", { status: 200, headers });
  }

  return new Response(adFrameDocument(), { status: 200, headers });
}
