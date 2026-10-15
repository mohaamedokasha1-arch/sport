/**
 * Single source of truth for the Content-Security-Policy.
 *
 * Used by next.config.ts (every route) and middleware.ts (/admin/* and the
 * privileged API routes). Both must agree: the admin panel is a Next.js app
 * with inline hydration scripts and inline styles, so a stricter policy there
 * blocks the whole panel (login page renders blank). Keep the admin on the
 * same directives and add protection with auth, CSRF checks and no-store
 * caching instead.
 *
 * Ads (lib/ads.ts) need three things from this file, and nothing more:
 *   · the Adsterra hosts in `script-src` (the Social Bar, the Anti-Adblock
 *     Popunder on furydonkeypharmacy.com and the banner `invoke.js` are all
 *     external scripts) and in `connect-src` (their beacons);
 *   · `frame-src` already lists `https:`, which covers the ad creatives the
 *     banner frame nests;
 *   · `AD_FRAME_PATH` must be embeddable BY US, so that one route answers with
 *     `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN` instead of the
 *     site-wide `'none'` / `DENY`. Every other URL keeps the strict pair.
 *
 * When `NEXT_PUBLIC_ADS_ENABLED=0` the hosts are dropped, so an ad-free build
 * also ships an ad-free policy.
 */

import { AD_SCRIPT_HOSTS, adsEnabled } from "./ads";
import { GOOGLE_ANALYTICS_CONNECT_HOSTS, GOOGLE_ANALYTICS_SCRIPT_HOST } from "./analytics";

/** The one first-party route the match page is allowed to frame. */
export const AD_FRAME_PATH = "/ad-frame";

export type CspOptions = {
  /**
   * Who may put THIS document in a frame. `'none'` for every reader page (the
   * site is never meant to be embedded); `'self'` only for AD_FRAME_PATH. A
   * preview run may add an origin allowlist instead — see
   * `siteFrameAncestors()`. `frame-ancestors` never falls back to default-src,
   * so it is always set.
   */
  frameAncestors?: string;
  /** Ad creatives may reference remote media; reader pages do not need it. */
  remoteMedia?: boolean;
};

/**
 * Opt-in escape hatch for the hosted preview sandbox.
 * ─────────────────────────────────────────────────────────────────────────
 * The site is deliberately unframeable (`frame-ancestors 'none'` +
 * `X-Frame-Options: DENY`): nothing may wrap nemo-sports, and that pair is
 * asserted by `npm run smoke` and `npm run ads:test`.
 *
 * A hosted preview, however, is exactly that — an iframe. Setting
 * `NEMO_PREVIEW_FRAME_ORIGINS` to the preview origin(s) (comma or space
 * separated, e.g. `https://3000-abc123.e2b.app`) relaxes the pair to
 * `frame-ancestors 'self' <origins>` and drops `X-Frame-Options`, which cannot
 * express a wildcard allowlist and would win over CSP in older browsers.
 *
 * Unset (the default, and always in CI and production) means the strict pair,
 * byte for byte what the tests pin.
 *
 * Timing matters: Next.js serialises the `headers()` rules from next.config.ts
 * into the BUILD output, so this variable is read at `npm run build` time, not
 * at `npm start` time. A preview is therefore a build of its own — set the
 * variable, build, start — and a plain `npm run build` restores the strict
 * artifacts. `npm run smoke` says so out loud if it is pointed at a preview
 * build.
 */
export function previewFrameOrigins(raw: string | undefined = process.env.NEMO_PREVIEW_FRAME_ORIGINS): string[] {
  return (raw ?? "")
    .split(/[\s,]+/)
    .map((origin) => origin.trim())
    .filter((origin) => /^https?:\/\/[a-z0-9.*-]+(:\d+)?$/i.test(origin));
}

/** `frame-ancestors` for reader pages: the strict default unless a preview run opted in. */
export function siteFrameAncestors(origins: string[] = previewFrameOrigins()): string {
  return origins.length > 0 ? ["'self'", ...origins].join(" ") : "'none'";
}

export function contentSecurityPolicy(isDev: boolean, options: CspOptions = {}): string {
  const { frameAncestors = "'none'", remoteMedia = false } = options;
  const adHosts = adsEnabled() ? AD_SCRIPT_HOSTS : [];
  const extra = adHosts.length > 0 ? ` ${adHosts.join(" ")}` : "";
  return [
    "default-src 'self'",
    isDev
      ? `script-src 'self' 'unsafe-inline' 'unsafe-eval'${extra} ${GOOGLE_ANALYTICS_SCRIPT_HOST}`
      : `script-src 'self' 'unsafe-inline'${extra} ${GOOGLE_ANALYTICS_SCRIPT_HOST}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data:",
    "font-src 'self' data:",
    `connect-src 'self'${extra} ${GOOGLE_ANALYTICS_CONNECT_HOSTS.join(" ")}`,
    remoteMedia ? "media-src 'self' https:" : "media-src 'self'",
    // Match-page live players (components/match/MatchStreamPlayer.tsx) and the
    // 300×250 ad frames (components/ads/AdsterraBanner.tsx → /ad-frame) are
    // both <iframe>s; `frame-src` falls back to default-src ('self') without
    // this line, which would blank every external player. Live players are only
    // rendered for matches that have a source registered in
    // lib/match-streams.ts; `https:` keeps future provider hosts working from
    // the admin/data source without a redeploy.
    "frame-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
  ].join("; ");
}

/**
 * Headers for the banner route only (app/ad-frame/route.ts and the matching
 * next.config.ts rule). The document must be frameable by its own origin, so
 * the site-wide clickjacking pair is relaxed exactly here — never elsewhere —
 * and the response must never be cached or indexed.
 */
export function adFrameSecurityHeaders(isDev: boolean): Record<string, string> {
  return {
    "Content-Security-Policy": contentSecurityPolicy(isDev, {
      frameAncestors: "'self'",
      remoteMedia: true,
    }),
    "X-Frame-Options": "SAMEORIGIN",
    "X-Robots-Tag": "noindex, nofollow",
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };
}
