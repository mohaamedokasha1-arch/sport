/**
 * NEMO Sports · Adsterra integration (placement, policy, safety).
 * ─────────────────────────────────────────────────────────────────────────
 * The ad codes are the operator's revenue and, unlike a page, a wrong ad
 * integration fails silently: nothing renders, or worse — a tag that calls
 * document.write() after load replaces the whole document and the site goes
 * white. These checks pin the parts a browser would otherwise be the only
 * witness of:
 *
 *   ① the account codes shipped in lib/ads.ts are byte-for-byte the ones the
 *      operator pasted from the Adsterra dashboard;
 *   ② the banner document (`/ad-frame`) carries exactly one `atOptions` built
 *      from those constants — the key exists once in the repository;
 *   ③ the CSP allows the Adsterra hosts (and only while ads are enabled),
 *      keeps every reader page `frame-ancestors 'none'`, and relaxes that pair
 *      to `'self'` / SAMEORIGIN for the embedded banner route alone;
 *   ④ the match page mounts the two 300×250 placements above and below the
 *      live-stream block, each with a reserved box (no layout shift);
 *   ⑤ the page-level tags (Social Bar, Popunder) load after load + idle, once
 *      per document, never on /admin, and never with document.write unguarded.
 *
 * Run: npm run ads:test
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/**
 * The modules are imported inside each test: `tsx --test` compiles this file to
 * CJS, where a top-level `await import()` is not available — the same pattern the
 * neighbouring verify scripts use.
 */
const loadAds = () => import("@/lib/ads");
const loadCsp = () => import("@/lib/security-csp");
const loadSmartlink = () => import("@/components/ads/useSmartlink");

/* ── ① the codes are the operator's ────────────────────────────────────── */

test("① the Adsterra account codes are exactly the ones supplied", async () => {
  const { ADSTERRA_BANNER, ADSTERRA_BANNER_INVOKE_URL, ADSTERRA_POPUNDER_URL, ADSTERRA_SMARTLINK_URL, ADSTERRA_SOCIAL_BAR_URL } = await loadAds();

  assert.equal(ADSTERRA_BANNER.key, "d7e3e208e423e33ed9dd4297709d102a");
  assert.equal(ADSTERRA_BANNER.format, "iframe");
  assert.equal(ADSTERRA_BANNER.width, 300);
  assert.equal(ADSTERRA_BANNER.height, 250);
  assert.equal(
    ADSTERRA_BANNER_INVOKE_URL,
    "https://www.highrevenueformat.com/d7e3e208e423e33ed9dd4297709d102a/invoke.js",
  );
  assert.equal(
    ADSTERRA_SOCIAL_BAR_URL,
    "https://pl31820082.profitableratecpmnetwork.com/16/cb/ec/16cbeca9d360e0f7e35b94c803572b23.js",
  );
  assert.equal(
    ADSTERRA_POPUNDER_URL,
    "https://furydonkeypharmacy.com/ef/1c/8a/ef1c8a99e819306ee5d861acb0544c45.js",
  );
  assert.equal(ADSTERRA_SMARTLINK_URL, "https://furydonkeypharmacy.com/ispf2u0nr9?key=ab1a65e313a5c0034294ac768d3878cc");
});

test("① the codes live in exactly one module — no page copies them", async () => {
  const { ADSTERRA_BANNER } = await loadAds();

  const files = [
    "components/layout/RootShell.tsx",
    "views/match-detail.tsx",
    "components/match/MatchStreamPlayer.tsx",
    "components/match/MatchLive.tsx",
    "components/ads/AdScripts.tsx",
    "components/ads/AdsterraBanner.tsx",
    "components/ads/useSmartlink.ts",
  ];
  for (const file of files) {
    const source = read(file);
    for (const code of [ADSTERRA_BANNER.key, "profitableratecpmnetwork.com", "highrevenueformat.com", "furydonkeypharmacy.com"]) {
      assert.ok(!source.includes(code), `${file} must import the code from @/lib/ads instead of hardcoding ${code}`);
    }
  }
});

/* ── ② the banner document ─────────────────────────────────────────────── */

test("② the banner document is the snippet in its native, synchronous form", async () => {
  const { ADSTERRA_BANNER, ADSTERRA_BANNER_INVOKE_URL, adFrameDocument } = await loadAds();

  const html = adFrameDocument();
  const options = JSON.stringify({
    key: ADSTERRA_BANNER.key,
    format: "iframe",
    height: 250,
    width: 300,
    params: {},
  });
  assert.ok(html.includes(`<script>atOptions = ${options};</script>`), "atOptions must be the supplied options object");
  assert.ok(html.includes(`<script src="${ADSTERRA_BANNER_INVOKE_URL}"></script>`), "the invoke.js tag must be parser-inserted");
  assert.ok(html.indexOf("atOptions") < html.indexOf("invoke.js"), "the options must be defined before invoke.js runs");
  assert.ok(html.includes("width:300px;height:250px"), "the frame is exactly the ad's box — no scrollbars, no growth");
  assert.ok(html.includes("noindex"), "an ad document is never indexable");
  assert.equal((html.match(/<script/g) ?? []).length, 2, "exactly the two tags the operator supplied — nothing else");
});

