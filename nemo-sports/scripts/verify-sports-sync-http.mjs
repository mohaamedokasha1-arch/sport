/** One-shot local production HTTP verification. Server is always stopped; no deployment. */
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const port = 3107, base = `http://127.0.0.1:${port}`, secret = randomUUID();
const env = { ...process.env, NEMO_SPORTSCORE_ENABLED: "0", NEXT_TELEMETRY_DISABLED: "1", CRON_SECRET: secret };
for (const name of ["DATABASE_URL", "REDIS_URL", "FOOTBALL_DATA_API_KEY", "SPORTRADAR_KEY", "SPORTMONKS_TOKEN", "SPORTMONKS_API_TOKEN", "API_FOOTBALL_KEY", "THESPORTSDB_KEY", "THESPORTSDB_API_KEY"]) delete env[name];
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server readiness timed out: ${log}`)), 30000);
    server.stdout.on("data", chunk => { log += String(chunk); if (/Ready in/.test(log)) { clearTimeout(timer); resolve(); } });
    server.stderr.on("data", chunk => { log += String(chunk); });
    server.once("exit", code => { clearTimeout(timer); reject(new Error(`server exited ${code}: ${log}`)); });
  });
  const smoke = spawn(process.execPath, ["scripts/smoke.mjs"], { env: { ...env, BASE: base }, stdio: "inherit" });
  assert.equal(await new Promise(resolve => smoke.once("exit", resolve)), 0, "legacy HTTP smoke");
  const robots = await fetch(`${base}/robots.txt`), robotsText = await robots.text();
  assert.equal(robots.status, 200); assert.match(robotsText, /Sitemap: https:\/\/nemo-sports\.vercel\.app\/sitemap.xml/);
  const sitemap = await fetch(`${base}/sitemap.xml`), xml = await sitemap.text();
  assert.equal(sitemap.status, 200); assert.ok(!xml.includes("/sports/matches/"), "empty fixture URLs excluded");
  assert.ok(!xml.includes("/competitions/newly-introduced"), "mock data absent");
  const sports = await fetch(`${base}/sports`), html = await sports.text();
  assert.equal(sports.status, 200); assert.match(html, /dir="rtl"/); assert.match(html, /لم تتوفر بيانات متزامنة/);
  assert.equal((await fetch(`${base}/sports/matches/unknown--00000000-0000-0000-0000-000000000000`)).status, 404);
  const route = `${base}/api/cron/sports-sync/catalog`;
  assert.equal((await fetch(route)).status, 401);
  const denied = await fetch(route, { headers: { authorization: `Bearer ${secret}` } });
  assert.equal(denied.status, 503); assert.match(await denied.text(), /no_database/);
  console.log("LOCAL HTTP EVIDENCE: legacy smoke green; robots/sitemap 200; empty discovered URLs excluded; RTL /sports 200; unknown match 404; unauthorized job 401; authorized job without durable database 503 (not false success).");
} finally {
  server.kill("SIGTERM");
  await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once("exit", resolve); });
}
