import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Tabs from "@/components/ui/Tabs";
import Crest from "@/components/ui/Crest";
import NewsCard from "@/components/news/NewsCard";
import { articles, teamMatches } from "@/lib/data";
import { competitionBySlug, playerBySlug, players, teamBySlug } from "@/lib/core-data";
import { age } from "@/lib/format";
import PoweredBy from "@/components/ui/PoweredBy";
import { playerStats as sdlPlayerStats } from "@/lib/sdl-gateway";
import { demoContentVisible } from "@/lib/site";

export const revalidate = 1800;

export function generateStaticParams() {
  // demo players are prerendered for dev/preview only; real provider players
  // (e.g. /players/erling-haaland from SportScore slugs) render on demand.
  return demoContentVisible() ? players.map((p) => ({ slug: p.slug })) : [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  // real provider player first (SportScore slugs, e.g. "erling-haaland")
  const real = await sdlPlayerStats("football", slug);
  if (real.ok) {
    const team = String(real.data.extra.team ?? "");
    return {
      title: `${slug.replaceAll("-", " ")}${team ? ` | ${team}` : ""} | إحصائيات`,
      description: `إحصائيات ${slug.replaceAll("-", " ")} هذا الموسم من مصدر حي: المباريات، الأهداف، الصناعات، الدقائق والبطاقات.`,
      alternates: { canonical: `/players/${slug}` },
    };
  }

  const p = playerBySlug(slug);
  if (!p) return { title: "اللاعب غير موجود" };

  const t = teamBySlug(p.team);
  return {
    title: `${p.name} | ${t?.name ?? p.position} | إحصائيات`,
    description: `إحصائيات ${p.name} هذا الموسم: المباريات، الأهداف، الصناعات، سجل الفرق والأخبار.`,
    alternates: { canonical: `/players/${p.slug}` },
  };
}

export default async function PlayerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  /* ══ 1) real provider player (SportScore) ══ */
  const real = await sdlPlayerStats("football", slug);
  if (!real.ok && real.error.kind !== "not_found") {
    // Transient outage: abort the render so ISR keeps the last good page and
    // outages can never write a permanent 404 into the ISR cache. A typed
    // not_found (player absent from the provider) falls through to the
    // honest 404 below.
    throw new Error(`player_stats_unavailable:${real.error.kind}`);
  }
  if (real.ok) {
    const s = real.data;
    const name = slug.replaceAll("-", " ");
    const statCells: { label: string; value: string }[] = [
      { label: "المباريات", value: s.appearances !== null ? String(s.appearances) : "—" },
      { label: "الأهداف", value: s.goals !== null ? String(s.goals) : "—" },
      { label: "الصناعات", value: s.assists !== null ? String(s.assists) : "—" },
      { label: "الدقائق", value: s.minutes !== null ? String(s.minutes) : "—" },
      { label: "بطاقات صفراء", value: s.yellowCards !== null ? String(s.yellowCards) : "—" },
      { label: "بطاقات حمراء", value: s.redCards !== null ? String(s.redCards) : "—" },
    ];
    const extraEntries = Object.entries(s.extra).filter(([k]) => !["team", "competition"].includes(k));
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <nav aria-label="مسار التنقل" className="mb-4 text-[11px] text-muted">
          <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">الرئيسية</Link>
          <span aria-hidden> / </span>
          <Link href="/standings" className="hover:text-gold-600 dark:hover:text-gold-400">الهدافون</Link>
          <span aria-hidden> / </span>
          <span className="font-semibold text-ink capitalize">{name}</span>
        </nav>

        <header className="card mb-6 flex flex-wrap items-center gap-5 px-5 py-6">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xl font-extrabold text-gold-400" aria-hidden>
            {name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold capitalize">{name}</h1>
            <p className="mt-1 text-[12.5px] text-muted">
              {String(s.extra.team ?? "—")}
              {s.extra.competition ? ` · ${String(s.extra.competition)}` : ""}
            </p>
          </div>
        </header>

        <section aria-label="إحصائيات الموسم">
          <h2 className="mb-3 border-b-2 border-line pb-2 text-[15px] font-extrabold">إحصائيات الموسم</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {statCells.map((c) => (
              <div key={c.label} className="card px-3 py-4 text-center">
                <p className="num text-2xl font-extrabold text-gold-600 dark:text-gold-400">{c.value}</p>
                <p className="mt-1 text-[11px] text-muted">{c.label}</p>
              </div>
            ))}
          </div>
        </section>

        {extraEntries.length > 0 ? (
          <section className="mt-8" aria-label="إحصائيات إضافية">
            <h2 className="mb-3 border-b-2 border-line pb-2 text-[15px] font-extrabold">تفاصيل إضافية</h2>
            <div className="card grid grid-cols-2 gap-px overflow-hidden sm:grid-cols-4">
              {extraEntries.map(([k, v]) => (
                <div key={k} className="bg-surface px-3 py-3">
                  <p className="num text-[15px] font-extrabold">{String(v)}</p>
                  <p className="text-[10.5px] text-muted">{k}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[11px] text-muted">
          <span>المصدر: {real.provider} · إحصائيات حقيقية من طبقة البيانات</span>
          <PoweredBy />
        </div>
      </div>
    );
  }

  /* ══ 2) development/demo player ══ */
  const player = playerBySlug(slug);
  if (!player) {
    // honest 404: real player pages come from real provider slugs only
    notFound();
  }

  const team = teamBySlug(player.team);
  const comp = competitionBySlug(player.competition);
  const matches = teamMatches(player.team).slice(0, 12);
  const news = articles.filter((a) => a.players?.includes(player.slug)).slice(0, 6);

  const peers = players
    .filter((p) => p.slug !== player.slug && p.competition === player.competition && p.positionGroup === player.positionGroup)
    .slice(0, 3);

  const facts = [
    { k: "الاسم الكامل", v: player.nameEn },
    { k: "تاريخ الميلاد", v: `${player.birth} (${age(player.birth)} سنة)` },
    { k: "الجنسية", v: `${player.flag} ${player.nationality}` },
    { k: "الفريق الحالي", v: team?.name ?? player.team },
    { k: "المركز", v: player.position },
    { k: "الرقم", v: player.number ? String(player.number) : "—" },
    { k: "الطول", v: player.height ? `${player.height} سم` : "—" },
    { k: "الوزن", v: player.weight ? `${player.weight} كجم` : "—" },
    { k: "القدم المفضلة", v: player.foot ?? "—" },
  ];

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <nav aria-label="مسار التنقل" className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">الرئيسية</Link>
        <span aria-hidden>/</span>
        <Link href="/players" className="hover:text-gold-600 dark:hover:text-gold-400">اللاعبون</Link>
        <span aria-hidden>/</span>
        <span className="font-semibold text-ink">{player.name}</span>
      </nav>

      <header className="stripes mb-6 overflow-hidden rounded-[8px] border border-navy-700 bg-navy-850 text-white">
        <div className="flex flex-wrap items-center gap-5 px-5 py-6">
          <span className="grid h-24 w-24 shrink-0 place-items-center rounded-[6px] border border-white/10 bg-white/5">
            {team ? <Crest slug={team.slug} size={64} /> : <span className="text-3xl" aria-hidden>👤</span>}
          </span>
          <div className="min-w-0">
            <p className="eyebrow !text-white/50">{comp?.nameEn ?? player.sport}</p>
            <h1 className="text-2xl font-extrabold tracking-tight">{player.name}</h1>
            <p className="mt-1 text-[12px] text-white/65">
              {player.nameEn} · {player.position} · {player.flag} {player.nationality}
            </p>
            {team ? (
              <Link href={`/teams/${team.slug}`} className="mt-2 inline-block rounded-[3px] bg-white/10 px-3 py-1.5 text-[11px] font-bold transition hover:bg-gold-500 hover:text-navy-900">
                {team.name} ←
              </Link>
            ) : null}
          </div>

          <dl className="ms-auto flex flex-wrap gap-6 text-center">
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">مباريات</dt>
              <dd className="num text-xl font-extrabold">{player.seasonApps}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">أهداف</dt>
              <dd className="num text-xl font-extrabold text-gold-400">{player.seasonGoals}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">صناعة</dt>
              <dd className="num text-xl font-extrabold">{player.seasonAssists}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">دقائق</dt>
              <dd className="num text-xl font-extrabold">{player.minutes}</dd>
            </div>
          </dl>
        </div>
      </header>

      <Tabs
        items={[
          {
            id: "overview",
            label: "نظرة عامة",
            content: (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="card p-5">
                  <h2 className="mb-2 text-[14px] font-extrabold">نبذة</h2>
                  <p className="text-[13px] leading-relaxed text-muted">{player.bio}</p>
                  <h2 className="mt-5 mb-2 text-[14px] font-extrabold">أرقام الموسم</h2>
                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { k: "مباريات", v: player.seasonApps },
                      { k: "أهداف", v: player.seasonGoals },
                      { k: "صناعة", v: player.seasonAssists },
                      { k: "بطاقات صفراء", v: player.yellows },
                    ].map((s) => (
                      <div key={s.k} className="rounded-[3px] bg-navy-850/[0.04] px-3 py-2.5 dark:bg-white/[0.05]">
                        <dt className="text-[10px] text-muted">{s.k}</dt>
                        <dd className="num text-lg font-extrabold">{s.v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="card overflow-hidden">
                  <h2 className="border-b border-line bg-navy-850 px-3 py-2.5 text-[13px] font-extrabold text-white">
                    البطاقة التعريفية
                  </h2>
                  <dl className="divide-y divide-line">
                    {facts.map((f) => (
                      <div key={f.k} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[12px]">
                        <dt className="text-muted">{f.k}</dt>
                        <dd className="num text-end font-bold">{f.v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            ),
          },
          {
            id: "stats",
            label: "الإحصائيات",
            content: (
              <div className="card overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-line bg-navy-850/[0.04] text-muted dark:bg-white/[0.04]">
                      <th className="px-3 py-2.5 text-start font-semibold">الموسم</th>
                      <th className="px-3 py-2.5 text-start font-semibold">الفريق</th>
                      <th className="px-3 py-2.5 text-start font-semibold">البطولة</th>
                      <th className="num px-3 py-2.5 font-semibold">مباريات</th>
                      <th className="num px-3 py-2.5 font-semibold">دقائق</th>
                      <th className="num px-3 py-2.5 font-semibold">أهداف</th>
                      <th className="num px-3 py-2.5 font-semibold">صناعة</th>
                      <th className="num px-3 py-2.5 font-semibold">🟨</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-line">
                      <td className="px-3 py-2.5 font-bold">{comp?.season ?? "—"}</td>
                      <td className="px-3 py-2.5">{team?.name ?? player.team}</td>
                      <td className="px-3 py-2.5 text-muted">{comp?.name ?? "—"}</td>
                      <td className="num px-3 py-2.5 text-center">{player.seasonApps}</td>
                      <td className="num px-3 py-2.5 text-center">{player.minutes}</td>
                      <td className="num px-3 py-2.5 text-center font-extrabold">{player.seasonGoals}</td>
                      <td className="num px-3 py-2.5 text-center">{player.seasonAssists}</td>
                      <td className="num px-3 py-2.5 text-center">{player.yellows}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="border-t border-line px-3 py-2.5 text-[11px] text-muted">
                  تُبنى الإحصائيات التاريخية في الإنتاج من مزوّد البيانات المرخّص لكل موسم على حدة.
                </p>
              </div>
            ),
          },
          {
            id: "matches",
            label: "المباريات",
            content:
              matches.length > 0 ? (
                <ul className="space-y-2">
                  {matches.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/matches/${m.slug}`}
                        className="card flex items-center justify-between gap-3 px-3 py-2.5 text-[12px] transition hover:border-gold-500/50"
                      >
                        <span className="truncate font-bold">
                          {teamBySlug(m.home)?.short} × {teamBySlug(m.away)?.short}
                        </span>
                        <span className="num shrink-0 font-extrabold">
                          {m.status === "UPCOMING" ? "—" : `${m.homeScore}–${m.awayScore}`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="card px-4 py-10 text-center text-[13px] text-muted">لا توجد مباريات مسجّلة.</p>
              ),
          },
          {
            id: "compare",
            label: "مقارنة",
            content:
              peers.length > 0 ? (
                <div className="card overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-line bg-navy-850/[0.04] text-muted dark:bg-white/[0.04]">
                        <th className="px-3 py-2.5 text-start font-semibold">اللاعب</th>
                        <th className="num px-3 py-2.5 font-semibold">مباريات</th>
                        <th className="num px-3 py-2.5 font-semibold">أهداف</th>
                        <th className="num px-3 py-2.5 font-semibold">صناعة</th>
                        <th className="num px-3 py-2.5 font-semibold">مساهمة/مباراة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[player, ...peers].map((p, i) => (
                        <tr key={p.slug} className={`border-b border-line last:border-0 ${i === 0 ? "bg-gold-500/10 font-bold" : ""}`}>
                          <td className="px-3 py-2.5">
                            <Link href={`/players/${p.slug}`} className="transition hover:text-gold-600 dark:hover:text-gold-400">
                              {p.name}
                            </Link>
                          </td>
                          <td className="num px-3 py-2.5 text-center">{p.seasonApps}</td>
                          <td className="num px-3 py-2.5 text-center">{p.seasonGoals}</td>
                          <td className="num px-3 py-2.5 text-center">{p.seasonAssists}</td>
                          <td className="num px-3 py-2.5 text-center">
                            {((p.seasonGoals + p.seasonAssists) / Math.max(1, p.seasonApps)).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="card px-4 py-10 text-center text-[13px] text-muted">
                  لا يوجد لاعبون قابلون للمقارنة في نفس البطولة والمركز في هذه النسخة.
                </p>
              ),
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
                <p className="card px-4 py-10 text-center text-[13px] text-muted">لا توجد أخبار مرتبطة بهذا اللاعب.</p>
              ),
          },
        ]}
      />
    </div>
  );
}
