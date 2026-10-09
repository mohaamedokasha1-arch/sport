import { isDateKey } from "@/lib/tz";
import { PUBLIC_SPORTS } from "@/lib/core-data";

export function validateMatchQuery(params: URLSearchParams): string | null {
  for (const key of ["sport", "date", "competition", "events", "team", "status"]) {
    const values = params.getAll(key);
    if (values.length > 1 || values.some((v) => v.length > 160 || /[\x00-\x1f\x7f]/.test(v))) return "Invalid query parameters";
  }
  const sport = params.get("sport");
  if (sport && !PUBLIC_SPORTS.some((s) => s.slug === sport)) return "Unsupported sport";
  const date = params.get("date");
  if (date !== null && !isDateKey(date)) return "Expected a valid YYYY-MM-DD date (Africa/Cairo)";
  const status = params.get("status");
  if (status && !["all", "live", "upcoming", "finished"].includes(status)) return "Unsupported status";
  return null;
}
