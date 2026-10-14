import { SyncedFixtureHighlights } from "@/components/data/SyncedSports";
import type { Metadata } from "next";
import Link from "@/components/i18n/Link";
import DataUnavailable from "@/components/ui/DataUnavailable";
import DataSourceNote from "@/components/data/DataSourceNote";
import LiveAutoRefresh from "@/components/data/LiveAutoRefresh";
import ProviderMatchList from "@/components/data/ProviderMatchList";
import MatchCard from "@/components/match/MatchCard";
import NewsCard from "@/components/news/NewsCard";
import CompetitionCard from "@/components/competition/CompetitionCard";
import Trending from "@/components/home/Trending";
import SectionHead from "@/components/ui/SectionHead";
import { fixturesForCairoDate, cachePolicyFor, fixtures as sdlFixtures, hasMatchIdentity } from "@/lib/sdl-gateway";
import { footballTopScorers } from "@/lib/football-data";
import { demoContentVisible } from "@/lib/site";
import { siteDay, siteDateKey, shiftDateKey } from "@/lib/tz";
import { isFinishedStatus, matchStateOf } from "@/lib/match-state";
import { liveBoard, reconcileResult } from "@/lib/live-board";
import {
  articles,
  competitions,
  finishedToday,
  finishedYesterday,
  liveMatches,
  upcomingNext,
  upcomingToday,
} from "@/lib/data";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";
import { localeAlternates } from "@/lib/i18n/metadata";
import { sportName } from "@/lib/i18n/names";
import { formatClock } from "@/lib/i18n/dates";

export type ViewProps = Record<string, never>;


export function generateMetadata(locale: Locale, _props: ViewProps = {} as ViewProps): Metadata {
  return {
    // The Arabic strings are the ones the site has always shipped, unchanged.
    title: locale === "ar" ? "نيمو سبورتس | نتائج ومواعيد المباريات" : t(locale, "home.metaTitle"),
    description: t(locale, "home.metaDescription"),
    alternates: localeAlternates(locale, "/"),
  };
}

export const revalidate = 60;

// Live-status vocabulary lives in lib/match-state.ts (one definition site-wide).

