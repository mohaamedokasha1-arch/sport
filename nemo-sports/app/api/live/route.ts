import { NextResponse } from "next/server";
import { getLiveStates, type LiveState } from "@/lib/live";
import { allMatches } from "@/lib/data";
import { competitionBySlug, teamBySlug } from "@/lib/core-data";
import { demoContentVisible } from "@/lib/site";
import { fixtures } from "@/lib/sdl-gateway";
import { siteDay } from "@/lib/tz";
import type { NormalizedFixture } from "@/packages/sdl/src";
import { isLiveStatus, matchStateOf } from "@/lib/match-state";
import { liveBoard, reconcileResult } from "@/lib/live-board";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RailFixture = {
  id: string;
  slug: string;
  homeName: string;
  awayName: string;
  homeLogoUrl: string | null;
  awayLogoUrl: string | null;
  kickoff: string;
  competition: string;
  compCode: string;
  status: string;
  clock: string | null;
  minute: number | null;
  homeScore: number | null;
  awayScore: number | null;
};

type ProviderLiveState = {
  id: string;
  status: LiveState["status"];
  clock: string | null;
  minute: number | null;
  homeScore: number | null;
  awayScore: number | null;
  events: null;
  changed: null;
  updatedAt: string;
};

const validFixture = (fixture: NormalizedFixture) => Boolean(
  fixture.providerId && (fixture.homeName || fixture.homeProviderId) && (fixture.awayName || fixture.awayProviderId) && fixture.scheduledAt,
);

function railFixture(fixture: NormalizedFixture): RailFixture {
  const code = fixture.competitionProviderId?.toUpperCase() ?? "";
  const clock = ["halftime", "extra_time_halftime"].includes(fixture.status)
    ? "استراحة"
    : fixture.minute !== null && isLiveStatus(fixture.status)
      ? `${fixture.minute}'`
      : fixture.status === "finished"
        ? "انتهت"
        : null;
  return {
    id: fixture.providerId,
    slug: fixture.providerId,
    homeName: fixture.homeName ?? fixture.homeProviderId ?? "الفريق المستضيف",
    awayName: fixture.awayName ?? fixture.awayProviderId ?? "الفريق الضيف",
    homeLogoUrl: fixture.homeLogoUrl ?? null,
    awayLogoUrl: fixture.awayLogoUrl ?? null,
    kickoff: fixture.scheduledAt,
    competition: fixture.competitionName ?? "",
    compCode: code.length <= 5 ? code : "",
    status: fixture.status,
    clock,
    minute: fixture.minute,
    homeScore: fixture.homeScore,
    awayScore: fixture.awayScore,
  };
}

function demoRail(now: number): RailFixture[] {
  const states = getLiveStates(undefined, now);
  return allMatches
    .filter((match) => {
      const state = states[match.id];
      return state.status === "LIVE" || state.status === "HT" || (state.status === "UPCOMING" && siteDay(match.kickoff) === siteDay(now));
    })
    .sort((a, b) => {
      const aLive = ["LIVE", "HT"].includes(states[a.id].status);
      const bLive = ["LIVE", "HT"].includes(states[b.id].status);
      return Number(bLive) - Number(aLive) || +new Date(a.kickoff) - +new Date(b.kickoff);
    })
    .slice(0, 8)
    .map((match) => {
      const state = states[match.id];
      const home = teamBySlug(match.home);
      const away = teamBySlug(match.away);
      const competition = competitionBySlug(match.competition);
      const live = state.status === "LIVE" || state.status === "HT";
      return {
        id: match.id,
        slug: match.slug,
        homeName: home?.name ?? match.home,
        awayName: away?.name ?? match.away,
        homeLogoUrl: null,
        awayLogoUrl: null,
        kickoff: match.kickoff,
        competition: competition?.name ?? "",
        compCode: competition?.code ?? "",
        status: live ? (state.status === "HT" ? "halftime" : "live") : "scheduled",
        clock: live ? state.clock : null,
        // Additive: the language-neutral form of `clock`. `clock` itself is
        // untouched so the existing API contract still holds for any consumer
        // reading the Arabic string.
        clockParts: live ? state.clockParts : null,
        minute: live ? state.minute : null,
        homeScore: live || state.status === "FINISHED" ? state.homeScore : null,
        awayScore: live || state.status === "FINISHED" ? state.awayScore : null,
      };
    });
}

/**
 * The rail reads the SAME live board as /live and the homepage (every public
 * sport, football first). It used to ask the football live feed only, so it
 * said «لا توجد مباراة جارية الآن» while basketball/tennis matches were live.
 */
