#!/usr/bin/env node
/**
 * End-to-end check of AUTHORIZED news ingestion against durable storage.
 * ──────────────────────────────────────────────────────────────────────
 * Non-production only. Requires a started production build configured with:
 *   DATABASE_URL            a disposable Postgres (NEVER production)
 *   NEMO_INGEST_TOKEN       any test value (read from the environment, never printed)
 *   NEMO_NEWS_FEED_BASE_URL http://127.0.0.1:7799/rss/search  (scripts/mock-news-feeds.mjs)
 *
 *   BASE=http://127.0.0.1:3000 MOCK=http://127.0.0.1:7799 DATABASE_URL=… NEMO_INGEST_TOKEN=… \
 *     node scripts/verify-news-ingestion.mjs [--phase=run|persist]
 *
 * phase "run" (default): seeds two LEGACY published false positives (the
 * production ones), then checks 401s, an authorized run with one failing
 * source, the success/failure metadata, the relevance gate and quarantine
 * provenance, then a clean re-run.
 * phase "persist": after a server restart, checks that the timestamps and
 * articles survived (durable storage, not process memory).
 */
import pg from "pg";

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const MOCK = process.env.MOCK ?? "http://127.0.0.1:7799";
const TOKEN = process.env.NEMO_INGEST_TOKEN ?? "";
const DB = process.env.DATABASE_URL ?? "";
const phase = (process.argv.find((a) => a.startsWith("--phase=")) ?? "--phase=run").slice(8);

if (!DB || /prod|vercel|neon\.tech|supabase\.co/i.test(DB)) {
  console.error("refusing: DATABASE_URL must point at a disposable local test database");
  process.exit(2);
}
if (!TOKEN) {
  console.error("NEMO_INGEST_TOKEN must be set (test value)");
  process.exit(2);
}

let failures = 0;
const ok = (cond, label, detail = "") => {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
};
const db = new pg.Client({ connectionString: DB });
await db.connect();
const news = async () => (await fetch(`${BASE}/api/v1/news?limit=100`, { cache: "no-store" })).json();
const cron = (headers = {}, query = "") => fetch(`${BASE}/api/cron/fetch-news${query}`, { headers, cache: "no-store" });

const LEGACY = [
  { id: "legacy-sabbour", title: "Al Ahly Sabbour Launches Zaha Residence in Sultan Haitham City, Oman - News and Statistics - IndexBox", description: "Al Ahly Sabb", url: "https://news.google.com/rss/articles/legacy-sabbour" },
  { id: "legacy-sewedy", title: "El Sewedy sells 40% of CIRA's Damietta university venture - Billionaires.Africa", description: "Al Ahly Sabb", url: "https://news.google.com/rss/articles/legacy-sewedy" },
  { id: "legacy-derby", title: "Before the derby: Al-Ahly win and Zamalek lose in the League Cup - Goal.com", description: "Al Ahly and Zamalek", url: "https://news.google.com/rss/articles/legacy-derby" },
];

