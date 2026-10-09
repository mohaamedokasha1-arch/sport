/** Optional browser regression suite. Install playwright, axe-core and
 * @sparticuz/chromium in a separate QA directory; set QA_PACKAGE_JSON.
 * No dependency or browser binary is added to the production application. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(process.env.QA_PACKAGE_JSON ?? `${process.cwd()}/package.json`);
const { chromium: playwright } = require("playwright");
const { default: chromium } = await import(pathToFileURL(require.resolve("@sparticuz/chromium")));
const { source: axe } = require("axe-core");
const base = process.env.BASE ?? "http://127.0.0.1:3000";
const browser = await playwright.launch({ executablePath: process.env.CHROMIUM_PATH ?? await chromium.executablePath(), args: chromium.args.filter((s) => !["--disable-web-security", "--allow-running-insecure-content"].includes(s)), headless: true });
const errors = [];
const findings = [];
try {
  const page = await browser.newPage();
  // Don't contact third-party image/iframe hosts in an offline verification run.
  await page.route("**/*", (route) => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/matches", "/my-day", "/scout", "/watch", "/news", "/learn", "/admin/login"]) {
      const response = await page.goto(base + path, { waitUntil: "networkidle" });
      assert.equal(response.status(), 200, path);
      assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
      assert.equal(await page.locator("h1").count(), 1, `${path} heading`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${path} overflow at ${width}`);
      await page.addScriptTag({ content: axe });
      const result = await page.evaluate(() => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } }));
      findings.push({ path, width, violations: result.violations.map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length })) });
    }
  }
  await page.goto(base + "/my-day");
  const checkbox = page.locator("input[type=checkbox]").first();
  if (await checkbox.count()) {
    await checkbox.check(); await page.reload(); await checkbox.waitFor(); assert.equal(await checkbox.isChecked(), true, "favorite survives reload");
    await page.getByRole("button", { name: "مسح كل التفضيلات" }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem("nemo-football-day-v1")), null);
    console.log("PASS: favorites saved across reload and cleared");
  } else console.log("BLOCKED: no favorite options from current data");
  await page.goto(base + "/matches");
  const date = page.locator('input[type="date"]');
  if (await date.count()) {
    await date.fill("2026-10-09"); await page.waitForURL(/date=2026-10-09/);
    assert.match(page.url(), /date=2026-10-09/);
    console.log("PASS: calendar filter updates stable query URL");
  }
  const bad = await page.request.get(base + "/api/v1/matches?date=2026-02-30"); assert.equal(bad.status(), 400);
  const system = await page.request.get(base + "/api/v1/system"); assert.ok([401, 403, 503].includes(system.status()));
  const cron = await page.request.get(base + "/api/cron/fetch-news"); assert.ok([401, 503].includes(cron.status()));
  const robots = await (await page.request.get(base + "/robots.txt")).text(); assert.match(robots, /Sitemap:/);
  await page.goto(base + "/my-day");
  assert.ok((await page.locator('meta[name="robots"]').getAttribute("content")).includes("noindex"));
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(JSON.stringify({ routesAndViewports: findings, runtimeErrors: errors }, null, 2));
  const severe = findings.flatMap((f) => f.violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${f.path}:${f.width}:${v.id}`));
  assert.deepEqual(severe, [], "Serious accessibility issues");
  console.log("PASS: route rendering, responsive widths, API denial/validation, SEO, and automated accessibility checks");
} finally { await browser.close(); }
