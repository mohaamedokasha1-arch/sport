import { AdminHead, Panel, Pill, Table } from "@/components/admin/ui";
import PipelineRunButton from "@/components/admin/PipelineRunButton";
import { requirePermission } from "@/lib/admin-session";
import { pipelineStatus } from "@/lib/pipeline";
import { SITE_TZ } from "@/lib/tz";

export const dynamic = "force-dynamic";

/**
 * خط البيانات — Data pipeline (§2) · قراءة كاملة من السجل، لا أرقام مُختلقة.
 * ─────────────────────────────────────────────────────────────────────────
 * ما تعرضه الصفحة:
 *   · المصادر الخمسة بترتيب الأولوية، وهل كل مصدر قابل للاستدعاء الآن ولماذا لا؛
 *   · نقاط النهاية التي لم تُتحقَّق بعد (`verified: false`) — لا يُستدعى أي منها
 *     إلا بعد تأكيدها من التوثيق الرسمي؛
 *   · المهام وجدولها وآخر تشغيل لكل منها؛
 *   · سجل التشغيلات، حجم الأرشيف الخام، والصراعات المفتوحة.
 */
export default async function AdminPipeline() {
  await requirePermission("providers");
  const status = await pipelineStatus(25);

  const time = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString("ar-EG", { timeZone: SITE_TZ, dateStyle: "short", timeStyle: "short" }) : "—";

  const runTone = (s: string): "ok" | "warn" | "bad" | "idle" =>
    s === "ok" ? "ok" : s === "partial" || s === "running" ? "warn" : s === "failed" ? "bad" : "idle";

  const RUN_AR: Record<string, string> = { ok: "ناجحة", partial: "جزئية", failed: "فاشلة", running: "جارٍ", skipped: "متخطّاة" };
  const MODE_AR: Record<string, string> = { api: "واجهة برمجية (API)", scrape: "قراءة صفحات (مُرخّصة فقط)" };

  return (
    <div>
      <AdminHead
        title="خط البيانات (Pipeline)"
        subtitle="المصادر · الأولوية · الجدولة · الأرشيف الخام · سجل التشغيلات"
        action={
          <span className="rounded-[3px] border border-navy-800 px-2.5 py-1.5 text-[11px] font-bold">
            الإعداد من: <span className="num">{status.configOrigin}</span> · القاعدة: {status.database ? "متّصلة" : "غير متّصلة"}
          </span>
        }
      />

      {!status.database && (
        <p className="mb-5 rounded-[6px] border border-live/40 bg-live/10 px-4 py-3 text-[13px] leading-6 text-live">
          <span className="num">DATABASE_URL</span> غير مضبوط: التشغيل يعمل لكن بلا سجل تشغيلات ولا أرشيف خام. شغّل
          {" "}<span className="num">npm run db:setup</span> بعد ضبط المتغيّر.
        </p>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { k: "مصادر قابلة للاستدعاء", v: `${status.sources.filter((s) => s.callable).length}/${status.sources.length}` },
          { k: "مهام مجدولة", v: status.jobs.length },
          { k: "صفوف أرشيف خام", v: status.raw.rows },
          { k: "صراعات مفتوحة", v: status.conflicts.total },
        ].map((x) => (
          <div key={x.k} className="rounded-[6px] border border-navy-800 bg-navy-900 p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">{x.k}</p>
            <p className="num mt-1 text-2xl font-extrabold">{x.v}</p>
          </div>
        ))}
      </div>

      {status.warnings.length > 0 && (
        <div className="mb-5 rounded-[6px] border border-warn/40 bg-warn/10 px-4 py-3 text-[12px] leading-6 text-warn">
          {status.warnings.map((w) => (
            <p key={w}>· {w}</p>
          ))}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="المصادر بترتيب الأولوية (1 = الأعلى)">
          <Table
            head={["#", "المصدر", "النمط", "مُفعّل", "قابل للاستدعاء", "نقاط نهاية غير مُتحقَّقة"]}
            rows={status.sources.map((s) => [
              <span key="r" className="num font-bold">{s.rank + 1}</span>,
              <span key="n">
                <span className="font-bold">{s.label_ar}</span>
                <span className="num block text-[10px] text-white/40">{s.name}</span>
              </span>,
              <span key="m" className="text-[11px]">{MODE_AR[s.mode] ?? s.mode}</span>,
              <span key="e" className="num">{s.enabled ? "نعم" : "لا"}</span>,
              s.callable ? (
                <Pill key="c" tone="ok">متاح</Pill>
              ) : (
                <span key="c" className="text-[11px] text-white/45">{s.blocked_by.join(" · ") || "—"}</span>
              ),
              <span key="v" className="num text-[11px] text-white/50">
                {s.unverified_endpoints.length ? s.unverified_endpoints.join(", ") : "—"}
              </span>,
            ])}
          />
          <p className="mt-3 text-[11px] leading-5 text-white/40">
            نقاط النهاية غير المُتحقَّقة لا تُستدعى إطلاقًا إلا بعد تأكيدها من التوثيق الرسمي للمصدر
            (<span className="num">verified: true</span> في <span className="num">config/pipeline/endpoints.yml</span>)، أو بفحص يدوي عبر
            {" "}<span className="num">PIPELINE_ALLOW_UNVERIFIED_ENDPOINTS=1</span>. مصادر القراءة من الصفحات تبقى مغلقة
            حتى تأكيد الترخيص (<span className="num">scraping_licensed</span> + <span className="num">PIPELINE_SCRAPING_LICENSED=1</span>).
          </p>
        </Panel>

        <Panel title="المهام وجدول التحديث">
          <Table
            head={["المهمة", "كل", "أيام المباريات", "آخر تشغيل", "الحالة", "تنفيذ"]}
            rows={status.jobs.map((j) => [
              <span key="n">
                <span className="num font-bold">{j.name}</span>
                {j.description ? <span className="block text-[10px] text-white/40">{j.description}</span> : null}
              </span>,
              <span key="i" className="num">{j.interval_minutes} د</span>,
              <span key="m" className="num">{j.matchday_interval_minutes ? `${j.matchday_interval_minutes} د` : "—"}</span>,
              <span key="l" className="num text-[11px] text-white/50">{j.lastRun ? time(j.lastRun.startedAt) : "—"}</span>,
              j.lastRun ? (
                <Pill key="s" tone={runTone(j.lastRun.status)}>{RUN_AR[j.lastRun.status] ?? j.lastRun.status}</Pill>
              ) : (
                <Pill key="s" tone="idle">لم تُشغَّل</Pill>
              ),
              <PipelineRunButton key="b" job={j.name} />,
            ])}
          />
          <p className="mt-3 text-[11px] leading-5 text-white/40">
            «أيام المباريات» تُطبَّق تلقائيًا عند وجود مباراة مباشرة أو تنطلق خلال ٣ ساعات
            (٣ دقائق للمباريات، ٦٠ دقيقة للترتيب) — وهو ما يطابق قاعدة ٢–٥ دقائق في التكليف.
          </p>
        </Panel>

        <Panel title="آخر التشغيلات">
          <Table
            head={["المهمة", "المصدر", "الحالة", "جُلب", "جديد", "محدَّث", "صراعات", "المدة", "البداية"]}
            rows={status.runs.map((r) => [
              <span key="j" className="num font-bold">{r.job}</span>,
              <span key="s" className="num">{r.source ?? "—"}</span>,
              <Pill key="st" tone={runTone(r.status)}>{RUN_AR[r.status] ?? r.status}</Pill>,
              <span key="f" className="num">{r.stats.fetched ?? 0}</span>,
              <span key="c" className="num text-gold-400">{r.stats.created ?? 0}</span>,
              <span key="u" className="num">{r.stats.updated ?? 0}</span>,
              <span key="x" className="num">{r.stats.conflicts ?? 0}</span>,
              <span key="d" className="num text-[11px] text-white/50">{r.durationMs ? `${r.durationMs} ms` : "—"}</span>,
              <span key="t" className="num text-[11px] text-white/50">{time(r.startedAt)}</span>,
            ])}
          />
          {status.runs.length === 0 && (
            <p className="text-[12px] text-white/45">لا يوجد سجل بعد — شغّل مهمة من الزر أعلاه أو انتظر الـ Cron.</p>
          )}
        </Panel>

        <Panel title="الأرشيف الخام والصراعات">
          <Table
            head={["البند", "القيمة"]}
            rows={[
              ["صفوف محفوظة", <span key="1" className="num">{status.raw.rows}</span>],
              ["الحجم التقريبي", <span key="2" className="num">{Math.round(status.raw.bytes / 1024)} KiB</span>],
              ["أقدم صف", <span key="3" className="num text-[11px]">{time(status.raw.oldest)}</span>],
              ["أحدث صف", <span key="4" className="num text-[11px]">{time(status.raw.newest)}</span>],
              ["فشل/4xx خلال ٢٤ ساعة", <span key="5" className="num">{status.raw.failures24h}</span>],
              ["صراعات حرجة", <span key="6" className="num text-live">{status.conflicts.critical}</span>],
              ["صراعات عالية", <span key="7" className="num">{status.conflicts.high}</span>],
            ]}
          />
          <p className="mt-3 text-[11px] leading-5 text-white/40">
            كل استجابة تُحفظ كما وصلت (مع تعويض أي مفتاح بـ <span className="num">***</span>) لتبقى أي منازعة قابلة
            للمراجعة دون إعادة استهلاك حصة المصدر. عند اختلاف مصدرين تُطبَّق الأولوية، ويُسجَّل الطرف الآخر في
            <span className="num"> data_conflicts</span>.
          </p>
        </Panel>
      </div>

      <Panel title="حالة المزامنة لكل مصدر">
        <Table
          head={["المصدر", "المهمة", "آخر نجاح", "آخر محاولة", "فشل متتابع", "الاستحقاق القادم", "آخر خطأ"]}
          rows={status.jobs.flatMap((j) =>
            j.states.map((s) => [
              <span key="s" className="num font-bold">{s.source}</span>,
              <span key="j" className="num">{s.job}</span>,
              <span key="ok" className="num text-[11px]">{time(s.lastSuccessAt)}</span>,
              <span key="at" className="num text-[11px]">{time(s.lastAttemptAt)}</span>,
              <span key="f" className="num">{s.consecutiveFailures}</span>,
              <span key="n" className="num text-[11px]">{time(s.nextDueAt)}</span>,
              <span key="e" className="text-[11px] text-white/45">{s.lastError ?? "—"}</span>,
            ]),
          )}
        />
        {status.jobs.every((j) => j.states.length === 0) && (
          <p className="text-[12px] text-white/45">لا توجد حالة محفوظة بعد (تُكتب عند أول تشغيل ناجح لكل مصدر).</p>
        )}
      </Panel>
    </div>
  );
}
