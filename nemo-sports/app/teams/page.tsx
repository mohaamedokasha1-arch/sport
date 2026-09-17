import type { Metadata } from "next";
import DataUnavailable from "@/components/ui/DataUnavailable";
import Link from "next/link";
import Crest from "@/components/ui/Crest";
import SectionHead from "@/components/ui/SectionHead";
import { competitions, sports, teams } from "@/lib/core-data";

export const metadata: Metadata = {
  title: "الفرق — دليل الفرق حسب الرياضة",
  description: "دليل شامل للفرق: المعلومات، اللاعبون، المباريات والإحصائيات.",
  alternates: { canonical: "/teams" },
};

export default function TeamsPage() {
  const bySport = teams.reduce<Record<string, typeof teams>>((acc, t) => {
    (acc[t.sport] ||= []).push(t);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">Teams</p>
          <h1 className="text-2xl font-extrabold tracking-tight">الفرق</h1>
        </div>
        <p className="text-[12px] text-muted">
          <span className="num font-bold">{teams.length}</span> فريق ومشارك في قاعدة البيانات
        </p>
      </header>

      {teams.length === 0 ? (
        <DataUnavailable
          title="دليل الفرق غير متوفر حاليًا"
          message="صفحات الفرق تُبنى من بيانات رسمية (الفرق، اللاعبون، المباريات). لن ننشئ صفحات لفرق ببيانات غير مؤكدة."
        />
      ) : null}

      <div className="space-y-9">
        {sports.map((s) =>
          bySport[s.slug]?.length ? (
            <section key={s.slug}>
              <SectionHead eyebrow={s.nameEn} title={`${s.icon} ${s.name}`} href={`/matches?sport=${s.slug}`} linkLabel="المباريات" />
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {bySport[s.slug].map((t) => {
                  const comp = competitions.find((c) => c.slug === t.competition);
                  return (
                    <li key={t.slug}>
                      <Link
                        href={`/teams/${t.slug}`}
                        className="card flex items-center gap-3 p-3 transition hover:-translate-y-0.5 hover:border-gold-500/50"
                      >
                        <Crest slug={t.slug} size={42} />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-bold">{t.name}</span>
                          <span className="block truncate text-[11px] text-muted">{comp?.name ?? t.country}</span>
                          <span className="mt-1 flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: t.primary }} aria-hidden />
                            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: t.secondary }} aria-hidden />
                            <span className="num text-[10px] text-muted">تأسس {t.founded}</span>
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null,
        )}
      </div>
    </div>
  );
}
