#!/usr/bin/env -S npx tsx
/**
 * NEMO Sports · pipeline CLI
 * ──────────────────────────
 * The same runner the cron routes call, reachable from a shell. This is what
 * makes the system portable: Vercel Cron hits `/api/cron/pipeline/{job}`, while
 * a VPS, a container or an operator uses this script — identical behaviour,
 * identical audit trail.
 *
 *   npm run pipeline:doctor                 validate config, gates, DB, credentials
 *   npm run pipeline:status                 sources · jobs · cursors · archive
 *   npm run pipeline:run -- matches         run one job now
 *   npm run pipeline:run -- matches --dry   fetch + normalize, write nothing
 *   npm run pipeline:tick                   run every job that is due (cron entry point)
 *   npm run pipeline:loop                   long-running scheduler (VPS / docker)
 *   npm run pipeline:prune                  enforce the raw-payload retention window
 *
 * Exit codes: 0 = fine, 1 = failed run / invalid configuration, 2 = usage.
 */

import { loadPipelineConfig, configurationReport, resetPipelineConfig } from "../lib/pipeline/config";
import { runJob } from "../lib/pipeline/runner";
import { pipelineStatus } from "../lib/pipeline/status";
import { pruneRaw } from "../lib/pipeline/raw-store";
import { getDb } from "../lib/db/pg";

const args = process.argv.slice(2);
const command = args[0] ?? "status";
const flags = new Set(args.filter((a) => a.startsWith("--") && !a.includes("=")));
const flagValue = (name: string): string | null => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const json = flags.has("--json");

