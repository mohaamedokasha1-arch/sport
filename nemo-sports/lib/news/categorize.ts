/**
 * NEMO Sports · automatic news categorization (keyword matching)
 * ─────────────────────────────────────────────────────────────
 * Confidence = matched keywords / total keywords × 100. Only assigned when
 * above the category's minConfidence; otherwise "Sports" (uncategorized).
 * Secondary categories: any other category above 50%.
 */

import { normalizeSearchText } from "@/lib/search-text";

export interface NewsCategory {
  name: string;
  nameAr: string;
  keywords: string[];
  minConfidence: number;
  color: string;
  icon: string;
}

/**
 * Threshold rationale: specific categories (leagues, sports) fire on a single
 * distinctive hit (35); generic ones (Football, Transfers, Match Reports,
 * Teams, Players) need two hits (60+) because their keywords ("team",
 * "match", "deal") appear in unrelated stories.
 */
export const CATEGORIES: NewsCategory[] = [
  { name: "Football", nameAr: "كرة القدم", keywords: ["football", "soccer", "match", "goal", "player", "team", "league", "كرة القدم"], minConfidence: 60, color: "#2196F3", icon: "⚽" },
  { name: "Egyptian Football", nameAr: "الكرة المصرية", keywords: ["al ahly", "الأهلي", "zamalek", "الزمالك", "egyptian premier league", "الدوري المصري", "pyramids", "ismaily", "الإسماعيلي"], minConfidence: 35, color: "#E91E63", icon: "🇪🇬" },
  { name: "International Football", nameAr: "كرة عالمية", keywords: ["international", "national team", "world cup", "euro", "copa", "منتخب", "كأس العالم"], minConfidence: 40, color: "#FF9800", icon: "🌍" },
  { name: "Champions League", nameAr: "دوري الأبطال", keywords: ["champions league", "دوري أبطال أوروبا"], minConfidence: 35, color: "#1E88E5", icon: "🏆" },
  { name: "CAF Champions League", nameAr: "دوري أبطال أفريقيا", keywords: ["caf", "african champions", "confederation africaine", "دوري أبطال أفريقيا", "caf champions"], minConfidence: 35, color: "#D32F2F", icon: "🏆" },
  { name: "Premier League", nameAr: "الدوري الإنجليزي", keywords: ["premier league", "manchester", "liverpool", "chelsea", "arsenal", "الدوري الإنجليزي"], minConfidence: 35, color: "#6C63FF", icon: "🇬🇧" },
  { name: "La Liga", nameAr: "الدوري الإسباني", keywords: ["la liga", "real madrid", "barcelona", "atlético madrid", "atletico", "الدوري الإسباني"], minConfidence: 35, color: "#FFC107", icon: "🇪🇸" },
  { name: "Serie A", nameAr: "الدوري الإيطالي", keywords: ["serie a", "juventus", "ac milan", "inter milan", "الدوري الإيطالي"], minConfidence: 35, color: "#00A86B", icon: "🇮🇹" },
  { name: "Transfers", nameAr: "الانتقالات", keywords: ["transfer", "signing", "deal", "move", "loan", "sold", "acquired", "انتقالات", "تعاقد"], minConfidence: 60, color: "#673AB7", icon: "🔄" },
  { name: "Match Reports", nameAr: "تقارير المباريات", keywords: ["report", "recap", "summary", "highlights", "analysis", "result", "تقرير", "ملخص"], minConfidence: 60, color: "#00BCD4", icon: "📊" },
  { name: "Teams", nameAr: "الأندية", keywords: ["team", "club", "squad", "roster", "announcement", "فريق", "نادي"], minConfidence: 60, color: "#4CAF50", icon: "👥" },
  { name: "Players", nameAr: "اللاعبون", keywords: ["player", "footballer", "athlete", "star", "legend", "لاعب"], minConfidence: 60, color: "#8BC34A", icon: "👤" },
  { name: "Basketball", nameAr: "كرة السلة", keywords: ["basketball", "nba", "court", "dunk", "hoop", "كرة السلة"], minConfidence: 35, color: "#FF6F00", icon: "🏀" },
  { name: "Tennis", nameAr: "التنس", keywords: ["tennis", "wimbledon", "atp", "wta", "التنس"], minConfidence: 35, color: "#00897B", icon: "🎾" },
  { name: "Handball", nameAr: "كرة اليد", keywords: ["handball", "ehf", "كرة اليد"], minConfidence: 35, color: "#E53935", icon: "🤾" },
  { name: "Volleyball", nameAr: "الكرة الطائرة", keywords: ["volleyball", "fivb", "الكرة الطائرة"], minConfidence: 35, color: "#FFB300", icon: "🏐" },
  { name: "Boxing", nameAr: "الملاكمة", keywords: ["boxing", "boxer", "knockout", "الملاكمة", "wbc", "wba"], minConfidence: 35, color: "#D32F2F", icon: "🥊" },
];

