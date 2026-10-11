/**
 * NEMO Sports · public live-stream cards
 * ───────────────────────────────────────────────────────────────────
 * Joins every APPROVED stream (operator approval + rights evidence, official
 * link — enforced by listMatchStreams(false)) with its match, and judges it
 * with the broadcast lifecycle (lib/broadcast-state.ts).
 *
 * Only PLAYABLE broadcasts (match in play, or still ahead of / inside its
 * broadcast window) become cards. /live used to render every published stream,
 * so streams of matches that had ended — or whose state was unconfirmed —
 * stayed at the top of the live page as «انتهت المباراة» blocks and were
 * counted as «بث متاح».
 *
 * Match resolution order: admin-managed match (published) → provider match
 * (only when it has a real identity, in the stream's resolved sport).
 */

import { broadcastFor, listMatchStreams, type MatchStreamSource } from "@/lib/match-streams";
import { getAdminMatchBySlug, adminMatchToFixture } from "@/lib/admin-matches";
import { matchDetail, hasMatchIdentity, sportForMatchId } from "@/lib/sdl-gateway";
import type { BroadcastVerdict } from "@/lib/broadcast-state";
import type { MatchStreamPhase } from "@/lib/match-streams";
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
  verdict: BroadcastVerdict;
}

/** Resolve the match a stream is bound to (never throws). */
export async function resolveStreamFixture(stream: MatchStreamSource): Promise<NormalizedFixture | null> {
  const slug = stream.matchSlug || stream.slugs[0] || "";
  if (!slug) return null;
  const adminMatch = await getAdminMatchBySlug(slug).catch(() => null);
  if (adminMatch) return adminMatch.isPublished ? adminMatchToFixture(adminMatch) : null;
  const sport = (await sportForMatchId(slug).catch(() => null)) ?? "football";
  const res = await matchDetail(sport, slug).catch(() => null);
  return res && res.ok && res.source === "provider" && hasMatchIdentity(res.data) ? res.data : null;
}

/** Every approved stream with its verdict — playable or not (Watch Guide, admin). */
export async function judgedStreams(limit = 24, now = Date.now()): Promise<PublicStreamCard[]> {
  const streams = (await listMatchStreams(false)).slice(0, limit);
  const cards: PublicStreamCard[] = [];
  for (const stream of streams) {
    const fixture = await resolveStreamFixture(stream);
    const verdict = broadcastFor(
      stream,
      fixture ? { status: fixture.status, scheduledAt: fixture.scheduledAt, sport: fixture.sport } : null,
      now,
    );
    if (!verdict) continue;
    cards.push({
      stream,
      fixture,
      home: fixture?.homeName ?? (stream.homeName || stream.homeAliases[0] || "—"),
      away: fixture?.awayName ?? (stream.awayName || stream.awayAliases[0] || "—"),
      competition: fixture?.competitionName ?? stream.competitionName ?? "",
      kickoff: fixture?.scheduledAt ?? stream.kickoffAt,
      status: fixture?.status ?? "scheduled",
      phase: verdict.state === "live" ? "live" : verdict.state === "standby" ? "upcoming" : "inactive",
      verdict,
    });
  }
  return cards;
}

/** Only the broadcasts that may play now or are about to (the /live player section). */
export async function publicStreamCards(limit = 24, now = Date.now()): Promise<PublicStreamCard[]> {
  return (await judgedStreams(limit, now)).filter((card) => card.verdict.playable);
}
