/**
 * Regression tests — news classification (priority 5).
 * Offline, in-memory store. Run: npm run news:classify:test
 */
import test from "node:test";
import assert from "node:assert/strict";

if (process.env.DATABASE_URL) throw new Error("Offline regression tests refuse a configured database");
process.env.NEMO_TEST_MEMORY_ONLY = "1";

import { categorizeArticle } from "@/lib/news/categorize";
import { sportsRelevance } from "@/lib/news/relevance";
import { insertArticle, getArticle, updateArticleCategory } from "@/lib/news/store";
import { planRecategorization } from "../scripts/recategorize-news";
import type { NewsArticle } from "@/lib/news/types";

test("Arabic: the same club name matches with and without the hamza (الأهلي = الاهلي)", () => {
  const a = categorizeArticle("الأهلي يفوز بالدوري المصري", "");
  const b = categorizeArticle("الاهلي يفوز بالدوري المصري", "");
  assert.equal(a.primary, "Egyptian Football");
  assert.equal(b.primary, "Egyptian Football");
  assert.equal(a.confidence, b.confidence);
});

test("Arabic: a club name in a title no longer falls back to generic Sports", () => {
  const c = categorizeArticle("كره القدم: الاهلي يتعاقد مع لاعب", "");
  assert.equal(c.primary, "Egyptian Football");
});

test("Latin keywords match whole words only: cafe is not CAF, start is not star", () => {
  const cafe = categorizeArticle("Cafe opens next to the stadium", "");
  assert.notEqual(cafe.primary, "CAF Champions League");
  const start = categorizeArticle("The season start is near", "");
  assert.notEqual(start.primary, "Players");
  const europe = categorizeArticle("Tourism in Europe grows", "");
  assert.notEqual(europe.primary, "International Football");
});

test("best qualifying category wins even when a higher-scoring generic one does not qualify", () => {
  // Football scores 50 but needs 60; Premier League scores 35 and qualifies.
  const c = categorizeArticle("كرة القدم: Manchester United wins at home", "");
  assert.equal(c.primary, "Premier League");
  assert.equal(c.secondary.includes("Football"), false, "a non-qualifying category is not reported as secondary");
});

test("'court' alone no longer makes a legal story Basketball", () => {
  // Only «court» hits here: the old code made this Basketball (35, qualifies).
  const c = categorizeArticle("Court ruling delays budget vote", "");
  assert.notEqual(c.primary, "Basketball");
  const bb = categorizeArticle("Basketball court renovation finished", "");
  assert.equal(bb.primary, "Basketball", "a real basketball headline still qualifies");
});

test("Tennis and NBA headlines keep their categories", () => {
  assert.equal(categorizeArticle("Tennis: Djokovic wins in Wimbledon", "").primary, "Tennis");
  assert.equal(categorizeArticle("NBA midseason power rankings released", "basketball court dunk hoop analysis").primary, "Basketball");
  assert.equal(categorizeArticle("Star striker joins club in transfer deal", "").primary, "Transfers");
});

test("Relevance: «مول» inside «مولدوفا» no longer sends a football story to review", () => {
  assert.equal(sportsRelevance("مولدوفا تفوز في كرة القدم"), "publish");
  assert.equal(sportsRelevance("افتتاح مول تجاري كبير في القاهرة"), "reject", "a real mall story is still commercial");
  assert.equal(sportsRelevance("كرة القدم: افتتاح مول جديد بجوار الملعب"), "review", "strong sport + commercial word → review");
});

const base = (over: Partial<NewsArticle>): NewsArticle => ({
  id: "x", title: "", sourceUrl: "https://example.com/a", canonicalUrl: "https://example.com/a",
  sourceName: "Example", sourceDomain: "example.com", publicationDate: new Date().toISOString(),
  fetchedDate: new Date().toISOString(), description: "", category: "Sports", secondaryCategories: [],
  categoryConfidence: 0, relatedEntities: [], rssSourceId: "src", fingerprint: "f", isDuplicate: false,
  duplicateOf: null, qualityScore: 0, status: "published", sourceBadge: "EX",
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...over,
});

