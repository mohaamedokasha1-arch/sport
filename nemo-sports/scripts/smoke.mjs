#!/usr/bin/env node
/**
 * NEMO Sports · smoke check
 * Boots through the real Next.js server and asserts that every shipped route
 * answers 200 (and that the two API contracts return the expected shape).
 *
 * Usage: BASE=http://127.0.0.1:3000 node scripts/smoke.mjs
 */

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";

const pages = [
  "/",
  "/matches",
  "/matches?sport=football",
  "/matches?sport=basketball&status=live",
  "/matches?date=tomorrow&view=list",
  "/matches?team=الأهلي",
  "/live",
  "/results",
  "/fixtures",
  "/competitions",
  "/teams",
  "/players",
  "/news",
  "/news?category=تحليل",
  "/news?sport=football",
  "/watch",
  "/standings",
  "/search",
  "/search?q=ahly",
  "/search?q=الأهلي",
  "/account",
  "/about",
  "/contact",
  "/faq",
  "/broadcast-rights",
  "/privacy",
  "/terms",
  "/copyright",
  "/sitemap.xml",
  "/robots.txt",
  "/icon.svg",
];

/**
 * The privileged namespaces, asserted separately because they must NOT answer
 * 200 to an anonymous request. They used to sit in `pages` above, so the smoke
 * check was actively verifying that the admin panel was publicly reachable.
 */
const adminRoutes = [
  "/admin",
  "/admin/articles",
  "/admin/news",
  "/admin/live-matches",
  "/admin/upcoming-matches",
  "/admin/matches",
  "/admin/competitions",
  "/admin/broadcast",
  "/admin/users",
  "/admin/ads",
  "/admin/providers",
  "/admin/seo",
];

/** Set this to exercise the authorized path as well as the denial path. */
const ADMIN_TOKEN = process.env.ADMIN_ACCESS_TOKEN ?? "";
const adminAuth = ADMIN_TOKEN
  ? { authorization: `Basic ${Buffer.from(`admin:${ADMIN_TOKEN}`).toString("base64")}` }
  : {};

const detailPrefixes = ["/matches", "/competitions", "/teams", "/players", "/news"];

let failures = 0;
const ok = [];

/** Read every JS chunk the browser is told to load, to prove no provider URL ships client-side. */
async function listClientChunks() {
  const home = await (await fetch(`${BASE}/`)).text();
  const srcs = [...new Set([...home.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]))];
  const out = [];
  for (const src of srcs) {
    try {
      out.push({ src, body: await (await fetch(`${BASE}${src}`)).text() });
    } catch {
      /* a chunk that fails to load is not a provider leak */
    }
  }
  return out;
}

async function check(path, expect = 200) {

  const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
  const pass = res.status === expect;
  if (!pass) {
    failures++;
    console.log(`  ✗ ${path} → ${res.status} (expected ${expect})`);
  } else {
    ok.push(path);
  }
  return res;
}

/** Pull real slugs out of the sitemap so we test actual detail pages. */
async function detailRoutes() {
  const res = await fetch(`${BASE}/sitemap.xml`);
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const routes = [];
  for (const prefix of detailPrefixes) {
    const match = urls
      .map((u) => new URL(u).pathname)
      .filter((u) => u.startsWith(`${prefix}/`))
      .slice(0, 8);
    routes.push(...match);
  }
  return routes;
}

