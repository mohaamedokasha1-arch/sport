import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAINTENANCE_PATHS, refreshMaintenance } from "./refresh-maintenance.mjs";

const siteUrl = "https://nemo.example";
const secret = "local-test-only";
const ok = () => Response.json({ ok: true, run: { status: "success" } });

test("Vercel Hobby ships only two DAILY cron jobs; the other existing jobs have scheduled replacements", () => {
  const cfg = JSON.parse(readFileSync("vercel.json", "utf8"));
  assert.deepEqual(cfg.crons, [
    { path: "/api/v1/ingest", schedule: "0 3 * * *" },
    { path: "/api/cron/fetch-news", schedule: "30 3 * * *" },
  ]);
  const priorRoutes = ["/api/cron/sync-competitions", "/api/cron/pipeline/matches", "/api/cron/pipeline/standings", "/api/cron/pipeline/competitions", "/api/cron/discover-fixtures", "/api/cron/sports-sync/catalog"];
  assert.deepEqual(new Set([...MAINTENANCE_PATHS.daily, ...MAINTENANCE_PATHS.weekly]), new Set(priorRoutes));
  const workflow = readFileSync("../.github/workflows/data-maintenance.yml", "utf8");
  assert.match(workflow, /10 4 \* \* \*/);
  assert.match(workflow, /25 4 \* \* 1/);
  assert.match(workflow, /secrets\.NEMO_CRON_SECRET/);
});

test("daily routes retain bearer protection, run sequentially and reveal no tokens", async () => {
  const calls = [], lines = [];
  await refreshMaintenance({ siteUrl, secret, mode: "daily", log: s => lines.push(s), fetchImpl: async (url, opts) => {
    calls.push([String(url), opts]);
    return ok();
  } });
  assert.deepEqual(calls.map(([url]) => url), MAINTENANCE_PATHS.daily.map(path => `${siteUrl}${path}`));
  assert.ok(calls.every(([, opts]) => opts.headers.authorization === `Bearer ${secret}` && opts.redirect === "error"));
  assert.equal(lines.join(" ").includes(secret), false);
});

test("weekly catalog jobs may report unsupported in keyless mode, but other failures remain visible", async () => {
  const lines = [];
  await refreshMaintenance({ siteUrl, secret, mode: "weekly", log: s => lines.push(s), fetchImpl: async (url) => {
    if (String(url).endsWith("/sync-competitions")) return Response.json({ ok: false, reason: "no_provider" }, { status: 409 });
    if (String(url).endsWith("/catalog")) return Response.json({ ok: false, run: { status: "skipped", failures: ["no_supported_work"] } }, { status: 409 });
    return ok();
  } });
  assert.equal(lines.length, 3);
  assert.equal(lines.filter(l => l.includes("unsupported")).length, 2);
  let called = 0;
  await assert.rejects(refreshMaintenance({ siteUrl, secret, mode: "daily", log: () => {}, fetchImpl: async () => {
    called++;
    return called === 1 ? Response.json({ ok: false }, { status: 207 }) : ok();
  } }), /not successful/);
  assert.equal(called, 3, "other sources still update when one job fails");
});

test("invalid setup refuses without calls; error reporting redacts credentials", async () => {
  await assert.rejects(refreshMaintenance({ siteUrl, secret: "", mode: "daily", fetchImpl: async () => { throw new Error("should not call"); } }), /NEMO_CRON_SECRET/);
  await assert.rejects(refreshMaintenance({ siteUrl, secret, mode: "unknown", fetchImpl: async () => { throw new Error("should not call"); } }), /daily or weekly/);
  await assert.rejects(refreshMaintenance({ siteUrl, secret, mode: "daily", fetchImpl: async () => { throw new Error(secret); } }),
    error => !String(error).includes(secret) && String(error).includes("[redacted]"));
});
