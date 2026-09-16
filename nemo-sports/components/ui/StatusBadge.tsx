import { STATUS_AR } from "@/lib/format";

const tones = {
  live: "bg-live/10 text-live border-live/25",
  idle: "bg-navy-850/5 text-navy-850 dark:bg-white/10 dark:text-white border-navy-850/10 dark:border-white/15",
  done: "bg-navy-850/[0.06] text-muted border-line",
  warn: "bg-warn/10 text-warn border-warn/25",
} as const;

export default function StatusBadge({
  status,
  clock,
  size = "md",
}: {
  status: keyof typeof STATUS_AR | string;
  clock?: string;
  size?: "sm" | "md";
}) {
  const isLive = status === "LIVE" || status === "HT";
  const tone = isLive
    ? tones.live
    : status === "UPCOMING"
      ? tones.idle
      : status === "FINISHED"
        ? tones.done
        : tones.warn;

  const pad = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[3px] border font-bold tracking-wide ${pad} ${tone}`}
      dir="rtl"
    >
      {isLive ? <span className="live-dot" aria-hidden /> : null}
      <span>{isLive && clock ? clock : STATUS_AR[status] ?? status}</span>
    </span>
  );
}
