import { NextResponse } from "next/server";
import { liveMatches } from "@/lib/sdl-gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/live?sport=football
 * ────────────────────────────────
 * In-play matches straight from the Sports Data Layer. The response never
 * contains a provider payload: everything is canonical, and `meta` states
 * where the data came from so the client can degrade honestly.
 */
export async function GET(req: Request) {
  const sport = new URL(req.url).searchParams.get("sport") ?? "football";
  const result = await liveMatches(sport);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: result.error.kind, message: result.error.message, dataType: result.error.dataType },
        data: [],
        meta: { sport, attempts: result.error.attempts },
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      data: result.data,
      meta: {
        sport,
        count: result.data.length,
        provider: result.provider,
        source: result.source,
        fromCache: result.fromCache,
        stale: result.stale,
        degraded: result.degraded,
        fetchedAt: result.fetchedAt,
      },
    },
    { headers: { "cache-control": result.stale ? "no-store" : "public, max-age=5, stale-while-revalidate=30" } },
  );
}
