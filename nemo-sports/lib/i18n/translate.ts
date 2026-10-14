/**
 * NEMO Sports · message lookup
 * ─────────────────────────────────────────────────────────────────────────────
 * A deliberately tiny lookup: no dependency, no async loading, no runtime
 * bundle cost beyond the two dictionaries themselves. Both dictionaries are
 * plain objects compiled into the app; `en.ts` is typed as
 * `Record<keyof typeof ar, string>`, so a missing English string is a
 * *compile* error rather than a raw key showing up on a live page.
 *
 * Missing keys still degrade safely at runtime (Arabic first, then the key
 * itself) because admin-authored content and future keys must never throw.
 */

import ar from "./messages/ar";
import en from "./messages/en";
import { DEFAULT_LOCALE, type Locale } from "./locales";

export type Messages = typeof ar;
export type MessageKey = keyof Messages;

const DICTIONARIES: Record<Locale, Record<string, string>> = { ar, en };

export type TranslateVars = Record<string, string | number>;

function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  let out = template;
  for (const [name, value] of Object.entries(vars)) {
    out = out.split(`{${name}}`).join(String(value));
  }
  return out;
}

/**
 * Translate `key` for `locale`.
 *
 * Fallback chain: requested locale → Arabic (the source language) → the key
 * itself. Never `undefined`, never a throw.
 */
export function t(locale: Locale, key: MessageKey | string, vars?: TranslateVars): string {
  const dictionary = DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE]!;
  const value = dictionary[key] ?? DICTIONARIES[DEFAULT_LOCALE]![key];
  if (value === undefined) return interpolate(String(key), vars);
  return interpolate(value, vars);
}

export type Translator = (key: MessageKey | string, vars?: TranslateVars) => string;

/** Bound translator — `const tr = translator(locale); tr("nav.home")`. */
export function translator(locale: Locale): Translator {
  return (key, vars) => t(locale, key, vars);
}

/** Every key in the catalogue (used by the coverage test). */
export const MESSAGE_KEYS: readonly string[] = Object.keys(ar);
