import { syncedBySlug, syncedRecords } from "@/lib/sports-sync/read";
import { indexWorthy } from "@/lib/sports-sync/model";
import { SyncedCompetitionDetail } from "@/components/data/SyncedSports";
import type { Metadata } from "next";
import Link from "@/components/i18n/Link";
import { notFound, permanentRedirect } from "next/navigation";
import Tabs from "@/components/ui/Tabs";
import MatchCard from "@/components/match/MatchCard";
import StandingsTable from "@/components/competition/StandingsTable";
import NewsCard from "@/components/news/NewsCard";
import Crest from "@/components/ui/Crest";
import DataSourceNote from "@/components/data/DataSourceNote";
import DataUnavailable from "@/components/ui/DataUnavailable";
import ProviderMatchList from "@/components/data/ProviderMatchList";
import SectionHead from "@/components/ui/SectionHead";
import { footballMatches, footballStandings, footballTopScorers, type FootballDataCompetitionRef } from "@/lib/football-data";
import { demoContentVisible } from "@/lib/site";
import { hasMatchIdentity, supportsPlayerStats } from "@/lib/sdl-gateway";
import { competitionByPath } from "@/lib/competition-catalog";
import { teamHref, teamLinkSlug } from "@/lib/team-lookup";
import type { NormalizedFixture, NormalizedStandingRow, NormalizedTopScorer } from "@/packages/sdl/src";
import {
  articles,
  competitionMatches,
  competitions,
  standings,
  topScorers,
} from "@/lib/data";
import { playerBySlug, sportBySlug, teamBySlug, teamsByCompetition } from "@/lib/core-data";
import { getAdminCompetitionBySlug } from "@/lib/admin-competitions";
import { AdminCompetitionDetail } from "@/components/public/AdminPublished";
import { decodeSlug } from "@/lib/slug";
import { isLiveStatus, matchStateOf, isFinishedStatus } from "@/lib/match-state";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";
import { countryName } from "@/lib/i18n/names";

export type ViewProps = { params: Promise<{ slug: string }> };


/**
 * Bound the lifetime of an on-demand ISR entry.
 *
 * Without this, a page (or a 404) rendered while a provider was briefly
 * unreachable is cached with no expiry: competition metadata and its table would stay wrong until the
 * next deploy. A bounded revalidate lets a transient outage self-heal while
 * still serving from cache in the normal case.
 */
export const revalidate = 1800;

export function generateStaticParams() {
  return demoContentVisible() ? competitions.map((c) => ({ slug: c.slug })) : [];
}

