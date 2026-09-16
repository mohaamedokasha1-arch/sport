"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // في الإنتاج يُرسل الخطأ إلى خدمة المراقبة (Sentry/Datadog) مع الـ digest.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto grid max-w-2xl place-items-center px-4 py-20 text-center">
      <p className="num text-6xl font-extrabold tracking-tight text-live">500</p>
      <h1 className="mt-3 text-xl font-extrabold">حدث خطأ غير متوقع</h1>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">
        سجّلنا الخطأ وسنراجعه. يمكنك إعادة المحاولة، وستبقى آخر نتيجة معروفة ظاهرة في شريط
        النتائج المباشر.
      </p>
      {error.digest ? <p className="num mt-2 text-[11px] text-muted">معرّف الخطأ: {error.digest}</p> : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-[3px] bg-gold-500 px-4 py-2.5 text-[12px] font-extrabold text-navy-900 transition hover:bg-gold-400"
        >
          إعادة المحاولة
        </button>
        <Link href="/" className="rounded-[3px] border border-line px-4 py-2.5 text-[12px] font-bold transition hover:border-gold-500">
          الصفحة الرئيسية
        </Link>
      </div>
    </div>
  );
}