test("dry-run plan: reports changes, changes nothing, never proposes a status change", () => {
  const articles = [
    base({ id: "1", title: "Tennis: Djokovic wins in Wimbledon", category: "Sports", categoryConfidence: 0 }),
    base({ id: "2", title: "Court orders club to pay player wages", category: "Basketball", categoryConfidence: 35, status: "published" }),
  ];
  const before = JSON.stringify(articles);
  const plan = planRecategorization(articles);
  assert.equal(plan.total, 2);
  assert.equal(plan.changes.length, 2);
  assert.equal(plan.changes.find((c) => c.id === "2")?.to, "Sports");
  assert.equal(JSON.stringify(articles), before, "input is not mutated");
  assert.equal(plan.relevanceRejects.length, 1, "relevance rejects are reported, not acted on");
});

test("apply path writes only the category fields; status and the record survive", async () => {
  const a = base({ id: "apply-1", canonicalUrl: "https://example.com/apply-1", title: "Old label", category: "Sports", status: "published" });
  await insertArticle(a);
  const ok = await updateArticleCategory("apply-1", { category: "Tennis", secondaryCategories: ["Players"], categoryConfidence: 70 });
  assert.equal(ok, true);
  const after = await getArticle("apply-1");
  assert.ok(after);
  assert.equal(after!.category, "Tennis");
  assert.deepEqual(after!.secondaryCategories, ["Players"]);
  assert.equal(after!.categoryConfidence, 70);
  assert.equal(after!.status, "published", "status is untouched");
  assert.equal(after!.title, "Old label", "title is untouched");
  assert.equal(await updateArticleCategory("missing-id", { category: "Tennis", secondaryCategories: [], categoryConfidence: 0 }), false);
});

/* ── 2026-10-11 production false positives: commercial / university / property stories ── */

import { sportsRelevanceDetail, shouldAutoQuarantine } from "@/lib/news/relevance";
import { matchEntities } from "@/lib/news/entities";
import { planModeration, moderatePublished } from "@/lib/news/moderation";
import { quarantineArticle, listArticles } from "@/lib/news/store";

const PROD = {
  sewedy: ["El Sewedy sells 40% of CIRA's Damietta university venture - Billionaires.Africa", "Al Ahly Sabb"],
  sabbour: ["Al Ahly Sabbour Launches Zaha Residence in Sultan Haitham City, Oman - News and Statistics - IndexBox", "Al Ahly Sabb"],
  ihf: ["Veszprém dominate Al Ahly once again with final in sight - IHF", "Veszprém dominate Al Ahly once a"],
  newsIhf: ["News - IHF", "N"],
  stadium: ["Al Ahly FC - Stadium - El Ahly Stadium - transfermarkt.us", "Al Ahly FC - Stadium - El Ahly Stadium  "],
  liveScore: ["Al Ahly vs. Kitara FC (Oct 23, 2026) Live Score - ESPN", "Al Ahly vs. Kitara FC (Oct 23, 2026) Live Score  "],
  afsha: ["Afsha suffers minor calf pain: Al Ahly doctor - الموقع الرسمي للنادي الأهلي المصري", "Afsha suffers minor calf pain"],
} as const;

test("relevance: the property launch and the university investment are rejected as non-sports", () => {
  for (const key of ["sewedy", "sabbour"] as const) {
    const d = sportsRelevanceDetail(PROD[key][0], PROD[key][1]);
    assert.equal(d.verdict, "reject", key);
    assert.equal(shouldAutoQuarantine(d), true, key);
  }
  // namesake companies never become the club
  assert.equal(categorizeArticle(PROD.sabbour[0], PROD.sabbour[1]).primary, "Sports");
  assert.equal(matchEntities(PROD.sabbour[0], PROD.sabbour[1]).length, 0);
});

test("relevance: legitimate club stories are never auto-quarantined (weak signals go to an editor)", () => {
  for (const key of ["ihf", "newsIhf", "stadium", "liveScore", "afsha"] as const) {
    assert.equal(shouldAutoQuarantine(sportsRelevanceDetail(PROD[key][0], PROD[key][1])), false, key);
  }
  assert.equal(sportsRelevanceDetail(PROD.liveScore[0]).reason, "non-article");
  assert.equal(sportsRelevanceDetail(PROD.stadium[0]).reason, "non-article");
  assert.equal(sportsRelevance(PROD.afsha[0], PROD.afsha[1]), "review", "an injury story is sports context, not commercial");
  // sports idioms that look commercial are not commercial
  assert.notEqual(sportsRelevanceDetail("Aston Villa title hopes at stake after defeat - BBC Sport").reason, "commercial");
  assert.notEqual(sportsRelevanceDetail("أسهم صلاح في فوز ليفربول بهدفين").reason, "commercial");
  assert.notEqual(sportsRelevanceDetail("Bank holiday fixtures: Premier League schedule confirmed").reason, "commercial");
  // the Egyptian club «البنك الأهلي» with a sports signal goes to review, not reject
  assert.equal(sportsRelevance("البنك الأهلي يفوز على الزمالك في الدوري المصري"), "review");
});

