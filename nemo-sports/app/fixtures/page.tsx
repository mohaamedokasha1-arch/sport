import type { Metadata } from "next";
import DataUnavailable from "@/components/ui/DataUnavailable";
import MatchCard from "@/components/match/MatchCard";
import SectionHead from "@/components/ui/SectionHead";
import ProviderMatchList from "@/components/data/ProviderMatchList";
import { postponed, upcomingNext, upcomingToday } from "@/lib/data";
import { dateAr, dayLabel } from "@/lib/format";
import { fixtures as sdlFixtures, hasMatchIdentity } from "@/lib/sdl-gateway";
import DataSourceNote from "@/components/data/DataSourceNote";
import { demoContentVisible } from "@/lib/site";
import { siteDay } from "@/lib/tz";
import type { NormalizedFixture } from "@/packages/sdl/src";

export const metadata: Metadata = {
  title: "المباريات القادمة — جدول المواعيد",
  description: "مواعيد المباريات القادمة مرتبة حسب اليوم من مصادر البيانات المتاحة.",
  alternates: { canonical: "/fixtures" },
};

export const revalidate = 120;

function groupFixturesByDay(fixtures: NormalizedFixture[]) {
  const groups = new Map<number, NormalizedFixture[]>();
  for (const fixture of fixtures) {
    const key = siteDay(fixture.scheduledAt);
    const current = groups.get(key) ?? [];
    current.push(fixture);
    groups.set(key, current);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([key, list]) => ({
    key,
    list: list.sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt)),
  }));
}

export default async function FixturesPage() {
  const now = Date.now();
  const real = await sdlFixtures({ sport: "football" });
  const realData = real.ok && real.source === "provider" ? real : null;
  const realUpcoming = realData
    ? realData.data
        .filter((fixture) => fixture.status === "scheduled" && +new Date(fixture.scheduledAt) > now && hasMatchIdentity(fixture))
        .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))
        .slice(0, 60)
    : [];

  if (realData) {
    const groups = groupFixturesByDay(realUpcoming);
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
          <div>
            <p className="eyebrow mb-1">المواعيد</p>
            <h1 className="text-2xl font-extrabold tracking-tight">المباريات القادمة</h1>
          </div>
          <p className="text-[12px] text-muted"><span className="num font-bold">{realUpcoming.length}</span> مباراة مؤكدة · توقيت القاهرة</p>
        </header>
        {groups.length === 0 ? (
          <DataUnavailable title="لا توجد مباريات قادمة في الجدول المتاح" message="لا يتضمن آخر تحديث مباريات لم تبدأ بعد. يمكنك مراجعة قائمة المباريات أو النتائج." actionHref="/matches" actionLabel="عرض كل المباريات" />
        ) : (
          <div className="space-y-8">
            {groups.map(({ key, list }) => (
              <section key={key}>
                <SectionHead eyebrow={dateAr(list[0].scheduledAt)} title={`${dayLabel(list[0].scheduledAt)} · ${list.length} مباراة`} />
                <ProviderMatchList fixtures={list} />
              </section>
            ))}
          </div>
        )}
        <DataSourceNote className="mt-6" provider={realData.provider} fromCache={realData.fromCache} stale={realData.stale} fetchedAt={realData.fetchedAt} />
      </div>
    );
  }

  const showDemo = demoContentVisible();
  const all = showDemo ? [...upcomingToday, ...upcomingNext].filter((match) => +new Date(match.kickoff) > now) : [];
  const byDay = all.reduce<Record<string, typeof all>>((acc, match) => {
    const key = String(siteDay(match.kickoff));
    (acc[key] ||= []).push(match);
    return acc;
  }, {});
  const days = Object.entries(byDay).sort(([a], [b]) => Number(a) - Number(b));

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">المواعيد</p>
          <h1 className="text-2xl font-extrabold tracking-tight">المباريات القادمة</h1>
        </div>
        {showDemo ? <p className="text-[12px] text-muted"><span className="num font-bold">{all.length}</span> مباراة في المعاينة</p> : null}
      </header>
      {days.length === 0 ? (
        <DataUnavailable title="لا توجد مواعيد مؤكدة حاليًا" message="لا يتوفر جدول قادم من مصدر بيانات قابل للتحقق. سنعيد المحاولة عند التحديث القادم." actionHref="/matches" actionLabel="تصفّح المباريات" />
      ) : (
        <div className="space-y-9">
          {days.map(([, list]) => (
            <section key={list[0].id}>
              <SectionHead eyebrow={dateAr(list[0].kickoff)} title={`${dayLabel(list[0].kickoff)} · ${list.length} مباراة`} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff)).map((match) => <MatchCard key={match.id} match={match} />)}
              </div>
            </section>
          ))}
        </div>
      )}
      {showDemo && postponed.length > 0 ? (
        <section className="mt-10">
          <SectionHead eyebrow="حالة المباراة" title="مؤجلة وملغاة" accent={false} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{postponed.map((match) => <MatchCard key={match.id} match={match} />)}</div>
        </section>
      ) : null}
    </div>
  );
}
