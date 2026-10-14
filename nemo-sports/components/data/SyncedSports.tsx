import Link from "@/components/i18n/Link";
import { syncedRecords, syncErrorKey, type SyncErrorCode } from "@/lib/sports-sync/read";
import { classification, freshness, indexWorthy, keyOf, type RecordData } from "@/lib/sports-sync/model";
import { SITE_TZ, siteDateKey } from "@/lib/tz";
import type { Locale } from "@/lib/i18n/locales";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";
import { sportName } from "@/lib/i18n/names";

export { syncedPath } from "@/lib/sports-sync/public";
import { syncedPath } from "@/lib/sports-sync/public";

/**
 * `locale` defaults to Arabic so existing callers (and the sports-sync safety
 * tests, which assert the published Arabic wording) keep their behaviour.
 */
const tr = (locale: Locale | undefined, key: Parameters<typeof t>[1], vars?: Parameters<typeof t>[2]) =>
  t(locale ?? DEFAULT_LOCALE, key, vars);

/** Provider slugs that carry no public brand name in the data layer. */
const PROVIDER_BRAND: Record<string, string> = {
  football_data: "Football-Data.org",
  sportscore: "SportScore",
  thesportsdb: "TheSportsDB",
  api_football: "API-Football",
  sportmonks: "Sportmonks",
  sportradar: "Sportradar",
};
const providerName = (provider: string, locale?: Locale) => PROVIDER_BRAND[provider] ?? tr(locale, "sy.providerFallback");

/** Statuses are machine values from the sync store; only the label changes. */
const STATUS_KEY = new Set([
  "scheduled", "live", "halftime", "extra_time", "extra_time_halftime", "penalty_shootout",
  "finished", "postponed", "cancelled", "abandoned", "suspended", "walkover", "awarded",
]);
const statusName = (status: unknown, locale?: Locale) => {
  const value = String(status);
  return STATUS_KEY.has(value) ? tr(locale, `sy.status.${value}`) : tr(locale, "sy.status.unconfirmed");
};

const name = (r: RecordData, locale?: Locale) => String(r.data.name ?? r.data.fullName ?? tr(locale, "sy.nameFallback"));

/** Kickoff rendered in the site timezone; switching language never moves it. */
const kickoff = (r: RecordData, locale: Locale = DEFAULT_LOCALE) =>
  new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: SITE_TZ })
    .format(new Date(String(r.data.scheduledAt)));

const stamp = (iso: string, locale: Locale = DEFAULT_LOCALE) =>
  new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: SITE_TZ })
    .format(new Date(iso));

export function SyncNotice({ record, error, errorCode, locale }: { record?: RecordData; error?: string | null; errorCode?: SyncErrorCode | null; locale?: Locale }) {
  // Spell the failure per locale. `error` (the Arabic operator string) is only
  // the fallback for a caller that has not threaded the code through yet.
  const message = errorCode ? tr(locale ?? DEFAULT_LOCALE, syncErrorKey(errorCode)) : error;
  return <p role={message ? "status" : undefined} className="my-3 rounded border border-line p-3 text-xs leading-6 text-muted">
    {message ?? (record
      ? `${freshness(record) === "stale" ? tr(locale, "sy.stalePrefix") : ""}${tr(locale, "sy.lastSuccess", {
          time: record.lastSuccessAt ? stamp(record.lastSuccessAt, locale ?? DEFAULT_LOCALE) : tr(locale, "sy.noSuccessTime"),
          provider: providerName(record.provider, locale),
        })}`
      : tr(locale, "sy.coverageNote"))}
  </p>;
}

