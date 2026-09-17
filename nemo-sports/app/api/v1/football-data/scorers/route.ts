import { NextResponse } from "next/server";
import { DATA_UNAVAILABLE_MESSAGE, footballTopScorers } from "@/lib/football-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/football-data/scorers?competition=PL
 * ───────────────────────────────────────────────
 * Top scorers for one competition, cached in the SDL for 30 minutes (the list
 * changes once a week, so polling harder would only spend quota).
 *
 * Scorer data is a paid-tier resource at football-data.org. When the configured
 * key does not include it the upstream answers 403; the SDL reports that as a
 * capability gap and this route answers 503 with the fixed "Data temporarily
 * unavailable" message. Names are never invented to fill the gap.
 */
export async function GET(req: Request) {
  const competition = new URL(req.url).searchParams.get("competition") ?? "PL";
  const result = await footballTopScorers(competition);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        data: [],
        error: { code: result.error.code, message: DATA_UNAVAILABLE_MESSAGE, detail: result.error.detail },
        meta: { competition, attempts: result.error.attempts },
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      data: result.data,
      meta: {
        competition,
        count: result.data.length,
        provider: result.source.provider,
        fromCache: result.source.fromCache,
        stale: result.source.stale,
        degraded: result.source.stale,
        fetchedAt: result.source.fetchedAt,
        cache: { ttlSeconds: result.source.ttlSeconds },
        attribution: result.source.attribution,
      },
    },
    {
      headers: {
        "cache-control": result.source.stale ? "no-store" : "public, max-age=300, stale-while-revalidate=1800",
        "x-nemo-cache": result.source.fromCache ? "HIT" : "MISS",
        "x-nemo-provider": result.source.provider,
        "x-nemo-fetched-at": result.source.fetchedAt,
      },
    },
  );
}
