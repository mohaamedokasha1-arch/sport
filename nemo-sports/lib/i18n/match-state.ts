/**
 * NEMO Sports · locale-aware match-state labels
 * ─────────────────────────────────────────────────────────────────────────────
 * `lib/match-state.ts` owns the RULE for what state a match is in; this module
 * only spells that state for the reader. Keeping them apart means the rule (and
 * its consistency tests) stay untouched by internationalisation.
 */

import { t } from "./translate";
import type { Locale } from "./locales";

/** The states `matchStateOf()` can return. */
export type MatchStateKey =
  | "live"
  | "upcoming"
  | "finished"
  | "postponed"
  | "cancelled"
  | "suspended"
  | "abandoned"
  | "unconfirmed";

export function matchStateLabel(locale: Locale, state: string): string {
  return t(locale, `state.${state}`);
}

/**
 * Why a match is neither upcoming nor finished. Mirrors
 * `unconfirmedNoteAr()` in lib/match-state.ts — same rule, translated.
 */
export function unconfirmedNote(locale: Locale, status: string | null | undefined): string {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "unverified"
    ? t(locale, "state.unverifiedNote")
    : t(locale, "state.unconfirmedNote");
}
