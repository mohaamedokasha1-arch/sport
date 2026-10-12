import { AdminHead, NotConnected, Panel } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin-session";

export default async function AdminAds() {
  await requirePermission("settings");
  return (
    <div>
      <AdminHead
        title="الإعلانات والرعاية"
        subtitle="إرشادات الإفصاح فقط · إدارة الحملات غير موصولة بمخزن إعلاني"
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Panel title="مواضع الإعلانات">
            <NotConnected
              title="لا توجد مواضع إعلانية محمّلة"
              message="لا يقرأ هذا القسم مواضع أو نسب إشغال من مصدر موثوق؛ لذلك لن يعرض أمثلة ثابتة على أنها إعلانات نشطة."
              requires="تكامل ومخزن إعلانات موثوق"
            />
          </Panel>

          <Panel title="الحملات">
            <NotConnected
              title="لا توجد حملات موصولة"
              message="لا توجد سجلات حملات محفوظة في هذا التطبيق، كما أن إجراءات التعديل والإيقاف غير متصلة."
              requires="مخزن حملات قبل عرضها أو إدارتها"
            />
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="إضافة حملة">
            <NotConnected
              title="إنشاء الحملات غير متاح"
              message="لن نقبل إدخالات توحي بالحفظ قبل ربط نموذج بصلاحيات ومخزن دائم؛ لا يتم حفظ أي شيء من هذه الصفحة حاليًا."
              requires="مسار حفظ دائم ومراجع"
            />
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
