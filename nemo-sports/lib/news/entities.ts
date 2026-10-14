/**
 * NEMO Sports · entity matching (teams, players, competitions)
 * ───────────────────────────────────────────────────────────
 * Fuzzy name matching over title+description. Only links when confidence >
 * 75%. Entity ids are the platform's canonical slugs (lib/core-data.ts)
 * so matched articles cross-link to real team/player/competition pages.
 */

import type { NewsEntityRef } from "./types";
import { normalizeSearchText } from "@/lib/search-text";
import { withoutNonSportEntities } from "./relevance";

interface EntityDef {
  internalId: string;
  displayName: string;
  /** English label for the /en tree. `names` already carries the Latin forms a
   *  matcher needs; this is only what the reader is shown. */
  displayNameEn?: string;
  names: string[];
}

const TEAMS: EntityDef[] = [
  // "ahli" alone is Saudi Al-Ahli (Jeddah), a different club — not an alias.
  { internalId: "al-ahly", displayName: "الأهلي", names: ["al ahly", "الأهلي", "al-ahly", "ahly", "al ahly sc"] },
  { internalId: "zamalek", displayName: "الزمالك", names: ["zamalek", "الزمالك", "zamalek sc"] },
  { internalId: "pyramids", displayName: "بيراميدز", names: ["pyramids fc", "pyramids", "بيراميدز"] },
  // Bare «المصري» means "the Egyptian" («النادي الأهلي المصري», «الدوري المصري») —
  // production tagged Al Masry on Al Ahly stories. Only unambiguous forms.
  { internalId: "al-masry", displayName: "المصري", names: ["al masry", "al-masry", "المصري البورسعيدي", "النادي المصري"] },
  { internalId: "ismaily", displayName: "الإسماعيلي", names: ["ismaily", "ismaili", "الإسماعيلي", "ismaily sc"] },
  { internalId: "pharco", displayName: "فاركو", names: ["pharco", "pharco fc", "فاركو"] },
  { internalId: "ceramica", displayName: "سيراميكا", names: ["ceramica", "ceramica cleopatra", "سيراميكا"] },
  { internalId: "manchester-city", displayName: "مانشستر سيتي", names: ["manchester city", "man city", "مانشستر سيتي"] },
  { internalId: "arsenal", displayName: "آرسنال", names: ["arsenal", "آرسنال"] },
  { internalId: "liverpool", displayName: "ليفربول", names: ["liverpool", "ليفربول"] },
  { internalId: "manchester-united", displayName: "مانشستر يونايتد", names: ["manchester united", "man united", "man utd", "مانشستر يونايتد"] },
  { internalId: "chelsea", displayName: "تشيلسي", names: ["chelsea", "تشيلسي"] },
  { internalId: "tottenham", displayName: "توتنهام", names: ["tottenham", "توتنهام"] },
  { internalId: "real-madrid", displayName: "ريال مدريد", names: ["real madrid", "ريال مدريد"] },
  { internalId: "barcelona", displayName: "برشلونة", names: ["barcelona", "barça", "barca", "برشلونة"] },
  { internalId: "atletico-madrid", displayName: "أتلتيكو مدريد", names: ["atletico madrid", "atlético", "أتلتيكو مدريد"] },
  // bare "inter" also names Inter Miami and fired inside "international"
  { internalId: "inter-milan", displayName: "إنتر ميلان", names: ["inter milan", "internazionale", "إنتر ميلان"] },
  { internalId: "ac-milan", displayName: "ميلان", names: ["ac milan", "ميلان"] },
  { internalId: "juventus", displayName: "يوفنتوس", names: ["juventus", "juve", "يوفنتوس"] },
  { internalId: "bayern-munich", displayName: "بايرن ميونخ", names: ["bayern", "bayern munich", "بايرن"] },
  // bare «باريس» is the city
  { internalId: "psg", displayName: "باريس سان جيرمان", names: ["psg", "paris saint-germain", "paris sg", "باريس سان جيرمان"] },
];

const PLAYERS: EntityDef[] = [
  { internalId: "mohamed-salah", displayName: "محمد صلاح", names: ["mohamed salah", "محمد صلاح", "mo salah", "m. salah"] },
  { internalId: "erling-haaland", displayName: "هالاند", names: ["erling haaland", "haaland", "هالاند"] },
  { internalId: "kylian-mbappe", displayName: "مبابي", names: ["kylian mbappe", "mbappe", "mbappé", "مبابي"] },
  { internalId: "vinicius-junior", displayName: "فينيسيوس", names: ["vinicius", "vinícius", "فينيسيوس"] },
  { internalId: "lamine-yamal", displayName: "لامين يامال", names: ["lamine yamal", "yamal", "يامال"] },
  { internalId: "bukayo-saka", displayName: "ساكا", names: ["bukayo saka", "saka", "ساكا"] },
  { internalId: "cole-palmer", displayName: "بالمر", names: ["cole palmer", "كول بالمر"] },
  { internalId: "harry-kane", displayName: "هاري كين", names: ["harry kane", "kane", "هاري كين"] },
  { internalId: "imam-ashour", displayName: "إمام عاشور", names: ["emam ashour", "imam ashour", "إمام عاشور"] },
  { internalId: "nasser-maher", displayName: "ناصر ماهر", names: ["nasser maher", "ناصر ماهر"] },
];

