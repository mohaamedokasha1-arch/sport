import { ALL_SPORTS, validateMatchQuery } from "@/lib/match-query";
import { NextResponse } from "next/server";
import { LIVE_SPORT_SLUGS, liveBoard } from "@/lib/live-board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/live?sport=football        (default — unchanged for API clients)
 * GET /api/v1/live?sport=all             (every public sport — the /live scope)
 * ─────────────────────────────────────────────────────────────────────────────
 * In-play matches from the site-wide live board (lib/live-board.ts), i.e. the
 * same reconciled data the homepage, /live and /matches count. `meta.scope`
 * states exactly which sports the count covers, so a client comparing this
 * endpoint with a page can compare like with like.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const error = validateMatchQuery(params);
  if (error) return NextResponse.json({ ok: false, error: { code: "invalid_input", message: error }, data: [] }, { status: 400 });
  const sport = params.get("sport") ?? "football";
  const scope = sport === ALL_SPORTS ? [...LIVE_SPORT_SLUGS] : [sport];
  const board = await liveBoard(scope);

  if (!board.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "all_providers_failed",
          message: "No live source answered for the requested scope",
          dataType: "live_matches",
        },
        data: [],
        meta: { sport, scope, failedSports: board.failedSports },
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      data: board.live,
      meta: {
        sport,
        scope,
        count: board.total,
        bySport: board.bySport,
        complete: board.complete,
        failedSports: board.failedSports,
        provider: board.providers.length === 1 ? board.providers[0] : board.providers.length ? "mixed" : null,
        providers: board.providers,
        source: "provider",
        stale: board.stale,
        degraded: board.degraded,
        // Oldest snapshot used — the honest "data as of" for the whole answer.
        fetchedAt: board.fetchedAt,
      },
    },
    { headers: { "cache-control": board.stale || !board.complete ? "no-store" : "public, max-age=5, stale-while-revalidate=30" } },
  );
}
