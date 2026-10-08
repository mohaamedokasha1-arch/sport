import type { Metadata } from "next";
import Link from "next/link";
import DataUnavailable from "@/components/ui/DataUnavailable";
import MatchCard from "@/components/match/MatchCard";
import SectionHead from "@/components/ui/SectionHead";
import ProviderMatchList from "@/components/data/ProviderMatchList";
import DataSourceNote from "@/components/data/DataSourceNote";
import { finishedToday, finishedYesterday } from "@/lib/data";
import { dateAr, dayLabel } from "@/lib/format";
import { fixtures as sdlFixtures, hasMatchIdentity } from "@/lib/sdl-gateway";
import { demoContentVisible } from "@/lib/site";
import { siteDay } from "@/lib/tz";
import type { NormalizedFixture } from "@/packages/sdl/src";

export const metadata: Metadata = {
  title: "النتائج — نتائج المباريات المكتملة",
  description: "تصفّح أحدث نتائج المباريات المكتملة من مصادر البيانات المتاحة، مع مصدر واضح وحالات فارغة صريحة.",
  alternates: { canonical: "/results" },
};

export const revalidate = 120;

type DayFilter = "today" | "yesterday" | "week" | "all";
const DAY_FILTERS: { value: DayFilter; label: string }[] = [
  { value: "today", label: "اليوم" },
  { value: "yesterday", label: "أمس" },
  { value: "week", label: "آخر 7 أيام" },
  { value: "all", label: "كل المتاح" },
];

function matchesDay(iso: string, filter: DayFilter, now: number) {
  const offset = Math.round((siteDay(iso) - siteDay(now)) / 86_400_000);
  if (filter === "today") return offset === 0;
  if (filter === "yesterday") return offset === -1;
  if (filter === "week") return offset >= -6 && offset <= 0;
  return true;
}

function groupByDay(fixtures: NormalizedFixture[]) {
  const groups = new Map<number, NormalizedFixture[]>();
  for (const fixture of fixtures) {
    const key = siteDay(fixture.scheduledAt);
    const list = groups.get(key) ?? [];
    list.push(fixture);
    groups.set(key, list);
  }
  return [...groups.entries()].sort(([a], [b]) => b - a).map(([key, list]) => ({
    key,
    list: list.sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt)),
  }));
}

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requestedDay = typeof params.day === "string" ? params.day : "week";
  const dayFilter: DayFilter = DAY_FILTERS.some((filter) => filter.value === requestedDay) ? requestedDay as DayFilter : "week";
  const now = Date.now();
  const real = await sdlFixtures({ sport: "football" });
  const realData = real.ok && real.source === "provider" ? real : null;
  const finished = realData
    ? realData.data
        .filter((fixture) => fixture.status === "finished" && hasMatchIdentity(fixture) && matchesDay(fixture.scheduledAt, dayFilter, now))
        .sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt))
        .slice(0, 60)
    : [];

  if (realData) {
    const groups = groupByDay(finished);
    return (
      <div className="mx-auto max-w-[1280px] space-y-6 px-4 py-6">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
          <div>
            <p className="eyebrow mb-1">كرة القدم · بيانات المصدر</p>
            <h1 className="text-2xl font-extrabold tracking-tight">النتائج</h1>
          </div>
          <p className="text-[12px] text-muted"><span className="num font-bold">{finished.length}</span> نتيجة مكتملة في النطاق المحدد</p>
        </header>
        <FilterLinks active={dayFilter} />
        {groups.length ? (
          <div className="space-y-8">
            {groups.map(({ key, list }) => (
              <section key={key}>
                <SectionHead eyebrow={dateAr(list[0].scheduledAt)} title={`${dayLabel(list[0].scheduledAt)} · ${list.length} نتيجة`} />
                <ProviderMatchList fixtures={list} />
              </section>
            ))}
          </div>
        ) : (
          <DataUnavailable title="لا توجد نتائج مكتملة لهذا النطاق" message="لم يتضمن آخر تحديث من المصدر مباريات مكتملة ضمن الفترة المختارة." actionHref="/matches?date=today" actionLabel="مباريات اليوم" />
        )}
        <DataSourceNote className="border-t border-line pt-4" provider={realData.provider} fromCache={realData.fromCache} stale={realData.stale} fetchedAt={realData.fetchedAt} />
      </div>
    );
  }

  const showDemo = demoContentVisible();
  const demoResults = showDemo ? [...finishedToday, ...finishedYesterday].filter((match) => matchesDay(match.kickoff, dayFilter, now)) : [];
  const demoGroups = [
    { key: "today", title: "نتائج اليوم", list: demoResults.filter((match) => siteDay(match.kickoff) === siteDay(now)) },
    { key: "yesterday", title: "نتائج أمس", list: demoResults.filter((match) => siteDay(match.kickoff) === siteDay(now) - 86_400_000) },
  ].filter((group) => group.list.length > 0);

  return (
    <div className="mx-auto max-w-[1280px] space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div><p className="eyebrow mb-1">{showDemo ? "معاينة التطوير" : "مصادر البيانات"}</p><h1 className="text-2xl font-extrabold tracking-tight">النتائج</h1></div>
        {showDemo ? <p className="text-[12px] text-muted">البيانات التجريبية ليست نتائج حقيقية.</p> : null}
      </header>
      <FilterLinks active={dayFilter} />
      {demoGroups.length ? demoGroups.map((group) => (
        <section key={group.key}>
          <SectionHead eyebrow={dateAr(group.list[0].kickoff)} title={group.title} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{group.list.map((match) => <MatchCard key={match.id} match={match} />)}</div>
        </section>
      )) : (
        <DataUnavailable title="لا توجد نتائج مؤكدة حاليًا" message={showDemo ? "لا توجد نتائج ضمن بيانات المعاينة." : "لم تصل نتائج قابلة للتحقق من مصدر البيانات؛ لا نعرض نتائج تقديرية."} actionHref="/matches" actionLabel="تصفّح المباريات" />
      )}
      {showDemo ? <p className="rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[11px] font-semibold text-muted">بيانات معاينة للتطوير فقط — لا تمثل نتائج فعلية.</p> : null}
    </div>
  );
}

function FilterLinks({ active }: { active: DayFilter }) {
  return (
    <nav aria-label="تصفية النتائج حسب التاريخ" className="flex flex-wrap gap-2">
      {DAY_FILTERS.map((filter) => (
        <Link key={filter.value} href={filter.value === "week" ? "/results" : `/results?day=${filter.value}`} aria-current={active === filter.value ? "page" : undefined}
          className={`inline-flex min-h-11 items-center rounded-[3px] px-3 py-1.5 text-[12px] font-bold transition focus-ring ${active === filter.value ? "bg-navy-850 text-white" : "border border-line bg-surface text-muted hover:border-gold-500"}`}>
          {filter.label}
        </Link>
      ))}
      <Link href="/matches?date=today&status=finished" className="inline-flex min-h-11 items-center rounded-[3px] border border-line bg-surface px-3 py-1.5 text-[12px] font-bold text-muted transition hover:border-gold-500 focus-ring">مباريات اليوم</Link>
    </nav>
  );
}
