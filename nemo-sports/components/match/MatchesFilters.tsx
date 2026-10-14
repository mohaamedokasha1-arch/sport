"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { isDateKey, shiftDateKey, siteDateKey } from "@/lib/tz";
import { useEffect, useState } from "react";
import { useT, useLocale } from "@/lib/i18n/context";
import { sportName } from "@/lib/i18n/names";


/** Query-string ids are the API/URL contract; only the rendered label is translated. */
const DATES = [
  { id: "yesterday", labelKey: "date.yesterday" },
  { id: "today", labelKey: "date.today" },
  { id: "tomorrow", labelKey: "date.tomorrow" },
  { id: "week", labelKey: "mf.thisWeek" },
] as const;

const STATUS = [
  { id: "all", labelKey: "mf.statusAll" },
  { id: "live", labelKey: "mf.statusLive" },
  { id: "upcoming", labelKey: "mf.statusUpcoming" },
  { id: "finished", labelKey: "mf.statusFinished" },
] as const;

/** Exact interruptions reported by a provider, plus stale/uncertain states. */
const REPORTED_STATES = [
  { id: "postponed", labelKey: "mf.statePostponed" },
  { id: "cancelled", labelKey: "mf.stateCancelled" },
  { id: "suspended", labelKey: "mf.stateSuspended" },
  { id: "abandoned", labelKey: "mf.stateAbandoned" },
  { id: "unconfirmed", labelKey: "mf.stateUnconfirmed" },
] as const;
export default function MatchesFilters({
  counts,
  sportsOptions,
  competitionOptions,
  initialSport,
  initialComp,
  initialDate,
  initialStatus,
  initialView,
  initialQuery,
}: {
  counts: Record<string, number>;
  sportsOptions: { slug: string; name: string; icon: string }[];
  competitionOptions: { id: string; name: string; sport: string }[];
  initialSport: string;
  initialComp: string;
  initialDate: string;
  initialStatus: string;
  initialView: "grid" | "list";
  initialQuery: string;
}) {
  const tr = useT();
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const [team, setTeam] = useState(initialQuery);

  const sport = params.get("sport") ?? initialSport;
  const comp = params.get("competition") ?? initialComp;
  const date = params.get("date") ?? initialDate;
  const selectedDay = isDateKey(date) ? date : shiftDateKey(siteDateKey(), date === "yesterday" ? -1 : date === "tomorrow" ? 1 : 0);
  const status = params.get("status") ?? initialStatus;
  const view = (params.get("view") as "grid" | "list") ?? initialView;

  const visibleComps = competitionOptions.filter((c) => !sport || c.sport === sport || c.id === comp);

  useEffect(() => {
    const t = setTimeout(() => {
      const q = team.trim();
      const cur = params.get("team") ?? "";
      if (q !== cur) {
        const next = new URLSearchParams(params.toString());
        if (q) next.set("team", q);
        else next.delete("team");
        router.replace(`/matches?${next.toString()}`, { scroll: false });
      }
    }, 320);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team]);

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "all") next.set(key, value);
    else next.delete(key);
    if (key === "sport") next.delete("competition");
    router.replace(`/matches?${next.toString()}`, { scroll: false });
  };

  const clear = () => {
    setTeam("");
    router.replace("/matches", { scroll: false });
  };
  const hasFilters = sport || comp || date !== "today" || status !== "all" || team;

  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-[3px] px-3 py-1.5 text-[12px] font-bold transition focus-ring ${
      active
        ? "bg-navy-850 text-white"
        : "border border-line bg-surface text-muted hover:border-gold-500 hover:text-ink"
    }`;

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow ms-1">{tr("matches.sport")}</span>
        <button type="button" aria-pressed={!sport} onClick={() => set("sport", null)} className={chip(!sport)}>
          {tr("matches.allSports")}
        </button>
        {sportsOptions.map((s) => (
          <button key={s.slug} type="button" aria-pressed={sport === s.slug} onClick={() => set("sport", s.slug)} className={chip(sport === s.slug)}>
            <span aria-hidden className="ms-1">{s.icon}</span> {sportName(locale, s.slug)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <span className="eyebrow ms-1">{tr("matches.date")}</span>
        {DATES.map((d) => (
          <button key={d.id} type="button" aria-pressed={date === d.id} onClick={() => set("date", d.id)} className={chip(date === d.id)}>
            {tr(d.labelKey)}
            <span className="num ms-1.5 text-[10px]">{counts[`date:${d.id}`] ?? 0}</span>
          </button>
        ))}
        <label className="text-xs">{tr("mf.specificDate")}
          <input type="date" value={isDateKey(date) ? date : ""} onChange={(e) => e.target.value && set("date", e.target.value)} className="focus-ring ms-2 min-h-11 rounded border border-line bg-surface p-2" />
        </label>
        <button className={chip(false)} onClick={() => set("date", shiftDateKey(selectedDay, -1))}>{tr("mf.prevDay")}</button>
        <button className={chip(false)} onClick={() => set("date", shiftDateKey(selectedDay, 1))}>{tr("mf.nextDay")}</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <span className="eyebrow ms-1">{tr("matches.status")}</span>
        {[
          ...STATUS,
          ...REPORTED_STATES.filter((s) => (counts[`status:${s.id}`] ?? 0) > 0 || status === s.id),
        ].map((s) => (
          <button key={s.id} type="button" aria-pressed={status === s.id} onClick={() => set("status", s.id)} className={chip(status === s.id)}>
            {tr(s.labelKey)}
            <span className="num ms-1.5 text-[10px]">{counts[`status:${s.id}`] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <label className="flex items-center gap-2">
          <span className="eyebrow">{tr("matches.competition")}</span>
          <select
            value={comp}
            onChange={(e) => set("competition", e.target.value)}
            className="focus-ring min-h-11 w-56 max-w-[calc(100vw-6rem)] rounded-[3px] border border-line bg-surface px-2.5 py-1.5 text-[12px] font-semibold outline-none focus:border-gold-500"
          >
            <option value="">{tr("matches.allCompetitions")}</option>
            {visibleComps.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[200px] flex-1 items-center gap-2">
          <span className="eyebrow">{tr("mf.team")}</span>
          <input
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            placeholder={tr("mf.teamPlaceholder")}
            className="focus-ring min-h-11 w-full rounded-[3px] border border-line bg-surface px-2.5 py-1.5 text-[12px] outline-none focus:border-gold-500"
          />
        </label>

        <div className="ms-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-[3px] border border-line">
            {(["grid", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => set("view", v)}
                aria-label={v === "grid" ? tr("mf.gridAria") : tr("mf.listAria")}
                aria-pressed={view === v}
                className={`focus-ring min-h-11 px-2.5 py-1.5 text-[11px] font-bold transition ${
                  view === v ? "bg-navy-850 text-white" : "bg-surface text-muted hover:text-ink"
                }`}
              >
                {v === "grid" ? tr("mf.gridButton") : tr("mf.listButton")}
              </button>
            ))}
          </div>
          {hasFilters ? (
            <button
              type="button"
              onClick={clear}
              className="min-h-11 rounded-[3px] border border-live/40 px-3 py-1.5 text-[12px] font-bold text-live transition hover:bg-live hover:text-white focus-ring"
            >
              {tr("mt.clearFilters")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
