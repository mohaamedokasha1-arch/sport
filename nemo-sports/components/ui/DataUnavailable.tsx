"use client";

import Link from "@/components/i18n/Link";
import { useId } from "react";
import { useT } from "@/lib/i18n/context";

/**
 * A single, localized empty/error state with a useful next step.
 *
 * The defaults come from the message catalogue, so an English page never falls
 * back to Arabic copy when a caller omits a label.
 */
export default function DataUnavailable({
  title,
  message,
  hint,
  actionHref = "/matches",
  actionLabel,
}: {
  title?: string;
  message?: string;
  hint?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  const tr = useT();
  const titleId = useId();
  return (
    <section className="card my-6 flex flex-col items-center gap-2 px-6 py-9 text-center" aria-labelledby={titleId}>
      <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-gold-500/15 text-xl" aria-hidden>
        📡
      </span>
      <h2 id={titleId} className="text-[15px] font-extrabold">{title ?? tr("ui.dataUnavailableTitle")}</h2>
      <p className="max-w-xl text-[13px] leading-6 text-muted">{message ?? tr("ui.dataUnavailableMessage")}</p>
      {hint ? <p className="max-w-xl text-[12px] leading-5 text-muted">{hint}</p> : null}
      {actionHref ? (
        <Link href={actionHref} className="mt-2 inline-flex min-h-11 items-center justify-center rounded-[3px] border border-line bg-surface px-4 py-2 text-[12px] font-bold transition hover:border-gold-500 hover:text-gold-600 dark:hover:text-gold-400 focus-ring">
          {actionLabel ?? tr("ui.browseMatches")}
        </Link>
      ) : null}
    </section>
  );
}
