/**
 * Ingestion - the only code path that writes canonical entities.
 * ─────────────────────────────────────────────────────────────
 * Providers are never touched here: everything arrives through the SDL, which
 * has already normalised, de-duplicated and conflict-checked it. This job's
 * single responsibility is turning normalised payloads into canonical rows
 * (NEMO UUIDs) plus the provider↔canonical mapping that makes the next run
 * cheaper and keeps canonical ids stable forever (Instruction 4).
 *
 * Cost discipline (Instruction 9): competitions and teams are resolved from
 * the mapping table first, and a provider is only called for an entity we have
 * genuinely never seen. Live matches come from one request per sport, not one
 * per match.
 */

import {
  CanonicalMapper,
  ConflictDetector,
  EntityResolver,
  canonicalId,
  type CanonicalStore,
  type NormalizedCompetition,
  type ProviderName,
  type UUID,
} from "@/packages/sdl/src";
import { getCanonicalStore } from "@/lib/db/pg";
import { sdlContext } from "@/lib/sdl-gateway";

export type IngestEntityReport = {
  competitions: { resolved: number; created: number };
  teams: { resolved: number; created: number; fetchedFromProvider: number };
  matches: { upserted: number; created: number; conflicts: number };
};

export type IngestReport =
  | { ok: true; sport: string; provider: ProviderName; startedAt: string; finishedAt: string; ms: number; entities: IngestEntityReport }
  | { ok: false; reason: "no_database" | "no_live_data" | "provider_failed" | "demo_mode"; detail: string };

/** Build the mapper once per ingestion run, bound to the durable store. */
function buildMapper(store: CanonicalStore, chainFor: (sport: string, competition: string | null, dataType: "fixtures" | "standings") => { provider: ProviderName }[]) {
  return new CanonicalMapper({
    store,
    resolver: new EntityResolver(store),
    conflicts: new ConflictDetector(),
    primaryProviderFor: (competition, dataType) => chainFor("football", competition, dataType)[0]?.provider ?? null,
  });
}

/**
 * Pull the live board for one sport and land it in the canonical store.
 *
 * Returns a structured failure instead of throwing: a cron caller must be able
 * to log "no database configured" without a stack trace every five minutes.
 */
export async function ingestSport(sport = "football"): Promise<IngestReport> {
  const started = Date.now();
  const store = await getCanonicalStore();
  if (!store) {
    return { ok: false, reason: "no_database", detail: "DATABASE_URL غير مضبوط — لا يوجد مخزن كنسي دائم للكتابة فيه" };
  }

  const { sdl, mode } = await sdlContext();
  if (mode === "demo") {
    // Ingestion of demo fixtures would pollute the canonical store with data
    // that must never be indexed (Instruction 6).
    return { ok: false, reason: "demo_mode", detail: "الطبقة تعمل على محوّل تجريبي؛ الاستيعاب متوقف حتى تُضاف مفاتيح المزوّدين" };
  }

  const live = await sdl.fetch({
    sport,
    dataType: "live_matches",
    endpoint: "live",
    params: { sport },
    call: (p) => p.getLiveMatches({ sport }),
  });
  if (!live.ok) return { ok: false, reason: "provider_failed", detail: live.error.message };
  if (live.value.data.length === 0) return { ok: false, reason: "no_live_data", detail: "لا مباريات مباشرة الآن" };

  const provider = live.value.provider;
  const mapper = buildMapper(store, (s, c, d) => sdl.chainFor(s, c, d));
  const report: IngestEntityReport = {
    competitions: { resolved: 0, created: 0 },
    teams: { resolved: 0, created: 0, fetchedFromProvider: 0 },
    matches: { upserted: 0, created: 0, conflicts: 0 },
  };

  const sportId = canonicalId("sport", sport);
  const competitionIds = new Map<string, UUID>();
  const teamIds = new Map<string, UUID>();

  /* ── 1. competitions: one provider call per unseen competition ── */
  const competitionProviderIds = [...new Set(live.value.data.map((f) => f.competitionProviderId))];
  for (const cid of competitionProviderIds) {
    const existing = await store.mappings.find("competition", provider, cid);
    if (existing) {
      competitionIds.set(cid, existing.canonicalId);
      report.competitions.resolved++;
      continue;
    }
    const fetched = await sdl.fetch({
      sport,
      dataType: "competition",
      endpoint: "competition",
      params: { providerCompetitionId: cid },
      call: (p) => p.getCompetition({ providerCompetitionId: cid }),
    });
    const normalized: NormalizedCompetition = fetched.ok
      ? fetched.value.data
      : { providerId: cid, name: `competition ${cid}`, shortName: null, countryCode: null, countryName: null, type: null, logoUrl: null };
    const id = await mapper.upsertCompetition(provider, normalized, sportId);
    competitionIds.set(cid, id);
    report.competitions.created++;
  }

  /* ── 2. teams: mapping table first, provider only when truly unseen ── */
  const teamProviderIds = [...new Set(live.value.data.flatMap((f) => [f.homeProviderId, f.awayProviderId]).filter((x): x is string => !!x))];
  for (const tid of teamProviderIds) {
    const existing = await store.mappings.find("team", provider, tid);
    if (existing) {
      teamIds.set(tid, existing.canonicalId);
      report.teams.resolved++;
      continue;
    }
    const fetched = await sdl.fetch({
      sport,
      dataType: "team",
      endpoint: "team",
      params: { providerTeamId: tid },
      call: (p) => p.getTeam({ providerTeamId: tid }),
    });
    if (!fetched.ok) continue; // an unresolved team is skipped, never invented
    const res = await mapper.upsertTeam(provider, fetched.value.data, sportId);
    teamIds.set(tid, res.id);
    report.teams.fetchedFromProvider++;
    if (res.needsReview) report.teams.created++;
  }

  /* ── 3. matches: dedup + conflict detection live inside the mapper ── */
  for (const fixture of live.value.data) {
    const competitionId = competitionIds.get(fixture.competitionProviderId);
    if (!competitionId) continue;
    const homeTeamId = fixture.homeProviderId ? teamIds.get(fixture.homeProviderId) ?? null : null;
    const awayTeamId = fixture.awayProviderId ? teamIds.get(fixture.awayProviderId) ?? null : null;

    const out = await mapper.upsertMatch(
      provider,
      fixture,
      { sportId, competitionId, seasonId: null, homeTeamId, awayTeamId },
      sdl.chainFor(sport, fixture.competitionProviderId, "fixtures")[0]?.provider ?? null,
    );
    report.matches.upserted++;
    if (out.created) report.matches.created++;
    report.matches.conflicts += out.conflicts;
  }

  return {
    ok: true,
    sport,
    provider,
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
    ms: Date.now() - started,
    entities: report,
  };
}