test("categories: an IHF (handball) story about Al Ahly is Handball, not «الكرة المصرية»", () => {
  assert.equal(categorizeArticle(PROD.ihf[0], PROD.ihf[1]).primary, "Handball");
  assert.equal(categorizeArticle("Al Ahly beat Zamalek in the Egyptian Premier League", "").primary, "Egyptian Football");
});

test("entities: whole words only, no bare ambiguous aliases", () => {
  const ids = (t: string) => matchEntities(t, "").map((e) => e.internalId);
  assert.deepEqual(ids(PROD.afsha[0]), ["al-ahly"], "«الأهلي المصري» is not Al Masry");
  assert.equal(ids("Inter Miami beat Cruz Azul in the international friendly").includes("inter-milan"), false);
  assert.equal(ids("Osaka hosts the tennis final").includes("bukayo-saka"), false);
  assert.equal(ids("Bukayo Saka scores for Arsenal").includes("bukayo-saka"), true);
  assert.deepEqual(ids("المصري البورسعيدي يتعادل مع الأهلي").sort(), ["al-ahly", "al-masry"]);
});

test("moderation plan: quarantines only clear non-sports items, reports the rest, ignores non-published", () => {
  const articles = [
    base({ id: "m1", title: PROD.sewedy[0], description: PROD.sewedy[1], category: "Egyptian Football" }),
    base({ id: "m2", title: PROD.sabbour[0], description: PROD.sabbour[1], category: "Egyptian Football" }),
    base({ id: "m3", title: PROD.liveScore[0], category: "Egyptian Football" }),
    base({ id: "m4", title: "Al Ahly beat Zamalek in the Egyptian Premier League derby", category: "Egyptian Football" }),
    base({ id: "m5", title: PROD.sabbour[0], status: "hidden" }),
  ];
  const before = JSON.stringify(articles);
  const plan = planModeration(articles);
  assert.equal(plan.scanned, 4);
  assert.deepEqual(plan.quarantine.map((q) => q.id).sort(), ["m1", "m2"]);
  assert.deepEqual(plan.review.map((r) => r.id), ["m3"]);
  assert.equal(JSON.stringify(articles), before, "planning never mutates");
});

test("quarantine keeps the record and its provenance; re-running is a no-op; nothing is deleted", async () => {
  const a = base({ id: "q-1", canonicalUrl: "https://example.com/q-1", title: PROD.sabbour[0], description: PROD.sabbour[1], category: "Egyptian Football" });
  await insertArticle(a);
  const dry = await moderatePublished({ apply: false });
  assert.ok(dry.quarantine.some((q) => q.id === "q-1"));
  assert.equal((await getArticle("q-1"))!.status, "published", "dry run writes nothing");
  const run = await moderatePublished({ apply: true, by: "test-moderator" });
  assert.ok(run.applied >= 1);
  const after = await getArticle("q-1");
  assert.ok(after, "the record survives");
  assert.equal(after!.status, "hidden");
  assert.equal(after!.previousStatus, "published");
  assert.equal(after!.moderatedBy, "test-moderator");
  assert.match(String(after!.moderationReason), /auto:relevance:non-sport-entity/);
  assert.equal(after!.title, a.title, "content untouched");
  assert.equal(after!.category, "Egyptian Football", "category untouched (re-categorisation is a separate, explicit step)");
  assert.equal(await quarantineArticle("q-1", { reason: "x", by: "y" }), false, "idempotent");
  const visible = await listArticles({});
  assert.equal(visible.items.some((x) => x.id === "q-1"), false, "no longer public");
  const all = await listArticles({ includeNonPublished: true, limit: 100 });
  assert.equal(all.items.some((x) => x.id === "q-1"), true, "still in the store for editors");
});
