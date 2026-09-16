"use client";

import { useEffect, useState } from "react";
import MainNav from "./MainNav";
import SearchBox from "./SearchBox";
import { NAV } from "@/lib/nav";

export default function MobileMenu({ liveCount }: { liveCount: number }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="فتح القائمة"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-[3px] border border-white/15 text-white transition hover:border-gold-500 hover:text-gold-400 focus-ring lg:hidden"
      >
        <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden>
          <path d="M0 1h18M0 7h18M0 13h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button
            type="button"
            aria-label="إغلاق القائمة"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-navy-950/70 backdrop-blur-[2px]"
          />
          <aside className="absolute inset-y-0 end-0 flex w-[85%] max-w-sm flex-col overflow-y-auto border-s border-navy-700 bg-navy-900 text-white">
            <header className="flex items-center justify-between border-b border-navy-800 px-4 py-3">
              <span className="font-display text-sm font-bold tracking-[0.2em] text-gold-500">
                NEMO SPORTS
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="إغلاق"
                className="grid h-8 w-8 place-items-center rounded-[3px] border border-white/15 hover:border-gold-500 focus-ring"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            <div className="border-b border-navy-800 p-4">
              <SearchBox />
            </div>

            <div className="p-3">
              <MainNav orientation="vertical" onNavigate={() => setOpen(false)} />
            </div>

            <div className="mt-auto space-y-2 border-t border-navy-800 p-4 text-[12px]">
              <p className="flex items-center gap-2 font-bold text-live">
                <span className="live-dot" aria-hidden />
                {liveCount} مباراة مباشرة الآن
              </p>
              <p className="text-white/45">
                {NAV.length} أقسام رئيسية · بث رسمي مرخّص فقط
              </p>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