if (phase === "run") {
  console.log("schema + legacy records");
  await news(); // first store use creates the schema idempotently
  for (const a of LEGACY) {
    await db.query(
      `INSERT INTO news_articles (id, title, source_url, canonical_url, source_name, source_domain, publication_date, fetched_date,
         description, category, secondary_categories, category_confidence, related_entities, rss_source_id, fingerprint, status)
       VALUES ($1,$2,$3,$3,'legacy','news.google.com', now() - interval '3 days', now() - interval '3 days', $4,
         'Egyptian Football', '{}', 50, '[{"type":"team","internalId":"al-ahly"}]'::jsonb, 'rss_al-ahly-eg-en', $1, 'published')
       ON CONFLICT (canonical_url) DO NOTHING`,
      [a.id, a.title, a.url, a.description],
    );
  }
  const seeded = await db.query("SELECT id, status FROM news_articles WHERE id = ANY($1)", [LEGACY.map((a) => a.id)]);
  ok(seeded.rows.length === 3 && seeded.rows.every((r) => r.status === "published"), "3 legacy published articles present (2 false positives + 1 real)");
  const before = await news();
  ok(before.meta?.lastSuccessfulUpdate === null && before.meta?.freshness?.state === "never", "before any run: no successful update, state 'never'", JSON.stringify(before.meta?.freshness));

  console.log("\nauthorization (no secret is printed)");
  ok((await cron()).status === 401, "no token → 401");
  ok((await cron({ authorization: "Bearer wrong-token" })).status === 401, "wrong token → 401");

  console.log("\nauthorized run with one failing source");
  await fetch(`${MOCK}/__control?fail=Boxing`);
  const res = await cron({ authorization: `Bearer ${TOKEN}` }, "?force=1");
  const run = await res.json();
  ok(run.storage === "postgres", "run persisted to Postgres (storage: postgres)", run.storage);
  const boxing = (run.perSource ?? []).find((s) => s.query === "Boxing");
  ok(boxing && boxing.ok === false, "the failing source is reported as failed", JSON.stringify(boxing));
  ok((run.perSource ?? []).filter((s) => s.ok).length >= 10, "the other sources succeeded", String((run.perSource ?? []).filter((s) => s.ok).length));
  ok(res.status === 502 && run.ok === false, "a partial failure is not reported as success (502, ok:false)", `${res.status}`);
  ok(run.moderation && run.moderation.applied === true && run.moderation.quarantined >= 2, "end-of-run moderation quarantined the legacy false positives", JSON.stringify(run.moderation));

  const after = await news();
  const m = after.meta ?? {};
  ok(Boolean(m.lastSuccessfulUpdate) && Date.now() - Date.parse(m.lastSuccessfulUpdate) < 5 * 60_000, "meta.lastSuccessfulUpdate is now set and recent", m.lastSuccessfulUpdate);
  ok(Boolean(m.lastFailedAttempt), "meta.lastFailedAttempt records the failure separately", m.lastFailedAttempt);
  ok(m.lastUpdated === m.lastSuccessfulUpdate, "legacy meta.lastUpdated keeps meaning 'last success'");
  ok(m.freshness?.schedule?.intervalMinutes === 1440 && m.freshness?.schedule?.staleAfterMinutes === 2880, "stale threshold follows the daily scheduler (48 h)", JSON.stringify(m.freshness?.schedule));
  const titles = (after.data ?? []).map((a) => a.title);
  ok(!titles.some((t) => /Sabbour|El Sewedy/.test(t)), "no commercial/property/university story is public");
  ok(titles.some((t) => /Al Ahly beat Zamalek 2-1/.test(t)), "a genuine football story was published");
  ok(titles.some((t) => /Before the derby/.test(t)), "the genuine legacy story stays published");
  const ihf = (after.data ?? []).find((a) => /IHF/.test(a.title));
  ok(ihf?.category === "Handball", "the IHF story is categorised Handball, not Egyptian Football", ihf?.category);

  const q = await db.query("SELECT id, status, previous_status, moderation_reason, moderated_by, moderated_at, title FROM news_articles WHERE id = ANY($1) ORDER BY id", [LEGACY.map((a) => a.id)]);
  const row = (id) => q.rows.find((r) => r.id === id);
  for (const id of ["legacy-sabbour", "legacy-sewedy"]) {
    const r = row(id);
    ok(r && r.status === "hidden" && r.previous_status === "published" && /^auto:relevance:/.test(r.moderation_reason ?? "") && r.moderated_by && r.moderated_at, `${id}: quarantined with provenance, record preserved`, JSON.stringify(r));
  }
  ok(row("legacy-derby")?.status === "published", "legacy-derby untouched");
  const newCommercial = await db.query("SELECT count(*)::int AS c FROM news_articles WHERE canonical_url LIKE 'https://www.indexbox.io/%' OR canonical_url LIKE 'https://billionaires.africa/%'");
  ok(newCommercial.rows[0].c === 0, "NEW commercial items were rejected at ingestion (never published)");

  console.log("\nclean re-run");
  await fetch(`${MOCK}/__control?fail=`);
  const res2 = await cron({ authorization: `Bearer ${TOKEN}` }, "?force=1");
  const run2 = await res2.json();
  ok(res2.status === 200 && run2.ok === true, "all sources succeed → 200 ok:true", String(res2.status));
  const fresh = await news();
  ok(fresh.meta?.freshness?.state === "fresh" && fresh.meta?.lastAttemptOk === true, "freshness state 'fresh' after a fully successful run", JSON.stringify(fresh.meta?.freshness?.state));
  const sources = await db.query("SELECT count(*) FILTER (WHERE last_successful_fetch IS NOT NULL)::int AS ok, count(*)::int AS n FROM rss_sources WHERE enabled");
  ok(sources.rows[0].ok === sources.rows[0].n, `every enabled source has a persisted success timestamp (${sources.rows[0].ok}/${sources.rows[0].n})`);
}

if (phase === "persist") {
  console.log("after server restart");
  const r = await news();
  ok(Boolean(r.meta?.lastSuccessfulUpdate), "lastSuccessfulUpdate survived the restart (durable)", r.meta?.lastSuccessfulUpdate);
  ok((r.data ?? []).some((a) => /Al Ahly beat Zamalek 2-1/.test(a.title)), "articles survived the restart");
  const q = await db.query("SELECT status FROM news_articles WHERE id = 'legacy-sabbour'");
  ok(q.rows[0]?.status === "hidden", "quarantine survived the restart");
}

await db.end();
console.log(failures ? `\n✗ ${failures} check(s) failed` : `\n✅ news ingestion (${phase}) verified against durable storage`);
process.exit(failures ? 1 : 0);
