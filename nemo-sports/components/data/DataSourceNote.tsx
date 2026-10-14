"use client";

import PoweredByFootballData from "@/components/ui/PoweredByFootballData";
import { useT, useLocale } from "@/lib/i18n/context";
import { fetchedAtLabel, originLabel, providerLabel } from "@/lib/i18n/data-source";

/**
 * Provenance line rendered directly under a data surface.
 *
 * It answers three questions a visitor (and a licence reviewer) is entitled to
 * ask: which source produced this, is it live or cached, and when was it
 * fetched. When the source is Football-Data.org the required dofollow
 * attribution travels with the data itself, not only with the page footer.
 *
 * Props are plain values, so this stays purely presentational. It is a client
 * component only so it can read the active locale from context — Next still
 * server-renders it into the initial HTML, so crawlers see the full line.
 * The label helpers live in `lib/i18n/data-source.ts` so server code can use
 * the exact same wording.
 */
export default function DataSourceNote({
  provider,
  fromCache = false,
  stale = false,
  degraded = false,
  fetchedAt,
  ttlSeconds,
  className = "",
  subject,
}: {
  provider: string;
  fromCache?: boolean;
  stale?: boolean;
  /** The source answered, but not with full coverage (partial chain / fallback). */
  degraded?: boolean;
  /** Timestamp of the last SUCCESSFUL update. Omit it rather than passing the
   *  render time: a fabricated "last updated" tells the visitor the data is
   *  fresh when no refresh actually succeeded. */
  fetchedAt?: string;
  ttlSeconds?: number;
  className?: string;
  /** What this line describes when a page shows several datasets. */
  subject?: string;
}) {
  const tr = useT();
  const locale = useLocale();
  const origin = originLabel(locale, provider, fromCache, ttlSeconds);
  return (
    <div className={`flex flex-wrap items-center gap-2 text-[10.5px] text-muted ${className}`}>
      <span>
        {subject ? tr("ds.subjectPrefix", { subject }) : tr("ds.prefix")}
        <span className="font-bold text-ink dark:text-white/80">{providerLabel(locale, provider)}</span>
        {` · ${origin}`}
        {fetchedAtLabel(locale, fetchedAt)}
      </span>
      {stale ? (
        <span className="rounded-[3px] bg-warn-500/15 px-1.5 py-0.5 font-bold text-warn-600 dark:text-warn-400">
          {tr("ds.stale")}
        </span>
      ) : null}
      {degraded ? (
        <span className="rounded-[3px] bg-warn-500/15 px-1.5 py-0.5 font-bold text-warn-600 dark:text-warn-400">
          {tr("ds.degraded")}
        </span>
      ) : null}
      {provider === "football_data" ? <PoweredByFootballData /> : null}
    </div>
  );
}
