import { LegalShell, Section, legalMetadata } from "@/components/legal/LegalShell";
import { demoContentVisible } from "@/lib/site";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";
import type { Metadata } from "next";

export type ViewProps = Record<string, never>;

export function generateMetadata(locale: Locale, _props: ViewProps = {} as ViewProps): Metadata {
  return legalMetadata(locale, t(locale, "legal.copyrightTitle"), t(locale, "legal.copyrightDescription"), "/copyright");
}

export default function CopyrightPage({ locale }: { locale: Locale }) {
  const tr = (key: string) => t(locale, key);
  const preview = demoContentVisible();
  return (
    <LegalShell locale={locale} eyebrow={tr("legal.copyrightEyebrow")} title={tr("legal.copyrightTitle")} updated="2026-10-08">
      <Section title={tr("legal.copyright.ownTitle")}>
        <p>{tr("legal.copyright.ownBody")}</p>
      </Section>

      <Section title={tr("legal.copyright.newsTitle")}>
        <p>{tr("legal.copyright.newsBody")}</p>
      </Section>

      <Section title={tr("legal.copyright.logosTitle")}>
        <p>{tr("legal.copyright.logosBody")}</p>
        {preview ? <p>{tr("legal.copyright.previewNote")}</p> : null}
      </Section>

      <Section title={tr("legal.copyright.dataTitle")}>
        <p>{tr("legal.copyright.dataBody")}</p>
      </Section>

      <Section title={tr("legal.copyright.reportTitle")}>
        <p>{tr("legal.copyright.reportBody")}</p>
      </Section>
    </LegalShell>
  );
}
