"use client";

import { useState } from "react";

/**
 * Manual sync trigger for /admin/pipeline.
 * Two buttons per job on purpose: «فحص جاف» (dry run) fetches and normalizes
 * without writing, which is how an operator checks a newly enabled source
 * before letting it touch canonical data.
 */
export default function PipelineRunButton({ job, label = "تشغيل الآن" }: { job: string; label?: string }) {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const run = async (dryRun: boolean): Promise<void> => {
    setState("running");
    setMessage(null);
    try {
      const res = await fetch("/api/v1/pipeline/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job, dryRun, force: true }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string; run?: { totals?: Record<string, number>; sources?: { source: string; status: string; reason?: string }[] } };
      if (!res.ok) {
        setState("error");
        setMessage(body.error === "unauthorized" ? "غير مصرّح" : (body.error ?? `HTTP ${res.status}`));
        return;
      }
      const totals = body.run?.totals;
      const skipped = (body.run?.sources ?? []).filter((s) => s.status === "skipped").length;
      setState("done");
      setMessage(
        totals
          ? `جُلب ${totals.fetched} · جديد ${totals.created} · محدَّث ${totals.updated} · صراعات ${totals.conflicts}${skipped ? ` · متخطّى ${skipped}` : ""}`
          : "تم",
      );
      // refresh the server-rendered panels with the new run history
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "فشل الطلب");
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={state === "running"}
        onClick={() => void run(false)}
        className="rounded-[3px] bg-gold-500 px-3 py-1.5 text-[11px] font-extrabold text-navy-900 transition hover:bg-gold-400 disabled:opacity-50"
      >
        {state === "running" ? "…جارٍ" : label}
      </button>
      <button
        type="button"
        disabled={state === "running"}
        onClick={() => void run(true)}
        className="rounded-[3px] border border-navy-700 px-3 py-1.5 text-[11px] font-bold text-white/70 transition hover:border-gold-500 hover:text-gold-400 disabled:opacity-50"
      >
        فحص جاف
      </button>
      {message ? <span className={`text-[11px] ${state === "error" ? "text-live" : "text-white/50"}`}>{message}</span> : null}
    </span>
  );
}
