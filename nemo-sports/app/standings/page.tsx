import type { Metadata } from "next";
import Link from "next/link";
import SectionHead from "@/components/ui/SectionHead";
import DataUnavailable from "@/components/ui/DataUnavailable";
import PoweredBy from "@/components/ui/PoweredBy";
import { standings as sdlStandings, topScorers as sdlTopScorers } from "@/lib/sdl-gateway";
import { demoContentVisible } from "@/lib/site";
import { standings as demoStandings, topScorers as demoTopScorers } from "@/lib/data";
import { competitionBySlug, playerBySlug, teamBySlug } from "@/lib/core-data";
import StandingsTable from "@/components/competition/StandingsTable";

export const metadata: Metadata = {
  title: "الترتيب والإحصائيات — جداول الدوري والهدافون",
  description: "جداول ترتيب البطولات وقوائم الهدافين من مصدر بيانات حي، مع أبرز الإحصائيات.",
  alternates: { canonical: "/standings" },
};

export const revalidate = 300;

/**
 * Competitions surfaced from SportScore (provider competition slugs).
 * A competition that errors (e.g. "No current season") renders an honest
 * per-competition notice — never a mock table.
 */
const LIVE_COMPETITIONS: { sport: string; slug: string; name: string }[] = [
  { sport: "football", slug: "uefa-champions-league", name: "دوري أبطال أوروبا" },
  { sport: "football", slug: "la-liga", name: "الدوري الإسباني" },
  { sport: "football", slug: "serie-a", name: "الدوري الإيطالي" },
  { sport: "football", slug: "bundesliga", name: "الدوري الألماني" },
  { sport: "football", slug: "ligue-1", name: "الدوري الفرنسي" },
  { sport: "football", slug: "premier-league", name: "الدوري الإنجليزي الممتاز" },
];

