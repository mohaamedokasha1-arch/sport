import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import MatchesFilters from "@/components/match/MatchesFilters";
import MatchesBrowser from "@/components/match/MatchesBrowser";
import ProviderMatchList from "@/components/data/ProviderMatchList";
import DataSourceNote from "@/components/data/DataSourceNote";
import LiveAutoRefresh from "@/components/data/LiveAutoRefresh";
import DataUnavailable from "@/components/ui/DataUnavailable";
import { filterMatches, matchCounts } from "@/lib/filters";
import { competitions, PUBLIC_SPORTS, sports } from "@/lib/core-data";
import { fixtures as sdlFixtures, fixturesForCairoDate } from "@/lib/sdl-gateway";
import { applyDemoOverrides } from "@/lib/match-overrides";
import { demoContentVisible } from "@/lib/site";
import { dateScopeIncludesToday, filterProviderMatches, providerMatchCounts, sortProviderMatches } from "@/lib/provider-match-filter";
import { liveBoard, reconcileResult } from "@/lib/live-board";
import { scopeLabel as scopeLabelFor, sportName } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/translate";
import { hasMatchIdentity } from "@/lib/sdl-gateway";
import { validateMatchStatus } from "@/lib/match-query";
import { competitionByPath } from "@/lib/competition-catalog";
import { siteDay, siteDateKey, isDateKey, shiftDateKey } from "@/lib/tz";
import type { NormalizedFixture } from "@/packages/sdl/src";
import type { Locale } from "@/lib/i18n/locales";

export type ViewProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };


export function generateMetadata(locale: Locale, _props: ViewProps = {} as ViewProps): Metadata {
  return {
  title: t(locale, "mt.metaTitle"),
  description: t(locale, "mt.metaDescription"),
  alternates: { canonical: "/matches" },
};
}

export const revalidate = 60;

