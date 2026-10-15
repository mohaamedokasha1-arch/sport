/**
 * NEMO Sports · locale-aware entity names
 * ─────────────────────────────────────────────────────────────────────────────
 * Display names only. Slugs, provider IDs, enum values and API payloads are
 * never translated — they are the identifiers that keep a match, team or
 * competition the same entity in both languages.
 *
 * Fallback rule: if a record carries no name for the requested language we show
 * the name it does have. A missing English alias must never make an entity
 * disappear or render blank, and we never invent an official translation.
 */

import { sports, type Sport } from "@/lib/core-data";
import type { Locale } from "./locales";
import { t } from "./translate";

/** Anything with the two display-name fields the site's records use. */
export type Named = {
  name?: string | null;
  nameAr?: string | null;
  nameEn?: string | null;
};

const SPORT_BY_SLUG = new Map(sports.map((sport) => [sport.slug, sport]));

/** English display name for a sport slug (data only carries `name`/`nameEn`). */
export function sportName(locale: Locale, slugOrSport: string | Sport | null | undefined): string {
  const slug = typeof slugOrSport === "string" ? slugOrSport : slugOrSport?.slug;
  const sport = typeof slugOrSport === "object" && slugOrSport ? slugOrSport : slug ? SPORT_BY_SLUG.get(slug) : undefined;
  if (!sport) return String(slug ?? "");
  return locale === "ar" ? sport.name : sport.nameEn || sport.name;
}

/**
 * Competition label built from the fixture's OWN fields — safe for every
 * consumer, including client components.
 *
 * It deliberately does not consult the canonical catalogue: the catalogue pulls
 * the Sports Data Layer (and with it the provider hostnames) into any bundle
 * that imports it, and the shipped client bundle must never carry one
 * (scripts/smoke.mjs asserts exactly that). Server surfaces that may load the
 * catalogue use `fixtureCompetitionLabel` in lib/competition-label.ts instead.
 */
export function competitionLabelFromRecord(
  locale: Locale,
  fixture: {
    competitionName?: string | null;
    competitionNameEn?: string | null;
  },
  fallback = "",
): string {
  const canonical = fixture.competitionName ?? fallback;
  if (locale === "en" && fixture.competitionNameEn && fixture.competitionNameEn !== canonical) return fixture.competitionNameEn;
  return canonical;
}

/**
 * Team label for one side of a fixture, in the reader's language.
 *
 * Provider fixtures carry a single name (whatever the provider sends), so it is
 * used for both locales. Editorial fixtures carry the desk's Arabic name plus
 * an English one — an English reader gets `homeNameEn`, while every lookup
 * (streams, aliases, links, overrides) keeps using the canonical Arabic name.
 * A name absent in the requested language falls back to the one that exists,
 * never to an invented translation.
 */
export function fixtureTeamName(
  locale: Locale,
  fixture: {
    homeName?: string | null;
    homeNameEn?: string | null;
    homeProviderId?: string | null;
    awayName?: string | null;
    awayNameEn?: string | null;
    awayProviderId?: string | null;
  },
  side: "home" | "away",
  fallback = "—",
): string {
  const canonical = (side === "home" ? fixture.homeName : fixture.awayName) ?? (side === "home" ? fixture.homeProviderId : fixture.awayProviderId) ?? fallback;
  const latin = side === "home" ? fixture.homeNameEn : fixture.awayNameEn;
  if (locale === "en" && latin && latin !== canonical) return latin;
  return canonical;
}

/**
 * Best available display name for a team, competition, league or player record.
 *
 * Provider records usually carry only `name` (English); admin-curated records
 * carry `nameAr` too. Arabic prefers `nameAr`, English prefers `nameEn` then
 * `name`.
 */
export function entityName(locale: Locale, record: Named | null | undefined): string {
  if (!record) return "";
  const { name, nameAr, nameEn } = record;
  if (locale === "ar") return nameAr || name || nameEn || "";
  return nameEn || name || nameAr || "";
}

/** Scoring unit ("هدف" / "goal") — the data only carries the Arabic form. */
const SCORE_UNIT_EN: Record<string, string> = {
  football: "goal",
  basketball: "point",
  tennis: "game",
  handball: "goal",
  volleyball: "set",
  baseball: "run",
  hockey: "goal",
  boxing: "round",
  cricket: "run",
};

const PERIOD_LABEL_EN: Record<string, string> = {
  football: "minute",
  basketball: "quarter",
  tennis: "set",
  handball: "half",
  volleyball: "set",
  baseball: "inning",
  hockey: "period",
  boxing: "round",
  cricket: "over",
};

export function scoreUnit(locale: Locale, slug: string | null | undefined): string {
  const sport = slug ? SPORT_BY_SLUG.get(slug) : undefined;
  if (locale === "ar") return sport?.scoreUnit ?? "";
  return (slug && SCORE_UNIT_EN[slug]) || sport?.scoreUnit || "";
}

export function periodLabel(locale: Locale, slug: string | null | undefined): string {
  const sport = slug ? SPORT_BY_SLUG.get(slug) : undefined;
  if (locale === "ar") return sport?.periodLabel ?? "";
  return (slug && PERIOD_LABEL_EN[slug]) || sport?.periodLabel || "";
}

/** "كل الرياضات" / "All sports", or the sport names joined for the locale. */
export function scopeLabel(locale: Locale, slugs: string[], allCount: number): string {
  if (slugs.length === 1) return sportName(locale, slugs[0]);
  if (slugs.length === allCount) return t(locale, "matches.allSports");
  return slugs.map((slug) => sportName(locale, slug)).join(locale === "ar" ? "، " : ", ");
}

/**
 * Country / region labels.
 *
 * Provider and catalogue records carry a single Arabic country string, and that
 * string is a data value (it is also used for filtering), so it keeps its
 * Arabic identity and only the rendered label changes. Unknown values fall back
 * to what the record actually says rather than to a guess.
 */
const COUNTRY_EN: Record<string, string> = {
  "مصر": "Egypt",
  "إنجلترا": "England",
  "إسبانيا": "Spain",
  "ألمانيا": "Germany",
  "إيطاليا": "Italy",
  "فرنسا": "France",
  "السعودية": "Saudi Arabia",
  "الولايات المتحدة": "United States",
  "أوروبا": "Europe",
  "أفريقيا": "Africa",
  "أمريكا الشمالية": "North America",
  "دولية": "International",
};

export function countryName(locale: Locale, value: string | null | undefined): string {
  if (!value) return "";
  if (locale === "ar") return value;
  return COUNTRY_EN[value] ?? value;
}
