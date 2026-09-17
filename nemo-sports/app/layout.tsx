import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import LiveProvider from "@/components/live/LiveProvider";
import { getLiveStates } from "@/lib/live";
import { robotsForDataSource } from "@/lib/sdl-gateway";

const baseMetadata: Metadata = {
  metadataBase: new URL("https://nemo.sports"),
  title: {
    default: "نيمو سبورتس | نتائج مباشرة، أخبار وإحصائيات لـ 8 رياضات",
    template: "%s | نيمو سبورتس",
  },
  description:
    "منصة رياضية شاملة: نتائج ومباريات مباشرة، أخبار موثوقة، ترتيب البطولات، إحصائيات الفرق واللاعبين، وروابط بث رسمية مرخّصة فقط.",
  keywords: ["نتائج مباشرة", "مباريات اليوم", "أخبار رياضية", "ترتيب الدوري", "بث مباشر رسمي"],
  openGraph: {
    title: "نيمو سبورتس | Live Sports, Every Moment",
    description: "نتائج مباشرة، أخبار، إحصائيات وبث رسمي مرخّص لثمانية رياضات.",
    siteName: "NEMO Sports",
    locale: "ar_AR",
    type: "website",
  },
};

/**
 * §Instruction 6 — a build running on demo data must not be indexable.
 *
 * `generateMetadata` is evaluated when the page is rendered (at build time for
 * pre-rendered routes), so the decision matches the deployment: add provider
 * keys and rebuild, and the site becomes indexable without touching metadata.
 */
export async function generateMetadata(): Promise<Metadata> {
  const robots = await robotsForDataSource();
  return { ...baseMetadata, robots };
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

const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "NEMO Sports",
  alternateName: "نيمو سبورتس",
  url: "https://nemo.sports",
  slogan: "Live Sports, Every Moment",
  description: "منصة رياضية شاملة للنتائج المباشرة والأخبار والإحصائيات.",
};

const websiteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "NEMO Sports",
  url: "https://nemo.sports",
  inLanguage: "ar",
  potentialAction: {
    "@type": "SearchAction",
    target: "https://nemo.sports/search?q={search_term_string}",
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/* Google Search Console — ownership verification tag (must sit in <head>). */}
        <meta name="google-site-verification" content="6nwKbe3UwHbbzzDg0S8a6TRE_rEEIAdyGgIJD6q6ua4" />
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd) }}
        />
      </head>
      <body className="min-h-screen bg-bg text-ink antialiased">
        <LiveProvider initial={getLiveStates()}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[90] focus:rounded-[3px] focus:bg-gold-500 focus:px-4 focus:py-2 focus:text-navy-900"
          >
            تخطَّ إلى المحتوى
          </a>
          <Header />
          <main id="main">{children}</main>
          <Footer />
        </LiveProvider>
      </body>
    </html>
  );
}
