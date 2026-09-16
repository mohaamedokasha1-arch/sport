"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MatchCard from "./MatchCard";
import { sortMatches } from "@/lib/filters";
import type { Match } from "@/lib/data";

const PER_PAGE = 12;

export default function MatchesBrowser({ matches }: { matches: Match[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const view = (params.get("view") as "grid" | "list") ?? "grid";
  const [sort, setSort] = useState<"time" | "importance">("time");
  const [page, setPage] = useState(1);

  useEffect(() => setPage(1), [params]);

  const sorted = sortMatches(matches, sort);
  const pages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const shown = sorted.slice(0, page * PER_PAGE);

  if (sorted.length === 0) {
    return (
      <div className="card grid place-items-center gap-3 px-6 py-14 text-center">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-muted" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.6-3.6M8.5 11h5" strokeLinecap="round" />
        </svg>
        <p className="text-[15px] font-bold">لا توجد مباريات تطابق معايير البحث</p>
        <p className="max-w-sm text-[13px] text-muted">
          جرّب تغيير التاريخ أو الرياضة، أو امسح الفلاتر لعرض كل مباريات اليوم.
        </p>
        <button
          type="button"
          onClick={() => router.replace("/matches")}
          className="rounded-[3px] bg-navy-850 px-4 py-2 text-[12px] font-bold text-white transition hover:bg-navy-700"
        >
          مسح الفلاتر
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-muted">
          <span className="num font-bold text-ink">{sorted.length}</span> مباراة
          {pages > 1 ? ` · الصفحة ${page} من ${pages}` : ""}
        </p>
        <label className="flex items-center gap-2 text-[12px] text-muted">
          ترتيب حسب
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "time" | "importance")}
            className="rounded-[3px] border border-line bg-surface px-2.5 py-1.5 text-[12px] font-semibold outline-none focus:border-gold-500"
          >
            <option value="time">التوقيت</option>
            <option value="importance">أهمية المباراة</option>
          </select>
        </label>
      </div>

      {view === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          {shown.map((m) => (
            <MatchCard key={m.id} match={m} variant="row" />
          ))}
        </div>
      )}

      {page < pages ? (
        <div className="mt-5 grid place-items-center">
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            className="rounded-[3px] border border-line bg-surface px-5 py-2.5 text-[12px] font-bold transition hover:border-gold-500 hover:text-gold-600 dark:hover:text-gold-400 focus-ring"
          >
            عرض المزيد ({sorted.length - shown.length} متبقية)
          </button>
        </div>
      ) : null}
    </div>
  );
}
