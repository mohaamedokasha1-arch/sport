import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "إفصاح حقوق البث",
  description: "كيف نتعامل مع حقوق البث: مصادر رسمية فقط، لا إعادة بث، وإفصاح كامل عن الناقل.",
  alternates: { canonical: "/broadcast-rights" },
};

const allowed = [
  "الربط إلى صفحة الناقل الرسمي.",
  "تضمين مشغّل الناقل (Embed) عندما تسمح شروطه بذلك صراحة.",
  "عرض اسم الناقل والمناطق المسموح بها وحالة البث.",
  "عرض ملخصات نصية وصور نملك حقها أو مرخّصة لنا.",
];

const forbidden = [
  "نسخ البث أو إعادة بثه على خوادمنا.",
  "استخراج الإشارة (Stream) من منصة أخرى وبثها.",
  "استخدام VPN أو أي وسيلة لتجاوز القيود الجغرافية.",
  "عرض روابط من مواقع بث غير قانونية أو مواقع مراهنات.",
];

export default function BroadcastRightsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow mb-2">Broadcast Disclosure</p>
      <h1 className="text-3xl font-extrabold tracking-tight">إفصاح حقوق البث</h1>

      <div className="mt-6 space-y-4 text-[15px] leading-[1.9]">
        <p>
          حقوق بث المسابقات الرياضية مملوكة للاتحادات والروابط والنواقل المرخّصين، وتختلف
          من منطقة إلى أخرى. نلتزم في نيمو سبورتس بقاعدة واحدة بسيطة:{" "}
          <strong>لا نُظهر رابط بث إلا إذا تأكدنا أن صاحبه يملك الحق في بثّه لمنطقتك.</strong>
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-extrabold text-win">
            <span aria-hidden>✅</span> ما نفعله
          </h2>
          <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted">
            {allowed.map((x) => (
              <li key={x}>• {x}</li>
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-extrabold text-live">
            <span aria-hidden>⛔</span> ما لا نفعله أبدًا
          </h2>
          <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted">
            {forbidden.map((x) => (
              <li key={x}>• {x}</li>
            ))}
          </ul>
        </div>
      </div>

      <h2 className="mt-8 text-[17px] font-extrabold">إجراءات قبول ناقل جديد</h2>
      <ol className="mt-3 space-y-2 text-[14px] leading-relaxed text-muted">
        <li><span className="num font-bold text-ink">1.</span> التحقق من امتلاك المصدر حقوق البث في المنطقة المطلوبة.</li>
        <li><span className="num font-bold text-ink">2.</span> مراجعة شروط الاستخدام والتأكد من سماحها بالربط أو التضمين.</li>
        <li><span className="num font-bold text-ink">3.</span> توثيق الموافقة (عقد أو رسالة رسمية) في لوحة التحكم.</li>
        <li><span className="num font-bold text-ink">4.</span> تسجيل: اسم المصدر، نوع الترخيص، المناطق، حالة الموافقة.</li>
        <li><span className="num font-bold text-ink">5.</span> النشر للزوار فقط بعد تحوّل الحالة إلى «موثّق».</li>
      </ol>

      <div className="mt-8 card p-5">
        <h2 className="text-[15px] font-extrabold">هل أنت ناقل رسمي؟</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          إن كنت تملك حقوق بث في منطقتك وترغب في ظهور منصتك، أرسل ما يثبت الترخيص عبر صفحة
          اتصل بنا. نضيف الرابط بعد التحقق، ونعرض اسمك بوضوح كجهة النقل.
        </p>
      </div>

      <p className="mt-6 text-[12px] leading-relaxed text-muted">
        ملاحظة: أسماء النواقل الواردة في هذه النسخة التجريبية معروضة كمثال على بنية السجل،
        وليست إقرارًا باتفاق قائم. في الإنتاج لا يُنشر أي ناقل قبل اكتمال التوثيق.
      </p>
    </div>
  );
}