test("② the frame URL names its placement, and no two placements share a URL", async () => {
  const { AD_FRAME_PATH } = await loadCsp();
  const { adFrameSrc, isBannerSlot } = await loadAds();

  assert.ok(isBannerSlot("match-above-stream"));
  assert.ok(isBannerSlot("match-below-stream"));
  assert.ok(!isBannerSlot("match-sidebar"), "an unknown slot must not become an ad");
  const a = adFrameSrc("match-above-stream");
  const b = adFrameSrc("match-below-stream");
  assert.ok(a.startsWith(`${AD_FRAME_PATH}?slot=match-above-stream`), a);
  assert.notEqual(a, b, "a shared URL means a shared cache entry and one impression for two boxes");
  assert.notEqual(adFrameSrc("match-above-stream"), adFrameSrc("match-above-stream"), "each mount re-fetches");
});

/* ── ③ the policy ──────────────────────────────────────────────────────── */

test("③ the CSP allows the ad hosts and drops them in an ad-free build", async () => {
  const { AD_SCRIPT_HOSTS } = await loadAds();
  const { contentSecurityPolicy } = await loadCsp();

  const withAds = contentSecurityPolicy(false);
  for (const host of AD_SCRIPT_HOSTS) {
    assert.ok(withAds.includes(host), `script-src/connect-src must list ${host}`);
  }
  assert.match(withAds, /script-src 'self' 'unsafe-inline' https:\/\/highrevenueformat\.com/);
  assert.match(withAds, /connect-src 'self' https:\/\/highrevenueformat\.com/);
  assert.match(withAds, /frame-src 'self' https:/, "the banner frame and live players both need frames");
  assert.match(withAds, /frame-ancestors 'none'/, "reader pages are never embeddable");

  process.env.NEXT_PUBLIC_ADS_ENABLED = "0";
  const withoutAds = contentSecurityPolicy(false);
  assert.ok(!withoutAds.includes("profitableratecpmnetwork.com"), "NEXT_PUBLIC_ADS_ENABLED=0 must shrink the policy too");
  assert.ok(!withoutAds.includes("furydonkeypharmacy.com"), "the Anti-Adblock Popunder host must drop out of the policy too");
  assert.ok(!withoutAds.includes("highrevenueformat.com"));
  delete process.env.NEXT_PUBLIC_ADS_ENABLED;
});

test("③ only the banner route is embeddable, and only by us", async () => {
  const { AD_FRAME_PATH, adFrameSecurityHeaders } = await loadCsp();

  assert.equal(AD_FRAME_PATH, "/ad-frame");
  const headers = adFrameSecurityHeaders(false);
  assert.match(headers["Content-Security-Policy"]!, /frame-ancestors 'self'/);
  assert.ok(!headers["Content-Security-Policy"]!.includes("frame-ancestors 'none'"));
  assert.equal(headers["X-Frame-Options"], "SAMEORIGIN");
  assert.equal(headers["X-Robots-Tag"], "noindex, nofollow");
  assert.match(headers["Cache-Control"]!, /no-store/);

  const config = read("next.config.ts");
  const globalRule = config.indexOf('source: "/:path*"');
  const frameRule = config.indexOf("source: AD_FRAME_PATH");
  assert.ok(globalRule > -1 && frameRule > globalRule, "the override must be matched after the site-wide rule (later wins)");

  const route = read("app/ad-frame/route.ts");
  assert.match(route, /adFrameDocument\(\)/, "the route renders the same document the test asserts");
  assert.match(route, /adFrameSecurityHeaders\(/, "and carries the same policy the config sets");
  assert.match(read("app/robots.ts"), /"\/ad-frame"/, "an ad document is never crawled");
});

/* ── ④ the match page ──────────────────────────────────────────────────── */

test("④ the match page frames the live-stream block with two 300×250 placements", async () => {

  const page = read("views/match-detail.tsx");
  const above = page.indexOf('slot="match-above-stream"');
  const below = page.indexOf('slot="match-below-stream"');
  const stream = page.indexOf("<MatchStreamPlayer");
  assert.ok(above > -1 && below > -1, "both placements must be mounted");
  assert.ok(above < stream && stream < below, "the order must be: banner → live stream → banner");

  const banner = read("components/ads/AdsterraBanner.tsx");
  assert.match(banner, /style=\{\{ width, height \}\}/, "the box is reserved before the ad loads (no CLS)");
  assert.match(banner, /new IntersectionObserver/, "the ad document is only fetched near the viewport");
  assert.match(banner, /src=\{adFrameSrc\(slot\)\}/, "the frame src comes from the shared helper");
  const sandbox = /sandbox="([^"]*)"/.exec(banner)?.[1] ?? "";
  assert.ok(sandbox.includes("allow-scripts") && sandbox.includes("allow-same-origin"), "the network's tag still runs");
  assert.ok(sandbox.includes("allow-popups"), "ad clicks must be able to open their landing page");
  assert.ok(!sandbox.includes("allow-top-navigation"), "a creative must never navigate the reader's tab");
  // The disclosure label is localised now, so the rule is asserted in two
  // halves: the component must render the shared label, and the Arabic
  // dictionary must still say "إعلان" — so an Arabic reader still sees the
  // placement marked as advertising.
  assert.match(banner, /\{tr\("ads\.label"\)\}/, "every placement stays visibly marked as advertising");
  const { default: ar } = await import("@/lib/i18n/messages/ar");
  assert.equal(ar["ads.label"], "إعلان", "and the Arabic disclosure still reads «إعلان»");
  const { default: en } = await import("@/lib/i18n/messages/en");
  assert.ok(en["ads.label"].length > 0, "the English disclosure is not a placeholder");
  assert.match(banner, /slotLabel/, "the frame title is localised too");
});

