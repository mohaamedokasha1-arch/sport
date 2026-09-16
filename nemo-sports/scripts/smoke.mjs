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
  "/admin",
  "/admin/articles",
  "/admin/matches",
  "/admin/competitions",
  "/admin/broadcast",
  "/admin/users",
  "/admin/ads",
  "/admin/providers",
  "/admin/seo",
  "/sitemap.xml",
  "/robots.txt",
  "/icon.svg",
];

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

  const details = await detailRoutes();
  console.log(`  · testing ${details.length} detail pages from sitemap`);
  for (const p of details) await check(p);

  // API contracts
  const live = await (await fetch(`${BASE}/api/live`)).json();
  const liveIds = Object.keys(live);
  const liveOk =
    liveIds.length > 0 &&
    liveIds.every((id) => ["status", "clock", "homeScore", "awayScore", "events"].every((k) => k in live[id]));
  console.log(`  ${liveOk ? "✓" : "✗"} /api/live → ${liveIds.length} matches, shape ${liveOk ? "valid" : "INVALID"}`);
  if (!liveOk) failures++;

  const anyLive = liveIds.filter((id) => live[id].status === "LIVE");
  console.log(`  ${anyLive.length > 0 ? "✓" : "✗"} live engine → ${anyLive.length} matches currently LIVE`);
  if (anyLive.length === 0) failures++;

  const rail = await (await fetch(`${BASE}/api/live?scope=rail`)).json();
  const railOk = Array.isArray(rail.matches) && rail.matches.every((m) => m.compCode && m.state);
  console.log(`  ${railOk ? "✓" : "✗"} /api/live?scope=rail → ${rail.matches.length} items`);
  if (!railOk) failures++;

  const search = await (await fetch(`${BASE}/api/search?q=${encodeURIComponent("الأهلي")}`)).json();
  const searchOk = Array.isArray(search) && search.length > 0 && search[0].url.startsWith("/");
  console.log(`  ${searchOk ? "✓" : "✗"} /api/search (arabic) → ${search.length} hits`);
  if (!searchOk) failures++;

  const empty = await (await fetch(`${BASE}/api/search?q=x`)).json();
  const emptyOk = Array.isArray(empty) && empty.length === 0;
  console.log(`  ${emptyOk ? "✓" : "✗"} /api/search short query → empty array`);
  if (!emptyOk) failures++;

  // ── Sports Data Layer API (versioned from day one, §19.1) ─────────────
  const apiIndex = await (await fetch(`${BASE}/api/v1`)).json();
  const indexOk = apiIndex.version === "v1" && typeof apiIndex.endpoints === "object";
  console.log(`  ${indexOk ? "✓" : "✗"} /api/v1 → contract ${apiIndex.version}, ${Object.keys(apiIndex.endpoints ?? {}).length} endpoints`);
  if (!indexOk) failures++;

  const v1live = await (await fetch(`${BASE}/api/v1/live?sport=football`)).json();
  const v1liveOk =
    v1live.ok === true &&
    Array.isArray(v1live.data) &&
    v1live.data.length > 0 &&
    ["provider", "demo"].includes(v1live.meta.source) &&
    typeof v1live.meta.provider === "string" &&
    v1live.data.every((f) => typeof f.providerId === "string" && typeof f.scheduledAt === "string");
  console.log(
    `  ${v1liveOk ? "✓" : "✗"} /api/v1/live → ${v1live.data?.length ?? 0} fixtures from ${v1live.meta?.provider ?? "?"} (source=${v1live.meta?.source ?? "?"})`,
  );
  if (!v1liveOk) failures++;

  // no provider field may leak into a public payload (§2.2)
  const leaked = JSON.stringify(v1live).match(/"(x-apisports-key|api_token|authorization|apiKey|apiToken)"/i);
  console.log(`  ${leaked ? "✗" : "✓"} /api/v1/live → no credential material in payload`);
  if (leaked) failures++;

  const v1events = await (await fetch(`${BASE}/api/v1/matches?events=demo-1002`)).json();
  const eventsOk = v1events.ok === true && Array.isArray(v1events.data) && v1events.data.length > 0 && v1events.data.every((e) => typeof e.type === "string");
  console.log(`  ${eventsOk ? "✓" : "✗"} /api/v1/matches?events= → ${v1events.data?.length ?? 0} canonical events`);
  if (!eventsOk) failures++;

  const system = await (await fetch(`${BASE}/api/v1/system`)).json();
  const systemOk =
    system.ok === true &&
    Array.isArray(system.providers) &&
    system.providers.length > 0 &&
    Array.isArray(system.cache) &&
    system.cache.length === 2 &&
    typeof system.conflicts.open === "number";
  console.log(
    `  ${systemOk ? "✓" : "✗"} /api/v1/system → mode=${system.mode}, ${system.providers?.length ?? 0} provider(s), cache layers ${system.cache?.length ?? 0}`,
  );
  if (!systemOk) failures++;

  await check("/matches/this-match-does-not-exist", 404);
  await check("/teams/nope", 404);

  const home = await (await fetch(`${BASE}/`)).text();
  for (const token of ["مباشر الآن", "مباريات اليوم", "أخبار اليوم", "البطولات الرئيسية", 'dir="rtl"', "NEMO"]) {
    const has = home.includes(token);
    console.log(`  ${has ? "✓" : "✗"} home contains "${token}"`);
    if (!has) failures++;
  }

  /* ── durable infrastructure must be reported honestly (§13) ── */
  const infra = system.infrastructure;
  const infraOk =
    !!infra &&
    typeof infra.postgres?.ok === "boolean" &&
    typeof infra.redis?.ok === "boolean" &&
    ["postgres", "memory"].includes(infra.canonical) &&
    ["redis", "memory"].includes(infra.cache);
  console.log(
    `  ${infraOk ? "✓" : "✗"} /api/v1/system → infrastructure: canonical=${infra?.canonical}, cache=${infra?.cache}, pg=${infra?.postgres?.ok ? "up" : "down"}, redis=${infra?.redis?.ok ? "up" : "down"}`,
  );
  if (!infraOk) failures++;

  /* ── ingestion is token-gated: it spends paid quota (§Instruction 9) ── */
  const ingestRes = await fetch(`${BASE}/api/v1/ingest`, { method: "POST" });
  const ingest = await ingestRes.json();
  const ingestOk = process.env.NEMO_INGEST_TOKEN
    ? ingestRes.status !== 503
    : ingestRes.status === 503 && ingest.error?.code === "not_configured";
  console.log(`  ${ingestOk ? "✓" : "✗"} /api/v1/ingest → ${ingestRes.status} ${ingest.error?.code ?? ingest.reason ?? ""}`);
  if (!ingestOk) failures++;

  /* ── the frontend must never call a provider (§2.2) ── */
  const providerHosts = /api\.sportmonks\.com|api-sports\.io|api\.sportradar\.com|thesportsdb\.com/;
  const clientChunks = await listClientChunks();
  const leakedHost = clientChunks.find((c) => providerHosts.test(c.body));
  console.log(`  ${leakedHost ? "✗" : "✓"} client bundle → no provider hostname in ${clientChunks.length} shipped chunks`);
  if (leakedHost) failures++;

  /* ── demo mode must not be indexable (§Instruction 6) ── */
  const livePage = await (await fetch(`${BASE}/live`)).text();
  const noindex = /<meta name="robots" content="noindex/.test(livePage);
  const noindexOk = system.mode === "demo" ? noindex : true;
  console.log(`  ${noindexOk ? "✓" : "✗"} /live → robots ${noindex ? "noindex" : "indexable"} (mode=${system.mode})`);
  if (!noindexOk) failures++;

  /* ── the live page is fed by the SDL, and says which provider ── */
  const feedOk = livePage.includes("لوحة المزوّد الحيّة") && /المصدر:/.test(livePage);
  console.log(`  ${feedOk ? "✓" : "✗"} /live → provider panel rendered`);
  if (!feedOk) failures++;

  const adminPage = await (await fetch(`${BASE}/admin/providers`)).text();
  const adminOk = adminPage.includes("البنية التحتية للبيانات") && adminPage.includes("PostgreSQL");
  console.log(`  ${adminOk ? "✓" : "✗"} /admin/providers → infrastructure table rendered`);
  if (!adminOk) failures++;

  console.log(`\n${failures === 0 ? "✅ ALL GREEN" : `❌ ${failures} FAILURE(S)`} — ${ok.length + details.length} routes checked\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
