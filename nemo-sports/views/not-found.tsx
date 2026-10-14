import type { Metadata } from "next";
import Link from "@/components/i18n/Link";
import Logo from "@/components/brand/Logo";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";

/**
 * Shared 404 body for both language trees.
 *
 * Explicit metadata is declared per locale because a 404 that inherits
 * `index, follow` from a layout while Next.js also emits its built-in
 * `noindex` would publish two conflicting robots directives on one page:
 *
 *   <meta name="robots" content="noindex">
 *   <meta name="robots" content="index, follow">
 *
 * Declaring robots here lets the not-found route override the layout instead
 * of adding a second tag, so the page emits exactly one directive.
 */
export function notFoundMetadata(locale: Locale): Metadata {
  return {
    title: t(locale, "error.notFoundMetaTitle"),
    robots: { index: false, follow: true },
  };
}

export default function NotFoundBody({ locale }: { locale: Locale }) {
  return (
    <div className="mx-auto grid max-w-2xl place-items-center px-4 py-20 text-center">
      <Logo size={44} tone="brand" />
      <p className="num mt-8 text-6xl font-extrabold tracking-tight text-navy-850 dark:text-white">404</p>
      <h1 className="mt-3 text-xl font-extrabold">{t(locale, "error.notFoundTitle")}</h1>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">
        {t(locale, "error.notFoundBody")}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/" className="rounded-[3px] bg-gold-500 px-4 py-2.5 text-[12px] font-extrabold text-navy-900 transition hover:bg-gold-400">
          {t(locale, "common.home")}
        </Link>
        <Link href="/search" className="rounded-[3px] border border-line px-4 py-2.5 text-[12px] font-bold transition hover:border-gold-500">
          {t(locale, "error.search")}
        </Link>
        <Link href="/live" className="rounded-[3px] border border-line px-4 py-2.5 text-[12px] font-bold transition hover:border-gold-500">
          {t(locale, "error.liveResults")}
        </Link>
      </div>
    </div>
  );
}
