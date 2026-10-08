import type { Metadata } from "next";
import MatchCard from "@/components/match/MatchCard";
import SectionHead from "@/components/ui/SectionHead";
import ProviderMatchList from "@/components/data/ProviderMatchList";
import LiveAutoRefresh from "@/components/data/LiveAutoRefresh";
import { liveMatches as sdlLiveMatches } from "@/lib/sdl-gateway";
import DataSourceNote from "@/components/data/DataSourceNote";
import { demoContentVisible } from "@/lib/site";
import DataUnavailable from "@/components/ui/DataUnavailable";
import { allMatches, liveMatches } from "@/lib/data";
import { getLiveStates } from "@/lib/live";
import { competitionBySlug, sports } from "@/lib/core-data";

export const metadata: Metadata = {
  title: "المباشر — المباريات الجارية الآن",
  description: "تابع نتائج المباريات الجارية من مصادر البيانات المتاحة، مع حالة واضحة عند عدم وجود مباراة مباشرة.",
  alternates: { canonical: "/live" },
};

export const revalidate = 30;

export default async function LivePage() {
  const result = await sdlLiveMatches("football");
  const realData = result.ok && result.source === "provider" ? result : null;
  const realLive = realData ? realData.data.filter((fixture) => ["live", "halftime", "extra_time", "extra_time_halftime", "penalty_shootout"].includes(fixture.status)) : [];
  const showDemo = demoContentVisible();
  const states = showDemo ? getLiveStates() : {};
  const demoLive = showDemo ? liveMatches : [];
  const now = Date.now();
  const startingSoon = showDemo
    ? allMatches.filter((match) => states[match.id]?.status === "UPCOMING" && +new Date(match.kickoff) > now && +new Date(match.kickoff) - now < 3 * 3600 * 1000)
    : [];
  const justFinished = showDemo
    ? allMatches.filter((match) => states[match.id]?.status === "FINISHED" && now - +new Date(match.kickoff) < 6 * 3600 * 1000).slice(0, 6)
    : [];

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">نتائج المباريات</p>
          <h1 className="text-2xl font-extrabold tracking-tight">مباشر الآن</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {realData ? (
            <p className="text-[12px] text-muted"><span className="num font-bold text-live">{realLive.length}</span> مباراة جارية</p>
          ) : showDemo ? (
            <p className="text-[12px] text-muted"><span className="num font-bold text-live">{demoLive.length}</span> مباراة جارية في المعاينة</p>
          ) : null}
          {realData || !showDemo ? <LiveAutoRefresh intervalSeconds={60} /> : null}
        </div>
      </header>

      {realData ? (
        realLive.length > 0 ? (
          <section aria-label="المباريات الجارية">
            <p className="mb-3 flex items-center gap-2 text-[12px] font-bold text-live">
              <span className="live-dot" aria-hidden /> {realLive.length} مباراة جارية الآن
            </p>
            <ProviderMatchList fixtures={realLive} />
            <DataSourceNote className="mt-3" provider={realData.provider} fromCache={realData.fromCache} stale={realData.stale} fetchedAt={realData.fetchedAt} />
          </section>
        ) : (
          <DataUnavailable title="لا توجد مباريات مباشرة الآن" message="آخر تحديث من مصدر المباريات لا يتضمن مباراة جارية. ستظهر المباريات هنا عند انطلاقها." actionHref="/fixtures" actionLabel="مشاهدة المباريات القادمة" />
        )
      ) : showDemo && demoLive.length > 0 ? (
        <div className="space-y-8">
          <p className="rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[12px] font-semibold text-muted">بيانات معاينة للتطوير فقط — ليست نتائج حية.</p>
          {Object.entries(demoLive.reduce<Record<string, typeof demoLive>>((acc, match) => {
            (acc[match.sport] ||= []).push(match);
            return acc;
          }, {})).map(([sport, matches]) => (
            <section key={sport}>
              <SectionHead eyebrow={competitionBySlug(matches[0].competition)?.country} title={`${sports.find((item) => item.slug === sport)?.icon ?? ""} ${sports.find((item) => item.slug === sport)?.name ?? ""}`} accent />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{matches.map((match) => <MatchCard key={match.id} match={match} />)}</div>
            </section>
          ))}
        </div>
      ) : (
        <DataUnavailable title="البيانات المباشرة غير متاحة حاليًا" message="لم يصل تحديث قابل للتحقق من مصدر المباريات. سنعيد المحاولة تلقائيًا، ويمكنك مراجعة جدول المواعيد." actionHref="/fixtures" actionLabel="المباريات القادمة" />
      )}

      {showDemo && startingSoon.length > 0 ? (
        <section className="mt-10">
          <SectionHead eyebrow="تبدأ قريبًا" title="المباريات التالية" href="/fixtures" />
          <div className="card overflow-hidden">{startingSoon.slice(0, 8).map((match) => <MatchCard key={match.id} match={match} variant="row" />)}</div>
        </section>
      ) : null}
      {showDemo && justFinished.length > 0 ? (
        <section className="mt-10">
          <SectionHead eyebrow="اكتملت" title="انتهت مؤخرًا" href="/results" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{justFinished.map((match) => <MatchCard key={match.id} match={match} />)}</div>
        </section>
      ) : null}
    </div>
  );
}
