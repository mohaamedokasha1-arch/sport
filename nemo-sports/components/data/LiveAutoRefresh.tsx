"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Client-side auto refresher for server-rendered live sections.
 * ─────────────────────────────────────────────────────────────
 * The page itself stays a server component reading the Sports Data Layer;
 * this widget only calls router.refresh() on an interval, so every refresh
 * re-enters the SDL cache (45s TTL on live data, SportScore edge-caches 60s)
 * instead of hammering the provider from each visitor's browser.
 */
export default function LiveAutoRefresh({ intervalSeconds = 60 }: { intervalSeconds?: number }) {
  const router = useRouter();
  const [left, setLeft] = useState(intervalSeconds);
  const [on, setOn] = useState(true);

  useEffect(() => {
    if (!on) return;
    const timer = setInterval(() => {
      setLeft((prev) => {
        if (prev <= 1) {
          router.refresh();
          return intervalSeconds;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [on, intervalSeconds, router]);

  return (
    <button
      type="button"
      onClick={() => setOn((v) => !v)}
      className="inline-flex items-center gap-2 rounded-[3px] border border-line bg-surface px-2.5 py-1 text-[11px] font-bold text-muted transition hover:border-gold-500/50"
      title="تحديث تلقائي للنتائج المباشرة"
    >
      <span className={`live-dot ${on ? "" : "opacity-30"}`} aria-hidden />
      {on ? `تحديث تلقائي كل ${intervalSeconds} ثانية · التالي بعد ${left}s` : "التحديث التلقائي متوقف — اضغط للتفعيل"}
    </button>
  );
}