async function competitionMetadataBody({
  locale,
  params,
}: {
  locale: Locale;
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const providerCompetition = competitionByPath(slug);
  if (providerCompetition) {
    const compName = locale === "ar" ? providerCompetition.nameAr : providerCompetition.name;
    const title = t(locale, "cd.metaTitle", { name: compName });
    const description = t(locale, "cd.metaDescription", { name: compName });
    // Thin-page rule (§9): this URL is indexable only while the provider
    // actually answers for THIS competition. The site-wide rule in
    // lib/sdl-gateway.ts (dataServable) already noindexes everything when no
    // provider answers at all; it cannot see the case where the provider is
    // healthy but one registered competition has no table and no fixtures —
    // which would otherwise publish an indexable page of two "unavailable"
    // notices that competes with the pages carrying real content. The same
    // reads the body performs are cached, so this costs nothing extra, and the
    // page becomes indexable again on its own as soon as data arrives.
    const id = providerCompetition.slug ?? providerCompetition.code;
    const [table, matches] = await Promise.all([
      footballStandings(id),
      footballMatches({ competitionId: id }),
    ]);
    const hasData =
      (table.ok && (table.data?.length ?? 0) > 0) || (matches.ok && (matches.data?.length ?? 0) > 0);
    return {
      title,
      description,
      // Canonical is always the registered path, never the alias the visitor used.
      alternates: { canonical: `/competitions/${providerCompetition.canonicalSlug}` },
      // Own social title/description: without this, shared links inherit the
      // site-wide homepage title ("نيمو سبورتس | نتائج ومواعيد المباريات").
      openGraph: { title, description, type: "website" },
      ...(hasData ? {} : { robots: { index: false, follow: true } }),
    };
  }
  const c = demoContentVisible() ? competitions.find((x) => x.slug === slug) : undefined;
  if (!c) return { title: t(locale, "cd.notFound"), robots: { index: false, follow: true } };
  return {
    title: t(locale, "cd.demoMetaTitle", { name: c.name }),
    description: t(locale, "cd.demoMetaDescription", { name: c.name }),
    alternates: { canonical: `/competitions/${c.slug}` },
    robots: { index: false, follow: true },
  };
}

async function CompetitionPageBody({ locale, params }: { locale: Locale; params: Promise<{ slug: string }> }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const { slug } = await params;
  const providerCompetition = competitionByPath(slug);
  // One public URL per competition: aliases (PL, english-premier-league, ...)
  // permanently redirect to the registered canonical path.
  if (providerCompetition && providerCompetition.canonicalSlug !== decodeSlug(slug)) {
    permanentRedirect(`/competitions/${encodeURIComponent(providerCompetition.canonicalSlug)}`);
  }
  if (providerCompetition) return <ProviderCompetitionPage locale={locale} competition={providerCompetition} id={providerCompetition.slug ?? providerCompetition.code} />;

  const comp = demoContentVisible() ? competitions.find((c) => c.slug === slug) : undefined;
  if (!comp) notFound();

  const sport = sportBySlug(comp.sport);
  const table = standings[comp.slug];
  const scorers = topScorers[comp.slug];
  const matches = competitionMatches(comp.slug);
  const teams = teamsByCompetition(comp.slug);

  const live = matches.filter((m) => m.status === "LIVE");
  const upcoming = matches.filter((m) => m.status === "UPCOMING");
  const finished = matches.filter((m) => m.status === "FINISHED");
  const news = articles.filter((a) => a.competition === comp.slug || a.sport === comp.sport).slice(0, 6);

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <p className="mb-4 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[11px] font-semibold text-muted">{tr("cd.demoNotice")}</p>
      <nav aria-label={tr("cd.breadcrumbAria")} className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">{tr("cd.home")}</Link>
        <span aria-hidden>/</span>
        <Link href="/competitions" className="hover:text-gold-600 dark:hover:text-gold-400">{tr("cd.competitions")}</Link>
        <span aria-hidden>/</span>
        <span className="font-semibold text-ink">{comp.name}</span>
      </nav>

      <header className="stripes mb-6 overflow-hidden rounded-[8px] border border-navy-700 bg-navy-850 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-6">
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[4px] bg-gold-500 font-display text-lg font-extrabold tracking-wider text-navy-900">
              {comp.code}
            </span>
            <div>
              <p className="eyebrow !text-white/50">{sport?.name}</p>
              <h1 className="text-2xl font-extrabold tracking-tight">{comp.name}</h1>
              <p className="mt-1 text-[12px] text-white/60">
                {countryName(locale, comp.country)} · {tr("cd.seasonRounds", { season: comp.season, format: comp.format, rounds: comp.rounds })}
              </p>
            </div>
          </div>
          <dl className="flex flex-wrap gap-6 text-center">
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">{tr("cd.statTeams")}</dt>
              <dd className="num text-xl font-extrabold text-gold-400">{comp.teamsCount}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">{tr("cd.statLive")}</dt>
              <dd className="num text-xl font-extrabold text-live">{live.length}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">{tr("cd.statUpcoming")}</dt>
              <dd className="num text-xl font-extrabold">{upcoming.length}</dd>
            </div>
          </dl>
        </div>
      </header>

      <Tabs
        label={tr("cd.tabsAria")}
        items={[
          {
            id: "standings",
            label: tr("cd.tabTable"),
            disabled: !table,
            content: table ? (
              <StandingsTable rows={table} locale={locale} />
            ) : (
              <p className="card px-4 py-10 text-center text-[13px] text-muted">
                {tr("cd.noTable")}
              </p>
            ),
          },
          {
            id: "matches",
            label: tr("cd.tabMatches"),
            content: (
              <div className="space-y-6">
                {live.length > 0 ? (
                  <Group title={tr("cd.liveNow")} list={live} />
                ) : null}
                {upcoming.length > 0 ? <Group title={tr("cd.upcomingShort")} list={upcoming} /> : null}
                {finished.length > 0 ? <Group title={tr("cd.resultsShort")} list={finished} /> : null}
                {matches.length === 0 ? (
                  <p className="card px-4 py-10 text-center text-[13px] text-muted">
                    {tr("cd.noMatches")}
                  </p>
                ) : null}
              </div>
            ),
          },
          {
            id: "scorers",
            label: tr("cd.tabScorers"),
            disabled: !scorers,
            content: scorers ? (
              <div className="card overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-line bg-navy-850/[0.04] text-muted dark:bg-white/[0.04]">
                      <th className="px-3 py-2.5 text-start font-semibold">#</th>
                      <th className="px-3 py-2.5 text-start font-semibold">{tr("cd.thPlayer")}</th>
                      <th className="px-3 py-2.5 text-start font-semibold">{tr("cd.thTeam")}</th>
                      <th className="num px-3 py-2.5 font-semibold">{tr("cd.thMatches")}</th>
                      <th className="num px-3 py-2.5 font-semibold">{tr("cd.thPenalties")}</th>
                      <th className="num px-3 py-2.5 font-semibold">{tr("cd.thGoals")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scorers.map((s) => {
                      const p = playerBySlug(s.player);
                      const t = teamBySlug(s.team);
                      return (
                        <tr key={s.player} className="border-b border-line last:border-0 hover:bg-navy-850/[0.03] dark:hover:bg-white/[0.04]">
                          <td className="num px-3 py-2.5 font-extrabold text-gold-600 dark:text-gold-400">{s.pos}</td>
                          <td className="px-3 py-2.5">
                            <Link href={`/players/${s.player}`} className="font-bold transition hover:text-gold-600 dark:hover:text-gold-400">
                              {p?.name ?? s.player}
                            </Link>
                          </td>
                          <td className="px-3 py-2.5">
                            {t ? (
                              <Link href={`/teams/${t.slug}`} className="flex items-center gap-2 transition hover:text-gold-600 dark:hover:text-gold-400">
                                <Crest slug={t.slug} size={20} />
                                {t.name}
                              </Link>
                            ) : (
                              s.team
                            )}
                          </td>
                          <td className="num px-3 py-2.5 text-center">{s.apps}</td>
                          <td className="num px-3 py-2.5 text-center">{s.penalties}</td>
                          <td className="num px-3 py-2.5 text-center text-[14px] font-extrabold">{s.goals}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null,
          },
          {
            id: "teams",
            label: tr("cd.tabTeams"),
            content:
              teams.length > 0 ? (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {teams.map((t) => (
                    <li key={t.slug}>
                      <Link
                        href={`/teams/${t.slug}`}
                        className="card flex items-center gap-3 p-3 transition hover:border-gold-500/50"
                      >
                        <Crest slug={t.slug} size={38} />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-bold">{t.name}</span>
                          <span className="block text-[11px] text-muted">
                            {t.stadium ?? t.country}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="card px-4 py-10 text-center text-[13px] text-muted">
                  {tr("cd.individuals")}
                </p>
              ),
          },
          {
            id: "news",
            label: tr("cd.tabNews"),
            content:
              news.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {news.map((a) => (
                    <NewsCard key={a.slug} article={a} />
                  ))}
                </div>
              ) : (
                <p className="card px-4 py-10 text-center text-[13px] text-muted">{tr("cd.noNews")}</p>
              ),
          },
        ]}
      />
    </div>
  );
}

async function ProviderCompetitionPage({ locale, competition, id }: { locale: Locale; competition: FootballDataCompetitionRef; id: string }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const [tableResult, matchesResult] = await Promise.all([
    footballStandings(id),
    footballMatches({ competitionId: id }),
  ]);
  const tableData = tableResult.ok && tableResult.source.provider !== "demo" ? tableResult : null;
  const matchesData = matchesResult.ok && matchesResult.source.provider !== "demo" ? matchesResult : null;
  const rows: NormalizedStandingRow[] = tableData?.data ?? [];
  const fixtures: NormalizedFixture[] = (matchesData?.data ?? []).filter(hasMatchIdentity);
  const scorerResult = rows.length > 0 ? await footballTopScorers(id) : null;
  const scorerData = scorerResult?.ok && scorerResult.source.provider !== "demo" ? scorerResult : null;
  const scorers: NormalizedTopScorer[] = scorerData?.data ?? [];
  const live = fixtures.filter((fixture) => isLiveStatus(fixture.status));
  // Shared state rule: a stale "scheduled" (kickoff day passed) is not upcoming,
  // and walkover/awarded results count as results.
  const upcoming = fixtures.filter((fixture) => matchStateOf(fixture.status, fixture.scheduledAt) === "upcoming").sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt)).slice(0, 9);
  const results = fixtures.filter((fixture) => isFinishedStatus(fixture.status)).sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt)).slice(0, 9);
  const tableGroups = new Map<string, NormalizedStandingRow[]>();
  for (const row of rows) {
    const group = row.group ?? "";
    const list = tableGroups.get(group) ?? [];
    list.push(row);
    tableGroups.set(group, list);
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-9 px-4 py-6">
      <nav aria-label={tr("cd.breadcrumbAria")} className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">{tr("cd.home")}</Link><span aria-hidden>/</span>
        <Link href="/competitions" className="hover:text-gold-600 dark:hover:text-gold-400">{tr("cd.competitions")}</Link><span aria-hidden>/</span>
        <span className="font-semibold text-ink">{competition.nameAr}</span>
      </nav>
      <header className="stripes overflow-hidden rounded-[8px] border border-navy-700 bg-navy-850 text-white">
        <div className="flex flex-wrap items-center gap-4 px-5 py-5">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[4px] bg-gold-500 font-display text-sm font-extrabold text-navy-900">{competition.code}</span>
          <div className="min-w-0 flex-1">
            <p className="eyebrow !text-white/50">{locale === "ar" ? competition.countryAr : competition.country} · {tr("cd.coverageEyebrow")}</p>
            <h1 className="text-2xl font-extrabold tracking-tight">{competition.nameAr}</h1>
          </div>
          <Link href={`/matches?competition=${encodeURIComponent(id)}`} className="inline-flex min-h-11 items-center rounded-[3px] bg-white/10 px-3 text-[12px] font-bold transition hover:bg-gold-500 hover:text-navy-900 focus-ring">{tr("cd.browseMatches")}</Link>
        </div>
      </header>

      <section>
        <SectionHead eyebrow={tr("cd.tableEyebrow")} title={tr("cd.tableTitle")} />
        {rows.length > 0 ? (
          <div className="space-y-4">
            {[...tableGroups.entries()].map(([group, groupRows]) => (
              <div key={group || "main"} className="card overflow-x-auto">
                {group ? <h3 className="border-b border-line px-3 py-2 text-[12px] font-bold">{group.replaceAll("_", " ")}</h3> : null}
                <table className="w-full min-w-[580px] text-[12px]">
                  <thead><tr className="border-b border-line text-muted">
                    <th scope="col" className="px-2 py-2 text-start">{tr("cd.thPos")}</th><th scope="col" className="px-2 py-2 text-start">{tr("cd.thTeam")}</th>
                    <th scope="col" className="px-2 py-2 text-center">{tr("cd.thPlayed")}</th><th scope="col" className="px-2 py-2 text-center">{tr("cd.thWon")}</th>
                    <th scope="col" className="px-2 py-2 text-center">{tr("cd.thDrawn")}</th><th scope="col" className="px-2 py-2 text-center">{tr("cd.thLost")}</th>
                    <th scope="col" className="px-2 py-2 text-center">{tr("cd.thGD")}</th><th scope="col" className="px-2 py-2 text-center">{tr("cd.thPoints")}</th><th scope="col" className="px-2 py-2 text-center">{tr("cd.thLast5")}</th>
                  </tr></thead>
                  <tbody>{groupRows.map((row) => (
                    <tr key={`${row.position}-${row.teamProviderId}`} className="border-b border-line/60 last:border-0">
                      <td className="num px-2 py-2 font-extrabold text-muted">{row.position}</td>
                      <td className="px-2 py-2 font-bold">{(() => {
                        const href = teamHref(row);
                        const label = row.teamName ?? row.teamShortName ?? row.teamProviderId;
                        const crest = row.teamLogoUrl ? <img src={row.teamLogoUrl} alt="" width={20} height={20} loading="lazy" className="h-5 w-5 shrink-0 object-contain" /> : null;
                        // A link is emitted only when it resolves; an unnamed
                        // row stays plain text instead of a guaranteed 404.
                        return href ? (
                          <Link href={href} className="flex min-h-8 items-center gap-2 hover:text-gold-600 dark:hover:text-gold-400">
                            {crest}
                            <span className="truncate">{label}</span>
                          </Link>
                        ) : (
                          <span className="flex min-h-8 items-center gap-2"><span className="truncate">{label}</span></span>
                        );
                      })()}</td>
                      <td className="num px-2 py-2 text-center">{row.played}</td><td className="num px-2 py-2 text-center">{row.won}</td>
                      <td className="num px-2 py-2 text-center">{row.drawn}</td><td className="num px-2 py-2 text-center">{row.lost}</td>
                      <td className="num px-2 py-2 text-center text-muted">{row.goalsFor}:{row.goalsAgainst}</td><td className="num px-2 py-2 text-center font-extrabold">{row.points}</td>
                      <td className="px-2 py-2 text-center"><span className="inline-flex gap-0.5" aria-label={tr("cd.formAria")}>{row.form.slice(-5).map((value, index) => <span key={`${value}-${index}`} className={`inline-grid h-4 w-4 place-items-center rounded-[2px] text-[9px] font-extrabold ${value === "W" ? "bg-win-green/20 text-win-green" : value === "D" ? "bg-line text-muted" : "bg-live-red/15 text-live-red"}`}>{value}</span>)}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ))}
            {tableData ? <DataSourceNote className="mt-3" provider={tableData.source.provider} fromCache={tableData.source.fromCache} stale={tableData.source.stale} fetchedAt={tableData.source.fetchedAt} ttlSeconds={tableData.source.ttlSeconds} /> : null}
          </div>
        ) : <DataUnavailable title={tr("cd.tableUnavailableTitle")} message={tr("cd.tableUnavailableMessage")} actionHref="/standings" actionLabel={tr("cd.viewAvailableTables")} />}
      </section>

      <section>
        <SectionHead eyebrow={tr("cd.matchesEyebrow")} title={tr("cd.matchesTitle")} href={`/matches?competition=${encodeURIComponent(id)}`} />
        {fixtures.length === 0 ? (
          <DataUnavailable title={matchesData ? tr("cd.noMatchesInData") : tr("cd.matchesUnavailable")} message={matchesData ? tr("cd.matchesEmptyMessage") : tr("cd.matchesUnavailableMessage")} actionHref="/matches" actionLabel={tr("cd.browseMatchesAction")} />
        ) : (
          <div className="space-y-7">
            {live.length ? <div><SectionHead eyebrow={tr("cd.nowEyebrow")} title={tr("cd.liveTitle")} /><ProviderMatchList fixtures={live} /></div> : null}
            {upcoming.length ? <div><SectionHead eyebrow={tr("cd.fixturesEyebrow")} title={tr("cd.upcomingTitle")} /><ProviderMatchList fixtures={upcoming} /></div> : null}
            {results.length ? <div><SectionHead eyebrow={tr("cd.resultsEyebrow")} title={tr("cd.completedTitle")} /><ProviderMatchList fixtures={results} /></div> : null}
            {matchesData ? <DataSourceNote className="mt-3" provider={matchesData.source.provider} fromCache={matchesData.source.fromCache} stale={matchesData.source.stale} fetchedAt={matchesData.source.fetchedAt} ttlSeconds={matchesData.source.ttlSeconds} /> : null}
          </div>
        )}
      </section>

      <section>
        <SectionHead eyebrow={tr("cd.scorersEyebrow")} title={tr("cd.scorersTitle")} />
        {scorers.length > 0 ? (
          <div className="card divide-y divide-line overflow-hidden">
            {scorers.slice(0, 10).map((scorer) => {
              const playerId = scorer.playerProviderId.trim();
              const name = scorer.playerName?.trim() ?? "";
              const canOpenProfile = Boolean(
                playerId && name && scorer.profileAvailable === true && scorerData && supportsPlayerStats(scorerData.source.provider),
              );
              return (
                <div key={playerId || `${competition.code}-${scorer.goals}`} className="flex min-h-12 items-center gap-3 px-3 py-2.5">
                  <span className="num w-6 shrink-0 text-center text-[13px] font-extrabold text-gold-600 dark:text-gold-400">{scorer.goals}</span>
                  {canOpenProfile ? (
                    <Link href={`/players/${encodeURIComponent(playerId)}`} className="min-w-0 flex-1 truncate text-[12.5px] font-bold hover:text-gold-600 dark:hover:text-gold-400">{name}</Link>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold">{name || tr("cd.playerNameUnavailable")}</span>
                  )}
                  {(() => {
                    const teamLabel = scorer.teamName ?? "";
                    const href = teamLinkSlug(scorer) ? teamHref(scorer) : null;
                    return teamLabel ? (
                      href ? (
                        <Link href={href} className="hidden shrink-0 text-[11px] text-muted hover:text-gold-600 sm:block dark:hover:text-gold-400">{teamLabel}</Link>
                      ) : (
                        <span className="hidden shrink-0 text-[11px] text-muted sm:block">{teamLabel}</span>
                      )
                    ) : null;
                  })()}
                  {scorerData ? <span className="num text-[11px] text-muted">{tr("cd.appearances", { n: scorer.appearances ?? "—" })}</span> : null}
                </div>
              );
            })}
            {scorerData ? <div className="px-3 py-2"><DataSourceNote provider={scorerData.source.provider} fromCache={scorerData.source.fromCache} stale={scorerData.source.stale} fetchedAt={scorerData.source.fetchedAt} ttlSeconds={scorerData.source.ttlSeconds} /></div> : null}
          </div>
        ) : <DataUnavailable title={tr("cd.scorersUnavailableTitle")} message={tr("cd.scorersUnavailableMessage")} actionHref="/standings" actionLabel={tr("cd.tableAndStats")} />}
      </section>
    </div>
  );
}

function Group({ title, list }: { title: string; list: Parameters<typeof MatchCard>[0]["match"][] }) {
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

export async function generateMetadata(locale: Locale, { params }: ViewProps): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const c = await getAdminCompetitionBySlug(slug);
  if (c?.isPublished) {
    return {
      title: t(locale, "cd.adminMetaTitle", { name: c.nameAr }),
      description: `${c.nameAr}${c.season ? ` — ${c.season}` : ""}: ${t(locale, "cd.adminMetaDescription", { name: c.nameAr })}`,
      alternates: { canonical: `/competitions/${slug}` },
    };
  }
  const synced = await syncedBySlug("competition", slug);
  if (synced) {
    const fixtures = (await syncedRecords("fixture")).data;
    return { title: t(locale, "cd.adminMetaTitle", { name: String(synced.data.name) }), alternates: { canonical: `/competitions/${synced.slug}` }, robots: { index: indexWorthy(synced, fixtures), follow: true } };
  }
  return competitionMetadataBody({ locale, params });
}

export default async function CompetitionPage({ locale, params }: ViewProps & { locale: Locale }) {
  const { slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const adminComp = await getAdminCompetitionBySlug(slug);
  if (adminComp?.isPublished) return <AdminCompetitionDetail competition={adminComp} locale={locale} />;
  const synced = await syncedBySlug("competition", slug);
  if (synced) return <SyncedCompetitionDetail record={synced} locale={locale} />;
  return <CompetitionPageBody locale={locale} params={params} />;
}
