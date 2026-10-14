import { LegalShell, Section, legalMetadata } from "@/components/legal/LegalShell";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";
import type { Metadata } from "next";

export type ViewProps = Record<string, never>;

export function generateMetadata(locale: Locale, _props: ViewProps = {} as ViewProps): Metadata {
  return legalMetadata(locale, t(locale, "legal.privacyTitle"), t(locale, "legal.privacyDescription"), "/privacy");
}

export default function PrivacyPage({ locale }: { locale: Locale }) {
  const tr = (key: string) => t(locale, key);
  return (
    <LegalShell locale={locale} eyebrow={tr("legal.privacyEyebrow")} title={tr("legal.privacyTitle")} updated="2026-10-09">
      <Section title={tr("legal.privacy.accountsTitle")}>
        <p>{tr("legal.privacy.accountsBody")}</p>
      </Section>

      <Section title={tr("legal.privacy.technicalTitle")}>
        <p>{tr("legal.privacy.technicalBody")}</p>
      </Section>

      <Section title={tr("legal.privacy.localStorageTitle")}>
        <p>{tr("legal.privacy.localStorageBody")}</p>
      </Section>

      <Section title={tr("legal.privacy.sourcesTitle")}>
        <p>{tr("legal.privacy.sourcesBody")}</p>
      </Section>

      <Section title={tr("legal.privacy.adsTitle")}>
        <p>{tr("legal.privacy.adsBody")}</p>
      </Section>

      <Section title={tr("legal.privacy.requestsTitle")}>
        <p>{tr("legal.privacy.requestsBody")}</p>
      </Section>
    </LegalShell>
  );
}
