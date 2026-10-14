import type { Metadata } from "next";
import Link from "@/components/i18n/Link";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";
import { localeAlternates } from "@/lib/i18n/metadata";

export type ViewProps = Record<string, never>;


export function generateMetadata(locale: Locale, _props: ViewProps = {} as ViewProps): Metadata {
  return {
  title: t(locale, "faq.metaTitle"),
  description: t(locale, "faq.metaDescription"),
  alternates: localeAlternates(locale, "/faq"),
  // Static, always-listed page in app/sitemap.ts: do not inherit the data-dependent root robots.
  robots: { index: true, follow: true },
};
}

const FAQ_KEYS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export default function FaqPage({ locale }: { locale: Locale }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow mb-2">{tr("faq.eyebrow")}</p>
      <h1 className="text-3xl font-extrabold tracking-tight">{tr("faq.heading")}</h1>

      <dl className="mt-6 space-y-3">
        {FAQ_KEYS.map((n) => (
          <div key={n} className="card p-4">
            <dt className="text-[14px] font-extrabold">{tr(`faq.q${n}` as Parameters<typeof t>[1])}</dt>
            <dd className="mt-2 text-[13px] leading-relaxed text-muted">{tr(`faq.a${n}` as Parameters<typeof t>[1])}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-6 card p-4 text-[13px] text-muted">
        {tr("faq.moreIntro")}{" "}
        <Link href="/broadcast-rights" className="font-bold text-gold-600 dark:text-gold-400">{tr("faq.broadcastPolicy")}</Link>
        {" "}{tr("faq.and")} <Link href="/terms" className="font-bold text-gold-600 dark:text-gold-400">{tr("faq.terms")}</Link>.
      </p>
    </div>
  );
}
