/**
 * NEMO Sports · Pipeline · normalizer helpers
 * ───────────────────────────────────────────
 * Provider payloads are hostile input: fields arrive as strings, numbers,
 * nulls, `"0"`, `"45+2'"`, or are missing entirely. These helpers coerce
 * without throwing, so a single malformed row becomes one skipped row instead
 * of a failed run — and the count of skipped rows is always reported.
 */

export const rec = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function bool(v: unknown): boolean {
  return v === true || v === "true" || v === "1" || v === 1;
}

/** Read a nested path: `pick(obj, "score.fullTime.home")`. */
export function pick(root: unknown, path: string): unknown {
  let cursor: unknown = root;
  for (const part of path.split(".")) {
    const node = rec(cursor);
    if (!node) return undefined;
    cursor = node[part];
  }
  return cursor;
}

/** First non-empty of the given paths — providers rename fields between versions. */
export function pickAny(root: unknown, paths: string[]): unknown {
  for (const path of paths) {
    const value = pick(root, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

/**
 * Season label from a start/end date pair: a football season that starts in
 * July or later of year N is "N-N+1", anything else is the calendar year.
 */
export function seasonNameFromDates(start: string | null, end: string | null): string | null {
  const startYear = start ? Number(start.slice(0, 4)) : null;
  if (!startYear || !Number.isFinite(startYear)) return null;
  const startMonth = start && start.length >= 7 ? Number(start.slice(5, 7)) : null;
  const endYear = end ? Number(end.slice(0, 4)) : null;
  if (startMonth !== null && startMonth >= 7 && endYear && endYear > startYear) return `${startYear}-${endYear}`;
  if (startMonth !== null && startMonth >= 7) return `${startYear}-${startYear + 1}`;
  if (endYear && endYear > startYear) return `${startYear}-${endYear}`;
  return String(startYear);
}

/** ISO-8601 in UTC, or null when the provider gave something unusable. */
export function iso(v: unknown): string | null {
  const raw = str(v);
  if (!raw) return null;
  // Providers that omit a timezone mean the local kickoff of the competition's
  // country; a date-only value at midnight UTC is the safe interpretation and
  // is what the caller gets. Never guess a timezone offset.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw;
  const date = new Date(normalized);
  return Number.isNaN(+date) ? null : date.toISOString();
}

/** `HH:MM:SS` or `HH:MM` on a given `YYYY-MM-DD` → ISO, treating it as UTC. */
export function isoFromDateAndTime(date: string | null, time: string | null): string | null {
  if (!date) return null;
  const clock = (time ?? "00:00:00").slice(0, 8);
  const padded = /^\d{1,2}:\d{2}$/.test(clock) ? `${clock.split(":")[0]!.padStart(2, "0")}:${clock.split(":")[1]}` : clock;
  return iso(`${date}T${padded}Z`);
}

/** Strip HTML tags and collapse whitespace — HTML tables are text, not markup. */
export function text(v: unknown): string | null {
  const raw = str(v);
  if (!raw) return null;
  const decoded = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;?/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x?([0-9a-f]+);/gi, (_m, hex: string) => {
      const code = /^x/i.test(String(hex)) ? Number.parseInt(String(hex).slice(1), 16) : Number.parseInt(String(hex), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    });
  const collapsed = decoded.replace(/\s+/g, " ").trim();
  return collapsed === "" ? null : collapsed;
}

/** Deterministic fallback id when a provider record carries none. */
export function derivedId(...parts: (string | number | null | undefined)[]): string {
  return parts
    .map((p) => String(p ?? "").trim().toLowerCase().replace(/\s+/g, "-"))
    .filter(Boolean)
    .join(":");
}
