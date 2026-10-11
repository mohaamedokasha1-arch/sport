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
