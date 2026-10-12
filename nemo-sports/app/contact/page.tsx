import type { Metadata } from "next";
import Link from "next/link";
import { getSiteSettingsCached } from "@/lib/site-settings";

export const metadata: Metadata = {
  title: "اتصل بنا",
  description: "حالة قنوات التواصل العامة في نيمو سبورتس وسياسات الحقوق والخصوصية.",
  alternates: { canonical: "/contact" },
  // Static, always-listed page in app/sitemap.ts: do not inherit the data-dependent root robots.
  robots: { index: true, follow: true },
};

/** A plain address only — shown when the operator has saved one in /admin/settings. */
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

export default async function ContactPage() {
  // The address is operator-entered (site_settings.contactEmail). Nothing is invented:
  // without a saved, well-formed address the page keeps the honest "no channel" notice.
  const settings = await getSiteSettingsCached();
  const email = settings.contactEmail.trim();
  const hasEmail = EMAIL_RE.test(email);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow mb-2">قنوات التواصل</p>
      <h1 className="text-3xl font-extrabold tracking-tight">اتصل بنا</h1>
      {hasEmail ? (
        <section className="card mt-6 p-5" aria-labelledby="contact-email">
          <h2 id="contact-email" className="text-[15px] font-extrabold">البريد العام للتواصل</h2>
          <p className="mt-2 text-[13px] leading-6 text-muted">
            للتواصل العام عبر البريد المنشور من المشغّل:{" "}
            <a href={`mailto:${email}`} dir="ltr" className="num font-bold text-gold-600 underline-offset-2 hover:underline dark:text-gold-400">
              {email}
            </a>
          </p>
        </section>
      ) : (
        <section className="card mt-6 p-5" aria-labelledby="contact-status">
          <h2 id="contact-status" className="text-[15px] font-extrabold">لا توجد قناة مراسلة عامة مفعّلة حاليًا</h2>
          <p className="mt-2 text-[13px] leading-6 text-muted">
            لا يوجد بريد تواصل منشور أو نموذج إرسال موصول بخادم. أزلنا حقول الإرسال غير العاملة حتى لا تُدخل بياناتك في نموذج لا يرسلها. سنعرض بيانات التواصل هنا إذا أُعدّت
          </p>
        </section>
      )}

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
