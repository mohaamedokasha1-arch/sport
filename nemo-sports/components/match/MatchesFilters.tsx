"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { competitions, sports } from "@/lib/core-data";

const DATES = [
  { id: "yesterday", label: "أمس" },
  { id: "today", label: "اليوم" },
  { id: "tomorrow", label: "غدًا" },
  { id: "week", label: "هذا الأسبوع" },
];

const STATUS = [
  { id: "all", label: "الكل" },
  { id: "live", label: "مباشر" },
  { id: "upcoming", label: "قادمة" },
  { id: "finished", label: "منتهية" },
];

export default function MatchesFilters({
  counts,
  initialSport,
  initialComp,
  initialDate,
  initialStatus,
  initialView,
  initialQuery,
}: {
  counts: Record<string, number>;
  initialSport: string;
  initialComp: string;
  initialDate: string;
  initialStatus: string;
  initialView: "grid" | "list";
  initialQuery: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [team, setTeam] = useState(initialQuery);

  const sport = params.get("sport") ?? initialSport;
  const comp = params.get("competition") ?? initialComp;
  const date = params.get("date") ?? initialDate;
  const status = params.get("status") ?? initialStatus;
  const view = (params.get("view") as "grid" | "list") ?? initialView;

  const visibleComps = competitions.filter((c) => !sport || c.sport === sport);

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

  const clear = () => router.replace("/matches", { scroll: false });
  const hasFilters = sport || comp || date !== "today" || status !== "all" || team;

  const chip = (active: boolean) =>
    `rounded-[3px] px-3 py-1.5 text-[12px] font-bold transition focus-ring ${
      active
        ? "bg-navy-850 text-white"
        : "border border-line bg-surface text-muted hover:border-gold-500 hover:text-ink"
    }`;

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow ms-1">الرياضة</span>
        <button type="button" onClick={() => set("sport", null)} className={chip(!sport)}>
          كل الرياضات
        </button>
        {sports.map((s) => (
          <button key={s.slug} type="button" onClick={() => set("sport", s.slug)} className={chip(sport === s.slug)}>
            <span aria-hidden className="ms-1">{s.icon}</span> {s.name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <span className="eyebrow ms-1">التاريخ</span>
        {DATES.map((d) => (
          <button key={d.id} type="button" onClick={() => set("date", d.id)} className={chip(date === d.id)}>
            {d.label}
            <span className="num ms-1.5 text-[10px] opacity-70">{counts[`date:${d.id}`] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <span className="eyebrow ms-1">الحالة</span>
        {STATUS.map((s) => (
          <button key={s.id} type="button" onClick={() => set("status", s.id)} className={chip(status === s.id)}>
            {s.label}
            <span className="num ms-1.5 text-[10px] opacity-70">{counts[`status:${s.id}`] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <label className="flex items-center gap-2">
          <span className="eyebrow">البطولة</span>
          <select
            value={comp}
            onChange={(e) => set("competition", e.target.value)}
            className="rounded-[3px] border border-line bg-surface px-2.5 py-1.5 text-[12px] font-semibold outline-none focus:border-gold-500"
          >
            <option value="">كل البطولات</option>
            {visibleComps.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[200px] flex-1 items-center gap-2">
          <span className="eyebrow">فريق</span>
          <input
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            placeholder="اكتب اسم الفريق…"
            className="w-full rounded-[3px] border border-line bg-surface px-2.5 py-1.5 text-[12px] outline-none focus:border-gold-500"
          />
        </label>

        <div className="ms-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-[3px] border border-line">
            {(["grid", "list"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => set("view", v)}
                aria-label={v === "grid" ? "عرض شبكي" : "عرض قائمة"}
                className={`px-2.5 py-1.5 text-[11px] font-bold transition ${
                  view === v ? "bg-navy-850 text-white" : "bg-surface text-muted hover:text-ink"
                }`}
              >
                {v === "grid" ? "▦ شبكة" : "☰ قائمة"}
              </button>
            ))}
          </div>
          {hasFilters ? (
            <button
              type="button"
              onClick={clear}
              className="rounded-[3px] border border-live/40 px-3 py-1.5 text-[12px] font-bold text-live transition hover:bg-live hover:text-white focus-ring"
            >
              مسح الفلاتر
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
