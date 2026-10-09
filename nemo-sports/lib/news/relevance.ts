import { normalizeSearchText } from "@/lib/search-text";

/** Conservative editorial routing, NOT fact verification. Geography, club-like
 * company names, and generic words (team/deal/final) never suffice alone. */
export function sportsRelevance(title: string, description = ""): "publish" | "review" | "reject" {
  const text = normalizeSearchText(`${title} ${description}`);
  const strong = /(?:كرة القدم|كره القدم|كره السله|كرة السلة|كره اليد|كرة اليد|التنس|الملاكمه|الدوري|كاس العالم|دوري ابطال|football|soccer|basketball|volleyball|handball|tennis|premier league|champions league|la liga|serie a|bundesliga|\bnba\b|\bfifa\b|\buefa\b)/u.test(text);
  const commercial = /(?:عقارات|عقاري|عقاريه|شقق|مول|اسعار الذهب|البورصه|real estate|property development|mortgage|stock market)/u.test(text);
  if (commercial) return strong ? "review" : "reject";
  if (strong) return "publish";
  const context = /(?:مباراه|مباريات|تسجيل هدف|ركله جزاء|حارس المرمي|لاعب|مدرب|\bgoalkeeper\b|\bscorer\b|\bstriker\b|\bmatch\b|\bcoach\b)/u.test(text);
  return context ? "review" : "reject";
}

export function reportKind(title: string): "rumor" | "report" {
  return /(?:شائع|اشاع|إشاع|تقارير|قد ينتقل|rumou?r|reportedly|linked with)/i.test(title) ? "rumor" : "report";
}
