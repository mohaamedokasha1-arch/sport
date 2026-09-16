"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Crest from "@/components/ui/Crest";
import { teamBySlug } from "@/lib/core-data";
import type { LiveState } from "@/lib/live";
import { timeOf } from "@/lib/format";

type RailMatch = {
  id: string;
  slug: string;
  home: string;
  away: string;
  kickoff: string;
  competition: string;
  compCode: string;
  state: LiveState;
};

export default function ScoreRail() {
  const [items, setItems] = useState<RailMatch[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/live?scope=rail", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (alive) {
          setItems(data.matches as RailMatch[]);
          setUpdatedAt(Date.now());
        }
      } catch {
        /* keep previous rail */
      }
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="ticker border-b border-navy-800 bg-navy-900 text-white">
      <div className="mx-auto flex max-w-[1280px] items-stretch gap-0 px-4">
        <span className="hidden shrink-0 items-center gap-2 border-e border-navy-800 pe-4 text-[10px] font-extrabold uppercase tracking-[0.2em] text-gold-500 sm:flex">
          <span className="live-dot" aria-hidden /> نتائج مباشرة
        </span>

        <div className="no-bar flex flex-1 items-stretch gap-1 overflow-x-auto py-1.5">
          {items.length === 0
            ? Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className="h-9 w-52 shrink-0 animate-pulse rounded-[3px] bg-white/5" />
              ))
            : items.map((m) => {
                const home = teamBySlug(m.home);
                const away = teamBySlug(m.away);
                const isLive = m.state.status === "LIVE" || m.state.status === "HT";
                const isDone = m.state.status === "FINISHED";
                return (
                  <Link
                    key={m.id}
                    href={`/matches/${m.slug}`}
                    className={`group flex shrink-0 items-center gap-2 rounded-[3px] border px-2.5 py-1.5 transition focus-ring ${
                      isLive
                        ? "border-live/40 bg-live/10 hover:bg-live/20"
                        : "border-white/10 bg-white/[0.04] hover:border-gold-500/50"
                    }`}
                  >
                    <span className="font-display text-[10px] font-bold tracking-wider text-white/45">
                      {m.compCode}
                    </span>
                    <Crest slug={m.home} size={18} />
                    <span className="max-w-[86px] truncate text-[11px] font-semibold">
                      {home?.short}
                    </span>
                    <span
                      className={`num text-[13px] font-extrabold ${isLive ? "text-white" : "text-white/85"}`}
                      dir="ltr"
                    >
                      {isDone || isLive ? `${m.state.homeScore}-${m.state.awayScore}` : timeOf(m.kickoff)}
                    </span>
                    <span className="max-w-[86px] truncate text-[11px] font-semibold">
                      {away?.short}
                    </span>
                    <Crest slug={m.away} size={18} />
                    <span
                      className={`num min-w-[38px] text-[10px] font-bold ${
                        isLive ? "text-live" : "text-white/45"
                      }`}
                      dir="ltr"
                    >
                      {isLive ? m.state.clock : isDone ? "FT" : ""}
                    </span>
                  </Link>
                );
              })}
        </div>

        {updatedAt ? (
          <span className="hidden shrink-0 items-center border-s border-navy-800 ps-4 text-[10px] text-white/35 lg:flex">
            تحديث تلقائي كل 5 ثوانٍ
          </span>
        ) : null}
      </div>
    </div>
  );
}
