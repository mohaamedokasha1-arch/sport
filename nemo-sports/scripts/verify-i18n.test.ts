/**
 * NEMO Sports · i18n routing & SEO contract
 * ─────────────────────────────────────────────────────────────────────────────
 * The invariants the bilingual build depends on, asserted against the real
 * modules rather than a description of them:
 *
 *   · an English page canonicalises to its OWN /en URL — never to the Arabic
 *     page it was translated from (that would tell Google the English page is a
 *     duplicate and keep it out of the index);
 *   · an Arabic canonical is byte-identical to what the site emitted before
 *     English existed;
 *   · hreflang is emitted only where a real /en route exists, with x-default
 *     pointing at Arabic, and never on a noindex page;
 *   · EN_ROUTE_ROOTS and the tree under app/(en)/en/ agree exactly, so the
 *     switcher can never link to a route that does not exist;
 *   · the sitemap lists an /en counterpart for every Arabic entry that has one,
 *     with no duplicates.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";

import { EN_ROUTE_ROOTS } from "@/lib/i18n/paths";
import { localeAlternates } from "@/lib/i18n/metadata";
import { EN_PREFIX } from "@/lib/i18n/locales";
import { SITE_URL } from "@/lib/site";
import sitemap from "@/app/sitemap";

import * as home from "@/views/home";
import * as matches from "@/views/matches";
import * as teams from "@/views/teams";
import * as news from "@/views/news";
import * as competitions from "@/views/competitions";
import * as standings from "@/views/standings";
import * as live from "@/views/live";
import * as results from "@/views/results";
import * as fixtures from "@/views/fixtures";
import * as watch from "@/views/watch";
import * as about from "@/views/about";
import * as contact from "@/views/contact";
import * as faq from "@/views/faq";
import * as learn from "@/views/learn";
import * as broadcastRights from "@/views/broadcast-rights";
import * as privacy from "@/views/privacy";
import * as terms from "@/views/terms";
import * as copyrightView from "@/views/copyright";
// noindex utility pages: correct canonical, deliberately no hreflang.
import * as scout from "@/views/scout";
import * as search from "@/views/search";
import * as sports from "@/views/sports";
import * as myDay from "@/views/my-day";
import * as account from "@/views/account";

type Gen = { generateMetadata: (locale: "ar" | "en", props?: never) => Metadata };

const INDEXABLE: Record<string, Gen> = {
  "/": home as never, "/matches": matches as never, "/teams": teams as never,
  "/news": news as never, "/competitions": competitions as never, "/standings": standings as never,
  "/live": live as never, "/results": results as never, "/fixtures": fixtures as never,
  "/watch": watch as never, "/about": about as never, "/contact": contact as never,
  "/faq": faq as never, "/learn": learn as never, "/broadcast-rights": broadcastRights as never,
  "/privacy": privacy as never, "/terms": terms as never, "/copyright": copyrightView as never,
};
const NOINDEX: Record<string, Gen> = {
  "/scout": scout as never, "/search": search as never, "/sports": sports as never,
  "/my-day": myDay as never, "/account": account as never,
};

const canon = (mod: Gen, locale: "ar" | "en") =>
  (mod.generateMetadata(locale).alternates ?? {}).canonical as string;
const langs = (mod: Gen, locale: "ar" | "en") =>
  (mod.generateMetadata(locale).alternates ?? {}).languages as Record<string, string> | undefined;

test("every English page canonicalises to its own /en URL", () => {
  for (const [path, mod] of Object.entries({ ...INDEXABLE, ...NOINDEX })) {
    const en = canon(mod, "en");
    const expected = EN_PREFIX + (path === "/" ? "" : path);
    assert.equal(en, expected, `${path}: English canonical must be its own URL, got ${en}`);
  }
});

test("Arabic canonicals are unchanged by the English build", () => {
  for (const [path, mod] of Object.entries({ ...INDEXABLE, ...NOINDEX })) {
    assert.equal(canon(mod, "ar"), path, `${path}: the published Arabic canonical moved`);
  }
});

test("indexable pages carry ar / en / x-default hreflang, absolute and reciprocal", () => {
  for (const [path, mod] of Object.entries(INDEXABLE)) {
    const l = langs(mod, "en");
    assert.ok(l, `${path}: indexable page must advertise hreflang`);
    assert.equal(l!.ar, `${SITE_URL}${path}`, `${path}: ar hreflang`);
    assert.equal(l!.en, `${SITE_URL}${EN_PREFIX}${path === "/" ? "" : path}`, `${path}: en hreflang`);
    assert.equal(l!["x-default"], l!.ar, `${path}: x-default must point at Arabic, the real default`);
    // Arabic and English must describe the same cluster, or Google drops both.
    assert.deepEqual(langs(mod, "ar"), l, `${path}: hreflang differs between the two languages`);
  }
});

test("noindex utility pages get a correct canonical but no hreflang", () => {
  for (const [path, mod] of Object.entries(NOINDEX)) {
    assert.equal(canon(mod, "en"), EN_PREFIX + path, `${path}: English canonical`);
    assert.equal(langs(mod, "en"), undefined, `${path}: a noindex page must not advertise a language cluster`);
  }
});

test("localeAlternates never points hreflang at a route with no English page", () => {
  for (const path of ["/admin", "/api/search", "/ad-frame", "/icon.svg"]) {
    const a = localeAlternates("en", path);
    assert.equal(a.languages, undefined, `${path} has no English route and must not claim one`);
  }
});

test("EN_ROUTE_ROOTS and the app/(en)/en tree list exactly the same routes", () => {
  const root = "app/(en)/en";
  assert.ok(existsSync(root), "the English route tree exists");
  const onDisk = new Set<string>([""]);
  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const seg = `${prefix}/${entry.name}`;
      onDisk.add(seg.replace(/^\//, "").split("/")[0] ?? "");
      walk(join(dir, entry.name), seg);
    }
  };
  walk(root, "");
  const declared = new Set(EN_ROUTE_ROOTS);
  for (const route of onDisk) {
    assert.ok(declared.has(route), `app/(en)/en/${route} exists but is missing from EN_ROUTE_ROOTS — the switcher would fall back to the homepage`);
  }
  for (const route of declared) {
    if (route === "") continue;
    assert.ok(onDisk.has(route), `EN_ROUTE_ROOTS lists "${route}" but app/(en)/en/${route} does not exist — hreflang would point at a 404`);
  }
});

test("the sitemap lists an /en counterpart for every Arabic entry that has one", async () => {
  const list = await sitemap();
  const path = (url: string) => url.replace(/^https?:\/\/[^/]+/, "");
  const isEn = (url: string) => new RegExp(`^${EN_PREFIX}(/|$)`).test(path(url));
  const en = list.filter((e) => isEn(e.url));
  const ar = list.filter((e) => !isEn(e.url));
  assert.ok(list.length > 0, "the sitemap is not empty");

  const urls = list.map((e) => e.url);
  assert.equal(new Set(urls).size, urls.length, `the sitemap contains duplicate URLs: ${urls.filter((u, i) => urls.indexOf(u) !== i).join(", ")}`);
  for (const e of list) assert.ok(e.url.startsWith(SITE_URL), `every sitemap URL is absolute on the serving host: ${e.url}`);

  // Every Arabic entry with an English route has its counterpart, carrying the
  // same lastModified / changeFrequency / priority.
  for (const entry of ar) {
    const p = path(entry.url) || "/";
    const { hasEnglishEquivalent } = await import("@/lib/i18n/paths");
    if (!hasEnglishEquivalent(p)) continue;
    const counterpart = en.find((e) => path(e.url) === (p === "/" ? EN_PREFIX : EN_PREFIX + p));
    assert.ok(counterpart, `missing /en counterpart for ${p}`);
    assert.equal(counterpart!.changeFrequency, entry.changeFrequency, `${p}: changeFrequency must match its Arabic entry`);
    assert.equal(counterpart!.priority, entry.priority, `${p}: priority must match its Arabic entry`);
    assert.deepEqual(counterpart!.lastModified, entry.lastModified, `${p}: lastModified must match its Arabic entry`);
  }
});
