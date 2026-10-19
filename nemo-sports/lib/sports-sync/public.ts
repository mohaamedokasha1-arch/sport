import type { RecordData } from "./model";
import { competitionByPath, EGYPT_CANONICAL_SLUG } from "@/lib/competition-catalog";

/** Stable directory order: the Egyptian Premier League, then other Egyptian
 * competitions actually discovered, then the rest. This never invents a
 * competition or publishes an empty catalog row. */
export function orderSyncedCompetitions(records: RecordData[]): RecordData[] {
  const egyptRank = (r: RecordData) => {
    if (competitionByPath(r.sourceKey)?.canonicalSlug === EGYPT_CANONICAL_SLUG) return 0;
    const name = String(r.data.name ?? "");
    const country = String(r.data.countryName ?? "");
    return r.data.countryCode === "EG" || /\bEgypt(?:ian)?\b|مصر/i.test(`${name} ${country}`) ? 1 : 2;
  };
  return [...records].sort((a, b) => egyptRank(a) - egyptRank(b) ||
    String(a.data.name ?? "").localeCompare(String(b.data.name ?? "")) ||
    a.provider.localeCompare(b.provider) || a.sourceKey.localeCompare(b.sourceKey));
}

export function syncedPath(r: RecordData): string {
  if (r.kind === "competition") {
    const known = ["football_data", "sportscore"].includes(r.provider) ? competitionByPath(r.sourceKey) : undefined;
    return `/competitions/${known?.canonicalSlug ?? r.slug}`;
  }
  return `/sports/${r.kind === "fixture" ? "matches" : r.kind === "team" ? "teams" : "players"}/${r.slug}`;
}
