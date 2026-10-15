import { serializeJsonLd } from "@/lib/json-ld";
import { SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/site";
import { siteBranding, type SiteSettings } from "@/lib/site-settings";
import { LocaleProvider } from "@/lib/i18n/context";
import { t } from "@/lib/i18n/translate";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AdScripts from "@/components/ads/AdScripts";
import GoogleAnalytics from "@/components/analytics/GoogleAnalytics";
import LiveProvider from "@/components/live/LiveProvider";
import { getLiveStates } from "@/lib/live";
import { demoContentVisible } from "@/lib/site";

/**
 * NEMO Sports · root shell shared by both language trees
 * ─────────────────────────────────────────────────────────────────────────────
 * `<html>`/`<body>` may only live in a root layout, and a root layout cannot
 * read request state without making every page beneath it dynamic. That is why
 * the two languages are two route groups with two root layouts: each one
 * hardcodes its own `lang`/`dir`, so `/` keeps prerendering exactly as it does
 * today while `/en` prerenders a genuine left-to-right document.
 *
 * Everything except `lang`, `dir`, `inLanguage` and the translated chrome is
 * the same component tree the site has always rendered.
 */

const themeInit = `try{var t=localStorage.getItem('nemo-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark')}catch(e){}`;

function organizationLd(brand: ReturnType<typeof siteBranding>, locale: Locale) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brand.name,
    alternateName: brand.alternateName,
    url: SITE_URL,
    slogan: t(locale, "matches.subtitle"),
    description: brand.description,
  };
}

function websiteLd(brand: ReturnType<typeof siteBranding>, locale: Locale) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: brand.name,
    url: SITE_URL,
    inLanguage: locale,
    potentialAction: {
      "@type": "SearchAction",
      target: absoluteUrl(locale === DEFAULT_LOCALE ? "/search?q={search_term_string}" : "/en/search?q={search_term_string}"),
      "query-input": "required name=search_term_string",
    },
  };
}

export function RootShell({
  locale,
  settings,
  children,
}: {
  locale: Locale;
  settings: SiteSettings;
  children: React.ReactNode;
}) {
  const brand = siteBranding(settings);
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        <GoogleAnalytics />
        {/* Google Search Console — ownership verification tag (must sit in <head>). */}
        <meta name="google-site-verification" content="6nwKbe3UwHbbzzDg0S8a6TRE_rEEIAdyGgIJD6q6ua4" />
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationLd(brand, locale)) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteLd(brand, locale)) }}
        />
      </head>
      <body className="min-h-screen bg-bg text-ink antialiased">
        <LocaleProvider locale={locale}>
          <LiveProvider initial={demoContentVisible() ? getLiveStates() : {}} enabled={demoContentVisible()}>
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[90] focus:rounded-[3px] focus:bg-gold-500 focus:px-4 focus:py-2 focus:text-navy-900"
            >
              {t(locale, "header.skipToContent")}
            </a>
            <Header locale={locale} />
            <main id="main">{children}</main>
            <Footer locale={locale} />
            {/* Adsterra Social Bar + Popunder. Rendered from the root layout so it
                survives client navigation, and injected after load + idle, never
                on /admin (components/ads/AdScripts.tsx). */}
            <AdScripts />
          </LiveProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}

export { SITE_NAME };
