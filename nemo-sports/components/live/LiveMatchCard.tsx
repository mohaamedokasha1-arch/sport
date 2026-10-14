import Link from "@/components/i18n/Link";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";
import ProviderCrest from "@/components/ui/ProviderCrest";
import ScorePair from "@/components/ui/ScorePair";
import { formatClock, formatDate } from "@/lib/i18n/dates";
import { broadcastFor, type MatchStreamSource } from "@/lib/match-streams";
import { matchStateOf } from "@/lib/match-state";
import { matchStateLabel } from "@/lib/i18n/match-state";

export interface LiveCardData {
  id: string;
  slug: string;
  homeName: string;
  awayName: string;
  homeLogo?: string | null;
  awayLogo?: string | null;
  competitionName: string;
  competitionSlug?: string | null;
  scheduledAt: string;
  status: string;
  sport?: string | null;
  /** Arabic sport name, shown when the page mixes sports. */
  sportLabel?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  minute?: number | null;
  stream: MatchStreamSource | null;
}

const BREAK_STATUSES = new Set(["halftime", "extra_time_halftime"]);

export default function LiveMatchCard({ match, now = Date.now(), locale }: { match: LiveCardData; now?: number; locale: Locale }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  // Resolve the state once, through the site-wide rule, and label it.
  const state = matchStateOf(match.status, match.scheduledAt, now);
  const isLive = state === "live";
  const isFinished = state === "finished";
  // Broadcast is judged separately from the match (approval + rights evidence
  // + match state + window). A watch action exists only while it can play.
  const broadcast = broadcastFor(match.stream, { status: match.status, scheduledAt: match.scheduledAt, sport: match.sport }, now);
  const played = match.homeScore !== null && match.homeScore !== undefined && match.awayScore !== null && match.awayScore !== undefined;

  // formatClock renders exactly this ar-EG 12-hour form for Arabic, and an
  // English clock on /en — see scripts/verify-i18n-parity.test.ts.
  const timeFormatted = formatClock(locale, match.scheduledAt);

  return (
    <article
      className={`card relative flex flex-col justify-between overflow-hidden rounded-[8px] p-4 transition-all hover:border-gold-500/50 hover:shadow-md ${
        isLive ? "border-live-red/50 shadow-live-red/5" : ""
      }`}
    >
      {isLive ? <span className="absolute inset-x-0 top-0 h-1 bg-live-red animate-pulse" aria-hidden /> : null}

      {/* Header: Competition & Status Badge */}
      <header className="mb-3 flex items-center justify-between gap-2 border-b border-line pb-2.5">
        <span className="flex min-w-0 items-center gap-1 text-[11.5px] font-bold text-muted" title={match.competitionName || undefined}>
          {match.sportLabel ? <span className="shrink-0 rounded-[3px] bg-navy-850/10 px-1 py-px text-[10px] dark:bg-white/10">{match.sportLabel}</span> : null}
          {/* dir="auto": a Latin name is cut at its END ("National Basketball…"),
              not at its start as an RTL ellipsis did ("…onal Basketball Association"). */}
          <span dir="auto" className="min-w-0 truncate">{match.competitionName || tr("card.match")}</span>
        </span>

        {isLive ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[4px] bg-live-red/15 px-2 py-0.5 text-[11px] font-black text-live-red">
            <span className="live-dot !bg-live-red" aria-hidden />
            <span>{BREAK_STATUSES.has(match.status) ? tr("ui.break") : tr("state.live")}</span>
            {!BREAK_STATUSES.has(match.status) && match.minute !== null && match.minute !== undefined ? (
              <span className="num font-bold" dir="ltr">({match.minute}&apos;)</span>
            ) : null}
          </span>
        ) : isFinished ? (
          <span className="inline-flex shrink-0 items-center rounded-[4px] bg-navy-850 px-2 py-0.5 text-[11px] font-bold text-muted">
            {tr("state.finished")}
          </span>
        ) : state === "upcoming" ? (
          <span className="inline-flex shrink-0 items-center rounded-[4px] bg-gold-500/15 px-2 py-0.5 text-[11px] font-bold text-gold-500 dark:text-gold-400">
            {tr("state.upcoming")}
          </span>
        ) : (
          <span
            className={`inline-flex shrink-0 items-center rounded-[4px] px-2 py-0.5 text-[11px] font-bold ${
              state === "unconfirmed"
                ? "bg-warn-500/15 text-warn-600 dark:text-warn-400"
                : "bg-navy-850 text-muted"
            }`}
          >
            {matchStateLabel(locale, state)}
          </span>
        )}
      </header>

      {/* Main: Teams & Score / Kickoff (home = first column = right side in RTL) */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 py-2">
        <div className="flex min-w-0 flex-col items-center gap-2 text-center">
          <ProviderCrest name={match.homeName} logoUrl={match.homeLogo} size={42} />
          <span dir="auto" className="line-clamp-2 break-words text-[13px] font-extrabold leading-snug text-ink" title={match.homeName}>
            {match.homeName}
          </span>
        </div>

        <div className="flex flex-col items-center justify-center px-1 sm:px-2">
          {isLive || isFinished ? (
            played ? (
              <ScorePair home={match.homeScore} away={match.awayScore} className="text-2xl font-extrabold tracking-tight text-ink" />
            ) : (
              <span className="num text-2xl font-extrabold text-muted">— : —</span>
            )
          ) : (
            <div className="flex flex-col items-center">
              <span className="num text-[17px] font-black text-gold-500 dark:text-gold-400" dir="ltr">
                {timeFormatted}
              </span>{" "}
              <span className="text-[10px] text-muted">{tr("card.meccaCairoTime")}</span>
            </div>
          )}
          <span className="mt-1 text-[10.5px] text-muted">{formatDate(locale, match.scheduledAt)}</span>
        </div>

        <div className="flex min-w-0 flex-col items-center gap-2 text-center">
          <ProviderCrest name={match.awayName} logoUrl={match.awayLogo} size={42} />
          <span dir="auto" className="line-clamp-2 break-words text-[13px] font-extrabold leading-snug text-ink" title={match.awayName}>
            {match.awayName}
          </span>
        </div>
      </div>

      {/* Footer: watch action ONLY while the broadcast can play */}
      <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        {broadcast?.state === "live" ? (
          <Link
            href={`/matches/${encodeURIComponent(match.slug)}#live-stream`}
            className="inline-flex items-center justify-center gap-1.5 rounded-[4px] bg-gold-500 px-3.5 py-1.5 text-[12px] font-black text-navy-950 shadow-sm transition hover:bg-gold-400 focus-ring"
          >
            <span className="text-[13px]" aria-hidden>▶</span>
            <span>{tr("card.watchMatch")}</span>
          </Link>
        ) : broadcast?.state === "standby" ? (
          <Link
            href={`/matches/${encodeURIComponent(match.slug)}#live-stream`}
            className="inline-flex items-center justify-center gap-1.5 rounded-[4px] border border-gold-500/60 px-3 py-1.5 text-[11.5px] font-bold text-gold-600 transition hover:bg-gold-500/10 focus-ring dark:text-gold-400"
          >
            <span aria-hidden>📺</span>
            <span>{tr("card.verifiedStream")}</span>
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-line bg-navy-850/50 px-2.5 py-1 text-[11px] font-medium text-muted">
            <span aria-hidden>📺</span>
            <span>{broadcast?.state === "expired" || broadcast?.state === "ended" ? tr("card.noActiveStream") : tr("card.noVerifiedStream")}</span>
          </span>
        )}

        <Link
          href={`/matches/${encodeURIComponent(match.slug)}`}
          className="inline-flex items-center justify-center rounded-[4px] border border-line bg-navy-850 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-navy-750 focus-ring"
        >
          {tr("card.matchDetails")}
        </Link>
      </footer>
    </article>
  );
}
