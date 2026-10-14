/**
 * NEMO Sports · Universal fixture discovery & coverage comparison
 * ─────────────────────────────────────────────────────────────────
 * Discovers fixtures — and, from them, competitions — for arbitrary
 * calendar dates (today, tomorrow, the day after, and any other date a
 * provider serves) without anyone hand-listing competitions first.
 *
 * Sources are ONLY the already-registered, authorised SDL providers
 * (SportScore keyless day feed, Football-Data.org, TheSportsDB, and any
 * keyed provider an operator configured). No new upstream, no HTML
 * scraping, and in particular no scraping of kooora.com: Kooora publishes
 * no public API we could verify, so it is used — if at all — only as a
 * manually supplied, licensed reference file for `compareCoverage()`
 * (see scripts/coverage-report.ts). When no reference is supplied this
 * module never claims a Kooora comparison happened.
 *
 * Rules that keep the output honest:
 *  · a failed provider/date is recorded in `errors` and never deletes or
 *    hides fixtures another provider did serve;
 *  · cross-source duplicates are merged by team identity + kickoff, with
 *    per-source provenance kept and every real disagreement (finished
 *    score, kickoff >15 min, status class) reported as a conflict —
 *    never silently averaged away;
 *  · a competition is "discovered" only when a real fixture carried it;
 *    discovery alone does not publish a page (publication stays the
 *    explicit decision in lib/competition-sync.ts).
 */
import { normalizeName, type NormalizedFixture, type ProviderName } from "@/packages/sdl/src";
import { competitionByPath } from "@/lib/competition-catalog";
import { isDateKey, shiftDateKey, siteDateKey } from "@/lib/tz";

export type SourcedFixture = { provider: string; fixture: NormalizedFixture };

export type MergedFixture = {
  fixture: NormalizedFixture;
  /** Every provider that carried this same tie, with its own id/status/score. */
  sources: { provider: string; providerId: string; scheduledAt: string; status: string; homeScore: number | null; awayScore: number | null }[];
};

export type FixtureConflict = {
  kind: "finished_score" | "kickoff" | "status_class" | "competition";
  home: string;
  away: string;
  detail: string;
};

export type DiscoveredCompetition = {
  provider: string;
  providerId: string;
  name: string | null;
  sport: string;
  matches: number;
  firstKickoff: string;
  lastKickoff: string;
  /** Public path when this competition is already in the canonical catalog. */
  canonicalPath: string | null;
  isNew: boolean;
};

const DAY_MS = 86_400_000;

/** Bounded, validated list of YYYY-MM-DD keys for a discovery window. */
export function discoveryDates(input: { from?: string; to?: string; daysBefore?: number; daysAfter?: number; now?: number } = {}): string[] {
  if (input.from || input.to) {
    const from = input.from ?? input.to!;
    const to = input.to ?? input.from!;
    if (!isDateKey(from) || !isDateKey(to)) throw new Error("invalid date: expected YYYY-MM-DD");
    const span = Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
    if (span < 0) throw new Error("invalid window: `to` is before `from`");
    if (span > 30) throw new Error("discovery window is bounded to 31 days per run");
    return Array.from({ length: span + 1 }, (_, i) => shiftDateKey(from, i));
  }
  const center = siteDateKey(input.now ?? Date.now());
  const before = Math.min(14, Math.max(0, input.daysBefore ?? 1));
  const after = Math.min(14, Math.max(0, input.daysAfter ?? 2));
  const out: string[] = [];
  for (let d = -before; d <= after; d++) out.push(shiftDateKey(center, d));
  return out;
}

const teamKey = (f: NormalizedFixture, side: "home" | "away"): string =>
  normalizeName(String(f[`${side}Name`] ?? f[`${side}ProviderId`] ?? ""));

