import type { Metadata } from "next";
import Link from "@/components/i18n/Link";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";
import { localeAlternates } from "@/lib/i18n/metadata";

export type ViewProps = Record<string, never>;


export function generateMetadata(locale: Locale, _props: ViewProps = {} as ViewProps): Metadata {
  return {
  title: t(locale, "ac.metaTitle"),
  description: t(locale, "ac.metaDescription"),
  alternates: localeAlternates(locale, "/account", { noHreflang: true }),
  robots: { index: false, follow: false },
};
}

export default function AccountPage({ locale }: { locale: Locale }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow mb-2">{tr("ac.eyebrow")}</p>
      <h1 className="text-3xl font-extrabold tracking-tight">{tr("ac.heading")}</h1>
      <section className="card mt-6 p-5" aria-labelledby="account-status">
        <h2 id="account-status" className="text-[15px] font-extrabold">{tr("ac.statusHeading")}</h2>
        <p className="mt-2 text-[13px] leading-6 text-muted">
          {tr("ac.statusBody")}
        </p>
      </section>
      <p className="mt-5 text-[13px] text-muted">
        <Link href="/my-day" className="font-bold underline">{tr("ac.openMyDay")}</Link>{tr("ac.myDaySuffix")} <Link href="/matches" className="font-bold text-gold-600 dark:text-gold-400">{tr("nav.matches")}</Link> ·{" "}
        <Link href="/live" className="font-bold text-gold-600 dark:text-gold-400">{tr("ac.live")}</Link> ·{" "}
        <Link href="/faq" className="font-bold text-gold-600 dark:text-gold-400">{tr("ac.faq")}</Link>.
      </p>
    </div>
  );
}
