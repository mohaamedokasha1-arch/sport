import type { Metadata } from "next";
import Link from "@/components/i18n/Link";
import { notFound } from "next/navigation";
import Tabs from "@/components/ui/Tabs";
import Crest from "@/components/ui/Crest";
import MatchCard from "@/components/match/MatchCard";
import NewsCard from "@/components/news/NewsCard";
import StandingsTable from "@/components/competition/StandingsTable";
import DataSourceNote from "@/components/data/DataSourceNote";
import { articles, standings, teamMatches } from "@/lib/data";
import {
  competitionBySlug,
  playersByTeam,
  sportBySlug,
  teamBySlug,
  teams,
} from "@/lib/core-data";
import { age, number } from "@/lib/format";
import { footballDataCompetitions, footballMatches, footballStandings } from "@/lib/football-data";
import { team as sdlTeam, PERMANENT_FAILURE_KINDS } from "@/lib/sdl-gateway";
import { demoContentVisible } from "@/lib/site";
import { canonicalCompetitions, competitionByPath } from "@/lib/competition-catalog";
import type { NormalizedFixture, NormalizedStandingRow } from "@/packages/sdl/src";
import { getAdminTeamBySlug } from "@/lib/admin-teams";
import { AdminTeamDetail } from "@/components/public/AdminPublished";
import { cache } from "react";
import { decodeSlug } from "@/lib/slug";
import { coveredFootballCompetitionIds, findTeamRow, teamHasFixtureInWindow } from "@/lib/team-lookup";
import { isLiveStatus, matchStateOf } from "@/lib/match-state";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";
import { formatDate, formatDateTime } from "@/lib/i18n/dates";
import { countryName } from "@/lib/i18n/names";

export type ViewProps = { params: Promise<{ slug: string }> };


/**
 * Find a provider team row by looking it up in the league tables.
 * 
 * The keyless provider does not have a team detail endpoint, so looking up a
 * team directly returns "unsupported". But the tables contain the full team row
 * (name, short name, logo) alongside the league position, so we can just extract it.
 */
type RealTeamLookup = {
  row: NormalizedStandingRow;
  compId: string;
  provider: string;
  fromCache: boolean;
  stale?: boolean;
  fetchedAt: string;
};

const findTeamInRealTables = cache(async function findTeamInRealTables(
  teamId: string,
): Promise<RealTeamLookup | null> {
  // Every competition the site covers, not only the Football-Data featured
  // list: the pages that link here are built from all of them, so a club that
  // appears in a covered table must resolve. `coveredFootballCompetitionIds()`
  // is ordered featured-first, so the common lookup still stops early.
  const ids = coveredFootballCompetitionIds();
  const tables = await Promise.all(ids.map((id) => footballStandings(id)));
  for (let i = 0; i < tables.length; i += 1) {
    const res = tables[i];
    if (!res.ok || res.source.provider === "demo") continue;
    const row = findTeamRow(res.data, teamId);
    if (!row) continue;
    return {
      row,
      compId: ids[i] ?? "",
      provider: res.source.provider,
      fromCache: res.source.fromCache,
      stale: res.source.stale,
      fetchedAt: res.source.fetchedAt,
    };
  }
  return null;
});

/**
 * Bound the lifetime of an on-demand ISR entry.
 *
 * Without this, a page (or a 404) rendered while a provider was briefly
 * unreachable is cached with no expiry: team identity and league position would stay wrong until the
 * next deploy. A bounded revalidate lets a transient outage self-heal while
 * still serving from cache in the normal case.
 */
export const revalidate = 1800;

export function generateStaticParams() {
  // Demo slugs are prerendered for development/preview only; real provider
  // team ids render on demand (dynamicParams stays true).
  return demoContentVisible() ? teams.map((t) => ({ slug: t.slug })) : [];
}

/** Local name of a competition id (code, SportScore slug or catalogue entry). */
function competitionNameAr(id: string): string {
  const catalogue = [...footballDataCompetitions(false), ...canonicalCompetitions];
  const match = catalogue.find((c) => c.slug === id || c.code === id) ?? competitionByPath(id);
  return match?.nameAr ?? id;
}