/** Cross-source identity: same sport, same two clubs (order matters), kickoff within 3h. */
export function sameFixture(a: NormalizedFixture, b: NormalizedFixture): boolean {
  if (a.sport !== b.sport) return false;
  if (!teamKey(a, "home") || teamKey(a, "home") !== teamKey(b, "home")) return false;
  if (!teamKey(a, "away") || teamKey(a, "away") !== teamKey(b, "away")) return false;
  const dt = Math.abs(Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  return Number.isFinite(dt) && dt <= 3 * 3600_000;
}

const statusClass = (s: string): string =>
  ["live", "halftime", "extra_time", "extra_time_halftime", "penalty_shootout"].includes(s) ? "live"
    : s === "finished" ? "finished" : s === "scheduled" ? "scheduled" : "other";

/**
 * Merge sourced fixtures into unique ties. Provider order in the input is
 * the field-priority order: the first source wins for display fields, later
 * sources only fill gaps, and disagreements are reported, not hidden.
 */
export function dedupeFixtures(sourced: SourcedFixture[]): { unique: MergedFixture[]; duplicates: number; conflicts: FixtureConflict[] } {
  const unique: MergedFixture[] = [];
  const conflicts: FixtureConflict[] = [];
  let duplicates = 0;
  for (const { provider, fixture } of sourced) {
    const hit = unique.find((u) => sameFixture(u.fixture, fixture));
    if (!hit) {
      unique.push({ fixture, sources: [{ provider, providerId: fixture.providerId, scheduledAt: fixture.scheduledAt, status: fixture.status, homeScore: fixture.homeScore, awayScore: fixture.awayScore }] });
      continue;
    }
    duplicates++;
    hit.sources.push({ provider, providerId: fixture.providerId, scheduledAt: fixture.scheduledAt, status: fixture.status, homeScore: fixture.homeScore, awayScore: fixture.awayScore });
    const base = hit.fixture;
    if (base.status === "finished" && fixture.status === "finished" && (base.homeScore !== fixture.homeScore || base.awayScore !== fixture.awayScore)) {
      conflicts.push({ kind: "finished_score", home: teamKey(base, "home"), away: teamKey(base, "away"), detail: `${hit.sources[0].provider} ${base.homeScore}-${base.awayScore} vs ${provider} ${fixture.homeScore}-${fixture.awayScore} — first source retained, review required` });
    }
    if (Math.abs(Date.parse(base.scheduledAt) - Date.parse(fixture.scheduledAt)) > 15 * 60_000) {
      conflicts.push({ kind: "kickoff", home: teamKey(base, "home"), away: teamKey(base, "away"), detail: `kickoff differs: ${base.scheduledAt} (${hit.sources[0].provider}) vs ${fixture.scheduledAt} (${provider})` });
    }
    if (statusClass(base.status) !== statusClass(fixture.status)) {
      conflicts.push({ kind: "status_class", home: teamKey(base, "home"), away: teamKey(base, "away"), detail: `status class differs: ${base.status} (${hit.sources[0].provider}) vs ${fixture.status} (${provider})` });
    }
    if (base.competitionProviderId && fixture.competitionProviderId && normalizeName(base.competitionProviderId) !== normalizeName(fixture.competitionProviderId) && normalizeName(base.competitionName ?? "") !== normalizeName(fixture.competitionName ?? "")) {
      conflicts.push({ kind: "competition", home: teamKey(base, "home"), away: teamKey(base, "away"), detail: `competition differs: ${base.competitionName ?? base.competitionProviderId} vs ${fixture.competitionName ?? fixture.competitionProviderId}` });
    }
    // Fill only gaps — absence in one source is never a deletion in another.
    hit.fixture = {
      ...fixture,
      ...Object.fromEntries(Object.entries(base).filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))),
    } as NormalizedFixture;
  }
  unique.sort((a, b) => Date.parse(a.fixture.scheduledAt) - Date.parse(b.fixture.scheduledAt));
  return { unique, duplicates, conflicts };
}

/** Competitions actually observed in fixtures, split known vs newly discovered. */
export function discoverCompetitionsFromFixtures(unique: MergedFixture[]): DiscoveredCompetition[] {
  const byKey = new Map<string, DiscoveredCompetition & { providers: Set<string> }>();
  for (const { fixture, sources } of unique) {
    const providerId = fixture.competitionProviderId || fixture.competitionName || "unknown";
    const key = `${fixture.sport}::${normalizeName(providerId)}`;
    const known = competitionByPath(fixture.competitionProviderId || fixture.competitionName || "");
    const row = byKey.get(key) ?? {
      provider: sources.map((s) => s.provider).join(","), providerId, name: fixture.competitionName ?? null,
      sport: fixture.sport, matches: 0, firstKickoff: fixture.scheduledAt, lastKickoff: fixture.scheduledAt,
      canonicalPath: known ? `/competitions/${known.canonicalSlug}` : null, isNew: !known, providers: new Set<string>(),
    };
    row.matches++;
    row.providers.add(sources[0].provider);
    if (fixture.scheduledAt < row.firstKickoff) row.firstKickoff = fixture.scheduledAt;
    if (fixture.scheduledAt > row.lastKickoff) row.lastKickoff = fixture.scheduledAt;
    byKey.set(key, row);
  }
  return [...byKey.values()].map(({ providers, ...row }) => ({ ...row, provider: [...providers].join(",") }))
    .sort((a, b) => b.matches - a.matches || a.providerId.localeCompare(b.providerId));
}

/* ── coverage comparison (reference vs what our sources actually serve) ── */

