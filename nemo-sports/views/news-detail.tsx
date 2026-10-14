import type { Metadata } from "next";
import { serializeJsonLd } from "@/lib/json-ld";
import Link from "@/components/i18n/Link";
import { notFound } from "next/navigation";
import Crest from "@/components/ui/Crest";
import NewsCard from "@/components/news/NewsCard";
import { articleBySlug, articles, relatedArticles } from "@/lib/data";
import { competitionBySlug, sportBySlug } from "@/lib/core-data";
import { compact } from "@/lib/format";
import { formatDate } from "@/lib/i18n/dates";
import { t } from "@/lib/i18n/translate";
import { categoryMeta } from "@/lib/news/categorize";
import { SITE_NAME, absoluteUrl, demoContentVisible } from "@/lib/site";
import { absoluteMediaUrl } from "@/lib/seo-discovery";
import { getManualNewsBySlug, listManualNews } from "@/lib/manual-news";
import { editorialInternalLinks, relatedEditorialNews } from "@/lib/news/editorial-links";
import { AdminNewsDetail } from "@/components/public/AdminPublished";
import { decodeSlug } from "@/lib/slug";
import type { Locale } from "@/lib/i18n/locales";

export type ViewProps = { params: Promise<{ slug: string }> };


/**
 * Bound the lifetime of an on-demand ISR entry.
 *
 * Without this, a page (or a 404) rendered while a provider was briefly
 * unreachable is cached with no expiry: an article would stay wrong until the
 * next deploy. A bounded revalidate lets a transient outage self-heal while
 * still serving from cache in the normal case.
 */
export const revalidate = 900;

export function generateStaticParams() {
  return demoContentVisible() ? articles.map((a) => ({ slug: a.slug })) : [];
}

