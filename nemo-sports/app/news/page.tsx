import { groupSimilarStories } from "@/lib/news/group";
import type { Metadata } from "next";
import Link from "next/link";
import DataUnavailable from "@/components/ui/DataUnavailable";
import NewsCard from "@/components/news/NewsCard";
import RssArticleCard from "@/components/news/RssArticleCard";
import { articles } from "@/lib/data";
import { sports } from "@/lib/core-data";
import { getNewsFeed } from "@/lib/news/service";
import { newsCompetitions } from "@/lib/news/entities";
import { CATEGORIES, FALLBACK_CATEGORY, categoryMeta, canonicalCategoryParam } from "@/lib/news/categorize";
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
  // The store keeps the English category name; public links ship Arabic labels
  // too (the footer links to /news?category=انتقالات and /news?category=تحليلات).
  // Comparing those labels verbatim meant the query always matched zero rows.
  const category = canonicalCategoryParam(typeof sp.category === "string" ? sp.category.slice(0, 120) : "");
  const team = typeof sp.team === "string" ? sp.team.slice(0, 160) : "";
  const sport = typeof sp.sport === "string" ? sp.sport : "";
  const competition = typeof sp.competition === "string" ? sp.competition : "";

  // ── automatic feed (Google News RSS pipeline) ──────────────────
  const feed = await getNewsFeed({
    ...(category ? { category } : {}),
    ...(team ? { team } : {}),
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

  const storyGroups = groupSimilarStories(feed.items);
  const hasAny = feed.items.length > 0 || editorial.length > 0;
  // Echo the visitor's own label for a value that is not a real category, and
  // the proper Arabic name for one that is — "no news in «رياضة»" would be a
  // false statement about a made-up label.
  const categoryLabel =
    category === FALLBACK_CATEGORY || CATEGORIES.some((entry) => entry.name === category)
      ? categoryMeta(category).nameAr
      : category;

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">التغطية الرياضية</p>
          <h1 className="text-2xl font-extrabold tracking-tight">NEMO Newsroom · الأخبار</h1>
        </div>
        <p className="text-[12px] text-muted">
          <span className="num font-bold">{feed.total + editorial.length}</span> خبرًا ·{" "}
          {feed.lastUpdated ? (
            <>
              آخر تحديث: <span className="num font-bold">{relative(feed.lastUpdated)}</span>
              {feed.stale ? <span className="text-warn"> (بيانات قد لا تكون حالية)</span> : null}
            </>
          ) : (
            "لا يوجد وقت تحديث ناجح مسجّل"
          )}
        </p>
      </header>

      {editorial.length > 0 ? <p className="mb-5 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[11px] font-semibold text-muted">المقالات الظاهرة بيانات توضيحية للتطوير فقط، ولا تمثل أخبارًا منشورة.</p> : null}

      {!hasAny ? (
        <DataUnavailable
          title={
            category
              ? "لا توجد أخبار بهذا التصنيف"
              : team || competition
                ? "لا توجد أخبار مطابقة لهذا الفلتر"
                : "لا توجد أخبار منشورة حاليًا"
          }
          message={
            category
              ? `لم يُرجع آخر تحديث خبرًا منشورًا في تصنيف «${categoryLabel}». التصنيفات تمتلئ مع وصول أخبار جديدة، وقد يبقى بعضها فارغًا حتى ذلك الحين.`
              : team || competition
                ? "لم يُرجع آخر تحديث خبرًا منشورًا يطابق الفلتر المحدد. جرّب اسمًا أقصر أو امسح الفلتر."
                : "لم تُرجع قاعدة الأخبار محتوى منشورًا مطابقًا. التحديث يعتمد على المهام المجدولة وحالة المصادر، ولا نضمن تحديثًا كل بضع دقائق."
          }
          actionHref={category || team || competition ? "/news" : undefined}
          actionLabel={category || team || competition ? "عرض كل الأخبار" : undefined}
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

      {/* The empty case is handled by the filter-aware DataUnavailable above.
          This branch only ever rendered when there was something to show; its
          previous condition (`… && hasAny`) was unreachable, so the
          "لا توجد أخبار بهذا التصنيف" copy could never be seen and a visitor
          filtering by category was told instead that NO news is published. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-8">
            {/* automatic feed */}
            {feed.items.length > 0 ? (
              <section aria-label="آخر الأخبار من الناشرين">
                <div className="grid gap-4 sm:grid-cols-2">
                  {storyGroups.map(([lead, ...related]) => (
                    <div key={lead.id} className="space-y-2">
                      <RssArticleCard article={lead} />
                      {related.length > 0 && <details className="card p-3 text-sm">
                        <summary className="cursor-pointer font-bold">عناوين متشابهة ({related.length})</summary>
                        <p className="my-2 text-xs text-muted">تجميع آلي ضمن الأخبار المحمّلة، وليس تأكيدًا لصحة القصة أو تطابقها.</p>
                        <ul className="space-y-3">{related.map((item) => <li key={item.id}><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">{item.title}</a><p className="text-xs text-muted">{item.sourceName} · <time dateTime={item.publicationDate}>{relative(item.publicationDate)}</time></p></li>)}</ul>
                      </details>}
                    </div>
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
                {newsCompetitions().slice(0, 8).map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/news?competition=${encodeURIComponent(c.id)}`}
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
    </div>
  );
}

export default async function NewsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  return (
    <>
      <ManualNewsSection category={canonicalCategoryParam(typeof sp.category === "string" ? sp.category.slice(0, 120) : "") || undefined} />
      <NewsPageBody {...props} />
    </>
  );
}
