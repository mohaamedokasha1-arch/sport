"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface MatchOption {
  id: string;
  slug: string;
  home: string;
  away: string;
  homeLogo: string;
  awayLogo: string;
  competition: string;
  competitionSlug: string;
  kickoff: string;
  sport: string;
  status: string;
  source: "admin" | "provider";
  published: boolean;
}

const STATUS_AR: Record<string, string> = {
  live: "مباشر",
  upcoming: "قادمة",
  scheduled: "قادمة",
  finished: "انتهت",
  postponed: "مؤجلة",
  cancelled: "ملغاة",
};

/**
 * Searchable match select for the live-stream form (requirement §6).
 * Fetches the operator-visible match list once, filters locally as the
 * operator types, and reports the full selected match upward so the form
 * can bind the stream to exactly one match.
 */
export default function MatchPicker({
  value,
  onChange,
  disabled,
}: {
  /** currently selected match slug ("" = none) */
  value: string;
  onChange: (match: MatchOption | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<MatchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/matches/options", { cache: "no-store" });
        const data = (await res.json()) as { ok: boolean; items?: MatchOption[] };
        if (!cancelled) setOptions(data.ok ? data.items ?? [] : []);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? options.filter((o) => `${o.home} ${o.away} ${o.competition} ${o.slug}`.toLowerCase().includes(q))
      : options;
    return list.slice(0, 30);
  }, [options, query]);

  const selected = options.find((o) => o.slug === value) ?? null;

  const kickoffLabel = (iso: string) => {
    const d = new Date(iso);
    if (!Number.isFinite(+d)) return "—";
    return `${d.toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" })} · ${d.toLocaleTimeString("ar-EG", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" })}`;
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-[3px] border border-navy-700 bg-navy-950 px-3 py-2 text-start text-[12px] text-white outline-none transition focus:border-gold-500 disabled:opacity-60"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <span className="min-w-0">
            <span className="block truncate font-bold">{selected.home} × {selected.away}</span>
            <span className="block truncate text-[10px] text-white/45">{selected.competition} · {kickoffLabel(selected.kickoff)}</span>
          </span>
        ) : (
          <span className="text-white/45">{loading ? "جارٍ تحميل المباريات…" : "اختر مباراة…"}</span>
        )}
        <span aria-hidden className="shrink-0 text-white/40">▾</span>
      </button>

      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-[6px] border border-navy-700 bg-navy-950 shadow-2xl">
          <div className="border-b border-navy-800 p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث باسم فريق أو بطولة…"
              className="w-full rounded-[3px] border border-navy-700 bg-navy-900 px-3 py-2 text-[12px] text-white outline-none focus:border-gold-500"
            />
          </div>
          <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
            {loadError ? (
              <li className="px-3 py-2 text-[12px] text-live">تعذّر تحميل قائمة المباريات.</li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-2 text-[12px] text-white/45">لا توجد نتائج مطابقة.</li>
            ) : (
              filtered.map((o) => (
                <li key={`${o.source}:${o.slug}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.slug === value}
                    onClick={() => {
                      onChange(o);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`block w-full px-3 py-2 text-start text-[12px] transition hover:bg-white/[0.06] ${o.slug === value ? "bg-gold-500/10" : ""}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-bold">{o.home} × {o.away}</span>
                      <span className={`shrink-0 rounded-[3px] px-1.5 py-0.5 text-[9px] font-extrabold ${o.status === "live" ? "bg-live/15 text-live" : "bg-white/10 text-white/50"}`}>
                        {STATUS_AR[o.status] ?? o.status}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-white/45">
                      {o.competition} · {kickoffLabel(o.kickoff)} · {o.source === "admin" ? "إدارة" : "مزوّد"}
                      {!o.published ? " · غير منشور" : ""}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
