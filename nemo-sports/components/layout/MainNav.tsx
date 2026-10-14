"use client";

import Link from "@/components/i18n/Link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV } from "@/lib/nav";
import { PUBLIC_SPORTS } from "@/lib/core-data";
import { useT } from "@/lib/i18n/context";
import { sportName } from "@/lib/i18n/names";
import { useLocale } from "@/lib/i18n/context";
import { stripLocalePrefix } from "@/lib/i18n/paths";

export default function MainNav({
  onNavigate,
  orientation = "horizontal",
}: {
  onNavigate?: () => void;
  orientation?: "horizontal" | "vertical";
}) {
  const tr = useT();
  const locale = useLocale();
  const pathname = usePathname();
  const [openSports, setOpenSports] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpenSports(false);
  }, [pathname]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpenSports(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  /**
   * Active-state matching must ignore the `/en` prefix, otherwise no item is
   * ever marked current on the English tree.
   */
  const current = stripLocalePrefix(pathname ?? "/");
  const isActive = (href: string) => current.startsWith(href);
  const vertical = orientation === "vertical";

  const linkCls = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-[3px] px-3 py-2 text-[13px] font-bold transition ${
      active ? "text-gold-400" : "text-white/80 hover:bg-white/10 hover:text-white"
    }`;

  return (
    <nav
      ref={wrapRef}
      className={`flex ${vertical ? "flex-col items-stretch" : "items-center"} gap-1`}
      aria-label={tr("nav.main")}
    >
      {/* Sports — dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenSports((v) => !v)}
          aria-expanded={openSports}
          aria-haspopup="true"
          className={`flex items-center gap-1.5 ${linkCls(current.startsWith("/sports"))} focus-ring`}
        >
          {tr("nav.sports")}
          <svg width="9" height="6" viewBox="0 0 9 6" aria-hidden className="opacity-70">
            <path d="M1 1l3.5 3.5L8 1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        {openSports ? (
          <div
            className={`${
              vertical ? "static mt-1" : "absolute start-0 top-full z-50"
            } w-64 border border-navy-700 bg-navy-900 p-2 shadow-2xl`}
          >
            <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
              {tr("nav.sportsAvailable")}
            </p>
            <div className="grid grid-cols-2 gap-1">
              {PUBLIC_SPORTS.map((s) => (
                <Link
                  key={s.slug}
                  href={`/matches?sport=${s.slug}`}
                  onClick={onNavigate}
                  className="flex min-h-11 items-center gap-2 rounded-[3px] px-2 py-1.5 text-[12px] font-semibold text-white/80 transition hover:bg-gold-500 hover:text-navy-900 focus-ring"
                >
                  <span aria-hidden>{s.icon}</span>
                  {sportName(locale, s.slug)}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={`${linkCls(isActive(item.href))} focus-ring`}
          aria-current={isActive(item.href) ? "page" : undefined}
        >
          {tr(item.labelKey)}
        </Link>
      ))}
    </nav>
  );
}