async function articleMetadataBody({
  locale,
  params,
}: {
  locale: Locale;
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const a = demoContentVisible() ? articleBySlug(slug) : undefined;
  if (!a) return { title: t(locale, "nd.notFound"), robots: { index: false, follow: true } };
  return {
    title: a.title,
    description: a.excerpt,
    alternates: { canonical: `/news/${a.slug}` },
    robots: { index: false, follow: true },
    openGraph: { title: a.title, description: a.excerpt, type: "article" },
  };
}

async function ArticlePageBody({ locale, params }: { locale: Locale; params: Promise<{ slug: string }> }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const { slug } = await params;
  const article = demoContentVisible() ? articleBySlug(slug) : undefined;
  if (!article) notFound();

  const sport = sportBySlug(article.sport);
  const comp = article.competition ? competitionBySlug(article.competition) : undefined;
  const related = relatedArticles(article);
  const published = new Date(Date.now() - article.publishedAgoMin * 60000);
  const shareUrl = absoluteUrl(`/news/${article.slug}`);
  const encodedShareUrl = encodeURIComponent(shareUrl);
  const encodedShareTitle = encodeURIComponent(article.title);

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
    publisher: { "@type": "Organization", name: SITE_NAME, url: absoluteUrl("/") },
    mainEntityOfPage: absoluteUrl(`/news/${article.slug}`),
    articleSection: article.category,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(ld) }} />
      <article className="mx-auto max-w-[1280px] px-4 py-6">
        <p className="mb-4 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[11px] font-semibold text-muted">{tr("nd.demoNotice")}</p>
        <nav aria-label={tr("nd.breadcrumbAria")} className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">{tr("nd.home")}</Link>
          <span aria-hidden>/</span>
          <Link href="/news" className="hover:text-gold-600 dark:hover:text-gold-400">{tr("nd.news")}</Link>
          <span aria-hidden>/</span>
          <span className="font-semibold text-ink">{categoryMeta(article.category)[locale === "ar" ? "nameAr" : "nameEn"]}</span>
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
                {sport?.name}
              </span>
              {article.breaking ? (
                <span className="absolute end-4 top-4 rounded-[3px] bg-live px-2.5 py-1 text-[11px] font-extrabold text-white">
                  {tr("nd.breaking")}
                </span>
              ) : null}
            </div>

            <header className="mb-5 border-b border-line pb-4">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-bold">
                <span className="rounded-[3px] bg-gold-500/15 px-2 py-1 text-gold-600 dark:text-gold-400">
                  {categoryMeta(article.category)[locale === "ar" ? "nameAr" : "nameEn"]}
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
                      {formatDate(locale, published.toISOString())} · {article.readMinutes} {tr("nd.readMinutes")}
                    </span>
                  </span>
                </span>
                <span className="num">{tr("nd.views", { n: compact(article.views) })}</span>
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
              <div role="note" aria-label={tr("nd.originalSourceAria")} className="mt-6 card border-s-4 border-s-gold-500 p-4">
                <p className="flex items-center gap-2 text-[12px] font-extrabold">
                  <span aria-hidden>📌</span> {tr("nd.originalSource", { name: article.source.name })}
                </p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                  {tr("nd.editorialNote")}
                </p>
                <a
                  href={article.source.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-3 inline-block rounded-[3px] bg-navy-850 px-3.5 py-2 text-[12px] font-bold text-white transition hover:bg-navy-700"
                >
                  {tr("nd.readFull", { name: article.source.name })}
                </a>
              </div>
            ) : null}

            {(article.teams?.length ?? 0) > 0 ? (
              <section className="mt-6">
                <h2 className="eyebrow mb-2">{tr("nd.relatedTo")}</h2>
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

            <footer className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <span className="me-1 text-[12px] font-bold text-muted">{tr("nd.share")}</span>
              <a
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodedShareUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-[3px] border border-line px-3 py-2 text-[11px] font-bold transition hover:border-gold-500 hover:text-gold-600 dark:hover:text-gold-400 focus-ring"
              >{tr("nd.facebook")}</a>
              <a
                href={`https://twitter.com/intent/tweet?url=${encodedShareUrl}&text=${encodedShareTitle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-[3px] border border-line px-3 py-2 text-[11px] font-bold transition hover:border-gold-500 hover:text-gold-600 dark:hover:text-gold-400 focus-ring"
              >{tr("nd.x")}</a>
              <a
                href={`https://wa.me/?text=${encodedShareTitle}%20${encodedShareUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-[3px] border border-line px-3 py-2 text-[11px] font-bold transition hover:border-gold-500 hover:text-gold-600 dark:hover:text-gold-400 focus-ring"
              >{tr("nd.whatsapp")}</a>
            </footer>
          </div>

          <section aria-label={tr("nd.relatedAria")} className="min-w-0 space-y-5">
            <div className="card overflow-hidden">
              <h2 className="border-b border-line bg-navy-850 px-3 py-2.5 text-[13px] font-extrabold text-white">
                {tr("nd.relatedNews")}
              </h2>
              <div className="p-3">
                {related.map((a) => (
                  <NewsCard key={a.slug} article={a} layout="row" />
                ))}
              </div>
            </div>

            <div className="card p-4">
              <p className="eyebrow mb-2">{tr("nd.adEyebrow")}</p>
              <div className="grid h-[250px] place-items-center rounded-[4px] border border-dashed border-line bg-navy-850/[0.03] text-center text-[11px] text-muted dark:bg-white/[0.03]">
                {tr("nd.adSlot")}
              </div>
            </div>
          </section>
        </div>

        {related.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-3 border-b-2 border-line pb-2 text-[15px] font-extrabold">{tr("nd.readAlso")}</h2>
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

export async function generateMetadata(locale: Locale, { params }: ViewProps): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const manual = await getManualNewsBySlug(slug);
  if (manual && manual.status === "published") {
    const description = manual.description || manual.title;
    // A preview card is only as good as its picture: the image must be an
    // absolute URL a crawler can fetch (lib/seo-discovery.ts), so a relative or
    // malformed value is dropped instead of emitting a broken card.
    const image = absoluteMediaUrl(manual.imageUrl);
    // Indexability is NOT decided here: the page inherits the deployment-wide
    // decision (lib/sdl-gateway → app/layout.tsx), which already carries the
    // Discover preview directives. Only the preview metadata is added.
    return {
      title: manual.title,
      description,
      alternates: { canonical: `/news/${slug}` },
      openGraph: {
        title: manual.title,
        description,
        type: "article",
        publishedTime: manual.publishedAt,
        modifiedTime: manual.updatedAt,
        locale: "ar_AR",
        ...(image ? { images: [{ url: image, alt: manual.title }] } : {}),
      },
      twitter: {
        card: "summary_large_image",
        title: manual.title,
        description,
        ...(image ? { images: [image] } : {}),
      },
    };
  }
  return articleMetadataBody({ locale, params });
}

export default async function ArticlePage({ locale, params }: ViewProps & { locale: Locale }) {
  const { slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const manual = await getManualNewsBySlug(slug);
  if (manual && manual.status === "published") {
    // Internal links are resolved against real destinations only
    // (lib/news/editorial-links.ts): hub & spoke without a single 404.
    const [links, all] = await Promise.all([
      editorialInternalLinks({ relatedCompetition: manual.relatedCompetition, relatedTeam: manual.relatedTeam }),
      listManualNews({ publishedOnly: true, limit: 100 }),
    ]);
    return <AdminNewsDetail article={manual} links={links} related={relatedEditorialNews(manual, all, 5)} locale={locale} />;
  }
  return <ArticlePageBody locale={locale} params={params} />;
}
