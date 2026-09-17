import { NextResponse } from "next/server";
import { DATA_UNAVAILABLE_MESSAGE, dayKey, footballMatches } from "@/lib/football-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/football-data/matches?date=YYYY-MM-DD&competition=PL
 * ───────────────────────────────────────────────────────────────
 * The day's fixtures and results (default: today, UTC — the calendar the
 * provider's `date` filter uses). With `competition` the list is scoped to one
 * competition instead of the monitored major leagues.
 *
 * The payload is canonical: no football-data.org field shape survives, and the
 * provider token is never echoed. On failure: 503 + "Data temporarily
 * unavailable" + an empty list — never invented fixtures or scores.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const date = params.get("date") ?? dayKey();
  const competition = params.get("competition") ?? undefined;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { ok: false, data: [], error: { code: "bad_request", message: "date must be YYYY-MM-DD" } },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  const result = await footballMatches({ date, competitionId: competition });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        data: [],
        error: { code: result.error.code, message: DATA_UNAVAILABLE_MESSAGE, detail: result.error.detail },
        meta: { date, competition: competition ?? null, attempts: result.error.attempts },
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const matches = result.data;
  return NextResponse.json(
    {
      ok: true,
      data: matches,
      meta: {
        date,
        competition: competition ?? null,
        count: matches.length,
        live: matches.filter((m) => ["live", "halftime", "extra_time", "penalty_shootout"].includes(m.status)).length,
        finished: matches.filter((m) => m.status === "finished").length,
        scheduled: matches.filter((m) => m.status === "scheduled").length,
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
        "cache-control": result.source.stale ? "no-store" : "public, max-age=60, stale-while-revalidate=300",
        "x-nemo-cache": result.source.fromCache ? "HIT" : "MISS",
        "x-nemo-provider": result.source.provider,
        "x-nemo-fetched-at": result.source.fetchedAt,
      },
    },
  );
}
