import { normalizeSearchText } from "@/lib/search-text";

/**
 * Conservative editorial routing, NOT fact verification. Geography, club-like
 * company names, and generic words (team/deal/final) never suffice alone.
 *
 * Production (2026-10-11) carried commercial stories in sports categories:
 *   · "Al Ahly Sabbour Launches Zaha Residence …" (a property developer that
 *     shares the club's name) → «الكرة المصرية»
 *   · "El Sewedy sells 40% of CIRA's Damietta university venture" (snippet
 *     "Al Ahly Sabb…") → «الكرة المصرية»
 * Both are rejected now: a known non-sport "Al Ahly …" company, or
 * business/property/education vocabulary with no sports signal at all.
 */

export type RelevanceVerdict = "publish" | "review" | "reject";
export type RelevanceReason =
  | "sports" // a strong sports signal
  | "sports-context" // only weak sports context (player/match/score…) → editor review
  | "commercial" // business / property / finance / education vocabulary
  | "non-sport-entity" // a company that shares a club's name (Al Ahly Sabbour, Al Ahly Bank…)
  | "non-article" // a score page, profile/stadium page or a bare section title
  | "no-sports-signal"; // nothing indicates sport

export interface RelevanceDetail {
  verdict: RelevanceVerdict;
  reason: RelevanceReason;
}

/**
 * Companies and institutions that share the "Al Ahly" name. They are matched
 * on the normalized text (lowercase, hamza-free, ة→ه, ى→ي). "sabb…" also
 * covers RSS snippets truncated mid-word ("Al Ahly Sabb").
 * «البنك الأهلي» is BOTH a bank and a Premier League club (National Bank of
 * Egypt SC), so it only counts as commercial when no sports signal exists —
 * which is exactly how the verdict below treats every commercial match.
 */
export const NON_SPORT_ENTITY =
  /(?:al[ -]?ahly (?:sabb\w*|bank|capital|pharos|momken|leasing|for (?:development|real estate|investment|trading))|ahly sabb\w*|ahli (?:united )?bank|bank al[ -]?ahly|national bank of egypt|الاهلي صبور|الاهلي كابيتال|الاهلي فاروس|الاهلي ممكن|الاهلي للتنميه|البنك الاهلي|بنك الاهلي)/u;

const STRONG =
  /(?:كره القدم|كره السله|كره اليد|الكره الطائره|التنس|الملاكمه|الدوري|كاس العالم|دوري ابطال|منتخب|football|soccer|basketball|volleyball|handball|tennis|premier league|champions league|la liga|serie a|bundesliga|\bnba\b|\bfifa\b|\buefa\b|\bihf\b|\behf\b|\bfiba\b|\bfivb\b|\bcaf\b|\batp\b|\bwta\b)/u;

// «مول» (mall) must be a whole word: unbounded, it fired inside «مولدوفا»
// (Moldova). Common particles (و ب ل ف ال) may attach in front; a letter may
// not follow.
//
// Deliberately NOT here, because sports writing uses them every day:
// "villa" (Aston Villa), "stake" (title at stake), "shares" (shares the lead),
// "acquire" (Lakers acquire a guard), "compound" (training compound),
// "billionaire" (club takeovers), «أسهم» (contributed), «الاستحواذ»
// (possession), «حصة» (training session).
const COMMERCIAL_NORMALIZED =
  /(?:عقارات|عقاري|عقاريه|شقق سكنيه|كمبوند سكني|وحدات سكنيه|مشروع سكني|مطور عقاري|(?<!\p{L})(?:وال|بال|لل|فال|ال|[وبلف])?مول(?!\p{L})|اسعار الذهب|البورصه|real estate|property (?:developer|development|market)|residential|mortgage|stock market|\bipo\b|joint venture|venture capital|university venture|universit(?:y|ies)|\bbanking\b|\bbank\b(?! holiday)|fintech|insurance|\begx\b)/u;
/** Business figures that only survive on the raw text ("sells 40%", "a 25% stake"). */
const COMMERCIAL_RAW = /(?:\bsells?\s+(?:a\s+)?\d{1,3}(?:\.\d+)?\s?%|\b\d{1,3}(?:\.\d+)?\s?%\s+(?:stake|of\s+(?:its|the)\s+shares))/i;

