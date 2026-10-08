import type { Metadata } from "next";
import Link from "next/link";
import DataUnavailable from "@/components/ui/DataUnavailable";
import NewsCard from "@/components/news/NewsCard";
import RssArticleCard from "@/components/news/RssArticleCard";
import { articles } from "@/lib/data";
import { competitions, sports } from "@/lib/core-data";
import { getNewsFeed } from "@/lib/news/service";
import { categoryMeta } from "@/lib/news/categorize";
import { demoContentVisible } from "@/lib/site";
import { relative } from "@/lib/format";
import { ManualNewsSection } from "@/components/public/AdminPublished";

export const metadata: Metadata = {
  title: "الأخبار — كل الأخبار الرياضية",
  description: "أخبار وتحليلات وتقارير رياضية تُجمَع تلقائيًا من الناشرين، مع روابطها الأصلية دائمًا.",
  alternates: { canonical: "/news" },
};

/** Feed refreshes often; keep it fresh without hammering the store. */
export const revalidate = 120;

async function NewsPageBody({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const category = typeof sp.category === "string" ? sp.category : "";
  const sport = typeof sp.sport === "string" ? sp.sport : "";
  const competition = typeof sp.competition === "string" ? sp.competition : "";

  // ── automatic feed (Google News RSS pipeline) ──────────────────
  const feed = await getNewsFeed({
    ...(category ? { category } : {}),
    ...(competition ? { competition } : {}),
    limit: 24,
  });

  // ── editorial / demo articles (dev + demo deployments only) ────
  const showDemo = demoContentVisible();
  const editorial = showDemo && feed.items.length === 0
    ? articles.filter(
        (a) =>
          (!category || a.category === category) &&
          (!sport || a.sport === sport) &&
          (!competition || a.competition === competition),
      )
    : [];
  const editorialCategories = Array.from(new Set(editorial.map((a) => a.category)));

  const hasAny = feed.items.length > 0 || editorial.length > 0;

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">التغطية الرياضية</p>
          <h1 className="text-2xl font-extrabold tracking-tight">الأخبار</h1>
        </div>
        <p className="text-[12px] text-muted">
          <span className="num font-bold">{feed.total + editorial.length}</span> خبرًا ·{" "}
          {feed.lastUpdated ? (
            <>
              آخر تحديث: <span className="num font-bold">{relative(feed.lastUpdated)}</span>
              {feed.stale ? <span className="text-warn"> (بيانات قد لا تكون حالية)</span> : null}
            </>
          ) : (
            "تُجمَع تلقائيًا من الناشرين"
          )}
        </p>
      </header>

      {editorial.length > 0 ? <p className="mb-5 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[11px] font-semibold text-muted">المقالات الظاهرة بيانات توضيحية للتطوير فقط، ولا تمثل أخبارًا منشورة.</p> : null}

      {!hasAny ? (
        <DataUnavailable
          title="لا توجد أخبار منشورة حاليًا"
          message="الأخبار تُجمَع تلقائيًا من الناشرين كل بضع دقائق. إن استمر الفراغ، تحقق من حالة المصادر في لوحة التحكم."
        />
      ) : null}

      {/* category chips (pipeline categories) */}
      {feed.categories.length > 0 ? (
        <div className="mb-5 flex flex-wrap gap-2">
          <Link
            href="/news"
            className={`inline-flex min-h-11 items-center rounded-[3px] px-3 py-1.5 text-[12px] font-bold transition focus-ring ${
              !category
                ? "bg-navy-850 text-white"
                : "border border-line bg-surface text-muted hover:border-gold-500"
            }`}
          >
            الكل
          </Link>
          {feed.categories.slice(0, 12).map((c) => {
            const m = categoryMeta(c.name);
            return (
              <Link
                key={c.name}
                href={`/news?category=${encodeURIComponent(c.name)}`}
                className={`inline-flex min-h-11 items-center rounded-[3px] px-3 py-1.5 text-[12px] font-bold transition focus-ring ${
                  category === c.name
                    ? "bg-navy-850 text-white"
                    : "border border-line bg-surface text-muted hover:border-gold-500"
                }`}
              >
                {m.icon} {m.nameAr} <span className="num opacity-60">({c.count})</span>
              </Link>
            );
          })}
        </div>
      ) : null}

      {showDemo && editorial.length > 0 ? (
        <div className="mb-5 flex flex-wrap gap-2">
          <span className="mx-1 h-6 w-px self-center bg-line" aria-hidden />
          {sports.map((s) => (
            <Link
              key={s.slug}
              href={`/news?sport=${s.slug}`}
              className={`inline-flex min-h-11 items-center rounded-[3px] px-3 py-1.5 text-[12px] font-bold transition focus-ring ${
                sport === s.slug
                  ? "bg-gold-500 text-navy-900"
                  : "border border-line bg-surface text-muted hover:border-gold-500"
              }`}
            >
              {s.icon} {s.name}
            </Link>
          ))}
        </div>
      ) : null}

      {feed.items.length === 0 && editorial.length === 0 && hasAny ? (
        <div className="card grid place-items-center gap-2 px-6 py-16 text-center">
          <p className="text-[15px] font-bold">لا توجد أخبار بهذا التصنيف</p>
          <Link href="/news" className="text-[13px] font-bold text-gold-600 dark:text-gold-400">
            عرض كل الأخبار
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-8">
            {/* automatic feed */}
            {feed.items.length > 0 ? (
              <section aria-label="آخر الأخبار من الناشرين">
                <div className="grid gap-4 sm:grid-cols-2">
                  {feed.items.map((a) => (
                    <RssArticleCard key={a.id} article={a} />
                  ))}
                </div>
              </section>
            ) : null}

            {/* editorial / demo */}
            {editorial.length > 0 ? (
              <section aria-label="مقالات تحريرية">
                <h2 className="mb-3 flex items-center gap-2 text-[14px] font-extrabold">
                  <span className="h-4 w-1 rounded-full bg-gold-500" aria-hidden />
                  مقالات توضيحية للتطوير
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {editorial.map((a, i) => (
                    <NewsCard key={a.slug} article={a} layout={i === 0 ? "lead" : "grid"} />
                  ))}
                </div>
                {editorialCategories.length > 1 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {editorialCategories.map((c) => (
                      <Link
                        key={c}
                        href={`/news?category=${encodeURIComponent(c)}`}
                        className="rounded-[3px] border border-line bg-surface px-2.5 py-1 text-[11px] font-bold text-muted hover:border-gold-500"
                      >
                        {c}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          <aside className="space-y-5">
            <div className="card overflow-hidden">
              <h2 className="border-b border-line bg-navy-850 px-3 py-2.5 text-[13px] font-extrabold text-white">
                حسب البطولة
              </h2>
              <ul className="divide-y divide-line">
                {competitions.slice(0, 8).map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/news?competition=${c.slug}`}
                      className="flex items-center justify-between gap-2 px-3 py-2.5 text-[12px] font-semibold transition hover:bg-navy-850/[0.03] dark:hover:bg-white/[0.04]"
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="num shrink-0 text-[11px] text-muted">←</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card p-4 text-[11px] leading-relaxed text-muted">
              <p className="eyebrow mb-2">سياسة المحتوى</p>
              <p>
                الأخبار المكتوبة داخل نيمو سبورتس من إنتاج محررينا. أما الأخبار المجمّعة
                تلقائيًا فتظهر بعنوانها ومقتطف قصير ورابط واضح للناشر الأصلي، دون نسخ
                النص كاملًا —{" "}
                <Link href="/copyright" className="font-bold text-gold-600 dark:text-gold-400">
                  تفاصيل السياسة
                </Link>
                .
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default async function NewsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  return (
    <>
      <ManualNewsSection category={typeof sp.category === "string" ? sp.category : undefined} />
      <NewsPageBody {...props} />
    </>
  );
}
