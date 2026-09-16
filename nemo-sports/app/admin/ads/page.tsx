import { AdminHead, Btn, Panel, Table, Pill, Field, inputCls } from "@/components/admin/ui";

const slots = [
  { name: "أعلى الصفحة (Leaderboard)", size: "728×90", fill: "AdSense — برنامجي", status: "نشط" },
  { name: "الشريط الجانبي (Rectangle)", size: "300×250", fill: "حملة نايكي — رعاية", status: "نشط" },
  { name: "منتصف المقال (In-article)", size: "Responsive", fill: "AdSense — برنامجي", status: "نشط" },
  { name: "صفحة المباراة (Match)", size: "300×250", fill: "فارغ", status: "فارغ" },
  { name: "أسفل الصفحة (Footer)", size: "728×90", fill: "—", status: "موقوف" },
];

const campaigns = [
  { name: "رعاية نايكي — موسم 2026", type: "Sponsored", from: "2026-08-01", to: "2027-05-31", status: "نشط" },
  { name: "متجر أطقم الفرق (Affiliate)", type: "Affiliate", from: "2026-07-10", to: "2026-12-31", status: "نشط" },
  { name: "اشتراك نيمو بريميوم", type: "House", from: "2026-09-01", to: "2026-10-01", status: "نشط" },
  { name: "حملة تطبيق الهاتف", type: "Banner", from: "2026-05-01", to: "2026-06-30", status: "منتهٍ" },
];

export default function AdminAds() {
  return (
    <div>
      <AdminHead
        title="الإعلانات والرعاية"
        subtitle="الإعلانات مفصولة بصريًا عن التحرير · المحتوى المموّل يُوسم صراحة"
        action={<Btn>+ حملة جديدة</Btn>}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Panel title="مواضع الإعلانات">
            <Table
              head={["الموضع", "المقاس", "الإشغال", "الحالة", "إجراء"]}
              rows={slots.map((s) => [
                <span key="n" className="font-bold">{s.name}</span>,
                <span key="s" className="num text-white/60">{s.size}</span>,
                <span key="f" className="text-white/60">{s.fill}</span>,
                <Pill key="st" tone={s.status === "نشط" ? "ok" : s.status === "فارغ" ? "idle" : "warn"}>{s.status}</Pill>,
                <button key="a" type="button" className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400">
                  تغيير
                </button>,
              ])}
            />
          </Panel>

          <Panel title="الحملات">
            <Table
              head={["الحملة", "النوع", "من", "إلى", "الحالة", "إجراء"]}
              rows={campaigns.map((c) => [
                <span key="n" className="font-bold">{c.name}</span>,
                <Pill key="t" tone="idle">{c.type}</Pill>,
                <span key="f" className="num text-white/60">{c.from}</span>,
                <span key="t2" className="num text-white/60">{c.to}</span>,
                <Pill key="s" tone={c.status === "نشط" ? "ok" : "idle"}>{c.status}</Pill>,
                <button key="a" type="button" className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400">
                  تعديل
                </button>,
              ])}
            />
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="إضافة حملة">
            <div className="space-y-3">
              <Field label="اسم الحملة">
                <input className={inputCls} placeholder="اسم المعلن" />
              </Field>
              <Field label="النوع">
                <select className={inputCls}>
                  <option>Banner</option>
                  <option>Sponsored Content</option>
                  <option>Affiliate</option>
                  <option>House (ترويج داخلي)</option>
                </select>
              </Field>
              <Field label="الموضع">
                <select className={inputCls}>
                  {slots.map((s) => (
                    <option key={s.name}>{s.name}</option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="من">
                  <input type="date" className={inputCls} />
                </Field>
                <Field label="إلى">
                  <input type="date" className={inputCls} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-[12px]">
                <input type="checkbox" defaultChecked className="accent-[#D4AF37]" />
                إضافة وسم «إعلان» / «محتوى برعاية»
              </label>
              <Btn>حفظ الحملة</Btn>
            </div>
          </Panel>

          <Panel title="قواعد الإفصاح">
            <ul className="space-y-2 text-[11px] leading-relaxed text-white/55">
              <li>• لا يخلط الإعلان بالمحتوى التحريري؛ لكل إعلان إطار ووسم واضح.</li>
              <li>• المحتوى المموّل يحمل عبارة «محتوى برعاية من [الجهة]» في أعلى المقال.</li>
              <li>• روابط الأفيليت تُوسم بـ rel="sponsored nofollow".</li>
              <li>• لا تُقبل إعلانات لمواقع بث غير مرخّصة أو مراهنات غير قانونية.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
