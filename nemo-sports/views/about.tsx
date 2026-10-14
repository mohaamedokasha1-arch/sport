import type { Metadata } from "next";
import Link from "next/link";
import { demoContentVisible } from "@/lib/site";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";

export type ViewProps = Record<string, never>;


export function generateMetadata(locale: Locale, _props: ViewProps = {} as ViewProps): Metadata {
  return {
  // The root layout appends " | نيمو سبورتس", so the brand is not repeated here.
  title: t(locale, "ab.metaTitle"),
  description: t(locale, "ab.metaDescription"),
  alternates: { canonical: "/about" },
  // Static, always-listed page in app/sitemap.ts: do not inherit the data-dependent root robots.
  robots: { index: true, follow: true },
};
}

export default function AboutPage({ locale }: { locale: Locale }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const preview = demoContentVisible();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow mb-2">{tr("ab.eyebrow")}</p>
      <h1 className="text-3xl font-extrabold tracking-tight">{tr("ab.heading")}</h1>

      <div className="mt-6 space-y-4 text-[15px] leading-[1.9]">
        <p>
          <strong>{locale === "ar" ? "نيمو سبورتس (NEMO Sports)" : "NEMO Sports"}</strong> {tr("ab.intro1")}
        </p>
        <p>
          {tr("ab.intro2")}
        </p>
        <p>{tr("ab.principlesLead")}</p>
        <ul className="space-y-2 pe-4">
          <li>• <strong>{tr("ab.p1Title")}</strong>{tr("ab.p1Body")}</li>
          <li>• <strong>{tr("ab.p2Title")}</strong>{tr("ab.p2Body")}</li>
          <li>• <strong>{tr("ab.p3Title")}</strong>{tr("ab.p3Body")}</li>
        </ul>
        <p>
          {tr("ab.indexingNote")}
        </p>
      </div>

      <div className="mt-8 card p-5">
        <h2 className="text-[15px] font-extrabold">{tr("ab.dataStatus")}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          {tr("ab.dataStatusBody")}
        </p>
        {preview ? (
          <p className="mt-3 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[12px] font-semibold leading-relaxed text-muted">
            {tr("ab.previewNotice")}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/matches" className="inline-flex min-h-11 items-center rounded-[3px] bg-navy-850 px-4 py-2 text-[12px] font-bold text-white transition hover:bg-navy-700 focus-ring">
            {tr("ab.browseMatches")}
          </Link>
          <Link href="/broadcast-rights" className="inline-flex min-h-11 items-center rounded-[3px] border border-line px-4 py-2 text-[12px] font-bold transition hover:border-gold-500 focus-ring">
            {tr("ab.broadcastRights")}
          </Link>
        </div>
      </div>
    </div>
  );
}
