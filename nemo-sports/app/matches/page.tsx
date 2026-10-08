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
import { fixtures as sdlFixtures, liveMatches as sdlLive } from "@/lib/sdl-gateway";
import { applyDemoOverrides } from "@/lib/match-overrides";
import { demoContentVisible } from "@/lib/site";
import { filterProviderMatches, providerMatchCounts, sortProviderMatches } from "@/lib/provider-match-filter";
import { hasMatchIdentity } from "@/lib/sdl-gateway";
import { siteDay } from "@/lib/tz";
import type { NormalizedFixture } from "@/packages/sdl/src";

export const metadata: Metadata = {
  title: "المباريات — مواعيد ونتائج الرياضات المتاحة",
  description: "جدول المباريات بحسب الرياضة والبطولة والتاريخ والحالة، مع روابط تعمل إلى تفاصيل المباراة.",
  alternates: { canonical: "/matches" },
};

export const revalidate = 60;

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const query = {
    sport: typeof sp.sport === "string" ? sp.sport : "",
    competition: typeof sp.competition === "string" ? sp.competition : "",
    date: typeof sp.date === "string" ? sp.date : "today",
    status: typeof sp.status === "string" ? sp.status : "all",
    team: typeof sp.team === "string" ? sp.team : "",
    view: sp.view === "list" ? "list" as const : "grid" as const,
  };
  const demoMode = demoContentVisible();
  const demoMatches = await applyDemoOverrides(filterMatches(query));

  const isSupportedSport = !query.sport || PUBLIC_SPORTS.some((sport) => sport.slug === query.sport);
  const requestedSports = query.sport ? [query.sport] : PUBLIC_SPORTS.map((sport) => sport.slug);
  const feedResults = isSupportedSport
    ? await Promise.all(requestedSports.map((sport) => sdlFixtures({ sport })))
    : [];
  const liveResults = isSupportedSport && query.status === "live"
    ? await Promise.all(requestedSports.map((sport) => sdlLive(sport)))
    : [];

  const successfulFeeds = [...feedResults, ...liveResults].filter((result) => result.ok && result.source === "provider");
  const byId = new Map<string, NormalizedFixture>();
  for (const result of successfulFeeds) {
    if (!result.ok) continue;
    for (const fixture of result.data) {
      if (fixture.providerId && hasMatchIdentity(fixture)) byId.set(fixture.providerId, fixture);
    }
  }

  if (successfulFeeds.length > 0) {
    const fixtures = [...byId.values()];
    const filtered = sortProviderMatches(filterProviderMatches(fixtures, query));
    const counts = providerMatchCounts(fixtures, query);
    const optionMap = new Map<string, { id: string; name: string; sport: string }>();
    for (const fixture of fixtures) {
      if (!fixture.competitionProviderId && !fixture.competitionName) continue;
      const id = fixture.competitionProviderId || fixture.competitionName || "";
      optionMap.set(id, { id, name: fixture.competitionName || id, sport: fixture.sport });
    }
    const activeResult = successfulFeeds[0];

    return (
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <nav aria-label="مسار التنقل" className="mb-3 text-[12px] text-muted">
          <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">الرئيسية</Link>
          <span aria-hidden> / </span>
          <span className="font-semibold text-ink">المباريات</span>
        </nav>
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
          <div>
            <p className="eyebrow mb-1">جدول المباريات</p>
            <h1 className="text-2xl font-extrabold tracking-tight">المباريات</h1>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="text-[12px] text-muted">
              <span className="num font-bold">{filtered.length}</span> مباراة مطابقة · توقيت القاهرة
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

        <div className="mt-5">
          {filtered.length > 0 ? (
            <ProviderMatchList fixtures={filtered} view={query.view} />
          ) : (
            <DataUnavailable
              title={isSupportedSport ? "لا توجد مباريات تطابق هذه الفلاتر" : "بيانات هذه الرياضة غير متاحة حاليًا"}
              message={isSupportedSport
                ? "لم يُرجع مصدر المباريات نتائج ضمن التاريخ والحالة المحددين. غيّر الفلاتر أو اعرض كل المباريات المتاحة."
                : "لا نعرض نتائج رياضة أخرى بدلًا منها. اختر رياضة تتوفر لها بيانات أو تصفح جميع المباريات."}
              actionHref={isSupportedSport ? "/matches?date=week" : "/matches"}
              actionLabel={isSupportedSport ? "عرض مباريات الأسبوع" : "عرض الرياضات المتاحة"}
            />
          )}
        </div>
        {activeResult.ok ? (
          <DataSourceNote className="mt-6" provider={activeResult.provider} fromCache={activeResult.fromCache} stale={activeResult.stale} fetchedAt={activeResult.fetchedAt} />
        ) : null}
      </div>
    );
  }

  if (!demoMode) {
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <nav aria-label="مسار التنقل" className="mb-3 text-[12px] text-muted">
          <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">الرئيسية</Link>
          <span aria-hidden> / </span>
          <span className="font-semibold text-ink">المباريات</span>
        </nav>
        <header className="mb-5 border-b-2 border-line pb-3">
          <p className="eyebrow mb-1">جدول المباريات</p>
          <h1 className="text-2xl font-extrabold tracking-tight">المباريات</h1>
        </header>
        <DataUnavailable title="تعذّر تحميل المباريات حاليًا" message="مصدر المباريات لم يُرجع بيانات قابلة للتحقق. لا نعرض مباريات أو نتائج غير مؤكدة." actionHref="/live" actionLabel="صفحة المباريات المباشرة" />
        <div className="mt-4 flex justify-end"><LiveAutoRefresh intervalSeconds={60} /></div>
      </div>
    );
  }

  const demoCounts = matchCounts();
  const demoCompetitionOptions = competitions.map((competition) => ({ id: competition.slug, name: competition.name, sport: competition.sport }));
  const demoSportOptions = sports.map(({ slug, name, icon }) => ({ slug, name, icon }));
  const sportName = sports.find((sport) => sport.slug === query.sport)?.name;

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <nav aria-label="مسار التنقل" className="mb-3 text-[12px] text-muted">
        <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">الرئيسية</Link>
        <span aria-hidden> / </span>
        <span className="font-semibold text-ink">المباريات</span>
        {sportName ? <><span aria-hidden> / </span><span className="font-semibold text-ink">{sportName}</span></> : null}
      </nav>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">معاينة تطوير</p>
          <h1 className="text-2xl font-extrabold tracking-tight">المباريات</h1>
        </div>
        <p className="text-[12px] text-muted">بيانات المعاينة ليست نتائج حية ولا تُستخدم في الإنتاج.</p>
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
      <p className="mt-4 text-[11px] text-muted">يظهر هذا المحتوى في بيئة المعاينة فقط.</p>
    </div>
  );
}