async function teamMetadataBody({
  locale,
  params,
}: {
  locale: Locale;
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  /* ── real provider team first ── */
  const real = await sdlTeam("football", slug);
  if (real.ok && real.source === "provider") {
    const team = real.data;
    const title = t(locale, "td.metaTitle", { name: team.name });
    const description = t(locale, "td.metaDescription", { name: team.name });
    return {
      title,
      description,
      alternates: { canonical: `/teams/${slug}` },
      openGraph: { title, description, type: "article" },
    };
  }

  /* ── or a real team the directory links to, resolved from the tables ── */
  if (!demoContentVisible()) {
    const listed = await findTeamInRealTables(slug);
    const name = listed?.row.teamName ?? listed?.row.teamShortName ?? null;
    if (listed && name) {
      const title = t(locale, "td.metaTitle", { name });
      const description = t(locale, "td.metaDescription", { name });
      // Thin-page rule (same as competition pages): a team known only from its
      // table row, with no fixture in the provider window, is noindex, follow.
      // It returns to the index by itself once its fixtures are available.
      const fixturesRes = listed.compId ? await footballMatches({ competitionId: listed.compId }) : null;
      const fixtureData = fixturesRes?.ok && fixturesRes.source.provider !== "demo" ? fixturesRes.data : [];
      const hasMatchContent = teamHasFixtureInWindow(fixtureData, slug);
      return {
        title,
        description,
        alternates: { canonical: `/teams/${slug}` },
        openGraph: { title, description, type: "article" },
        ...(hasMatchContent ? {} : { robots: { index: false, follow: true } }),
      };
    }
  }

  const team = demoContentVisible() ? teamBySlug(slug) : undefined;
  // Explicit robots so a 404 emits one consistent directive instead of the
  // layout's `index, follow` stacked on Next.js's built-in not-found noindex.
  if (!team) return { title: t(locale, "td.notFound"), robots: { index: false, follow: true } };
  const comp = competitionBySlug(team.competition);
  return {
    title: `${team.name} | ${comp?.name ?? sportBySlug(team.sport)?.name}`,
    description: t(locale, "td.metaDescriptionFull", { name: team.name }),
    alternates: { canonical: `/teams/${team.slug}` },
  };
}

async function TeamPageBody({ locale, params }: { locale: Locale; params: Promise<{ slug: string }> }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const { slug } = await params;

  /* ══ 1) real provider team ══════════════════════════════════════════ */
  const real = await sdlTeam("football", slug);
  if (!real.ok && !PERMANENT_FAILURE_KINDS.has(real.error.kind)) {
    // Transient outage only: abort so ISR keeps the last good page rather than
    // caching a wrong answer. Permanent failures (not_found, no provider,
    // unsupported) fall through to the demo lookup and then to an honest 404.
    throw new Error(`team_unavailable:${real.error.kind}`);
  }
  if (real.ok && real.source === "provider") {
    return <RealTeamView locale={locale} slug={slug} provider={real.provider} fromCache={real.fromCache} stale={real.stale} fetchedAt={real.fetchedAt} name={real.data.name} shortName={real.data.shortName} logoUrl={real.data.logoUrl} countryName={real.data.countryName} foundedYear={real.data.foundedYear} venueName={real.data.venueName} primaryColor={real.data.primaryColor} secondaryColor={real.data.secondaryColor} />;
  }

  /* ══ 1b) a real team that /teams links to, resolved from the tables ══
     The directory on /teams is built from league-table rows, and the keyless
     provider has no team-detail endpoint for those ids — so they used to fall
     through to notFound() and every directory link was a 404. The same tables
     that produced the link carry the team's real row. */
  if (!demoContentVisible()) {
    const listed = await findTeamInRealTables(slug);
    const name = listed?.row.teamName ?? listed?.row.teamShortName ?? null;
    if (listed && name) {
      return (
        <RealTeamView
          locale={locale}
          slug={slug}
          lookup={listed}
          provider={listed.provider}
          fromCache={listed.fromCache}
          stale={listed.stale}
          fetchedAt={listed.fetchedAt}
          name={name}
          shortName={listed.row.teamShortName ?? null}
          logoUrl={listed.row.teamLogoUrl ?? null}
          countryName={null}
          foundedYear={null}
          venueName={null}
          primaryColor={null}
          secondaryColor={null}
        />
      );
    }
  }

  const team = demoContentVisible() ? teamBySlug(slug) : undefined;
  if (!team) notFound();

  const comp = competitionBySlug(team.competition);
  const sport = sportBySlug(team.sport);
  const matches = teamMatches(team.slug);
  const squad = playersByTeam(team.slug);
  const news = articles.filter((a) => a.teams?.includes(team.slug)).slice(0, 6);

  const played = matches.filter((m) => m.status === "FINISHED");
  const upcoming = matches.filter((m) => m.status === "UPCOMING");
  const live = matches.filter((m) => m.status === "LIVE");

  const record = played.reduce(
    (acc, m) => {
      const isHome = m.home === team.slug;
      const gf = isHome ? m.homeScore : m.awayScore;
      const ga = isHome ? m.awayScore : m.homeScore;
      acc.gf += gf;
      acc.ga += ga;
      if (gf > ga) acc.w += 1;
      else if (gf === ga) acc.d += 1;
      else acc.l += 1;
      return acc;
    },
    { w: 0, d: 0, l: 0, gf: 0, ga: 0 },
  );

  const table = standings[team.competition];
  const teamRow = table?.find((r) => r.team === team.slug);

  // The stored `positionGroup` values are data (Arabic) — only the label is translated.
  const groupOrder: { value: string; labelKey: "td.pos.goalkeeper" | "td.pos.defender" | "td.pos.midfielder" | "td.pos.forward" | "td.pos.starter" | "td.pos.solo" }[] = [
    { value: "حراسة المرمى", labelKey: "td.pos.goalkeeper" },
    { value: "الدفاع", labelKey: "td.pos.defender" },
    { value: "الوسط", labelKey: "td.pos.midfielder" },
    { value: "الهجوم", labelKey: "td.pos.forward" },
    { value: "أساسي", labelKey: "td.pos.starter" },
    { value: "فردي", labelKey: "td.pos.solo" },
  ];
  const grouped = groupOrder
    .map((g) => ({ title: tr(g.labelKey), list: squad.filter((p) => p.positionGroup === g.value) }))
    .filter((g) => g.list.length > 0);

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <p className="mb-4 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[11px] font-semibold text-muted">{tr("td.demoNotice")}</p>
      <nav aria-label={tr("td.breadcrumbAria")} className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">{tr("td.home")}</Link>
        <span aria-hidden>/</span>
        <Link href="/teams" className="hover:text-gold-600 dark:hover:text-gold-400">{tr("td.teams")}</Link>
        <span aria-hidden>/</span>
        <span className="font-semibold text-ink">{team.name}</span>
      </nav>

      <header
        className="stripes mb-6 overflow-hidden rounded-[8px] border border-navy-700 text-white"
        style={{ backgroundImage: `linear-gradient(120deg, ${team.primary} 0%, #0F1B2E 65%)` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-6">
          <div className="flex items-center gap-4">
            <Crest slug={team.slug} size={76} />
            <div>
              <p className="eyebrow !text-white/50">{sport?.name}</p>
              <h1 className="text-2xl font-extrabold tracking-tight">{team.name}</h1>
              <p className="mt-1 text-[12px] text-white/70">
                {countryName(locale, team.country)} · {comp?.name} · {tr("td.founded")} <span className="num">{team.founded}</span>
              </p>
            </div>
          </div>

          <dl className="flex flex-wrap gap-6 text-center">
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">{tr("td.statPlayed")}</dt>
              <dd className="num text-xl font-extrabold">{record.w + record.d + record.l}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">{tr("td.statWDL")}</dt>
              <dd className="num text-xl font-extrabold text-gold-400">
                {record.w}/{record.d}/{record.l}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">{tr("td.statGoals")}</dt>
              <dd className="num text-xl font-extrabold">
                {record.gf}–{record.ga}
              </dd>
            </div>
            {teamRow ? (
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-white/45">{tr("td.statPosition")}</dt>
                <dd className="num text-xl font-extrabold text-gold-400">{teamRow.pos}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-2 border-t border-white/10 px-5 py-3 text-[11px] text-white/70">
          <span>🏟 {team.stadium ?? "—"}</span>
          {team.capacity ? <span className="num">{tr("td.capacity", { n: number(team.capacity) })}</span> : null}
          <span>{tr("td.coach", { name: team.coach ?? "—" })}</span>
          <span>{tr("td.captain", { name: team.captain ?? "—" })}</span>
        </div>
      </header>

      <Tabs
        label={tr("td.tabsAria")}
        items={[
          {
            id: "overview",
            label: tr("td.tabOverview"),
            content: (
              <div className="space-y-6">
                {live.length > 0 ? <Group title={tr("td.liveNow")} list={live} /> : null}
                <Group title={tr("td.upcoming")} list={upcoming} />
                <Group title={tr("td.recentResults")} list={played} />
                {matches.length === 0 ? (
                  <p className="card px-4 py-10 text-center text-[13px] text-muted">{tr("td.noMatches")}</p>
                ) : null}
              </div>
            ),
          },
          {
            id: "squad",
            label: tr("td.tabPlayers"),
            content:
              grouped.length > 0 ? (
                <div className="space-y-5">
                  {grouped.map((g) => (
                    <section key={g.title}>
                      <h2 className="eyebrow mb-2">{g.title}</h2>
                      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {g.list.map((p) => (
                          <li key={p.slug}>
                            <Link
                              href={`/players/${p.slug}`}
                              className="card flex items-center gap-3 p-3 transition hover:border-gold-500/50"
                            >
                              <span className="num grid h-9 w-9 shrink-0 place-items-center rounded-[3px] bg-navy-850 text-[13px] font-extrabold text-gold-400">
                                {p.number ?? "—"}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-[13px] font-bold">{p.name}</span>
                                <span className="block truncate text-[11px] text-muted">
                                  {p.position} · {p.flag} {p.nationality} · {tr("td.playerYears", { age: age(p.birth) })}
                                </span>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : (
                <p className="card px-4 py-10 text-center text-[13px] text-muted">
                  {tr("td.noPlayers")}
                </p>
              ),
          },
          {
            id: "matches",
            label: tr("td.tabMatches"),
            content: <Group title={tr("td.seasonMatches")} list={matches} />,
          },
          {
            id: "table",
            label: tr("td.tabTable"),
            disabled: !table,
            content: table ? (
              <div className="space-y-3">
                <StandingsTable rows={table} locale={locale} />
                {teamRow ? (
                  <p className="text-[12px] text-muted">
                    {tr("td.standingLine1", { name: team.name })} <span className="num font-bold text-ink">{teamRow.pos}</span> {tr("td.standingPoints")}{" "}
                    <span className="num font-bold text-ink">{teamRow.points}</span> {tr("td.standingLine2", { comp: comp?.name ?? "" })}
                  </p>
                ) : null}
              </div>
            ) : null,
          },
          {
            id: "news",
            label: tr("td.tabNews"),
            content:
              news.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {news.map((a) => (
                    <NewsCard key={a.slug} article={a} />
                  ))}
                </div>
              ) : (
                <p className="card px-4 py-10 text-center text-[13px] text-muted">{tr("td.noNews")}</p>
              ),
          },
        ]}
      />
    </div>
  );
}

function Group({ title, list }: { title: string; list: ReturnType<typeof teamMatches> }) {
  if (list.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-[13px] font-extrabold">
        <span className="h-4 w-1 rounded-full bg-gold-500" aria-hidden />
        {title}
        <span className="num rounded-[3px] bg-navy-850/5 px-1.5 py-0.5 text-[10px] dark:bg-white/10">{list.length}</span>
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((m) => (
          <MatchCard key={m.id} match={m} />
        ))}
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Real-data team view
   ──────────────────────────────────────────────────────────────────────────
   Every value here is resolved from a provider: the identity from `team`, the
   league position/points/form from `standings`, and the matches from
   `fixtures` for the competition the standings row placed this team in. A
   section whose data could not be resolved says so instead of showing zeros.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Canonical NEMO match statuses are LOWERCASE — see FD_STATUS in
 * packages/sdl/src/adapters/football-data.ts, which normalizes football-data's
 * `FINISHED`/`IN_PLAY`/`TIMED` into `finished`/`live`/`scheduled`. The demo
 * `Match` type in lib/data.ts is the one domain that uses uppercase, so the two
 * vocabularies must not be mixed: comparing an SDL fixture against "FINISHED"
 * silently matches nothing and files every result under "upcoming".
 */
const STATUS_KEYS: Record<string, string> = {
  scheduled: "td.status.scheduled",
  live: "td.status.live",
  halftime: "td.status.halftime",
  extra_time: "td.status.extra_time",
  extra_time_halftime: "td.status.extra_time_halftime",
  penalty_shootout: "td.status.penalty_shootout",
  finished: "td.status.finished",
  awarded: "td.status.awarded",
  walkover: "td.status.walkover",
  suspended: "td.status.suspended",
  abandoned: "td.status.abandoned",
  postponed: "td.status.postponed",
  cancelled: "td.status.cancelled",
};

// Live-status vocabulary lives in lib/match-state.ts (one definition site-wide).
const FINAL_STATUSES = new Set(["finished", "awarded", "walkover"]);

/** Mirrors the page-local `arabicDateTime` this replaced; null for an unparseable instant. */
const fixtureDateTime = (locale: Locale, iso: string) => formatDateTime(locale, iso);

function ProviderTeamFixtureList({ locale, fixtures, showScore = false }: { locale: Locale; fixtures: NormalizedFixture[]; showScore?: boolean }) {
  return (
    <ul className="space-y-2">
      {fixtures.slice(0, 10).map((fixture) => (
        <li key={fixture.providerId}>
          <Link href={`/matches/${encodeURIComponent(fixture.providerId)}`} className="card flex min-h-11 items-center justify-between gap-3 p-3 transition hover:border-gold-500/50 focus-ring">
            <span className="min-w-0 text-[13px]">
              <span className="block truncate font-bold">
                {fixture.homeName ?? fixture.homeProviderId ?? "—"} – {fixture.awayName ?? fixture.awayProviderId ?? "—"}
              </span>
              <span className="num block text-[11px] text-muted">{fixtureDateTime(locale, fixture.scheduledAt) ?? "—"}</span>
            </span>
            {showScore ? (
              <span className="num shrink-0 text-[15px] font-extrabold">
                {fixture.homeScore !== null && fixture.awayScore !== null ? `${fixture.homeScore} : ${fixture.awayScore}` : t(locale, "td.scoreUnavailable")}
              </span>
            ) : (
              <span className="chip shrink-0">{t(locale, (STATUS_KEYS[fixture.status] ?? "td.status.fallback") as Parameters<typeof t>[1])}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function RealTeamView({ locale, ...props }: { locale: Locale;
  slug: string;
  lookup?: RealTeamLookup;
  provider: string;
  fromCache: boolean;
  stale?: boolean;
  fetchedAt: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  countryName: string | null;
  foundedYear: number | null;
  venueName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
}) {
  /* Locate this team in a real league table: that row is the honest source for
   * its competition, position, points and form, and it also tells us which
   * competition to load matches from. */
  const found = props.lookup ?? (await findTeamInRealTables(props.slug));
  const row: NormalizedStandingRow | null = found?.row ?? null;
  const compId: string | null = found?.compId ?? null;

  /* Matches of that competition, filtered to this team. */
  const fixturesRes = compId ? await footballMatches({ competitionId: compId }) : null;
  const fixtureData = fixturesRes?.ok && fixturesRes.source.provider !== "demo" ? fixturesRes.data : [];
  const mine = fixtureData.filter(
    (f) => f.homeProviderId === props.slug || f.awayProviderId === props.slug,
  );
  const live = mine.filter((fixture) => isLiveStatus(fixture.status)).sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  // Shared state rule: a "scheduled" whose kickoff day passed is unconfirmed —
  // listed with the special cases, never as upcoming and never as played.
  const upcoming = mine.filter((fixture) => matchStateOf(fixture.status, fixture.scheduledAt) === "upcoming").sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  const played = mine.filter((fixture) => FINAL_STATUSES.has(fixture.status)).sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt));
  const special = mine.filter((fixture) => !isLiveStatus(fixture.status) && !FINAL_STATUSES.has(fixture.status) && matchStateOf(fixture.status, fixture.scheduledAt) !== "upcoming");

  const r = row as NormalizedStandingRow | null;

  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const facts: [string, string | number | null][] = [
    [tr("td.factCountry"), props.countryName],
    [tr("td.factFounded"), props.foundedYear],
    [tr("td.factVenue"), props.venueName],
    [tr("td.factPosition"), r?.position ?? null],
    [tr("td.factPoints"), r?.points ?? null],
    [tr("td.factPlayed"), r?.played ?? null],
    [tr("td.factWDL"), r ? `${r.won} / ${r.drawn} / ${r.lost}` : null],
    [tr("td.factGoalDiff"), r ? r.goalsFor - r.goalsAgainst : null],
  ];

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-4 flex flex-wrap items-center gap-4">
        {props.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.logoUrl} alt="" width={72} height={72} className="h-[72px] w-[72px] object-contain" />
        ) : (
          <span className="grid h-[72px] w-[72px] place-items-center rounded-[6px] bg-navy-850 text-lg font-extrabold text-white/70">
            {(props.shortName ?? props.name).slice(0, 3).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="eyebrow mb-1">{tr("td.eyebrow")}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{props.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
            {props.shortName ? <span>{props.shortName}</span> : null}
            {compId ? (
              <Link className="chip hover:text-white" href={`/competitions/${compId}`}>
                {competitionNameAr(compId)}
              </Link>
            ) : null}
            {props.primaryColor ? (
              <span className="flex items-center gap-1.5" title={tr("td.teamColors")}>
                <span className="h-3 w-3 rounded-[2px]" style={{ background: props.primaryColor }} aria-hidden />
                {props.secondaryColor ? <span className="h-3 w-3 rounded-[2px]" style={{ background: props.secondaryColor }} aria-hidden /> : null}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <DataSourceNote provider={props.provider} fromCache={props.fromCache} stale={props.stale} fetchedAt={props.fetchedAt} className="mb-6" />

      <dl className="card mb-8 grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-4">
        {facts.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="truncate text-[11px] text-muted">{k}</dt>
            <dd className="num truncate text-[15px] font-bold">{v === null || v === "" ? "—" : v}</dd>
          </div>
        ))}
      </dl>

      {r?.form?.length ? <p className="mb-8 text-[12px] text-muted">{tr("td.formRun")} <span className="num font-bold tracking-[0.2em] text-white">{r.form.join("")}</span></p> : null}

      <div className="grid gap-8 lg:grid-cols-2">
        {live.length > 0 ? (
          <section>
            <h2 className="mb-3 border-b-2 border-line pb-2 text-lg font-extrabold">{tr("td.liveNow")}</h2>
            <ProviderTeamFixtureList locale={locale} fixtures={live} />
          </section>
        ) : null}

        <section>
          <h2 className="mb-3 border-b-2 border-line pb-2 text-lg font-extrabold">{tr("td.upcoming")}</h2>
          {upcoming.length > 0 ? <ProviderTeamFixtureList locale={locale} fixtures={upcoming} /> : <p className="text-[12px] text-muted">{tr("td.noUpcoming")}</p>}
        </section>

        {special.length > 0 ? (
          <section>
            <h2 className="mb-3 border-b-2 border-line pb-2 text-lg font-extrabold">{tr("td.specialStates")}</h2>
            <ProviderTeamFixtureList locale={locale} fixtures={special} />
          </section>
        ) : null}

        <section>
          <h2 className="mb-3 border-b-2 border-line pb-2 text-lg font-extrabold">{tr("td.latestResults")}</h2>
          {played.length > 0 ? <ProviderTeamFixtureList locale={locale} fixtures={played} showScore /> : <p className="text-[12px] text-muted">{tr("td.noResults")}</p>}
        </section>
      </div>


    </div>
  );
}

export async function generateMetadata(locale: Locale, { params }: ViewProps): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const adminTeam = await getAdminTeamBySlug(slug);
  if (adminTeam?.isPublished) {
    return {
      title: t(locale, "td.metaTitle", { name: adminTeam.nameAr }),
      description: `${adminTeam.nameAr}${adminTeam.country ? ` — ${adminTeam.country}` : ""}: ${t(locale, "td.adminMetaDescription", { name: adminTeam.nameAr })}`,
      alternates: { canonical: `/teams/${slug}` },
    };
  }
  return teamMetadataBody({ locale, params });
}

export default async function TeamPage({ locale, params }: ViewProps & { locale: Locale }) {
  const { slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const adminTeam = await getAdminTeamBySlug(slug);
  if (adminTeam?.isPublished) return <AdminTeamDetail team={adminTeam} locale={locale} />;
  return <TeamPageBody locale={locale} params={params} />;
}
