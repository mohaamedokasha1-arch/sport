/** Shared Arabic/English search normalization used by suggestions and results. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // Latin diacritics (Mbappé → Mbappe)
    .toLocaleLowerCase("ar")
    .replace(/ß/g, "ss") // German sharp s (Groß → Gross)
    .replace(/[øØ]/g, "o")
    .replace(/æ/g, "ae")
    .replace(/[đĐ]/g, "d")
    .replace(/ł/g, "l")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "") // tashkeel / Quranic marks
    .replace(/ـ/g, "") // tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ؤو]/g, "و")
    .replace(/[ئى]/g, "ي")
    .replace(/[ةه]/g, "ه")
    .replace(/[\u2010-\u2015\-‐‑‒–—_./\\]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Matches at the start of any word or anywhere inside the normalized name. */
export function matchesSearchText(query: string, ...values: Array<string | null | undefined>): boolean {
  const needle = normalizeSearchText(query);
  if (needle.length < 2) return false;
  return values.some((value) => {
    if (!value) return false;
    const haystack = normalizeSearchText(value);
    return haystack.includes(needle) || haystack.split(" ").some((word) => word.startsWith(needle));
  });
}

export function searchMatchWeight(query: string, ...values: Array<string | null | undefined>): number {
  const needle = normalizeSearchText(query);
  let best = 0;
  for (const value of values) {
    if (!value) continue;
    const haystack = normalizeSearchText(value);
    if (haystack === needle) best = Math.max(best, 5);
    else if (haystack.startsWith(needle)) best = Math.max(best, 4);
    else if (haystack.split(" ").some((word) => word.startsWith(needle))) best = Math.max(best, 3);
    else if (haystack.includes(needle)) best = Math.max(best, 2);
  }
  return best;
}
