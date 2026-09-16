import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Crest from "@/components/ui/Crest";
import NewsCard from "@/components/news/NewsCard";
import { articleBySlug, articles, relatedArticles } from "@/lib/data";
import { competitionBySlug, sportBySlug } from "@/lib/core-data";
import { compact, dateAr } from "@/lib/format";

export function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const a = articleBySlug(slug);
  if (!a) return { title: "الخبر غير موجود" };
  return {
    title: a.title,
    description: a.excerpt,
    alternates: { canonical: `/news/${a.slug}` },
    openGraph: { title: a.title, description: a.excerpt, type: "article" },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = articleBySlug(slug);
  if (!article) notFound();

  const sport = sportBySlug(article.sport);
  const comp = article.competition ? competitionBySlug(article.competition) : undefined;
  const related = relatedArticles(article);
  const published = new Date(Date.now() - article.publishedAgoMin * 60000);

  let h = 0;
  for (let i = 0; i < article.slug.length; i++) h = (h * 31 + article.slug.charCodeAt(i)) % 360;
  const hue = 205 + (h % 40);

  const ld = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.excerpt,
    datePublished: published.toISOString(),
    dateModified: published.toISOString(),
    inLanguage: "ar",
    author: { "@type": "Person", name: article.author },
    publisher: { "@type": "Organization", name: "NEMO Sports" },
    articleSection: article.category,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <article className="mx-auto max-w-[1280px] px-4 py-6">
        <nav aria-label="مسار التنقل" className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">الرئيسية</Link>
          <span aria-hidden>/</span>
          <Link href="/news" className="hover:text-gold-600 dark:hover:text-gold-400">الأخبار</Link>
          <span aria-hidden>/</span>
          <span className="font-semibold text-ink">{article.category}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <div
              className="stripes relative mb-5 h-56 overflow-hidden rounded-[8px] border border-navy-700 sm:h-72"
              style={{ backgroundImage: `linear-gradient(135deg, hsl(${hue} 55% 16%), hsl(${hue + 18} 48% 28%) 55%, #0F1B2E)` }}
            >
              <span className="absolute -end-10 -top-14 h-44 w-44 rounded-full bg-gold-500/15 blur-2xl" aria-hidden />
              <span className="absolute inset-x-0 bottom-0 h-1 bg-gold-500" aria-hidden />
              <span className="absolute bottom-4 start-5 font-display text-[11px] font-bold uppercase tracking-[0.3em] text-white/60">
                {sport?.nameEn}
              </span>
              {article.breaking ? (
                <span className="absolute end-4 top-4 rounded-[3px] bg-live px-2.5 py-1 text-[11px] font-extrabold text-white">
                  خبر عاجل
                </span>
              ) : null}
            </div>

            <header className="mb-5 border-b border-line pb-4">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-bold">
                <span className="rounded-[3px] bg-gold-500/15 px-2 py-1 text-gold-600 dark:text-gold-400">
                  {article.category}
                </span>
                <span className="text-muted">{sport?.name}</span>
                {comp ? (
                  <Link href={`/competitions/${comp.slug}`} className="text-muted transition hover:text-gold-600 dark:hover:text-gold-400">
                    · {comp.name}
                  </Link>
                ) : null}
              </div>
              <h1 className="text-2xl font-extrabold leading-snug tracking-tight sm:text-3xl">
                {article.title}
              </h1>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">{article.excerpt}</p>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-muted">
                <span className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-navy-850 text-[11px] font-extrabold text-gold-400">
                    {article.author.slice(0, 1)}
                  </span>
                  <span>
                    <span className="block font-bold text-ink">{article.author}</span>
                    <span className="num block text-[10px]">
                      {dateAr(published.toISOString())} · {article.readMinutes} دقائق قراءة
                    </span>
                  </span>
                </span>
                <span className="num">{compact(article.views)} مشاهدة</span>
              </div>
            </header>

            <div className="space-y-4 text-[15px] leading-[1.9]">
              {article.body.map((para, i) => (
                <p key={i} className={i === 0 ? "font-semibold" : ""}>
                  {para}
                </p>
              ))}
            </div>

            {article.kind === "external" && article.source ? (
              <aside className="mt-6 card border-s-4 border-s-gold-500 p-4">
                <p className="flex items-center gap-2 text-[12px] font-extrabold">
                  <span aria-hidden>📌</span> المصدر الأصلي: {article.source.name}
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                  هذا الخبر ملخص تحريري أعدّه فريق نيمو سبورتس، ولم يُنسخ نصّه الأصلي. للنسخة
                  الكاملة انتقل إلى المصدر مباشرة.
                </p>
                <a
                  href={article.source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-3 inline-block rounded-[3px] bg-navy-850 px-3.5 py-2 text-[12px] font-bold text-white transition hover:bg-navy-700"
                >
                  اقرأ المقال الكامل على {article.source.name} ↗
                </a>
              </aside>
            ) : null}

            {(article.teams?.length ?? 0) > 0 ? (
              <section className="mt-6">
                <h2 className="eyebrow mb-2">مرتبط بـ</h2>
                <div className="flex flex-wrap gap-2">
                  {article.teams!.map((t) => (
                    <Link
                      key={t}
                      href={`/teams/${t}`}
                      className="flex items-center gap-2 rounded-[3px] border border-line px-2.5 py-1.5 text-[12px] font-bold transition hover:border-gold-500"
                    >
                      <Crest slug={t} size={20} />
                      {t}
                    </Link>
                  ))}
                  {article.players?.map((p) => (
                    <Link
                      key={p}
                      href={`/players/${p}`}
                      className="rounded-[3px] border border-line px-2.5 py-1.5 text-[12px] font-bold transition hover:border-gold-500"
                    >
                      {p}
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            <footer className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <span className="text-[12px] font-bold text-muted">مشاركة:</span>
              {["فيسبوك", "إكس", "واتساب", "نسخ الرابط"].map((s) => (
                <span
                  key={s}
                  className="cursor-pointer rounded-[3px] border border-line px-3 py-1.5 text-[11px] font-bold transition hover:border-gold-500 hover:text-gold-600 dark:hover:text-gold-400"
                >
                  {s}
                </span>
              ))}
            </footer>
          </div>

          <aside className="min-w-0 space-y-5">
            <div className="card overflow-hidden">
              <h2 className="border-b border-line bg-navy-850 px-3 py-2.5 text-[13px] font-extrabold text-white">
                أخبار ذات صلة
              </h2>
              <div className="p-3">
                {related.map((a) => (
                  <NewsCard key={a.slug} article={a} layout="row" />
                ))}
              </div>
            </div>

            <div className="card p-4">
              <p className="eyebrow mb-2">إعلان</p>
              <div className="grid h-[250px] place-items-center rounded-[4px] border border-dashed border-line bg-navy-850/[0.03] text-center text-[11px] text-muted dark:bg-white/[0.03]">
                موضع إعلاني 300×250
              </div>
            </div>
          </aside>
        </div>

        {related.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-3 border-b-2 border-line pb-2 text-[15px] font-extrabold">اقرأ أيضًا</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((a) => (
                <NewsCard key={a.slug} article={a} />
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </>
  );
}
