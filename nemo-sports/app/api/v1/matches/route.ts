import { validateMatchQuery } from "@/lib/match-query";
import { filterProviderMatches } from "@/lib/provider-match-filter";
import { NextResponse } from "next/server";
import { fixtures, fixturesForCairoDate, matchEvents, matchDetail } from "@/lib/sdl-gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/matches?sport=football&date=YYYY-MM-DD&competition=<providerId>
 * GET /api/v1/matches?events=<providerMatchId>
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const error = validateMatchQuery(params);
  if (error) return NextResponse.json({ ok: false, error: { code: "invalid_input", message: error }, data: [] }, { status: 400 });
  const eventsFor = params.get("events");

  if (eventsFor) {
    const match = await matchDetail(params.get("sport") ?? "football", eventsFor);
    if (!match.ok) return NextResponse.json({ ok: false, data: [] }, { status: 503 });
    const result = await matchEvents(match.data.providerId, match.provider);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: { code: result.error.kind, message: result.error.message }, data: [] }, { status: 503 });
    }
    return NextResponse.json({ ok: true, data: result.data, meta: { provider: result.provider, source: result.source, stale: result.stale } });
  }

  const input = {
    sport: params.get("sport") ?? "football",
    date: params.get("date") ?? undefined,
    competitionProviderId: params.get("competition") ?? undefined,
  };
  const result = input.date ? await fixturesForCairoDate({ ...input, date: input.date }) : await fixtures(input);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: { code: result.error.kind, message: result.error.message, dataType: result.error.dataType }, data: [], meta: { attempts: result.error.attempts } },
      { status: 503 },
    );
  }

  const data = filterProviderMatches(result.data, { date: params.get("date") ?? "all", team: params.get("team") ?? undefined, status: params.get("status") ?? undefined });
  return NextResponse.json({
    ok: true,
    data,
    meta: { count: data.length, provider: result.provider, source: result.source, fromCache: result.fromCache, degraded: result.degraded, stale: result.stale, fetchedAt: result.fetchedAt },
  });
}
