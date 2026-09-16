import type { Metadata } from "next";
import Link from "next/link";
import Crest from "@/components/ui/Crest";
import NewsCard from "@/components/news/NewsCard";
import MatchCard from "@/components/match/MatchCard";
import SearchBox from "@/components/layout/SearchBox";
import { allMatches, articles, competitions, players, sports, teams } from "@/lib/data";

export const metadata: Metadata = {
  title: "البحث",
  description: "ابحث عن فريق أو لاعب أو بطولة أو مباراة أو خبر في نيمو سبورتس.",
  alternates: { canonical: "/search" },
};

const norm = (s: string) =>
  s.toLowerCase().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[\u064B-\u0652]/g, "");

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const needle = norm(q);
  const has = needle.length >= 2;
  const hit = (s: string) => has && norm(s).includes(needle);

  const teamHits = has ? teams.filter((t) => hit(t.name) || hit(t.nameEn) || hit(t.short)) : [];
  const playerHits = has ? players.filter((p) => hit(p.name) || hit(p.nameEn)) : [];
  const compHits = has ? competitions.filter((c) => hit(c.name) || hit(c.nameEn) || hit(c.code)) : [];
  const newsHits = has ? articles.filter((a) => hit(a.title) || hit(a.excerpt) || hit(a.category)) : [];
  const matchHits = has
    ? allMatches.filter((m) => {
        const h = teams.find((t) => t.slug === m.home);
        const a = teams.find((t) => t.slug === m.away);
        return [h?.name, h?.nameEn, a?.name, a?.nameEn].some((x) => x && hit(x));
      })
    : [];

  const total = teamHits.length + playerHits.length + compHits.length + newsHits.length + matchHits.length;

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-5 border-b-2 border-line pb-4">
        <p className="eyebrow mb-1">Search</p>
        <h1 className="mb-4 text-2xl font-extrabold tracking-tight">البحث</h1>
        <div className="max-w-2xl">
          <SearchBox variant="page" />
        </div>
      </header>

      {!has ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { t: "رياضات", items: sports.map((s) => ({ label: `${s.icon} ${s.name}`, href: `/matches?sport=${s.slug}` })) },
            {
              t: "بطولات شائعة",
              items: competitions.slice(0, 6).map((c) => ({ label: c.name, href: `/competitions/${c.slug}` })),
            },
            {
              t: "فرق شائعة",
              items: ["al-ahly", "zamalek", "real-madrid", "manchester-city", "liverpool", "boston-celtics"].map((s) => ({
                label: teams.find((t) => t.slug === s)?.name ?? s,
                href: `/teams/${s}`,
              })),
            },
            {
              t: "أقسام",
              items: [
                { label: "مباريات اليوم", href: "/matches" },
                { label: "النتائج المباشرة", href: "/live" },
                { label: "الأخبار", href: "/news" },
                { label: "جدول البث", href: "/watch" },
                { label: "الترتيب", href: "/standings" },
              ],
            },
          ].map((g) => (
            <div key={g.t} className="card overflow-hidden">
              <h2 className="border-b border-line bg-navy-850 px-3 py-2.5 text-[13px] font-extrabold text-white">{g.t}</h2>
              <ul className="divide-y divide-line">
                {g.items.map((i) => (
                  <li key={i.href + i.label}>
                    <Link href={i.href} className="block px-3 py-2.5 text-[12px] font-semibold transition hover:bg-navy-850/[0.03] dark:hover:bg-white/[0.04]">
                      {i.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : total === 0 ? (
        <div className="card grid place-items-center gap-2 px-6 py-16 text-center">
          <p className="text-[15px] font-bold">لا نتائج لـ «{q}»</p>
          <p className="max-w-md text-[13px] text-muted">
            جرّب كتابة الاسم بالإنجليزية، أو اختصره، أو ابحث باسم البطولة.
          </p>
        </div>
      ) : (
        <div className="space-y-9">
          <p className="text-[13px] text-muted">
            <span className="num font-bold text-ink">{total}</span> نتيجة لـ «{q}»
          </p>

          {teamHits.length > 0 ? (
            <ResultGroup title="الفرق" count={teamHits.length}>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {teamHits.map((t) => (
                  <li key={t.slug}>
                    <Link href={`/teams/${t.slug}`} className="card flex items-center gap-3 p-3 transition hover:border-gold-500/50">
                      <Crest slug={t.slug} size={36} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-bold">{t.name}</span>
                        <span className="block truncate text-[11px] text-muted">{t.nameEn}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </ResultGroup>
          ) : null}

          {playerHits.length > 0 ? (
            <ResultGroup title="اللاعبون" count={playerHits.length}>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {playerHits.map((p) => (
                  <li key={p.slug}>
                    <Link href={`/players/${p.slug}`} className="card flex items-center gap-3 p-3 transition hover:border-gold-500/50">
                      <span className="num grid h-9 w-9 shrink-0 place-items-center rounded-[3px] bg-navy-850 text-[12px] font-extrabold text-gold-400">
                        {p.number ?? "—"}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-bold">{p.name}</span>
                        <span className="block truncate text-[11px] text-muted">
                          {p.position} · {p.flag} {p.nationality}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </ResultGroup>
          ) : null}

          {compHits.length > 0 ? (
            <ResultGroup title="البطولات" count={compHits.length}>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {compHits.map((c) => (
                  <li key={c.slug}>
                    <Link href={`/competitions/${c.slug}`} className="card flex items-center gap-3 p-3 transition hover:border-gold-500/50">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[3px] bg-gold-500 font-display text-[10px] font-extrabold text-navy-900">
                        {c.code}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-bold">{c.name}</span>
                        <span className="block truncate text-[11px] text-muted">{c.country}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </ResultGroup>
          ) : null}

          {matchHits.length > 0 ? (
            <ResultGroup title="المباريات" count={matchHits.length}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {matchHits.slice(0, 9).map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            </ResultGroup>
          ) : null}

          {newsHits.length > 0 ? (
            <ResultGroup title="الأخبار" count={newsHits.length}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {newsHits.map((a) => (
                  <NewsCard key={a.slug} article={a} />
                ))}
              </div>
            </ResultGroup>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ResultGroup({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 border-b border-line pb-2 text-[14px] font-extrabold">
        <span className="h-4 w-1 rounded-full bg-gold-500" aria-hidden />
        {title}
        <span className="num rounded-[3px] bg-navy-850/5 px-1.5 py-0.5 text-[10px] dark:bg-white/10">{count}</span>
      </h2>
      {children}
    </section>
  );
}
