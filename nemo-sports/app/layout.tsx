import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AdScripts from "@/components/ads/AdScripts";
import LiveProvider from "@/components/live/LiveProvider";
import { getLiveStates } from "@/lib/live";
import { robotsForDataSource } from "@/lib/sdl-gateway";
import { demoContentVisible } from "@/lib/site";
import { SITE_NAME, SITE_NAME_AR, SITE_URL, absoluteUrl } from "@/lib/site";
import { serializeJsonLd } from "@/lib/json-ld";
import { robotsWithDiscovery } from "@/lib/seo-discovery";

import {
  getSiteSettingsCached,
  publicBaseMetadata,
  siteBranding,
  type SiteSettings,
} from "@/lib/site-settings";

/**
 * The public metadata block is composed from `site_settings`
 * (lib/site-settings.ts) — the operator's saved values are what crawlers
 * receive. The defaults there reproduce the strings this file used to hardcode,
 * so nothing changes until /admin/settings is edited.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [robots, settings] = await Promise.all([robotsForDataSource(), getSiteSettingsCached()]);
  // `robotsWithDiscovery` only ADDS Google's preview directives
  // (max-image-preview:large …) required for Google Discover eligibility; the
  // index/follow decision made by the data pipeline is passed through byte for
  // byte (see lib/seo-discovery.ts).
  return { ...publicBaseMetadata(settings), robots: robotsWithDiscovery(robots.index, robots.follow) };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0F1B2E" },
    { media: "(prefers-color-scheme: dark)", color: "#050B15" },
  ],
  width: "device-width",
  initialScale: 1,
};

const themeInit = `try{var t=localStorage.getItem('nemo-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark')}catch(e){}`;

function organizationLd(brand: ReturnType<typeof siteBranding>) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brand.name,
    alternateName: brand.alternateName,
    url: SITE_URL,
    slogan: "نتائج ومواعيد المباريات",
    description: brand.description,
  };
}

function websiteLd(brand: ReturnType<typeof siteBranding>) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: brand.name,
    url: SITE_URL,
    inLanguage: "ar",
    potentialAction: {
      "@type": "SearchAction",
      target: absoluteUrl("/search?q={search_term_string}"),
      "query-input": "required name=search_term_string",
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Same memo as generateMetadata(), so this is one read per 20s process-wide.
  const settings: SiteSettings = await getSiteSettingsCached();
  const brand = siteBranding(settings);
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/* Google Search Console — ownership verification tag (must sit in <head>). */}
        <meta name="google-site-verification" content="6nwKbe3UwHbbzzDg0S8a6TRE_rEEIAdyGgIJD6q6ua4" />
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationLd(brand)) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteLd(brand)) }}
        />
      </head>
      <body className="min-h-screen bg-bg text-ink antialiased">
        <LiveProvider initial={demoContentVisible() ? getLiveStates() : {}} enabled={demoContentVisible()}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[90] focus:rounded-[3px] focus:bg-gold-500 focus:px-4 focus:py-2 focus:text-navy-900"
          >
            تخطَّ إلى المحتوى
          </a>
          <Header />
          <main id="main">{children}</main>
          <Footer />
          {/* Adsterra Social Bar + Popunder. Rendered from the root layout so it
              survives client navigation, and injected after load + idle, never
              on /admin (components/ads/AdScripts.tsx). */}
          <AdScripts />
        </LiveProvider>
      </body>
    </html>
  );
}
