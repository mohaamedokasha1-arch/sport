import type { ReactNode } from "react";
import type { Metadata } from "next";
import { localeAlternates } from "@/lib/i18n/metadata";
import { t } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/locales";

export function LegalShell({
  locale,
  eyebrow,
  title,
  updated,
  children,
}: {
  locale: Locale;
  eyebrow: string;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow mb-2">{eyebrow}</p>
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      <p className="num mt-2 text-[12px] text-muted">{t(locale, "legal.lastUpdated", { date: updated })}</p>
      <div className="mt-6 space-y-6 text-[14px] leading-[1.9] text-muted">{children}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[16px] font-extrabold text-ink">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/**
 * Legal pages are static, real content and are listed in app/sitemap.ts
 * unconditionally. They therefore state `index, follow` explicitly. Without it
 * they inherited the root layout's data-dependent robots (noindex whenever no
 * provider data is servable), which contradicted the sitemap during any outage.
 *
 * The canonical stays the unprefixed Arabic URL for Arabic and the `/en/...`
 * URL for English; hreflang links the two because both pages are shipped.
 */
export const legalMetadata = (
  locale: Locale,
  title: string,
  description: string,
  canonical: string,
): Metadata => ({
  title,
  description,
  alternates: localeAlternates(locale, canonical),
  robots: { index: true, follow: true },
});
