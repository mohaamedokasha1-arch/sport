import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "الحسابات غير متاحة حاليًا",
  description: "لا يتوفر حاليًا نظام حسابات أو إشعارات عامة في نيمو سبورتس.",
  alternates: { canonical: "/account" },
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow mb-2">الحسابات</p>
      <h1 className="text-3xl font-extrabold tracking-tight">الحسابات غير متاحة حاليًا</h1>
      <section className="card mt-6 p-5" aria-labelledby="account-status">
        <h2 id="account-status" className="text-[15px] font-extrabold">لا يوجد تسجيل دخول أو إشعارات للمستخدمين</h2>
        <p className="mt-2 text-[13px] leading-6 text-muted">
          لا نجمع كلمات مرور أو بيانات تسجيل دخول عبر هذا الموقع، ولا تتوفر حاليًا إشعارات أهداف. تتوفر تفضيلات محلية دون حساب في صفحة يومي الكروي. أزلنا نماذج المعاينة غير الموصولة حتى لا توحي بوجود خدمة حسابات عاملة.
        </p>
      </section>
      <p className="mt-5 text-[13px] text-muted">
        <Link href="/my-day" className="font-bold underline">افتح يومي الكروي لحفظ المفضلات على جهازك</Link>. يمكنك متابعة الصفحات العامة دون حساب: <Link href="/matches" className="font-bold text-gold-600 dark:text-gold-400">المباريات</Link> ·{" "}
        <Link href="/live" className="font-bold text-gold-600 dark:text-gold-400">المباشر</Link> ·{" "}
        <Link href="/faq" className="font-bold text-gold-600 dark:text-gold-400">الأسئلة الشائعة</Link>.
      </p>
    </div>
  );
}
