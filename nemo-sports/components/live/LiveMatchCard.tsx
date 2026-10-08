import Link from "next/link";
import ProviderCrest from "@/components/ui/ProviderCrest";
import { SITE_TZ } from "@/lib/tz";
import { dateAr } from "@/lib/format";
import { isPubliclyVisible, type MatchStreamSource } from "@/lib/match-streams";

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
  homeScore?: number | null;
  awayScore?: number | null;
  minute?: number | null;
  stream: MatchStreamSource | null;
}

export default function LiveMatchCard({ match }: { match: LiveCardData }) {
  const isLive = ["live", "halftime", "extra_time", "extra_time_halftime", "penalty_shootout"].includes(
    match.status.toLowerCase()
  );
  const isFinished = ["finished", "ended"].includes(match.status.toLowerCase());
  const hasStream = match.stream && isPubliclyVisible(match.stream);
  const played = match.homeScore !== null && match.homeScore !== undefined && match.awayScore !== null && match.awayScore !== undefined;

  const timeFormatted = new Date(match.scheduledAt).toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: SITE_TZ,
  });

  return (
    <article
      className={`card relative flex flex-col justify-between overflow-hidden rounded-[8px] p-4 transition-all hover:border-gold-500/50 hover:shadow-md ${
        isLive ? "border-live-red/50 shadow-live-red/5" : ""
      }`}
    >
      {isLive ? <span className="absolute inset-x-0 top-0 h-1 bg-live-red animate-pulse" aria-hidden /> : null}

      {/* Header: Competition & Status Badge */}
      <header className="mb-3 flex items-center justify-between gap-2 border-b border-line pb-2.5">
        <span className="truncate text-[11.5px] font-bold text-muted">
          {match.competitionName || "مباراة"}
        </span>

        {isLive ? (
          <span className="inline-flex items-center gap-1.5 rounded-[4px] bg-live-red/15 px-2 py-0.5 text-[11px] font-black text-live-red">
            <span className="live-dot !bg-live-red" aria-hidden />
            <span>مباشر</span>
            {match.minute !== null && match.minute !== undefined ? (
              <span className="num font-bold">({match.minute}&apos;)</span>
            ) : null}
          </span>
        ) : isFinished ? (
          <span className="inline-flex items-center rounded-[4px] bg-navy-850 px-2 py-0.5 text-[11px] font-bold text-muted">
            انتهت
          </span>
        ) : (
          <span className="inline-flex items-center rounded-[4px] bg-gold-500/15 px-2 py-0.5 text-[11px] font-bold text-gold-500 dark:text-gold-400">
            قريبًا
          </span>
        )}
      </header>

      {/* Main: Teams & Score / Kickoff */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-2">
        {/* Home Team */}
        <div className="flex flex-col items-center gap-2 text-center">
          <ProviderCrest name={match.homeName} logoUrl={match.homeLogo} size={42} />
          <span className="text-[13px] font-extrabold text-ink line-clamp-1">{match.homeName}</span>
        </div>

        {/* Center: Score or Kickoff Time */}
        <div className="flex flex-col items-center justify-center px-2">
          {isLive || isFinished ? (
            <span className="num text-2xl font-extrabold tabular-nums tracking-tight text-ink" dir="ltr">
              {played ? `${match.homeScore} : ${match.awayScore}` : "— : —"}
            </span>
          ) : (
            <div className="flex flex-col items-center">
              <span className="num text-[17px] font-black text-gold-500 dark:text-gold-400" dir="ltr">
                {timeFormatted}
              </span>
              <span className="text-[10px] text-muted">مكة والقاهرة</span>
            </div>
          )}
          <span className="mt-1 text-[10.5px] text-muted">
            {dateAr(match.scheduledAt)}
          </span>
        </div>

        {/* Away Team */}
        <div className="flex flex-col items-center gap-2 text-center">
          <ProviderCrest name={match.awayName} logoUrl={match.awayLogo} size={42} />
          <span className="text-[13px] font-extrabold text-ink line-clamp-1">{match.awayName}</span>
        </div>
      </div>

      {/* Footer: Stream CTA or Fallback notice */}
      <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        {hasStream ? (
          <Link
            href={`/matches/${encodeURIComponent(match.slug)}#live-stream`}
            className="inline-flex items-center justify-center gap-1.5 rounded-[4px] bg-gold-500 px-3.5 py-1.5 text-[12px] font-black text-navy-950 transition hover:bg-gold-400 focus-ring shadow-sm"
          >
            <span className="text-[13px]">▶</span>
            <span>مشاهدة المباراة</span>
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-[4px] border border-line bg-navy-850/50 px-2.5 py-1 text-[11px] font-medium text-muted">
            <span aria-hidden>📺</span>
            <span>سيتم إتاحة البث عند توفره</span>
          </span>
        )}

        <Link
          href={`/matches/${encodeURIComponent(match.slug)}`}
          className="inline-flex items-center justify-center rounded-[4px] border border-line bg-navy-850 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-navy-750 focus-ring"
        >
          تفاصيل المباراة
        </Link>
      </footer>
    </article>
  );
}
