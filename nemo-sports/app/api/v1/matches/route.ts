import { ALL_SPORTS, resolveDateParam, validateMatchQuery } from "@/lib/match-query";
import { dateScopeIncludesToday, filterProviderMatches, sortProviderMatches } from "@/lib/provider-match-filter";
import { NextResponse } from "next/server";
import { fixtures, fixturesForCairoDate, hasMatchIdentity, matchEvents, matchDetail, type GatewayResult } from "@/lib/sdl-gateway";
import { LIVE_SPORT_SLUGS, liveBoard, reconcileResult } from "@/lib/live-board";
import type { NormalizedFixture } from "@/packages/sdl/src";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/matches?sport=football&date=YYYY-MM-DD|today|yesterday|tomorrow&competition=<providerId>&status=&team=
 * GET /api/v1/matches?sport=all&date=today      (every public sport — the /matches default scope)
 * GET /api/v1/matches?events=<providerMatchId>
 *
 * `sport` defaults to football (unchanged for API clients). Statuses are
 * reconciled with the site-wide live board whenever the date scope covers
 * today, so `status=live` here matches the live count on /matches and /live
 * for the same sport and date.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const error = validateMatchQuery(params);
  if (error) return NextResponse.json({ ok: false, error: { code: "invalid_input", message: error }, data: [] }, { status: 400 });
  const eventsFor = params.get("events");

  if (eventsFor) {
    const eventSport = params.get("sport");
    const match = await matchDetail(eventSport && eventSport !== ALL_SPORTS ? eventSport : "football", eventsFor);
    if (!match.ok) return NextResponse.json({ ok: false, data: [] }, { status: 503 });
    const result = await matchEvents(match.data.providerId, match.provider, match.data.sport);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: { code: result.error.kind, message: result.error.message }, data: [] }, { status: 503 });
    }
    return NextResponse.json({ ok: true, data: result.data, meta: { provider: result.provider, source: result.source, stale: result.stale } });
  }

  const sport = params.get("sport") ?? "football";
  const scope = sport === ALL_SPORTS ? [...LIVE_SPORT_SLUGS] : [sport];
  const rawDate = params.get("date");
  const date = resolveDateParam(rawDate);
  const competitionProviderId = params.get("competition") ?? undefined;
  const now = Date.now();

  const withToday = rawDate === null ? true : dateScopeIncludesToday(date ?? undefined, now);
  const [results, board] = await Promise.all([
    Promise.all(scope.map((s) => (date ? fixturesForCairoDate({ sport: s, date, competitionProviderId }) : fixtures({ sport: s, competitionProviderId })))),
    withToday ? liveBoard(scope, now) : Promise.resolve(null),
  ]);

  const answered = results.filter((r): r is Extract<GatewayResult<NormalizedFixture[]>, { ok: true }> => r.ok);
  if (answered.length === 0) {
    const first = results[0];
    const failure = first && !first.ok ? first.error : null;
    return NextResponse.json(
      {
        ok: false,
        error: { code: failure?.kind ?? "all_providers_failed", message: failure?.message ?? "No source answered", dataType: failure?.dataType ?? "fixtures" },
        data: [],
        meta: { sport, scope, attempts: failure?.attempts ?? [] },
      },
      { status: 503 },
    );
  }

  const byId = new Map<string, NormalizedFixture>();
  for (const result of answered) {
    const list = board ? reconcileResult(result, board.boards, now) : result.data;
    for (const fixture of list) if (fixture.providerId && hasMatchIdentity(fixture)) byId.set(fixture.providerId, fixture);
  }

  const filter = {
    date: rawDate === null ? "all" : date ?? "all",
    team: params.get("team") ?? undefined,
    status: params.get("status") ?? undefined,
    competition: competitionProviderId,
  };
  // Live matches in scope that kicked off before the requested day (e.g. a
  // 23:30 kickoff still in play) are part of "today".
  if (board) for (const fixture of board.live) if (!byId.has(fixture.providerId)) byId.set(fixture.providerId, fixture);

  const data = sortProviderMatches(filterProviderMatches([...byId.values()], filter, now), now);
  const providers = [...new Set(answered.map((r) => r.provider))];
  return NextResponse.json({
    ok: true,
    data,
    meta: {
      count: data.length,
      sport,
      scope,
      date: date ?? null,
      provider: providers.length === 1 ? providers[0] : "mixed",
      providers,
      source: "provider",
      fromCache: answered.every((r) => r.fromCache),
      degraded: answered.length < results.length || answered.some((r) => r.degraded),
      stale: answered.some((r) => r.stale),
      fetchedAt: answered.map((r) => r.fetchedAt).sort()[0] ?? null,
      liveReconciled: Boolean(board?.ok),
    },
  });
}
