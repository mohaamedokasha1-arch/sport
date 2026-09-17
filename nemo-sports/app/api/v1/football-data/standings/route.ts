import { NextResponse } from "next/server";
import { DATA_UNAVAILABLE_MESSAGE, footballStandings } from "@/lib/football-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/football-data/standings?competition=PL
 * ─────────────────────────────────────────────────
 * League table for one competition, served from the SDL cache when warm.
 *
 * `competition` accepts the official code (`PL`), the slug the rest of the
 * platform uses (`english-premier-league`) or the competition name. The API key
 * is never part of the request or the response — it lives in a server-side
 * environment variable and is only ever written into an upstream header.
 *
 * Failure is a 503 with the fixed message "Data temporarily unavailable" and an
 * empty array. No placeholder table is ever returned.
 */
export async function GET(req: Request) {
  const competition = new URL(req.url).searchParams.get("competition") ?? "PL";
  const result = await footballStandings(competition);

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
        // A hit may be replayed by the CDN; a stale (degraded) payload may not.
        "cache-control": result.source.stale ? "no-store" : "public, max-age=60, stale-while-revalidate=600",
        "x-nemo-cache": result.source.fromCache ? "HIT" : "MISS",
        "x-nemo-provider": result.source.provider,
        "x-nemo-fetched-at": result.source.fetchedAt,
      },
    },
  );
}
