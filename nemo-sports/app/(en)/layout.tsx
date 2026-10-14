import type { Metadata, Viewport } from "next";
import "@/app/globals.css";
import { RootShell } from "@/components/layout/RootShell";
import { getSiteSettingsCached } from "@/lib/site-settings";
import { rootMetadata } from "@/lib/i18n/root-metadata";

/**
 * English root layout — the `/en` tree.
 *
 * A separate root layout (rather than a header/cookie switch) is what lets the
 * English pages prerender: `<html lang>`/`dir` are hardcoded here, so nothing
 * in this tree needs a request-scoped API. Arabic keeps its own root layout
 * and its existing static/ISR behaviour is untouched.
 */
export async function generateMetadata(): Promise<Metadata> {
  return rootMetadata("en");
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0F1B2E" },
    { media: "(prefers-color-scheme: dark)", color: "#050B15" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default async function EnglishRootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettingsCached();
  return (
    <RootShell locale="en" settings={settings}>
      {children}
    </RootShell>
  );
}
