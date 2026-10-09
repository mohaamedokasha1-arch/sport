/**
 * NEMO Sports · curated Arabic aliases for search.
 * ───────────────────────────────────────────────
 * Provider data (SportScore, Football-Data.org) carries English names only.
 * Searching in Arabic (e.g. «هالاند») must still find those entities, so this
 * dictionary maps the normalized English display name to commonly used Arabic
 * spellings.
 *
 * Rules:
 *  - Only well-established, widely used spellings are listed. Nothing is
 *    generated automatically, and no name is invented for a player or club
 *    whose Arabic form is not established.
 *  - Keys are matched after `normalizeSearchText`, so case, diacritics and
 *    punctuation do not matter.
 *  - Extend this file by adding entries; each entry is searchable on its own.
 */

import { normalizeSearchText } from "./search-text";

const ALIASES: Record<string, string[]> = {
  // Players
  "Erling Haaland": ["هالاند", "إرلينغ هالاند", "ايرلينج هالاند"],
  "Mohamed Salah": ["صلاح", "محمد صلاح"],
  "Kylian Mbappé": ["مبابي", "كيليان مبابي"],
  "Lamine Yamal": ["يامال", "لامين يامال"],
  "Jude Bellingham": ["بيلينغهام", "جود بيلينغهام"],
  "Harry Kane": ["كين", "هاري كين"],
  "Lionel Messi": ["ميسي", "ليونيل ميسي"],
  "Cristiano Ronaldo": ["رونالدو", "كريستيانو رونالدو"],
  "Neymar": ["نيمار"],
  "Martin Odegaard": ["أوديغارد", "مارتن أوديغارد"],
  "Martin Ødegaard": ["أوديغارد", "مارتن أوديغارد"],

  // Clubs
  "Manchester City": ["مانشستر سيتي"],
  "Manchester United": ["مانشستر يونايتد"],
  "Liverpool": ["ليفربول"],
  "Arsenal": ["آرسنال"],
  "Chelsea": ["تشيلسي"],
  "Tottenham Hotspur": ["توتنهام"],
  "Real Madrid": ["ريال مدريد"],
  "FC Barcelona": ["برشلونة", "برشلونه"],
  "Atletico Madrid": ["أتلتيكو مدريد"],
  "FC Bayern Munich": ["بايرن ميونخ", "بايرن ميونيخ"],
  "Borussia Dortmund": ["بوروسيا دورتموند"],
  "Juventus": ["يوفنتوس"],
  "Inter Milan": ["إنتر ميلان", "انتر ميلان"],
  "AC Milan": ["ميلان"],
  "Paris Saint-Germain": ["باريس سان جيرمان"],
  "Al Ahly": ["الأهلي", "الاهلي"],
  "Zamalek": ["الزمالك"],
  "Al Nassr": ["النصر"],
  "Al Hilal": ["الهلال"],
};

const INDEX = new Map<string, string[]>();
for (const [english, arabic] of Object.entries(ALIASES)) {
  INDEX.set(normalizeSearchText(english), arabic);
}

/** Arabic search terms for an English display name (empty when none curated). */
export function arabicAliasesFor(name: string | null | undefined): string[] {
  if (!name) return [];
  return INDEX.get(normalizeSearchText(name)) ?? [];
}
