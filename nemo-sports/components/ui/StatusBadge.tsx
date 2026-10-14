"use client";

/**
 * Match status pill.
 *
 * The label comes from the message catalogue (`status.*`), so the pill reads
 * "مباشر" on Arabic pages and "Live" on English ones. It previously read
 * `STATUS_AR` from lib/format.ts directly, which put Arabic on every English
 * match card. Unknown provider statuses still fall through to the raw token
 * rather than leaking a dictionary key.
 *
 * `dir` follows the document: the badge used to hardcode dir="rtl", which is
 * right for Arabic but renders an English pill right-to-left.
 */
import { useDir, useLocale, useT } from "@/lib/i18n/context";
import { hasMessage } from "@/lib/i18n/translate";

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
  status: string;
  clock?: string;
  size?: "sm" | "md";
}) {
  const tr = useT();
  const locale = useLocale();
  const dir = useDir();

  const isLive = status === "LIVE" || status === "HT";
  const tone = isLive
    ? tones.live
    : status === "UPCOMING"
      ? tones.idle
      : status === "FINISHED"
        ? tones.done
        : tones.warn;

  const pad = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]";

  // Preserve the old `STATUS_AR[status] ?? status` contract: a status the site
  // has no label for is shown as the provider sent it, never as a bare key.
  const key = `status.${status}`;
  const label = hasMessage(locale, key) ? tr(key) : status;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[3px] border font-bold tracking-wide ${pad} ${tone}`}
      dir={dir}
    >
      {isLive ? <span className="live-dot" aria-hidden /> : null}
      <span>{isLive && clock ? clock : label}</span>
    </span>
  );
}
