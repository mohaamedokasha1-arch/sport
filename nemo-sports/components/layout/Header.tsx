import Link from "next/link";
import Logo from "@/components/brand/Logo";
import MainNav from "./MainNav";
import MobileMenu from "./MobileMenu";
import ThemeToggle from "./ThemeToggle";
import SearchBox from "./SearchBox";
import ScoreRail from "@/components/live/ScoreRail";
import { breakingNews } from "@/lib/data";
import { liveMatches } from "@/lib/data";
import { dateAr, relative } from "@/lib/format";

export default function Header() {
  const now = new Date();

  return (
    <header className="sticky top-0 z-50">
      {/* utility strip */}
      <div className="bg-navy-950 text-white/60">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-1.5 text-[11px]">
          <span className="flex items-center gap-3">
            <span className="font-semibold">{dateAr(now.toISOString())}</span>
            <span className="hidden text-white/25 sm:inline">|</span>
            <span className="hidden sm:inline">التوقيت المحلي</span>
          </span>
          <span className="flex items-center gap-3">
            <Link href="/live" className="flex items-center gap-1.5 font-bold text-live transition hover:text-white">
              <span className="live-dot" aria-hidden />
              {liveMatches.length} مباريات مباشرة
            </Link>
            <span className="hidden text-white/25 md:inline">|</span>
            <Link href="/broadcast-rights" className="hidden transition hover:text-gold-400 md:inline">
              سياسة حقوق البث
            </Link>
            <Link href="/admin" className="hidden transition hover:text-gold-400 md:inline">
              لوحة التحكم
            </Link>
          </span>
        </div>
      </div>

      {/* brand + primary nav */}
      <div className="border-b border-navy-800 bg-navy-850 shadow-[0_1px_0_rgba(212,175,55,0.35)]">
        <div className="mx-auto flex max-w-[1280px] items-center gap-4 px-4 py-3">
          <Link href="/" aria-label="نيمو سبورتس — الصفحة الرئيسية" className="shrink-0 focus-ring">
            <Logo size={38} tone="light" />
          </Link>

          <div className="hidden flex-1 lg:block">
            <MainNav />
          </div>

          <div className="ms-auto flex items-center gap-2">
            <div className="hidden xl:block">
              <SearchBox />
            </div>
            <Link
              href="/search"
              aria-label="البحث"
              className="grid h-9 w-9 place-items-center rounded-[3px] border border-white/15 text-white transition hover:border-gold-500 hover:text-gold-400 focus-ring xl:hidden"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.6-3.6" strokeLinecap="round" />
              </svg>
            </Link>
            <ThemeToggle />
            <Link
              href="/account"
              className="hidden rounded-[3px] bg-gold-500 px-3.5 py-2 text-[12px] font-extrabold text-navy-900 transition hover:bg-gold-400 focus-ring sm:block"
            >
              تسجيل الدخول
            </Link>
            <MobileMenu liveCount={liveMatches.length} />
          </div>
        </div>
      </div>

      {/* live score rail */}
      <ScoreRail />

      {/* breaking news ticker */}
      {breakingNews.length > 0 ? (
        <div className="ticker border-b border-line bg-live/[0.06] dark:bg-live/10">
          <div className="mx-auto flex max-w-[1280px] items-center gap-3 overflow-hidden px-4 py-1.5">
            <span className="flex shrink-0 items-center gap-1.5 rounded-[3px] bg-live px-2 py-1 text-[10px] font-extrabold tracking-wide text-white">
              <svg width="9" height="12" viewBox="0 0 9 12" aria-hidden>
                <path d="M5.5 0 0 7h3l-.5 5L9 4.6H5.7z" fill="currentColor" />
              </svg>
              عاجل
            </span>
            <div className="ticker relative flex-1 overflow-hidden">
              <div className="ticker-track whitespace-nowrap">
                {[...breakingNews, ...breakingNews].map((a, i) => (
                  <Link
                    key={`${a.slug}-${i}`}
                    href={`/news/${a.slug}`}
                    className="mx-5 inline-flex items-center gap-2 text-[12px] font-semibold text-ink transition hover:text-live"
                  >
                    <span className="h-1 w-1 rounded-full bg-gold-500" aria-hidden />
                    {a.title}
                    <span className="num text-[10px] text-muted">
                      {relative(a.publishedAgoMin === 0 ? new Date().toISOString() : new Date(Date.now() - a.publishedAgoMin * 60000).toISOString())}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
