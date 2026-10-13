import type { RecordData } from "./model";
import { competitionByPath } from "@/lib/competition-catalog";
export function syncedPath(r: RecordData): string {
  if (r.kind === "competition") {
    const known = ["football_data", "sportscore"].includes(r.provider) ? competitionByPath(r.sourceKey) : undefined;
    return `/competitions/${known?.canonicalSlug ?? r.slug}`;
  }
  return `/sports/${r.kind === "fixture" ? "matches" : r.kind === "team" ? "teams" : "players"}/${r.slug}`;
}
