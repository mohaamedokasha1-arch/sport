import type { Metadata } from "next";
import Link from "next/link";
import { demoContentVisible } from "@/lib/site";

export const metadata: Metadata = {
  title: "من نحن — نيمو سبورتس",
  description: "تعرف على طريقة عرض نيمو سبورتس للبيانات الرياضية ومصادرها وسياسة حقوق البث.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  const preview = demoContentVisible();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow mb-2">عن نيمو سبورتس</p>
      <h1 className="text-3xl font-extrabold tracking-tight">من نحن</h1>

      <div className="mt-6 space-y-4 text-[15px] leading-[1.9]">
        <p>
          <strong>نيمو سبورتس (NEMO Sports)</strong> واجهة عربية لمواعيد المباريات ونتائجها والبطولات والأخبار، ضمن نطاق البيانات التي يمكن استرجاعها والتحقق منها. تختلف التغطية بحسب الرياضة والبطولة والمصدر.
        </p>
        <p>
          نوضح مصدر البيانات وتوقيت آخر تحديث عند توفرهما. إذا لم تصل بيانات موثوقة، نعرض حالة عدم التوفر بدلًا من إنشاء نتيجة أو إحصائية تقديرية. كما لا نعرض رابط بث إلا بعد توثيق مصدر رسمي وحقوقه ومناطقه.
        </p>
        <p>نعمل وفق مبادئ واضحة:</p>
        <ul className="space-y-2 pe-4">
          <li>• <strong>التحقق والشفافية</strong>: عدم إخفاء نقص البيانات أو حالتها القديمة.</li>
          <li>• <strong>احترام الحقوق</strong>: لا إعادة بث، ولا روابط غير مرخّصة، ولا نسخ لمحتوى الناشرين.</li>
          <li>• <strong>إتاحة الاستخدام</strong>: واجهة عربية من اليمين إلى اليسار، ووضع داكن، وتصميم يستجيب لأحجام الشاشات المختلفة.</li>
        </ul>
        <p>
          لا تُنشأ صفحات تفاصيل قابلة للفهرسة إلا عندما تسمح استجابة المصدر بعرض بيانات حقيقية ذات هوية واضحة. وقد تبقى بعض صفحات الفرق أو اللاعبين أو المباريات غير متاحة عند غياب بيانات المصدر.
        </p>
      </div>

      <div className="mt-8 card p-5">
        <h2 className="text-[15px] font-extrabold">حالة البيانات</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          قد تتأخر المصادر أو تتوقف، وقد لا تغطي كل البطولات. لا نضمن توافر تحديث حي دائم، ولا نعرض بيانات بديلة مصطنعة عند انقطاع المصدر.
        </p>
        {preview ? (
          <p className="mt-3 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[12px] font-semibold leading-relaxed text-muted">
            هذه بيئة معاينة؛ قد تحتوي بعض الصفحات على بيانات توضيحية للتطوير، وتُوسم بوضوح ولا تمثل نتائج أو إحصاءات فعلية.
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/matches" className="inline-flex min-h-11 items-center rounded-[3px] bg-navy-850 px-4 py-2 text-[12px] font-bold text-white transition hover:bg-navy-700 focus-ring">
            تصفّح المباريات
          </Link>
          <Link href="/broadcast-rights" className="inline-flex min-h-11 items-center rounded-[3px] border border-line px-4 py-2 text-[12px] font-bold transition hover:border-gold-500 focus-ring">
            سياسة حقوق البث
          </Link>
        </div>
      </div>
    </div>
  );
}
