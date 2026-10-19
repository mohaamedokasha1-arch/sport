/** Bounded source-local synchronization. No catalog guesses, demo writes or destructive replacement. */
import { randomUUID } from "node:crypto";
import { shiftDateKey, siteDateKey } from "@/lib/tz";
import type { DataType, DateRange, NormalizedCatalogCompetition, NormalizedFixture, NormalizedSeason, NormalizedStandingRow, NormalizedTopScorer, ProviderResult, SportsDataProvider } from "@/packages/sdl/src";
import { CADENCE, fixtureErrors, keyOf, makeRecord, seasonKey, type Job, type Kind, type RecordData, type Run } from "./model";
import { qualityChecks } from "./quality";
import type { SyncStore } from "./store";

export interface SyncTransport {
  providers: SportsDataProvider[];
  call<T>(provider: SportsDataProvider, sport: string, type: DataType, params: Record<string, unknown>, call: (p: SportsDataProvider) => Promise<ProviderResult<T>>): Promise<{ data: T; at: string }>;
}
type Task = { key: string; p: SportsDataProvider; sport: string; type: DataType; competition?: RecordData; season?: NormalizedSeason; range?: DateRange; entity?: RecordData };
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAY = 86400000;
/** Half-open UTC windows, with overlapping provider boundaries deduplicated by source ID. */
export function windows(from: string, to: string, days: number): DateRange[] {
  const start = Date.parse(from), end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error("invalid window dates");
  if (end - start > 730 * DAY) throw new Error("season exceeds bounded 730-day backfill; operator review required");
  const out: DateRange[] = [];
  for (let at = start; at < end; at += Math.max(1, Math.min(7, days)) * DAY) out.push({ from: isoDay(at), to: isoDay(Math.min(end, at + Math.max(1, Math.min(7, days)) * DAY)) });
  return out;
}
function plan(job: Job, providers: SportsDataProvider[], records: RecordData[], now: number): Task[] {
  const tasks: Task[] = [];
  const add = (t: Omit<Task, "key">, suffix: string) => tasks.push({ ...t, key: `${t.p.name}|${t.sport}|${t.competition?.sourceKey ?? ""}|${suffix}` });
  // A Cairo day can straddle two UTC dates. Yesterday UTC covers late games
  // still in play after midnight; tomorrow UTC covers the next Cairo day.
  const today = siteDateKey(now);
  const matchdayDays = [today, shiftDateKey(today, -1), shiftDateKey(today, 1)];
  for (const p of providers.filter(p => p.name !== "demo")) {
    if (job === "matchday") {
      // Only a VERIFIED unscoped day endpoint can discover every competition
      // represented in its answer. Never turn the 50-match widget into a
      // purportedly complete league schedule, nor guess a competition ID.
      if (p.syncFixturesAreUnscoped && p.capabilities.includes("fixtures") && p.supportedSports.includes("football")) {
        for (const day of matchdayDays) add({ p, sport: "football", type: "fixtures", range: { from: day, to: shiftDateKey(day, 1) } }, `matchday:${day}`);
      }
    } else if (job === "catalog" && p.capabilities.includes("competitions")) {
      for (const sport of p.supportedSports) add({ p, sport, type: "competitions" }, "catalog");
    } else if (job === "live" && p.capabilities.includes("live_matches")) {
      for (const sport of p.supportedSports) add({ p, sport, type: "live_matches" }, "live");
    } else if (["upcoming", "results"].includes(job) && p.syncFixturesAreUnscoped && p.capabilities.includes("fixtures")) {
      for (const sport of p.supportedSports) {
        const from = isoDay(now - (job === "results" ? 7 : 1) * DAY), to = isoDay(now + (job === "results" ? 1 : 30) * DAY);
        for (const range of windows(from, to, 1)) add({ p, sport, type: "fixtures", range }, `all-fixtures:${range.from}`);
      }
    } else if (job === "metadata") {
      for (const entity of records.filter(r => r.provider === p.name && ["team", "player"].includes(r.kind))) {
        if (now - Date.parse(String(entity.data.metadataFetchedAt ?? entity.firstSeenAt)) < CADENCE.metadata * 1000 && entity.data.metadataVerified) continue;
        const type = entity.kind === "team" ? "team" : "player";
        if (p.capabilities.includes(type)) add({ p, sport: entity.sport, type, entity }, `${type}:${entity.sourceKey}`);
      }
    } else {
      for (const competition of records.filter(r => r.kind === "competition" && r.provider === p.name)) {
        const sport = competition.sport;
        const seasons = records.filter(r => r.kind === "season" && r.provider === p.name && r.competitionKey === competition.sourceKey).map(r => r.data as unknown as NormalizedSeason);
        if (job === "seasons" && p.capabilities.includes("competition_seasons")) add({ p, sport, type: "competition_seasons", competition }, "seasons");
        if (job === "statistics") {
          // Never substitute a fixture ID for a season query value or standings ID.
          // Only an adapter's verified current-season query value permits statistics.
          const season = seasons.find(s => s.isCurrent && s.queryValue);
          if (season) for (const type of ["standings", "top_scorers"] as const) if (p.capabilities.includes(type)) add({ p, sport, type, competition, season }, `${type}:${season.providerId}`);
        }
        if (["upcoming", "results", "backfill"].includes(job) && p.capabilities.includes("fixtures")) {
          const spans = job === "backfill"
            ? seasons.filter(s => s.startDate && s.endDate).map(season => ({ season, from: season.startDate!, to: isoDay(Date.parse(season.endDate!) + DAY) }))
            : [{ season: seasons.find(s => s.isCurrent), from: isoDay(now - (job === "results" ? 7 : 1) * DAY), to: isoDay(now + (job === "results" ? 1 : 30) * DAY) }];
          for (const span of spans) for (const range of windows(span.from, span.to, p.syncWindowDays ?? 1)) add({ p, sport, type: "fixtures", competition, season: span.season, range }, `fixtures:${span.season?.providerId ?? "current"}:${range.from}:${range.to}`);
        }
      }
    }
  }
  if (job === "matchday") {
    // Egypt is first inside the unscoped football feed; ask SportScore (the
    // keyless source) and TODAY before spending the batch on older/later days.
    // Keep a deterministic order so a checkpoint can resume on the next run.
    return tasks.sort((a, b) =>
      Number(a.p.name !== "sportscore") - Number(b.p.name !== "sportscore") ||
      a.p.name.localeCompare(b.p.name) ||
      matchdayDays.indexOf(a.range!.from) - matchdayDays.indexOf(b.range!.from));
  }
  return tasks.sort((a, b) => a.key.localeCompare(b.key));
}