async function main() {
  console.log(`\nNEMO Sports smoke check → ${BASE}\n`);

  for (const p of pages) await check(p);

  /* ── authorization on the privileged namespaces ─────────────────────────
     Anonymous requests must be refused. /admin answers 404 (not 401/403) so an
     unauthenticated visitor does not learn a panel exists at that path;
     /api/v1/system answers 401 so an operator with a wrong secret gets an
     actionable response. */
  let denied = 0;
  for (const p of [...adminRoutes, "/api/v1/system"]) {
    const res = await fetch(`${BASE}${p}`, { redirect: "manual" });
    const refused = res.status === 404 || res.status === 401 || res.status === 503;
    if (!refused) {
      failures++;
      console.log(`  ✗ ${p} → ${res.status} anonymously (expected 404/401/503 — this namespace must be guarded)`);
    } else denied++;
  }
  console.log(`  ${denied === adminRoutes.length + 1 ? "✓" : "✗"} ${denied}/${adminRoutes.length + 1} privileged routes refuse anonymous access`);

  if (ADMIN_TOKEN) {
    let allowed = 0;
    for (const p of [...adminRoutes, "/api/v1/system"]) {
      const res = await fetch(`${BASE}${p}`, { headers: adminAuth, redirect: "manual" });
      if (res.status !== 200) {
        failures++;
        console.log(`  ✗ ${p} → ${res.status} with ADMIN_ACCESS_TOKEN (expected 200)`);
      } else allowed++;
    }
    console.log(`  ${allowed === adminRoutes.length + 1 ? "✓" : "✗"} ${allowed}/${adminRoutes.length + 1} privileged routes admit the configured token`);

    // An authenticated admin response must never be cacheable by a shared/CDN
    // cache — /admin used to ship s-maxage=31536000.
    const cached = await fetch(`${BASE}/admin`, { headers: adminAuth });
    const cc = cached.headers.get("cache-control") ?? "";
    const noStore = /no-store/.test(cc);
    console.log(`  ${noStore ? "✓" : "✗"} /admin (authenticated) → cache-control "${cc}" is not shared-cacheable`);
    if (!noStore) failures++;
  } else {
    console.log("  · ADMIN_ACCESS_TOKEN not set — skipping the authorized-path checks");
  }

  const details = await detailRoutes();
  console.log(`  · testing ${details.length} detail pages from sitemap`);
  for (const p of details) await check(p);

  // API contracts.
  // Content mode: the demo dataset renders in development/preview only. In
  // production without real provider data every sports-data surface is
  // intentionally EMPTY (honest "unavailable" states, §Instruction 12), so
  // the demo-dependent assertions below run only when demo content is on.
  const homeHtml = await (await fetch(`${BASE}/`)).text();
  /* Three legitimate content modes:
     - real:      SDL provider data rendered (marker from the real-variant home)
     - demo:      demo dataset (development/preview only)
     - prod-empty: production without provider data → honest empty states    */
  const realMode = homeHtml.includes("نعرض بيانات المباريات التي أمكن استرجاعها والتحقق منها فقط");
  const emptyMode = homeHtml.includes("بيانات المباريات غير متاحة مؤقتًا");
  const demoOn = !realMode && !emptyMode;
  const modeName = realMode ? "REAL provider data" : demoOn ? "demo content visible (dev/demo)" : "production (no fabricated data)";
  console.log(`  · content mode → ${modeName}`);
  if (realMode) {
    const powered = homeHtml.includes("SportScore");
    console.log(`  ${powered ? "✓" : "✗"} home → SportScore attribution visible`);
    if (!powered) failures++;
  }

  const live = await (await fetch(`${BASE}/api/live`)).json();
  const liveIds = Object.keys(live);
  if (demoOn) {
    const liveOk =
      liveIds.length > 0 &&
      liveIds.every((id) => ["status", "clock", "homeScore", "awayScore", "events"].every((k) => k in live[id]));
    console.log(`  ${liveOk ? "✓" : "✗"} /api/live → ${liveIds.length} matches, shape ${liveOk ? "valid" : "INVALID"}`);
    if (!liveOk) failures++;

    const anyLive = liveIds.filter((id) => live[id].status === "LIVE");
    console.log(`  ${anyLive.length > 0 ? "✓" : "✗"} live engine → ${anyLive.length} matches currently LIVE`);
    if (anyLive.length === 0) failures++;
  } else {
    const emptyOk = liveIds.length === 0;
    console.log(`  ${emptyOk ? "✓" : "✗"} /api/live → ${liveIds.length} matches (production: must be empty, never fabricated)`);
    if (!emptyOk) failures++;
  }

  const rail = await (await fetch(`${BASE}/api/live?scope=rail`)).json();
  const railModes = ["live", "upcoming", "empty", "unavailable", "preview"];
  const railOk = Array.isArray(rail.matches) && railModes.includes(rail.mode) && rail.matches.every((m) => m.id && m.homeName && m.awayName && m.kickoff && typeof m.status === "string");
  console.log(`  ${railOk ? "✓" : "✗"} /api/live?scope=rail → ${rail.matches.length} items (${rail.mode ?? "invalid"})`);
  if (!railOk) failures++;

  const search = await (await fetch(`${BASE}/api/search?q=${encodeURIComponent("الأهلي")}`)).json();
  if (demoOn) {
    const searchOk = search.preview === true && Array.isArray(search.results) && search.results.length > 0 && search.results[0].url.startsWith("/");
    console.log(`  ${searchOk ? "✓" : "✗"} /api/search (arabic) → ${search.results?.length ?? 0} hits (preview=true)`);
    if (!searchOk) failures++;
  } else {
    const searchOk = search.preview === false && Array.isArray(search.results);
    console.log(`  ${searchOk ? "✓" : "✗"} /api/search (arabic) → ${search.results?.length ?? 0} hits (preview=false; demo news hidden)`);
    if (!searchOk) failures++;
  }

  const empty = await (await fetch(`${BASE}/api/search?q=x`)).json();
  const emptyOk = Array.isArray(empty.results) && empty.results.length === 0 && empty.total === 0;
  console.log(`  ${emptyOk ? "✓" : "✗"} /api/search short query → empty results`);
  if (!emptyOk) failures++;

  // ── Sports Data Layer API (versioned from day one, §19.1) ─────────────
  const apiIndex = await (await fetch(`${BASE}/api/v1`)).json();
  const indexOk = apiIndex.version === "v1" && typeof apiIndex.endpoints === "object";
  console.log(`  ${indexOk ? "✓" : "✗"} /api/v1 → contract ${apiIndex.version}, ${Object.keys(apiIndex.endpoints ?? {}).length} endpoints`);
  if (!indexOk) failures++;

  const v1live = await (await fetch(`${BASE}/api/v1/live?sport=football`)).json();
  /* Shape contract: every answer is typed — either canonical fixtures with
     provider metadata, or a typed failure with an empty list. An EMPTY board is
     a legitimate answer (nothing in play right now, or no live provider wired in
     production), so the count is only asserted for the demo dataset, which is
     the one source guaranteed to ship fixtures. */
  const v1liveShape =
    Array.isArray(v1live.data) &&
    (v1live.ok === true
      ? (demoOn ? ["provider", "demo"] : ["provider"]).includes(v1live.meta?.source) &&
        typeof v1live.meta?.provider === "string" &&
        v1live.data.every((f) => typeof f.providerId === "string" && typeof f.scheduledAt === "string")
      : v1live.ok === false
        ? typeof v1live.error?.code === "string" && v1live.data.length === 0
        : false);
  const v1liveOk = v1liveShape && (!demoOn || v1live.data.length > 0);
  console.log(
    `  ${v1liveOk ? "✓" : "✗"} /api/v1/live → ${v1live.data?.length ?? 0} fixtures from ${v1live.meta?.provider ?? v1live.error?.code ?? "?"} (source=${v1live.meta?.source ?? "none"})`,
  );
  if (!v1liveOk) failures++;

  // no provider field may leak into a public payload (§2.2)
  const leaked = JSON.stringify(v1live).match(/"(x-apisports-key|api_token|authorization|apiKey|apiToken)"/i);
  console.log(`  ${leaked ? "✗" : "✓"} /api/v1/live → no credential material in payload`);
  if (leaked) failures++;

  const v1fixtures = await (await fetch(`${BASE}/api/v1/matches?sport=football`)).json();
  const fixturesShape = Array.isArray(v1fixtures.data) && (
    v1fixtures.ok === true
      ? (demoOn ? ["provider", "demo"] : ["provider"]).includes(v1fixtures.meta?.source) &&
        v1fixtures.data.every((f) => typeof f.providerId === "string" && typeof f.scheduledAt === "string")
      : v1fixtures.ok === false && typeof v1fixtures.error?.code === "string" && v1fixtures.data.length === 0
  );
  const fixturesOk = fixturesShape && (!demoOn || v1fixtures.data.length > 0);
  console.log(`  ${fixturesOk ? "✓" : "✗"} /api/v1/matches → ${v1fixtures.data?.length ?? 0} fixtures (source=${v1fixtures.meta?.source ?? "none"})`);
  if (!fixturesOk) failures++;

  const v1events = await (await fetch(`${BASE}/api/v1/matches?events=demo-1002`)).json();
  const eventsOk = demoOn
    ? v1events.ok === true && v1events.meta?.source === "demo" && Array.isArray(v1events.data) && v1events.data.length > 0 && v1events.data.every((e) => typeof e.type === "string")
    : v1events.ok === false || (v1events.ok === true && v1events.meta?.source === "provider");
  console.log(`  ${eventsOk ? "✓" : "✗"} /api/v1/matches?events= → ${v1events.data?.length ?? 0} canonical events (source=${v1events.meta?.source ?? "none"})`);
  if (!eventsOk) failures++;

  /* ── Football-Data.org integration (server-side provider, honest failures) ──
     Every response is either canonical data (200) or the fixed
     "Data temporarily unavailable" message (503). There is no third shape:
     a successful payload never carries a provider field name, and a failed one
     never carries fabricated rows. */
  const fdStatusRes = await fetch(`${BASE}/api/v1/football-data/status`);
  const fdStatus = await fdStatusRes.json();
  const fdStatusOk =
    fdStatusRes.status === 200 &&
    fdStatus.ok === true &&
    typeof fdStatus.configured === "boolean" &&
    typeof fdStatus.registered === "boolean" &&
    typeof fdStatus.baseUrl === "string" &&
    fdStatus.baseUrl === "https://api.football-data.org/v4" &&
    !/"?(apiKey|api_key|token|x-auth-token|X-Auth-Token)"?\s*:/i.test(JSON.stringify(fdStatus));
  console.log(
    `  ${fdStatusOk ? "✓" : "✗"} /api/v1/football-data/status → configured=${fdStatus.configured}, registered=${fdStatus.registered}, budget ${fdStatus.rateLimit?.perMinute ?? "?"}/min, cache layers ${fdStatus.cache?.layers?.length ?? 0}`,
  );
  if (!fdStatusOk) failures++;

  for (const [label, path] of [
    ["standings", `/api/v1/football-data/standings?competition=PL`],
    ["matches", `/api/v1/football-data/matches?date=${new Date().toISOString().slice(0, 10)}`],
    ["scorers", `/api/v1/football-data/scorers?competition=PL`],
  ]) {
    const res = await fetch(`${BASE}${path}`);
    const body = await res.json().catch(() => ({}));
    const canonicalOnly = Array.isArray(body.data) && !/"playedGames"|"fullTime"|"utcDate"|"crest"/.test(JSON.stringify(body.data ?? []));
    const okShape =
      (res.status === 200 && body.ok === true && canonicalOnly) ||
      (res.status === 503 && body.ok === false && body.error?.message === "Data temporarily unavailable" && body.data.length === 0);
    console.log(
      `  ${okShape ? "✓" : "✗"} /api/v1/football-data/${label} → ${res.status} ${body.ok ? `${body.data?.length ?? 0} canonical rows` : body.error?.message ?? ""}`,
    );
    if (!okShape) failures++;
  }

  const badDate = await fetch(`${BASE}/api/v1/football-data/matches?date=17-09-2026`);
  console.log(`  ${badDate.status === 400 ? "✓" : "✗"} /api/v1/football-data/matches?date= (invalid) → ${badDate.status}`);
  if (badDate.status !== 400) failures++;

  // /api/v1/system is a guarded namespace now, so the smoke check has to
  // authenticate for it. Without a token these assertions are skipped rather
  // than failed — the denial itself was already asserted above.
  const systemRes = await fetch(`${BASE}/api/v1/system`, { headers: adminAuth });
  const system = await systemRes.json().catch(() => ({}));
  const systemReachable = systemRes.status === 200 && system.ok === true;
  if (ADMIN_TOKEN && !systemReachable) {
    failures++;
    console.log(`  ✗ /api/v1/system → ${systemRes.status} with ADMIN_ACCESS_TOKEN (expected 200)`);
  }
  const systemProvidersOk =
    Array.isArray(system.providers) &&
    (system.providers.length > 0 ||
      (system.mode === "demo" && Array.isArray(system.missingProviders) && system.missingProviders.length > 0));
  const systemOk =
    !systemReachable ||
    (systemProvidersOk &&
      Array.isArray(system.cache) &&
      system.cache.length === 2 &&
      typeof system.conflicts.open === "number");
  console.log(
    `  ${systemOk ? "✓" : "✗"} /api/v1/system → ${systemReachable ? `mode=${system.mode}, ${system.providers?.length ?? 0} provider(s), cache layers ${system.cache?.length ?? 0}` : "guarded (set ADMIN_ACCESS_TOKEN to inspect)"}`,
  );
  if (!systemOk) failures++;

  await check("/matches/this-match-does-not-exist", 404);
  await check("/teams/nope", 404);
  /* A 404 must never carry conflicting robots directives. Every 404 used to
     emit Next.js's built-in `noindex` *and* `index, follow` inherited from the
     root layout — two contradictory tags on one page. Next.js always emits its
     own not-found noindex, so the invariant that matters is that every
     directive on the page agrees, and that none of them says "index". */
  for (const p of ["/this-page-does-not-exist", "/teams/nope", "/news/nope"]) {
    const html = await (await fetch(`${BASE}${p}`)).text();
    const tags = [...html.matchAll(/<meta name="robots" content="([^"]*)"/g)].map((m) => m[1]);
    const saysIndex = tags.some((t) => /(?:^|[,\s])index(?:[,\s]|$)/.test(t));
    const allNoindex = tags.length > 0 && tags.every((t) => /noindex/.test(t));
    const good = allNoindex && !saysIndex;
    console.log(`  ${good ? "✓" : "✗"} ${p} → robots directives agree (${tags.join(" + ") || "none"})`);
    if (!good) failures++;
  }

  const home = await (await fetch(`${BASE}/`)).text();
  const homeTokens = realMode
    ? ["مباشر الآن", "مباريات اليوم", "نعرض بيانات المباريات التي أمكن استرجاعها والتحقق منها فقط", 'dir="rtl"', "NEMO"]
    : demoOn
      ? ["مباشر الآن", "المباريات القادمة", "بيانات توضيحية للتطوير فقط", "البطولات", 'dir="rtl"', "NEMO"]
      : ["نتائج ومواعيد المباريات", "بيانات المباريات غير متاحة مؤقتًا", 'dir="rtl"', "NEMO"];
  for (const token of homeTokens) {
    const has = home.includes(token);
    console.log(`  ${has ? "✓" : "✗"} home contains "${token}"`);
    if (!has) failures++;
  }

  /* ── durable infrastructure must be reported honestly (§13) ── */
  const infra = system.infrastructure;
  const infraOk =
    !systemReachable ||
    (!!infra &&
      typeof infra.postgres?.ok === "boolean" &&
      typeof infra.redis?.ok === "boolean" &&
      ["postgres", "memory"].includes(infra.canonical) &&
      ["redis", "memory"].includes(infra.cache));
  console.log(
    `  ${infraOk ? "✓" : "✗"} /api/v1/system → infrastructure: canonical=${infra?.canonical}, cache=${infra?.cache}, pg=${infra?.postgres?.ok ? "up" : "down"}, redis=${infra?.redis?.ok ? "up" : "down"}`,
  );
  if (!infraOk) failures++;

  /* ── ingestion is token-gated: it spends paid quota (§Instruction 9) ──
     503 not_configured when no secret is set at all; 401 unauthorized when a
     secret exists (e.g. CRON_SECRET for Vercel Cron) but the request carries
     none. Both are the honest refusals. */
  const ingestRes = await fetch(`${BASE}/api/v1/ingest`, { method: "POST" });
  const ingest = await ingestRes.json();
  const ingestOk = ingestRes.status === 503
    ? ingest.error?.code === "not_configured"
    : ingestRes.status === 401 && ingest.error?.code === "unauthorized";
  console.log(`  ${ingestOk ? "✓" : "✗"} /api/v1/ingest → ${ingestRes.status} ${ingest.error?.code ?? ingest.reason ?? ""}`);
  if (!ingestOk) failures++;

  /* ── news pipeline: public feed is typed, cron entry is gated ── */
  const newsRes = await fetch(`${BASE}/api/v1/news?limit=5`);
  const news = await newsRes.json().catch(() => ({}));
  const newsOk =
    newsRes.status === 200 &&
    news.ok === true &&
    Array.isArray(news.data) &&
    typeof news.meta?.total === "number" &&
    typeof news.meta?.stale === "boolean" &&
    news.data.every((a) => typeof a.title === "string" && typeof a.sourceUrl === "string" && typeof a.sourceName === "string");
  console.log(`  ${newsOk ? "✓" : "✗"} /api/v1/news → ${newsRes.status} ${news.meta?.total ?? 0} articles (stale=${news.meta?.stale})`);
  if (!newsOk) failures++;

  const newsCronRes = await fetch(`${BASE}/api/cron/fetch-news`);
  const newsCron = await newsCronRes.json().catch(() => ({}));
  const newsCronOk =
    newsCronRes.status === 503
      ? newsCron.error?.code === "not_configured"
      : newsCronRes.status === 401 && newsCron.error?.code === "unauthorized";
  console.log(`  ${newsCronOk ? "✓" : "✗"} /api/cron/fetch-news → ${newsCronRes.status} ${newsCron.error?.code ?? ""} (must refuse anonymous)`);
  if (!newsCronOk) failures++;

  /* Required provider badges appear only for active providers; a no-provider
     or demo deployment must not claim it is powered by a source it never uses. */
  const sportScoreBadge = home.includes("Powered by SportScore") && home.includes("https://sportscore.com/");
  const footballDataBadge = home.includes("Powered by Football-Data.org") && home.includes("https://www.football-data.org/");
  const anySportsProviderBadge = sportScoreBadge || footballDataBadge;
  const attributionOk = realMode ? anySportsProviderBadge : !anySportsProviderBadge;
  console.log(`  ${attributionOk ? "✓" : "✗"} footer → provider attribution ${realMode ? "present for live data" : "not claimed without a configured source"}`);
  if (!attributionOk) failures++;

  /* ── the frontend must never call a provider (§2.2) ── */
  const providerHosts = /api\.sportmonks\.com|api-sports\.io|api\.sportradar\.com|thesportsdb\.com|api\.football-data\.org/;
  const clientChunks = await listClientChunks();
  const leakedHost = clientChunks.find((c) => providerHosts.test(c.body));
  console.log(`  ${leakedHost ? "✗" : "✓"} client bundle → no provider hostname in ${clientChunks.length} shipped chunks`);
  if (leakedHost) failures++;

  /* ── indexability must follow data AVAILABILITY, not mere configuration ──
     This used to read `system.mode === "demo" ? noindex : true`, i.e. any
     non-demo mode passed unconditionally. Since SportScore is keyless and
     enabled by default, mode was always "live" — so the check asserted that a
     site of empty "Data temporarily unavailable" pages was correctly
     indexable. It now asserts the invariant that actually matters: the
     sitemap and the robots meta must agree (see dataServable() in
     lib/sdl-gateway.ts, which both surfaces now share). */
  const livePage = await (await fetch(`${BASE}/live`)).text();
  const noindex = /<meta name="robots" content="noindex/.test(livePage);

  /* The invariant that actually matters is CROSS-SURFACE CONSISTENCY: the
     sitemap and the robots meta must not disagree about whether this
     deployment is serving data. They did — the sitemap (dynamic) correctly
     withheld the data sections while prerendered pages kept shipping
     `index, follow`, because each computed availability its own way. */
  const sitemapXml = await (await fetch(`${BASE}/sitemap.xml`)).text();
  const sitemapUrls = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  const listsDataSections = sitemapUrls.includes("/live") || sitemapUrls.includes("/matches");

  const consistent = listsDataSections === !noindex;
  console.log(
    `  ${consistent ? "✓" : "✗"} indexability agrees across surfaces → robots ${noindex ? "noindex" : "indexable"}, sitemap ${listsDataSections ? "lists" : "withholds"} data sections (${sitemapUrls.length} urls, mode=${system.mode ?? "unknown"})`,
  );
  if (!consistent) failures++;

  /* Whichever way it resolves, an empty data page must not be offered to
     crawlers as indexable content. */
  if (!listsDataSections) {
    const emptyButIndexable = [];
    for (const p of ["/live", "/matches", "/standings", "/teams", "/players", "/news"]) {
      const html = await (await fetch(`${BASE}${p}`)).text();
      const isNoindex = /<meta name="robots" content="noindex/.test(html);
      const empty = html.includes("Data temporarily unavailable") || html.includes("غير متوفر");
      if (empty && !isNoindex) emptyButIndexable.push(p);
    }
    const good = emptyButIndexable.length === 0;
    console.log(`  ${good ? "✓" : "✗"} no empty data page is indexable${good ? "" : ` → ${emptyButIndexable.join(", ")}`}`);
    if (!good) failures++;
  }

  /* ── a contentless match page must never be a 200 with index,follow ──────
     /matches/[slug] accepts arbitrary provider slugs, so an unbounded space of
     "— ضد —" shells would otherwise be crawlable and indexable. */
  for (const slug of ["999999999", "1", "0"]) {
    const res = await fetch(`${BASE}/matches/${slug}`, { redirect: "manual" });
    const body = await res.text();
    const indexable = res.status === 200 && !/<meta name="robots" content="noindex/.test(body);
    // 200+indexable is the crawl trap; 500 is the unhandled-permanent-failure
    // bug. A stable 404 (or a 200 that is explicitly noindexed) is correct.
    const good = res.status === 404 || (res.status === 200 && !indexable);
    console.log(`  ${good ? "✓" : "✗"} /matches/${slug} → ${res.status}${indexable ? " (indexable empty shell — crawl trap)" : ""}`);
    if (!good) failures++;
  }

  /* ── unknown slugs on dynamic routes must not answer 500 ────────────────
     /players/[slug] rethrew on `no_provider_configured`, a condition no retry
     can change, so every unknown player slug was an HTTP 500. */
  for (const p of ["/players/nope-not-a-player", "/players/999999", "/teams/nope", "/competitions/nope", "/news/nope"]) {
    const res = await fetch(`${BASE}${p}`, { redirect: "manual" });
    const good = res.status === 404;
    console.log(`  ${good ? "✓" : "✗"} ${p} → ${res.status} (expected a stable 404, not 500)`);
    if (!good) failures++;
  }

  /* ── baseline security headers on the public site ── */
  const secRes = await fetch(`${BASE}/`);
  for (const [header, mustMatch] of [
    ["x-content-type-options", /nosniff/i],
    ["x-frame-options", /DENY|SAMEORIGIN/i],
    ["referrer-policy", /.+/],
    ["content-security-policy", /frame-ancestors\s+'none'/],
    ["permissions-policy", /.+/],
  ]) {
    const value = secRes.headers.get(header) ?? "";
    const good = mustMatch.test(value);
    console.log(`  ${good ? "✓" : "✗"} security header ${header}${good ? "" : ` missing (got "${value}")`}`);
    if (!good) failures++;
  }

  /* ── the live page is fed by the SDL, and says which provider ──
     Three legitimate shapes: provider rows (real data), demo rows (dev), or
     the honest "unavailable" state (production, provider down). */
  const feedOk =
    livePage.includes("مباشر الآن") &&
    (/المصدر:/.test(livePage) || livePage.includes("بيانات معاينة للتطوير فقط") || livePage.includes("البيانات المباشرة غير متاحة حاليًا") || livePage.includes("لا توجد مباريات مباشرة الآن"));
  console.log(`  ${feedOk ? "✓" : "✗"} /live → provider panel rendered`);
  if (!feedOk) failures++;

  /* ── the teams directory is derived from real league tables ──
     Same three legitimate shapes as /live: a real directory, a dev/demo
     directory, or the honest "unavailable" state. The second assertion is the
     one that matters — H7 was an *asymmetry* (detail pages worked while the
     list pages that link to them stayed empty), so if the standings surface is
     being served by a real provider, the directory derived from those same
     standings must not silently fall back to empty. */
  const teamsPage = await (await fetch(`${BASE}/teams`)).text();
  const teamsReal = teamsPage.includes("فريقًا من جداول ترتيب حقيقية");
  const teamsEmpty = teamsPage.includes("دليل الفرق غير متوفر حاليًا");
  const teamsShapeOk = teamsReal || teamsEmpty || /<h1[^>]*>الفرق<\/h1>/.test(teamsPage);
  console.log(`  ${teamsShapeOk ? "✓" : "✗"} /teams → ${teamsReal ? "real standings-derived directory" : teamsEmpty ? "honest unavailable state" : "directory rendered"}`);
  if (teamsShapeOk) ok.push("/teams (shape)"); else failures++;

  /* Discriminate a real data surface by the DataSourceNote marker (`المصدر:`),
   * NOT by the string "Football-Data.org": the site-wide footer carries the
   * licence attribution on every page, including /about, so matching on it made
   * this check assert "standings real" in every state and fail whenever the
   * provider was legitimately down. */
  const standingsPage = await (await fetch(`${BASE}/standings`)).text();
  const standingsReal = standingsPage.includes("المصدر:");
  if (standingsReal) {
    console.log(`  ${teamsReal ? "✓" : "✗"} standings real ⇒ teams directory real (no empty-list asymmetry)`);
    if (teamsReal) ok.push("/teams (parity with /standings)"); else failures++;
  }

  /* A real provider team id renders real data; the id comes from the directory
     itself so this passes against whatever competition set is configured. */
  const teamHref = teamsPage.match(/href="\/teams\/([0-9]+)"/);
  if (teamHref) {
    const teamPage = await (await fetch(`${BASE}/teams/${teamHref[1]}`)).text();
    const teamOk = teamPage.includes("بيانات حقيقية") && !teamPage.includes("internal server error");
    console.log(`  ${teamOk ? "✓" : "✗"} /teams/${teamHref[1]} → real provider team view`);
    if (teamOk) ok.push(`/teams/${teamHref[1]} (real view)`); else failures++;
  }

  // Guarded namespace — only assert the rendered panels when a token is set.
  if (ADMIN_TOKEN) {
    const adminPage = await (await fetch(`${BASE}/admin/providers`, { headers: adminAuth })).text();
    const adminOk = adminPage.includes("البنية التحتية للبيانات") && adminPage.includes("PostgreSQL");
    console.log(`  ${adminOk ? "✓" : "✗"} /admin/providers → infrastructure table rendered`);
    if (!adminOk) failures++;

    for (const [path, marker] of [
      ["/admin/live-matches", "لوحة المباريات الجارية"],
      ["/admin/upcoming-matches", "جدول المباريات القادمة"],
    ]) {
      const page = await (await fetch(`${BASE}${path}`, { headers: adminAuth })).text();
      const pageOk = page.includes(marker);
      console.log(`  ${pageOk ? "✓" : "✗"} ${path} → admin match board rendered`);
      if (!pageOk) failures++;
    }
  }

  console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`} — ${ok.length + details.length} routes checked\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
