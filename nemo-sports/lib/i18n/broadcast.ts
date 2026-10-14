/**
 * NEMO Sports · localized broadcast wording
 * ────────────────────────────────────────
 * The RULE that decides whether a stream is playable lives in
 * `lib/broadcast-state.ts` and is deliberately untranslated — it is covered by
 * `scripts/verify-consistency.test.ts`. This module only turns an already-made
 * verdict into a label for the visitor's language.
 *
 * Server + client safe (no "use client", no env reads), so both server
 * components and client components can call it.
 */

import type { Locale } from "./locales";
import type { BroadcastState } from "@/lib/broadcast-state";
import type { MatchState } from "@/lib/match-state";

type BadgeKey = `bc.badge.${string}`;
type NoticeKey = `bc.notice.${string}`;

export type BroadcastFacts = { state: BroadcastState; matchState: MatchState | null };

/** Message key for one verdict — resolves through the dictionaries. */
export function broadcastBadgeKey(verdict: Pick<BroadcastFacts, "state" | "matchState">): BadgeKey {
  switch (verdict.state) {
    case "live":
      return "bc.badge.live";
    case "standby":
      return "bc.badge.standby";
    case "ended":
      return "bc.badge.ended";
    case "review":
      return "bc.badge.review";
    case "unpublished":
      return "bc.badge.unpublished";
    case "expired":
      switch (verdict.matchState) {
        case "finished":
          return "bc.badge.matchFinished";
        case "postponed":
          return "bc.badge.postponed";
        case "cancelled":
          return "bc.badge.cancelled";
        case "suspended":
          return "bc.badge.suspended";
        case "abandoned":
          return "bc.badge.abandoned";
        default:
          return "bc.badge.windowClosed";
      }
  }
}

/** Message key for the longer notice under the player. */
export function broadcastNoticeKey(
  notice: string,
  matchState: MatchState | null,
): NoticeKey {
  // The Arabic notice strings are produced by lib/broadcast-state.ts; map them
  // by their match state plus the stream approval half rather than by text so a
  // wording change there cannot silently drop a translation.
  const byState: Record<MatchState, NoticeKey> = {
    upcoming: "bc.notice.standby",
    live: "bc.notice.live",
    unconfirmed: "bc.notice.windowClosed",
    finished: "bc.notice.finished",
    postponed: "bc.notice.postponed",
    cancelled: "bc.notice.cancelled",
    suspended: "bc.notice.suspended",
    abandoned: "bc.notice.abandoned",
  };
  if (/أنهت الإدارة/.test(notice)) return "bc.notice.ended";
  if (/غير منشور/.test(notice)) return "bc.notice.unpublished";
  if (/بانتظار توثيق الحقوق/.test(notice)) return "bc.notice.review";
  if (/يبدأ البث مع انطلاق المباراة/.test(notice)) return "bc.notice.standby";
  if (/بث مباشر الآن/.test(notice)) return "bc.notice.live";
  if (/لا يمكن ربط هذا البث/.test(notice)) return "bc.notice.unlinked";
  if (matchState && byState[matchState]) return byState[matchState];
  return "bc.notice.windowClosed";
}
