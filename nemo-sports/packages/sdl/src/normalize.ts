/**
 * SDL · Text normalization, fingerprinting and fuzzy matching (§3.4)
 * Handles Arabic + Latin so that "الأهلي", "Al Ahly" and "AL-AHLY SC"
 * can be recognised as candidates for the same canonical entity.
 */

const ARABIC_DIACRITICS = /[\u064B-\u0652\u0670\u0640]/g;

/** Fold a name to a comparison key. Deterministic, locale-independent. */
export function normalizeName(input: string | null | undefined): string {
  if (!input) return "";
  let s = input.toLowerCase().trim();
  s = s.replace(ARABIC_DIACRITICS, "");
  s = s
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه");
  // strip corporate suffixes that differ between providers
  s = s.replace(/\b(f\.?c\.?|s\.?c\.?|cf|club|team|afc|bk|if|ac)\b/g, " ");
  s = s.replace(/[^0-9a-z\u0600-\u06ff]+/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

/** Compact key with spaces removed — catches "Man City" vs "ManCity". */
export function compactKey(input: string | null | undefined): string {
  return normalizeName(input).replace(/\s/g, "");
}

/** Stable hash used for request/cache/dedup keys (no external deps). */
export function fingerprint(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function requestKey(provider: string, endpoint: string, params: Record<string, unknown>): string {
  const sorted = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join("&");
  return `sdl:provider:${provider}:${endpoint}:${fingerprint(sorted)}`;
}

export const roundMinutes = (v: number, step = 5) => Math.round(v / step) * step;

/**
 * Similarity in [0,1] combining token-set Jaccard and Dice bigram distance.
 * Cheap enough to run over thousands of candidates, robust to word order.
 */
export function similarity(aRaw: string, bRaw: string): number {
  const a = normalizeName(aRaw);
  const b = normalizeName(bRaw);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (compactKey(aRaw) === compactKey(bRaw)) return 0.97;

  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  let inter = 0;
  ta.forEach((t) => {
    if (tb.has(t)) inter++;
  });
  const jaccard = inter / (ta.size + tb.size - inter || 1);

  const bigrams = (s: string) => {
    const out = new Set<string>();
    const t = s.replace(/\s/g, "");
    for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
    return out;
  };
  const ba = bigrams(a);
  const bb = bigrams(b);
  let shared = 0;
  ba.forEach((g) => {
    if (bb.has(g)) shared++;
  });
  const dice = (2 * shared) / (ba.size + bb.size || 1);

  return Math.max(jaccard, dice * 0.95);
}

export type Candidate = { id: string; name: string; score: number };

/**
 * Rank candidates above a threshold, best first.
 *
 * A candidate may carry several name variants (English, Arabic, short name,
 * abbreviation, historical spelling). They are scored individually and the best
 * one wins: concatenating them into a single string would dilute the score
 * below the threshold and make every real match look like a new entity.
 */
export function rankCandidates(
  query: string,
  pool: { id: string; name: string | string[] }[],
  threshold = 0.72,
): Candidate[] {
  return pool
    .map((c) => {
      const variants = Array.isArray(c.name) ? c.name : [c.name];
      let best = 0;
      for (const v of variants) best = Math.max(best, similarity(query, v));
      return { id: c.id, name: variants[0] ?? "", score: best };
    })
    .filter((c) => c.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

/** ISO date at UTC day precision — used by the match-dedup window. */
export function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function withinMinutes(aIso: string, bIso: string, minutes: number): boolean {
  return Math.abs(+new Date(aIso) - +new Date(bIso)) <= minutes * 60_000;
}

export const nowIso = () => new Date().toISOString();

/**
 * Deterministic id in UUID v4 shape (8-4-4-4-12), derived from the seed so the
 * same provider record always maps to the same canonical entity and tests are
 * reproducible. Two fingerprints give 20+ bits of spread per segment.
 */
export function seededId(seed: string): string {
  // fingerprint() is base36 and can exceed 2^32, so mask to 32 bits first
  const hex32 = (v: string) => (Number.parseInt(fingerprint(v), 36) >>> 0).toString(16).padStart(8, "0");
  const body = hex32(seed) + hex32(seed + "::salt"); // 16 hex chars of spread
  const segments = [
    body.slice(0, 8),
    "4" + body.slice(8, 11), // version 4
    "a" + body.slice(11, 14), // variant bits
    body.slice(14, 16) + body.slice(0, 2),
    body.slice(2, 14),
  ];
  return segments.join("-");
}