export async function SyncedCompetitionDirectory({ sport = "", country = "", locale }: { sport?: string; country?: string; locale?: Locale }) {
  const result = await syncedRecords();
  const fixtures = result.data.filter(r => r.kind === "fixture");
  const all = result.data.filter(r => r.kind === "competition");
  const visible = all.filter(c => indexWorthy(c, fixtures));
  const filtered = visible.filter(c => (!sport || c.sport === sport) && (!country || c.data.countryName === country));
  // Existing curated routes remain in their old listing; dynamic additions need no code edits.
  const additions = filtered.filter(c => syncedPath(c).endsWith(c.slug));
  const l = locale ?? DEFAULT_LOCALE;
  return <section className="mx-auto max-w-[1280px] px-4 py-6" aria-labelledby="sync-catalog-title">
    <h2 id="sync-catalog-title" className="text-xl font-extrabold">{tr(l, "sy.catalogTitle")}</h2>
    <SyncNotice error={result.error} errorCode={result.errorCode} locale={l} />
    <form method="get" className="my-4 flex flex-wrap gap-3 text-sm">
      <label>{tr(l, "sy.sportLabel")} <select name="sport" defaultValue={sport} className="rounded border border-line bg-transparent p-2"><option value="">{tr(l, "common.all")}</option>{[...new Set(visible.map(r => r.sport))].map(s => <option key={s} value={s}>{sportName(l, s)}</option>)}</select></label>
      <label>{tr(l, "sy.countryLabel")} <select name="country" defaultValue={country} className="rounded border border-line bg-transparent p-2"><option value="">{tr(l, "common.all")}</option>{[...new Set(visible.map(r => String(r.data.countryName ?? "")))].filter(Boolean).sort().map(c => <option key={c}>{c}</option>)}</select></label>
      <button className="rounded border border-line px-4 py-2" type="submit">{tr(l, "sy.show")}</button>
      <Link href="/sports" className="p-2 text-gold-500">{tr(l, "sy.directoryLink")}</Link>
    </form>
    {additions.length ? <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{additions.map(c => <li key={keyOf(c.kind, c.provider, c.sourceKey)}><Link className="card block p-4 focus-ring" href={syncedPath(c)}><strong>{name(c, l)}</strong><span className="mt-1 block text-xs text-muted">{String(c.data.countryName ?? "")} · {sportName(l, c.sport)} · {String(c.data.type ?? tr(l, "sy.typeFallback"))}</span></Link></li>)}</ul>
      : <p className="text-sm text-muted">{tr(l, "sy.noAdditions")}</p>}
  </section>;
}

export function SyncedFixtureList({ fixtures, locale }: { fixtures: RecordData[]; locale?: Locale }) {
  const l = locale ?? DEFAULT_LOCALE;
  const sorted = fixtures.filter(f => Number.isFinite(Date.parse(String(f.data.scheduledAt)))).sort((a, b) => String(a.data.scheduledAt).localeCompare(String(b.data.scheduledAt)));
  const days = new Map<string, RecordData[]>();
  for (const f of sorted) { const key = siteDateKey(new Date(String(f.data.scheduledAt))); days.set(key, [...(days.get(key) ?? []), f]); }
  return <div className="space-y-4">{[...days].map(([day, rows]) => <section key={day}><h3 className="mb-2 font-bold">{tr(l, "sy.dayHeading", { day })}</h3><ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rows.map(f => <li key={keyOf(f.kind, f.provider, f.sourceKey)}><Link href={syncedPath(f)} className="card block p-4 focus-ring"><strong>{String(f.data.homeName)} × {String(f.data.awayName)}</strong><span className="mt-2 block text-xs text-muted">{kickoff(f, l)} · {statusName(f.data.status, l)}</span><span dir="ltr" className="num block">{String(f.data.homeScore ?? "—")} : {String(f.data.awayScore ?? "—")}</span>{freshness(f) === "stale" && <span className="text-xs text-muted">{tr(l, "sy.staleUpdate")}</span>}</Link></li>)}</ul></section>)}</div>;
}

