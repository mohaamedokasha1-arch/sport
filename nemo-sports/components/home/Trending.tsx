import Link from "next/link";
import { compact } from "@/lib/format";
import { articles, liveMatches } from "@/lib/data";
import { teamBySlug } from "@/lib/core-data";

export default function Trending() {
  const hotNews = [...articles].sort((a, b) => b.views - a.views).slice(0, 5);
  const hotMatches = [...liveMatches].sort((a, b) => (b.viewers ?? 0) - (a.viewers ?? 0)).slice(0, 4);
  const hotTeams = ["al-ahly", "manchester-city", "real-madrid", "liverpool", "boston-celtics"];

  return (
    <div className="card overflow-hidden">
      <header className="flex items-center gap-2 border-b border-line bg-navy-850 px-3 py-2.5 text-white">
        <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden className="text-gold-500">
          <path d="M8 0c1 3-1 4-2 6S4 10 5 12c-2-1-3-3-3-5-1 1-2 3-2 5a7 7 0 0 0 14 0c0-5-4-7-6-12z" fill="currentColor" />
        </svg>
        <h2 className="text-[13px] font-extrabold tracking-wide">الأكثر متابعة الآن</h2>
      </header>

      <div className="divide-y divide-line">
        <section className="p-3">
          <h3 className="eyebrow mb-2">أخبار اليوم</h3>
          <ol className="space-y-2">
            {hotNews.map((a, i) => (
              <li key={a.slug} className="flex items-start gap-2.5">
                <span className="num w-4 shrink-0 text-[13px] font-extrabold text-gold-600 dark:text-gold-400">
                  {i + 1}
                </span>
                <Link href={`/news/${a.slug}`} className="min-w-0 text-[12px] font-semibold leading-snug transition hover:text-gold-600 dark:hover:text-gold-400">
                  {a.title}
                  <span className="num mt-0.5 block text-[10px] font-normal text-muted">
                    {compact(a.views)} مشاهدة
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="p-3">
          <h3 className="eyebrow mb-2">مباريات مباشرة</h3>
          <ul className="space-y-2">
            {hotMatches.map((m) => (
              <li key={m.id}>
                <Link href={`/matches/${m.slug}`} className="flex items-center justify-between gap-2 text-[12px] font-semibold transition hover:text-gold-600 dark:hover:text-gold-400">
                  <span className="truncate">
                    {teamBySlug(m.home)?.short} × {teamBySlug(m.away)?.short}
                  </span>
                  <span className="num shrink-0 text-[10px] text-live">{compact(m.viewers ?? 0)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="p-3">
          <h3 className="eyebrow mb-2">فرق يتابعها الجميع</h3>
          <div className="flex flex-wrap gap-1.5">
            {hotTeams.map((t) => (
              <Link
                key={t}
                href={`/teams/${t}`}
                className="rounded-[3px] border border-line px-2 py-1 text-[11px] font-bold transition hover:border-gold-500 hover:text-gold-600 dark:hover:text-gold-400"
              >
                {teamBySlug(t)?.name}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
