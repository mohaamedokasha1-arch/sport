import { AdminHead, Btn, Panel, Table, Pill, Field, inputCls } from "@/components/admin/ui";
import { broadcastPartners, dataSources } from "@/lib/data";
import { competitionBySlug } from "@/lib/core-data";

const tone = { approved: "ok", pending: "warn", rejected: "bad" } as const;
const label = { approved: "موثّق", pending: "قيد المراجعة", rejected: "مرفوض" };

export default function AdminBroadcast() {
  return (
    <div>
      <AdminHead
        title="البث والترخيص"
        subtitle="لا يُنشر أي رابط بث قبل توثيق الترخيص — سجل النواقل ومصادر البيانات"
        action={<Btn>+ ناقل جديد</Btn>}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          { k: "نواقل موثّقة", v: broadcastPartners.filter((p) => p.status === "approved").length },
          { k: "قيد المراجعة", v: broadcastPartners.filter((p) => p.status === "pending").length },
          { k: "مرفوضة", v: broadcastPartners.filter((p) => p.status === "rejected").length },
        ].map((x) => (
          <div key={x.k} className="rounded-[6px] border border-navy-800 bg-navy-900 p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">{x.k}</p>
            <p className="num mt-1 text-2xl font-extrabold">{x.v}</p>
          </div>
        ))}
      </div>

      <Panel title="سجل النواقل">
        <Table
          head={["الناقل", "النوع", "الترخيص", "المناطق", "البطولات", "الحالة", "إجراءات"]}
          rows={broadcastPartners.map((p) => [
            <span key="n" className="font-bold">{p.name}</span>,
            <span key="t" className="text-white/60">{p.type}</span>,
            <span key="l" className="text-white/60">{p.licenseType === "embed" ? "تضمين مسموح" : "رابط خارجي"}</span>,
            <span key="r" className="max-w-[220px] text-white/60">{p.regions.join("، ")}</span>,
            <span key="c" className="max-w-[220px] text-white/60">
              {p.competitions.map((c) => competitionBySlug(c)?.name ?? c).join("، ")}
            </span>,
            <Pill key="s" tone={tone[p.status]}>{label[p.status]}</Pill>,
            <span key="a" className="flex gap-1.5">
              <button type="button" className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400">
                تعديل
              </button>
              <button type="button" className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/60 transition hover:border-gold-500 hover:text-gold-400">
                اختبار الرابط
              </button>
            </span>,
          ])}
        />
      </Panel>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="إضافة ناقل بث">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="اسم المصدر">
              <input className={inputCls} placeholder="مثال: beIN SPORTS" />
            </Field>
            <Field label="الرابط الرسمي">
              <input className={inputCls} placeholder="https://…" />
            </Field>
            <Field label="نوع الترخيص">
              <select className={inputCls}>
                <option>رابط خارجي (External Link)</option>
                <option>تضمين مسموح (Embed)</option>
                <option>خيارات متعددة</option>
              </select>
            </Field>
            <Field label="المناطق المسموح بها">
              <input className={inputCls} placeholder="الشرق الأوسط، شمال أفريقيا" />
            </Field>
            <Field label="حالة الموافقة">
              <select className={inputCls}>
                <option>قيد المراجعة</option>
                <option>موثّق</option>
                <option>مرفوض</option>
              </select>
            </Field>
            <Field label="شهادة الترخيص (PDF/صورة)">
              <div className="grid h-16 place-items-center rounded-[3px] border border-dashed border-navy-700 text-[11px] text-white/40">
                اسحب الملف أو اضغط للرفع
              </div>
            </Field>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-white/45">
            checklist إلزامي قبل النشر: التحقق من ملكية الحقوق في المنطقة · قراءة شروط
            الاستخدام · التأكد من سماحها بالربط/التضمين · حفظ نسخة الموافقة.
          </p>
          <div className="mt-3 flex gap-2">
            <Btn>حفظ للمراجعة</Btn>
            <Btn tone="ghost">اختبار الرابط</Btn>
          </div>
        </Panel>

        <Panel title="مصادر البيانات">
          <ul className="space-y-2 text-[12px]">
            {dataSources.map((d) => (
              <li key={d.id} className="rounded-[3px] border border-navy-800 p-3">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-bold">{d.name}</span>
                  <Pill tone={d.status === "connected" ? "ok" : d.status === "degraded" ? "warn" : "bad"}>
                    {d.status === "connected" ? "متصل" : d.status === "degraded" ? "متذبذب" : "منقطع"}
                  </Pill>
                </span>
                <span className="num mt-1.5 block text-[10px] text-white/45">
                  الكمون {d.latency} · نسبة الخطأ {d.errorRate}% · آخر مزامنة {d.lastSync}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-white/45">
            الترتيب: مصدر أساسي ← مصدر بديل ← إدخال يدوي. عند فشل الجميع تُعرض آخر نتيجة
            محفوظة مع تنبيه للمستخدم وسجل خطأ في لوحة المراقبة.
          </p>
        </Panel>
      </div>
    </div>
  );
}