export const FALLBACK_CATEGORY = "Sports";
export const FALLBACK_CATEGORY_AR = "رياضة";

export interface CategoryResult {
  primary: string;
  primaryAr: string;
  secondary: string[];
  confidence: number;
  color: string;
  icon: string;
}

export function categorizeArticle(title: string, description: string): CategoryResult {
  // Scoring (0–100): each keyword hit = 35, multi-word hit = +15 bonus
  // (a phrase like "champions league" is far more diagnostic than "final").
  // Pure matches/keywords ratios under-fire because lists mix Arabic and
  // English terms that never co-occur in one article — verified against
  // real-world headlines in scripts/verify-news.ts.
  const text = `${title} ${description}`.toLowerCase();
  const scores: { cat: NewsCategory; confidence: number }[] = CATEGORIES.map((cat) => {
    let score = 0;
    for (const kw of cat.keywords) {
      if (text.includes(kw.toLowerCase())) {
        score += 35;
        if (kw.trim().includes(" ")) score += 15;
      }
    }
    return { cat, confidence: Math.min(100, score) };
  }).sort((a, b) => b.confidence - a.confidence);

  const top = scores[0]!;
  const secondary = scores.slice(1).filter((s) => s.confidence > 50).map((s) => s.cat.name);

  if (top.confidence >= top.cat.minConfidence) {
    return {
      primary: top.cat.name,
      primaryAr: top.cat.nameAr,
      secondary,
      confidence: top.confidence,
      color: top.cat.color,
      icon: top.cat.icon,
    };
  }
  return {
    primary: FALLBACK_CATEGORY,
    primaryAr: FALLBACK_CATEGORY_AR,
    secondary: [],
    confidence: top.confidence,
    color: "#5D6B7F",
    icon: "🏅",
  };
}

export function categoryMeta(name: string): { nameAr: string; color: string; icon: string } {
  const c = CATEGORIES.find((x) => x.name === name);
  if (!c) return { nameAr: FALLBACK_CATEGORY_AR, color: "#5D6B7F", icon: "🏅" };
  return { nameAr: c.nameAr, color: c.color, icon: c.icon };
}

/**
 * Canonical (stored) form of a ?category= URL parameter.
 * ─────────────────────────────────────────────────────
 * The store keeps English category names, but public links have shipped both
 * English and Arabic labels: the footer links to /news?category=انتقالات while
 * the feed chips link to /news?category=Transfers. An Arabic label used to be
 * compared verbatim against the English names, so the link rendered an honest
 * but dead empty page. Map any known label — English name, Arabic name (with
 * or without the definite article "ال"), and the Sports/رياضة fallback pair —
 * to the stored English name. Unknown values pass through unchanged and still
 * produce the honest empty state; nothing is fabricated.
 */
export function canonicalCategoryParam(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return raw;
  const stripArticle = (v: string) => v.replace(/^ال/, "");
  const needle = stripArticle(normalizeSearchText(raw));
  if (!needle) return raw;
  for (const cat of CATEGORIES) {
    if (stripArticle(normalizeSearchText(cat.name)) === needle || stripArticle(normalizeSearchText(cat.nameAr)) === needle) {
      return cat.name;
    }
  }
  if (needle === stripArticle(normalizeSearchText(FALLBACK_CATEGORY)) || needle === stripArticle(normalizeSearchText(FALLBACK_CATEGORY_AR))) {
    return FALLBACK_CATEGORY;
  }
  return raw;
}
