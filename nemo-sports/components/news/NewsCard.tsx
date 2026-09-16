import Link from "next/link";
import type { Article } from "@/lib/data";
import { compact, relative } from "@/lib/format";
import { sportBySlug } from "@/lib/core-data";

/** Deterministic navy/duotone cover — no external imagery, no licensing risk. */
function Cover({ seed, label, compactMode = false }: { seed: string; label: string; compactMode?: boolean }) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  const hue = 205 + (h % 40);
  return (
    <div
      className={`stripes relative overflow-hidden bg-navy-850 ${compactMode ? "h-24" : "h-44"}`}
      style={{
        backgroundImage: `linear-gradient(135deg, hsl(${hue} 55% 16%) 0%, hsl(${hue + 18} 48% 26%) 55%, #0F1B2E 100%)`,
      }}
    >
      <span className="absolute -end-8 -top-10 h-32 w-32 rounded-full bg-gold-500/15 blur-xl" aria-hidden />
      <span className="absolute inset-x-0 bottom-0 h-1 bg-gold-500/70" aria-hidden />
      <span className="absolute bottom-2.5 start-3 font-display text-[10px] font-bold uppercase tracking-[0.25em] text-white/60">
        {label}
      </span>
    </div>
  );
}

export default function NewsCard({ article, layout = "grid" }: { article: Article; layout?: "grid" | "row" | "lead" }) {
  const sport = sportBySlug(article.sport);
  const ago = relative(new Date(Date.now() - article.publishedAgoMin * 60000).toISOString());

  if (layout === "row") {
    return (
      <Link
        href={`/news/${article.slug}`}
        className="group flex gap-3 border-b border-line py-3 transition focus-ring"
      >
        <span className="w-24 shrink-0 overflow-hidden rounded-[3px]">
          <Cover seed={article.slug} label={sport?.nameEn ?? ""} compactMode />
        </span>
        <span className="min-w-0">
          <span className="mb-1 flex items-center gap-2">
            {article.breaking ? (
              <span className="rounded-[3px] bg-live px-1.5 py-0.5 text-[9px] font-extrabold text-white">عاجل</span>
            ) : null}
            <span className="text-[10px] font-bold text-gold-600 dark:text-gold-400">{article.category}</span>
            <span className="num text-[10px] text-muted">{ago}</span>
          </span>
          <span className="block text-[13px] font-bold leading-snug transition group-hover:text-gold-600 dark:group-hover:text-gold-400">
            {article.title}
          </span>
        </span>
      </Link>
    );
  }

  const lead = layout === "lead";

  return (
    <article className="group card flex h-full flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-16px_rgba(15,27,46,0.5)]">
      <Link href={`/news/${article.slug}`} className="block focus-ring">
        <div className="relative">
          <Cover seed={article.slug} label={sport?.nameEn ?? "NEMO"} />
          {article.breaking ? (
            <span className="absolute end-2.5 top-2.5 rounded-[3px] bg-live px-2 py-1 text-[10px] font-extrabold text-white">
              خبر عاجل
            </span>
          ) : null}
          {article.kind === "external" ? (
            <span className="absolute start-2.5 top-2.5 rounded-[3px] bg-navy-950/80 px-2 py-1 text-[10px] font-bold text-white/80">
              ملخص من مصدر خارجي
            </span>
          ) : null}
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold">
          <span className="rounded-[3px] bg-gold-500/15 px-1.5 py-0.5 text-gold-600 dark:text-gold-400">
            {article.category}
          </span>
          <span className="text-muted">{sport?.name}</span>
          <span className="num text-muted">· {ago}</span>
        </div>

        <h3 className={`font-bold leading-snug ${lead ? "text-xl" : "text-[15px]"}`}>
          <Link href={`/news/${article.slug}`} className="transition group-hover:text-gold-600 dark:group-hover:text-gold-400">
            {article.title}
          </Link>
        </h3>

        <p className={`mt-2 text-[13px] leading-relaxed text-muted ${lead ? "" : "line-clamp-3"}`}>
          {article.excerpt}
        </p>

        <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-[11px] text-muted">
          <span className="truncate">{article.author}</span>
          <span className="num flex shrink-0 items-center gap-2">
            <span>{article.readMinutes} دقائق قراءة</span>
            <span aria-hidden>·</span>
            <span>{compact(article.views)} مشاهدة</span>
          </span>
        </div>
      </div>
    </article>
  );
}
