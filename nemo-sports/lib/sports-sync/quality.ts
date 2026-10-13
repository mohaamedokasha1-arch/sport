import { fixtureErrors, freshness, keyOf, type RecordData } from "./model";
import type { NormalizedFixture } from "@/packages/sdl/src";
export type QualityIssue = { code: string; detail: string };
export function qualityChecks(records: RecordData[], now = Date.now()): QualityIssue[] {
  const issues: QualityIssue[] = [], keys = new Set<string>(), slugs = new Set<string>();
  const refs = new Set(records.map(r => keyOf(r.kind, r.provider, r.sourceKey)));
  for (const r of records) {
    const key = keyOf(r.kind, r.provider, r.sourceKey), slug = `${r.kind}:${r.slug}`;
    if (keys.has(key)) issues.push({ code: "duplicate_entity", detail: key }); keys.add(key);
    if (slugs.has(slug) || !r.slug.endsWith(`--${r.id}`)) issues.push({ code: "invalid_canonical_url", detail: key }); slugs.add(slug);
    for (const value of [r.firstSeenAt, r.lastSeenAt, r.lastSuccessAt].filter(Boolean)) if (!Number.isFinite(Date.parse(value!))) issues.push({ code: "invalid_timestamp", detail: key });
    if (freshness(r, now) === "stale" && r.kind !== "season") issues.push({ code: "stale_data", detail: `${key}: last success ${r.lastSuccessAt}; verify scheduler and provider` });
    if (r.kind === "fixture") {
      for (const error of fixtureErrors(r.data as unknown as NormalizedFixture)) issues.push({ code: "invalid_fixture", detail: `${key}: ${error}` });
      if (!refs.has(keyOf("competition", r.provider, r.competitionKey ?? ""))) issues.push({ code: "orphan_fixture", detail: key });
      for (const team of [r.data.homeProviderId, r.data.awayProviderId]) if (!refs.has(keyOf("team", r.provider, String(team)))) issues.push({ code: "orphan_team", detail: key });
    }
    if (["standings", "scorers"].includes(r.kind)) {
      if (r.data.competitionProviderId !== r.competitionKey || !records.some(s => s.kind === "season" && s.provider === r.provider && s.competitionKey === r.competitionKey && s.data.providerId === r.data.seasonProviderId)) issues.push({ code: "wrong_statistics_season", detail: key });
    }
  }
  return issues;
}