export type ReferenceFixture = NormalizedFixture & { venueCity?: string | null; broadcastChannel?: string | null; referee?: string | null };

export type CoverageReport = {
  date: string | null;
  generatedAt: string;
  referenceSource: string;
  counts: { reference: number; actual: number; matched: number; missing: number; extra: number; duplicatesInActual: number };
  missingInActual: { home: string; away: string; kickoff: string; competition: string | null }[];
  extraInActual: { home: string; away: string; kickoff: string; competition: string | null }[];
  undiscoveredCompetitions: { providerId: string; name: string | null; missingMatches: number }[];
  teamNameMismatches: { reference: string; actual: string; providerId: string }[];
  kickoffMismatches: { home: string; away: string; referenceKickoff: string; actualKickoff: string; diffMinutes: number }[];
  statusMismatches: { home: string; away: string; referenceStatus: string; actualStatus: string }[];
  scoreMismatches: { home: string; away: string; referenceScore: string; actualScore: string }[];
  duplicatesInActual: { home: string; away: string; count: number }[];
  /** Fields the reference carries that no matched actual fixture provides. */
  fieldsNoSourceProvides: Record<string, number>;
};

const label = (f: NormalizedFixture) => ({ home: String(f.homeName ?? f.homeProviderId ?? ""), away: String(f.awayName ?? f.awayProviderId ?? "") });

/**
 * Compare a reference fixture list (e.g. a licensed export an operator is
 * authorised to use) against the fixtures our providers serve. Pure and
 * offline: the caller owns the right to use the reference data.
 */
export function compareCoverage(reference: ReferenceFixture[], actual: NormalizedFixture[], opts: { date?: string; referenceSource: string }): CoverageReport {
  const { unique, duplicates } = dedupeFixtures(actual.map((fixture) => ({ provider: "actual", fixture })));
  const used = new Set<number>();
  const report: CoverageReport = {
    date: opts.date ?? null, generatedAt: new Date().toISOString(), referenceSource: opts.referenceSource,
    counts: { reference: reference.length, actual: actual.length, matched: 0, missing: 0, extra: 0, duplicatesInActual: duplicates },
    missingInActual: [], extraInActual: [], undiscoveredCompetitions: [], teamNameMismatches: [],
    kickoffMismatches: [], statusMismatches: [], scoreMismatches: [], duplicatesInActual: [], fieldsNoSourceProvides: {},
  };
  const missingByComp = new Map<string, { providerId: string; name: string | null; missingMatches: number }>();
  // Duplicate detection inside the actual set itself (same provider id twice, or same tie twice).
  const seenIds = new Map<string, number>();
  for (const f of actual) seenIds.set(`${f.sport}::${f.providerId}`, (seenIds.get(`${f.sport}::${f.providerId}`) ?? 0) + 1);
  for (const f of actual) {
    const dupes = unique.filter((u) => teamKey(u.fixture, "home") === teamKey(f, "home") && teamKey(u.fixture, "away") === teamKey(f, "away") && u.fixture.sport === f.sport);
    if ((seenIds.get(`${f.sport}::${f.providerId}`) ?? 0) > 1 && !report.duplicatesInActual.some((d) => d.home === label(f).home)) {
      report.duplicatesInActual.push({ ...label(f), count: seenIds.get(`${f.sport}::${f.providerId}`)! });
    }
    void dupes;
  }

  for (const ref of reference) {
    const idx = unique.findIndex((u, i) => !used.has(i) && (sameFixture(u.fixture, ref) ||
      (u.fixture.sport === ref.sport && teamKey(u.fixture, "home") === teamKey(ref, "home") && teamKey(u.fixture, "away") === teamKey(ref, "away") && u.fixture.scheduledAt.slice(0, 10) === ref.scheduledAt.slice(0, 10))));
    if (idx < 0) {
      report.missingInActual.push({ ...label(ref), kickoff: ref.scheduledAt, competition: ref.competitionName ?? ref.competitionProviderId ?? null });
      const key = ref.competitionProviderId || ref.competitionName || "unknown";
      const row = missingByComp.get(key) ?? { providerId: key, name: ref.competitionName ?? null, missingMatches: 0 };
      row.missingMatches++;
      missingByComp.set(key, row);
      continue;
    }
    used.add(idx);
    report.counts.matched++;
    const act = unique[idx].fixture;
    if (String(act.homeName ?? "") !== String(ref.homeName ?? "") && teamKey(act, "home") === teamKey(ref, "home")) {
      report.teamNameMismatches.push({ reference: String(ref.homeName ?? ref.homeProviderId), actual: String(act.homeName ?? act.homeProviderId), providerId: act.providerId });
    }
    const diffMinutes = Math.round((Date.parse(act.scheduledAt) - Date.parse(ref.scheduledAt)) / 60_000);
    if (Math.abs(diffMinutes) > 15) report.kickoffMismatches.push({ ...label(ref), referenceKickoff: ref.scheduledAt, actualKickoff: act.scheduledAt, diffMinutes });
    if (statusClass(act.status) !== statusClass(ref.status)) report.statusMismatches.push({ ...label(ref), referenceStatus: ref.status, actualStatus: act.status });
    if (ref.status === "finished" && act.status === "finished" && (ref.homeScore !== act.homeScore || ref.awayScore !== act.awayScore)) {
      report.scoreMismatches.push({ ...label(ref), referenceScore: `${ref.homeScore}-${ref.awayScore}`, actualScore: `${act.homeScore}-${act.awayScore}` });
    }
    for (const field of ["venueName", "venueCity", "broadcastChannel", "referee"] as const) {
      const refVal = field === "venueName" ? ref.venueName : ref[field];
      const actVal = field === "venueName" ? act.venueName : null;
      if (refVal && !actVal) report.fieldsNoSourceProvides[field] = (report.fieldsNoSourceProvides[field] ?? 0) + 1;
    }
  }
  unique.forEach((u, i) => { if (!used.has(i)) report.extraInActual.push({ ...label(u.fixture), kickoff: u.fixture.scheduledAt, competition: u.fixture.competitionName ?? u.fixture.competitionProviderId ?? null }); });
  report.counts.missing = report.missingInActual.length;
  report.counts.extra = report.extraInActual.length;
  report.undiscoveredCompetitions = [...missingByComp.values()]
    .filter((c) => !competitionByPath(c.providerId || c.name || ""))
    .sort((a, b) => b.missingMatches - a.missingMatches);
  return report;
}

