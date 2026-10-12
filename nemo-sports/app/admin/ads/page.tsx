import { AdminHead, Panel, Table, Pill, Field, inputCls } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin-session";

const slots = [
  { name: "أعلى الصفحة (Leaderboard)", size: "728×90", fill: "AdSense — برنامجي", status: "نشط" },
  { name: "الشريط الجانبي (Rectangle)", size: "300×250", fill: "حملة نايكي — رعاية", status: "نشط" },
  { name: "منتصف المقال (In-article)", size: "Responsive", fill: "AdSense — برنامجي", status: "نشط" },
  { name: "صفحة المباراة (Match)", size: "300×250", fill: "فارغ", status: "فارغ" },
  { name: "أسفل الصفحة (Footer)", size: "728×90", fill: "—", status: "موقوف" },
];

/**
 * This page is a static display. Nothing below is read from a database, and
 * nothing here controls what the public site renders: the public layout loads
 * no ad script and the repository has no ads.txt. Statuses are therefore shown
 * as "مسجَّل يدويًا — غير مُتحقَّق" rather than "نشط". Verifying a live ad
 * requires the ad network's own console and the public site, not this table.
 */
const UNVERIFIED = "مسجَّل يدويًا — غير مُتحقَّق";

const campaigns = [
  { name: "رعاية نايكي — موسم 2026", type: "Sponsored", from: "2026-08-01", to: "2027-05-31", status: "نشط" },
  { name: "متجر أطقم الفرق (Affiliate)", type: "Affiliate", from: "2026-07-10", to: "2026-12-31", status: "نشط" },
  { name: "اشتراك نيمو بريميوم", type: "House", from: "2026-09-01", to: "2026-10-01", status: "نشط" },
  { name: "حملة تطبيق الهاتف", type: "Banner", from: "2026-05-01", to: "2026-06-30", status: "منتهٍ" },
];

export default async function AdminAds() {
  await requirePermission("settings");
  return (
    <div>
      <AdminHead
        title="الإعلانات والرعاية"
        subtitle="الإعلانات مفصولة بصريًا عن التحرير · المحتوى المموّل يُوسم صراحة"
        action={
          <button
            type="button"
            disabled
            title="غير مفعّل بعد — لا يوجد مخزن للحملات"
            className="rounded-[3px] border border-navy-700 px-3.5 py-2 text-[12px] font-extrabold text-white/40 cursor-not-allowed"
          >
            + حملة جديدة (غير مفعّل)
          </button>
        }
      />

      <div className="mb-4 rounded-[3px] border border-gold-500/40 bg-gold-500/10 px-4 py-3 text-[12px] leading-relaxed text-white/80">
        <strong className="font-extrabold">تنبيه:</strong> هذه الصفحة عرض تخطيطي ثابت ولا تعكس حالة الإعلانات الفعلية على الموقع
        أو حالة الحساب لدى أي شبكة إعلانية. لا توجد هنا قراءة من قاعدة البيانات، ولا يوجد حفظ لهذه البيانات بعد.
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Panel title="مواضع الإعلانات">
            <Table
              head={["الموضع", "المقاس", "الإشغال", "الحالة", "إجراء"]}
              rows={slots.map((s) => [
                <span key="n" className="font-bold">{s.name}</span>,
                <span key="s" className="num text-white/60">{s.size}</span>,
                <span key="f" className="text-white/60">{s.fill}</span>,
                <Pill key="st" tone="warn">{UNVERIFIED}</Pill>,
                <button key="a" type="button" disabled title="غير مفعّل — لا يوجد مخزن لهذه البيانات بعد" className="cursor-not-allowed rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/40">
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
                <Pill key="s" tone="warn">{c.status === "منتهٍ" ? "منتهٍ حسب التاريخ المسجَّل" : UNVERIFIED}</Pill>,
                <button key="a" type="button" disabled title="غير مفعّل — لا يوجد مخزن لهذه البيانات بعد" className="cursor-not-allowed rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/40">
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
              <button
                type="button"
                disabled
                className="rounded-[3px] border border-navy-700 px-3.5 py-2 text-[12px] font-extrabold text-white/40 cursor-not-allowed"
              >
                حفظ الحملة (غير مفعّل)
              </button>
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
