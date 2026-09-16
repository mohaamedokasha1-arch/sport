import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "من نحن — نيمو سبورتس",
  description: "نيمو سبورتس منصة رياضية شاملة: نتائج مباشرة، أخبار موثوقة، وبث رسمي مرخّص فقط.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow mb-2">About NEMO Sports</p>
      <h1 className="text-3xl font-extrabold tracking-tight">من نحن</h1>

      <div className="mt-6 space-y-4 text-[15px] leading-[1.9]">
        <p>
          <strong>نيمو سبورتس (NEMO Sports)</strong> منصة رياضية شاملة تجمع النتائج المباشرة
          والأخبار والإحصائيات في مكان واحد، وتغطي ثماني رياضات: كرة القدم، كرة السلة، التنس،
          كرة اليد، الكرة الطائرة، البيسبول، الهوكي، والملاكمة.
        </p>
        <p>
          شعارنا <em>«Live Sports, Every Moment»</em> — لأن قيمة المنصة الرياضية تُقاس بدقة
          رقمها وسرعته قبل أي شيء آخر. لذلك نبني نظامًا للبيانات يقوم على مصدر أساسي مرخّص،
          ومصدر بديل يعمل تلقائيًا عند أي انقطاع، وإدخال يدوي كخيار أخير، مع عرض اسم المصدر
          وتوقيت آخر تحديث بشفافية.
        </p>
        <p>
          نلتزم بثلاثة مبادئ لا نساوم عليها:
        </p>
        <ul className="space-y-2 pe-4">
          <li>• <strong>دقة البيانات</strong> قبل السرعة، والسرعة قبل الشكل.</li>
          <li>• <strong>احترام الحقوق</strong>: لا بث غير مرخّص، ولا صور بلا إذن، ولا نسخ محتوى.</li>
          <li>• <strong>تجربة محمولة أولًا</strong>: أغلب جمهورنا يتابع من الهاتف، والتصميم يبدأ من هناك.</li>
        </ul>
        <p>
          المنصة تدعم اللغة العربية واتجاه RTL بشكل كامل، مع وضع داكن، وتصميم يعمل على كل
          المقاسات، وبنية SEO تجعل لكل مباراة وفريق ولاعب صفحة مستقلة قابلة للفهرسة.
        </p>
      </div>

      <div className="mt-8 card p-5">
        <h2 className="text-[15px] font-extrabold">حالة المشروع</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          ما تراه الآن نسخة تنفيذية (Prototype) تعمل ببيانات توضيحية مولّدة محليًا، وتغطي
          المرحلة الأولى من خطة التطوير. في الإنتاج تُستبدل البيانات بمزوّد مرخّص، وتُضاف
          الحسابات والإشعارات ولوحة التحرير الكاملة.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/matches" className="rounded-[3px] bg-navy-850 px-4 py-2 text-[12px] font-bold text-white transition hover:bg-navy-700">
            تصفّح المباريات
          </Link>
          <Link href="/broadcast-rights" className="rounded-[3px] border border-line px-4 py-2 text-[12px] font-bold transition hover:border-gold-500">
            سياسة حقوق البث
          </Link>
        </div>
      </div>
    </div>
  );
}
