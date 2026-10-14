import Link from "@/components/i18n/Link";
import Logo from "@/components/brand/Logo";
import MainNav from "./MainNav";
import MobileMenu from "./MobileMenu";
import ThemeToggle from "./ThemeToggle";
import SearchBox from "./SearchBox";
import LanguageSwitcher from "./LanguageSwitcher";
import ScoreRail from "@/components/live/ScoreRail";
import SiteClock from "./SiteClock";
import { t } from "@/lib/i18n/translate";
import { timeZoneLabel } from "@/lib/i18n/dates";
import type { Locale } from "@/lib/i18n/locales";

export default function Header({ locale }: { locale: Locale }) {
  const now = new Date();

  return (
    <header className="sticky top-0 z-50">
      {/* utility strip */}
      <div className="bg-navy-950 text-white/60">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-1.5 text-[11px]">
          <span className="flex items-center gap-3">
            <SiteClock initialIso={now.toISOString()} locale={locale} />
            <span className="hidden text-white/25 sm:inline">|</span>
            <span className="hidden sm:inline">{timeZoneLabel(locale)}</span>
          </span>
          <span className="flex items-center gap-3">
            <Link href="/live" className="flex min-h-11 items-center font-bold text-white/75 transition hover:text-gold-400 focus-ring">
              {t(locale, "header.followLive")}
            </Link>
            <span className="hidden text-white/25 md:inline">|</span>
            <Link href="/broadcast-rights" className="hidden min-h-11 items-center transition hover:text-gold-400 md:inline-flex focus-ring">
              {t(locale, "header.broadcastPolicy")}
            </Link>
            {/* Language switcher lives here on desktop: always visible, next to
                the other utility controls, and reachable before the nav
                collapses into the mobile drawer. */}
            <span className="hidden text-white/25 sm:inline">|</span>
            <LanguageSwitcher className="hidden sm:flex" />
          </span>
        </div>
      </div>

      {/* brand + primary nav */}
      <div className="border-b border-navy-800 bg-navy-850 shadow-[0_1px_0_rgba(212,175,55,0.35)]">
        <div className="mx-auto flex max-w-[1280px] items-center gap-4 px-4 py-3">
          <Link href="/" aria-label={t(locale, "header.homeAria")} className="shrink-0 focus-ring">
            <Logo size={38} tone="light" />
          </Link>

          <div className="hidden flex-1 xl:block">
            <MainNav />
          </div>

          <div className="ms-auto flex items-center gap-2">
            {/* Inline search only from 2xl: at exactly 1280px (xl) the full nav
                plus the search box overflowed the page by 8px. Below 2xl the
                compact search button is used. */}
            <div className="hidden 2xl:block">
              <SearchBox />
            </div>
            <Link
              href="/search"
              aria-label={t(locale, "header.search")}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-[3px] border border-white/15 text-white transition hover:border-gold-500 hover:text-gold-400 focus-ring 2xl:hidden"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.6-3.6" strokeLinecap="round" />
              </svg>
            </Link>
            {/* Compact switcher below `sm`, where the utility strip hides it. */}
            <LanguageSwitcher className="flex sm:hidden" />
            <ThemeToggle />
            <MobileMenu />
          </div>
        </div>
      </div>

      {/* live score rail */}
      <ScoreRail />

    </header>
  );
}
