import type { Metadata } from "next";
import Link from "next/link";
import MatchCard from "@/components/match/MatchCard";
import NewsCard from "@/components/news/NewsCard";
import CompetitionCard from "@/components/competition/CompetitionCard";
import Trending from "@/components/home/Trending";
import SectionHead from "@/components/ui/SectionHead";
import {
  articles,
  competitions,
  finishedToday,
  finishedYesterday,
  liveMatches,
  upcomingNext,
  upcomingToday,
} from "@/lib/data";
import { sportBySlug } from "@/lib/core-data";
import { dateAr, dayLabel, relative, timeOf } from "@/lib/format";

export const metadata: Metadata = {
  title: "نيمو سبورتس | نتائج مباشرة، أخبار وإحصائيات لـ 8 رياضات",
  description:
    "مباريات اليوم والنتائج المباشرة، أخبار موثوقة، ترتيب البطولات وإحصائيات اللاعبين — بث رسمي مرخّص فقط.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  const now = Date.now();

  const featured = [
    ...liveMatches.filter((m) => m.featured),
    ...upcomingToday.filter((m) => m.featured),
    ...upcomingNext.filter((m) => m.featured),
  ].slice(0, 2);

  const todaysMatches = [...upcomingToday, ...finishedToday].sort(
    (a, b) => +new Date(a.kickoff) - +new Date(b.kickoff),
  );

  const byCompetition = todaysMatches.reduce<Record<string, typeof todaysMatches>>((acc, m) => {
    (acc[m.competition] ||= []).push(m);
    return acc;
  }, {});

  const latestResults = [...finishedToday, ...finishedYesterday]
    .sort((a, b) => +new Date(b.kickoff) - +new Date(a.kickoff))
    .slice(0, 8);

  const nextFixtures = [...upcomingToday, ...upcomingNext]
    .filter((m) => +new Date(m.kickoff) > now)
    .sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff))
    .slice(0, 6);

  const news = articles.slice(0, 6);

  const ldEvent = liveMatches[0]
    ? {
        "@context": "https://schema.org",
        "@type": "SportsEvent",
        name: `${liveMatches[0].home} vs ${liveMatches[0].away}`,
        startDate: liveMatches[0].kickoff,
        eventStatus: "https://schema.org/EventScheduled",
        sportsActivityLocation: { "@type": "SportsActivityLocation", name: liveMatches[0].venue ?? "" },
      }
    : null;

  return (
    <>
      {ldEvent ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ldEvent) }} />
      ) : null}

      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* ── main column ─────────────────────────────── */}
          <div className="min-w-0 space-y-10">
            {/* featured */}
            <section aria-labelledby="featured-title">
              <SectionHead
                eyebrow="Match of the day"
                title="مباراة اليوم"
                href="/matches"
                linkLabel="كل المباريات"
              />
              <div id="featured-title" className="grid gap-4 lg:grid-cols-2">
                {featured.map((m) => (
                  <MatchCard key={m.id} match={m} variant="feature" />
                ))}
              </div>
            </section>

            {/* live now */}
            <section aria-labelledby="live-title">
              <SectionHead
                eyebrow="Live now"
                title="مباشر الآن"
                href="/live"
                linkLabel="غرفة النتائج المباشرة"
              />
              {liveMatches.length === 0 ? (
                <p className="card px-4 py-8 text-center text-[13px] text-muted">
                  لا توجد مباريات جارية الآن. تابع <Link href="/matches" className="font-bold text-gold-600 dark:text-gold-400">المباريات القادمة</Link>.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {liveMatches.map((m) => (
                    <MatchCard key={m.id} match={m} />
                  ))}
                </div>
              )}
              <p id="live-title" className="mt-2 text-[11px] text-muted">
                تُحدَّث النتائج تلقائيًا كل 5 ثوانٍ دون إعادة تحميل الصفحة · آخر تحديث{" "}
                <span className="num">{relative(new Date(now).toISOString(), now)}</span>
              </p>
            </section>

            {/* today's matches */}
            <section>
              <SectionHead
                eyebrow={dateAr(new Date().toISOString())}
                title="مباريات اليوم"
                href="/matches?date=today"
                linkLabel="كل مباريات اليوم"
              />
              <div className="space-y-5">
                {Object.entries(byCompetition).map(([comp, list]) => (
                  <div key={comp}>
                    <h3 className="mb-2 flex items-center gap-2 text-[12px] font-bold text-muted">
                      <span className="h-px w-6 bg-line" aria-hidden />
                      {competitions.find((c) => c.slug === comp)?.name}
                      <span className="num rounded-[3px] bg-navy-850/5 px-1.5 py-0.5 text-[10px] dark:bg-white/10">
                        {list.length}
                      </span>
                    </h3>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {list.map((m) => (
                        <MatchCard key={m.id} match={m} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* upcoming */}
            <section>
              <SectionHead eyebrow="Next up" title="أهم المباريات القادمة" href="/fixtures" />
              <div className="card divide-y divide-line overflow-hidden">
                {nextFixtures.map((m) => (
                  <Link
                    key={m.id}
                    href={`/matches/${m.slug}`}
                    className="group grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 transition hover:bg-navy-850/[0.03] dark:hover:bg-white/[0.04] focus-ring sm:grid-cols-[1fr_150px]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-bold">
                        {competitions.find((c) => c.slug === m.competition)?.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-muted">
                        {sportBySlug(m.sport)?.icon} {m.round}
                      </span>
                    </span>
                    <span className="text-end">
                      <span className="num block text-[13px] font-extrabold">{timeOf(m.kickoff)}</span>
                      <span className="block text-[11px] font-semibold text-gold-600 dark:text-gold-400">
                        {dayLabel(m.kickoff)}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            {/* results */}
            <section>
              <SectionHead eyebrow="Full time" title="آخر النتائج" href="/results" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {latestResults.slice(0, 6).map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            </section>

            {/* news */}
            <section>
              <SectionHead eyebrow="Newsroom" title="أخبار اليوم" href="/news" linkLabel="كل الأخبار" />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {news.map((a, i) => (
                  <NewsCard key={a.slug} article={a} layout={i === 0 ? "lead" : "grid"} />
                ))}
              </div>
            </section>

            {/* competitions */}
            <section>
              <SectionHead eyebrow="Competitions" title="البطولات الرئيسية" href="/competitions" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {["premier-league", "egyptian-league", "champions-league", "la-liga", "nba", "atp-tour", "handball-champions", "world-title-fights"].map(
                  (slug) => (
                    <CompetitionCard key={slug} slug={slug} />
                  ),
                )}
              </div>
            </section>
          </div>

          {/* ── sidebar ─────────────────────────────────── */}
          <aside className="min-w-0 space-y-6 xl:sticky xl:top-40 xl:self-start">
            <Trending />

            <div className="card p-4">
              <p className="eyebrow mb-2">إعلان</p>
              <div className="grid h-[250px] place-items-center rounded-[4px] border border-dashed border-line bg-navy-850/[0.03] text-center text-[11px] text-muted dark:bg-white/[0.03]">
                موضع إعلاني 300×250
                <br />
                Google AdSense / Programmatic
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-muted">
                الإعلانات مفصولة بوضوح عن المحتوى التحريري، ويُنشر المحتوى المموّل بوسم
                «محتوى برعاية» صريح.
              </p>
            </div>

            <div className="card overflow-hidden">
              <header className="border-b border-line bg-navy-850 px-3 py-2.5 text-white">
                <h2 className="text-[13px] font-extrabold">مصادر البيانات</h2>
              </header>
              <div className="space-y-2 p-3 text-[12px]">
                <p className="flex items-center justify-between gap-2">
                  <span className="font-semibold">المصدر الأساسي</span>
                  <span className="flex items-center gap-1.5 text-win">
                    <span className="h-1.5 w-1.5 rounded-full bg-win" aria-hidden /> متصل
                  </span>
                </p>
                <p className="flex items-center justify-between gap-2">
                  <span className="font-semibold">المصدر البديل</span>
                  <span className="flex items-center gap-1.5 text-win">
                    <span className="h-1.5 w-1.5 rounded-full bg-win" aria-hidden /> جاهز
                  </span>
                </p>
                <p className="flex items-center justify-between gap-2">
                  <span className="font-semibold">الإدخال اليدوي</span>
                  <span className="text-muted">آخر خيار</span>
                </p>
                <p className="border-t border-line pt-2 text-[11px] leading-relaxed text-muted">
                  عند فشل المصدر الأساسي يتحول النظام تلقائيًا إلى البديل، ثم إلى آخر نتيجة
                  محفوظة مع تنبيه واضح للمستخدم.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
