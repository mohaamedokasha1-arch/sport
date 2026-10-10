import { FOOTBALL_DATA_COMPETITIONS } from "@/packages/sdl/src";
import { matchesSearchText, normalizeSearchText } from "@/lib/search-text";

// NOTE: the catalogue reads the competition list straight from the Sports
// Data Layer package — NOT from lib/football-data. lib/football-data is the
// service layer OVER lib/sdl-gateway, and this catalogue is imported BY the
// gateway; importing the service here would create a module cycle
// (sdl-gateway → competition-catalog → football-data → sdl-gateway) whose
// evaluation order crashes the server with an uninitialized export.

export type CanonicalCompetition = {
  code: string;
  /** Identifier the keyless SportScore provider understands (null when it has none). */
  slug: string | null;
  name: string;
  nameAr: string;
  countryAr: string;
  featured: boolean;
  /** Stable public path retained for existing NEMO URLs. */
  canonicalSlug: string;
  /** Identifier accepted by the SDL's SportScore and Football-Data adapters. */
  providerId: string;
};

const SLUG_BY_CODE: Record<string, string> = {
  PL: "premier-league",
  PD: "la-liga",
  SA: "serie-a",
  BL1: "bundesliga",
  FL1: "ligue-1",
  CL: "champions-league",
  SPL: "saudi-pro-league",
};

/**
 * Competitions served by SportScore (keyless) beyond the Football-Data free tier.
 * Each `slug` was confirmed against the live SportScore standings endpoint on
 * 2026-10-09 (not inferred from names). `canonicalSlug` keeps any public path
 * that already exists (e.g. /competitions/egyptian-league, /competitions/caf-champions-league).
 * Football-Data's free tier does not cover these, so no Football-Data code is set
 * (Brazilian Serie A is the exception: it is already a Football-Data free-tier code).
 */
const EXTRA_COMPETITIONS: CanonicalCompetition[] = [
  {
    code: "SPL",
    slug: "saudi-professional-league",
    name: "Saudi Pro League",
    nameAr: "دوري روشن السعودي",
    countryAr: "السعودية",
    featured: true,
    canonicalSlug: "saudi-pro-league",
    // Verified: "saudi-pro-league" returns "Competition not found" on SportScore.
    providerId: "saudi-professional-league",
  },
  {
    code: "EGY",
    slug: "egyptian-premier-league",
    name: "Egyptian Premier League",
    nameAr: "الدوري المصري الممتاز",
    countryAr: "مصر",
    featured: false,
    canonicalSlug: "egyptian-league",
    providerId: "egyptian-premier-league",
  },
  {
    code: "CAF",
    slug: "caf-champions-league",
    name: "CAF Champions League",
    nameAr: "دوري أبطال أفريقيا",
    countryAr: "أفريقيا",
    featured: false,
    canonicalSlug: "caf-champions-league",
    providerId: "caf-champions-league",
  },
  {
    code: "CAFC",
    slug: "caf-confederation-cup",
    name: "CAF Confederation Cup",
    nameAr: "كأس الكونفدرالية الأفريقية",
    countryAr: "أفريقيا",
    featured: false,
    canonicalSlug: "caf-confederation-cup",
    providerId: "caf-confederation-cup",
  },
  {
    code: "UEL",
    slug: "uefa-europa-league",
    name: "UEFA Europa League",
    nameAr: "الدوري الأوروبي",
    countryAr: "أوروبا",
    featured: false,
    canonicalSlug: "uefa-europa-league",
    providerId: "uefa-europa-league",
  },
  {
    code: "CCL",
    slug: "concacaf-league-champions-cup",
    name: "CONCACAF League Champions Cup",
    nameAr: "دوري أبطال كونكاكاف",
    countryAr: "أمريكا الشمالية والوسطى",
    featured: false,
    canonicalSlug: "concacaf-league-champions-cup",
    providerId: "concacaf-league-champions-cup",
  },
  {
    code: "USL",
    slug: "usl-championship",
    name: "USL Championship",
    nameAr: "دوري USL Championship",
    countryAr: "الولايات المتحدة",
    featured: false,
    canonicalSlug: "usl-championship",
    providerId: "usl-championship",
  },
  {
    code: "J1",
    slug: "japanese-j1-league",
    name: "Japanese J1 League",
    nameAr: "الدوري الياباني J1",
    countryAr: "اليابان",
    featured: false,
    canonicalSlug: "japanese-j1-league",
    providerId: "japanese-j1-league",
  },
  {
    // Already a Football-Data free-tier code (BSA); this adds the catalogue page.
    code: "BSA",
    slug: "brazilian-serie-a",
    name: "Brazilian Serie A",
    nameAr: "الدوري البرازيلي",
    countryAr: "البرازيل",
    featured: false,
    canonicalSlug: "brazilian-serie-a",
    providerId: "brazilian-serie-a",
  },
];

/** One canonical catalogue for the football competitions currently covered. */
export const canonicalCompetitions: CanonicalCompetition[] = [
  ...FOOTBALL_DATA_COMPETITIONS.filter((competition) => competition.featured).map((competition) => ({
    // Same mapping lib/football-data.footballDataCompetitions() applies:
    // `slug` is the identifier the keyless SportScore provider understands, so
    // one string drives either provider and the chain can fall through.
    code: competition.code,
    slug: competition.sportscoreSlug,
    name: competition.name,
    nameAr: competition.nameAr,
    countryAr: competition.countryAr,
    featured: competition.featured,
    canonicalSlug: SLUG_BY_CODE[competition.code] ?? competition.code.toLowerCase(),
    providerId: competition.sportscoreSlug ?? competition.code,
  })),
  ...EXTRA_COMPETITIONS,
];

export function competitionByPath(path: string): CanonicalCompetition | undefined {
  const value = decodeURIComponent(path).trim();
  const normalized = normalizeSearchText(value).replace(/\s+/g, "-");
  return canonicalCompetitions.find((competition) => {
    const aliases = [
      competition.canonicalSlug,
      competition.code,
      competition.slug,
      competition.name,
      competition.nameAr,
      competition.countryAr,
    ].filter(Boolean) as string[];
    return aliases.some((alias) => normalizeSearchText(alias).replace(/\s+/g, "-") === normalized);
  });
}

export function competitionPathForProviderId(providerId: string): string | null {
  const id = normalizeSearchText(providerId);
  const match = canonicalCompetitions.find((competition) =>
    [competition.code, competition.slug, competition.providerId, competition.name, competition.nameAr]
      .filter(Boolean)
      .some((alias) => normalizeSearchText(alias as string) === id),
  );
  return match ? `/competitions/${match.canonicalSlug}` : null;
}

export function fixtureBelongsToCompetition(
  fixture: { competitionProviderId?: string | null; competitionName?: string | null },
  competition: CanonicalCompetition | string,
): boolean {
  const ref = typeof competition === "string" ? competitionByPath(competition) : competition;
  const values = [fixture.competitionProviderId, fixture.competitionName].filter(Boolean) as string[];
  if (ref) {
    return values.some((value) => {
      const normalized = normalizeSearchText(value);
      return [ref.code, ref.slug, ref.providerId, ref.name, ref.nameAr, ref.canonicalSlug]
        .filter(Boolean)
        .some((alias) => {
          const needle = normalizeSearchText(alias as string);
          return normalized === needle || (needle.length > 3 && normalized.includes(needle)) || (normalized.length > 3 && needle.includes(normalized));
        });
    });
  }
  return values.some((value) => matchesSearchText(competition as string, value));
}
