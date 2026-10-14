/**
 * NEMO Sports · Google Discover eligibility + editorial (newsroom) SEO surfaces
 * ─────────────────────────────────────────────────────────────────────────────
 * The master SEO plan asks for two things the code has to guarantee, because no
 * amount of writing fixes them afterwards:
 *
 *   1. EVERY indexable page carries Google's preview directives
 *      (`max-image-preview:large`, `max-snippet:-1`, `max-video-preview:-1`).
 *      Without them Discover will not render a large card, whatever the
 *      article says. They must ride on the SAME index decision the data
 *      pipeline makes — a noindex page must never be "upgraded" by them.
 *   2. An editorial article (/news/<slug>, written in /admin/news/manual) ships
 *      a complete news page: NewsArticle + BreadcrumbList structured data,
 *      absolute preview image, real datePublished/dateModified, and internal
 *      links that only point at destinations that exist.
 *
 * Both are asserted here without a browser: the pure policy modules are called
 * directly, the two page/metadata surfaces are imported and invoked, and the
 * two admin/UI wirings are guarded at source level (same style as the existing
 * /admin/seo and layout guards in scripts/verify-seo-surfaces.test.ts).
 *
 * Run: npm run discover:test
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// No provider traffic, and a writable in-process store (memory is allowed
// outside production — lib/db/store-policy.ts) so the article fixtures below
// never depend on network or database.
process.env.NEMO_SPORTSCORE_ENABLED = "0";
(process.env as Record<string, string | undefined>).NODE_ENV = "test";

const ROOT = process.cwd();

test("① preview directives ride on the index decision (never upgrade a noindex page)", async () => {
  const { robotsWithDiscovery, DISCOVER_MAX_IMAGE_PREVIEW, RICH_MAX_SNIPPET, RICH_MAX_VIDEO_PREVIEW } = await import(
    "@/lib/seo-discovery"
  );

  const open = robotsWithDiscovery(true, true);
  assert.equal(open.index, true);
  assert.equal(open.follow, true);
  assert.equal(open.googleBot.index, true, "the index decision is copied, not assumed");
  assert.equal(open.googleBot.follow, true);
  assert.equal(open.googleBot["max-image-preview"], DISCOVER_MAX_IMAGE_PREVIEW);
  assert.equal(open.googleBot["max-image-preview"], "large", "Discover requires a large image preview");
  assert.equal(open.googleBot["max-snippet"], RICH_MAX_SNIPPET);
  assert.equal(open.googleBot["max-video-preview"], RICH_MAX_VIDEO_PREVIEW);

  // The rule that matters most: a data-less deployment stays hidden.
  const closed = robotsWithDiscovery(false, false);
  assert.equal(closed.index, false);
  assert.equal(closed.follow, false);
  assert.equal(closed.googleBot.index, false, "preview directives must not turn a noindex page indexable");
  assert.equal(closed.googleBot.follow, false);
});

test("② the root layout attaches them to the pipeline's decision", () => {
  const layout = readFileSync(join(ROOT, "lib/i18n/root-metadata.ts"), "utf8");
  assert.match(layout, /robotsWithDiscovery\(robots\.index, robots\.follow\)/, "the layout must compose, not replace, the robots decision");
  assert.ok(!/"max-image-preview"/.test(layout), "the directives live in lib/seo-discovery.ts — one definition only");
});

test("③ a preview image is absolute or it is dropped", async () => {
  const { absoluteMediaUrl } = await import("@/lib/seo-discovery");
  const { SITE_URL } = await import("@/lib/site");

  assert.equal(absoluteMediaUrl("https://cdn.example.com/a.jpg"), "https://cdn.example.com/a.jpg");
  assert.equal(absoluteMediaUrl("/media/ahly.jpg"), `${SITE_URL}/media/ahly.jpg`);
  assert.equal(absoluteMediaUrl("  "), null);
  assert.equal(absoluteMediaUrl(null), null);
  // A relative path is not something a crawler resolves; these are the shapes
  // that would silently produce a card with no picture.
  assert.equal(absoluteMediaUrl("media/ahly.jpg"), null);
  assert.equal(absoluteMediaUrl("//cdn.example.com/a.jpg"), null);
  assert.equal(absoluteMediaUrl("data:image/png;base64,AAAA"), null);
  assert.equal(absoluteMediaUrl("javascript:alert(1)"), null);
});

test("④ the editorial length windows are the ones the plan specifies", async () => {
  const { TITLE_WINDOW, DESCRIPTION_WINDOW, titleVerdict, descriptionVerdict, lengthHintAr } = await import(
    "@/lib/seo-discovery"
  );

  assert.deepEqual(TITLE_WINDOW, { min: 50, max: 60 });
  assert.deepEqual(DESCRIPTION_WINDOW, { min: 120, max: 160 });

  const title55 = "مباراة الأهلي والزمالك اليوم — البث المباشر والنتيجة الآن";
  assert.equal(titleVerdict(title55), "ok", `${title55.length} characters must be accepted`);
  assert.equal(titleVerdict("مباراة الأهلي"), "short");
  assert.equal(titleVerdict("م".repeat(61)), "long");
  assert.equal(titleVerdict("   "), "empty");
  // Whitespace is not part of the headline Google truncates.
  assert.equal(titleVerdict(`  ${title55}  `), "ok");

  assert.equal(descriptionVerdict("ت".repeat(140)), "ok");
  assert.equal(descriptionVerdict("ت".repeat(119)), "short");
  assert.equal(descriptionVerdict("ت".repeat(161)), "long");

  assert.match(lengthHintAr("title", title55), /طول مثالي/);
  assert.match(lengthHintAr("title", "قصير جدًا"), /50–60/);
  assert.match(lengthHintAr("description", "ط".repeat(200)), /120–160/);
});

test("⑤ the admin form measures what the test measures", () => {
  const page = readFileSync(join(ROOT, "app/(ar)/admin/news/manual/page.tsx"), "utf8");
  assert.match(page, /<SeoTextField kind="title" name="title"/, "the headline field carries the live counter");
  assert.match(page, /<SeoTextField kind="description" name="description"/, "and so does the meta description");
  assert.match(page, /from "@\/components\/admin\/SeoTextField"/);
  // The window must not be duplicated in the component: if it drifts, the
  // editor is coached towards a length Google truncates.
  const component = readFileSync(join(ROOT, "components/admin/SeoTextField.tsx"), "utf8");
  assert.match(component, /from "@\/lib\/seo-discovery"/, "the hint reads the same windows the tests assert");
  assert.ok(!/min:\s*\d|max:\s*\d/.test(component), "the window is imported, never redefined in the UI component");
  // The form still submits the same field names the server action reads.
  for (const name of ["title", "description", "relatedTeam", "relatedCompetition"]) {
    assert.match(page, new RegExp(`name[=:]\\s*"${name}"`), `the ${name} field must still post`);
  }
});

test("⑥ every hub link points at a route that exists on disk", async () => {
  const { EDITORIAL_HUB_LINKS } = await import("@/lib/news/editorial-links");
  const hrefs = EDITORIAL_HUB_LINKS.map((link) => link.href);
  assert.ok(hrefs.length >= 3, "an article is never a dead end");
  assert.equal(new Set(hrefs).size, hrefs.length, "no duplicate hub link");
  // Routes live in route groups: `app/(ar)/…` for the Arabic tree and
  // `app/(en)/en/…` for the English one. A hub link must resolve in BOTH, so an
  // article never links onward to a page that only exists in one language.
  for (const href of hrefs) {
    const relative = href.replace(/^\//, "");
    const arabic = join(ROOT, "app", "(ar)", relative, "page.tsx");
    const english = join(ROOT, "app", "(en)", "en", relative, "page.tsx");
    assert.ok(existsSync(arabic), `hub link ${href} has no Arabic route (would be a 404): ${arabic}`);
    assert.ok(existsSync(english), `hub link ${href} has no English route (would be a 404 in /en): ${english}`);
  }
});

test("⑦ a competition link resolves the Arabic name — and stays silent when ambiguous", async () => {
  const { competitionLink, editorialInternalLinks } = await import("@/lib/news/editorial-links");

  assert.equal(competitionLink("الدوري المصري")?.href, "/competitions/egyptian-league");
  assert.equal(competitionLink("egyptian-league")?.href, "/competitions/egyptian-league");
  assert.equal(competitionLink("الدوري المصري الممتاز")?.href, "/competitions/egyptian-league");
  assert.equal(competitionLink("دوري أبطال أوروبا")?.href, "/competitions/champions-league");
  assert.equal(competitionLink("بطولة لا وجود لها"), null, "an unknown label links nowhere");
  assert.equal(competitionLink(""), null);

  // «الدوري» names more than one competition → no link rather than the wrong one.
  assert.equal(competitionLink("الدوري"), null, "an ambiguous label must not be guessed");

  const linked = await editorialInternalLinks({ relatedCompetition: "الدوري المصري", relatedTeam: "" });
  assert.equal(linked[0]?.href, "/competitions/egyptian-league", "the resolved entity comes first");
  assert.equal(new Set(linked.map((l) => l.href)).size, linked.length, "no duplicated destinations");

  const bare = await editorialInternalLinks({});
  assert.deepEqual(
    bare.map((l) => l.href),
    ["/matches", "/results", "/competitions", "/news"],
    "an article with unresolved entities still links onward",
  );
});

test("⑧ 'اقرأ أيضًا' prefers the same section and never repeats the article", async () => {
  const { relatedEditorialNews } = await import("@/lib/news/editorial-links");
  const base = {
    id: "n0",
    slug: "main",
    title: "الخبر الرئيسي",
    titleEn: "",
    imageUrl: "",
    description: "",
    content: "",
    sourceName: "مصدر",
    sourceUrl: "https://example.com",
    publishedAt: "2026-10-14T10:00:00.000Z",
    category: "الدوري المصري",
    relatedTeam: "",
    relatedCompetition: "",
    status: "published" as const,
    createdBy: "tester",
    createdAt: "2026-10-14T10:00:00.000Z",
    updatedAt: "2026-10-14T10:00:00.000Z",
  };
  const mk = (slug: string, category: string, status: "published" | "draft" = "published") => ({
    ...base,
    id: slug,
    slug,
    category,
    status,
  });

  const related = relatedEditorialNews(base, [
    base,
    mk("draft-one", "الدوري المصري", "draft"),
    mk("other-latest", "انتقالات"),
    mk("same-section", "الدوري المصري"),
    mk("hidden-one", "الدوري المصري", "draft"),
  ]);
  assert.deepEqual(related.map((n) => n.slug), ["same-section", "other-latest"], "same section first, unpublished never");
  assert.ok(!related.some((n) => n.slug === base.slug), "the article never links to itself");
  assert.equal(relatedEditorialNews(base, [base, mk("a", "x"), mk("b", "x"), mk("c", "x")], 2).length, 2, "the limit is honoured");
});

test("⑨ NewsArticle + BreadcrumbList are complete and XSS-proof", async () => {
  const { editorialNewsArticleLd, editorialBreadcrumbLd, editorialStructuredData } = await import(
    "@/lib/news/editorial-seo"
  );
  const { SITE_URL } = await import("@/lib/site");

  const article = {
    id: "n1",
    slug: "ahly-zamalek-result",
    title: "الأهلي يسحق الزمالك 4-0 في الكلاسيكو — ملخص الأهداف",
    titleEn: "Al Ahly 4-0 Zamalek",
    imageUrl: "/media/ahly-zamalek.jpg",
    description: "الفريق الأحمر يحسم الكلاسيكو برباعية في الجولة 15 من الدوري المصري.",
    content: "فقرة أولى.\n\nفقرة ثانية.",
    sourceName: "نيمو سبورتس",
    sourceUrl: "https://example.com/report",
    publishedAt: "2026-10-14T18:00:00.000Z",
    category: "الدوري المصري",
    relatedTeam: "الأهلي",
    relatedCompetition: "الدوري المصري",
    status: "published" as const,
    createdBy: "editor",
    createdAt: "2026-10-14T18:00:00.000Z",
    updatedAt: "2026-10-14T19:30:00.000Z",
  };

  const ld = editorialNewsArticleLd(article) as Record<string, unknown>;
  assert.equal(ld["@type"], "NewsArticle");
  assert.equal(ld.headline, article.title);
  assert.equal(ld.inLanguage, "ar");
  assert.equal(ld.articleSection, "الدوري المصري");
  assert.equal(ld.datePublished, article.publishedAt);
  assert.equal(ld.dateModified, article.updatedAt, "an edited story reports its real edit time");
  assert.deepEqual(ld.image, [`${SITE_URL}/media/ahly-zamalek.jpg`], "the image handed to crawlers is absolute");
  assert.equal((ld.mainEntityOfPage as { "@id": string })["@id"], `${SITE_URL}/news/${article.slug}`);
  assert.equal((ld.publisher as { name: string }).name, "NEMO Sports");
  assert.ok((ld.publisher as { logo?: unknown }).logo, "the publisher declares a logo");
  assert.equal((ld.citation as { url: string }).url, article.sourceUrl, "the source is attributed as a citation");
  assert.equal(ld.alternativeHeadline, article.titleEn);

  // Missing data is omitted, never invented.
  const bare = editorialNewsArticleLd({ ...article, imageUrl: "", titleEn: "", sourceName: "", sourceUrl: "" });
  assert.ok(!("image" in bare), "no image field when there is no image");
  assert.ok(!("alternativeHeadline" in bare));
  assert.ok(!("citation" in bare));

  const crumbs = editorialBreadcrumbLd(article) as { itemListElement: { position: number; item: string }[] };
  assert.deepEqual(crumbs.itemListElement.map((c) => c.position), [1, 2, 3]);
  assert.equal(crumbs.itemListElement[1]?.item, `${SITE_URL}/news`);
  assert.equal(crumbs.itemListElement[2]?.item, `${SITE_URL}/news/${article.slug}`);

  // Stored copy is data, never markup: it cannot close the script tag it lives in.
  const hostile = editorialStructuredData({ ...article, title: 'خبر </script><img src=x onerror=alert(1)>' });
  assert.equal(hostile.length, 2);
  for (const json of hostile) {
    assert.ok(!json.includes("</script"), "a headline cannot break out of its script tag");
    assert.ok(json.includes("\\u003c"), "escaping is applied to the stored text");
    assert.doesNotThrow(() => JSON.parse(json), "each graph is valid JSON");
  }
});

test("⑩ the published article renders as a complete news page (real route, real metadata)", async () => {
  const [{ createManualNews, deleteManualNews }, { default: ArticlePage, generateMetadata }, { SITE_URL }] =
    await Promise.all([
      import("@/lib/manual-news"),
      import("@/views/news-detail"),
      import("@/lib/site"),
    ]);

  // The admin store accepts http(s) image URLs only (lib/manual-news.ts
  // → cleanUrl), so this is what an editor can actually save.
  const imageUrl = "https://cdn.example.com/media/classico.jpg";
  const created = await createManualNews({
    title: "مباراة الأهلي والزمالك اليوم — البث المباشر والنتيجة",
    imageUrl,
    description: "تابع مباراة الأهلي والزمالك مباشرة اليوم مع النتيجة الحية وملخص الأهداف لحظة بلحظة على نيمو سبورتس.",
    content: "يفتتح الأهلي والزمالك مواجهة الكلاسيكو.\n\nالموعد السادسة مساءً بتوقيت القاهرة.",
    sourceName: "نيمو سبورتس",
    sourceUrl: "https://example.com/live",
    category: "الدوري المصري",
    relatedCompetition: "الدوري المصري",
    relatedTeam: "الأهلي",
    status: "published",
  }, "tester");
  assert.equal(created.ok, true, created.ok ? "" : created.error);
  if (!created.ok) return;
  const slug = created.article.slug;

  try {
    const meta = await generateMetadata("ar", { params: Promise.resolve({ slug }) });
    assert.equal(meta.title, created.article.title);
    assert.equal((meta.alternates as { canonical?: string })?.canonical, `/news/${slug}`);
    assert.equal(meta.robots, undefined, "indexability stays the deployment-wide decision (the layout's), not this page's");
    // `openGraph` is a union in the Metadata type (article | website | …).
    const og = meta.openGraph as { type?: string; publishedTime?: string; images?: unknown };
    assert.equal(og.type, "article");
    const images = (Array.isArray(og.images) ? og.images : [og.images]) as { url: string }[];
    assert.equal(images[0]?.url, imageUrl, "the preview image reaches the card");
    assert.ok(String(images[0]?.url).startsWith("https://"), "and is absolute");
    assert.equal(og.publishedTime, created.article.publishedAt);
    assert.equal((meta.twitter as { card?: string })?.card, "summary_large_image");

    // The route itself renders (async server component). Rendering it to HTML
    // here is what proves the crawler actually receives the structured data and
    // the resolved internal links — not merely that the module exports them.
    const page = await ArticlePage({ locale: "ar", params: Promise.resolve({ slug }) });
    assert.ok(page, "the article route renders");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const html = renderToStaticMarkup(page as never);
    assert.match(html, /"@type":"NewsArticle"/, "the article ships NewsArticle structured data");
    assert.match(html, /"@type":"BreadcrumbList"/, "and a breadcrumb trail");
    assert.match(html, /href="\/competitions\/egyptian-league"/, "the Arabic competition label became a real internal link");
    assert.match(html, /href="\/matches"/, "the hub links are rendered");
    assert.match(html, /<time dateTime="[^"]+"/, "the publish date is machine-readable");
    assert.ok(html.includes(`alt="${created.article.title}"`), "the hero image carries its headline as alt text");
    const source = readFileSync(join(ROOT, "views/news-detail.tsx"), "utf8");
    assert.match(source, /editorialInternalLinks\(/, "internal links are resolved before rendering");
    assert.match(source, /relatedEditorialNews\(/, "the 'اقرأ أيضًا' block is built from real articles");
    assert.match(source, /<AdminNewsDetail[^>]*links=\{links\}[^>]*related=\{/, "the detail view receives both blocks");

    // The sitemap lists it as fast-moving news, with the real edit time.
    const { default: sitemap } = await import("@/app/sitemap");
    const entry = (await sitemap()).find((item) => item.url === `${SITE_URL}/news/${slug}`);
    assert.ok(entry, "a published article is in the sitemap");
    assert.equal(entry.changeFrequency, "daily");
    assert.equal(entry.priority, 0.8);
    assert.ok(entry.lastModified, "crawlers get a lastModified date");
  } finally {
    await deleteManualNews(created.article.id);
  }
});
