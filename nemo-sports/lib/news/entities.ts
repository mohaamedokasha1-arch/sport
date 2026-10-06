/**
 * NEMO Sports · entity matching (teams, players, competitions)
 * ───────────────────────────────────────────────────────────
 * Fuzzy name matching over title+description. Only links when confidence >
 * 75%. Entity ids are the platform's canonical slugs (lib/core-data.ts)
 * so matched articles cross-link to real team/player/competition pages.
 */

import type { NewsEntityRef } from "./types";

interface EntityDef {
  internalId: string;
  displayName: string;
  names: string[];
}

const TEAMS: EntityDef[] = [
  { internalId: "al-ahly", displayName: "الأهلي", names: ["al ahly", "الأهلي", "al-ahly", "ahly", "ahli", "al ahly sc"] },
  { internalId: "zamalek", displayName: "الزمالك", names: ["zamalek", "الزمالك", "zamalek sc"] },
  { internalId: "pyramids", displayName: "بيراميدز", names: ["pyramids fc", "pyramids", "بيراميدز"] },
  { internalId: "al-masry", displayName: "المصري", names: ["al masry", "al-masry", "المصري"] },
  { internalId: "ismaily", displayName: "الإسماعيلي", names: ["ismaily", "ismaili", "الإسماعيلي", "ismaily sc"] },
  { internalId: "pharco", displayName: "فاركو", names: ["pharco", "pharco fc", "فاركو"] },
  { internalId: "ceramica", displayName: "سيراميكا", names: ["ceramica", "ceramica cleopatra", "سيراميكا"] },
  { internalId: "manchester-city", displayName: "مانشستر سيتي", names: ["manchester city", "man city", "مانشستر سيتي"] },
  { internalId: "arsenal", displayName: "آرسنال", names: ["arsenal", "آرسنال"] },
  { internalId: "liverpool", displayName: "ليفربول", names: ["liverpool", "ليفربول"] },
  { internalId: "manchester-united", displayName: "مانشستر يونايتد", names: ["manchester united", "man united", "man utd", "مانشستر يونايتد"] },
  { internalId: "chelsea", displayName: "تشيلسي", names: ["chelsea", "تشيلسي"] },
  { internalId: "tottenham", displayName: "توتنهام", names: ["tottenham", "spurs", "توتنهام"] },
  { internalId: "real-madrid", displayName: "ريال مدريد", names: ["real madrid", "ريال مدريد"] },
  { internalId: "barcelona", displayName: "برشلونة", names: ["barcelona", "barça", "barca", "برشلونة"] },
  { internalId: "atletico-madrid", displayName: "أتلتيكو مدريد", names: ["atletico madrid", "atlético", "أتلتيكو مدريد"] },
  { internalId: "inter-milan", displayName: "إنتر ميلان", names: ["inter milan", "inter", "إنتر"] },
  { internalId: "ac-milan", displayName: "ميلان", names: ["ac milan", "ميلان"] },
  { internalId: "juventus", displayName: "يوفنتوس", names: ["juventus", "juve", "يوفنتوس"] },
  { internalId: "bayern-munich", displayName: "بايرن ميونخ", names: ["bayern", "bayern munich", "بايرن"] },
  { internalId: "psg", displayName: "باريس سان جيرمان", names: ["psg", "paris saint-germain", "paris sg", "باريس"] },
];

const PLAYERS: EntityDef[] = [
  { internalId: "mohamed-salah", displayName: "محمد صلاح", names: ["mohamed salah", "محمد صلاح", "mo salah", "m. salah"] },
  { internalId: "erling-haaland", displayName: "هالاند", names: ["erling haaland", "haaland", "هالاند"] },
  { internalId: "kylian-mbappe", displayName: "مبابي", names: ["kylian mbappe", "mbappe", "mbappé", "مبابي"] },
  { internalId: "vinicius-junior", displayName: "فينيسيوس", names: ["vinicius", "vinícius", "فينيسيوس"] },
  { internalId: "lamine-yamal", displayName: "لامين يامال", names: ["lamine yamal", "yamal", "يامال"] },
  { internalId: "bukayo-saka", displayName: "ساكا", names: ["bukayo saka", "saka", "ساكا"] },
  { internalId: "cole-palmer", displayName: "بالمر", names: ["cole palmer", "palmer", "بالمر"] },
  { internalId: "harry-kane", displayName: "هاري كين", names: ["harry kane", "kane", "هاري كين"] },
  { internalId: "imam-ashour", displayName: "إمام عاشور", names: ["emam ashour", "imam ashour", "إمام عاشور"] },
  { internalId: "nasser-maher", displayName: "ناصر ماهر", names: ["nasser maher", "ناصر ماهر"] },
];

const COMPETITIONS: EntityDef[] = [
  { internalId: "egyptian-league", displayName: "الدوري المصري", names: ["egyptian premier league", "egyptian league", "epl", "الدوري المصري"] },
  { internalId: "caf-champions-league", displayName: "دوري أبطال أفريقيا", names: ["caf champions league", "african champions league", "دوري أبطال أفريقيا"] },
  { internalId: "premier-league", displayName: "الدوري الإنجليزي", names: ["premier league", "الدوري الإنجليزي"] },
  { internalId: "champions-league", displayName: "دوري أبطال أوروبا", names: ["champions league", "uefa champions", "دوري أبطال أوروبا"] },
  { internalId: "la-liga", displayName: "الدوري الإسباني", names: ["la liga", "laliga", "الدوري الإسباني"] },
  { internalId: "serie-a", displayName: "الدوري الإيطالي", names: ["serie a", "الدوري الإيطالي"] },
  { internalId: "nba", displayName: "دوري السلة الأمريكي", names: ["nba", "national basketball"] },
];

function matchList(
  list: EntityDef[],
  type: NewsEntityRef["type"],
  titleLower: string,
  descLower: string,
): NewsEntityRef[] {
  const out: NewsEntityRef[] = [];
  for (const entity of list) {
    for (const name of entity.names) {
      const n = name.toLowerCase();
      const inTitle = titleLower.includes(n);
      const inDesc = descLower.includes(n);
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
  const t = title.toLowerCase();
  const d = description.toLowerCase();
  return [
    ...matchList(TEAMS, "team", t, d),
    ...matchList(PLAYERS, "player", t, d),
    ...matchList(COMPETITIONS, "competition", t, d),
  ].slice(0, 8);
}
