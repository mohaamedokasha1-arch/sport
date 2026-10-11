/**
 * NEMO Sports · one single definition of a match's state.
 * ────────────────────────────────────────────────────────
 * Every public surface used to answer "is this match live / upcoming /
 * finished?" with its own inline array of provider statuses, and three of
 * them disagreed with each other:
 *
 *   · `lib/provider-match-filter.ts` called a match "upcoming" whenever the
 *     stored status was `scheduled`, with no look at the kickoff — so a match
 *     that kicked off 18 hours ago was still counted under «قادمة» on
 *     /matches and still rendered its kickoff time on /matches/[slug] next to
 *     the label «موعد معتمد» (a confirmed fixture).
 *   · `app/live/page.tsx` put `postponed / cancelled / suspended / abandoned`
 *     into the section titled «المباريات المكتملة مؤخرًا» ("recently
 *     completed"), which is a false statement about a match that never
 *     finished — and then filtered the SAME items out of the upcoming
 *     section, so they vanished from the page entirely.
 *   · `lib/match-streams.streamPhase()` already applied a day-level calendar
 *     rule (a stored `scheduled` whose kickoff day has passed is not live),
 *     so the stream panel and the fixture list could disagree about one match.
 *
 * This module is the single rule. It only ever reads what the source gave us
 * (status + kickoff) and the site calendar (lib/tz.ts) — it never invents a
 * state the source did not report, and it never drops a match.
 *
 * The one judgement call is `unconfirmed`: a match still marked `scheduled`
 * whose kickoff DAY (site calendar) has passed. The stored status has simply
 * not been refreshed, and we cannot know whether it finished, was postponed or
 * was cancelled — so the honest answer is "state not confirmed" rather than
 * guessing "finished" or pretending it is still upcoming. The comparison is
 * day-level on purpose, matching `streamPhase()`: a match that kicked off an
 * hour ago today keeps its normal upcoming presentation until the day rolls
 * over, instead of flipping to a warning in the middle of the evening.
 */

import { siteDay } from "@/lib/tz";

/** Statuses the sources use for a match that is in play right now. */
export const LIVE_MATCH_STATUSES = [
  "live",
  "halftime",
  "extra_time",
  "extra_time_halftime",
  "penalty_shootout",
] as const;

/** The match is over and a result stands. */
const FINISHED_STATUSES = new Set(["finished", "ended", "ft", "aft", "walkover", "awarded"]);

/** The match is not being played, for a reason the source did state. */
const INTERRUPTED_STATUSES = new Set([
  "postponed",
  "cancelled",
  "canceled",
  "suspended",
  "abandoned",
  "interrupted",
]);

export type MatchState =
  | "live"
  | "upcoming"
  | "finished"
  | "postponed"
  | "cancelled"
  | "suspended"
  | "abandoned"
  /** Stored status says "not started" but the kickoff day is already over. */
  | "unconfirmed";

/**
 * App-level status for a match whose last known state was "in play" but whose
 * live claim is no longer backed by the freshest data: a newer live snapshot
 * from the same provider does not list it, or the snapshot that said "live"
 * is older than LIVE_CLAIM_MAX_AGE_MS (served from a stale cache while the
 * provider was failing). It resolves to `unconfirmed` — never to "live"
 * (it would inflate live counts) and never to "finished" (no result exists).
 * Set only by lib/live-reconcile.ts; providers never send it.
 */
export const UNVERIFIED_STATUS = "unverified";

/**
 * Oldest snapshot allowed to present a match as live. The live cache lives
 * ~50 s and may be served stale for 120 s during a provider outage; the
 * fixtures cache may be served stale for an hour, which used to keep matches
 * "live" on /matches long after they ended (while /live reported none).
 */
export const LIVE_CLAIM_MAX_AGE_MS = 3 * 60_000;

function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? "").trim().toLowerCase();
}

/** True when the source says the match is in play. */
export function isLiveStatus(status: string | null | undefined): boolean {
  return (LIVE_MATCH_STATUSES as readonly string[]).includes(normalizeStatus(status));
}

/** True when the match is over, whatever wording the source used. */
export function isFinishedStatus(status: string | null | undefined): boolean {
  return FINISHED_STATUSES.has(normalizeStatus(status));
}

/**
 * Resolve one match to a state, from the source status and the site calendar.
 *
 * `scheduledAt` is optional: without a parseable kickoff the calendar rule
 * cannot be applied and the source status alone decides — which is exactly the
 * previous behaviour, so nothing regresses when a kickoff is missing.
 *
 * A status this module does not recognise is treated as "not started", the
 * same way every caller treated it before.
 */
export function matchStateOf(
  status: string | null | undefined,
  scheduledAt?: string | number | Date | null,
  now: string | number | Date = Date.now(),
): MatchState {
  const s = normalizeStatus(status);
  if (isLiveStatus(s)) return "live";
  if (s === UNVERIFIED_STATUS) return "unconfirmed";
  if (FINISHED_STATUSES.has(s)) return "finished";
  if (INTERRUPTED_STATUSES.has(s)) {
    if (s === "postponed") return "postponed";
    if (s === "cancelled" || s === "canceled") return "cancelled";
    if (s === "suspended") return "suspended";
    return "abandoned";
  }
  if (scheduledAt !== null && scheduledAt !== undefined) {
    const kickoff = new Date(scheduledAt);
    if (Number.isFinite(+kickoff) && siteDay(kickoff) < siteDay(now)) return "unconfirmed";
  }
  return "upcoming";
}

/** Arabic label for a resolved state — the wording shown to visitors. */
export const MATCH_STATE_LABEL_AR: Record<MatchState, string> = {
  live: "مباشر",
  upcoming: "لم تبدأ",
  finished: "انتهت",
  postponed: "مؤجَّلة",
  cancelled: "ملغاة",
  suspended: "موقوفة",
  abandoned: "متوقفة",
  unconfirmed: "الحالة غير مؤكدة",
};

export function matchStateLabelAr(state: MatchState): string {
  return MATCH_STATE_LABEL_AR[state];
}

/**
 * Short explanation of the `unconfirmed` state, for surfaces that must say why
 * a match is neither upcoming nor finished. It never claims a result.
 */
export const UNCONFIRMED_NOTE_AR =
  "انقضى يوم الموعد ولم يصل تحديث من المصدر يؤكد النتيجة أو التأجيل. لا نعرض نتيجة أو حالة غير مؤكدة.";

/** Why a live claim was withdrawn (status `unverified`). Never claims a result. */
export const UNVERIFIED_NOTE_AR =
  "لم يؤكد آخر تحديث من المصدر أن المباراة ما زالت جارية. ننتظر تحديث الحالة، ولا نعرض نتيجة نهائية غير مؤكدة.";

/** The explanation that matches the reason a match is `unconfirmed`. */
export function unconfirmedNoteAr(status: string | null | undefined): string {
  return normalizeStatus(status) === UNVERIFIED_STATUS ? UNVERIFIED_NOTE_AR : UNCONFIRMED_NOTE_AR;
}

/** True when the resolved state is "in play" — the one test every live count uses. */
export function isLiveNow(status: string | null | undefined, scheduledAt?: string | number | Date | null, now: string | number | Date = Date.now()): boolean {
  return matchStateOf(status, scheduledAt, now) === "live";
}
