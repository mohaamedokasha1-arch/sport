import type { Metadata } from "next";
import Link from "@/components/i18n/Link";
import { getSiteSettingsCached } from "@/lib/site-settings";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";
import { localeAlternates } from "@/lib/i18n/metadata";

export type ViewProps = Record<string, never>;


export function generateMetadata(locale: Locale, _props: ViewProps = {} as ViewProps): Metadata {
  return {
  title: t(locale, "ct.metaTitle"),
  description: t(locale, "ct.metaDescription"),
  alternates: localeAlternates(locale, "/contact"),
  // Static, always-listed page in app/sitemap.ts: do not inherit the data-dependent root robots.
  robots: { index: true, follow: true },
};
}

/** A plain address only — shown when the operator has saved one in /admin/settings. */
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

export default async function ContactPage({ locale }: { locale: Locale }) {
  // The address is operator-entered (site_settings.contactEmail). Nothing is invented:
  // without a saved, well-formed address the page keeps the honest "no channel" notice.
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const settings = await getSiteSettingsCached();
  const email = settings.contactEmail.trim();
  const hasEmail = EMAIL_RE.test(email);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow mb-2">{tr("ct.eyebrow")}</p>
      <h1 className="text-3xl font-extrabold tracking-tight">{tr("ct.heading")}</h1>
      {hasEmail ? (
        <section className="card mt-6 p-5" aria-labelledby="contact-email">
          <h2 id="contact-email" className="text-[15px] font-extrabold">{tr("ct.emailHeading")}</h2>
          <p className="mt-2 text-[13px] leading-6 text-muted">
            {tr("ct.emailBody")}{" "}
            <a href={`mailto:${email}`} dir="ltr" className="num font-bold text-gold-600 underline-offset-2 hover:underline dark:text-gold-400">
              {email}
            </a>
          </p>
        </section>
      ) : (
        <section className="card mt-6 p-5" aria-labelledby="contact-status">
          <h2 id="contact-status" className="text-[15px] font-extrabold">{tr("ct.statusHeading")}</h2>
          <p className="mt-2 text-[13px] leading-6 text-muted">
            {tr("ct.statusBody")}
          </p>
        </section>
      )}

      <nav aria-label={tr("ct.relatedAria")} className="mt-5 flex flex-wrap gap-3">
        <Link href="/broadcast-rights" className="inline-flex min-h-11 items-center rounded-[3px] border border-line bg-surface px-4 py-2 text-[12px] font-bold transition hover:border-gold-500 focus-ring">
          {tr("ct.broadcastRights")}
        </Link>
        <Link href="/privacy" className="inline-flex min-h-11 items-center rounded-[3px] border border-line bg-surface px-4 py-2 text-[12px] font-bold transition hover:border-gold-500 focus-ring">
          {tr("ct.privacy")}
        </Link>
        <Link href="/terms" className="inline-flex min-h-11 items-center rounded-[3px] border border-line bg-surface px-4 py-2 text-[12px] font-bold transition hover:border-gold-500 focus-ring">
          {tr("ct.terms")}
        </Link>
      </nav>
    </div>
  );
}
