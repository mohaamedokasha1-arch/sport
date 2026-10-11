/**
 * NEMO Sports · the site-wide live board (server)
 * ───────────────────────────────────────────────
 * The ONE place that answers "what is being played right now?". The homepage
 * live section, /live, the score rail (/api/live), /api/v1/live and the live
 * bucket of /matches all read this board, so a live count can only differ
 * between two surfaces when they were asked for a different sport scope.
 *
 * Per sport it reads the live view and the full fixtures view (both cached in
 * the SDL; the SportScore adapter shares one upstream snapshot between them)
 * and reconciles them with lib/live-reconcile.ts.
 */

import { fixtures, hasMatchIdentity, liveMatches, type GatewayResult } from "@/lib/sdl-gateway";
import { PUBLIC_SPORTS } from "@/lib/core-data";
import {
  buildSportBoard,
  reconcileFixtures,
  summarizeBoards,
  type LiveBoardSummary,
  type SnapshotInput,
  type SportBoard,
} from "@/lib/live-reconcile";
import type { NormalizedFixture } from "@/packages/sdl/src";

export type { LiveBoardSummary, SportBoard } from "@/lib/live-reconcile";

/** Every sport the public site lists, in display order (football first). */
export const LIVE_SPORT_SLUGS: string[] = PUBLIC_SPORTS.map((sport) => sport.slug);

/** Arabic sport names for scope labels. */
export const SPORT_NAME_AR: Record<string, string> = Object.fromEntries(PUBLIC_SPORTS.map((sport) => [sport.slug, sport.name]));

/** `?sport=` → the sports a live surface covers. Unknown or empty → all public sports. */
export function liveScope(sport?: string | null): string[] {
  return sport && LIVE_SPORT_SLUGS.includes(sport) ? [sport] : [...LIVE_SPORT_SLUGS];
}

/** Arabic label for a scope: "كل الرياضات" or the sport's name. */
export function scopeLabelAr(sports: string[]): string {
  if (sports.length === 1) return SPORT_NAME_AR[sports[0]] ?? sports[0];
  return sports.length === LIVE_SPORT_SLUGS.length ? "كل الرياضات" : sports.map((s) => SPORT_NAME_AR[s] ?? s).join("، ");
}

export function snapshotOf(result: GatewayResult<NormalizedFixture[]> | null): SnapshotInput {
  if (!result) return { ok: false, error: "request failed" };
  if (!result.ok) return { ok: false, error: result.error.message };
  // Offline preview data is never presented as live data.
  if (result.source !== "provider") return { ok: false, error: "preview data is not live data" };
  // The gateway falls back to editorial records (provider "admin") when every
  // provider failed. That keeps operator-entered matches visible, but it is NOT
  // an answer about what is live: treating it as one rendered «لا توجد مباريات
  // مباشرة» during an outage. Editorial live matches are shown by /live itself.
  if (result.provider === "admin") return { ok: false, error: "live source unavailable (editorial records only)" };
  return {
    ok: true,
    provider: result.provider,
    fetchedAt: result.fetchedAt,
    stale: result.stale,
    degraded: result.degraded,
    fromCache: result.fromCache,
    fixtures: result.data.filter(hasMatchIdentity),
  };
}

export async function sportBoard(sport: string, now = Date.now()): Promise<SportBoard> {
  const [live, feed] = await Promise.all([
    liveMatches(sport).catch(() => null),
    fixtures({ sport }).catch(() => null),
  ]);
  return buildSportBoard(sport, snapshotOf(live), snapshotOf(feed), now);
}

/** The live board for a scope (default: every public sport). */
export async function liveBoard(sports: string[] = LIVE_SPORT_SLUGS, now = Date.now()): Promise<LiveBoardSummary> {
  const boards = await Promise.all(sports.map((sport) => sportBoard(sport, now)));
  return summarizeBoards(boards);
}

/** Reconcile a gateway fixture result against the boards (see reconcileFixtures). */
export function reconcileResult(
  result: GatewayResult<NormalizedFixture[]>,
  boards: SportBoard[],
  now = Date.now(),
): NormalizedFixture[] {
  if (!result.ok) return [];
  return reconcileFixtures(result.data, { fetchedAt: result.fetchedAt, provider: result.provider }, boards, now);
}