/* ── live discovery run over the registered SDL providers ── */

export type DiscoveryRun = {
  startedAt: string; finishedAt: string; dates: string[]; sports: string[];
  fetched: number; unique: number; duplicates: number;
  conflicts: FixtureConflict[];
  competitions: DiscoveredCompetition[];
  newCompetitions: DiscoveredCompetition[];
  perProvider: { provider: string; sport: string; date: string; fetched: number }[];
  errors: { provider: string; sport: string; date: string; message: string }[];
  fixtures: MergedFixture[];
};

/**
 * One bounded discovery pass. Every (provider, sport, date) is isolated:
 * a failure is recorded and the pass continues; fixtures already fetched
 * are kept regardless of later failures. Persistence is the caller's job
 * (sports-sync engine / competition-sync) — this run only proves coverage.
 */
export async function runFixtureDiscovery(input: { dates: string[]; sports?: string[] }): Promise<DiscoveryRun> {
  const { sdlContext } = await import("@/lib/sdl-gateway");
  const { sdl, mode } = await sdlContext();
  const startedAt = new Date().toISOString();
  const sports = input.sports?.length ? input.sports : ["football"];
  const sourced: SourcedFixture[] = [];
  const perProvider: DiscoveryRun["perProvider"] = [];
  const errors: DiscoveryRun["errors"] = [];
  if (mode === "demo") errors.push({ provider: "demo", sport: "*", date: "*", message: "demo_mode: no real provider registered — discovery not run" });
  for (const registered of mode === "demo" ? [] : sdl.registeredProviders()) {
    const provider = sdl.provider(registered.name)!;
    if (provider.name === "demo" || !provider.capabilities.includes("fixtures")) continue;
    for (const sport of sports.filter((s) => provider.supportedSports.includes(s))) {
      for (const date of input.dates) {
        const result = await sdl.fetch<NormalizedFixture[]>({
          provider: provider.name, sport, dataType: "fixtures", endpoint: "fixtures:discovery",
          params: { date, sport }, call: (p) => p.getFixtures({ sport, date }),
        });
        if (!result.ok) { errors.push({ provider: provider.name, sport, date, message: result.error.message }); continue; }
        if (result.value.stale) { errors.push({ provider: provider.name, sport, date, message: "stale_cache: not counted as a successful discovery" }); continue; }
        perProvider.push({ provider: provider.name, sport, date, fetched: result.value.data.length });
        for (const fixture of result.value.data) sourced.push({ provider: provider.name as ProviderName, fixture });
      }
    }
  }
  const { unique, duplicates, conflicts } = dedupeFixtures(sourced);
  const competitions = discoverCompetitionsFromFixtures(unique);
  return {
    startedAt, finishedAt: new Date().toISOString(), dates: input.dates, sports,
    fetched: sourced.length, unique: unique.length, duplicates, conflicts, competitions,
    newCompetitions: competitions.filter((c) => c.isNew), perProvider, errors, fixtures: unique,
  };
}