const COMPETITIONS: EntityDef[] = [
  { internalId: "egyptian-league", displayName: "الدوري المصري", displayNameEn: "Egyptian Premier League", names: ["egyptian premier league", "egyptian league", "الدوري المصري"] },
  { internalId: "caf-champions-league", displayName: "دوري أبطال أفريقيا", displayNameEn: "CAF Champions League", names: ["caf champions league", "african champions league", "دوري أبطال أفريقيا"] },
  { internalId: "premier-league", displayName: "الدوري الإنجليزي", displayNameEn: "Premier League", names: ["premier league", "epl", "الدوري الإنجليزي"] },
  { internalId: "champions-league", displayName: "دوري أبطال أوروبا", displayNameEn: "UEFA Champions League", names: ["champions league", "uefa champions", "دوري أبطال أوروبا"] },
  { internalId: "la-liga", displayName: "الدوري الإسباني", displayNameEn: "La Liga", names: ["la liga", "laliga", "الدوري الإسباني"] },
  { internalId: "serie-a", displayName: "الدوري الإيطالي", displayNameEn: "Serie A", names: ["serie a", "الدوري الإيطالي"] },
  { internalId: "nba", displayName: "دوري السلة الأمريكي", displayNameEn: "NBA", names: ["nba", "national basketball"] },
];

const patternCache = new Map<string, RegExp>();
/**
 * Whole-word pattern on normalized text. The old `includes()` matched inside
 * words: "inter" in "international", "saka" in "Osaka", "epl" in "replay".
 * Arabic names may carry an attached particle in front (و/ب/ل/ف/ال…).
 */
function namePattern(name: string): RegExp | null {
  const needle = normalizeSearchText(name);
  if (!needle) return null;
  let re = patternCache.get(needle);
  if (!re) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = /[a-z]/.test(needle)
      ? new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u")
      : new RegExp(`(?<!\\p{L})(?:و|ب|ل|ف|وب|ول|فال|وال|بال|لل)?${escaped}(?!\\p{L})`, "u");
    patternCache.set(needle, re);
  }
  return re;
}

function matchList(
  list: EntityDef[],
  type: NewsEntityRef["type"],
  titleText: string,
  descText: string,
): NewsEntityRef[] {
  const out: NewsEntityRef[] = [];
  for (const entity of list) {
    for (const name of entity.names) {
      const re = namePattern(name);
      if (!re) continue;
      const inTitle = re.test(titleText);
      const inDesc = re.test(descText);
      if (!inTitle && !inDesc) continue;
      // Confidence: title hit + multi-word exact = highest; single-word
      // short names in description only = lowest (avoid false positives).
      let confidence = inTitle ? 85 : 70;
      if (name.trim().includes(" ") || /[\u0600-\u06FF]/.test(name)) confidence += 8;
      if (inTitle && inDesc) confidence += 5;
      if (name.length <= 4 && !inTitle) confidence -= 15;
      confidence = Math.min(99, confidence);
      if (confidence > 75) {
        out.push({
          type,
          internalId: entity.internalId,
          displayName: entity.displayName,
          extractedName: name,
          confidence,
          foundIn: inTitle && inDesc ? "both" : inTitle ? "title" : "description",
        });
      }
      break; // one hit per entity
    }
  }
  return out;
}

export function matchEntities(title: string, description: string): NewsEntityRef[] {
  // Namesake companies ("Al Ahly Sabbour", "Al Ahly Bank") are not the club.
  const t = withoutNonSportEntities(title);
  const d = withoutNonSportEntities(description);
  return [
    ...matchList(TEAMS, "team", t, d),
    ...matchList(PLAYERS, "player", t, d),
    ...matchList(COMPETITIONS, "competition", t, d),
  ].slice(0, 8);
}

export function newsCompetitions(): { id: string; name: string; nameEn: string }[] {
  // nameEn falls back to the Arabic label rather than blanking an entry: a
  // competition must never disappear from the list because it lacks a
  // translation.
  return COMPETITIONS.map((c) => ({ id: c.internalId, name: c.displayName, nameEn: c.displayNameEn ?? c.displayName }));
}
