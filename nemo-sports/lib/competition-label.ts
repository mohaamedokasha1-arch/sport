/**
 * NEMO Sports · competition label for a fixture (server surfaces only)
 * ────────────────────────────────────────────────────────────────────────
 * The canonical catalogue (lib/competition-catalog.ts) carries both names of
 * every competition it lists, so it is the best answer for "what is this
 * competition called in the reader's language".
 *
 * It must stay out of the client bundle: importing the catalogue pulls the
 * Sports Data Layer — and the provider hostnames inside it — into every chunk
 * that imports it, which scripts/smoke.mjs forbids. Client components use
 * `competitionLabelFromRecord` (lib/i18n/names.ts), which reads the fixture's
 * own fields; editorial records therefore carry `competitionNameEn` so their
 * English pages never fall back to Arabic chrome.
 */

import { competitionByPath } from "@/lib/competition-catalog";
import { competitionLabelFromRecord } from "@/lib/i18n/names";
import type { Locale } from "@/lib/i18n/locales";

/**
 * Locale-aware display name for any competition reference that carries both
 * names (catalogue entries, admin records, provider refs). Each side falls
 * back to the other before falling back to `fallback`, so a page never renders
 * an empty heading — and an English page never renders an Arabic-only name
 * when the reference actually carries an English one.
 */
export function competitionDisplayName(
  locale: Locale,
  ref: { name?: string | null; nameAr?: string | null; nameEn?: string | null } | null | undefined,
  fallback = "",
): string {
  if (!ref) return fallback;
  const ar = (ref.nameAr ?? "").trim();
  const en = (ref.nameEn ?? ref.name ?? "").trim();
  if (locale === "ar") return ar || en || fallback;
  return en || ar || fallback;
}

export function fixtureCompetitionLabel(
  locale: Locale,
  fixture: {
    competitionProviderId?: string | null;
    competitionName?: string | null;
    competitionNameEn?: string | null;
  },
  fallback = "",
): string {
  const ref = competitionByPath(fixture.competitionProviderId || fixture.competitionName || "");
  if (ref) return locale === "ar" ? ref.nameAr : ref.name;
  return competitionLabelFromRecord(locale, fixture, fallback);
}
