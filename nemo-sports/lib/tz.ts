/**
 * NEMO Sports · centralized timezone handling
 * ───────────────────────────────────────────
 * One source of truth for how the site renders dates and times. The site
 * faces Egypt, so every display-layer date/time (lib/format.ts, the
 * "today / tomorrow" grouping in lib/filters.ts and the clocks rendered by
 * components) is anchored to Africa/Cairo instead of the server's timezone
 * (UTC on Vercel) or the viewer's device timezone. Because the anchor is
 * explicit, server-rendered HTML and client hydration always produce the
 * same string.
 *
 * Scope note: this is the DISPLAY timezone. Provider query semantics stay
 * exactly as they were — football-data.org matches on UTC matchdays
 * (see `dayKey()` in lib/football-data.ts) and the SDL adapters filter on
 * the ISO day strings the providers themselves return.
 */

/** The site's single display timezone. */
export const SITE_TZ = "Africa/Cairo";

export type SiteDayParts = {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–31 */
  date: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  /** 0–23 */
  hours: number;
  /** 0–59 */
  minutes: number;
};

let fmt: Intl.DateTimeFormat | null = null;

function formatter(): Intl.DateTimeFormat {
  fmt ??= new Intl.DateTimeFormat("en-US", {
    timeZone: SITE_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return fmt;
}

/** Calendar parts of an instant, in the site timezone. */
export function siteParts(input: string | number | Date): SiteDayParts {
  const parts: Record<string, string> = {};
  for (const p of formatter().formatToParts(new Date(input))) parts[p.type] = p.value;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    date: Number(parts.day),
    weekday: weekday < 0 ? 0 : weekday,
    // hour12:false can yield "24" for midnight in some engines
    hours: Number(parts.hour) % 24,
    minutes: Number(parts.minute),
  };
}

/**
 * UTC epoch (ms) of midnight of the SITE_TZ calendar day an instant falls
 * in — the stable basis for "yesterday / today / tomorrow" day boundaries.
 */
export function siteDay(input: string | number | Date): number {
  const p = siteParts(input);
  return Date.UTC(p.year, p.month - 1, p.date);
}
