import type { Metadata } from "next";
import DataUnavailable from "@/components/ui/DataUnavailable";
import Link from "next/link";
import SectionHead from "@/components/ui/SectionHead";
import { players, teamBySlug } from "@/lib/core-data";
import { age } from "@/lib/format";

export const metadata: Metadata = {
  title: "اللاعبون — دليل اللاعبين والإحصائيات",
  description: "دليل اللاعبين: المراكز، الأرقام، الإحصائيات وأخبار الانتقالات.",
  alternates: { canonical: "/players" },
};

export default function PlayersPage() {
  const byGroup = players.reduce<Record<string, typeof players>>((acc, p) => {
    (acc[p.positionGroup] ||= []).push(p);
    return acc;
  }, {});

  const order = ["الهجوم", "الوسط", "الدفاع", "حراسة المرمى", "أساسي", "فردي"];

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">Players</p>
          <h1 className="text-2xl font-extrabold tracking-tight">اللاعبون</h1>
        </div>
        <p className="text-[12px] text-muted">
          <span className="num font-bold">{players.length}</span> لاعبًا في قاعدة البيانات ·{" "}
          <Link href="/search" className="font-bold text-gold-600 dark:text-gold-400">ابحث عن لاعب</Link>
        </p>
      </header>

      {players.length === 0 ? (
        <DataUnavailable
          title="دليل اللاعبين غير متوفر حاليًا"
          message="صفحات اللاعبين تُبنى من إحصائيات رسمية مؤكدة فقط — لا إحصائيات وهمية."
        />
      ) : null}

      <div className="space-y-9">
        {order.map((g) =>
          byGroup[g]?.length ? (
            <section key={g}>
              <SectionHead eyebrow={g} title={g} accent />
              <div className="card overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-line bg-navy-850/[0.04] text-muted dark:bg-white/[0.04]">
                      <th className="px-3 py-2.5 text-start font-semibold">اللاعب</th>
                      <th className="px-3 py-2.5 text-start font-semibold">الفريق</th>
                      <th className="px-3 py-2.5 text-start font-semibold">المركز</th>
                      <th className="num px-3 py-2.5 font-semibold">العمر</th>
                      <th className="num px-3 py-2.5 font-semibold">مباريات</th>
                      <th className="num px-3 py-2.5 font-semibold">أهداف</th>
                      <th className="num px-3 py-2.5 font-semibold">صناعة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byGroup[g].map((p) => {
                      const t = teamBySlug(p.team);
                      return (
                        <tr key={p.slug} className="border-b border-line last:border-0 transition hover:bg-navy-850/[0.03] dark:hover:bg-white/[0.04]">
                          <td className="px-3 py-2.5">
                            <Link href={`/players/${p.slug}`} className="flex items-center gap-2 font-bold transition hover:text-gold-600 dark:hover:text-gold-400">
                              <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-[3px] bg-navy-850 text-[10px] font-extrabold text-gold-400">
                                {p.number ?? "—"}
                              </span>
                              {p.flag} {p.name}
                            </Link>
                          </td>
                          <td className="px-3 py-2.5">
                            {t ? (
                              <Link href={`/teams/${t.slug}`} className="transition hover:text-gold-600 dark:hover:text-gold-400">
                                {t.short}
                              </Link>
                            ) : (
                              p.team
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-muted">{p.position}</td>
                          <td className="num px-3 py-2.5 text-center">{age(p.birth)}</td>
                          <td className="num px-3 py-2.5 text-center">{p.seasonApps}</td>
                          <td className="num px-3 py-2.5 text-center font-extrabold">{p.seasonGoals}</td>
                          <td className="num px-3 py-2.5 text-center">{p.seasonAssists}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null,
        )}
      </div>
    </div>
  );
}
