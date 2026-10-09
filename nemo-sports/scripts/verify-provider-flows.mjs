/** Controlled fixtures only: point a LOCAL app at scripts/mock-football-data.mjs.
 * This is not live provider or production sports-data verification. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(process.env.QA_PACKAGE_JSON ?? `${process.cwd()}/package.json`);
const { chromium: pw } = require("playwright");
const { default: chromium } = await import(pathToFileURL(require.resolve("@sparticuz/chromium")));
const base = process.env.BASE ?? "http://127.0.0.1:3001";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const fixture = await (await fetch(base + "/api/v1/matches?date=2026-09-16")).json();
assert.equal(fixture.ok, true); assert.equal(fixture.data.filter((m) => m.providerId === "512001").length, 1);
const browser = await pw.launch({ executablePath: await chromium.executablePath(), args: chromium.args.filter((s) => !["--disable-web-security", "--allow-running-insecure-content"].includes(s)), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.route("**/*", (route) => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  for (const path of ["/matches/512001", "/competitions/premier-league", "/teams/64", "/scout?competition=PL"]) {
    const r = await page.goto(base + path, { waitUntil: "networkidle" }); assert.equal(r.status(), 200, path);
    assert.equal(await page.locator("h1").count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${path} overflow`);
  }
  const tables = page.locator("main table"); assert.equal(await tables.count(), 2, "team and scorer comparison tables");
  const body = await tables.nth(1).textContent(); assert.ok(body.includes("Haaland") && body.includes("Salah"));
  const playerSelectors = page.locator("main section").filter({ has: page.getByRole("heading", { name: "مقارنة اللاعبين · قائمة الهدافين المتاحة" }) }).locator("select");
  await playerSelectors.nth(1).selectOption({ label: "Cole Palmer" });
  assert.ok((await tables.nth(1).textContent()).includes("Cole Palmer"));
  await page.goto(base + "/my-day", { waitUntil: "networkidle" });
  const player = page.getByLabel("Mohamed Salah", { exact: true }); await player.check(); await page.reload(); await player.waitFor(); assert.equal(await player.isChecked(), true);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log("PASS: controlled provider match/team/competition pages, nonempty Scout/player selection, supplied-player favorite reload, Cairo API dedup, mobile overflow and runtime errors");
} finally { await browser.close(); }
