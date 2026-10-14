import { groupSimilarStories } from "@/lib/news/group";
import type { Metadata } from "next";
import Link from "next/link";
import DataUnavailable from "@/components/ui/DataUnavailable";
import NewsCard from "@/components/news/NewsCard";
import RssArticleCard from "@/components/news/RssArticleCard";
import { articles } from "@/lib/data";
import { sports } from "@/lib/core-data";
import { getNewsFeed } from "@/lib/news/service";
import { CATEGORIES, FALLBACK_CATEGORY, categoryMeta, canonicalCategoryParam } from "@/lib/news/categorize";
import { newsCompetitions } from "@/lib/news/entities";
import { demoContentVisible } from "@/lib/site";
import { relative } from "@/lib/format";
import { ManualNewsSection } from "@/components/public/AdminPublished";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";

export type ViewProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };


export function generateMetadata(locale: Locale, _props: ViewProps = {} as ViewProps): Metadata {
  return {
  title: t(locale, "news.metaTitle"),
  description: t(locale, "news.metaDescription"),
  alternates: { canonical: "/news" },
};
}

/** Feed refreshes often; keep it fresh without hammering the store. */
export const revalidate = 120;

async function NewsPageBody({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const sp = await searchParams;
  // The store keeps the English category name; public links ship Arabic labels
  // too (the footer links to /news?category=انتقالات and /news?category=تحليلات).
  const rawCategory = typeof sp.category === "string" ? sp.category.slice(0, 120) : "";
  const category = canonicalCategoryParam(rawCategory);
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

  const fresh = feed.freshness;
  const storyGroups = groupSimilarStories(feed.items);
  const hasAny = feed.items.length > 0 || editorial.length > 0;
  // Echo the visitor's own label for a value that is not a real category, and
  // the proper Arabic name for one that is — «no news in "رياضة"» would be a
  // false statement about a label the newsroom never uses.
  const categoryLabel =
    category === FALLBACK_CATEGORY || CATEGORIES.some((entry) => entry.name === category)
      ? (locale === "ar" ? categoryMeta(category).nameAr : categoryMeta(category).nameEn)
      : rawCategory;
  const hasFilter = Boolean(category || team || competition);

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">{tr("news.eyebrow")}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{tr("news.heading")}</h1>
        </div>
        <p className="text-[12px] text-muted" role="status">
          <span className="num font-bold">{feed.total + editorial.length}</span> {tr("news.countStories")} ·{" "}
          {fresh.lastSuccessAt ? (
            <>
              {tr("news.lastSuccess")} <span className="num font-bold">{relative(fresh.lastSuccessAt)}</span>
              {fresh.state === "stale" ? <span className="text-warn">{tr("news.maybeStale")}</span> : null}
            </>
          ) : (
            tr("news.noSuccess")
          )}
          {fresh.lastAttemptOk === false && fresh.lastFailureAt ? (
            <span className="text-warn">
              {" "}{tr("news.lastFailure")} <span className="num">{relative(fresh.lastFailureAt)}</span>
            </span>
          ) : null}
          {!fresh.lastAttemptAt ? <span>{tr("news.noAttempt")}</span> : null}
        </p>
      </header>

      <p className="-mt-3 mb-5 text-[11px] text-muted">
        {tr("news.cronNote", { schedule: locale === "ar" ? fresh.schedule.descriptionAr : fresh.schedule.descriptionEn })}{" "}
        <span className="num">{Math.round(fresh.schedule.staleAfterMinutes / 60)}</span> {tr("news.hoursSuffix")}
      </p>

      {editorial.length > 0 ? <p className="mb-5 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[11px] font-semibold text-muted">{tr("news.editorialDemoNotice")}</p> : null}

      {!hasAny ? (
        <DataUnavailable
          title={
            category
              ? tr("news.emptyCategory")
              : team || competition
                ? tr("news.emptyFilter")
                : tr("news.emptyNone")
          }
          message={
            category
              ? tr("news.emptyCategoryMessage", { category: categoryLabel })
              : team || competition
                ? tr("news.emptyFilterMessage")
                : tr("news.emptyNoneMessage")
          }
          actionHref={hasFilter ? "/news" : undefined}
          actionLabel={hasFilter ? tr("news.viewAll") : undefined}
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
            {tr("news.filterAll")}
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
          This branch used to be gated on `… && hasAny`, which is false by
          definition, so the "لا توجد أخبار بهذا التصنيف" card could never
          render and the two-column grid was emitted even with nothing in it. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-8">
            {/* automatic feed */}
            {feed.items.length > 0 ? (
              <section aria-label={tr("news.publisherSection")}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {storyGroups.map(([lead, ...related]) => (
                    <div key={lead.id} className="space-y-2">
                      <RssArticleCard article={lead} locale={locale} />
                      {related.length > 0 && <details className="card p-3 text-sm">
                        <summary className="cursor-pointer font-bold">{tr("news.similarHeadlines", { n: related.length })}</summary>
                        <p className="my-2 text-xs text-muted">{tr("news.similarNote")}</p>
                        <ul className="space-y-3">{related.map((item) => <li key={item.id}><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline">{item.title}</a><p className="text-xs text-muted">{item.sourceName} · <time dateTime={item.publicationDate}>{relative(item.publicationDate)}</time></p></li>)}</ul>
                      </details>}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* editorial / demo */}
            {editorial.length > 0 ? (
              <section aria-label={tr("news.editorialSection")}>
                <h2 className="mb-3 flex items-center gap-2 text-[14px] font-extrabold">
                  <span className="h-4 w-1 rounded-full bg-gold-500" aria-hidden />
                  {tr("news.editorialDemo")}
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
                {tr("news.byCompetition")}
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
              <p className="eyebrow mb-2">{tr("news.policyEyebrow")}</p>
              <p>
                {tr("news.policyBody")}{" "}
                <Link href="/copyright" className="font-bold text-gold-600 dark:text-gold-400">
                  {tr("news.policyDetails")}
                </Link>
                .
              </p>
            </div>
          </aside>
        </div>
    </div>
  );
}

export default async function NewsPage(props: ViewProps & { locale: Locale }) {
  const sp = await props.searchParams;
  return (
    <>
      <ManualNewsSection
        category={canonicalCategoryParam(typeof sp.category === "string" ? sp.category.slice(0, 120) : "") || undefined}
      />
      <NewsPageBody {...props} />
    </>
  );
}
