import Link from "next/link";
import Logo from "@/components/brand/Logo";

export default function NotFound() {
  return (
    <div className="mx-auto grid max-w-2xl place-items-center px-4 py-20 text-center">
      <Logo size={44} tone="brand" />
      <p className="num mt-8 text-6xl font-extrabold tracking-tight text-navy-850 dark:text-white">404</p>
      <h1 className="mt-3 text-xl font-extrabold">الصفحة غير موجودة</h1>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">
        ربما تغيّر رابط المباراة بعد انتهاء الموسم، أو أن الصفحة نُقلت. جرّب البحث أو عد إلى
        الصفحة الرئيسية.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/" className="rounded-[3px] bg-gold-500 px-4 py-2.5 text-[12px] font-extrabold text-navy-900 transition hover:bg-gold-400">
          الصفحة الرئيسية
        </Link>
        <Link href="/search" className="rounded-[3px] border border-line px-4 py-2.5 text-[12px] font-bold transition hover:border-gold-500">
          البحث
        </Link>
        <Link href="/live" className="rounded-[3px] border border-line px-4 py-2.5 text-[12px] font-bold transition hover:border-gold-500">
          النتائج المباشرة
        </Link>
      </div>
    </div>
  );
}
