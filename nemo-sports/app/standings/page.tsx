import type { Metadata } from "next";
import Link from "next/link";
import Crest from "@/components/ui/Crest";
import StandingsTable from "@/components/competition/StandingsTable";
import SectionHead from "@/components/ui/SectionHead";
import { standings, topScorers } from "@/lib/data";
import { competitionBySlug, playerBySlug, teamBySlug } from "@/lib/core-data";

export const metadata: Metadata = {
  title: "الترتيب والإحصائيات — جداول الدوري والهدافون",
  description: "جداول ترتيب البطولات وقوائم الهدافين وأبرز الإحصائيات.",
  alternates: { canonical: "/standings" },
};

export default function StandingsPage() {
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">Standings &amp; Stats</p>
          <h1 className="text-2xl font-extrabold tracking-tight">الترتيب والإحصائيات</h1>
        </div>
        <Link href="/competitions" className="text-[12px] font-bold text-navy-850 hover:text-gold-600 dark:text-gold-400">
          كل البطولات ←
        </Link>
      </header>

      <div className="space-y-10">
        {Object.entries(standings).map(([comp, rows]) => {
          const c = competitionBySlug(comp);
          const scorers = topScorers[comp];
          return (
            <section key={comp}>
              <SectionHead eyebrow={`${c?.country} · ${c?.season}`} title={c?.name ?? comp} href={`/competitions/${comp}`} />
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <StandingsTable rows={rows} />

                {scorers ? (
                  <div className="card overflow-hidden">
                    <header className="border-b border-line bg-navy-850 px-3 py-2.5 text-white">
                      <h3 className="text-[13px] font-extrabold">الهدافون</h3>
                    </header>
                    <ol className="divide-y divide-line">
                      {scorers.map((s) => {
                        const player = playerBySlug(s.player);
                        const team = teamBySlug(s.team);
                        return (
                          <li key={s.player} className="flex items-center gap-3 px-3 py-2.5">
                            <span className="num w-4 shrink-0 text-[12px] font-extrabold text-gold-600 dark:text-gold-400">
                              {s.pos}
                            </span>
                            {team ? <Crest slug={team.slug} size={24} /> : null}
                            <span className="min-w-0 flex-1">
                              <Link
                                href={`/players/${s.player}`}
                                className="block truncate text-[12px] font-bold transition hover:text-gold-600 dark:hover:text-gold-400"
                              >
                                {player?.name ?? s.player}
                              </Link>
                              <span className="num block text-[10px] text-muted">
                                {team?.short} · {s.apps} مباراة · {s.penalties} من ركلات جزاء
                              </span>
                            </span>
                            <span className="num shrink-0 text-[15px] font-extrabold">{s.goals}</span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
