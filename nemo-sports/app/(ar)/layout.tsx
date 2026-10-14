import type { Metadata, Viewport } from "next";
import "@/app/globals.css";
import { RootShell } from "@/components/layout/RootShell";
import { getSiteSettingsCached } from "@/lib/site-settings";
import { rootMetadata } from "@/lib/i18n/root-metadata";

/**
 * Arabic root layout — the site's original, unprefixed language.
 *
 * Every URL this group serves is byte-for-byte what the production site
 * already serves (`/`, `/matches`, `/matches/{slug}` …). Moving the routes into
 * the `(ar)` route group does not change a single URL: route groups add no path
 * segment. The build route table is asserted identical in
 * `scripts/verify-i18n.test.ts`.
 */
export async function generateMetadata(): Promise<Metadata> {
  return rootMetadata("ar");
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0F1B2E" },
    { media: "(prefers-color-scheme: dark)", color: "#050B15" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function ArabicRootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettingsCached();
  return (
    <RootShell locale="ar" settings={settings}>
      {children}
    </RootShell>
  );
}
