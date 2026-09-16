import { AdminHead, Panel, Pill, Table } from "@/components/admin/ui";
import { diagnostics, chainFor } from "@/lib/sdl-gateway";

export const dynamic = "force-dynamic";

/**
 * مزوّدو البيانات — انعكاس حيّ لحالة طبقة البيانات (§10.3، §13)
 * ────────────────────────────────────────────────────────────
 * كل رقم هنا يُقرأ من `SportsDataLayer.diagnostics()` وقت الطلب، فلا يوجد
 * أي حالة وهمية: ما تراه هو ما يفعله النظام فعلًا الآن.
 */
export default async function AdminProviders() {
  const [d, liveChain, eventsChain, fixturesChain, standingsChain, imagesChain] = await Promise.all([
    diagnostics(),
    chainFor("football", null, "live_matches"),
    chainFor("football", null, "match_events"),
    chainFor("football", null, "fixtures"),
    chainFor("football", null, "standings"),
    chainFor("football", null, "images"),
  ]);
  const healthByName = new Map(d.health.map((h) => [h.provider, h]));

  const statusTone = (s: string): "ok" | "warn" | "bad" | "idle" =>
    s === "healthy" ? "ok" : s === "degraded" || s === "rate_limited" ? "warn" : s === "down" || s === "disabled" ? "bad" : "idle";

  const statusAr: Record<string, string> = {
    healthy: "سليم",
    degraded: "متدهور",
    rate_limited: "مقيّد",
    down: "منقطع",
    disabled: "معطّل",
  };

  const fmt = (l: { provider: string; role: string }[]) => l.map((x) => `${x.provider} (${x.role})`).join(" ← ");
  const chains: { dataType: string; chain: string }[] = [
    { dataType: "live_matches", chain: fmt(liveChain) },
    { dataType: "match_events", chain: fmt(eventsChain) },
    { dataType: "fixtures", chain: fmt(fixturesChain) },
    { dataType: "standings", chain: fmt(standingsChain) },
    { dataType: "images", chain: fmt(imagesChain) },
  ];

  return (
    <div>
      <AdminHead
        title="مزوّدو البيانات"
        subtitle="الصحة · الأولويات · التكلفة · الكاش · الصراعات — قراءة حية من طبقة البيانات"
        action={
          <span className="rounded-[3px] border border-navy-800 px-2.5 py-1.5 text-[11px] font-bold">
            الوضع: {d.mode === "live" ? "مزوّدون حقيقيون" : "بيانات تجريبية (بلا مفاتيح)"}
          </span>
        }
      />

      {d.mode === "demo" && (
        <p className="mb-5 rounded-[6px] border border-gold-500/40 bg-gold-500/10 px-4 py-3 text-[13px] leading-6 text-gold-300">
          لا توجد مفاتيح مزوّدين مُهيّأة حاليًا ({d.missing.join("، ")}). تعمل الطبقة على محوّل
          «demo» حتى تبقى المنصة قابلة للتشغيل، وكل استجابة تحمل <span className="num font-bold">source=&quot;demo&quot;</span>{" "}
          وتُوسم صفحاتها بأنها غير مفهرسة. أضف المفاتيح في متغيرات البيئة للانتقال إلى البيانات الحقيقية.
        </p>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { k: "مزوّدون مسجَّلون", v: d.providers.length },
          { k: "طلبات فعلية", v: d.cost.reduce((a, c) => a + c.calls, 0) },
          { k: "استدعاءات تجنّبناها", v: d.cost.reduce((a, c) => a + c.avoided + c.cacheHits + c.coalesced, 0) },
          { k: "صراعات مفتوحة", v: d.conflicts.open },
        ].map((x) => (
          <div key={x.k} className="rounded-[6px] border border-navy-800 bg-navy-900 p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">{x.k}</p>
            <p className="num mt-1 text-2xl font-extrabold">{x.v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="حالة المزوّدين">
          <Table
            head={["المزوّد", "الحالة", "متاح", "فشل متتابع", "آخر نجاح"]}
            rows={d.providers.map((p) => {
              const h = healthByName.get(p.name);
              return [
                <span key="n" className="num font-bold">{p.name}</span>,
                <Pill key="s" tone={statusTone(p.health)}>{statusAr[p.health] ?? p.health}</Pill>,
                <span key="a" className="num">{p.available ? "نعم" : "لا"}</span>,
                <span key="f" className="num">{h?.consecutiveFailures ?? 0}</span>,
                <span key="t" className="num text-[11px] text-white/50">{h?.lastSuccessAt ? new Date(h.lastSuccessAt).toLocaleTimeString("ar-EG") : "—"}</span>,
              ];
            })}
          />
        </Panel>

        <Panel title="سلاسل الأولويات الفعلية (كرة القدم)">
          <Table
            head={["نوع البيانات", "السلسلة المطبَّقة الآن"]}
            rows={chains.map((c) => [
              <span key="d" className="num">{c.dataType}</span>,
              <span key="c" className="num text-[12px]">{c.chain || "لا يوجد مزوّد متاح"}</span>,
            ])}
          />
          <p className="mt-3 text-[11px] leading-5 text-white/40">
            تُحسم السلسلة حسب الرياضة × البطولة × نوع البيانات، ويمكن تجاوزها لكل بطولة من
            جدول <span className="num">provider_priority</span> دون إعادة تشغيل.
          </p>
        </Panel>

        <Panel title="التكلفة (§Instruction 9)">
          <Table
            head={["المزوّد", "استدعاءات", "إصابات كاش", "مدموجة", "تجنّبنا"]}
            rows={d.cost.map((c) => [
              <span key="p" className="num font-bold">{c.provider}</span>,
              <span key="a" className="num">{c.calls}</span>,
              <span key="b" className="num">{c.cacheHits}</span>,
              <span key="c" className="num">{c.coalesced}</span>,
              <span key="d" className="num text-gold-400">{c.avoided}</span>,
            ])}
          />
        </Panel>

        <Panel title="طبقات الكاش">
          <Table
            head={["الطبقة", "إصابة", "خطأ", "نسبة الإصابة"]}
            rows={d.cache.map((c) => [
              <span key="l">{c.layer === "provider_response" ? "استجابة المزوّد (خام)" : "البيانات الكنسية"}</span>,
              <span key="h" className="num">{c.hits}</span>,
              <span key="m" className="num">{c.misses}</span>,
              <span key="r" className="num">{Math.round(c.hitRate * 100)}٪</span>,
            ])}
          />
          <p className="mt-3 text-[11px] leading-5 text-white/40">
            عند انتهاء الحدود يُتخطّى المزوّد بدل إعادة المحاولة، وتُعرض آخر قيمة صالحة
            (<span className="num">stale</span>) بدل الخطأ.
          </p>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="البنية التحتية للبيانات">
          <Table
            head={["المكوّن", "الحالة", "التفاصيل"]}
            rows={[
              [
                <span key="p" className="font-bold">PostgreSQL</span>,
                <Pill key="ps" tone={d.infra.postgres.ok ? "ok" : "idle"}>{d.infra.postgres.ok ? "متّصل" : "غير مُهيّأ"}</Pill>,
                <span key="pd" className="text-[12px] text-white/50">{d.infra.postgres.detail}</span>,
              ],
              [
                <span key="r" className="font-bold">Redis</span>,
                <Pill key="rs" tone={d.infra.redis.ok ? "ok" : "idle"}>{d.infra.redis.ok ? "متّصل" : "غير مُهيّأ"}</Pill>,
                <span key="rd" className="num text-[12px] text-white/50">{d.infra.redis.detail}</span>,
              ],
              [
                <span key="cs" className="font-bold">المخزن الكنسي</span>,
                <Pill key="csp" tone={d.infra.canonical === "postgres" ? "ok" : "warn"}>
                  {d.infra.canonical === "postgres" ? "قاعدة بيانات" : "ذاكرة مؤقتة"}
                </Pill>,
                <span key="csd" className="text-[12px] text-white/50">
                  {d.infra.canonical === "postgres" ? "الكيانات محفوظة ودائمة" : "تُفقد عند إعادة التشغيل — اضبط DATABASE_URL"}
                </span>,
              ],
              [
                <span key="ck" className="font-bold">طبقة الكاش</span>,
                <Pill key="ckp" tone={d.infra.cache === "redis" ? "ok" : "warn"}>
                  {d.infra.cache === "redis" ? "Redis مشترك" : "داخل العملية"}
                </Pill>,
                <span key="ckd" className="text-[12px] text-white/50">
                  {d.infra.cache === "redis" ? "مشترك بين كل النسخ" : "لكل عملية نسخة — اضبط REDIS_URL"}
                </span>,
              ],
            ]}
          />
          <p className="mt-3 text-[11px] leading-5 text-white/40">
            الطبقة تعمل بلا قاعدة بيانات وبلا Redis (ذاكرة داخل العملية)، لكن البيانات الكنسية
            تصبح غير دائمة. هذا الجدول يعكس ما هو موصول فعلًا الآن.
          </p>
        </Panel>

        <Panel title="الصراعات بين المزوّدين">
          {d.conflicts.open === 0 ? (
            <p className="text-[13px] text-white/60">
              لا صراعات مفتوحة. إجمالي المسجَّل: <span className="num font-bold">{d.conflicts.total}</span>{" "}
              (حرجة <span className="num">{d.conflicts.critical}</span> · عالية <span className="num">{d.conflicts.high}</span> ·
              متوسطة <span className="num">{d.conflicts.medium}</span> · منخفضة <span className="num">{d.conflicts.low}</span>).
            </p>
          ) : (
            <p className="text-[13px] text-white/60">
              <span className="num font-bold text-gold-400">{d.conflicts.open}</span> صراع بانتظار قرار المحرّر —
              القيمة المرفوضة لا تُكتب أبدًا في البيانات الكنسية.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