export async function SyncedCompetitionDetail({ record, locale }: { record: RecordData; locale?: Locale }) {
  const l = locale ?? DEFAULT_LOCALE;
  const result = await syncedRecords();
  const related = result.data.filter(r => r.provider === record.provider && r.competitionKey === record.sourceKey);
  const fixtures = related.filter(r => r.kind === "fixture");
  const seasons = related.filter(r => r.kind === "season");
  const current = seasons.find(s => s.data.isCurrent);
  const table = related.find(r => r.kind === "standings" && current && r.data.seasonProviderId === current.data.providerId);
  const scorers = related.find(r => r.kind === "scorers" && current && r.data.seasonProviderId === current.data.providerId);
  const teams = result.data.filter(r => r.kind === "team" && r.provider === record.provider && fixtures.some(f => [f.data.homeProviderId, f.data.awayProviderId].includes(r.sourceKey)));
  return <main className="mx-auto max-w-[1280px] space-y-6 px-4 py-6">
    <nav><Link href="/competitions" className="text-sm text-gold-500">{tr(l, "nav.competitions")}</Link></nav><h1 className="text-2xl font-extrabold">{name(record, l)}</h1>
    <p className="text-sm text-muted">{String(record.data.countryName ?? "")} · {sportName(l, record.sport)} {record.availability === "unconfirmed" ? tr(l, "sy.availabilityUnconfirmed") : ""}</p>
    <SyncNotice record={record} error={result.error} errorCode={result.errorCode} locale={l} />
    <section><h2 className="mb-3 font-bold">{tr(l, "sy.seasonsTitle")}</h2>{seasons.length ? <ul className="flex flex-wrap gap-3">{seasons.map(s => <li key={s.sourceKey}><a href={`#season-${s.id}`} className="text-gold-500">{String(s.data.name)}{s.data.isCurrent ? tr(l, "sy.currentSeason") : ""}</a></li>)}</ul> : <p className="text-sm text-muted">{tr(l, "sy.noSeasons")}</p>}</section>
    {seasons.map(s => <section id={`season-${s.id}`} key={s.id}><h2 className="mb-3 font-bold">{tr(l, "sy.seasonMatches", { name: String(s.data.name) })}</h2><SyncedFixtureList fixtures={fixtures.filter(f => f.data.seasonProviderId === s.data.providerId)} locale={l} /></section>)}
    <section><h2 className="mb-3 font-bold">{seasons.length ? tr(l, "sy.matchesNoSeason") : tr(l, "sy.matchesSynced")}</h2><SyncedFixtureList fixtures={fixtures.filter(f => !seasons.some(s => s.data.providerId === f.data.seasonProviderId))} locale={l} />{!fixtures.length && <p className="text-sm text-muted">{tr(l, "sy.noFixtures")}</p>}</section>
    <section><h2 className="mb-3 font-bold">{tr(l, "sy.teamsTitle")}</h2><ul className="flex flex-wrap gap-4">{teams.map(team => <li key={team.id}><Link href={syncedPath(team)} className="text-gold-500">{name(team, l)}</Link></li>)}</ul></section>
    <section><h2 className="mb-3 font-bold">{tr(l, "sy.standingsTitle")}</h2>{table ? <><SyncNotice record={table} locale={l} /><div className="overflow-x-auto"><table className="w-full text-start text-sm"><thead><tr><th>{tr(l, "sy.thPosition")}</th><th>{tr(l, "sy.thTeam")}</th><th>{tr(l, "sy.thPlayed")}</th><th>{tr(l, "sy.thPoints")}</th></tr></thead><tbody>{(table.data.rows as Record<string, unknown>[]).map((r, i) => <tr key={i} className="border-b border-line"><td className="p-2">{String(r.position)}</td><td>{String(r.teamName ?? tr(l, "sy.nameUnavailable"))}</td><td>{String(r.played)}</td><td>{String(r.points)}</td></tr>)}</tbody></table></div></> : <p className="text-sm text-muted">{tr(l, "sy.noStandings")}</p>}</section>
    <section><h2 className="mb-3 font-bold">{tr(l, "sy.scorersTitle")}</h2>{scorers ? <><SyncNotice record={scorers} locale={l} /><ul>{(scorers.data.rows as Record<string, unknown>[]).map((r, i) => { const player = result.data.find(p => p.kind === "player" && p.provider === record.provider && p.sourceKey === String(r.playerProviderId)); return <li key={i} className="py-2">{player ? <Link className="text-gold-500" href={syncedPath(player)}>{String(r.playerName)}</Link> : String(r.playerName ?? tr(l, "sy.nameUnavailable"))} — {tr(l, "sy.goalsCount", { count: String(r.goals) })}</li>; })}</ul></> : <p className="text-sm text-muted">{tr(l, "sy.noScorers")}</p>}</section>
  </main>;
}