const CONTEXT =
  /(?:مباراه|مباريات|تسجيل هدف|ركله جزاء|حارس المرمي|لاعب|مدرب|اصابه|مصاب|تدريبات|الفريق الاول|يفوز علي|تعادل|بهدفين|بهدف نظيف|الشوط الاول|الشوط الثاني|\breferee\b|\bgoalkeeper\b|\bscorer\b|\bstriker\b|\bmidfielder\b|\bdefender\b|\bmatch\b|\bcoach\b|\bmanager\b|\binjur(?:y|ies|ed)\b|\bcalf\b|\bhamstring\b|\bsquad\b|\btraining\b|\bderby\b|\bleague cup\b|\bcup\b|\bfixture\b|\bkick-?off\b|\bfc\b|\bsc\b|\bvs\.?\b)/u;

/** Sports publishers / data sites (title suffix "… - Goal.com"). */
const SPORTS_SOURCE = /(?:goal\.com|flashscore|transfermarkt|espn|kooora|yallakora|filgoal|sofascore|bbc sport|sky sports|onefootball|90min|marca|as\.com|\bihf\b|\bcaf\b)/u;

/** Score lines such as "1-0", "2 - 1" (raw text: normalization drops the dash). */
const SCORELINE = /(?<![\d:])\d{1,2}\s?[-–]\s?\d{1,2}(?![\d:])/u;

/**
 * Pages that are not news stories even when they are about sport: live-score
 * widgets, profile/stadium database pages, bare section titles ("News - IHF").
 * Matched on the raw lowercase title, where " - " separators still exist.
 */
const NON_ARTICLE = /(?:\blive scores?\b|\s-\s(?:stadium|squad|profile|fixtures|results|table|standings)\s-\s|^\s*(?:news|home|latest news|results|fixtures)\s*$)/u;

/** "Headline - Publisher" → "Headline" (Google News titles carry the publisher). */
function headlineOf(title: string): string {
  const idx = title.lastIndexOf(" - ");
  return idx > 0 ? title.slice(0, idx) : title;
}

export function sportsRelevanceDetail(title: string, description = ""): RelevanceDetail {
  const text = normalizeSearchText(`${title} ${description}`);
  const raw = `${title} ${description}`.toLowerCase();
  const rawHeadline = headlineOf(title);
  const headlineWords = normalizeSearchText(rawHeadline).split(/\s+/).filter(Boolean).length;
  const nonSportEntity = NON_SPORT_ENTITY.test(text);
  const commercial = nonSportEntity || COMMERCIAL_NORMALIZED.test(text) || COMMERCIAL_RAW.test(raw);
  const strong = STRONG.test(text);
  const context = CONTEXT.test(text) || SPORTS_SOURCE.test(normalizeSearchText(title)) || SCORELINE.test(rawHeadline);
  const nonArticle = NON_ARTICLE.test(title.toLowerCase()) || NON_ARTICLE.test(rawHeadline.toLowerCase()) || headlineWords < 3;

  if (commercial) {
    if (strong || context) return { verdict: "review", reason: nonSportEntity ? "non-sport-entity" : "commercial" };
    return { verdict: "reject", reason: nonSportEntity ? "non-sport-entity" : "commercial" };
  }
  if (nonArticle) return { verdict: strong || context ? "review" : "reject", reason: "non-article" };
  if (strong) return { verdict: "publish", reason: "sports" };
  if (context) return { verdict: "review", reason: "sports-context" };
  return { verdict: "reject", reason: "no-sports-signal" };
}

/** Back-compatible verdict-only form used by the ingestion pipeline. */
export function sportsRelevance(title: string, description = ""): RelevanceVerdict {
  return sportsRelevanceDetail(title, description).verdict;
}

/**
 * Should an ALREADY PUBLISHED article be quarantined automatically?
 * Only clear non-sports content qualifies — commercial vocabulary or a
 * non-sport namesake company with no sports signal at all. Weak or missing
 * sports vocabulary alone never does (a real injury story may lack it); those
 * are reported for an editor instead.
 */
export function shouldAutoQuarantine(detail: RelevanceDetail): boolean {
  return detail.verdict === "reject" && (detail.reason === "commercial" || detail.reason === "non-sport-entity");
}

/** Strip non-sport namesakes before category/entity matching ("Al Ahly Sabbour" ≠ the club). */
export function withoutNonSportEntities(text: string): string {
  return normalizeSearchText(text).replace(new RegExp(NON_SPORT_ENTITY.source, "gu"), " ");
}

export function reportKind(title: string): "rumor" | "report" {
  return /(?:شائع|اشاع|إشاع|تقارير|قد ينتقل|rumou?r|reportedly|linked with)/i.test(title) ? "rumor" : "report";
}
