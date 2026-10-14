/**
 * Coverage comparison report — CLI.
 * ───────────────────────────────────────────────────────────────────
 * Usage:
 *   npm run coverage:report -- --from 2026-10-15 --to 2026-10-17 [--sport football|all]
 *   npm run coverage:report -- --date 2026-10-15 --reference ./reference-2026-10-15.json [--out report.json]
 *
 * The reference file is a JSON array of fixture objects in NormalizedFixture
 * shape (extra fields venueCity/broadcastChannel/referee are honoured).
 * Supply one ONLY from a source you are licensed/authorised to use.
 *
 * Kooora note (task §2): kooora.com publishes no verifiable public API and
 * this tool does NOT scrape it. To compare against Kooora an operator must
 * supply a reference file they are authorised to use; without `--reference`
 * the output is a provider-coverage/discovery report only and explicitly
 * states that no Kooora comparison was performed.
 */
import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { compareCoverage, discoveryDates, runFixtureDiscovery, type ReferenceFixture } from "@/lib/fixture-discovery";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const date = arg("date");
  const dates = date
    ? discoveryDates({ from: date, to: date })
    : discoveryDates({ from: arg("from"), to: arg("to"), daysBefore: Number(arg("daysBefore") ?? 1) || 0, daysAfter: Number(arg("daysAfter") ?? 2) || 0 });
  const sport = arg("sport") ?? "football";
  const run = await runFixtureDiscovery({ dates, sports: sport === "all" ? ["football", "basketball", "tennis", "cricket"] : [sport] });

  const referencePath = arg("reference");
  let comparison = null;
  let referenceNote = "no reference file supplied — NO Kooora (or any external-site) comparison was performed; this is provider coverage only";
  if (referencePath) {
    const reference = JSON.parse(await readFile(referencePath, "utf8")) as ReferenceFixture[];
    if (!Array.isArray(reference)) throw new Error("reference file must be a JSON array of fixtures");
    comparison = compareCoverage(reference, run.fixtures.map((f) => f.fixture), {
      date: dates.length === 1 ? dates[0] : undefined,
      referenceSource: `file:${referencePath}`,
    });
    referenceNote = `reference compared from authorised file ${referencePath} (${reference.length} fixtures)`;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    dates, sports: run.sports,
    discovery: {
      startedAt: run.startedAt, finishedAt: run.finishedAt,
      fetched: run.fetched, uniqueFixtures: run.unique, duplicatesMerged: run.duplicates,
      conflicts: run.conflicts, perProvider: run.perProvider, errors: run.errors,
      competitionsSeen: run.competitions.length,
      newCompetitionsDiscovered: run.newCompetitions,
      allCompetitions: run.competitions,
    },
    referenceNote,
    comparison,
    limitations: [
      "Coverage is exactly what the registered SDL providers returned for these dates — not a claim of worldwide completeness.",
      "Kooora is not scraped and has no verified public API in this project; comparison requires an authorised reference file (--reference).",
      "A discovered competition is evidence fixtures exist; it does not publish a page or claim standings/players until those are separately verified.",
    ],
  };
  const text = JSON.stringify(report, null, 2);
  const out = arg("out");
  if (out) writeFileSync(out, text + "\n");
  console.log(text);
  // A run where every provider failed must not look successful to a scheduler.
  if (run.perProvider.length === 0) process.exitCode = 2;
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
