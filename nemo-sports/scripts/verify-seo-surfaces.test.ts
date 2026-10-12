/**
 * NEMO Sports · indexability surfaces (SEO without touching the brand).
 * ──────────────────────────────────────────────────────────────────────
 * Covers the rules the audit report promised and that a page-level review
 * cannot see:
 *
 *   · a competition URL is indexable exactly while its data exists — a healthy
 *     provider that answers nothing for ONE registered competition must not
 *     publish an indexable page of two "unavailable" notices;
 *   · the sitemap never advertises a match page the site cannot render
 *     (placeholder identities — see lib/match-identity.ts);
 *   · robots.txt keeps private areas out and points at the sitemap on the
 *     canonical host;
 *   · every absolute URL the site hands to a crawler is built from SITE_URL,
 *     so a canonical never differs from the sitemap's host by an encoding or a
 *     scheme accident.
 *
 * Run: npm run seo:test
 */
import assert from "node:assert/strict";
import { test } from "node:test";

test("competition metadata is indexable only while that competition has data", async () => {
  // Production semantics: no demo fixtures, provider chain only.
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  process.env.NEXT_PUBLIC_DEMO_CONTENT = "0";
  const [{ generateMetadata }, { competitionByPath }, { footballStandings, footballMatches }, { SITE_URL }] =
    await Promise.all([
      import("@/app/competitions/[slug]/page"),
      import("@/lib/competition-catalog"),
      import("@/lib/football-data"),
      import("@/lib/site"),
    ]);
  const competition = competitionByPath("egyptian-league");
  assert.ok(competition, "the Egyptian league is a registered competition with a public page");
  const id = competition!.slug ?? competition!.code;
  const [table, matches] = await Promise.all([footballStandings(id), footballMatches({ competitionId: id })]);
  const hasData =
    (table.ok && (table.data?.length ?? 0) > 0) || (matches.ok && (matches.data?.length ?? 0) > 0);

  const meta = await generateMetadata!({ params: Promise.resolve({ slug: "egyptian-league" }) });
  const robots = (meta.robots ?? {}) as { index?: boolean };
  assert.equal(
    robots.index === false,
    !hasData,
    hasData ? "real data must stay indexable" : "an empty competition page must be noindex",
  );
  assert.equal((meta.alternates as { canonical?: string })?.canonical, `/competitions/${competition!.canonicalSlug}`);
  const title = typeof meta.title === "string" ? meta.title : "";
  assert.ok(title.includes("|"), `the title carries a site suffix: ${title}`);
  assert.ok(!/تجريبي|demo/i.test(title), "no demo wording reaches a public title");
  assert.ok(SITE_URL.startsWith("https://"), "the canonical host is https");
});

