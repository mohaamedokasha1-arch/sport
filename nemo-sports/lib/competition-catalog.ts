import { FOOTBALL_DATA_COMPETITIONS } from "@/packages/sdl/src";
import { normalizeSearchText } from "@/lib/search-text";

export type CanonicalCompetition = {
  code: string;
  /** Identifier the keyless SportScore provider understands (null when it has none). */
  slug: string | null;
  /** English competition name. */
  name: string;
  nameAr: string;
  /** English country / region name. */
  country: string;
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
    country: "Saudi Arabia",
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
    country: "Egypt",
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
    country: "Africa",
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
    country: "Africa",
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
    country: "Europe",
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
    country: "North & Central America",
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
    country: "United States",
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
    country: "Japan",
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
    country: "Brazil",
    countryAr: "البرازيل",
    featured: false,
    canonicalSlug: "brazilian-serie-a",
    providerId: "brazilian-serie-a",
  },
];

/** One canonical catalogue for the football competitions currently covered. */
export const canonicalCompetitions: CanonicalCompetition[] = [
  ...FOOTBALL_DATA_COMPETITIONS.filter((competition) => competition.featured).map((competition) => ({
    code: competition.code,
    slug: competition.sportscoreSlug,
    name: competition.name,
    nameAr: competition.nameAr,
    country: competition.country,
    countryAr: competition.countryAr,
    featured: competition.featured,
    canonicalSlug: SLUG_BY_CODE[competition.code] ?? competition.code.toLowerCase(),
    providerId: competition.sportscoreSlug ?? competition.code,
  })),
  ...EXTRA_COMPETITIONS,
];

/** Public path of the site's highest-priority competition. */
export const EGYPT_CANONICAL_SLUG = "egyptian-league";

/**
 * The catalogue in public display order: the Egyptian Premier League leads
 * (site priority), then the featured majors, then everything else — each group
 * keeping its existing catalogue order (Array#sort is stable, and no entry is
 * added or removed, so every existing URL and label is untouched).
 */
export const canonicalCompetitionsByPriority: CanonicalCompetition[] = (() => {
  const rank = (c: CanonicalCompetition): number =>
    c.canonicalSlug === EGYPT_CANONICAL_SLUG ? 0 : c.featured ? 1 : 2;
  return [...canonicalCompetitions].sort((a, b) => rank(a) - rank(b));
})();

export function competitionByPath(path: string): CanonicalCompetition | undefined {
  let value: string;
  try {
    value = decodeURIComponent(path).trim();
  } catch {
    // Query-string values may contain a literal or malformed percent escape.
    // Treat those as unknown identifiers instead of crashing the route.
    return undefined;
  }
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
  const aliases = ref
    ? [ref.code, ref.slug, ref.providerId, ref.name, ref.nameAr, ref.canonicalSlug]
    : [competition as string];
  const exactAliases = new Set(aliases.filter(Boolean).map((alias) => normalizeSearchText(alias as string)));

  // Provider IDs and known names are aliases in the set above; matching them
  // exactly avoids e.g. "Premier League" also selecting the Hong Kong and
  // Bermuda competitions. Partial search belongs in the team field, not here.
  return values.some((value) => exactAliases.has(normalizeSearchText(value)));
}
