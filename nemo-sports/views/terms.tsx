import { LegalShell, Section, legalMetadata } from "@/components/legal/LegalShell";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";
import type { Metadata } from "next";

export type ViewProps = Record<string, never>;

export function generateMetadata(locale: Locale, _props: ViewProps = {} as ViewProps): Metadata {
  return legalMetadata(locale, t(locale, "legal.termsTitle"), t(locale, "legal.termsDescription"), "/terms");
}

export default function TermsPage({ locale }: { locale: Locale }) {
  const tr = (key: string) => t(locale, key);
  return (
    <LegalShell locale={locale} eyebrow={tr("legal.termsEyebrow")} title={tr("legal.termsTitle")} updated="2026-10-08">
      <Section title={tr("legal.terms.useTitle")}>
        <p>{tr("legal.terms.useBody")}</p>
      </Section>

      <Section title={tr("legal.terms.prohibitedTitle")}>
        <ul className="space-y-1.5 pe-4">
          <li>{tr("legal.terms.prohibited1")}</li>
          <li>{tr("legal.terms.prohibited2")}</li>
          <li>{tr("legal.terms.prohibited3")}</li>
          <li>{tr("legal.terms.prohibited4")}</li>
        </ul>
      </Section>

      <Section title={tr("legal.terms.accuracyTitle")}>
        <p>{tr("legal.terms.accuracyBody")}</p>
      </Section>

      <Section title={tr("legal.terms.thirdPartyTitle")}>
        <p>{tr("legal.terms.thirdPartyBody")}</p>
      </Section>

      <Section title={tr("legal.terms.changesTitle")}>
        <p>{tr("legal.terms.changesBody")}</p>
      </Section>
    </LegalShell>
  );
}