async function HomePageBody({ locale }: { locale: Locale }) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);
  const now = Date.now();
  // The live section reads the site-wide live board (every public sport) — the
  // same data /live, /matches and the score rail count. It used to read the
  // football live feed only, which is why the homepage could say "0 live"
  // while /matches?date=today counted 24 (all sports).
  const todayCairo = siteDateKey(now);
  // Every football day section reads the day endpoint (fixturesForCairoDate).
  // The former "tomorrow" and "results" lists were filtered out of the 50-match
  // live+recent feed, which almost never contains tomorrow's or yesterday's
  // matches — so those sections were structurally empty.
  const [board, fixtureResult, scorerResult, todayResult, tomorrowResult, yesterdayResult] = await Promise.all([
    liveBoard(undefined, now),
    sdlFixtures({ sport: "football" }),
    footballTopScorers("english-premier-league"),
    fixturesForCairoDate({ sport: "football", date: todayCairo }),
    fixturesForCairoDate({ sport: "football", date: shiftDateKey(todayCairo, 1) }),
    fixturesForCairoDate({ sport: "football", date: shiftDateKey(todayCairo, -1) }),
  ]);

  const fixtureData = fixtureResult.ok && fixtureResult.source === "provider" ? fixtureResult : null;
  const scorerData = scorerResult.ok && scorerResult.source.provider !== "demo" ? scorerResult : null;
  const realMode = Boolean(board.ok || fixtureData || scorerData);
  const realLive = board.live.slice(0, 6);
  const liveBreakdown = board.sports
    .filter((sport) => (board.bySport[sport] ?? 0) > 0)
    .map((sport) => `${sportName(locale, sport)} ${board.bySport[sport]}`)
    .join(locale === "ar" ? " · " : " · ");
  const failedLive = board.failedSports.map((sport) => sportName(locale, sport));

  const todayKey = siteDay(now);
  const tomorrowKey = todayKey + 86_400_000;
  // Football sections, reconciled with the same board so a match never shows
  // "live" here and something else on /live.
  const dayRows = (result: typeof todayResult) => (result.ok && result.source === "provider" ? reconcileResult(result, board.boards, now).filter(hasMatchIdentity) : []);
  const todayFixtures = dayRows(todayResult)
    .filter((fixture) => siteDay(fixture.scheduledAt) === todayKey)
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  const todayShown = todayFixtures.slice(0, 12);
  const tomorrowData = tomorrowResult.ok && tomorrowResult.source === "provider" ? tomorrowResult : null;
  const tomorrowFixtures = dayRows(tomorrowResult)
    .filter((fixture) => matchStateOf(fixture.status, fixture.scheduledAt, now) === "upcoming" && siteDay(fixture.scheduledAt) === tomorrowKey)
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))
    .slice(0, 9);
  const resultsData = todayResult.ok && todayResult.source === "provider" ? todayResult : yesterdayResult.ok && yesterdayResult.source === "provider" ? yesterdayResult : null;
  const latestResults = [...dayRows(yesterdayResult), ...dayRows(todayResult)]
    .filter((fixture) => isFinishedStatus(fixture.status))
    .sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt))
    .slice(0, 6);

  const cacheTtl = fixtureData ? (await cachePolicyFor("fixtures")).canonical : undefined;
  const demoMode = !realMode && demoContentVisible();
  if (realMode) {
    return (
      <div className="mx-auto max-w-[1280px] space-y-10 px-4 py-6">
        <header className="border-b-2 border-line pb-4">
          <p className="eyebrow mb-1">{tr("home.eyebrow")}</p>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{tr("home.title")}</h1>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-3xl text-[13px] leading-6 text-muted">{tr("home.subtitle")}</p>
            <LiveAutoRefresh intervalSeconds={60} />
          </div>
          {fixtureData ? (
            <DataSourceNote className="mt-3" provider={fixtureData.provider} fromCache={fixtureData.fromCache} stale={fixtureData.stale} degraded={fixtureData.degraded} fetchedAt={fixtureData.fetchedAt} ttlSeconds={cacheTtl} />
          ) : board.ok ? (
            <DataSourceNote className="mt-3" provider={board.providers[0] ?? "admin"} fromCache={board.fromCache} stale={board.stale} degraded={board.degraded} fetchedAt={board.fetchedAt ?? undefined} />
          ) : null}
        </header>

        <section aria-label={tr("live.title")}>
          <SectionHead eyebrow={tr("home.liveEyebrow")} title={board.ok ? tr("home.liveTitleCount", { count: board.total }) : tr("home.liveTitle")} href="/live" linkLabel={tr("home.liveAll")} />
          {board.ok && board.total > 0 ? (
            <p className="-mt-2 mb-3 text-[12px] text-muted">
              {tr("home.liveSummary", { count: board.total })} <span className="num font-bold text-live">{board.total}</span>{liveBreakdown ? ` (${liveBreakdown})` : ""}
              {board.total > realLive.length ? <>{tr("home.liveTruncated", { shown: realLive.length })}<Link href="/live" className="font-bold text-gold-600 dark:text-gold-400">{tr("home.showAll")}</Link></> : null}
              {failedLive.length > 0 ? <span className="text-warn-600 dark:text-warn-400">{tr("home.liveUnverified", { list: failedLive.join(locale === "ar" ? "، " : ", ") })}</span> : null}
            </p>
          ) : null}
          {realLive.length > 0 ? (
            <>
              <ProviderMatchList fixtures={realLive} />
              <DataSourceNote className="mt-3" provider={board.providers[0] ?? "admin"} fromCache={board.fromCache} stale={board.stale} degraded={board.degraded} fetchedAt={board.fetchedAt ?? undefined} />
            </>
          ) : board.ok ? (
            <div className="card px-4 py-5 text-center text-[13px] text-muted">
              {tr("home.liveEmpty")}{failedLive.length > 0 ? tr("home.liveUnverifiedShort", { list: failedLive.join(locale === "ar" ? "، " : ", ") }) : ""}. <Link href="/fixtures" className="font-bold text-gold-600 dark:text-gold-400">{tr("home.checkFixtures")}</Link>.
            </div>
          ) : (
            <DataUnavailable title={tr("home.liveFailTitle")} message={tr("home.liveFailMessage")} actionHref="/live" actionLabel={tr("home.retryLive")} />
          )}
        </section>

        <section>
          <SectionHead
            eyebrow={tr("home.todayEyebrow")}
            title={todayFixtures.length > 0 ? tr("home.todayTitleCount", { count: todayFixtures.length }) : tr("home.todayTitle")}
            href="/matches?date=today&sport=football"
            linkLabel={tr("home.todayAll")}
          />
          {todayFixtures.length > 0 ? (
            <>
              {todayFixtures.length > todayShown.length ? (
                <p className="-mt-2 mb-3 text-[12px] text-muted">
                  {tr("home.todayTruncated", { shown: todayShown.length, total: todayFixtures.length })}
                  <Link href="/matches?date=today" className="font-bold text-gold-600 dark:text-gold-400">{tr("home.todayAllSports")}</Link>
                </p>
              ) : null}
              <ProviderMatchList fixtures={todayShown} />
              {fixtureData ? <DataSourceNote className="mt-3" provider={fixtureData.provider} fromCache={fixtureData.fromCache} stale={fixtureData.stale} fetchedAt={fixtureData.fetchedAt} ttlSeconds={cacheTtl} /> : null}
            </>
          ) : (
            todayResult.ok && todayResult.source === "provider" ? (
              <DataUnavailable
                title={tr("home.todayNoneTitle")}
                message={todayResult.degraded ? tr("home.todayNoneDegraded") : tr("home.todayNoneMessage")}
                actionHref="/matches"
                actionLabel={tr("home.openMatches")}
              />
            ) : (
              <DataUnavailable
                title={tr("home.todayFailTitle")}
                message={tr("home.todayFailMessage")}
                actionHref="/matches"
                actionLabel={tr("home.openMatches")}
              />
            )
          )}
        </section>

        <section>
          <SectionHead eyebrow={tr("home.tomorrowEyebrow")} title={tr("home.tomorrowTitle")} href="/matches?date=tomorrow&sport=football" linkLabel={tr("home.tomorrowAll")} />
          {tomorrowFixtures.length > 0 ? (
            <>
              <ProviderMatchList fixtures={tomorrowFixtures} />
              {tomorrowData ? <DataSourceNote className="mt-3" provider={tomorrowData.provider} fromCache={tomorrowData.fromCache} stale={tomorrowData.stale} degraded={tomorrowData.degraded} fetchedAt={tomorrowData.fetchedAt} ttlSeconds={cacheTtl} /> : null}
            </>
          ) : tomorrowData ? (
            <div className="card px-4 py-5 text-center text-[13px] text-muted">{tr("home.tomorrowEmpty")}<Link href="/fixtures" className="font-bold text-gold-600 dark:text-gold-400">{tr("home.browseFixtures")}</Link>.</div>
          ) : (
            <DataUnavailable title={tr("home.tomorrowFailTitle")} message={tr("home.tomorrowFailMessage")} actionHref="/fixtures" actionLabel={tr("home.browseFixtures")} />
          )}
        </section>

        <section>
          <SectionHead eyebrow={tr("home.resultsEyebrow")} title={tr("home.resultsTitle")} href="/results" linkLabel={tr("home.resultsAll")} />
          {latestResults.length > 0 ? (
            <>
              <ProviderMatchList fixtures={latestResults} />
              {resultsData ? <DataSourceNote className="mt-3" provider={resultsData.provider} fromCache={resultsData.fromCache} stale={resultsData.stale} degraded={resultsData.degraded} fetchedAt={resultsData.fetchedAt} ttlSeconds={cacheTtl} /> : null}
            </>
          ) : (
            <DataUnavailable title={tr("home.resultsNoneTitle")} message={resultsData ? tr("home.resultsNoneMessage") : tr("home.resultsFailMessage")} actionHref="/results" actionLabel={tr("home.openResults")} />
          )}
        </section>

        <section>
          <SectionHead eyebrow={tr("home.scorersEyebrow")} title={tr("home.scorersTitle")} href="/standings" linkLabel={tr("home.scorersLink")} />
          {scorerData?.data.length ? (
            <div className="card overflow-hidden">
              <ol className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0">
                {scorerData.data.slice(0, 6).map((scorer, index) => (
                  <li key={scorer.playerProviderId} className="flex min-h-12 items-center gap-3 border-b border-line px-3 py-2.5 last:border-0">
                    <span className="num w-5 shrink-0 text-[12px] font-extrabold text-gold-600 dark:text-gold-400">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold">{scorer.playerName ?? scorer.playerProviderId}</span>
                    <span className="hidden shrink-0 text-[11px] text-muted sm:block">{scorer.teamName ?? ""}</span>
                    <span className="num shrink-0 text-[13px] font-extrabold">{scorer.goals}</span>
                  </li>
                ))}
              </ol>
              <div className="border-t border-line px-3 py-2"><DataSourceNote provider={scorerData.source.provider} fromCache={scorerData.source.fromCache} stale={scorerData.source.stale} fetchedAt={scorerData.source.fetchedAt} ttlSeconds={scorerData.source.ttlSeconds} /></div>
            </div>
          ) : (
            <DataUnavailable title={tr("home.scorersNoneTitle")} message={tr("home.scorersNoneMessage")} actionHref="/standings" actionLabel={tr("home.openStandings")} />
          )}
        </section>
      </div>
    );
  }

  if (!demoMode) {
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <header className="mb-5 border-b-2 border-line pb-4">
          <p className="eyebrow mb-1">{tr("home.brand")}</p>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{tr("home.title")}</h1>
        </header>
        <DataUnavailable title={tr("home.dataDownTitle")} message={tr("home.dataDownMessage")} actionHref="/matches" actionLabel={tr("home.browseMatches")} />
        <div className="mt-4 flex justify-end"><LiveAutoRefresh intervalSeconds={60} /></div>
      </div>
    );
  }

  const featured = [...liveMatches.filter((match) => match.featured), ...upcomingToday.filter((match) => match.featured), ...upcomingNext.filter((match) => match.featured)].slice(0, 2);
  const demoUpcoming = [...upcomingToday, ...upcomingNext].filter((match) => +new Date(match.kickoff) > now).sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff)).slice(0, 6);
  const demoResults = [...finishedToday, ...finishedYesterday].sort((a, b) => +new Date(b.kickoff) - +new Date(a.kickoff)).slice(0, 6);
  const demoNews = articles.slice(0, 6);

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-6 border-b-2 border-line pb-4">
        <p className="eyebrow mb-1">{tr("home.previewEyebrow")}</p>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{tr("home.brand")}</h1>
        <p className="mt-2 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[12px] font-semibold leading-5 text-muted">{tr("home.previewBanner")}</p>
      </header>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-10">
          {featured.length > 0 ? <section><SectionHead eyebrow={tr("home.previewEyebrow")} title={tr("home.previewFeatured")} href="/matches" /><div className="grid gap-4 lg:grid-cols-2">{featured.map((match) => <MatchCard key={match.id} match={match} variant="feature" />)}</div></section> : null}
          <section>
            <SectionHead eyebrow={tr("home.previewEyebrow")} title={tr("home.previewLive")} href="/live" />
            {liveMatches.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{liveMatches.slice(0, 6).map((match) => <MatchCard key={match.id} match={match} />)}</div> : <p className="card px-4 py-6 text-center text-[13px] text-muted">{tr("home.previewEmpty")}</p>}
          </section>
          <section>
            <SectionHead eyebrow={tr("home.previewEyebrow")} title={tr("home.previewUpcoming")} href="/fixtures" />
            {demoUpcoming.length ? <div className="card divide-y divide-line overflow-hidden">{demoUpcoming.map((match) => <Link key={match.id} href={`/matches/${match.slug}`} className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 text-[13px] font-bold transition hover:bg-navy-850/[0.03] focus-ring dark:hover:bg-white/[0.04]"><span className="truncate">{match.home} × {match.away}</span><span className="num shrink-0 text-muted">{formatClock(locale, match.kickoff)}</span></Link>)}</div> : <p className="card px-4 py-6 text-center text-[13px] text-muted">{tr("home.previewNoFixtures")}</p>}
          </section>
          <section>
            <SectionHead eyebrow={tr("home.previewEyebrow")} title={tr("home.previewResults")} href="/results" />
            {demoResults.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{demoResults.map((match) => <MatchCard key={match.id} match={match} />)}</div> : <p className="card px-4 py-6 text-center text-[13px] text-muted">{tr("home.previewNoResults")}</p>}
          </section>
          {demoNews.length ? <section><SectionHead eyebrow={tr("home.previewEyebrow")} title={tr("home.previewNews")} href="/news" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{demoNews.slice(0, 3).map((article, index) => <NewsCard key={article.slug} article={article} layout={index === 0 ? "lead" : "grid"} />)}</div></section> : null}
          <section><SectionHead eyebrow={tr("home.competitionsEyebrow")} title={tr("nav.competitions")} href="/competitions" /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{["premier-league", "egyptian-league", "champions-league", "la-liga", "nba", "atp-tour", "handball-champions", "world-title-fights"].map((slug) => <CompetitionCard key={slug} slug={slug} locale={locale} />)}</div></section>
        </div>
        <aside className="min-w-0 space-y-6 xl:sticky xl:top-40 xl:self-start">
          <Trending locale={locale} />
          <div className="card p-4"><p className="eyebrow mb-2">{tr("home.dataState")}</p><p className="text-[12px] leading-6 text-muted">{tr("home.dataStateBody")}</p></div>
        </aside>
      </div>
    </div>
  );
}

export default async function HomePage({ locale }: { locale: Locale }) { return <><HomePageBody locale={locale} /><SyncedFixtureHighlights /></>; }
