import type { Metadata } from "next";
import Link from "next/link";
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
import { siteDay, siteDateKey } from "@/lib/tz";
import { isFinishedStatus, matchStateOf } from "@/lib/match-state";
import { SPORT_NAME_AR, liveBoard, reconcileResult } from "@/lib/live-board";
import {
  articles,
  competitions,
  finishedToday,
  finishedYesterday,
  liveMatches,
  upcomingNext,
  upcomingToday,
} from "@/lib/data";

export const metadata: Metadata = {
  title: "نيمو سبورتس | نتائج ومواعيد المباريات",
  description: "تابع نتائج ومواعيد المباريات من مصادر البيانات المتاحة. تُعرض روابط البث الرسمية المرخّصة فقط عند توفرها.",
  alternates: { canonical: "/" },
};

export const revalidate = 60;

// Live-status vocabulary lives in lib/match-state.ts (one definition site-wide).

export default async function HomePage() {
  const now = Date.now();
  // The live section reads the site-wide live board (every public sport) — the
  // same data /live, /matches and the score rail count. It used to read the
  // football live feed only, which is why the homepage could say "0 live"
  // while /matches?date=today counted 24 (all sports).
  const [board, fixtureResult, scorerResult, todayResult] = await Promise.all([
    liveBoard(undefined, now),
    sdlFixtures({ sport: "football" }),
    footballTopScorers("english-premier-league"),
    fixturesForCairoDate({ sport: "football", date: siteDateKey(now) }),
  ]);

  const fixtureData = fixtureResult.ok && fixtureResult.source === "provider" ? fixtureResult : null;
  const scorerData = scorerResult.ok && scorerResult.source.provider !== "demo" ? scorerResult : null;
  const realMode = Boolean(board.ok || fixtureData || scorerData);
  const realLive = board.live.slice(0, 6);
  const liveBreakdown = board.sports
    .filter((sport) => (board.bySport[sport] ?? 0) > 0)
    .map((sport) => `${SPORT_NAME_AR[sport] ?? sport} ${board.bySport[sport]}`)
    .join(" · ");
  const failedLive = board.failedSports.map((sport) => SPORT_NAME_AR[sport] ?? sport);

  const todayKey = siteDay(now);
  const tomorrowKey = todayKey + 86_400_000;
  // Football sections, reconciled with the same board so a match never shows
  // "live" here and something else on /live.
  const providerFixtures = fixtureData ? reconcileResult(fixtureData, board.boards, now).filter(hasMatchIdentity) : [];
  const todayFixtures = (todayResult.ok && todayResult.source === "provider" ? reconcileResult(todayResult, board.boards, now).filter(hasMatchIdentity) : [])
    .filter((fixture) => siteDay(fixture.scheduledAt) === todayKey)
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  const todayShown = todayFixtures.slice(0, 12);
  const tomorrowFixtures = providerFixtures
    .filter((fixture) => matchStateOf(fixture.status, fixture.scheduledAt, now) === "upcoming" && siteDay(fixture.scheduledAt) === tomorrowKey)
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))
    .slice(0, 9);
  const latestResults = providerFixtures
    .filter((fixture) => isFinishedStatus(fixture.status))
    .sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt))
    .slice(0, 6);

  const cacheTtl = fixtureData ? (await cachePolicyFor("fixtures")).canonical : undefined;
  const demoMode = !realMode && demoContentVisible();
  // The football feed is a capped sample (≈50 matches, no date filter). When its newest
  // kickoff is well behind "now", today's empty list reflects the sample, not the calendar.
  const feedLatestMs = fixtureData ? Math.max(...fixtureData.data.map((f) => +new Date(f.scheduledAt)).filter(Number.isFinite), Number.NEGATIVE_INFINITY) : Number.NEGATIVE_INFINITY;
  const feedIsSampleBehindNow = Number.isFinite(feedLatestMs) && feedLatestMs < now - 2 * 3_600_000;
  const feedLatestLabel = Number.isFinite(feedLatestMs) ? new Date(feedLatestMs).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "short", timeStyle: "short" }) : "";

  if (realMode) {
    return (
      <div className="mx-auto max-w-[1280px] space-y-10 px-4 py-6">
        <header className="border-b-2 border-line pb-4">
          <p className="eyebrow mb-1">بيانات من المصادر المتاحة</p>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">نتائج ومواعيد المباريات</h1>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-3xl text-[13px] leading-6 text-muted">نعرض بيانات المباريات التي أمكن استرجاعها والتحقق منها فقط. قد تختلف التغطية حسب المصدر والبطولة.</p>
            <LiveAutoRefresh intervalSeconds={60} />
          </div>
          {fixtureData ? (
            <DataSourceNote className="mt-3" provider={fixtureData.provider} fromCache={fixtureData.fromCache} stale={fixtureData.stale} degraded={fixtureData.degraded} fetchedAt={fixtureData.fetchedAt} ttlSeconds={cacheTtl} />
          ) : board.ok ? (
            <DataSourceNote className="mt-3" provider={board.providers[0] ?? "admin"} fromCache={board.fromCache} stale={board.stale} degraded={board.degraded} fetchedAt={board.fetchedAt ?? undefined} />
          ) : null}
        </header>

        <section aria-label="المباريات المباشرة">
          <SectionHead eyebrow="الآن · كل الرياضات" title={board.ok ? `مباشر الآن (${board.total})` : "مباشر الآن"} href="/live" linkLabel="كل المباريات المباشرة" />
          {board.ok && board.total > 0 ? (
            <p className="-mt-2 mb-3 text-[12px] text-muted">
              <span className="num font-bold text-live">{board.total}</span> مباراة جارية الآن في كل الرياضات المتاحة{liveBreakdown ? ` (${liveBreakdown})` : ""}
              {board.total > realLive.length ? <> · نعرض أول <span className="num">{realLive.length}</span> — <Link href="/live" className="font-bold text-gold-600 dark:text-gold-400">عرض الكل</Link></> : null}
              {failedLive.length > 0 ? <span className="text-warn-600 dark:text-warn-400"> · تعذّر التحقق من: {failedLive.join("، ")}</span> : null}
            </p>
          ) : null}
          {realLive.length > 0 ? (
            <>
              <ProviderMatchList fixtures={realLive} />
              <DataSourceNote className="mt-3" provider={board.providers[0] ?? "admin"} fromCache={board.fromCache} stale={board.stale} degraded={board.degraded} fetchedAt={board.fetchedAt ?? undefined} />
            </>
          ) : board.ok ? (
            <div className="card px-4 py-5 text-center text-[13px] text-muted">
              لا توجد مباريات مباشرة في آخر تحديث للمصدر{failedLive.length > 0 ? ` (تعذّر التحقق من: ${failedLive.join("، ")})` : ""}. <Link href="/fixtures" className="font-bold text-gold-600 dark:text-gold-400">راجع المواعيد القادمة</Link>.
            </div>
          ) : (
            <DataUnavailable title="تعذّر التحقق من المباريات المباشرة" message="لم تتوفر استجابة مؤكدة من مصدر النتائج المباشرة. لا نعرض نتيجة تقديرية." actionHref="/live" actionLabel="إعادة المحاولة في صفحة المباشر" />
          )}
        </section>

        <section>
          <SectionHead
            eyebrow="اليوم · كرة القدم"
            title={todayFixtures.length > 0 ? `مباريات اليوم (${todayFixtures.length})` : "مباريات اليوم"}
            href="/matches?date=today&sport=football"
            linkLabel="كل مباريات كرة القدم اليوم"
          />
          {todayFixtures.length > 0 ? (
            <>
              {todayFixtures.length > todayShown.length ? (
                <p className="-mt-2 mb-3 text-[12px] text-muted">
                  نعرض أول <span className="num">{todayShown.length}</span> من <span className="num">{todayFixtures.length}</span> مباراة كرة قدم اليوم ·{" "}
                  <Link href="/matches?date=today" className="font-bold text-gold-600 dark:text-gold-400">مباريات اليوم في كل الرياضات</Link>
                </p>
              ) : null}
              <ProviderMatchList fixtures={todayShown} />
              {fixtureData ? <DataSourceNote className="mt-3" provider={fixtureData.provider} fromCache={fixtureData.fromCache} stale={fixtureData.stale} fetchedAt={fixtureData.fetchedAt} ttlSeconds={cacheTtl} /> : null}
            </>
          ) : (
            <DataUnavailable
              title="لا توجد مباريات اليوم في البيانات المتاحة"
              message={
                !fixtureData
                  ? "تعذّر استرجاع جدول مباريات موثوق."
                  : feedIsSampleBehindNow
                    ? `المصدر يعرض عينة محدودة (${fixtureData?.data.length ?? 0} مباراة كرة قدم) لا تغطي كل مباريات اليوم، وأحدث مباراة فيها بتوقيت ${feedLatestLabel}. لا نعرض مباريات غير مؤكدة.`
                  : fixtureData.degraded
                    ? "مصدر المباريات لم يُرجع جدولًا كاملًا في آخر محاولة، ولا يوجد في ما وصلنا مباراة لهذا اليوم. لا نعرض مباريات غير مؤكدة."
                    : "لم يتضمن آخر تحديث مباريات لهذا اليوم."
              }
              actionHref="/matches"
              actionLabel="فتح قائمة المباريات"
            />
          )}
        </section>

        <section>
          <SectionHead eyebrow="غدًا · كرة القدم" title="مباريات الغد" href="/matches?date=tomorrow&sport=football" linkLabel="كل مواعيد الغد" />
          {tomorrowFixtures.length > 0 ? (
            <>
              <ProviderMatchList fixtures={tomorrowFixtures} />
              {fixtureData ? <DataSourceNote className="mt-3" provider={fixtureData.provider} fromCache={fixtureData.fromCache} stale={fixtureData.stale} fetchedAt={fixtureData.fetchedAt} ttlSeconds={cacheTtl} /> : null}
            </>
          ) : (
            <div className="card px-4 py-5 text-center text-[13px] text-muted">لا تتوفر مواعيد مؤكدة للغد في آخر تحديث. <Link href="/fixtures" className="font-bold text-gold-600 dark:text-gold-400">تصفّح جدول المواعيد</Link>.</div>
          )}
        </section>

        <section>
          <SectionHead eyebrow="النتائج · كرة القدم" title="أحدث النتائج" href="/results" linkLabel="كل النتائج" />
          {latestResults.length > 0 ? (
            <>
              <ProviderMatchList fixtures={latestResults} />
              {fixtureData ? <DataSourceNote className="mt-3" provider={fixtureData.provider} fromCache={fixtureData.fromCache} stale={fixtureData.stale} fetchedAt={fixtureData.fetchedAt} ttlSeconds={cacheTtl} /> : null}
            </>
          ) : (
            <DataUnavailable title="لا توجد نتائج مكتملة في البيانات المتاحة" message={fixtureData ? "لم يتضمن آخر تحديث مباريات مكتملة." : "تعذّر استرجاع نتائج موثوقة."} actionHref="/results" actionLabel="فتح صفحة النتائج" />
          )}
        </section>

        <section>
          <SectionHead eyebrow="الدوري الإنجليزي الممتاز" title="الهدافون" href="/standings" linkLabel="الترتيب والهدافون" />
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
            <DataUnavailable title="قائمة الهدافين غير متاحة حاليًا" message="لا نعرض أسماء أو أرقامًا تقديرية عند غياب بيانات موثوقة." actionHref="/standings" actionLabel="عرض صفحة الترتيب" />
          )}
        </section>
      </div>
    );
  }

  if (!demoMode) {
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <header className="mb-5 border-b-2 border-line pb-4">
          <p className="eyebrow mb-1">نيمو سبورتس</p>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">نتائج ومواعيد المباريات</h1>
        </header>
        <DataUnavailable title="بيانات المباريات غير متاحة مؤقتًا" message="لم يصل تحديث موثوق من مزودي البيانات. لا نعرض بيانات تجريبية على الموقع العام." actionHref="/matches" actionLabel="تصفّح قائمة المباريات" />
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
        <p className="eyebrow mb-1">معاينة التطوير</p>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">نيمو سبورتس</h1>
        <p className="mt-2 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[12px] font-semibold leading-5 text-muted">المحتوى الظاهر أدناه بيانات توضيحية للتطوير فقط؛ لا يمثّل نتائج أو إحصاءات حقيقية.</p>
      </header>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-10">
          {featured.length > 0 ? <section><SectionHead eyebrow="معاينة" title="مباريات مختارة" href="/matches" /><div className="grid gap-4 lg:grid-cols-2">{featured.map((match) => <MatchCard key={match.id} match={match} variant="feature" />)}</div></section> : null}
          <section>
            <SectionHead eyebrow="معاينة" title="مباشر الآن" href="/live" />
            {liveMatches.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{liveMatches.slice(0, 6).map((match) => <MatchCard key={match.id} match={match} />)}</div> : <p className="card px-4 py-6 text-center text-[13px] text-muted">لا توجد مباريات ضمن بيانات المعاينة.</p>}
          </section>
          <section>
            <SectionHead eyebrow="معاينة" title="المباريات القادمة" href="/fixtures" />
            {demoUpcoming.length ? <div className="card divide-y divide-line overflow-hidden">{demoUpcoming.map((match) => <Link key={match.id} href={`/matches/${match.slug}`} className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 text-[13px] font-bold transition hover:bg-navy-850/[0.03] focus-ring dark:hover:bg-white/[0.04]"><span className="truncate">{match.home} × {match.away}</span><span className="num shrink-0 text-muted">{new Date(match.kickoff).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "short", timeStyle: "short" })}</span></Link>)}</div> : <p className="card px-4 py-6 text-center text-[13px] text-muted">لا توجد مواعيد ضمن بيانات المعاينة.</p>}
          </section>
          <section>
            <SectionHead eyebrow="معاينة" title="أحدث النتائج" href="/results" />
            {demoResults.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{demoResults.map((match) => <MatchCard key={match.id} match={match} />)}</div> : <p className="card px-4 py-6 text-center text-[13px] text-muted">لا توجد نتائج ضمن بيانات المعاينة.</p>}
          </section>
          {demoNews.length ? <section><SectionHead eyebrow="معاينة" title="أخبار للتطوير" href="/news" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{demoNews.slice(0, 3).map((article, index) => <NewsCard key={article.slug} article={article} layout={index === 0 ? "lead" : "grid"} />)}</div></section> : null}
          <section><SectionHead eyebrow="دليل البطولات" title="البطولات" href="/competitions" /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{["premier-league", "egyptian-league", "champions-league", "la-liga", "nba", "atp-tour", "handball-champions", "world-title-fights"].map((slug) => <CompetitionCard key={slug} slug={slug} />)}</div></section>
        </div>
        <aside className="min-w-0 space-y-6 xl:sticky xl:top-40 xl:self-start">
          <Trending />
          <div className="card p-4"><p className="eyebrow mb-2">حالة البيانات</p><p className="text-[12px] leading-6 text-muted">تعرض هذه البيئة محتوى تجريبيًا لتسهيل التطوير. لن تظهر هذه البيانات على الموقع العام.</p></div>
        </aside>
      </div>
    </div>
  );
}
