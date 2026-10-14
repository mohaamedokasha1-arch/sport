"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/i18n/dates";
import { useLocale } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/locales";

export default function SiteClock({ initialIso, locale }: { initialIso: string; locale?: Locale }) {
  const contextLocale = useLocale();
  const active = locale ?? contextLocale;
  const [now, setNow] = useState(initialIso);

  useEffect(() => {
    const update = () => setNow(new Date().toISOString());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return <time dateTime={now}>{formatDate(active, now)}</time>;
}