/* ── ⑤ the page-level tags ─────────────────────────────────────────────── */

test("⑤ Social Bar and Popunder load after load+idle, exactly once, never on /admin", async () => {

  const scripts = read("components/ads/AdScripts.tsx");
  assert.match(scripts, /isAdFreePath\(pathname\)/, "/admin and /api never carry ad tags");
  assert.match(scripts, /addEventListener\("load", start/, "never on the critical path");
  assert.match(scripts, /whenIdle\(/, "and only when the browser is idle");
  assert.match(scripts, /guardAgainstDocumentWriteWipe\(\)/, "a post-load document.write() must not blank the site");
  assert.match(scripts, /injectAdScriptOnce\(/, "one injection per document");

  const ads = read("lib/ads.ts");
  assert.match(ads, /if \(injectedTags\.has\(id\) \|\| document\.getElementById\(id\)\) return null;/, "double-mount guard");
  assert.match(ads, /if \(document\.readyState !== "complete"\) \{[\s\S]*?nativeWrite\(\.\.\.markup\);[\s\S]*?return;/, "writes during parsing stay untouched");
  assert.match(ads, /creating any <script>|replacement\.setAttribute|appendMarkupPreservingScripts\(markup\.join\(""\)\)/);

  const layout = read("components/layout/RootShell.tsx");
  assert.match(layout, /<AdScripts \/>/, "the root template mounts the tags once");
  assert.equal((layout.match(/<AdScripts \/>/g) ?? []).length, 1, "and only once");
});

test("④ the demo branch of the match page carries the same two placements", () => {
  // /matches/[slug] renders through components/match/MatchLive.tsx while the
  // offline demo catalogue is the data source (development/preview), so the
  // pair must exist there too — around the player, and only when a source is
  // registered (otherwise there is no watch action to frame).
  const live = read("components/match/MatchLive.tsx");
  const above = live.indexOf('{stream ? <AdsterraBanner slot="match-above-stream"');
  const below = live.indexOf('{stream ? <AdsterraBanner slot="match-below-stream"');
  const player = live.indexOf("<MatchStreamPlayer");
  assert.ok(above > -1 && below > -1, "the demo branch must mount both placements");
  assert.ok(above < player && player < below, "banner → البث المباشر → banner, same order as the provider branch");
});

test("⑤ the Smartlink rides on watch intents, capped and never hijacking them", async () => {
  const { consumeSmartlinkAllowance } = await loadSmartlink();
  const { isAdFreePath } = await loadAds();

  const hook = read("components/ads/useSmartlink.ts");
  assert.ok(!/\.preventDefault\(/.test(hook), "the reader's watch action must never be cancelled");
  assert.match(hook, /window\.open\(ADSTERRA_SMARTLINK_URL, "_blank", "noopener,noreferrer"\)/);

  const player = read("components/match/MatchStreamPlayer.tsx");
  assert.equal((player.match(/onClick=\{watchClick\}/g) ?? []).length, 2, "both stream links (error panel + footer)");
  assert.match(read("components/match/MatchLive.tsx"), /onClick=\{watchClick\}/, "and the broadcaster CTA");

  // The cap itself, without a browser: a fake session store.
  const store = new Map<string, string>();
  const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  assert.equal(consumeSmartlinkAllowance(fake, 1), true, "the first watch click is monetised");
  assert.equal(consumeSmartlinkAllowance(fake, 1), false, "the second is not — one extra tab per session, not per click");
  assert.equal(consumeSmartlinkAllowance(null, 1), true, "a storage-less browser gets the in-memory cap");
  assert.equal(consumeSmartlinkAllowance(null, 1), false);
  assert.equal(consumeSmartlinkAllowance(fake, 0), false, "0 disables the Smartlink outright");
  assert.equal(isAdFreePath("/admin/ads"), true);
  assert.equal(isAdFreePath("/matches/foo"), false);
});