export async function SyncedEntityDetail({ record, locale }: { record: RecordData; locale?: Locale }) {
  const l = locale ?? DEFAULT_LOCALE;
  const result = await syncedRecords();
  if (record.kind === "fixture") {
    const competition = result.data.find(r => r.kind === "competition" && r.provider === record.provider && r.sourceKey === record.competitionKey);
    const teams = [record.data.homeProviderId, record.data.awayProviderId].map(id => result.data.find(r => r.kind === "team" && r.provider === record.provider && r.sourceKey === id));
    return <main className="mx-auto max-w-[1280px] space-y-4 px-4 py-6"><h1 className="text-2xl font-bold">{String(record.data.homeName)} × {String(record.data.awayName)}</h1><SyncNotice record={record} error={result.error} errorCode={result.errorCode} locale={l} /><p>{tr(l, "sy.kickoffCairo", { time: kickoff(record, l) })}</p><p>{statusName(record.data.status, l)}</p><p dir="ltr" className="num text-3xl">{String(record.data.homeScore ?? "—")} : {String(record.data.awayScore ?? "—")}</p>{competition && <Link href={syncedPath(competition)} className="block text-gold-500">{name(competition, l)}</Link>}<ul className="flex gap-4">{teams.map((team, i) => team && <li key={i}><Link href={syncedPath(team)} className="text-gold-500">{name(team, l)}</Link></li>)}</ul><p className="text-sm text-muted">{tr(l, "sy.fixtureNote")}</p></main>;
  }
  const fixtures = result.data.filter(f => f.kind === "fixture" && f.provider === record.provider && [f.data.homeProviderId, f.data.awayProviderId].includes(record.sourceKey));
  return <main className="mx-auto max-w-[1280px] space-y-4 px-4 py-6"><h1 className="text-2xl font-bold">{name(record, l)}</h1><SyncNotice record={record} error={result.error} errorCode={result.errorCode} locale={l} /><p>{String(record.data.countryName ?? "")} {String(record.data.position ?? "")}</p>{record.kind === "team" && <SyncedFixtureList fixtures={fixtures} locale={l} />}{record.kind === "player" && <p className="text-sm text-muted">{tr(l, "sy.playerNote")}</p>}</main>;
}

export async function SyncedFixtureHighlights({ state, sport, locale }: { state?: "live" | "upcoming" | "completed"; sport?: string; locale?: Locale }) {
  const l = locale ?? DEFAULT_LOCALE;
  const result = await syncedRecords("fixture");
  const fixtures = result.data.filter(f => (!state || classification(String(f.data.status)) === state) && (!sport || f.sport === sport))
    .sort((a, b) => state === "completed" ? String(b.data.scheduledAt).localeCompare(String(a.data.scheduledAt)) : String(a.data.scheduledAt).localeCompare(String(b.data.scheduledAt))).slice(0, 6);
  if (!fixtures.length) return null; // legacy empty/error surfaces remain unchanged
  return <section className="mx-auto max-w-[1280px] space-y-3 px-4 py-6"><h2 className="text-lg font-bold">{tr(l, "sy.highlightsTitle")}</h2><SyncNotice locale={l} /><SyncedFixtureList fixtures={fixtures} locale={l} /><Link href={state ? `/sports?state=${state}` : "/sports"} className="text-sm text-gold-500">{tr(l, "sy.allSynced")}</Link></section>;
}

export async function SyncedEntityDirectory({ kind, locale }: { kind: "team" | "player"; locale?: Locale }) {
  const l = locale ?? DEFAULT_LOCALE;
  const result = await syncedRecords(kind);
  if (!result.data.length) return null;
  return <section className="mx-auto max-w-[1280px] px-4 py-6"><h2 className="mb-3 text-lg font-bold">{tr(l, "sy.entityDirectory", { kind: kind === "team" ? tr(l, "sy.kindTeams") : tr(l, "sy.kindPlayers") })}</h2><ul className="grid gap-3 sm:grid-cols-3">{result.data.slice(0, 24).map(r => <li key={r.id}><Link href={syncedPath(r)} className="card block p-4">{name(r, l)}</Link></li>)}</ul><Link className="mt-3 block text-gold-500" href={`/sports?kind=${kind === "team" ? "teams" : "players"}`}>{tr(l, "common.showMore")}</Link></section>;
}
