/**
 * NEMO Sports · broadcast lifecycle (pure, client-safe)
 * ──────────────────────────────────────────────────────────────────────────
 * A match and its broadcast are two different things and are judged by two
 * different authorities:
 *
 *   · MATCH state comes from fixture data only (lib/match-state.ts).
 *   · BROADCAST approval comes from the stream registry only: an operator
 *     approval status AND documented rights evidence (rights holder + a
 *     licence reference) recorded for that one stream.
 *
 * Production (2026-10-11) conflated them: an old fixture still stored as
 * "scheduled" (state "unconfirmed") had its stream panel say «انتهت المباراة»
 * — a finished-match claim with no evidence — while /live kept rendering the
 * same ended streams at the top of the page and still counted them as
 * «بث متاح», and live cards offered «مشاهدة المباراة» for any published
 * stream regardless of the match.
 *
 * Rule: a stream is PLAYABLE only when it is approved, carries rights
 * evidence, has not been ended by an operator, and the match is in play
 * ("live") or still ahead of / inside its broadcast window ("standby").
 * Everything else is never presented as playable, and the notice shown says
 * what we actually know — it only says the match finished when the fixture
 * data says so.
 */

import { matchStateOf, type MatchState } from "@/lib/match-state";

export type BroadcastState =
  /** approved + rights evidence + match in play → the player renders, LIVE badge */
  | "live"
  /** approved + rights evidence + match not started (or inside its window) → player in standby */
  | "standby"
  /** approved, but the match is over / interrupted / unconfirmed or its window passed → never playable */
  | "expired"
  /** an operator ended this broadcast → never playable */
  | "ended"
  /** published without rights evidence → never public, shown to admins as "needs review" */
  | "review"
  /** draft / disabled / invalid link → never public */
  | "unpublished";

/** Registry statuses that mean "an operator approved this stream for the public". */
const APPROVED_STREAM_STATUSES = new Set(["published", "scheduled", "live"]);

export interface BroadcastStreamFacts {
  status: string;
  enabled: boolean;
  /** Who holds the rights for this broadcast (operator-entered). */
  rightsHolder?: string | null;
  /** Licence / agreement reference or official URL proving the right to show it. */
  rightsEvidence?: string | null;
  /** The embed URL still passes the display-time safety check. */
  displayable: boolean;
  /** Kickoff registered on the stream itself (used only when no fixture is known). */
  kickoffAt?: string | null;
}

export interface BroadcastMatchFacts {
  status: string | null | undefined;
  scheduledAt: string | null | undefined;
  sport?: string | null;
}

/**
 * How long after kickoff a match that the source still reports as "not
 * started" keeps its broadcast window open. After that the broadcast is
 * expired even though the match state is only "unconfirmed".
 */
export const BROADCAST_WINDOW_MS: Record<string, number> = {
  football: 3 * 60 * 60_000,
  basketball: 3.5 * 60 * 60_000,
  tennis: 6 * 60 * 60_000,
  cricket: 10 * 60 * 60_000,
};
const DEFAULT_WINDOW_MS = 4 * 60 * 60_000;

/** True when the stream record carries rights evidence an editor can audit. */
export function hasRightsEvidence(stream: Pick<BroadcastStreamFacts, "rightsHolder" | "rightsEvidence">): boolean {
  return Boolean(String(stream.rightsHolder ?? "").trim()) && Boolean(String(stream.rightsEvidence ?? "").trim());
}

/** The operator approval half of the rule (no match involved). */
export function streamApproval(stream: BroadcastStreamFacts): "approved" | "review" | "ended" | "unpublished" {
  const status = String(stream.status ?? "").trim().toLowerCase();
  if (status === "ended") return "ended";
  if (!stream.enabled || !APPROVED_STREAM_STATUSES.has(status) || !stream.displayable) return "unpublished";
  if (!hasRightsEvidence(stream)) return "review";
  return "approved";
}

