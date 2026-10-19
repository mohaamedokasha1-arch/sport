import { createHash } from "node:crypto";
import { slugify, type NormalizedFixture, type ProviderName } from "@/packages/sdl/src";
import { isLiveStatus, isFinishedStatus } from "@/lib/match-state";

export type Kind = "competition" | "season" | "fixture" | "team" | "player" | "standings" | "scorers";
export type Job = "catalog" | "seasons" | "matchday" | "upcoming" | "live" | "results" | "statistics" | "metadata" | "backfill" | "quality";
export const JOBS: Job[] = ["catalog", "seasons", "matchday", "upcoming", "live", "results", "statistics", "metadata", "backfill", "quality"];
// The matchday job keeps the full football day feed fresh independently of the
// 50-match live widget and the much slower catalog/backfill queue.
export const CADENCE: Record<Job, number> = { catalog: 86400, seasons: 86400, matchday: 600, upcoming: 3600, live: 60, results: 900, statistics: 21600, metadata: 604800, backfill: 3600, quality: 86400 };
export type RecordData = {
  id: string; canonicalId?: string; kind: Kind; provider: ProviderName; sourceKey: string; slug: string;
  competitionKey: string | null; sport: string; data: Record<string, unknown>;
  firstSeenAt: string; lastSeenAt: string; lastSuccessAt: string | null;
  availability: "available" | "unconfirmed"; provenance: Record<string, { provider: string; observedAt: string }>;
};
export type State = { cursor: string | null; page: string | null; pageCount: number; lastSuccessAt: string | null; lastAttemptAt: string | null; error: string | null };
export const emptyState = (): State => ({ cursor: null, page: null, pageCount: 0, lastSuccessAt: null, lastAttemptAt: null, error: null });
export type Run = { id: string; job: Job; status: "running" | "success" | "partial" | "failed" | "skipped"; startedAt: string; finishedAt: string | null; durationMs: number; fetched: number; inserted: number; updated: number; entities: Partial<Record<Kind, { fetched: number; inserted: number; updated: number }>>; failures: string[]; tasks: number; checkpoint: string | null };
export const keyOf = (kind: Kind, provider: string, key: string) => `${kind}:${provider}:${key}`;
export const seasonKey = (competition: string, season: string) => `${competition}/${season}`;

export function makeRecord(kind: Kind, provider: ProviderName, sourceKey: string, sport: string, data: Record<string, unknown>, at: string, previous?: RecordData, competitionKey: string | null = null): RecordData {
  // Provider IDs are opaque, case-sensitive keys; do not normalize them like names.
  const hex = createHash("sha256").update(JSON.stringify([kind, provider, sourceKey])).digest("hex").slice(0, 32);
  const id = previous?.id ?? `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
  const name = String(data.name ?? data.fullName ?? (kind === "fixture" ? `${data.homeName ?? ""}-vs-${data.awayName ?? ""}` : ""));
  // Full UUID avoids slug collisions; prefix is persisted and never renamed.
  const slug = previous?.slug ?? `${slugify(name) || kind}--${id}`;
  const merged = { ...previous?.data };
  const provenance = { ...previous?.provenance };
  for (const [field, value] of Object.entries(data)) {
    if (value === undefined || value === "" || (value === null && field in merged)) continue; // absence is not a deletion
    merged[field] = value;
    provenance[field] = { provider, observedAt: at };
  }
  return { id, canonicalId: previous?.canonicalId ?? id, kind, provider, sourceKey, slug, sport, competitionKey, data: merged, provenance,
    firstSeenAt: previous?.firstSeenAt ?? at, lastSeenAt: at, lastSuccessAt: at, availability: "available" };
}

const STATUSES = new Set(["scheduled", "live", "halftime", "extra_time", "extra_time_halftime", "penalty_shootout", "finished", "postponed", "cancelled", "suspended", "abandoned", "walkover", "awarded"]);
export function fixtureErrors(f: NormalizedFixture, competition?: string): string[] {
  const errors: string[] = [];
  if (!f.providerId || !f.competitionProviderId || !f.homeProviderId || !f.awayProviderId || !f.homeName || !f.awayName) errors.push("missing fixture/competition/team identity");
  if (competition && f.competitionProviderId !== competition) errors.push("fixture linked to wrong competition");
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(f.scheduledAt) || !Number.isFinite(Date.parse(f.scheduledAt))) errors.push("invalid/missing timezone-aware kickoff");
  if (!STATUSES.has(f.status)) errors.push(`unknown status ${f.status}`);
  if ([f.homeScore, f.awayScore].some(s => s !== null && (!Number.isInteger(s) || s < 0))) errors.push("invalid score");
  if (f.status === "finished" && (f.homeScore === null || f.awayScore === null)) errors.push("finished fixture lacks final score");
  if (f.status === "scheduled" && (f.homeScore !== null || f.awayScore !== null)) errors.push("scheduled fixture carries scores");
  if (f.homeProviderId && f.homeProviderId === f.awayProviderId) errors.push("identical opposing teams");
  return errors;
}
export function classification(status: string): "live" | "completed" | "upcoming" | "other" {
  return isLiveStatus(status) ? "live" : isFinishedStatus(status) ? "completed" : status === "scheduled" ? "upcoming" : "other";
}
export function indexWorthy(c: RecordData, fixtures: RecordData[]): boolean {
  return c.kind === "competition" && !!c.data.name && fixtures.some(f => f.provider === c.provider && f.competitionKey === c.sourceKey && fixtureErrors(f.data as unknown as NormalizedFixture, c.sourceKey).length === 0);
}
export function freshness(record: RecordData, now = Date.now()): "missing" | "stale" | "fresh" {
  if (!record.lastSuccessAt) return "missing";
  const ttl = record.kind === "fixture" && classification(String(record.data.status)) === "live" ? 180 : record.kind === "competition" ? 7 * 86400 : 2 * 86400;
  return now - Date.parse(record.lastSuccessAt) > ttl * 1000 ? "stale" : "fresh";
}
