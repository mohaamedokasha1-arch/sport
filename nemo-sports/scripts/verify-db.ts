/**
 * NEMO Sports · database & cache provisioning verification.
 * ─────────────────────────────────────────────────────────────────────────
 * Proves that Postgres (+ optionally Redis) is really provisioned and that
 * the schema/seed the app expects is actually in place — the single most
 * consequential deployment check, because without DATABASE_URL every write
 * path (match streams, broadcasters, news store, canonical entities) falls
 * back to per-instance memory and is silently lost on restart/redeploy.
 *
 * What it checks:
 *   0. environment — DATABASE_URL / REDIS_URL presence (values NEVER printed)
 *   1. Postgres — connectivity, server version, SSL, pooled-vs-direct hint,
 *      required tables (20 canonical + 3 news + broadcasts), seed row counts,
 *      and a side-effect-free write probe (TEMP table inside a transaction)
 *   2. Redis — liveness plus a set/get/del roundtrip through RedisKvStore
 *
 * Usage (same convention as scripts/ingest.ts):
 *   DATABASE_URL=postgres://... REDIS_URL=redis://... npx tsx scripts/verify-db.ts
 *
 * If a variable is missing from the environment the script also tries to read
 * it from `.env.local` in the app root (never committed) — convenient locally,
 * while Vercel/CI keep injecting real env vars.
 *
 * Exit codes: 0 = Postgres durable & schema OK (Redis reported separately),
 *             2 = not provisioned or misconfigured (mirrors ingest.ts "refused").
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getDb, dbHealth, sanitizeDbMessage } from "../lib/db/pg";
import { getRedisKv, redisHealth } from "../lib/cache/redis";

/* ── tiny .env.local loader (fills only what the environment lacks) ─────── */

function loadDotEnvLocal(): string[] {
  const loaded: string[] = [];
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const path = join(root, ".env.local");
  if (!existsSync(path)) return loaded;
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const key = line.slice(0, line.indexOf("=")).trim();
    let value = line.slice(line.indexOf("=") + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env) && value) {
      process.env[key] = value;
      loaded.push(key);
    }
  }
  return loaded;
}

/* ── reporting helpers (secrets are NEVER printed) ──────────────────────── */

let failures = 0;
let warnings = 0;

function ok(name: string, extra = "") {
  console.log(`  ✓ ${name}${extra ? ` — ${extra}` : ""}`);
}

function warn(name: string, extra = "") {
  warnings++;
  console.log(`  ! ${name}${extra ? ` — ${extra}` : ""}`);
}

function fail(name: string, extra = "") {
  failures++;
  console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`);
}

/** Render a connection string as `protocol://host/db` — credentials stripped. */
function maskUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.host || "(no host)";
    const db = u.pathname && u.pathname !== "/" ? u.pathname : "";
    return `${u.protocol}//${host}${db}`;
  } catch {
    return "(unparseable URL)";
  }
}

/* ── table inventory ────────────────────────────────────────────────────── */

const CANONICAL_TABLES = [
  "sports",
  "countries",
  "competitions",
  "seasons",
  "venues",
  "teams",
  "players",
  "matches",
  "match_events",
  "match_stats",
  "standings",
  "top_scorers",
  "provider_entity_map",
  "provider_priority",
  "provider_rate_limits",
  "provider_health",
  "data_conflicts",
  "conflict_rules",
  "provider_call_log",
  "audit_log",
];

const NEWS_TABLES = ["rss_sources", "news_articles", "news_fetch_log"];

// Created by the runtime DDL in lib/*.ts on first boot when absent, so a
// missing table here is informational — NOT a provisioning failure.
const RUNTIME_TABLES = ["broadcasts", "match_streams", "match_overrides"];

const SEED_CHECKS: { table: string; expectMin: number; hint: string }[] = [
  { table: "sports", expectMin: 1, hint: "db/seed.sql" },
  { table: "provider_priority", expectMin: 1, hint: "db/seed.sql" },
  { table: "provider_rate_limits", expectMin: 1, hint: "db/seed.sql" },
  { table: "conflict_rules", expectMin: 1, hint: "db/seed.sql" },
  { table: "provider_health", expectMin: 1, hint: "db/seed.sql" },
];

/* ── section 1: Postgres ────────────────────────────────────────────────── */

