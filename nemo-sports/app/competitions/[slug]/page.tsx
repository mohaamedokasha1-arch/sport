import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Tabs from "@/components/ui/Tabs";
import MatchCard from "@/components/match/MatchCard";
import StandingsTable from "@/components/competition/StandingsTable";
import NewsCard from "@/components/news/NewsCard";
import Crest from "@/components/ui/Crest";
import {
  articles,
  competitionMatches,
  competitions,
  standings,
  topScorers,
} from "@/lib/data";
import { playerBySlug, sportBySlug, teamBySlug, teamsByCompetition } from "@/lib/core-data";

export function generateStaticParams() {
  return competitions.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const c = competitions.find((x) => x.slug === slug);
  if (!c) return { title: "البطولة غير موجودة" };
  return {
    title: `${c.name} | الترتيب والنتائج ${c.season}`,
    description: `ترتيب ${c.name}، المباريات، النتائج، الهدافون وإحصائيات الفرق لموسم ${c.season}.`,
    alternates: { canonical: `/competitions/${c.slug}` },
  };
}

export default async function CompetitionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comp = competitions.find((c) => c.slug === slug);
  if (!comp) notFound();

  const sport = sportBySlug(comp.sport);
  const table = standings[comp.slug];
  const scorers = topScorers[comp.slug];
  const matches = competitionMatches(comp.slug);
  const teams = teamsByCompetition(comp.slug);

  const live = matches.filter((m) => m.status === "LIVE");
  const upcoming = matches.filter((m) => m.status === "UPCOMING");
  const finished = matches.filter((m) => m.status === "FINISHED");
  const news = articles.filter((a) => a.competition === comp.slug || a.sport === comp.sport).slice(0, 6);

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <nav aria-label="مسار التنقل" className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">الرئيسية</Link>
        <span aria-hidden>/</span>
        <Link href="/competitions" className="hover:text-gold-600 dark:hover:text-gold-400">البطولات</Link>
        <span aria-hidden>/</span>
        <span className="font-semibold text-ink">{comp.name}</span>
      </nav>

      <header className="stripes mb-6 overflow-hidden rounded-[8px] border border-navy-700 bg-navy-850 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-6">
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[4px] bg-gold-500 font-display text-lg font-extrabold tracking-wider text-navy-900">
              {comp.code}
            </span>
            <div>
              <p className="eyebrow !text-white/50">{sport?.nameEn}</p>
              <h1 className="text-2xl font-extrabold tracking-tight">{comp.name}</h1>
              <p className="mt-1 text-[12px] text-white/60">
                {comp.country} · موسم {comp.season} · {comp.format} · {comp.rounds} جولة
              </p>
            </div>
          </div>
          <dl className="flex flex-wrap gap-6 text-center">
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">الفرق</dt>
              <dd className="num text-xl font-extrabold text-gold-400">{comp.teamsCount}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">مباشر</dt>
              <dd className="num text-xl font-extrabold text-live">{live.length}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">قادمة</dt>
              <dd className="num text-xl font-extrabold">{upcoming.length}</dd>
            </div>
          </dl>
        </div>
      </header>

      <Tabs
        items={[
          {
            id: "standings",
            label: "الترتيب",
            disabled: !table,
            content: table ? (
              <StandingsTable rows={table} />
            ) : (
              <p className="card px-4 py-10 text-center text-[13px] text-muted">
                لا يتوفر جدول ترتيب لهذه البطولة (مسابقة فردية أو متعددة المراحل).
              </p>
            ),
          },
          {
            id: "matches",
            label: "المباريات والنتائج",
            content: (
              <div className="space-y-6">
                {live.length > 0 ? (
                  <Group title="مباشر الآن" list={live} />
                ) : null}
                {upcoming.length > 0 ? <Group title="القادمة" list={upcoming} /> : null}
                {finished.length > 0 ? <Group title="النتائج" list={finished} /> : null}
                {matches.length === 0 ? (
                  <p className="card px-4 py-10 text-center text-[13px] text-muted">
                    لا توجد مباريات مسجّلة لهذه البطولة في النسخة التجريبية.
                  </p>
                ) : null}
              </div>
            ),
          },
          {
            id: "scorers",
            label: "الهدافون",
            disabled: !scorers,
            content: scorers ? (
              <div className="card overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-line bg-navy-850/[0.04] text-muted dark:bg-white/[0.04]">
                      <th className="px-3 py-2.5 text-start font-semibold">#</th>
                      <th className="px-3 py-2.5 text-start font-semibold">اللاعب</th>
                      <th className="px-3 py-2.5 text-start font-semibold">الفريق</th>
                      <th className="num px-3 py-2.5 font-semibold">مباريات</th>
                      <th className="num px-3 py-2.5 font-semibold">جزائيات</th>
                      <th className="num px-3 py-2.5 font-semibold">أهداف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scorers.map((s) => {
                      const p = playerBySlug(s.player);
                      const t = teamBySlug(s.team);
                      return (
                        <tr key={s.player} className="border-b border-line last:border-0 hover:bg-navy-850/[0.03] dark:hover:bg-white/[0.04]">
                          <td className="num px-3 py-2.5 font-extrabold text-gold-600 dark:text-gold-400">{s.pos}</td>
                          <td className="px-3 py-2.5">
                            <Link href={`/players/${s.player}`} className="font-bold transition hover:text-gold-600 dark:hover:text-gold-400">
                              {p?.name ?? s.player}
                            </Link>
                          </td>
                          <td className="px-3 py-2.5">
                            {t ? (
                              <Link href={`/teams/${t.slug}`} className="flex items-center gap-2 transition hover:text-gold-600 dark:hover:text-gold-400">
                                <Crest slug={t.slug} size={20} />
                                {t.name}
                              </Link>
                            ) : (
                              s.team
                            )}
                          </td>
                          <td className="num px-3 py-2.5 text-center">{s.apps}</td>
                          <td className="num px-3 py-2.5 text-center">{s.penalties}</td>
                          <td className="num px-3 py-2.5 text-center text-[14px] font-extrabold">{s.goals}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null,
          },
          {
            id: "teams",
            label: "الفرق المشاركة",
            content:
              teams.length > 0 ? (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {teams.map((t) => (
                    <li key={t.slug}>
                      <Link
                        href={`/teams/${t.slug}`}
                        className="card flex items-center gap-3 p-3 transition hover:border-gold-500/50"
                      >
                        <Crest slug={t.slug} size={38} />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-bold">{t.name}</span>
                          <span className="block text-[11px] text-muted">
                            {t.stadium ?? t.country}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="card px-4 py-10 text-center text-[13px] text-muted">
                  المشاركون في هذه البطولة أفراد وليسوا فرقًا.
                </p>
              ),
          },
          {
            id: "news",
            label: "أخبار البطولة",
            content:
              news.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {news.map((a) => (
                    <NewsCard key={a.slug} article={a} />
                  ))}
                </div>
              ) : (
                <p className="card px-4 py-10 text-center text-[13px] text-muted">لا توجد أخبار مرتبطة.</p>
              ),
          },
        ]}
      />
    </div>
  );
}

function Group({ title, list }: { title: string; list: Parameters<typeof MatchCard>[0]["match"][] }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-[13px] font-extrabold">
        <span className="h-4 w-1 rounded-full bg-gold-500" aria-hidden />
        {title}
        <span className="num rounded-[3px] bg-navy-850/5 px-1.5 py-0.5 text-[10px] dark:bg-white/10">{list.length}</span>
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((m) => (
          <MatchCard key={m.id} match={m} />
        ))}
      </div>
    </section>
  );
}