test("the sitemap never advertises a match page the site cannot render", async () => {
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  const [{ default: sitemapDefault }, { SITE_URL }] = await Promise.all([
    import("@/app/sitemap"),
    import("@/lib/site"),
  ]);
  const entries = await sitemapDefault();
  const urls = entries.map((e) => e.url);
  // Provider fixtures whose names never arrived (team-4wyrn4h9jwyq86p …) used
  // to be published here as crawl traps.
  assert.equal(
    urls.filter((u) => /\/matches\/(team|club|player|home|away)-[a-z0-9]{6,}(-vs-|$)/.test(u)).length,
    0,
    `placeholder identities leaked into the sitemap: ${urls.filter((u) => /team-[a-z0-9]{6,}/.test(u)).join(", ")}`,
  );
  // Unresolved bracket slots («1st Place Team», «R32P27») are real provider rows
  // but not matches yet — they must not be advertised to crawlers.
  assert.equal(
    urls.filter((u) => /\/matches\/(\d{1,2}-(st|nd|rd|th)-place-team|r\d{1,3}p\d{1,3})(-vs-|$)/.test(u)).length,
    0,
    "bracket slots leaked into the sitemap",
  );
  // Duplicate canonical host / double-encoding accidents.
  assert.equal(urls.filter((u) => /%25|\/\/.+\/\//.test(u.replace(/^https?:\/\//, ""))).length, 0);
  // Every entry is absolute and on the canonical origin — never a relative
  // path, never localhost leaking from a preview build's SITE_URL mismatch.
  for (const url of urls) {
    assert.ok(url === SITE_URL || url.startsWith(`${SITE_URL}/`), `sitemap url is not on the canonical origin: ${url}`);
    assert.ok(new URL(url).protocol === "https:" || !url.includes("vercel.app"), `https for the deployed host: ${url}`);
  }
  assert.ok(urls.length > 0, "the sitemap is never empty output");
});

test("robots.txt protects the private areas and names the canonical sitemap", async () => {
  const robotsDefault = (await import("@/app/robots")).default;
  const { SITE_URL } = await import("@/lib/site");
  const rules = robotsDefault();
  const rule = Array.isArray(rules.rules) ? rules.rules[0]! : rules.rules;
  const rawDisallow = rule.disallow ?? [];
  const disallow: string[] = (Array.isArray(rawDisallow) ? rawDisallow : [rawDisallow]).map(String);
  for (const path of ["/admin", "/account", "/api"]) {
    assert.ok(disallow.some((entry) => entry.startsWith(path)), `${path} must stay out of the index: ${JSON.stringify(disallow)}`);
  }
  // Public pages are deliberately NOT hidden: their noindex meta must stay
  // reachable, or an index can never be cleaned up (see app/robots.ts).
  assert.equal(rule.allow, "/", "a blanket Allow / is intentional here");
  const sitemapLine = Array.isArray(rules.sitemap) ? rules.sitemap[0] : rules.sitemap;
  assert.equal(sitemapLine, `${SITE_URL}/sitemap.xml`, "the sitemap lives on the host that serves robots.txt");
  assert.equal(rules.host, SITE_URL);
  assert.ok(SITE_URL.startsWith("https://"), "the canonical origin is https");
});

test("③ saved settings drive the public metadata (not just the admin panel)", async () => {
  // The store refuses to accept writes into process memory in a production
  // build (that is the point of persistOrThrow), so this cycle runs in test
  // mode where the memory store is legitimately allowed.
  (process.env as Record<string, string | undefined>).NODE_ENV = "test";
  const { updateSiteSettings, getSiteSettings, getSiteSettingsCached, publicBaseMetadata } =
    await import("@/lib/site-settings");
  const before = await getSiteSettings();
  const probe = "وصف تجريبي للتحقق من أن الإعدادات المحفوظة تصل إلى الصفحات العامة";
  const saved = await updateSiteSettings({ seo: { metaDescription: probe, keywords: "اختبار, SEO, نيمو" } }, "test");
  assert.equal(saved.ok, true, "the settings store accepted the write");
  if (!saved.ok) return;

  const fresh = await getSiteSettings();
  assert.equal(fresh.seo.metaDescription, probe, "the write is readable back");
  assert.equal((await getSiteSettingsCached()).seo.metaDescription, probe, "the metadata memo is invalidated by the write");
  const meta = publicBaseMetadata(fresh);
  assert.equal(meta.description, probe, "the composed public metadata uses the saved description");
  assert.deepEqual(meta.keywords, ["اختبار", "SEO", "نيمو"], "keywords are split for the meta tag");
  const title = meta.title as { default?: string } | undefined;
  assert.ok(title?.default?.includes(fresh.siteNameAr), "the brand in the title is the saved one");
  // Other sections survive a partial SEO save (deep merge, not overwrite).
  assert.equal(fresh.news.autoPublish, before.news.autoPublish);
  assert.equal(fresh.timezone, before.timezone);

  // Restore, so a local run never leaves the probe string behind.
  await updateSiteSettings({ seo: { metaDescription: before.seo.metaDescription, keywords: before.seo.keywords } }, "test");
});

test("④ /admin/seo has working controls and no invented operations data", async () => {
  // Source-level guards: this is about what the page ships, which a runtime
  // test cannot assert without a browser. (Same style as verify-admin.ts.)
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../app/admin/seo/page.tsx", import.meta.url), "utf8");
  assert.match(page, /"use server"/, "the save control must be a real server action");
  assert.match(page, /updateSiteSettings\(/, "and it must write through the existing settings store");
  assert.match(page, /<Btn type="submit">حفظ<\/Btn>/, "a Btn defaults to type=button — that is how the old one did nothing");
  assert.match(page, /revalidatePath\("\/", "layout"\)/, "public pages must be revalidated when metadata changes");
  assert.match(page, /from "@\/app\/robots"/, "robots is rendered from the real generator, not a copied string");
  assert.match(page, /from "@\/app\/sitemap"/, "and the sitemap count from the live generator");

  for (const fake of ["99.97%", "Uptime (30 يوم)", "آخر نسخة احتياطية", "متوسط استجابة API", "إعادة بناء Sitemap", "اسحب صورة أو اضغط للرفع", "1.9s"]) {
    assert.ok(!page.includes(fake), `fabricated or non-functional UI returned: ${fake}`);
  }
});

test("⑤ the root layout reads settings instead of repeating them", async () => {
  const { readFileSync } = await import("node:fs");
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /publicBaseMetadata\(settings\)/, "metadata must come from lib/site-settings");
  assert.ok(!layout.includes(`description:\n    "مواعيد ونتائج`), "no hardcoded description may come back");
  assert.ok(!/keywords: \[/.test(layout), "no hardcoded keyword list may come back");
  assert.match(layout, /siteBranding\(settings\)/, "the Organization/WebSite JSON-LD uses the same brand");
});

test("the legacy /match/{slug} path answers 308 (permanent), not 307", async () => {
  const { default: LegacyPage } = await import("@/app/match/[slug]/page");
  let thrown: unknown = null;
  try {
    await LegacyPage({ params: Promise.resolve({ slug: "flamengo-vs-santos" }) });
  } catch (error) {
    thrown = error;
  }
  const digest = (thrown as { digest?: string } | null)?.digest ?? "";
  assert.ok(digest.startsWith("NEXT_REDIRECT;"), `expected a redirect, got: ${String(thrown)}`);
  assert.ok(digest.includes("/matches/flamengo-vs-santos"), `redirect target: ${digest}`);
  assert.ok(digest.endsWith(";308;") || digest.includes(";308"), `status must be 308 (permanent): ${digest}`);
});

test("the brand appears once in a static page title (the layout adds it)", async () => {
  const { metadata } = await import("@/app/about/page");
  const title = typeof metadata.title === "string" ? metadata.title : "";
  assert.ok(title.length > 0, "the about page has its own title");
  assert.ok(!title.includes("نيمو سبورتس"), `the layout template adds the brand; the page title must not repeat it: ${title}`);
  assert.equal((metadata.alternates as { canonical?: string })?.canonical, "/about");
});

/* ── static, always-listed pages must not inherit a data-dependent robots ── */

test("always-listed static pages declare index,follow explicitly (2026-10-12 audit)", async () => {
  // app/sitemap.ts lists these unconditionally. Without an explicit robots they inherited
  // the root layout's `noindex` whenever no provider data was servable — a contradiction.
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const root = join(process.cwd());
  const files = [
    "app/about/page.tsx",
    "app/contact/page.tsx",
    "app/faq/page.tsx",
    "app/broadcast-rights/page.tsx",
    "components/legal/LegalShell.tsx", // used by privacy, terms, copyright
  ];
  for (const file of files) {
    const src = readFileSync(join(root, file), "utf8");
    assert.match(src, /robots:\s*\{\s*index:\s*true,\s*follow:\s*true\s*\}/, `${file} must declare robots index,follow`);
  }
  for (const file of ["app/privacy/page.tsx", "app/terms/page.tsx", "app/copyright/page.tsx"]) {
    const src = readFileSync(join(root, file), "utf8");
    assert.match(src, /legalMetadata\(/, `${file} must use legalMetadata (which sets robots)`);
  }
});
