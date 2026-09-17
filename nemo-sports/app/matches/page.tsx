import type { Metadata } from "next";
import { Suspense } from "react";
import MatchesFilters from "@/components/match/MatchesFilters";
import MatchesBrowser from "@/components/match/MatchesBrowser";
import ProviderMatchList from "@/components/data/ProviderMatchList";
import { filterMatches, matchCounts } from "@/lib/filters";
import { sports } from "@/lib/core-data";
import { fixtures as sdlFixtures } from "@/lib/sdl-gateway";
import { demoContentVisible } from "@/lib/site";

export const metadata: Metadata = {
  title: "المباريات — مواعيد ونتائج كل الرياضات",
  description: "جدول مباريات اليوم والغد مع فلترة حسب الرياضة والبطولة والفريق والحالة.",
  alternates: { canonical: "/matches" },
};

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = {
    sport: typeof sp.sport === "string" ? sp.sport : "",
    competition: typeof sp.competition === "string" ? sp.competition : "",
    date: typeof sp.date === "string" ? sp.date : "today",
    status: typeof sp.status === "string" ? sp.status : "all",
    team: typeof sp.team === "string" ? sp.team : "",
  };

  const matches = filterMatches(q);
  const counts = matchCounts();
  const sportName = sports.find((s) => s.slug === q.sport)?.name;

  // ── real matches first: the live feed covers today + recent + upcoming ──
  const real = await sdlFixtures({ sport: "football" });
  const realList = real.ok
    ? real.data
        .slice()
        .sort((a, b) => {
          const rank = (f: typeof a) => (["live", "halftime", "extra_time", "penalty_shootout"].includes(f.status) ? 0 : f.status === "scheduled" ? 1 : 2);
          return rank(a) - rank(b) || +new Date(a.scheduledAt) - +new Date(b.scheduledAt);
        })
        .slice(0, 50)
    : [];

  if (real.ok && realList.length > 0) {
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <nav aria-label="مسار التنقل" className="mb-3 text-[11px] text-muted">
          <a href="/" className="hover:text-gold-600 dark:hover:text-gold-400">الرئيسية</a>
          <span aria-hidden> / </span>
          <span className="font-semibold text-ink">المباريات</span>
        </nav>
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
          <div>
            <p className="eyebrow mb-1">Fixtures &amp; Results</p>
            <h1 className="text-2xl font-extrabold tracking-tight">المباريات</h1>
          </div>
          <p className="text-[12px] text-muted">
            <span className="num font-bold">{realList.length}</span> مباراة من المصدر الحي · المباشر أولًا · التوقيت بتوقيت جهازك
          </p>
        </header>
        <ProviderMatchList fixtures={realList} />
        <p className="mt-6 text-[11px] text-muted">المصدر: {real.provider} · آخر جلب {new Date(real.fetchedAt).toLocaleTimeString("ar-EG")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <nav aria-label="مسار التنقل" className="mb-3 text-[11px] text-muted">
        <a href="/" className="hover:text-gold-600 dark:hover:text-gold-400">الرئيسية</a>
        <span aria-hidden> / </span>
        <span className="font-semibold text-ink">المباريات</span>
        {sportName ? (
          <>
            <span aria-hidden> / </span>
            <span className="font-semibold text-ink">{sportName}</span>
          </>
        ) : null}
      </nav>

      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">Fixtures &amp; Results</p>
          <h1 className="text-2xl font-extrabold tracking-tight">المباريات</h1>
        </div>
        <p className="text-[12px] text-muted">
          التوقيت المعروض بتوقيت جهازك · النتائج تُحدَّث تلقائيًا أثناء المباريات
        </p>
      </header>

      <Suspense fallback={<div className="card h-40 animate-pulse" />}>
        <MatchesFilters
          counts={counts}
          initialSport={q.sport}
          initialComp={q.competition}
          initialDate={q.date}
          initialStatus={q.status}
          initialView="grid"
          initialQuery={q.team}
        />
      </Suspense>

      <div className="mt-5">
        <MatchesBrowser matches={matches} />
      </div>
    </div>
  );
}
