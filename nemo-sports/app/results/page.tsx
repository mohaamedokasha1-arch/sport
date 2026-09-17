import type { Metadata } from "next";
import DataUnavailable from "@/components/ui/DataUnavailable";
import Link from "next/link";
import MatchCard from "@/components/match/MatchCard";
import SectionHead from "@/components/ui/SectionHead";
import ProviderMatchList from "@/components/data/ProviderMatchList";
import { finishedToday, finishedYesterday } from "@/lib/data";
import { competitionBySlug } from "@/lib/core-data";
import { dateAr } from "@/lib/format";
import { fixtures as sdlFixtures } from "@/lib/sdl-gateway";
import { demoContentVisible } from "@/lib/site";

export const metadata: Metadata = {
  title: "النتائج — نتائج مباريات أمس واليوم",
  description: "أرشيف النتائج: كل المباريات المنتهية مع الإحصائيات والأحداث.",
  alternates: { canonical: "/results" },
};

export const revalidate = 120;

export default async function ResultsPage() {
  // ── real finished matches from the live feed (SportScore via SDL) ──
  const real = await sdlFixtures({ sport: "football" });
  const realFinished = real.ok
    ? real.data
        .filter((f) => f.status === "finished")
        .sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt))
        .slice(0, 30)
    : [];
  if (real.ok && realFinished.length > 0) {
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
          <div>
            <p className="eyebrow mb-1">Results</p>
            <h1 className="text-2xl font-extrabold tracking-tight">النتائج</h1>
          </div>
          <p className="text-[12px] text-muted">
            <span className="num font-bold">{realFinished.length}</span> نتيجة من المصدر الحي · اضغط أي مباراة للأحداث الكاملة
          </p>
        </header>
        <ProviderMatchList fixtures={realFinished} />
        <p className="mt-6 text-[11px] text-muted">المصدر: {real.provider} · آخر جلب {new Date(real.fetchedAt).toLocaleTimeString("ar-EG")}</p>
      </div>
    );
  }

  const showDemo = demoContentVisible();
  const groups = [
    { title: "نتائج اليوم", date: finishedToday[0]?.kickoff ?? new Date().toISOString(), list: finishedToday },
    { title: "نتائج أمس", date: finishedYesterday[0]?.kickoff ?? new Date().toISOString(), list: finishedYesterday },
  ].filter(() => showDemo);

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">Results</p>
          <h1 className="text-2xl font-extrabold tracking-tight">النتائج</h1>
        </div>
        <p className="text-[12px] text-muted">
          اضغط أي مباراة لعرض الأحداث والإحصائيات الكاملة
        </p>
      </header>

      {groups.length === 0 ? (
        <DataUnavailable
          title="لا توجد نتائج مؤكدة حاليًا"
          message="لا نعرض أي نتيجة غير مؤكدة من مصدر رسمي. ستعود النتائج للظهور فور توفر بيانات حقيقية عبر طبقة البيانات."
        />
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        {[
          { href: "/results", label: "اليوم" },
          { href: "/results?day=yesterday", label: "أمس" },
          { href: "/matches?date=today", label: "مباريات اليوم" },
          { href: "/standings", label: "الترتيب" },
        ].map((l, i) => (
          <Link
            key={l.href + l.label}
            href={l.href}
            className={`rounded-[3px] px-3 py-1.5 text-[12px] font-bold transition ${
              i === 0 ? "bg-navy-850 text-white" : "border border-line bg-surface text-muted hover:border-gold-500"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </div>

      <div className="space-y-9">
        {groups.map((g) => {
          const byComp = g.list.reduce<Record<string, typeof g.list>>((acc, m) => {
            (acc[m.competition] ||= []).push(m);
            return acc;
          }, {});
          return (
            <section key={g.title}>
              <SectionHead eyebrow={dateAr(g.date)} title={g.title} />
              <div className="space-y-5">
                {Object.entries(byComp).map(([comp, list]) => (
                  <div key={comp}>
                    <h3 className="mb-2 flex items-center gap-2 text-[12px] font-bold text-muted">
                      <span className="h-px w-6 bg-line" aria-hidden />
                      {competitionBySlug(comp)?.name}
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {list.map((m) => (
                        <MatchCard key={m.id} match={m} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