export default async function StandingsPage() {
  const results = await Promise.all(
    LIVE_COMPETITIONS.map(async (c) => {
      const [table, scorers] = await Promise.all([sdlStandings(c.sport, c.slug), sdlTopScorers(c.sport, c.slug)]);
      return { ...c, table: table.ok ? table.data : null, tableError: table.ok ? null : table.error.message, scorers: scorers.ok ? scorers.data : null };
    }),
  );

  const okCompetitions = results.filter((r) => r.table && r.table.length > 0);

  /* ── real data → render it ── */
  if (okCompetitions.length > 0) {
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
          <div>
            <p className="eyebrow mb-1">Standings &amp; Stats</p>
            <h1 className="text-2xl font-extrabold tracking-tight">الترتيب والإحصائيات</h1>
          </div>
          <p className="text-[12px] text-muted">
            <span className="num font-bold">{okCompetitions.length}</span> بطولة بجداول حية من المصدر
          </p>
        </header>

        <div className="space-y-10">
          {results.map((r) => (
            <section key={r.slug}>
              <SectionHead
                eyebrow="بيانات حية"
                title={r.name}
                href={`/matches`}
                linkLabel="مباريات البطولة"
              />
              {r.table && r.table.length > 0 ? (
                <ProviderTable rows={r.table} />
              ) : (
                <p className="card px-4 py-4 text-[12px] text-muted">
                  جدول {r.name} غير متاح من المصدر حاليًا{r.tableError ? ` (${r.tableError})` : ""} — لن نعرض جدولًا تجريبيًا بديلًا.
                </p>
              )}

              {r.scorers && r.scorers.length > 0 ? (
                <div className="mt-4 card overflow-hidden">
                  <header className="border-b border-line bg-navy-850 px-3 py-2.5 text-white dark:bg-navy-850">
                    <h3 className="text-[13px] font-extrabold">الهدافون — {r.name}</h3>
                  </header>
                  <ol className="divide-y divide-line">
                    {r.scorers.slice(0, 8).map((s) => (
                      <li key={s.playerProviderId} className="flex items-center gap-3 px-3 py-2.5">
                        <span className="num w-4 shrink-0 text-[12px] font-extrabold text-gold-600 dark:text-gold-400">
                          {s.goals}
                        </span>
                        <Link
                          href={`/players/${s.playerProviderId}`}
                          className="min-w-0 flex-1 truncate text-[12.5px] font-bold hover:text-gold-600 dark:hover:text-gold-400"
                        >
                          {s.playerProviderId.replaceAll("-", " ")}
                        </Link>
                        <span className="shrink-0 text-[11px] text-muted">
                          {s.teamProviderId ? s.teamProviderId.replaceAll("-", " ") : ""} · {s.appearances ?? "—"} مباراة
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </section>
          ))}

          <div className="flex items-center justify-between border-t border-line pt-4 text-[11px] text-muted">
            <span>الجداول تُجلب مباشرة من طبقة البيانات · تُحدَّث تلقائيًا (كاش 5 دقائق)</span>
            <PoweredBy />
          </div>
        </div>
      </div>
    );
  }

  /* ── development/demo fallback ── */
  if (demoContentVisible() && Object.keys(demoStandings).length > 0) {
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
          {Object.entries(demoStandings).map(([comp, rows]) => {
            const c = competitionBySlug(comp);
            const scorers = demoTopScorers[comp];
            return (
              <section key={comp}>
                <SectionHead eyebrow={`${c?.country} · ${c?.season}`} title={c?.name ?? comp} href={`/competitions/${comp}`} />
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <StandingsTable rows={rows} />
                  {scorers ? (
                    <div className="card overflow-hidden">
                      <header className="border-b border-line bg-navy-850 px-3 py-2.5 text-white dark:bg-navy-850">
                        <h3 className="text-[13px] font-extrabold">الهدافون</h3>
                      </header>
                      <ol className="divide-y divide-line">
                        {scorers.map((s) => {
                          const player = playerBySlug(s.player);
                          const team = teamBySlug(s.team);
                          return (
                            <li key={s.player} className="flex items-center gap-3 px-3 py-2.5">
                              <span className="num w-4 shrink-0 text-[12px] font-extrabold text-gold-600 dark:text-gold-400">{s.pos}</span>
                              <div className="min-w-0 flex-1">
                                <Link href={`/players/${s.player}`} className="block truncate text-[12.5px] font-bold hover:text-gold-600 dark:hover:text-gold-400">
                                  {player?.name ?? s.player}
                                </Link>
                                <p className="truncate text-[10.5px] text-muted">{team?.name ?? s.team}</p>
                              </div>
                              <span className="num shrink-0 text-[13px] font-extrabold">{s.goals}</span>
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

  /* ── honest empty state ── */
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">Standings &amp; Stats</p>
          <h1 className="text-2xl font-extrabold tracking-tight">الترتيب والإحصائيات</h1>
        </div>
      </header>
      <DataUnavailable
        title="جداول الترتيب غير متوفرة حاليًا"
        message="تعذر جلب جداول الترتيب من مصدر البيانات الآن. لا نستخدم جداول تجريبية في الإنتاج — ستعود للعمل تلقائيًا عند توفر المصدر."
      />
    </div>
  );
}

/** Real standings table (provider rows) in the NEMO visual language. */
function ProviderTable({ rows }: { rows: { teamProviderId: string; position: number; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number; status: string | null; group: string | null }[] }) {
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const g = r.group ?? "";
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(r);
  }
  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([group, gRows]) => (
        <div key={group || "main"} className="card overflow-x-auto">
          {group ? <p className="border-b border-line px-3 py-2 text-[12px] font-extrabold">{group}</p> : null}
          <table className="w-full min-w-[560px] text-[12px]">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="w-8 px-2 py-2 text-start font-bold">#</th>
                <th className="px-2 py-2 text-start font-bold">الفريق</th>
                <th className="w-10 px-2 py-2 text-center font-bold">لعب</th>
                <th className="w-10 px-2 py-2 text-center font-bold">ف</th>
                <th className="w-10 px-2 py-2 text-center font-bold">ت</th>
                <th className="w-10 px-2 py-2 text-center font-bold">خ</th>
                <th className="w-14 px-2 py-2 text-center font-bold">له/عليه</th>
                <th className="w-12 px-2 py-2 text-center font-bold">نقاط</th>
                <th className="w-24 px-2 py-2 text-center font-bold">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {gRows.map((r) => (
                <tr key={`${r.position}-${r.teamProviderId}`} className="border-b border-line/60 last:border-0">
                  <td className="num px-2 py-2 font-extrabold text-muted">{r.position}</td>
                  <td className="px-2 py-2 font-bold">{r.teamProviderId}</td>
                  <td className="num px-2 py-2 text-center">{r.played}</td>
                  <td className="num px-2 py-2 text-center">{r.won}</td>
                  <td className="num px-2 py-2 text-center">{r.drawn}</td>
                  <td className="num px-2 py-2 text-center">{r.lost}</td>
                  <td className="num px-2 py-2 text-center text-muted">{r.goalsFor}:{r.goalsAgainst}</td>
                  <td className="num px-2 py-2 text-center font-extrabold">{r.points}</td>
                  <td className="px-2 py-2 text-center text-[10.5px] text-muted">{r.status ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
