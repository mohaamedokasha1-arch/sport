import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { refreshLeagues, siteOrigin } from "./refresh-leagues.mjs";

const origin = "https://nemo.example";
const secret = "local-test-value";
const success = (job) => Response.json({ ok: true, run: { status: "success", tasks: job === "matchday" ? 3 : 2, inserted: 4, updated: 0, entities: { fixture: { fetched: 4 } }, failures: [] } });

test("scheduler requires a bare HTTPS origin and a secret before spending quota", async () => {
  for (const value of ["http://nemo.example", "https://user:pass@nemo.example", "https://nemo.example/path", "https://nemo.example/?token=a", "oops"]) {
    assert.throws(() => siteOrigin(value), /https origin/);
  }
  assert.equal(siteOrigin(origin).href, `${origin}/`);
  await assert.rejects(refreshLeagues({ siteUrl: origin, secret: "", fetchImpl: async () => { throw new Error("must not call"); } }), /NEMO_CRON_SECRET/);
});

test("scheduler calls matchday before the catalog/backfill tick with bearer auth, never a URL token", async () => {
  const calls = [], logs = [];
  const results = await refreshLeagues({ siteUrl: origin, secret, log: (text) => logs.push(text), fetchImpl: async (url, options) => {
    calls.push([String(url), options]);
    return success(calls.length === 1 ? "matchday" : "tick");
  } });
  assert.deepEqual(results.map(r => r.job), ["matchday", "tick"]);
  assert.deepEqual(calls.map(([url]) => url), [`${origin}/api/cron/sports-sync/matchday`, `${origin}/api/cron/sports-sync/tick`]);
  assert.ok(calls.every(([, options]) => options.headers.authorization === `Bearer ${secret}` && options.redirect === "error"));
  assert.equal(logs.length, 2);
  assert.equal(logs.join(" ").includes(secret), false);
});

test("scheduler reports missing provider or partial matchday, but still drains the background queue", async () => {
  for (const body of [
    { ok: false, run: { status: "skipped", tasks: 0, failures: ["no_supported_work"] } },
    { ok: false, run: { status: "partial", tasks: 2, failures: ["provider outage"] } },
  ]) {
    let called = 0;
    await assert.rejects(refreshLeagues({ siteUrl: origin, secret, log: () => {}, fetchImpl: async () => {
      called++;
      return called === 1 ? Response.json(body, { status: body.run.status === "skipped" ? 409 : 207 }) : success("tick");
    } }), /matchday:/);
    assert.equal(called, 2, "a day-feed failure must not starve the catalog and season queue");
  }
});

test("scheduler accepts only honest idle background ticks and never follows redirects", async () => {
  const res = await refreshLeagues({ siteUrl: origin, secret, log: () => {}, fetchImpl: async (url) =>
    String(url).endsWith("/matchday") ? success("matchday") : Response.json({ ok: true, skipped: true, reason: "nothing_due" }) });
  assert.deepEqual(res.map(r => r.status), ["success", "nothing_due"]);
  await assert.rejects(refreshLeagues({ siteUrl: origin, secret, fetchImpl: async () => new Response("redirect", { status: 302, headers: { location: "https://another.example/" } }) }), /HTTP 302/);
  await assert.rejects(refreshLeagues({ siteUrl: origin, secret, fetchImpl: async () => Response.json({ ok: false, error: "no_database" }, { status: 503 }) }), /HTTP 503/);
  await assert.rejects(refreshLeagues({ siteUrl: origin, secret, fetchImpl: async () => { throw new Error(`network: ${secret}`); } }),
    error => !String(error).includes(secret) && String(error).includes("[redacted]"));
});

test("periodic workflow runs from the default branch without inlining credentials", () => {
  const text = readFileSync("../.github/workflows/league-refresh.yml", "utf8");
  assert.match(text, /\*\/15 \* \* \* \*/);
  assert.match(text, /secrets\.NEMO_CRON_SECRET/);
  assert.match(text, /vars\.NEMO_SITE_URL/);
  assert.doesNotMatch(text, /local-test-value/);
});
