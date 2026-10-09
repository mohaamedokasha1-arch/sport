"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ProviderCrest from "@/components/ui/ProviderCrest";
import { SITE_TZ } from "@/lib/tz";

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
  minute: number | null;
  homeScore: number | null;
  awayScore: number | null;
};

type RailResponse = {
  matches: RailMatch[];
  mode: "live" | "upcoming" | "empty" | "unavailable" | "preview";
  updatedAt: string;
};

const clockText = (iso: string) => new Date(iso).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", timeZone: SITE_TZ });

export default function ScoreRail() {
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
    <div role="region" aria-label="متابعة نتائج المباريات" className="border-b border-navy-800 bg-navy-900 text-white">
      <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-2">
        <Link href="/live" className="flex min-h-11 shrink-0 items-center gap-2 border-e border-navy-800 pe-3 text-[11px] font-extrabold text-gold-400 transition hover:text-white focus-ring">
          {isLiveMode && hasMatches ? <span className="live-dot" aria-hidden /> : null}
          {isPreview ? "معاينة التطوير" : isLiveMode ? "مباشر الآن" : "متابعة المباريات"}
        </Link>

        {hasMatches ? (
          <div className="no-bar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-0.5">
            {data!.matches.map((match) => {
              const live = data?.mode === "live" && ["live", "halftime", "extra_time", "extra_time_halftime", "penalty_shootout"].includes(match.status);
              const finished = data?.mode !== "preview" && match.status === "finished";
              const hasScore = match.homeScore !== null && match.awayScore !== null;
              return (
                <Link
                  key={match.id}
                  href={`/matches/${encodeURIComponent(match.slug)}`}
                  className={`flex min-h-11 shrink-0 items-center gap-2 rounded-[3px] border px-2.5 py-1.5 transition focus-ring ${live ? "border-live/40 bg-live/10 hover:bg-live/20" : "border-white/10 bg-white/[0.04] hover:border-gold-500/50"}`}
                >
                  {match.competition ? <span className="hidden max-w-24 truncate text-[10px] font-semibold text-white/45 md:block">{match.competition}</span> : null}
                  <ProviderCrest name={match.homeName} logoUrl={match.homeLogoUrl} size={20} />
                  <span className="max-w-[96px] truncate text-[11px] font-semibold">{match.homeName}</span>
                  <span className={`num min-w-[48px] text-center text-[13px] font-extrabold ${live ? "text-white" : "text-white/85"}`} dir="ltr">
                    {isPreview ? "معاينة" : hasScore ? `${match.homeScore}–${match.awayScore}` : clockText(match.kickoff)}
                  </span>
                  <span className="max-w-[96px] truncate text-[11px] font-semibold">{match.awayName}</span>
                  <ProviderCrest name={match.awayName} logoUrl={match.awayLogoUrl} size={20} />
                  <span className={`num text-[10px] font-bold ${live ? "text-live" : "text-white/45"}`} dir="ltr">
                    {isPreview ? "تجريبي" : live ? match.clock ?? "مباشر" : finished ? "انتهت" : ""}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3 py-1 text-[12px] text-white/65">
            <p role="status">
              {failed || data?.mode === "unavailable"
                ? "تعذر تحديث النتائج الآن. نعيد المحاولة تلقائيًا."
                : "لا توجد مباراة جارية الآن."}
              {data?.mode === "empty" ? " لا توجد مباريات قادمة اليوم من المصدر." : null}
            </p>
            <Link href={data?.mode === "empty" ? "/fixtures" : "/matches?date=today"} className="inline-flex min-h-11 shrink-0 items-center rounded-[3px] px-2 py-2 font-bold text-gold-400 hover:text-white focus-ring">
              {data?.mode === "empty" ? "المباريات القادمة ←" : "مباريات اليوم ←"}
            </Link>
          </div>
        )}

        {lastUpdate ? (
          <span className="hidden shrink-0 border-s border-navy-800 ps-3 text-[10px] text-white/45 lg:block" title="آخر تحديث">
            {failed ? <span className="text-warn">تعذّر التحديث · </span> : null}{clockText(lastUpdate)} · توقيت القاهرة
          </span>
        ) : null}
      </div>
    </div>
  );
}