async function checkPostgres(): Promise<void> {
  console.log("\n[1/2] Postgres (DATABASE_URL)\n");

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    fail("DATABASE_URL غير مضبوط", "الوضع الحالي: ذاكرة داخل العملية — كل بيانات الإدارة تُفقد عند إعادة التشغيل");
    console.log("      الحل: docs/DATABASE.md — ثم أعد تشغيل هذا السكربت");
    return;
  }
  ok("DATABASE_URL مضبوط", maskUrl(url));

  // SSL & pooling static hints (checked before connecting — they explain the
  // two most common managed-Postgres failures on serverless).
  const lowered = url.toLowerCase();
  const isNeon = lowered.includes("neon.tech");
  const isSupabase = lowered.includes("supabase");
  if (!/(sslmode=|ssl=true)/.test(lowered)) {
    if (isNeon || isSupabase) {
      warn("لا يوجد sslmode في الرابط", "Neon/Supabase يتطلبان SSL — أضف ?sslmode=require لنهاية الرابط");
    } else {
      warn("لا يوجد sslmode في الرابط", "يُنصح بـ ?sslmode=require لقواعد البيانات المدارة");
    }
  } else {
    ok("SSL مطلوب في الرابط");
  }
  const pooled =
    lowered.includes("-pooler.") || // Neon pooler
    lowered.includes(":6543") || // Supabase / generic PgBouncer pooler
    lowered.includes("pooler.supabase");
  if (pooled) {
    ok("رابط مُجمَّع (pooler)", "الاختيار الصحيح لـ Vercel serverless");
  } else if (isNeon || isSupabase) {
    warn("رابط مباشر (غير مُجمَّع)", "على Vercel استخدم رابط الـ pooler من لوحة المزوّد لتفادي نفاد الاتصالات");
  }

  const poolMax = Number(process.env.PG_POOL_MAX ?? 5);
  if (!Number.isFinite(poolMax) || poolMax > 10) {
    warn(`PG_POOL_MAX=${process.env.PG_POOL_MAX ?? "(unset→5)"}`, "على serverless أبقِه ≤ 10 (الافتراضي 5 مثالي)");
  } else {
    ok(`PG_POOL_MAX=${poolMax}`, "مناسب لـ serverless");
  }

  // Liveness.
  const health = await dbHealth();
  if (!health.ok) {
    fail("الاتصال بالقاعدة", sanitizeDbMessage(health.detail));
    return;
  }
  ok("الاتصال بالقاعدة", health.detail);

  const db = await getDb();
  if (!db) {
    fail("مشغّل pg", "تعذّر إنشاء المشغّل رغم نجاح الفحص — تحقق من node_modules");
    return;
  }

  try {
    const ctx = await db.select<{ db: string; ssl: boolean }>(
      "SELECT current_database() AS db, COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false) AS ssl",
      [],
    );
    ok("قاعدة البيانات", `${ctx[0]?.db ?? "?"} · SSL: ${ctx[0]?.ssl ? "مفعّل" : "غير مفعّل"}`);
  } catch (e) {
    warn("قراءة سياق الاتصال", sanitizeDbMessage(e instanceof Error ? e.message : String(e)));
  }

  // Table inventory.
  let present: Set<string>;
  try {
    const rows = await db.select<{ t: string }>(
      "SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public'",
      [],
    );
    present = new Set(rows.map((r) => r.t));
  } catch (e) {
    fail("جرد الجداول", sanitizeDbMessage(e instanceof Error ? e.message : String(e)));
    return;
  }

  const missingCanonical = CANONICAL_TABLES.filter((t) => !present.has(t));
  const missingNews = NEWS_TABLES.filter((t) => !present.has(t));
  if (missingCanonical.length === 0) {
    ok("الجداول الكنسية", `${CANONICAL_TABLES.length}/${CANONICAL_TABLES.length} موجودة`);
  } else {
    fail(
      "الجداول الكنسية",
      `مفقود: ${missingCanonical.join(", ")} — نفّذ: npm run db:setup`,
    );
  }
  if (missingNews.length === 0) {
    ok("جداول الأخبار", `${NEWS_TABLES.length}/${NEWS_TABLES.length} موجودة`);
  } else {
    fail("جداول الأخبار", `مفقود: ${missingNews.join(", ")} — نفّذ: npm run db:setup`);
  }
  const missingRuntime = RUNTIME_TABLES.filter((t) => !present.has(t));
  if (missingRuntime.length === 0) {
    ok("جداول البث", "broadcasts + match_streams موجودة");
  } else {
    warn("جداول البث", `${missingRuntime.join(", ")} ستُنشأ تلقائيًا عند أول إقلاع للتطبيق`);
  }

  // Seed sanity (only meaningful when the canonical tables exist).
  if (missingCanonical.length === 0) {
    for (const check of SEED_CHECKS) {
      try {
        const rows = await db.select<{ c: string }>(
          `SELECT COUNT(*)::text AS c FROM ${check.table}`,
          [],
        );
        const count = Number(rows[0]?.c ?? 0);
        if (count >= check.expectMin) {
          ok(`seed: ${check.table}`, `${count} صف`);
        } else {
          fail(`seed: ${check.table}`, `فارغ — نفّذ ${check.hint} عبر: npm run db:setup`);
        }
      } catch (e) {
        fail(`seed: ${check.table}`, sanitizeDbMessage(e instanceof Error ? e.message : String(e)));
      }
    }
  }

  // Side-effect-free write probe: TEMP tables die with the session, and the
  // whole probe runs inside one transaction on one pooled connection.
  try {
    await db.transaction(async (tx) => {
      await tx.run("CREATE TEMP TABLE nemo_verify_probe (id INTEGER PRIMARY KEY, note TEXT)", []);
      await tx.run("INSERT INTO nemo_verify_probe (id, note) VALUES (1, 'probe')", []);
      const rows = await tx.select<{ note: string }>("SELECT note FROM nemo_verify_probe WHERE id = 1", []);
      if (rows[0]?.note !== "probe") throw new Error("probe row did not round-trip");
    });
    ok("اختبار الكتابة", "TEMP TABLE داخل transaction — بدون أي أثر دائم");
  } catch (e) {
    fail("اختبار الكتابة", sanitizeDbMessage(e instanceof Error ? e.message : String(e)));
  }

  await db.end().catch(() => {});
}

