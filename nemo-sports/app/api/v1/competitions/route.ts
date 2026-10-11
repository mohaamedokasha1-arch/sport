import { NextResponse } from "next/server";
import { competitionCoverage } from "@/lib/competition-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/competitions — the machine-readable competition coverage report.
 * ────────────────────────────────────────────────────────────────────────────
 * Read-only and public: it describes which competitions NEMO covers and what
 * each provider's catalog contains. It never triggers a provider call, so it
 * cannot spend quota and needs no token.
 *
 * The `status` field is the important one:
 *   · "canonical"  — a hand-verified competition with a working public page
 *                    (`path` is set).
 *   · "discovered" — present in a provider's catalog but NOT mapped to a page
 *                    (`path` is null). Listing it here is the point: it makes
 *                    the coverage gap visible instead of invisible.
 *
 * `capabilities` follows the same rule everywhere in this codebase: `listed`
 * means the provider's index contains the competition; every other flag is
 * null until a real response has been observed. A catalog listing is never
 * presented as live coverage.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const sport = params.get("sport");
  const status = params.get("status");

  const coverage = await competitionCoverage();
  let entries = coverage.entries;
  if (sport) entries = entries.filter((e) => e.sport === sport);
  if (status === "canonical" || status === "discovered") entries = entries.filter((e) => e.status === status);

  return NextResponse.json(
    {
      ok: true,
      generatedAt: coverage.generatedAt,
      counts: coverage.counts,
      bySport: coverage.bySport,
      catalogProviders: coverage.catalogProviders,
      data: entries,
    },
    { headers: { "cache-control": "public, max-age=900, stale-while-revalidate=3600" } },
  );
}
