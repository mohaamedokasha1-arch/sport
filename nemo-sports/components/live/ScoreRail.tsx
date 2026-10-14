"use client";

import Link from "@/components/i18n/Link";
import { useCallback, useEffect, useState } from "react";
import ProviderCrest from "@/components/ui/ProviderCrest";
import ScorePair from "@/components/ui/ScorePair";
import { isLiveStatus } from "@/lib/match-state";
import { useT, useLocale } from "@/lib/i18n/context";
import { clockLabel } from "@/lib/i18n/clock";
import type { ClockParts } from "@/lib/live";
import { formatClock } from "@/lib/i18n/dates";

type RailMatch = {
  id: string;
  slug: string;
  homeName: string;
  awayName: string;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
  kickoff: string;
  competition: string;
  compCode: string;
  status: string;
  clock: string | null;
  clockParts?: ClockParts | null;
  minute: number | null;
  homeScore: number | null;
  awayScore: number | null;
};

type RailResponse = {
  matches: RailMatch[];
  mode: "live" | "upcoming" | "empty" | "unavailable" | "preview";
  updatedAt: string;
  /** Matches in play across every public sport (the /live count). */
  liveTotal?: number;
};

/** Wall-clock in the site timezone, spelled for the active locale (lib/i18n/dates). */

export default function ScoreRail() {
  const tr = useT();
  const locale = useLocale();
  const clockText = (iso: string) => formatClock(locale, iso);
  const [data, setData] = useState<RailResponse | null>(null);
  const [lastUpdate, setLastUpdate] = useState("");
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch("/api/live?scope=rail", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("live-feed-unavailable");
      const next = (await response.json()) as RailResponse;
      setData(next);
      setLastUpdate(next.updatedAt || new Date().toISOString());
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = data?.mode === "live" || data?.mode === "preview" ? 5_000 : 30_000;
    const timer = window.setInterval(() => void load(), interval);
    return () => window.clearInterval(timer);
  }, [data?.mode, load]);

  const hasMatches = (data?.matches.length ?? 0) > 0;
  const isPreview = data?.mode === "preview";
  const isLiveMode = data?.mode === "live";

  return (
    <div role="region" aria-label={tr("rail.regionAria")} className="border-b border-navy-800 bg-navy-900 text-white">
      <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-2">
        <Link href="/live" className="flex min-h-11 shrink-0 items-center gap-2 border-e border-navy-800 pe-3 text-[11px] font-extrabold text-gold-400 transition hover:text-white focus-ring">
          {isLiveMode && hasMatches ? <span className="live-dot" aria-hidden /> : null}
          {isPreview ? tr("rail.devPreview") : isLiveMode ? (data?.liveTotal ? tr("rail.liveNowCount", { count: data.liveTotal }) : tr("rail.liveNow")) : tr("rail.followMatches")}
        </Link>

        {hasMatches ? (
          <div className="no-bar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-0.5">
            {data!.matches.map((match) => {
              const live = data?.mode === "live" && isLiveStatus(match.status);
              const finished = data?.mode !== "preview" && match.status === "finished";
              const hasScore = match.homeScore !== null && match.awayScore !== null;
              return (
                <Link
                  key={match.id}
                  href={`/matches/${encodeURIComponent(match.slug)}`}
                  className={`flex min-h-11 shrink-0 items-center gap-2 rounded-[3px] border px-2.5 py-1.5 transition focus-ring ${live ? "border-live/40 bg-live/10 hover:bg-live/20" : "border-white/10 bg-white/[0.04] hover:border-gold-500/50"}`}
                >
                  {match.competition ? <span dir="auto" className="hidden max-w-24 truncate text-[10px] font-semibold text-white/45 md:block">{match.competition}</span> : null}
                  <ProviderCrest name={match.homeName} logoUrl={match.homeLogoUrl} size={20} />
                  <span dir="auto" className="max-w-[96px] truncate text-[11px] font-semibold" title={match.homeName}>{match.homeName}</span>
                  {/* Home name comes first (right side in RTL), so the home score
                      must too — no dir="ltr" around the pair. */}
                  {isPreview ? (
                    <span className="num min-w-[48px] text-center text-[13px] font-extrabold text-white/85">{tr("rail.previewShort")}</span>
                  ) : hasScore ? (
                    <ScorePair home={match.homeScore} away={match.awayScore} separator="–" separatorClassName="text-white/45" className={`min-w-[48px] justify-center text-[13px] font-extrabold ${live ? "text-white" : "text-white/85"}`} />
                  ) : (
                    <span className="num min-w-[48px] text-center text-[13px] font-extrabold text-white/85" dir="ltr">{clockText(match.kickoff)}</span>
                  )}
                  <span dir="auto" className="max-w-[96px] truncate text-[11px] font-semibold" title={match.awayName}>{match.awayName}</span>
                  <ProviderCrest name={match.awayName} logoUrl={match.awayLogoUrl} size={20} />
                  <span className={`num text-[10px] font-bold ${live ? "text-live" : "text-white/45"}`} dir="ltr">
                    {isPreview
                      ? tr("rail.demo")
                      : live
                        ? clockLabel(locale, match.clockParts) || tr("status.LIVE")
                        : finished
                          ? tr("status.FINISHED")
                          : ""}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3 py-1 text-[12px] text-white/65">
            <p role="status">
              {/* Before the first answer arrives we know nothing: never claim
                  "no match in progress" (the server-rendered HTML used to say
                  exactly that on every page, on top of /live and the homepage,
                  while matches were being played). */}
              {data === null && !failed
                ? tr("rail.loading")
                : failed || data?.mode === "unavailable"
                  ? tr("rail.refreshFailed")
                  : tr("rail.noneLive")}
              {data?.mode === "empty" ? tr("rail.noneUpcoming") : null}
            </p>
            <Link href={data?.mode === "empty" ? "/fixtures" : data === null ? "/live" : "/matches?date=today"} className="inline-flex min-h-11 shrink-0 items-center rounded-[3px] px-2 py-2 font-bold text-gold-400 hover:text-white focus-ring">
              {data?.mode === "empty" ? tr("rail.upcomingLink") : data === null ? tr("rail.liveLink") : tr("rail.todayLink")}
            </Link>
          </div>
        )}

        {lastUpdate ? (
          <span className="hidden shrink-0 border-s border-navy-800 ps-3 text-[10px] text-white/45 lg:block" title={tr("rail.lastUpdate")}>
            {failed ? <span className="text-warn">{tr("rail.updateFailed")}</span> : null}{tr("rail.updatedAt", { time: clockText(lastUpdate) })}
          </span>
        ) : null}
      </div>
    </div>
  );
}
