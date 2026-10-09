/**
 * NEMO Sports · search & competition-path regression checks (offline).
 * Covers Arabic/English name matching, European letters, and the
 * competition alias → canonical path mapping.
 *
 * Run: npx tsx scripts/verify-search.ts
 */
import assert from "node:assert/strict";
import { matchesSearchText, normalizeSearchText, searchMatchWeight } from "../lib/search-text";
import { arabicAliasesFor } from "../lib/name-aliases";
import { competitionByPath, canonicalCompetitions } from "../lib/competition-catalog";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

/** Mirrors searchEntities' matching for one hit. */
function hitMatches(query: string, title: string, sub = "", id = ""): boolean {
  // Mirrors the guard at the top of searchEntities: queries under 2 characters never search.
  if (query.trim().length < 2) return false;
  const terms = [title, sub, id, ...arabicAliasesFor(title)];
  return searchMatchWeight(query, ...terms) > 0 || matchesSearchText(query, ...terms);
}

console.log("search: Arabic ↔ English names");
check("هالاند finds Erling Haaland", () => assert.ok(hitMatches("هالاند", "Erling Haaland", "Manchester City")));
check("Haaland still finds Erling Haaland", () => assert.ok(hitMatches("Haaland", "Erling Haaland")));
check("صلاح finds Mohamed Salah", () => assert.ok(hitMatches("صلاح", "Mohamed Salah")));
check("محمد صلاح finds Mohamed Salah", () => assert.ok(hitMatches("محمد صلاح", "Mohamed Salah")));
check("مبابي finds Kylian Mbappé", () => assert.ok(hitMatches("مبابي", "Kylian Mbappé")));
check("Mbappe (no accent) finds Kylian Mbappé", () => assert.ok(hitMatches("Mbappe", "Kylian Mbappé")));
check("مانشستر سيتي finds Manchester City team", () => assert.ok(hitMatches("مانشستر سيتي", "Manchester City")));
check("الاهلي finds Al Ahly (ه/ة/أ folding)", () => assert.ok(hitMatches("الاهلي", "Al Ahly")));
check("ريال مدريد finds Real Madrid", () => assert.ok(hitMatches("ريال مدريد", "Real Madrid")));

console.log("search: European letters");
check("Groß matches Pascal Groß", () => assert.ok(hitMatches("Groß", "Pascal Groß")));
check("Gross matches Pascal Groß (ß→ss)", () => assert.ok(hitMatches("Gross", "Pascal Groß")));
check("Odegaard matches Martin Ødegaard", () => assert.ok(hitMatches("Odegaard", "Martin Ødegaard")));

console.log("search: honest no-result cases");
check("unknown Arabic name returns no hit", () => assert.equal(hitMatches("هذاالاسمغيرموجود", "Erling Haaland"), false));
check("one-letter query is never a match", () => assert.equal(hitMatches("ه", "Erling Haaland"), false));
check("no invented alias for an unlisted player", () => assert.deepEqual(arabicAliasesFor("Pascal Groß"), []));

console.log("normalization");
check("tashkeel and tatweel removed", () => assert.equal(normalizeSearchText("مُحَمَّد صـلاح"), "محمد صلاح"));

console.log("competitions: one canonical path per competition");
check("PL alias resolves to premier-league", () => assert.equal(competitionByPath("PL")?.canonicalSlug, "premier-league"));
check("english-premier-league alias resolves to premier-league", () =>
  assert.equal(competitionByPath("english-premier-league")?.canonicalSlug, "premier-league"));
check("canonical path resolves to itself", () =>
  assert.equal(competitionByPath("premier-league")?.canonicalSlug, "premier-league"));
check("every canonical path is unique", () => {
  const paths = canonicalCompetitions.map((c) => c.canonicalSlug);
  assert.equal(new Set(paths).size, paths.length);
});

console.log(`\n✅ SEARCH CHECKS PASSED (${passed})`);
