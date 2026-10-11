/**
 * NEMO Sports · quarantine clear non-sports articles that are already published.
 * ──────────────────────────────────────────────────────────────────────────────
 *   npm run news:moderate                    → DRY RUN (default): prints the plan
 *   npm run news:moderate -- --apply         → quarantines the "quarantine" list
 *   npm run news:moderate -- --report=out.json
 *
 * Safety:
 *  · Dry run is the default. Nothing is written without `--apply`.
 *  · Only clear commercial / namesake-company items with NO sports signal are
 *    quarantined (status → hidden). Reason, moderator, time and the previous
 *    status are recorded; no article is deleted, edited or re-categorised.
 *  · Weaker cases (score/profile pages, weak sports context) are listed for an
 *    editor and never changed.
 *  · Runs against whatever store the environment configures. Run it against
 *    production only with the owner's approval.
 */
import { writeFileSync } from "node:fs";
import { AUTO_MODERATOR, moderatePublished } from "@/lib/news/moderation";

async function main() {
  const apply = process.argv.includes("--apply");
  const reportArg = process.argv.find((a) => a.startsWith("--report="));
  const result = await moderatePublished({ apply, by: `${AUTO_MODERATOR}:manual`, limit: 5000 });
  console.log(`published articles scanned : ${result.scanned}`);
  console.log(`quarantine (clear non-sports): ${result.quarantine.length}`);
  for (const q of result.quarantine) console.log(`  ✗ [${q.reason}] ${q.category} · ${q.title.slice(0, 100)}`);
  console.log(`editor review only (unchanged): ${result.review.length}`);
  for (const r of result.review.slice(0, 50)) console.log(`  ? [${r.reason}] ${r.category} · ${r.title.slice(0, 100)}`);
  if (reportArg) {
    writeFileSync(reportArg.slice("--report=".length), JSON.stringify(result, null, 2), "utf8");
    console.log(`report written: ${reportArg.slice("--report=".length)}`);
  }
  console.log(apply ? `\nAPPLIED — ${result.applied} article(s) quarantined (status hidden, provenance recorded). Nothing deleted.` : "\nDRY RUN — nothing written. Re-run with --apply to quarantine the list above.");
}

if (process.argv[1] && /moderate-news\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error("moderation failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
