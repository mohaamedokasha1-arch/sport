import { requiredAttributions } from "@/lib/providers";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";

/**
 * Provider attribution strip — REQUIRED by free-tier licences.
 * Rendered in the site footer and available to any data panel.
 * Each source carries both an Arabic and an English attribution line
 * (lib/providers.ts); the licence requires the dofollow link with the provider
 * name visible, which holds in both languages.
 *
 * Stays a SERVER component with a `locale` prop: lib/providers.ts reads
 * non-NEXT_PUBLIC env, so making this client would risk a hydration mismatch.
 */
export default function AttributionFooter({
  className = "",
  exclude = [],
  locale = DEFAULT_LOCALE,
}: {
  className?: string;
  exclude?: string[];
  locale?: Locale;
}) {
  const sources = requiredAttributions().filter((source) => !exclude.includes(source.name));
  return (
    <p className={`text-[11px] leading-relaxed text-white/60 ${className}`}>
      {sources.map((s, i) => (
        <span key={s.name}>
          {i > 0 ? <span aria-hidden> · </span> : null}
          {locale === "ar" ? s.attributionTextAr : s.attributionText}{" "}
          <a
            href={s.attributionUrl}
            target="_blank"
            rel="dofollow noopener"
            className="font-bold text-white/60 underline decoration-gold-500/50 underline-offset-2 transition hover:text-gold-400"
          >
            {s.name}
          </a>
        </span>
      ))}
    </p>
  );
}
