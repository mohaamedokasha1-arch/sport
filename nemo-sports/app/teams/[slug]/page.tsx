import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Tabs from "@/components/ui/Tabs";
import Crest from "@/components/ui/Crest";
import MatchCard from "@/components/match/MatchCard";
import NewsCard from "@/components/news/NewsCard";
import StandingsTable from "@/components/competition/StandingsTable";
import { articles, standings, teamMatches } from "@/lib/data";
import {
  competitionBySlug,
  playersByTeam,
  sportBySlug,
  teamBySlug,
  teams,
} from "@/lib/core-data";
import { age, number } from "@/lib/format";

export function generateStaticParams() {
  return teams.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const t = teamBySlug(slug);
  if (!t) return { title: "الفريق غير موجود" };
  const comp = competitionBySlug(t.competition);
  return {
    title: `${t.name} | ${comp?.name ?? sportBySlug(t.sport)?.name}`,
    description: `كل ما يخص ${t.name}: اللاعبون، المباريات القادمة، النتائج، الترتيب والإحصائيات.`,
    alternates: { canonical: `/teams/${t.slug}` },
  };
}

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const team = teamBySlug(slug);
  if (!team) notFound();

  const comp = competitionBySlug(team.competition);
  const sport = sportBySlug(team.sport);
  const matches = teamMatches(team.slug);
  const squad = playersByTeam(team.slug);
  const news = articles.filter((a) => a.teams?.includes(team.slug)).slice(0, 6);

  const played = matches.filter((m) => m.status === "FINISHED");
  const upcoming = matches.filter((m) => m.status === "UPCOMING");
  const live = matches.filter((m) => m.status === "LIVE");

  const record = played.reduce(
    (acc, m) => {
      const isHome = m.home === team.slug;
      const gf = isHome ? m.homeScore : m.awayScore;
      const ga = isHome ? m.awayScore : m.homeScore;
      acc.gf += gf;
      acc.ga += ga;
      if (gf > ga) acc.w += 1;
      else if (gf === ga) acc.d += 1;
      else acc.l += 1;
      return acc;
    },
    { w: 0, d: 0, l: 0, gf: 0, ga: 0 },
  );

  const table = standings[team.competition];
  const teamRow = table?.find((r) => r.team === team.slug);

  const groupOrder = ["حراسة المرمى", "الدفاع", "الوسط", "الهجوم", "أساسي", "فردي"];
  const grouped = groupOrder
    .map((g) => ({ title: g, list: squad.filter((p) => p.positionGroup === g) }))
    .filter((g) => g.list.length > 0);

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <nav aria-label="مسار التنقل" className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">الرئيسية</Link>
        <span aria-hidden>/</span>
        <Link href="/teams" className="hover:text-gold-600 dark:hover:text-gold-400">الفرق</Link>
        <span aria-hidden>/</span>
        <span className="font-semibold text-ink">{team.name}</span>
      </nav>

      <header
        className="stripes mb-6 overflow-hidden rounded-[8px] border border-navy-700 text-white"
        style={{ backgroundImage: `linear-gradient(120deg, ${team.primary} 0%, #0F1B2E 65%)` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-6">
          <div className="flex items-center gap-4">
            <Crest slug={team.slug} size={76} />
            <div>
              <p className="eyebrow !text-white/50">{sport?.nameEn}</p>
              <h1 className="text-2xl font-extrabold tracking-tight">{team.name}</h1>
              <p className="mt-1 text-[12px] text-white/70">
                {team.country} · {comp?.name} · تأسس <span className="num">{team.founded}</span>
              </p>
            </div>
          </div>

          <dl className="flex flex-wrap gap-6 text-center">
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">لعب</dt>
              <dd className="num text-xl font-extrabold">{record.w + record.d + record.l}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">ف/ت/خ</dt>
              <dd className="num text-xl font-extrabold text-gold-400">
                {record.w}/{record.d}/{record.l}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">الأهداف</dt>
              <dd className="num text-xl font-extrabold">
                {record.gf}–{record.ga}
              </dd>
            </div>
            {teamRow ? (
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-white/45">المركز</dt>
                <dd className="num text-xl font-extrabold text-gold-400">{teamRow.pos}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-2 border-t border-white/10 px-5 py-3 text-[11px] text-white/70">
          <span>🏟 {team.stadium ?? "—"}</span>
          {team.capacity ? <span className="num">السعة: {number(team.capacity)}</span> : null}
          <span>👔 المدرب: {team.coach ?? "—"}</span>
          <span>© القائد: {team.captain ?? "—"}</span>
        </div>
      </header>

      <Tabs
        items={[
          {
            id: "overview",
            label: "نظرة عامة",
            content: (
              <div className="space-y-6">
                {live.length > 0 ? <Group title="مباشر الآن" list={live} /> : null}
                <Group title="المباريات القادمة" list={upcoming} />
                <Group title="آخر النتائج" list={played} />
                {matches.length === 0 ? (
                  <p className="card px-4 py-10 text-center text-[13px] text-muted">لا توجد مباريات مسجّلة لهذا الفريق.</p>
                ) : null}
              </div>
            ),
          },
          {
            id: "squad",
            label: "اللاعبون",
            content:
              grouped.length > 0 ? (
                <div className="space-y-5">
                  {grouped.map((g) => (
                    <section key={g.title}>
                      <h2 className="eyebrow mb-2">{g.title}</h2>
                      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {g.list.map((p) => (
                          <li key={p.slug}>
                            <Link
                              href={`/players/${p.slug}`}
                              className="card flex items-center gap-3 p-3 transition hover:border-gold-500/50"
                            >
                              <span className="num grid h-9 w-9 shrink-0 place-items-center rounded-[3px] bg-navy-850 text-[13px] font-extrabold text-gold-400">
                                {p.number ?? "—"}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-[13px] font-bold">{p.name}</span>
                                <span className="block truncate text-[11px] text-muted">
                                  {p.position} · {p.flag} {p.nationality} · {age(p.birth)} سنة
                                </span>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : (
                <p className="card px-4 py-10 text-center text-[13px] text-muted">
                  لا تتوفر قائمة لاعبين لهذا المشارك في النسخة التجريبية.
                </p>
              ),
          },
          {
            id: "matches",
            label: "المباريات والنتائج",
            content: <Group title="كل مباريات الموسم" list={matches} />,
          },
          {
            id: "table",
            label: "الترتيب",
            disabled: !table,
            content: table ? (
              <div className="space-y-3">
                <StandingsTable rows={table} />
                {teamRow ? (
                  <p className="text-[12px] text-muted">
                    يحتل {team.name} المركز <span className="num font-bold text-ink">{teamRow.pos}</span> برصيد{" "}
                    <span className="num font-bold text-ink">{teamRow.points}</span> نقطة في {comp?.name}.
                  </p>
                ) : null}
              </div>
            ) : null,
          },
          {
            id: "news",
            label: "الأخبار",
            content:
              news.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {news.map((a) => (
                    <NewsCard key={a.slug} article={a} />
                  ))}
                </div>
              ) : (
                <p className="card px-4 py-10 text-center text-[13px] text-muted">لا توجد أخبار مرتبطة بهذا الفريق.</p>
              ),
          },
        ]}
      />
    </div>
  );
}

function Group({ title, list }: { title: string; list: ReturnType<typeof teamMatches> }) {
  if (list.length === 0) return null;
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
