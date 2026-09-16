/* ─────────────────────────────────────────────────────────────
   NEMO Sports · Live engine
   The clock is derived from real elapsed time since kickoff, so the
   demo stays believable no matter when it is opened. Events appear
   as their minute is reached — a goal "happens" while you watch.
   ───────────────────────────────────────────────────────────── */

import { allMatches, type Match, type MatchEvent, type MatchStatus } from "./data";

export type LiveState = {
  id: string;
  status: MatchStatus;
  clock: string;
  minute: number;
  homeScore: number;
  awayScore: number;
  /** events that have already happened, newest last */
  events: MatchEvent[];
  /** true only on the very first tick after a score change */
  changed: boolean;
  updatedAt: string;
};

const SCORING: MatchEvent["type"][] = ["goal", "penalty", "own-goal"];

function clockFor(sport: string, elapsed: number, m: Match): { clock: string; minute: number; status: MatchStatus } {
  if (m.status === "POSTPONED") return { clock: "مؤجلة", minute: 0, status: "POSTPONED" };
  if (m.status === "CANCELLED") return { clock: "ملغاة", minute: 0, status: "CANCELLED" };
  // Kickoff has not arrived yet — regardless of sport or stored status.
  if (elapsed <= 0) return { clock: m.clock || "لم تبدأ", minute: 0, status: "UPCOMING" };

  switch (sport) {
    case "basketball": {
      const total = 48;
      if (elapsed >= total) return { clock: "نهائي", minute: total, status: "FINISHED" };
      const q = Math.min(4, Math.floor(elapsed / 12) + 1);
      const left = Math.ceil((q * 12 - elapsed) * 60);
      const mm = String(Math.floor(left / 60)).padStart(2, "0");
      const ss = String(left % 60).padStart(2, "0");
      return { clock: `الربع ${q} · ${mm}:${ss}`, minute: Math.floor(elapsed), status: "LIVE" };
    }
    case "tennis": {
      const sets = m.periods?.length ?? 1;
      if (elapsed >= 150) return { clock: "انتهت", minute: 150, status: "FINISHED" };
      return { clock: `المجموعة ${Math.min(sets + 1, 5)}`, minute: Math.floor(elapsed), status: "LIVE" };
    }
    case "volleyball": {
      const played = m.periods?.length ?? 0;
      if (played >= 5 || elapsed >= 130) return { clock: "انتهت", minute: 0, status: "FINISHED" };
      return { clock: `الشوط ${played + 1}`, minute: Math.floor(elapsed), status: "LIVE" };
    }
    case "handball": {
      if (elapsed >= 60) return { clock: "انتهت", minute: 60, status: "FINISHED" };
      const half = elapsed < 30 ? 1 : 2;
      const left = Math.ceil((half * 30 - elapsed) * 60);
      const mm = String(Math.floor(left / 60)).padStart(2, "0");
      const ss = String(left % 60).padStart(2, "0");
      return { clock: `الشوط ${half} · ${mm}:${ss}`, minute: Math.floor(elapsed), status: "LIVE" };
    }
    case "hockey": {
      if (elapsed >= 60) return { clock: "نهائي", minute: 60, status: "FINISHED" };
      const p = Math.min(3, Math.floor(elapsed / 20) + 1);
      return { clock: `الفترة ${p}`, minute: Math.floor(elapsed), status: "LIVE" };
    }
    case "baseball": {
      if (elapsed >= 180) return { clock: "نهائي", minute: 9, status: "FINISHED" };
      return { clock: `الإينينج ${Math.min(9, Math.floor(elapsed / 20) + 1)}`, minute: Math.floor(elapsed), status: "LIVE" };
    }
    case "boxing": {
      if (elapsed >= 36) return { clock: "انتهى النزال", minute: 12, status: "FINISHED" };
      return { clock: `الجولة ${Math.min(12, Math.floor(elapsed / 3) + 1)}`, minute: Math.floor(elapsed), status: "LIVE" };
    }
    default: {
      // football + fallback
      if (elapsed >= 90 + 4) return { clock: "انتهت", minute: 90, status: "FINISHED" };
      if (elapsed >= 45 && elapsed < 47) return { clock: "الاستراحة", minute: 45, status: "HT" };
      if (elapsed >= 90) return { clock: `90+${Math.round(elapsed - 90)}'`, minute: 90, status: "LIVE" };
      return { clock: `${Math.floor(elapsed)}'`, minute: Math.floor(elapsed), status: "LIVE" };
    }
  }
}

function liveState(m: Match, now: number, prev?: Record<string, LiveState>): LiveState {
  const kickoff = +new Date(m.kickoff);
  const elapsed = (now - kickoff) / 60000;
  const { clock, minute, status } = clockFor(m.sport, elapsed, m);

  const isDone = status === "FINISHED";
  const events = m.events.filter(
    (e) => isDone || e.minute <= Math.max(minute, 0),
  );

  let homeScore = 0;
  let awayScore = 0;
  for (const e of events) {
    if (m.sport === "tennis" || m.sport === "volleyball") {
      if (e.type !== "period") continue;
      if (e.side === "home") homeScore += 1;
      if (e.side === "away") awayScore += 1;
      continue;
    }
    if (!SCORING.includes(e.type)) continue;
    const ownGoalPenalty = e.type === "own-goal" ? -1 : 1;
    if (e.side === "home") homeScore += ownGoalPenalty;
    else if (e.side === "away") awayScore += ownGoalPenalty;
  }

  // A finished match always shows its official result.
  if (isDone) {
    homeScore = m.homeScore;
    awayScore = m.awayScore;
  }

  const before = prev?.[m.id];
  const changed = !!before && (before.homeScore !== homeScore || before.awayScore !== awayScore);

  return {
    id: m.id,
    status,
    clock: isDone ? (m.sport === "basketball" || m.sport === "hockey" || m.sport === "baseball" ? "نهائي" : "انتهت") : clock,
    minute,
    homeScore,
    awayScore,
    events,
    changed,
    updatedAt: new Date(now).toISOString(),
  };
}

/** Live state for every match (used by the public API + server render). */
export function getLiveStates(prev?: Record<string, LiveState>, now = Date.now()): Record<string, LiveState> {
  const out: Record<string, LiveState> = {};
  for (const m of allMatches) out[m.id] = liveState(m, now, prev);
  return out;
}

export const statusMeta: Record<MatchStatus, { label: string; tone: "live" | "idle" | "done" | "warn" }> = {
  LIVE: { label: "مباشر", tone: "live" },
  HT: { label: "الاستراحة", tone: "live" },
  UPCOMING: { label: "لم تبدأ", tone: "idle" },
  FINISHED: { label: "انتهت", tone: "done" },
  POSTPONED: { label: "مؤجلة", tone: "warn" },
  CANCELLED: { label: "ملغاة", tone: "warn" },
  SUSPENDED: { label: "متوقفة", tone: "warn" },
};
