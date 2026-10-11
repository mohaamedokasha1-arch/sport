import { isDateKey, shiftDateKey, siteDateKey } from "@/lib/tz";
import { PUBLIC_SPORTS } from "@/lib/core-data";

/** Relative date words accepted by the public pages AND the public API. */
export const DATE_TOKENS = ["today", "yesterday", "tomorrow"] as const;

/** `sport=all` asks for every public sport (the scope /matches and /live use by default). */
export const ALL_SPORTS = "all";

/** Exact provider/app states that can be selected in match filters. */
export const MATCH_FILTER_STATUSES = [
  "all",
  "live",
  "upcoming",
  "finished",
  "postponed",
  "cancelled",
  "suspended",
  "abandoned",
  "unconfirmed",
] as const;

export function validateMatchStatus(value: string | null | undefined): string | null {
  return value && !(MATCH_FILTER_STATUSES as readonly string[]).includes(value)
    ? "Unsupported status"
    : null;
}

/**
 * `?date=` → a Cairo calendar key. /matches has always accepted
 * `today|yesterday|tomorrow` while /api/v1/matches rejected them with
 * "Expected a valid YYYY-MM-DD date", so the page and its API could not be
 * compared for the same request. Both now share this resolver.
 */
export function resolveDateParam(value: string | null | undefined, now: number | Date = Date.now()): string | null {
  if (!value) return null;
  if (isDateKey(value)) return value;
  const today = siteDateKey(now);
  if (value === "today") return today;
  if (value === "yesterday") return shiftDateKey(today, -1);
  if (value === "tomorrow") return shiftDateKey(today, 1);
  return null;
}

export function validateMatchQuery(params: URLSearchParams): string | null {
  for (const key of ["sport", "date", "competition", "events", "team", "status"]) {
    const values = params.getAll(key);
    if (values.length > 1 || values.some((v) => v.length > 160 || /[\x00-\x1f\x7f]/.test(v))) return "Invalid query parameters";
  }
  const sport = params.get("sport");
  if (sport && sport !== ALL_SPORTS && !PUBLIC_SPORTS.some((s) => s.slug === sport)) return "Unsupported sport";
  const date = params.get("date");
  if (date !== null && resolveDateParam(date) === null) return "Expected a valid YYYY-MM-DD date (Africa/Cairo) or today|yesterday|tomorrow";
  const statusError = validateMatchStatus(params.get("status"));
  if (statusError) return statusError;
  return null;
}
