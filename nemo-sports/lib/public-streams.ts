/**
 * NEMO Sports · public live-stream cards
 * ───────────────────────────────────────────────────────────────────
 * Joins every PUBLIC stream (published / live, official domain — enforced by
 * listMatchStreams(false)) with its match, so /live can show teams, logos,
 * score, status, kickoff and competition next to the player.
 *
 * Match resolution order: admin-managed match (published) → provider match
 * (only when it has a real identity). A stream whose match cannot be
 * resolved still renders with its registered alias names — never a
 * placeholder team.
 */

import { listMatchStreams, streamPhase, type MatchStreamSource, type MatchStreamPhase } from "@/lib/match-streams";
import { getAdminMatchBySlug, adminMatchToFixture } from "@/lib/admin-matches";
import { matchDetail, hasMatchIdentity } from "@/lib/sdl-gateway";
import type { NormalizedFixture } from "@/packages/sdl/src";

export interface PublicStreamCard {
  stream: MatchStreamSource;
  fixture: NormalizedFixture | null;
  home: string;
  away: string;
  competition: string;
  kickoff: string | null;
  status: string;
  phase: MatchStreamPhase;
}

export async function publicStreamCards(limit = 24): Promise<PublicStreamCard[]> {
  const streams = (await listMatchStreams(false)).slice(0, limit);
  const cards: PublicStreamCard[] = [];

  for (const stream of streams) {
    const slug = stream.matchSlug || stream.slugs[0] || "";
    let fixture: NormalizedFixture | null = null;

    if (slug) {
      const adminMatch = await getAdminMatchBySlug(slug).catch(() => null);
      if (adminMatch) {
        if (adminMatch.isPublished) fixture = adminMatchToFixture(adminMatch);
      } else {
        const res = await matchDetail("football", slug).catch(() => null);
        if (res && res.ok && res.source === "provider" && hasMatchIdentity(res.data)) fixture = res.data;
      }
    }

    const status = fixture?.status ?? "scheduled";
    cards.push({
      stream,
      fixture,
      home: fixture?.homeName ?? stream.homeName ?? stream.homeAliases[0] ?? "—",
      away: fixture?.awayName ?? stream.awayName ?? stream.awayAliases[0] ?? "—",
      competition: fixture?.competitionName ?? stream.competitionName ?? "",
      kickoff: fixture?.scheduledAt ?? stream.kickoffAt,
      status,
      phase: streamPhase(status),
    });
  }
  return cards;
}
