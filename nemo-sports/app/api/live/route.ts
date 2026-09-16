import { NextResponse } from "next/server";
import { getLiveStates, type LiveState } from "@/lib/live";
import { allMatches } from "@/lib/data";
import { competitionBySlug } from "@/lib/core-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/live
 *   ?ids=M101,M102   → subset of matches
 *   ?scope=rail      → compact payload for the header score rail
 *
 * The scoreboard state is derived from the clock, so every replica returns
 * the same answer and no write path is needed.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ids = searchParams.get("ids")?.split(",").filter(Boolean);
  const scope = searchParams.get("scope");

  const states: Record<string, LiveState> = getLiveStates();

  if (scope === "rail") {
    const wanted = allMatches
      .filter((m) => {
        const s = states[m.id];
        const live = s.status === "LIVE" || s.status === "HT";
        const soon = s.status === "UPCOMING" && +new Date(m.kickoff) - Date.now() < 3 * 3600 * 1000;
        const done = s.status === "FINISHED" && Date.now() - +new Date(m.kickoff) < 4 * 3600 * 1000;
        return live || soon || done;
      })
      .sort((a, b) => {
        const rank = (id: string) =>
          states[id].status === "LIVE" ? 0 : states[id].status === "HT" ? 1 : states[id].status === "FINISHED" ? 2 : 3;
        return rank(a.id) - rank(b.id) || +new Date(a.kickoff) - +new Date(b.kickoff);
      })
      .slice(0, 14);

    return NextResponse.json({
      matches: wanted.map((m) => ({
        id: m.id,
        slug: m.slug,
        home: m.home,
        away: m.away,
        kickoff: m.kickoff,
        competition: m.competition,
        compCode: competitionBySlug(m.competition)?.code ?? "",
        state: states[m.id],
      })),
      updatedAt: new Date().toISOString(),
    });
  }

  if (ids?.length) {
    const out: Record<string, LiveState> = {};
    for (const id of ids) if (states[id]) out[id] = states[id];
    return NextResponse.json(out);
  }

  return NextResponse.json(states);
}
