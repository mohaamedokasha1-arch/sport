import { reportKind } from "@/lib/news/relevance";
import Link from "next/link";
import type { NewsArticle } from "@/lib/news/types";
import { categoryMeta } from "@/lib/news/categorize";
import { cleanText } from "@/lib/news/normalize";
import { relative } from "@/lib/format";
import { newsEntityHref } from "@/lib/news/entity-links";

/**
 * Card for automatically-ingested RSS articles.
 * ─────────────────────────────────────────────
 * LEGAL: title + short snippet + source badge + categories + entities +
 * prominent original-source link. NEVER the full body. Clicking opens the
 * ORIGINAL publisher in a new tab.
 */
export default function RssArticleCard({ article }: { article: NewsArticle }) {
  const meta = categoryMeta(article.category);
  const minsOld = Math.max(0, Math.round((Date.now() - Date.parse(article.publicationDate)) / 60000));
  const breaking = minsOld < 15;

  return (
    <article className="group card flex h-full flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-16px_rgba(15,27,46,0.5)]">
      <div className="flex flex-1 flex-col p-4">
        {/* source row */}
        <div className="mb-2.5 flex items-center gap-2">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[3px] bg-navy-850 text-[12px] font-extrabold text-gold-400"
            aria-hidden
          >
            {article.sourceBadge}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-extrabold">{article.sourceName}</span>
            <span className="num block truncate text-[10px] text-muted" dir="ltr">
              {article.sourceDomain}
            </span>
          </span>
          {breaking ? (
            <span className="ms-auto shrink-0 rounded-[3px] bg-live px-1.5 py-0.5 text-[9px] font-extrabold text-white">
              حديث النشر
            </span>
          ) : null}
        </div>

        <p className="mb-2 text-[11px] text-muted">{reportKind(article.title) === "rumor" ? "تقرير / احتمال غير مؤكد" : "خبر منقول"} · التصنيف الآلي لا يثبت صحة الخبر</p>
        {/* headline → original publisher */}
        <h3 className="text-[15px] font-bold leading-snug">
          <a
            href={article.sourceUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="transition group-hover:text-gold-600 dark:group-hover:text-gold-400"
            title={`اقرأ الخبر كاملًا على ${article.sourceName}`}
          >
            {article.title}
          </a>
        </h3>

        {article.description ? (
          // RSS descriptions carry publisher markup; render plain text only.
          // Covers records ingested before the pipeline stored cleaned text.
          <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-muted">{cleanText(article.description)}</p>
        ) : null}

        {/* categories + entities */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
          <span
            className="rounded-[3px] px-1.5 py-0.5"
            style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
          >
            {meta.icon} {meta.nameAr}
          </span>
          {article.secondaryCategories.slice(0, 2).map((c) => (
            <span key={c} className="rounded-[3px] bg-navy-850/[0.06] px-1.5 py-0.5 text-muted dark:bg-white/[0.06]">
              {categoryMeta(c).nameAr}
            </span>
          ))}
        </div>

        {article.relatedEntities.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold">
            {article.relatedEntities.slice(0, 4).map((e) => {
              const href = newsEntityHref(e);
              const className = "rounded-[3px] border border-line px-1.5 py-0.5 text-muted";
              return href ? (
                <Link
                  key={`${e.type}:${e.internalId}`}
                  href={href}
                  className={`${className} transition hover:border-gold-500 hover:text-gold-600`}
                >
                  {e.displayName}
                </Link>
              ) : (
                <span key={`${e.type}:${e.internalId}`} className={className}>
                  {e.displayName}
                </span>
              );
            })}
          </div>
        ) : null}

        {/* footer: time + source link */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-[11px]">
          <span className="num text-muted">{relative(article.publicationDate)}</span>
          <a
            href={article.sourceUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="shrink-0 font-extrabold text-gold-600 transition hover:underline dark:text-gold-400"
          >
            اقرأ على {article.sourceName} ←
          </a>
        </div>
        <p className="mt-1.5 border-t border-line pt-1.5 text-[10px] text-muted">
          المصدر: {article.sourceName} · مقتطف RSS — النص الكامل لدى الناشر الأصلي
        </p>
      </div>
    </article>
  );
}