export interface BroadcastVerdict {
  state: BroadcastState;
  /** The iframe/player may render (live or standby). */
  playable: boolean;
  /** Counted as "available now" on public surfaces. */
  activeNow: boolean;
  /** Visible to the public at all (as a player or as an honest notice). */
  publicVisible: boolean;
  matchState: MatchState | null;
  /** Arabic notice that never claims more than the data says. */
  noticeAr: string;
}

function expiredNotice(matchState: MatchState | null): string {
  switch (matchState) {
    case "finished":
      return "انتهت المباراة — انتهى البث المباشر.";
    case "postponed":
      return "تأجّلت المباراة — لا يوجد بث مباشر حاليًا.";
    case "cancelled":
      return "أُلغيت المباراة — لا يوجد بث مباشر.";
    case "suspended":
      return "المباراة موقوفة — لا يوجد بث مباشر حاليًا.";
    case "abandoned":
      return "توقّفت المباراة — لم يعد البث المباشر نشطًا.";
    default:
      // unconfirmed, or a window that passed while the source still said "not started"
      return "انتهت نافذة البث المقررة لهذه المباراة، وحالة المباراة غير مؤكدة من المصدر — لا نعرض البث كمصدر نشط.";
  }
}

/** Short Arabic badge for one verdict (lists, admin tables, the Watch Guide). */
export function broadcastBadgeAr(verdict: Pick<BroadcastVerdict, "state" | "matchState">): string {
  switch (verdict.state) {
    case "live":
      return "يبث الآن";
    case "standby":
      return "قريبًا";
    case "ended":
      return "أُنهي البث";
    case "review":
      return "بانتظار توثيق الحقوق";
    case "unpublished":
      return "غير منشور";
    case "expired":
      switch (verdict.matchState) {
        case "finished":
          return "انتهت المباراة";
        case "postponed":
          return "مؤجَّلة";
        case "cancelled":
          return "ملغاة";
        case "suspended":
          return "موقوفة";
        case "abandoned":
          return "متوقفة";
        default:
          return "انتهت نافذة البث";
      }
  }
}

/**
 * Judge one stream for one match. `match` may be null when the stream's match
 * cannot be resolved (the stream's own kickoff is used for the window then,
 * but a stream with no known match is never "live").
 */
export function broadcastStateOf(
  stream: BroadcastStreamFacts | null | undefined,
  match: BroadcastMatchFacts | null | undefined,
  now: number = Date.now(),
): BroadcastVerdict | null {
  if (!stream) return null;
  const approval = streamApproval(stream);
  const kickoff = match?.scheduledAt ?? stream.kickoffAt ?? null;
  const matchState = match ? matchStateOf(match.status, match.scheduledAt, now) : null;
  const make = (state: BroadcastState, noticeAr: string): BroadcastVerdict => ({
    state,
    playable: state === "live" || state === "standby",
    activeNow: state === "live",
    publicVisible: state === "live" || state === "standby" || state === "expired",
    matchState,
    noticeAr,
  });

  if (approval === "ended") return make("ended", "أنهت الإدارة هذا البث — لم يعد متاحًا.");
  if (approval === "unpublished") return make("unpublished", "البث غير منشور.");
  if (approval === "review") return make("review", "البث بانتظار توثيق الحقوق — لا يظهر للزوار.");

  if (matchState === "live") return make("live", "بث مباشر الآن.");

  const kickoffMs = Date.parse(String(kickoff ?? ""));
  const windowMs = BROADCAST_WINDOW_MS[String(match?.sport ?? "")] ?? DEFAULT_WINDOW_MS;
  const windowOpen = Number.isFinite(kickoffMs) ? now <= kickoffMs + windowMs : false;

  if (matchState === "upcoming" || (matchState === null && Number.isFinite(kickoffMs))) {
    return windowOpen
      ? make("standby", "يبدأ البث مع انطلاق المباراة.")
      : make("expired", expiredNotice("unconfirmed"));
  }
  if (matchState === null) {
    // No fixture and no kickoff: we cannot tell when it plays — never active.
    return make("expired", "لا يمكن ربط هذا البث بمباراة محددة الآن — لا نعرضه كمصدر نشط.");
  }
  return make("expired", expiredNotice(matchState));
}
