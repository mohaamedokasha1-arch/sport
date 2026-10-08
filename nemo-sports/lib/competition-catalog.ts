import { footballDataCompetitions, type FootballDataCompetitionRef } from "@/lib/football-data";
import { matchesSearchText, normalizeSearchText } from "@/lib/search-text";

export type CanonicalCompetition = FootballDataCompetitionRef & {
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
};

/** One canonical catalogue for the football competitions currently covered. */
export const canonicalCompetitions: CanonicalCompetition[] = footballDataCompetitions(true).map((competition) => ({
  ...competition,
  canonicalSlug: SLUG_BY_CODE[competition.code] ?? competition.code.toLowerCase(),
  providerId: competition.slug ?? competition.code,
}));

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
