"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useT, useDir, useLocale } from "@/lib/i18n/context";

/** Refreshes a server-rendered data surface through the app's provider caches. */
export default function LiveAutoRefresh({ intervalSeconds = 60 }: { intervalSeconds?: number }) {
  const tr = useT();
  const router = useRouter();
  const [on, setOn] = useState(true);

  useEffect(() => {
    if (!on) return;
    const timer = window.setInterval(() => router.refresh(), intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [on, intervalSeconds, router]);

  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => setOn((value) => !value)}
      className="inline-flex min-h-11 items-center gap-2 rounded-[3px] border border-line bg-surface px-3 py-2 text-[11px] font-bold text-muted transition hover:border-gold-500/50 focus-ring"
      title={tr("ui.autoRefreshTitle")}
    >
      <span className={`live-dot ${on ? "" : "opacity-30"}`} aria-hidden />
      {on ? tr("ui.autoRefreshOn", { seconds: intervalSeconds }) : tr("ui.autoRefreshOff")}
    </button>
  );
}
