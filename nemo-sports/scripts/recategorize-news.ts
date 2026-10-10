/**
 * NEMO Sports · re-classify stored news with the current category rules.
 * ───────────────────────────────────────────────────────────────────────
 *   npm run news:recategorize                 → DRY RUN (default): prints what would change
 *   npm run news:recategorize -- --apply      → writes the category fields only
 *   npm run news:recategorize -- --report=out.json   → also writes the full plan (JSON)
 *
 * Safety:
 *  · Dry run is the default. Nothing is written without `--apply`.
 *  · Only `category`, `secondaryCategories` and `categoryConfidence` can change.
 *    Status (published/hidden), source, dates and the record are never touched,
 *    and no article is deleted.
 *  · Articles the relevance gate would now reject are COUNTED and listed, never
 *    hidden automatically — an editor decides.
 *  · Runs against whatever store the environment configures. Run it against
 *    production only with the owner's approval.
 */
import { writeFileSync } from "node:fs";
import { categorizeArticle } from "@/lib/news/categorize";
import { sportsRelevance } from "@/lib/news/relevance";
import { listArticles, updateArticleCategory } from "@/lib/news/store";
import type { NewsArticle } from "@/lib/news/types";

export interface CategoryChange {
  id: string;
  title: string;
  from: string;
  to: string;
  fromConfidence: number;
  toConfidence: number;
  secondaryCategories: string[];
}

export interface RecategorizePlan {
  total: number;
  unchanged: number;
  changes: CategoryChange[];
  /** published articles the relevance gate would reject today (report only) */
  relevanceRejects: { id: string; title: string }[];
}

/** Pure: compute what the current rules would store for each article. */
export function planRecategorization(articles: NewsArticle[]): RecategorizePlan {
  const plan: RecategorizePlan = { total: articles.length, unchanged: 0, changes: [], relevanceRejects: [] };
  for (const a of articles) {
    const next = categorizeArticle(a.title, a.description);
    const same =
      next.primary === a.category &&
      next.confidence === a.categoryConfidence &&
      JSON.stringify(next.secondary) === JSON.stringify(a.secondaryCategories ?? []);
    if (same) plan.unchanged++;
    else {
      plan.changes.push({
        id: a.id,
        title: a.title,
        from: a.category,
        to: next.primary,
        fromConfidence: a.categoryConfidence,
        toConfidence: next.confidence,
        secondaryCategories: next.secondary,
      });
    }
    if (a.status === "published" && sportsRelevance(a.title, a.description) === "reject") {
      plan.relevanceRejects.push({ id: a.id, title: a.title });
    }
  }
  return plan;
}

async function loadAll(): Promise<NewsArticle[]> {
  const all: NewsArticle[] = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const page = await listArticles({ includeNonPublished: true, limit: pageSize, offset });
    all.push(...page.items);
    if (page.items.length < pageSize || all.length >= page.total) break;
  }
  return all;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const reportArg = process.argv.find((a) => a.startsWith("--report="));
  const articles = await loadAll();
  const plan = planRecategorization(articles);

  console.log(`articles scanned : ${plan.total}`);
  console.log(`unchanged        : ${plan.unchanged}`);
  console.log(`would change     : ${plan.changes.length}`);
  console.log(`relevance rejects (published, report only): ${plan.relevanceRejects.length}`);
  for (const c of plan.changes.slice(0, 50)) {
    console.log(`  ${c.from} (${c.fromConfidence}) → ${c.to} (${c.toConfidence})  ${c.title.slice(0, 90)}`);
  }
  if (plan.changes.length > 50) console.log(`  … ${plan.changes.length - 50} more (use --report=)`);

  if (reportArg) {
    writeFileSync(reportArg.slice("--report=".length), JSON.stringify(plan, null, 2), "utf8");
    console.log(`report written: ${reportArg.slice("--report=".length)}`);
  }

  if (!apply) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to store the changes.");
    return;
  }
  let written = 0;
  for (const c of plan.changes) {
    const ok = await updateArticleCategory(c.id, {
      category: c.to,
      secondaryCategories: c.secondaryCategories,
      categoryConfidence: c.toConfidence,
    });
    if (ok) written++;
  }
  console.log(`\nAPPLIED — category fields updated for ${written} of ${plan.changes.length} articles. No article was deleted or hidden.`);
}

if (process.argv[1] && /recategorize-news\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error("recategorize failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
