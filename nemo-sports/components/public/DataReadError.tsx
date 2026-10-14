"use client";

import { useT } from "@/lib/i18n/context";

/** Route-level error boundary for the synced-data directory (`/sports`). */
export default function DataReadError({ reset }: { reset: () => void }) {
  const tr = useT();
  return (
    <section className="p-6">
      <h2 className="font-bold">{tr("error.dataReadFailed")}</h2>
      <p className="my-3 text-muted">{tr("error.dataReadBody")}</p>
      <button onClick={reset} className="border border-line p-2">{tr("common.retry")}</button>
    </section>
  );
}
