import type { Metadata } from "next";
import DataUnavailable from "@/components/ui/DataUnavailable";
import MatchCard from "@/components/match/MatchCard";
import SectionHead from "@/components/ui/SectionHead";
import { postponed, upcomingNext, upcomingToday } from "@/lib/data";
import { dateAr, dayLabel } from "@/lib/format";

export const metadata: Metadata = {
  title: "المباريات القادمة — جدول الأسبوع",
  description: "كل المباريات القادمة اليوم وغدًا وخلال الأسبوع، مرتبة حسب اليوم.",
  alternates: { canonical: "/fixtures" },
};

export default function FixturesPage() {
  const now = Date.now();
  const all = [...upcomingToday, ...upcomingNext].filter((m) => +new Date(m.kickoff) > now);

  const byDay = all.reduce<Record<string, typeof all>>((acc, m) => {
    const key = new Date(m.kickoff).toDateString();
    (acc[key] ||= []).push(m);
    return acc;
  }, {});

  const days = Object.entries(byDay).sort((a, b) => +new Date(a[0]) - +new Date(b[0]));

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">Fixtures</p>
          <h1 className="text-2xl font-extrabold tracking-tight">المباريات القادمة</h1>
        </div>
        <p className="text-[12px] text-muted">
          <span className="num font-bold">{all.length}</span> مباراة خلال الأيام القادمة
        </p>
      </header>

      {days.length === 0 ? (
        <DataUnavailable
          title="لا توجد مباريات قادمة مؤكدة"
          message="جدول المباريات يُبنى من بيانات حقيقية فقط. لن نعرض مباريات أو مواعيد غير مؤكدة."
        />
      ) : null}

      <div className="space-y-9">
        {days.map(([day, list]) => (
          <section key={day}>
            <SectionHead
              eyebrow={dateAr(list[0].kickoff)}
              title={`${dayLabel(list[0].kickoff)} · ${list.length} مباراة`}
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list
                .sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff))
                .map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
            </div>
          </section>
        ))}
      </div>

      {postponed.length > 0 ? (
        <section className="mt-10">
          <SectionHead eyebrow="Status" title="مؤجلة وملغاة" accent={false} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {postponed.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
