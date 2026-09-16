import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "اتصل بنا",
  description: "تواصل مع فريق نيمو سبورتس: تصحيح خبر، إضافة ناقل رسمي، أو شراكة إعلانية.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow mb-2">Contact</p>
      <h1 className="text-3xl font-extrabold tracking-tight">اتصل بنا</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-muted">
        نرد على الرسائل خلال يومين عمل. اختر القسم المناسب لرسالتك لتصل أسرع.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { t: "تصحيح خبر أو نتيجة", d: "أرسل الرابط والرقم الصحيح والمصدر." },
          { t: "إضافة ناقل رسمي", d: "أرفق ما يثبت ملكية حقوق البث في منطقتك." },
          { t: "شراكة ورعاية", d: "مساحات إعلانية ومحتوى برعاية واضحة الإفصاح." },
        ].map((c) => (
          <div key={c.t} className="card p-4">
            <h2 className="text-[13px] font-extrabold">{c.t}</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">{c.d}</p>
          </div>
        ))}
      </div>

      <form className="card mt-6 space-y-4 p-5" action="#" method="post">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-bold">الاسم</span>
            <input
              name="name"
              className="w-full rounded-[3px] border border-line bg-surface px-3 py-2.5 text-[13px] outline-none focus:border-gold-500"
              placeholder="اسمك الكامل"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-bold">البريد الإلكتروني</span>
            <input
              type="email"
              name="email"
              className="w-full rounded-[3px] border border-line bg-surface px-3 py-2.5 text-[13px] outline-none focus:border-gold-500"
              placeholder="you@example.com"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[12px] font-bold">الموضوع</span>
          <select
            name="topic"
            className="w-full rounded-[3px] border border-line bg-surface px-3 py-2.5 text-[13px] outline-none focus:border-gold-500"
          >
            <option>تصحيح خبر أو نتيجة</option>
            <option>إضافة ناقل بث رسمي</option>
            <option>شراكة / رعاية</option>
            <option>بلاغ عن محتوى مخالف</option>
            <option>أخرى</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[12px] font-bold">الرسالة</span>
          <textarea
            name="message"
            rows={5}
            className="w-full rounded-[3px] border border-line bg-surface px-3 py-2.5 text-[13px] outline-none focus:border-gold-500"
            placeholder="اكتب تفاصيل رسالتك…"
          />
        </label>

        <p className="text-[11px] text-muted">
          بإرسال الرسالة أنت توافق على{" "}
          <a href="/privacy" className="font-bold text-gold-600 dark:text-gold-400">سياسة الخصوصية</a>.
          النموذج في هذه النسخة التجريبية غير موصول بخادم بريد.
        </p>

        <button
          type="submit"
          className="rounded-[3px] bg-gold-500 px-5 py-2.5 text-[12px] font-extrabold text-navy-900 transition hover:bg-gold-400"
        >
          إرسال الرسالة
        </button>
      </form>
    </div>
  );
}