export default async function MatchesPage({ locale, searchParams, }: ViewProps & { locale: Locale }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const sp = await searchParams;
  const query = {
    sport: typeof sp.sport === "string" ? sp.sport : "",
    competition: typeof sp.competition === "string" ? sp.competition : "",
    date: typeof sp.date === "string" ? sp.date : "today",
    status: typeof sp.status === "string" ? sp.status : Array.isArray(sp.status) ? "__invalid__" : "all",
    team: typeof sp.team === "string" ? sp.team : "",
    view: sp.view === "list" ? "list" as const : "grid" as const,
  };
  const statusError = validateMatchStatus(query.status);
  if (statusError) {
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <DataUnavailable
          title={tr("mt.badStatusTitle")}
          message={tr("mt.badStatusMessage")}
          actionHref="/matches"
          actionLabel={tr("mt.clearFilters")}
        />
      </div>
    );
  }
  const demoMode = demoContentVisible();
  const demoMatches = await applyDemoOverrides(filterMatches(query));

  const isSupportedSport = !query.sport || PUBLIC_SPORTS.some((sport) => sport.slug === query.sport);
  const requestedSports = query.sport ? [query.sport] : PUBLIC_SPORTS.map((sport) => sport.slug);
  const requestedDate = isDateKey(query.date) ? query.date : ["today", "yesterday", "tomorrow"].includes(query.date)
    ? shiftDateKey(siteDateKey(), query.date === "yesterday" ? -1 : query.date === "tomorrow" ? 1 : 0) : null;
  const now = Date.now();
  // Whenever the date scope covers today, statuses come from the site-wide live
  // board (lib/live-board.ts): the SAME data the homepage, /live and the score
  // rail count, so «مباشر» here equals /live for the same sport scope.
  const withLiveBoard = isSupportedSport && (dateScopeIncludesToday(requestedDate ?? query.date, now) || query.status === "live");
  const [feedResults, board] = await Promise.all([
    isSupportedSport
      ? Promise.all(requestedSports.map((sport) => requestedDate ? fixturesForCairoDate({ sport, date: requestedDate }) : sdlFixtures({ sport })))
      : Promise.resolve([]),
    withLiveBoard ? liveBoard(requestedSports, now) : Promise.resolve(null),
  ]);

  const successfulFeeds = feedResults.filter((result) => result.ok && result.source === "provider");
  const byId = new Map<string, NormalizedFixture>();
  for (const result of successfulFeeds) {
    if (!result.ok) continue;
    const list = board ? reconcileResult(result, board.boards, now) : result.data;
    for (const fixture of list) {
      if (fixture.providerId && hasMatchIdentity(fixture)) byId.set(fixture.providerId, fixture);
    }
  }
  // Matches in play that the dated feed did not carry (e.g. a 23:30 kickoff
  // still running after midnight) are part of today.
  if (board) for (const fixture of board.live) if (!byId.has(fixture.providerId)) byId.set(fixture.providerId, fixture);
  const liveFailed = board ? board.failedSports.map((sport) => sportName(locale, sport) || sport) : [];

  if (successfulFeeds.length > 0 || board?.ok) {
    const fixtures = [...byId.values()];
    const filtered = sortProviderMatches(filterProviderMatches(fixtures, query, now), now);
    const counts = providerMatchCounts(fixtures, query, now);
    const optionMap = new Map<string, { id: string; name: string; sport: string }>();
    for (const fixture of fixtures) {
      if (!fixture.competitionProviderId && !fixture.competitionName) continue;
      const id = fixture.competitionProviderId || fixture.competitionName || "";
      optionMap.set(id, { id, name: fixture.competitionName || id, sport: fixture.sport });
    }
    // Keep a requested competition selected even when the current date has no
    // fixtures for it (the feed-derived options may not contain that league).
    if (query.competition && !optionMap.has(query.competition)) {
      const canonical = competitionByPath(query.competition);
      optionMap.set(query.competition, {
        id: query.competition,
        name: canonical?.name ?? query.competition,
        sport: query.sport || "football",
      });
    }
    const activeResult = successfulFeeds[0] ?? null;
    const scopeLabel = scopeLabelFor(locale, requestedSports, PUBLIC_SPORTS.length);

    return (
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <nav aria-label={tr("mt.breadcrumbAria")} className="mb-3 text-[12px] text-muted">
          <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">{tr("mt.home")}</Link>
          <span aria-hidden> / </span>
          <span className="font-semibold text-ink">{tr("mt.pageName")}</span>
        </nav>
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
          <div>
            <p className="eyebrow mb-1">{tr("mt.eyebrow")}</p>
            <h1 className="text-2xl font-extrabold tracking-tight">{tr("mt.heading")}</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="text-[12px] text-muted">
              <span className="num font-bold">{filtered.length}</span> {tr("mt.countLine")} · {scopeLabel} · {tr("mt.tzCairo")}
            </p>
            <LiveAutoRefresh intervalSeconds={60} />
          </div>
        </header>

        <Suspense fallback={<div className="card h-36" aria-hidden />}>
          <MatchesFilters
            counts={counts}
            sportsOptions={PUBLIC_SPORTS.map(({ slug, name, icon }) => ({ slug, name, icon }))}
            competitionOptions={[...optionMap.values()]}
            initialSport={query.sport}
            initialComp={query.competition}
            initialDate={query.date}
            initialStatus={query.status}
            initialView={query.view}
            initialQuery={query.team}
          />
        </Suspense>

        {successfulFeeds.some((r) => r.ok && (r.stale || r.degraded)) && <p role="status" className="mt-4 text-sm text-muted">{tr("mt.someStale")}</p>}
        {liveFailed.length > 0 && <p role="status" className="mt-2 text-sm text-warn-600 dark:text-warn-400">{tr("mt.liveFailed")} {liveFailed.join(locale === "ar" ? "، " : ", ")}.</p>}
        <div className="mt-5">
          {filtered.length > 0 ? (
            <ProviderMatchList fixtures={filtered} view={query.view} />
          ) : (
            <DataUnavailable
              title={isSupportedSport ? tr("mt.noMatchesTitle") : tr("mt.sportUnavailableTitle")}
              message={isSupportedSport ? tr("mt.noMatchesMessage") : tr("mt.sportUnavailableMessage")}
              actionHref={isSupportedSport ? "/matches?date=week" : "/matches"}
              actionLabel={isSupportedSport ? tr("mt.weekMatches") : tr("mt.availableSports")}
            />
          )}
        </div>
        {activeResult?.ok ? (
          <DataSourceNote className="mt-6" provider={activeResult.provider} fromCache={activeResult.fromCache} stale={activeResult.stale} fetchedAt={activeResult.fetchedAt} />
        ) : board?.ok ? (
          <DataSourceNote className="mt-6" provider={board.providers[0] ?? "admin"} fromCache={board.fromCache} stale={board.stale} degraded={board.degraded} fetchedAt={board.fetchedAt ?? undefined} />
        ) : null}
      </div>
    );
  }

  if (!demoMode) {
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <nav aria-label={tr("mt.breadcrumbAria")} className="mb-3 text-[12px] text-muted">
          <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">{tr("mt.home")}</Link>
          <span aria-hidden> / </span>
          <span className="font-semibold text-ink">{tr("mt.pageName")}</span>
        </nav>
        <header className="mb-5 border-b-2 border-line pb-3">
          <p className="eyebrow mb-1">{tr("mt.eyebrow")}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{tr("mt.heading")}</h1>
        </header>
        <DataUnavailable title={tr("mt.loadFailedTitle")} message={tr("mt.loadFailedMessage")} actionHref="/live" actionLabel={tr("nav.live")} />
        <div className="mt-4 flex justify-end"><LiveAutoRefresh intervalSeconds={60} /></div>
      </div>
    );
  }

  const demoCounts = matchCounts();
  const demoCompetitionOptions = competitions.map((competition) => ({ id: competition.slug, name: competition.name, sport: competition.sport }));
  const demoSportOptions = sports.map(({ slug, name, icon }) => ({ slug, name, icon }));
  const selectedSportName = sports.find((sport) => sport.slug === query.sport);
  const selectedSportLabel = selectedSportName ? sportName(locale, selectedSportName.slug) : undefined;

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <nav aria-label={tr("mt.breadcrumbAria")} className="mb-3 text-[12px] text-muted">
        <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">{tr("mt.home")}</Link>
        <span aria-hidden> / </span>
        <span className="font-semibold text-ink">{tr("mt.pageName")}</span>
        {selectedSportLabel ? <><span aria-hidden> / </span><span className="font-semibold text-ink">{selectedSportLabel}</span></> : null}
      </nav>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">{tr("mt.demoEyebrow")}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{tr("mt.heading")}</h1>
        </div>
        <p className="text-[12px] text-muted">{tr("mt.demoNotice")}</p>
      </header>
      <Suspense fallback={<div className="card h-36" aria-hidden />}>
        <MatchesFilters
          counts={demoCounts}
          sportsOptions={demoSportOptions}
          competitionOptions={demoCompetitionOptions}
          initialSport={query.sport}
          initialComp={query.competition}
          initialDate={query.date}
          initialStatus={query.status}
          initialView={query.view}
          initialQuery={query.team}
        />
      </Suspense>
      <div className="mt-5"><MatchesBrowser matches={demoMatches} /></div>
      <p className="mt-4 text-[11px] text-muted">{tr("mt.demoOnly")}</p>
    </div>
  );
}
