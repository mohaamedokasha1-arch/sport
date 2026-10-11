/**
 * Competition coverage report generator.
 *
 *   npx tsx scripts/report-competition-coverage.ts [out.json]
 *
 * Writes the machine-readable coverage inventory produced by
 * lib/competition-sync.ts: what NEMO actually covers, next to what the
 * providers list but the site has not mapped yet. Every capability flag in the
 * output is either a verified fact or null — never a guess.
 *
 * Exit codes: 0 = written, 2 = the inventory could not be built.
 */

import { writeFileSync } from "node:fs";
import { competitionCoverage } from "../lib/competition-sync";

async function main(): Promise<void> {
  const out = process.argv[2] ?? "docs/competition-coverage.json";
  const coverage = await competitionCoverage();
  writeFileSync(out, JSON.stringify(coverage, null, 2) + "\n");

  console.log(
    [
      `[coverage] ${coverage.entries.length} competitions → ${out}`,
      `  canonical (has a public page): ${coverage.counts.canonical}`,
      `  discovered (catalog only):     ${coverage.counts.discovered}`,
      `  by sport:                      ${JSON.stringify(coverage.bySport)}`,
      `  catalog-capable providers:     ${coverage.catalogProviders
        .filter((p) => p.capable)
        .map((p) => p.provider)
        .join(", ") || "none configured"}`,
    ].join("\n"),
  );
}

main().catch((err: unknown) => {
  console.error("[coverage] failed:", err instanceof Error ? err.message : err);
  process.exitCode = 2;
});
