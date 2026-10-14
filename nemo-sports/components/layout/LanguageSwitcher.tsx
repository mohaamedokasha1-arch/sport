"use client";

/**
 * NEMO Sports · language switcher
 * ─────────────────────────────────────────────────────────────────────────────
 * Two text labels — العربية / English — never flags alone, because a flag maps
 * to a country rather than a language and this site's Arabic audience spans
 * several countries.
 *
 * Behaviour:
 *   · Stands in the header utility strip (desktop) and in the mobile drawer, so
 *     it is reachable at every viewport and on every page type.
 *   · Points at the EQUIVALENT page: `/teams/al-ahly` → `/en/teams/al-ahly`,
 *     with the query string intact so filters, pagination and search survive.
 *     Where no English page exists it falls back to the English homepage —
 *     never a 404, and never "everything goes to the homepage".
 *   · The choice is remembered in a first-party cookie holding only the locale
 *     code (no personal data, no fingerprint). Routing never reads it, so a
 *     direct link to `/en/...` always renders English and `/` always renders
 *     Arabic: crawlers and shared links stay deterministic and a redirect loop
 *     is structurally impossible.
 *   · A plain anchor, not `router.push`: the two languages live in different
 *     route groups with different root layouts (different `<html lang>`/`dir`),
 *     so a full document load is what actually applies the new writing
 *     direction. It is also the most robust path for crawlers.
 */

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale } from "@/lib/i18n/context";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n/locales";
import { equivalentPathFor } from "@/lib/i18n/paths";

const OPTIONS: { locale: Locale; label: string; lang: string }[] = [
  { locale: "ar", label: "العربية", lang: "ar" },
  { locale: "en", label: "English", lang: "en" },
];

/** One year, first-party, same-site. Contains nothing but the locale code. */
function rememberChoice(locale: Locale) {
  try {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  } catch {
    /* storage blocked — the link still navigates */
  }
}

/** The two anchors. `search` is the raw query string, "" when not yet known. */
function SwitcherLinks({ search }: { search: string }) {
  const pathname = usePathname() ?? "/";
  const active = useLocale();
  const current = search ? `${pathname}?${search}` : pathname;

  return (
    <>
      {OPTIONS.map((option) => {
        const selected = option.locale === active;
        const href = equivalentPathFor(current, option.locale);
        return (
          <a
            key={option.locale}
            href={href}
            hrefLang={option.lang}
            lang={option.lang}
            dir={option.locale === "ar" ? "rtl" : "ltr"}
            aria-current={selected ? "true" : undefined}
            onClick={() => rememberChoice(option.locale)}
            title={option.locale === "ar" ? "العربية" : "Switch to English"}
            className={`focus-ring inline-flex min-h-[30px] items-center rounded-[2px] px-2 text-[11px] font-bold leading-none transition ${
              selected
                ? "bg-gold-500 text-navy-900"
                : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            {option.label}
          </a>
        );
      })}
    </>
  );
}

/** Reads the query string, so it needs the Suspense boundary below. */
function SwitcherLinksWithQuery() {
  // usePathname() deliberately excludes the query string, so carrying only that
  // would silently drop date filters, pagination and search terms on switch —
  // the one thing the switcher is required to preserve.
  const search = useSearchParams()?.toString() ?? "";
  return <SwitcherLinks search={search} />;
}

export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  return (
    <nav
      aria-label="Language"
      className={`flex items-center gap-0.5 rounded-[3px] border border-white/15 p-0.5 ${className}`}
    >
      {/* The boundary keeps statically prerendered pages static: without it,
          useSearchParams() deopts the whole document to client rendering.
          The fallback is the SAME anchors built from the pathname, never null —
          a null fallback removed the switcher from the server HTML of every
          static page, leaving crawlers and no-JS visitors without one. After
          hydration the query string is added back. */}
      <Suspense fallback={<SwitcherLinks search="" />}>
        <SwitcherLinksWithQuery />
      </Suspense>
    </nav>
  );
}
