/**
 * NEMO Sports · fallback monogram for a team without a logo (pure).
 * ─────────────────────────────────────────────────────────────────
 * The badge used to show `name.slice(0, 3)` next to the full name, which read
 * as an accidental duplicate ("Vaq Vaqueros Reynosa" — and "VaqVaqueros
 * Reynosa" in any text extraction, as production rendered it) and cut Arabic
 * names mid-word ("الأهلي" → "الأ", the article plus a letter).
 *
 * Rules:
 *   · a provider-supplied short code (TLA such as "MCI") is a valid
 *     abbreviation and is kept as-is;
 *   · otherwise initials of the first two significant words ("Vaqueros
 *     Reynosa" → "VR", "Real Madriz FC" → "RM"), skipping legal/generic
 *     tokens (FC, SC, de, la…);
 *   · Arabic names use the first letter of up to two words, ignoring the
 *     definite article ("الأهلي" → "أ", "بوروسيا دورتموند" → "بد");
 *   · a single Latin word keeps its first three letters ("Diriangen" → "DIR").
 * The source name itself is never altered — this is display-only.
 */

const GENERIC_TOKENS = new Set([
  "fc", "sc", "cf", "afc", "cd", "sv", "fk", "nk", "ac", "as", "us", "sd", "ud", "rc", "ca", "ss", "bk", "if", "ik",
  "club", "de", "del", "da", "do", "dos", "la", "le", "el", "les", "al", "the", "of", "y", "e",
  "w", "women", "u17", "u18", "u19", "u20", "u21", "u23", "ii", "b", "jr",
]);

const ARABIC = /[\u0600-\u06FF]/;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

function firstGrapheme(word: string): string {
  for (const ch of word) if (LETTER_OR_DIGIT.test(ch)) return ch;
  return "";
}

export function teamMonogram(name: string | null | undefined, shortName?: string | null): string {
  const full = String(name ?? "").trim();
  const short = String(shortName ?? "").trim();
  if (short && [...short].length <= 4 && short.toLowerCase() !== full.toLowerCase()) {
    return ARABIC.test(short) ? short : short.toUpperCase();
  }
  const clean = full.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return "؟";
  const words = clean.split(/[\s\-–—_./·]+/).filter((w) => LETTER_OR_DIGIT.test(w));
  if (words.length === 0) return [...clean][0] ?? "؟";

  if (ARABIC.test(clean)) {
    const letters = words
      .map((w) => w.replace(/^(?:وال|بال|فال|كال|لل|ال)(?=\p{L}{2,})/u, ""))
      .map(firstGrapheme)
      .filter(Boolean);
    return letters.slice(0, 2).join("") || firstGrapheme(clean) || "؟";
  }

  const significant = words.filter((w) => !GENERIC_TOKENS.has(w.toLowerCase()));
  const pool = significant.length ? significant : words;
  if (pool.length >= 2) return pool.slice(0, 2).map((w) => firstGrapheme(w).toUpperCase()).join("");
  return [...pool[0]].filter((ch) => LETTER_OR_DIGIT.test(ch)).slice(0, 3).join("").toUpperCase();
}
