import { NextResponse } from "next/server";
import { fixtures, matchEvents } from "@/lib/sdl-gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/matches?sport=football&date=YYYY-MM-DD&competition=<providerId>
 * GET /api/v1/matches?events=<providerMatchId>
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const eventsFor = params.get("events");

  if (eventsFor) {
    const result = await matchEvents(eventsFor);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: { code: result.error.kind, message: result.error.message }, data: [] }, { status: 503 });
    }
    return NextResponse.json({ ok: true, data: result.data, meta: { provider: result.provider, source: result.source, stale: result.stale } });
  }

  const result = await fixtures({
    sport: params.get("sport") ?? "football",
    date: params.get("date") ?? undefined,
    competitionProviderId: params.get("competition") ?? undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: { code: result.error.kind, message: result.error.message, dataType: result.error.dataType }, data: [], meta: { attempts: result.error.attempts } },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    data: result.data,
    meta: { count: result.data.length, provider: result.provider, source: result.source, fromCache: result.fromCache, stale: result.stale, fetchedAt: result.fetchedAt },
  });
}