export async function runSync(job: Job, store: SyncStore, transport: SyncTransport, options: { force?: boolean; maxTasks?: number; budgetMs?: number; now?: number } = {}): Promise<Run> {
  const started = Date.now(), clock = options.now ?? started;
  const run: Run = { id: randomUUID(), job, status: "running", startedAt: new Date(clock).toISOString(), finishedAt: null, durationMs: 0, fetched: 0, inserted: 0, updated: 0, entities: {}, failures: [], tasks: 0, checkpoint: null };
  if (!await store.acquire(run.id)) {
    run.status = "skipped"; run.finishedAt = new Date().toISOString(); run.durationMs = Date.now() - started;
    run.failures = ["another sync owns the distributed lease"];
    await store.run(run); return run;
  }
  const count = (kind: Kind) => run.entities[kind] ??= { fetched: 0, inserted: 0, updated: 0 };
  const fetched = (kind: Kind, n = 1) => { run.fetched += n; count(kind).fetched += n; };
  let initialCursor: string | null = null;
  try {
    const state = await store.state(job);
    initialCursor = state.cursor;
    if (!options.force && !state.cursor && state.lastAttemptAt && clock - Date.parse(state.lastAttemptAt) < CADENCE[job] * 1000) {
      run.status = "skipped";
      return run;
    }
    await store.run(run);
    if (job === "quality") {
      const records = await store.list();
      const issues = qualityChecks(records, clock);
      for (const issue of issues.slice(0, 1000)) await store.issue(issue.code, issue.detail);
      run.fetched = records.length; run.tasks = 1; run.failures = issues.slice(0, 100).map(i => `${i.code}: ${i.detail}`);
      run.status = issues.length ? "failed" : "success";
      await store.checkpoint(job, { ...state, lastAttemptAt: run.startedAt, lastSuccessAt: issues.length ? state.lastSuccessAt : run.startedAt, error: issues[0]?.detail ?? null });
      return run;
    }
    // Recover abandoned run history on the next lease-holder startup via application composition.
    const tasks = plan(job, transport.providers, await store.list(), clock);
    // Matchday is ordered by urgency rather than key. If midnight changed its
    // three-day window, an old cursor must restart at today's task, not skip
    // the entire new window. Other jobs retain lexicographic resume semantics.
    let index = state.cursor ? tasks.findIndex(t => job === "matchday" ? t.key === state.cursor : t.key >= state.cursor!) : 0;
    if (index < 0) index = job === "matchday" ? 0 : tasks.length;
    const sameTask = state.cursor === tasks[index]?.key;
    let page = sameTask ? state.page : null, pageCount = sameTask ? state.pageCount : 0;
    const maxTasks = Math.max(1, Math.min(20, options.maxTasks ?? (job === "matchday" ? 3 : 2)));
    const budget = Math.max(1000, Math.min(40000, options.budgetMs ?? 20000));
    while (index < tasks.length && run.tasks < maxTasks && Date.now() - started < budget) {
      const task = tasks[index];
      // At most one bounded upstream page per task; two 8s attempts fit a 60s route.
      const params = { competition: task.competition?.sourceKey, season: task.season?.providerId, range: task.range, cursor: task.type === "competitions" ? null : page, entity: task.entity?.sourceKey, sport: task.sport };
      let nextPage: string | null = null;
      const before = { fetched: run.fetched, inserted: run.inserted, updated: run.updated, entities: structuredClone(run.entities) };
      try {
        const response = await transport.call<unknown>(task.p, task.sport, task.type, params, async p => {
          const id = task.competition?.sourceKey ?? "";
          if (task.type === "competitions") return p.getCompetitions({ sport: task.sport });
          if (task.type === "competition_seasons") return p.getCompetitionSeasons({ providerCompetitionId: id });
          if (task.type === "live_matches") return p.getLiveMatches({ sport: task.sport });
          if (task.type === "standings") return p.getStandings({ providerCompetitionId: id, season: task.season!.queryValue });
          if (task.type === "top_scorers") return p.getTopScorers({ providerCompetitionId: id, season: task.season!.queryValue });
          if (task.type === "team") return p.getTeam({ providerTeamId: task.entity!.sourceKey });
          if (task.type === "player") return p.getPlayer({ providerPlayerId: task.entity!.sourceKey });
          if (p.syncFixturePage) return p.syncFixturePage({ sport: task.sport, competitionProviderId: id, range: task.range!, season: task.season, cursor: page ?? undefined });
          if (page) throw new Error("adapter does not declare pagination");
          return p.getFixtures({ sport: task.sport, competitionProviderId: id, date: task.range!.from });
        }) as { data: unknown; at: string };
        const returned = response.data as { items?: unknown[] };
        const receivedKind: Kind = task.type === "competitions" ? "competition" : task.type === "competition_seasons" ? "season" : ["fixtures", "live_matches"].includes(task.type) ? "fixture" : task.type === "standings" ? "standings" : task.type === "top_scorers" ? "scorers" : task.entity!.kind;
        const received = Array.isArray(response.data) ? response.data.length : Array.isArray(returned?.items) ? returned.items.length : task.entity ? 1 : 0;
        fetched(receivedKind, received);
        await store.atomic(async tx => {
          const deadline = () => { if (Date.now() - started > 40000) throw new Error("batch time budget exhausted; records/checkpoint rolled back for retry"); };
          // One snapshot per day/task. Re-reading the entire fixture table for
          // EACH incoming match was quadratic and made broad matchdays time out
          // after only a handful of leagues on remote Postgres.
          const fixtureSnapshot = ["fixtures", "live_matches"].includes(task.type) ? await tx.list("fixture") : [];
          const existingFixtures = new Map(fixtureSnapshot.filter(r => r.provider === task.p.name).map(r => [r.sourceKey, r]));
          const otherSourceMeetings = new Set(fixtureSnapshot.filter(r => r.provider !== task.p.name)
            .map(r => JSON.stringify([r.data.homeName, r.data.awayName, r.data.scheduledAt])));
          const previousRecords = new Map<string, RecordData>();
          const checkedCompetitions = new Set<string>();
          const put = async (kind: Kind, key: string, data: Record<string, unknown>, comp: string | null = task.competition?.sourceKey ?? null) => {
            deadline();
            const recordKey = keyOf(kind, task.p.name, key);
            const previous = kind === "fixture" ? existingFixtures.get(key) : previousRecords.get(recordKey) ?? await tx.get(kind, task.p.name, key);
            const row = makeRecord(kind, task.p.name, key, task.sport, data, response.at, previous, comp);
            // Preserve existing canonical mapping where authorized source IDs already have one.
            await tx.put(row);
            previousRecords.set(recordKey, row);
            if (kind === "fixture") existingFixtures.set(key, row);
            if (previous) { run.updated++; count(kind).updated++; } else { run.inserted++; count(kind).inserted++; }
            return row;
          };
          if (task.type === "competitions") {
            if (!Array.isArray(response.data) || !response.data.length) throw new Error("empty/schema-invalid catalog; previous competitions retained");
            const rows = response.data as NormalizedCatalogCompetition[];
            const previous = (await tx.list("competition")).filter(r => r.provider === task.p.name && r.sport === task.sport);
            const seen = new Set(rows.map(row => row.providerId));
            const offset = page?.startsWith("row:") ? Number(page.slice(4)) : 0;
            if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("invalid catalog checkpoint");
            const ordered = [...rows].sort((a, b) => a.providerId.localeCompare(b.providerId));
            nextPage = offset + 50 < ordered.length ? `row:${offset + 50}` : null;
            for (const row of ordered.slice(offset, offset + 50)) {
              if (!row.providerId || !row.name) throw new Error("catalog schema changed: ID/name missing");
              seen.add(row.providerId);
              await put("competition", row.providerId, { ...row }, null);
            }
            if (!nextPage && previous.length && seen.size < previous.length * .7) {
              await tx.issue("catalog_shrink", `${task.key}: ${previous.length} -> ${seen.size}; records retained, catalog requires review`);
              run.failures.push(`${task.key}: catalog shrank >30%`);
            }
            if (!nextPage) for (const old of previous) if (!seen.has(old.sourceKey)) await tx.put({ ...old, availability: "unconfirmed" });
          } else if (task.type === "competition_seasons") {
            if (!Array.isArray(response.data) || !response.data.length) throw new Error("empty/schema-invalid seasons; history retained");
            const seasons = response.data as NormalizedSeason[];
            if (seasons.filter(s => s.isCurrent).length > 1) throw new Error("multiple current seasons");
            if (seasons.some(s => !s.providerId || !s.name || s.competitionProviderId !== task.competition!.sourceKey)) throw new Error("season linked to wrong competition or missing ID/name");
            if (seasons.some(s => s.isCurrent)) for (const old of (await tx.list("season")).filter(s => s.provider === task.p.name && s.competitionKey === task.competition!.sourceKey)) await tx.put({ ...old, data: { ...old.data, isCurrent: false } });
            for (const season of seasons) { await put("season", seasonKey(season.competitionProviderId, season.providerId), { ...season }); }
          } else if (["fixtures", "live_matches"].includes(task.type)) {
            const payload = response.data as { items?: NormalizedFixture[]; nextCursor?: string | null };
            const fixtures = Array.isArray(response.data) ? response.data as NormalizedFixture[] : payload.items;
            if (fixtures && fixtures.length > 500) throw new Error("fixture page exceeds bounded 500 items; provider must use narrower windows");
            if (!Array.isArray(fixtures)) throw new Error("fixture schema changed: items missing");
            nextPage = Array.isArray(response.data) ? null : payload.nextCursor ?? null;
            if (nextPage && (nextPage === page || pageCount >= 99)) throw new Error("pagination loop or 100-page cap; partial records retained");
            if (!task.p.syncFixturePage && fixtures.length >= 200) throw new Error("possible truncated fixture response (>=200); narrower pagination required");
            const seen = new Set<string>();
            if (task.type === "live_matches" && fixtures.length === 0 && (await tx.list("fixture")).some(f => f.provider === task.p.name && ["live", "halftime", "extra_time", "penalty_shootout"].includes(String(f.data.status)) && Date.parse(String(f.data.scheduledAt)) < clock + 3 * DAY / 24 && Date.parse(String(f.data.scheduledAt)) > clock - DAY / 2)) {
              await tx.issue("empty_active_feed", `${task.key}: empty feed while previously active matches remain; verify provider, retain scores`);
              run.failures.push(`${task.key}: empty active feed`);
            }
            for (const f of fixtures) {
              deadline();
              const errors = fixtureErrors(f, task.competition?.sourceKey);
              if (f.sport !== task.sport) errors.push("fixture linked to wrong sport");
              if (errors.length) { await tx.issue("invalid_fixture", `${task.p.name}:${f.providerId}: ${errors.join(", ")}`); run.failures.push(`${task.key}: invalid fixture ${f.providerId}`); continue; }
              const utcKickoff = new Date(f.scheduledAt).toISOString();
              if (task.range && !(utcKickoff >= `${task.range.from}T00:00:00` && utcKickoff < `${task.range.to}T00:00:00`)) continue;
              if (task.season && f.seasonProviderId && f.seasonProviderId !== task.season.providerId) { await tx.issue("wrong_season", `${task.key}: ${f.providerId}`); run.failures.push(`${task.key}: wrong season`); continue; }
              if (seen.has(f.providerId)) continue;
              seen.add(f.providerId);
              // Live/day feeds can confirm competitions without claiming a
              // complete catalog; check each league only once per day response.
              if (!checkedCompetitions.has(f.competitionProviderId)) {
                const existing = await tx.get("competition", task.p.name, f.competitionProviderId);
                if (!existing) {
                  if (!f.competitionName) { run.failures.push(`${task.key}: competition name missing`); continue; }
                  await put("competition", f.competitionProviderId, { providerId: f.competitionProviderId, name: f.competitionName, sport: f.sport, discoveryMethod: "observed_fixture" }, null);
                } else {
                  // A real fixture confirms coverage again. Refresh its source
                  // timestamp without replacing catalog metadata with the
                  // potentially abbreviated match-feed competition label.
                  previousRecords.set(keyOf("competition", task.p.name, f.competitionProviderId), existing);
                  await put("competition", f.competitionProviderId, {}, null);
                }
                checkedCompetitions.add(f.competitionProviderId);
              }
              for (const [id, name, logoUrl] of [[f.homeProviderId, f.homeName, f.homeLogoUrl], [f.awayProviderId, f.awayName, f.awayLogoUrl]]) await put("team", id!, { providerId: id, name, logoUrl }, f.competitionProviderId);
              const old = existingFixtures.get(f.providerId);
              if (old?.data.status === "finished" && (f.status !== "finished" || f.homeScore !== old.data.homeScore || f.awayScore !== old.data.awayScore)) {
                await tx.issue("final_score_conflict", `${task.p.name}:${f.providerId}: verified final retained; incoming ${f.status} ${f.homeScore}-${f.awayScore}`);
                run.failures.push(`${task.key}: final score conflict ${f.providerId}`); continue;
              }
              if (otherSourceMeetings.has(JSON.stringify([f.homeName, f.awayName, utcKickoff]))) await tx.issue("cross_source_review", `${task.p.name}:${f.providerId}: possible overlapping coverage; records retained separately, never merged by names`);
              await put("fixture", f.providerId, { ...f, originalScheduledAt: f.originalScheduledAt ?? f.scheduledAt, scheduledAt: new Date(f.scheduledAt).toISOString() }, f.competitionProviderId);
            }
            const old = fixtureSnapshot.filter(r => r.provider === task.p.name && (!task.competition || r.competitionKey === task.competition.sourceKey) && task.range && String(r.data.scheduledAt) >= `${task.range.from}T00:00:00` && String(r.data.scheduledAt) < `${task.range.to}T00:00:00`);
            if (!nextPage && !page && old.some(f => !seen.has(f.sourceKey))) {
              await tx.issue("fixtures_disappeared", `${task.key}: previously stored fixtures absent; nothing deleted`);
              run.failures.push(`${task.key}: fixtures disappeared`);
            }
          } else if (["standings", "top_scorers"].includes(task.type)) {
            if (!Array.isArray(response.data) || !response.data.length) throw new Error("empty/schema-invalid statistics; last good table retained");
            const kind = task.type === "standings" ? "standings" : "scorers";
            const rows = response.data as (NormalizedStandingRow & NormalizedTopScorer)[];
            if (kind === "standings" && rows.some(r => !r.teamProviderId || r.position < 1 || r.played !== r.won + r.drawn + r.lost)) throw new Error("invalid standings identity/played totals");
            await put(kind, seasonKey(task.competition!.sourceKey, task.season!.providerId), { rows, seasonProviderId: task.season!.providerId, competitionProviderId: task.competition!.sourceKey });
            for (const row of rows) {
              if (row.teamProviderId && row.teamName) await put("team", row.teamProviderId, { providerId: row.teamProviderId, name: row.teamName, logoUrl: row.teamLogoUrl });
              if (row.playerProviderId && row.playerName) await put("player", row.playerProviderId, { providerId: row.playerProviderId, fullName: row.playerName, teamProviderId: row.teamProviderId });
            }
          } else {
            const data = response.data as Record<string, unknown>;
            if (String(data.providerId) !== task.entity!.sourceKey || !(data.name || data.fullName)) throw new Error("metadata identity/schema mismatch");
            await put(task.entity!.kind, task.entity!.sourceKey, { ...data, metadataVerified: true, metadataFetchedAt: response.at }, task.entity!.competitionKey);
          }
          const latest = await tx.state(job);
          await tx.checkpoint(job, { ...latest, cursor: nextPage ? task.key : tasks[index + 1]?.key ?? null, page: nextPage, pageCount: nextPage ? pageCount + 1 : 0, lastAttemptAt: run.startedAt,
            lastSuccessAt: run.failures.length ? latest.lastSuccessAt : response.at, error: run.failures.length ? run.failures.slice(-1)[0] : null });
        });
      } catch (e) {
        run.inserted = before.inserted; run.updated = before.updated;
        for (const [kind, counts] of Object.entries(run.entities)) {
          counts!.inserted = before.entities[kind as Kind]?.inserted ?? 0;
          counts!.updated = before.entities[kind as Kind]?.updated ?? 0;
        }
        const safeError = (e instanceof Error ? e.message : String(e)).replace(/([?&](?:api_key|api_token|token|key)=)[^&\s]+/gi, "$1***").replace(/postgres(ql)?:\/\/[^\s@]*@/gi, "postgres://***@");
        const message = `${task.key}: ${safeError}`;
        run.failures.push(message); await store.issue("sync_failed", message); nextPage = null;
        await store.checkpoint(job, { ...await store.state(job), cursor: tasks[index + 1]?.key ?? null, page: null, pageCount: 0, lastAttemptAt: run.startedAt, error: message });
      }
      run.tasks++;
      if (nextPage) { page = nextPage; pageCount++; } else { index++; page = null; pageCount = 0; }
      run.checkpoint = nextPage ? task.key : tasks[index]?.key ?? null;
    }
    if (!tasks.length) {
      run.status = "skipped";
      run.failures.push("no_supported_work");
      await store.checkpoint(job, { ...state, cursor: null, page: null, pageCount: 0, lastAttemptAt: run.startedAt, error: "no_supported_work" });
      await store.issue("no_supported_work", `${job}: no configured provider/verified catalog/season supports this job`);
    } else run.status = run.failures.length ? (run.inserted + run.updated ? "partial" : "failed") : "success";
    // A batch is successful, not necessarily a complete sweep; checkpoint communicates remaining work.
  } catch (e) {
    run.status = "failed"; run.failures.push(e instanceof Error ? e.message : String(e));
    run.checkpoint = initialCursor;
  } finally {
    run.finishedAt = new Date().toISOString(); run.durationMs = Date.now() - started;
    try { await store.run(run); } finally { await store.release(run.id); }
  }
  return run;
}