function print(value: unknown): void {
  console.log(json ? JSON.stringify(value, null, 2) : typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

/* ─── doctor ─────────────────────────────────────────────────────────────── */

async function doctor(): Promise<number> {
  resetPipelineConfig();
  let cfg;
  try {
    cfg = loadPipelineConfig({ refresh: true });
  } catch (e) {
    console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }

  const report = configurationReport(cfg);
  const db = await getDb().catch(() => null);
  let dbDetail = "غير متّصل (DATABASE_URL غير مضبوط أو pg غير متاح)";
  if (db) {
    try {
      const rows = await db.select<{ v: string }>(`SELECT current_setting('server_version') AS v`, []);
      dbDetail = `متّصل — PostgreSQL ${rows[0]?.v ?? "?"}`;
    } catch (e) {
      dbDetail = `خطأ: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  const envChecks = [
    ["FOOTBALL_DATA_API_KEY", Boolean(process.env.FOOTBALL_DATA_API_KEY)],
    ["THESPORTSDB_API_KEY", Boolean(process.env.THESPORTSDB_API_KEY)],
    ["PIPELINE_SCRAPING_LICENSED=1", process.env.PIPELINE_SCRAPING_LICENSED === "1"],
    ["PIPELINE_ALLOW_UNVERIFIED_ENDPOINTS=1", process.env.PIPELINE_ALLOW_UNVERIFIED_ENDPOINTS === "1"],
    ["NEMO_INGEST_TOKEN / CRON_SECRET (cron auth)", Boolean(process.env.NEMO_INGEST_TOKEN || process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET)],
    ["PIPELINE_CONTACT (contact for the bot UA)", Boolean(process.env.PIPELINE_CONTACT)],
  ] as [string, boolean][];

  if (json) {
    print({ ok: true, config: report, database: dbDetail, env: Object.fromEntries(envChecks) });
    return 0;
  }

  console.log(`التحقق من الإعداد · المصدر: ${report.origin} · الإصدار ${report.version}`);
  console.log(`ترتيب الأولوية: ${report.priority.join(" > ")}`);
  console.log(`قاعدة البيانات: ${dbDetail}`);
  console.log("\nالمصادر:");
  for (const s of report.sources) {
    const gate = s.callable ? "قابل للاستدعاء" : `مغلق (${s.blocked_by.join(" · ")})`;
    console.log(`  ${s.rank + 1}. ${s.name.padEnd(20)} ${s.mode.padEnd(7)} ${gate}`);
    if (s.unverified_endpoints.length) console.log(`     نقاط نهاية غير مُتحقَّقة: ${s.unverified_endpoints.join(", ")}`);
  }
  console.log("\nمتغيّرات البيئة:");
  for (const [name, present] of envChecks) console.log(`  ${present ? "✓" : "·"} ${name}`);
  console.log("\nالمهام:");
  for (const j of report.jobs) console.log(`  · ${j.name} — كل ${j.interval_minutes} دقيقة${j.matchday_interval_minutes ? ` (أيام المباريات: ${j.matchday_interval_minutes})` : ""}`);
  console.log("\nملاحظات:");
  console.log("  · لا يُستدعى أي endpoint مُعلَّم verified:false إلا بعد تأكيده من التوثيق الرسمي، أو مؤقتًا بـ PIPELINE_ALLOW_UNVERIFIED_ENDPOINTS=1.");
  console.log("  · مصادر قراءة الصفحات (EPL/EFA/FIFA) مغلقة حتى تأكيد الترخيص كتابةً: scraping_licensed + PIPELINE_SCRAPING_LICENSED=1.");
  console.log("  · لا يُعاد كتابة أي رابط مصدر: تُستخدم المسارات كما هي في config/pipeline/endpoints.yml.");
  return 0;
}

/* ─── status ─────────────────────────────────────────────────────────────── */

async function status(): Promise<number> {
  const s = await pipelineStatus(15);
  if (json) {
    print(s);
    return 0;
  }
  console.log(`حالة خط البيانات · الإعداد من: ${s.configOrigin} · القاعدة: ${s.database ? "متّصلة" : "غير متّصلة"}`);
  console.log(`أرشيف خام: ${s.raw.rows} صف · فشل ٢٤س: ${s.raw.failures24h} · صراعات مفتوحة: ${s.conflicts.total} (حرجة ${s.conflicts.critical})`);
  console.log("\nآخر التشغيلات:");
  for (const r of s.runs.slice(0, 10)) {
    // Show the 304 count only when it is non-zero: "fetched=0" alone reads like
    // a dead run, while "fetched=0 304=4" says "upstream unchanged, all good".
    const notModified = r.stats.not_modified ?? 0;
    const unchanged = notModified > 0 ? ` بلا تغيير=${notModified}` : "";
    console.log(`  ${r.startedAt}  ${r.job.padEnd(14)} ${String(r.source ?? "-").padEnd(18)} ${r.status.padEnd(8)} جُلب=${r.stats.fetched ?? 0}${unchanged} جديد=${r.stats.created ?? 0} محدَّث=${r.stats.updated ?? 0} صراعات=${r.stats.conflicts ?? 0}`);
  }
  console.log("\nحالة المزامنة:");
  for (const j of s.jobs) {
    for (const st of j.states) {
      console.log(`  ${st.source.padEnd(18)} ${st.job.padEnd(14)} آخر نجاح=${st.lastSuccessAt ?? "—"} فشل متتابع=${st.consecutiveFailures}`);
    }
  }
  for (const w of s.warnings) console.log(`  ⚠ ${w}`);
  return 0;
}

/* ─── run / tick / loop ──────────────────────────────────────────────────── */

async function runOne(): Promise<number> {
  const job = args[1] && !args[1].startsWith("--") ? args[1] : null;
  if (!job) {
    console.error("usage: npm run pipeline:run -- <job> [--dry] [--force] [--sources=a,b]");
    return 2;
  }
  const summary = await runJob(job, {
    trigger: "cli",
    dryRun: flags.has("--dry"),
    // An explicit CLI run is intentional, so the cadence is bypassed unless the
    // operator asks for it to be respected (useful inside a frequent cron).
    force: !flags.has("--respect-cadence"),
    sources: (flagValue("sources") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  });
  if (json) print(summary);
  else {
    console.log(`${summary.ok ? "✓" : "✗"} ${summary.job} (${summary.dryRun ? "فحص جاف" : "تنفيذ فعلي"}) في ${summary.durationMs}ms`);
    for (const s of summary.sources) {
      console.log(`  ${s.source.padEnd(18)} ${s.status.padEnd(8)} جُلب=${s.fetched} 304=${s.notModified} فشل=${s.failed} جديد=${s.created} محدَّث=${s.updated} صراعات=${s.conflicts}${s.reason ? ` (${s.reason})` : ""}`);
      for (const n of s.notes.slice(0, 3)) console.log(`      · ${n}`);
      for (const w of s.warnings.slice(0, 3)) console.log(`      ⚠ ${w}`);
    }
    for (const e of summary.errors) console.log(`  ✗ ${e}`);
  }
  return summary.ok ? 0 : 1;
}

async function tick(): Promise<number> {
  const cfg = loadPipelineConfig();
  const summaries = [];
  for (const job of cfg.jobs) {
    if (job.run_on_boot && flags.has("--skip-boot")) continue;
    summaries.push(await runJob(job.name, { trigger: "cron", force: flags.has("--force") }));
  }
  const failed = summaries.filter((s) => !s.ok);
  if (json) print(summaries);
  else {
    for (const s of summaries) console.log(`${s.ok ? "✓" : "✗"} ${s.job.padEnd(14)} جُلب=${s.totals.fetched} جديد=${s.totals.created} محدَّث=${s.totals.updated} صراعات=${s.totals.conflicts} في ${s.durationMs}ms`);
  }
  return failed.length === 0 ? 0 : 1;
}

async function loop(): Promise<number> {
  const intervalSeconds = Number(flagValue("every") ?? process.env.PIPELINE_TICK_SECONDS ?? 60);
  console.log(`مجدول خط البيانات يعمل (كل ${intervalSeconds} ثانية) — أوقفه بـ Ctrl+C`);
  let stopping = false;
  const stop = (): void => {
    stopping = true;
    console.log("\nإيقاف…");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  while (!stopping) {
    try {
      await tick();
    } catch (e) {
      console.error(`✗ دورة فاشلة: ${e instanceof Error ? e.message : String(e)}`);
    }
    await new Promise((r) => setTimeout(r, intervalSeconds * 1000));
  }
  return 0;
}

async function main(): Promise<number> {
  switch (command) {
    case "doctor":
      return doctor();
    case "status":
      return status();
    case "run":
      return runOne();
    case "tick":
      return tick();
    case "loop":
      return loop();
    case "prune": {
      const cfg = loadPipelineConfig();
      const days = Number(flagValue("days") ?? cfg.defaults.raw_retention_days);
      const removed = await pruneRaw(days);
      console.log(`✓ حُذف ${removed} صفًا أقدم من ${days} يومًا`);
      return 0;
    }
    default:
      console.error(`أمر غير معروف: ${command}\nالمتاح: doctor · status · run · tick · loop · prune`);
      return 2;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(`✗ ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
    process.exit(1);
  });
