"use client";

import { useEffect, useState } from "react";
import { dateAr } from "@/lib/format";

export default function SiteClock({ initialIso }: { initialIso: string }) {
  const [now, setNow] = useState(initialIso);

  useEffect(() => {
    const update = () => setNow(new Date().toISOString());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return <time dateTime={now}>{dateAr(now)}</time>;
}
