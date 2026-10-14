"use client";

/**
 * NEMO Sports · locale context for client components
 * ─────────────────────────────────────────────────────────────────────────────
 * The active locale comes from the URL: `app/(ar)/layout.tsx` provides "ar" and
 * `app/(en)/layout.tsx` provides "en". Because the provider is a client
 * component wrapping server-rendered children, every client component inside
 * the tree can read it — and because the value is baked into the prerendered
 * HTML of its own tree, server and client always agree (no hydration drift,
 * no cookie read during render).
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { DEFAULT_LOCALE, type Locale } from "./locales";
import { t, type TranslateVars, type Translator } from "./translate";

type LocaleValue = { locale: Locale; dir: "rtl" | "ltr"; tr: Translator };

const FALLBACK: LocaleValue = {
  locale: DEFAULT_LOCALE,
  dir: "rtl",
  tr: (key: string, vars?: TranslateVars) => t(DEFAULT_LOCALE, key, vars),
};

const LocaleContext = createContext<LocaleValue>(FALLBACK);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const value = useMemo<LocaleValue>(
    () => ({
      locale,
      dir: locale === "ar" ? "rtl" : "ltr",
      tr: (key: string, vars?: TranslateVars) => t(locale, key, vars),
    }),
    [locale],
  );
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** "ar" | "en" for the tree currently rendering. */
export function useLocale(): Locale {
  return useContext(LocaleContext).locale;
}

/** "rtl" | "ltr" for the tree currently rendering. */
export function useDir(): "rtl" | "ltr" {
  return useContext(LocaleContext).dir;
}

/** Bound translator for client components. */
export function useT(): Translator {
  return useContext(LocaleContext).tr;
}