async function realRail(now: number): Promise<{ matches: RailFixture[]; mode: "live" | "upcoming" | "empty" | "unavailable"; updatedAt: string; liveTotal: number }> {
  const board = await liveBoard(undefined, now);
  const live = board.live.filter(validFixture);
  if (live.length > 0) {
    return { matches: live.slice(0, 8).map(railFixture), mode: "live", updatedAt: board.fetchedAt ?? new Date(now).toISOString(), liveTotal: board.total };
  }

  // Nothing in play: today's next football kickoffs (football is the site's
  // primary sport), reconciled with the board so a stale "scheduled" never
  // shows up as upcoming.
  const fixtureResult = await fixtures({ sport: "football" });
  const allFixtures = fixtureResult.ok && fixtureResult.source === "provider"
    ? reconcileResult(fixtureResult, board.boards, now).filter(validFixture)
    : [];
  const upcoming = allFixtures
    .filter((fixture) => matchStateOf(fixture.status, fixture.scheduledAt, now) === "upcoming" && +new Date(fixture.scheduledAt) > now && siteDay(fixture.scheduledAt) === siteDay(now))
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))
    .slice(0, 4);
  if (upcoming.length > 0) {
    return { matches: upcoming.map(railFixture), mode: "upcoming", updatedAt: fixtureResult.ok ? fixtureResult.fetchedAt : new Date(now).toISOString(), liveTotal: 0 };
  }

  const isDataAvailable = board.ok || (fixtureResult.ok && fixtureResult.source === "provider");
  return {
    matches: [],
    mode: isDataAvailable ? "empty" : "unavailable",
    updatedAt: new Date(now).toISOString(),
    liveTotal: 0,
  };
}

function demoStates(ids?: string[]): Record<string, LiveState> {
  const states = getLiveStates();
  if (!ids?.length) return states;
  return Object.fromEntries(ids.filter((id) => id in states).map((id) => [id, states[id]]));
}

/** Public live snapshot. In demo builds only, the isolated demo engine is used. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ids = searchParams.get("ids")?.split(",").filter(Boolean);
  const scope = searchParams.get("scope");
  const now = Date.now();

  if (scope === "rail") {
    if (demoContentVisible()) {
      return NextResponse.json(
        { matches: demoRail(now), mode: "preview", updatedAt: new Date(now).toISOString() },
        { headers: { "cache-control": "no-store" } },
      );
    }
    const result = await realRail(now);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  }

  if (demoContentVisible()) {
    return NextResponse.json(demoStates(ids), { headers: { "cache-control": "no-store" } });
  }

  // Same board as every other live surface — every public sport, so a
  // basketball/tennis/cricket match page also receives live updates.
  const board = await liveBoard(undefined, now);
  if (!board.ok) {
    return NextResponse.json({}, { headers: { "cache-control": "no-store" } });
  }

  const data: Record<string, ProviderLiveState> = {};
  for (const fixture of board.live.filter(validFixture)) {
    const mappedStatus: LiveState["status"] = ["halftime", "extra_time_halftime"].includes(fixture.status) ? "HT"
      : ["live", "extra_time", "penalty_shootout"].includes(fixture.status) ? "LIVE"
        : ["finished", "walkover", "awarded"].includes(fixture.status) ? "FINISHED"
          : fixture.status === "postponed" ? "POSTPONED"
            : fixture.status === "cancelled" ? "CANCELLED"
              : fixture.status === "suspended" || fixture.status === "abandoned" ? "SUSPENDED"
                : "UPCOMING";
    const clock = ["halftime", "extra_time_halftime"].includes(fixture.status)
      ? "استراحة"
      : fixture.status === "finished" || fixture.status === "walkover" || fixture.status === "awarded"
        ? "انتهت"
        : fixture.minute === null ? null : `${fixture.minute}'`;
    data[fixture.providerId] = {
      id: fixture.providerId,
      status: mappedStatus,
      clock,
      minute: fixture.minute,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
      // The legacy route does not fetch a match timeline or compare against a
      // previous snapshot. Null is explicit rather than a false empty/unchanged claim.
      events: null,
      changed: null,
      updatedAt: board.fetchedAt ?? new Date(now).toISOString(),
    };
  }
  return NextResponse.json(ids?.length ? Object.fromEntries(ids.filter((id) => id in data).map((id) => [id, data[id]])) : data, {
    headers: { "cache-control": board.stale ? "no-store" : "public, max-age=5, stale-while-revalidate=30" },
  });
}
