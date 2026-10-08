"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import MainNav from "./MainNav";
import SearchBox from "./SearchBox";
import { NAV } from "@/lib/nav";

export default function MobileMenu() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
    } else if (wasOpen.current) {
      triggerRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="فتح القائمة"
        aria-haspopup="dialog"
        aria-controls={open ? "mobile-navigation-drawer" : undefined}
        aria-expanded={open}
        className="grid h-11 w-11 place-items-center rounded-[3px] border border-white/15 text-white transition hover:border-gold-500 hover:text-gold-400 focus-ring xl:hidden"
      >
        <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden>
          <path d="M0 1h18M0 7h18M0 13h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] xl:hidden">
          <button
            type="button"
            aria-label="إغلاق القائمة"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-navy-950/70 backdrop-blur-[2px]"
          />
          <aside
            ref={drawerRef}
            id="mobile-navigation-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-navigation-title"
            className="absolute inset-y-0 end-0 flex w-[85%] max-w-sm flex-col overflow-y-auto border-s border-navy-700 bg-navy-900 text-white"
          >
            <header className="flex items-center justify-between border-b border-navy-800 px-4 py-3">
              <span id="mobile-navigation-title" className="font-display text-sm font-bold tracking-[0.2em] text-gold-500">
                NEMO SPORTS
              </span>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="إغلاق"
                className="grid h-11 w-11 place-items-center rounded-[3px] border border-white/15 hover:border-gold-500 focus-ring"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            <div className="border-b border-navy-800 p-4">
              <SearchBox variant="mobile" />
            </div>

            <div className="p-3">
              <MainNav orientation="vertical" onNavigate={() => setOpen(false)} />
            </div>

            <div className="mt-auto space-y-2 border-t border-navy-800 p-4 text-[12px]">
              <Link href="/live" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2 font-bold text-live focus-ring">
                <span className="live-dot" aria-hidden />
                تابع المباريات المباشرة
              </Link>
              <p className="text-white/55">
                {NAV.length} أقسام رئيسية · روابط بث رسمية فقط
              </p>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
