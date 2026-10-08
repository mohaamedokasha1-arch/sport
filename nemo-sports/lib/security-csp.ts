/**
 * Single source of truth for the Content-Security-Policy.
 *
 * Used by next.config.ts (every route) and middleware.ts (/admin/* and the
 * privileged API routes). Both must agree: the admin panel is a Next.js app
 * with inline hydration scripts and inline styles, so a stricter policy there
 * blocks the whole panel (login page renders blank). Keep the admin on the
 * same directives and add protection with auth, CSRF checks and no-store
 * caching instead.
 */

export function contentSecurityPolicy(isDev: boolean): string {
  return [
    "default-src 'self'",
    isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
      : "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self'",
    // Match-page live players (components/match/MatchStreamPlayer.tsx) embed
    // the registered per-match source in an <iframe>. `frame-src` falls back
    // to default-src ('self') without this line, which would blank every
    // external player. Frames are only rendered for matches that have a
    // source registered in lib/match-streams.ts; `https:` keeps future
    // provider hosts working from the admin/data source without a redeploy.
    "frame-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
