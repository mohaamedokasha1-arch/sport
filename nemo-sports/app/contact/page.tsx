import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "اتصل بنا",
  description: "حالة قنوات التواصل العامة في نيمو سبورتس وسياسات الحقوق والخصوصية.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow mb-2">قنوات التواصل</p>
      <h1 className="text-3xl font-extrabold tracking-tight">اتصل بنا</h1>
      <section className="card mt-6 p-5" aria-labelledby="contact-status">
        <h2 id="contact-status" className="text-[15px] font-extrabold">لا توجد قناة مراسلة عامة مفعّلة حاليًا</h2>
        <p className="mt-2 text-[13px] leading-6 text-muted">
          لا يوجد بريد تواصل منشور أو نموذج إرسال موصول بخادم. أزلنا حقول الإرسال غير العاملة حتى لا تُدخل بياناتك في نموذج لا يرسلها. سنعرض بيانات التواصل هنا إذا أُعدّت قناة استقبال موثوقة.
        </p>
      </section>

      <nav aria-label="صفحات ذات صلة" className="mt-5 flex flex-wrap gap-3">
        <Link href="/broadcast-rights" className="inline-flex min-h-11 items-center rounded-[3px] border border-line bg-surface px-4 py-2 text-[12px] font-bold transition hover:border-gold-500 focus-ring">
          سياسة حقوق البث
        </Link>
        <Link href="/privacy" className="inline-flex min-h-11 items-center rounded-[3px] border border-line bg-surface px-4 py-2 text-[12px] font-bold transition hover:border-gold-500 focus-ring">
          سياسة الخصوصية
        </Link>
        <Link href="/terms" className="inline-flex min-h-11 items-center rounded-[3px] border border-line bg-surface px-4 py-2 text-[12px] font-bold transition hover:border-gold-500 focus-ring">
          شروط الاستخدام
        </Link>
      </nav>
    </div>
  );
}
