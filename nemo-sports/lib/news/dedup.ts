/**
 * NEMO Sports · duplicate detection (5 levels)
 * ───────────────────────────────────────────
 * L1 exact URL → L2 canonical URL → L3 title similarity (>85% + same
 * source/date) → L4 description similarity (>90% + same date) → L5
 * domain+date collision. Never blocks the pipeline: always returns a
 * decision object with a human-readable reason.
 */

import type { DuplicateCheck, NewsArticle } from "./types";

function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[«»""''`´!?:;,.()[\]{}—–-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Jaccard-over-tokens blended with normalized Levenshtein — cheap, no deps,
 * good enough for headline near-dup detection. Returns 0–100.
 */
export function textSimilarity(a: string, b: string): number {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;

  const ta = new Set(na.split(" "));
  const tb = new Set(nb.split(" "));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const jaccard = (inter / Math.max(1, ta.size + tb.size - inter)) * 100;

  const lev = levenshtein(na.slice(0, 220), nb.slice(0, 220));
  const levScore = Math.max(0, (1 - lev / Math.max(na.length, nb.length)) * 100);

  return Math.round(jaccard * 0.55 + levScore * 0.45);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length]!;
}

function sameDay(aIso: string, bIso: string): boolean {
  return aIso.slice(0, 10) === bIso.slice(0, 10);
}

export interface DedupCandidate {
  sourceUrl: string;
  canonicalUrl: string;
  title: string;
  description: string;
  sourceDomain: string;
  publicationDate: string;
}

export function checkDuplicate(
  candidate: DedupCandidate,
  existing: Pick<NewsArticle, "sourceUrl" | "canonicalUrl" | "title" | "description" | "sourceDomain" | "publicationDate">,
): DuplicateCheck {
  const exactUrlMatch = candidate.sourceUrl === existing.sourceUrl;
  const canonicalUrlMatch = candidate.canonicalUrl === existing.canonicalUrl;

  const titleSimilarity = textSimilarity(candidate.title, existing.title);
  const titleIsDuplicate =
    titleSimilarity > 85 &&
    candidate.sourceDomain === existing.sourceDomain &&
    sameDay(candidate.publicationDate, existing.publicationDate);

  const descriptionSimilarity =
    candidate.description && existing.description
      ? textSimilarity(candidate.description, existing.description)
      : 0;
  const descriptionIsDuplicate =
    descriptionSimilarity > 90 && sameDay(candidate.publicationDate, existing.publicationDate);

  const domainDateCollision =
    candidate.sourceDomain === existing.sourceDomain &&
    sameDay(candidate.publicationDate, existing.publicationDate) &&
    titleSimilarity > 70;

  let isDuplicate = false;
  let reason = "unique";
  let confidence = 0;

  if (exactUrlMatch) {
    isDuplicate = true;
    reason = "exact URL match";
    confidence = 100;
  } else if (canonicalUrlMatch) {
    isDuplicate = true;
    reason = "canonical URL match (tracking params differ)";
    confidence = 99;
  } else if (titleIsDuplicate) {
    isDuplicate = true;
    reason = `title ${titleSimilarity}% similar, same source + date`;
    confidence = 92;
  } else if (descriptionIsDuplicate) {
    isDuplicate = true;
    reason = `description ${descriptionSimilarity}% similar, same date`;
    confidence = 88;
  } else if (domainDateCollision && titleSimilarity > 80) {
    isDuplicate = true;
    reason = `domain+date collision, title ${titleSimilarity}% similar`;
    confidence = 80;
  }

  return {
    exactUrlMatch,
    canonicalUrlMatch,
    titleSimilarity,
    titleIsDuplicate,
    descriptionSimilarity,
    descriptionIsDuplicate,
    domainDateCollision,
    isDuplicate,
    confidence,
    reason,
  };
}