/* ── section 2: Redis ───────────────────────────────────────────────────── */

async function checkRedis(): Promise<void> {
  console.log("\n[2/2] Redis (REDIS_URL)\n");

  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    warn("REDIS_URL غير مضبوط", "الكاش الحالي: LRU داخل العملية — مقبول لنسخة واحدة، إلزامي لأكثر من نسخة");
    console.log("      الحل: docs/DATABASE.md (القسم 2) — Upstash مجاني ويتكامل مع Vercel");
    return;
  }
  ok("REDIS_URL مضبوط", maskUrl(url));

  const health = await redisHealth();
  if (!health.ok) {
    fail("الاتصال بـ Redis", health.detail);
    return;
  }
  ok("الاتصال بـ Redis", health.detail);

  // Roundtrip through the same KvStore the SDL uses (TTL 60s + cleanup).
  try {
    const store = await getRedisKv();
    if (!store) {
      fail("مخزن Redis", "تعذّر إنشاء RedisKvStore");
      return;
    }
    const key = `nemo:verify:${Date.now().toString(36)}`;
    await store.set(key, { probe: true }, 60);
    const back = await store.get<{ probe: boolean }>(key);
    await store.del(key);
    if (back?.value?.probe === true) {
      ok("اختبار set/get/del", "عبر RedisKvStore الذي يستخدمه الـ SDL فعلًا");
    } else {
      fail("اختبار set/get/del", "القيمة لم ترجع مطابقة");
    }
  } catch (e) {
    fail("اختبار set/get/del", e instanceof Error ? e.message : String(e));
  }
}

/* ── main ───────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  console.log("\nNEMO Sports · database & cache verification\n");

  const fromFile = loadDotEnvLocal();
  if (fromFile.length > 0) {
    console.log(`(قُرئ من .env.local: ${fromFile.join(", ")})\n`);
  }

  await checkPostgres();
  await checkRedis();

  const pgDurable = Boolean(process.env.DATABASE_URL?.trim()) && failures === 0;
  const cacheMode = process.env.REDIS_URL?.trim() ? "redis" : "memory";

  console.log("\n────────────────────────────────────────");
  console.log(`canonical store : ${pgDurable ? "postgres (durable ✓)" : "memory (ephemeral ✗)"}`);
  console.log(`cache           : ${cacheMode === "redis" ? "redis (shared ✓)" : "memory (per-instance LRU)"}`);
  console.log(`result          : ${failures === 0 ? "OK" : "FAILED"} (${failures} خطأ، ${warnings} تحذير)`);
  console.log("────────────────────────────────────────\n");

  if (failures > 0) {
    console.log("الخطوة التالية: اتبع docs/DATABASE.md ثم أعد التشغيل.\n");
    process.exitCode = 2;
  } else if (!process.env.REDIS_URL?.trim()) {
    console.log("Postgres جاهز للإنتاج. Redis اختياري لكن يُنصح به بشدة قبل التوسّع.\n");
  } else {
    console.log("البنية التحتية للبيانات جاهزة بالكامل. أعد النشر (redeploy) لتفعيلها على Vercel.\n");
  }
}

main().catch((e) => {
  console.error(sanitizeDbMessage(e instanceof Error ? e.stack ?? e.message : String(e)));
  process.exitCode = 2;
});
