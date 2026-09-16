/**
 * Ingestion runner (cron / manual).
 *
 *   DATABASE_URL=postgres://... npx tsx scripts/ingest.ts [sport]
 *
 * Exit codes: 0 = data landed, 2 = refused (no database, demo mode, provider
 * failure). Cron should alert on 2 but not treat it as a crash loop.
 */

import { ingestSport } from "../lib/sdl-ingest";

async function main(): Promise<void> {
  const sport = process.argv[2] ?? "football";
  const report = await ingestSport(sport);

  if (!report.ok) {
    console.error(`[ingest] refused (${report.reason}): ${report.detail}`);
    process.exitCode = 2;
    return;
  }

  const e = report.entities;
  console.log(
    [
      `[ingest] ${report.sport} via ${report.provider} in ${report.ms}ms`,
      `  competitions: ${e.competitions.resolved} mapped, ${e.competitions.created} created`,
      `  teams:        ${e.teams.resolved} mapped, ${e.teams.fetchedFromProvider} fetched, ${e.teams.created} need review`,
      `  matches:      ${e.matches.upserted} upserted, ${e.matches.created} new, ${e.matches.conflicts} conflicts`,
    ].join("\n"),
  );
}

main().catch((err: unknown) => {
  console.error("[ingest] failed:", err instanceof Error ? err.message : err);
  process.exitCode = 2;
});
