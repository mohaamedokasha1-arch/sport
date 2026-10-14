/* ─────────────────────────────────────────────────────────────
   NEMO Sports · Live engine
   The clock is derived from real elapsed time since kickoff, so the
   demo stays believable no matter when it is opened. Events appear
   as their minute is reached — a goal "happens" while you watch.
   ───────────────────────────────────────────────────────────── */

import { allMatches, type Match, type MatchEvent, type MatchStatus } from "./data";

/**
 * What the clock MEANS, without a language attached.
 *
 * `clock` below is an Arabic display string and has always been part of the
 * /api/live payload, so it cannot be changed without breaking the API
 * contract — and client components poll that endpoint. Instead the same
 * information is also exposed structurally, and lib/i18n/clock.ts renders it
 * in the visitor's language. Arabic output is byte-identical either way.
 */
export type ClockParts =
  | { kind: "status"; key: "postponed" | "cancelled" | "notStarted" | "final" | "finished" | "boutEnded" | "halfTime" }
  | { kind: "minute"; minute: number }
  | { kind: "stoppage"; minute: number }
  | {
      kind: "period";
      unit: "quarter" | "set" | "half" | "period" | "inning" | "round";
      index: number;
      /** "mm:ss" remaining inside the period, when the sport shows a countdown */
      remaining: string | null;
    }
  /** an operator-entered clock string with no structure to translate */
  | { kind: "raw"; value: string };

export type LiveState = {
  id: string;
  status: MatchStatus;
  clock: string;
  /** language-neutral form of `clock` — render this, not `clock` */
  clockParts: ClockParts;
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

/**
 * Recognise a STORED clock value (`Match.clock`) and describe it structurally.
 *
 * That field is free-form: providers and operators put kickoff times ("22:00"),
 * minutes ("67'"), and the site's own Arabic clock words ("انتهت",
 * "المجموعة 3") in it. Values this module itself produces are recognised and
 * translated; anything else is passed through verbatim as `raw`, because
 * guessing at an unknown operator string would fabricate meaning.
 *
 * Matching on strings the site already emits is the same approach
 * `broadcastNoticeKey` takes for broadcast notices.
 */
function partsForStoredClock(value: string): ClockParts {
  const v = value.trim();
  const statusWord: Record<string, ClockParts & { kind: "status" }> = {
    "انتهت": { kind: "status", key: "finished" },
    "نهائي": { kind: "status", key: "final" },
    "مؤجلة": { kind: "status", key: "postponed" },
    "ملغاة": { kind: "status", key: "cancelled" },
    "الاستراحة": { kind: "status", key: "halfTime" },
    "لم تبدأ": { kind: "status", key: "notStarted" },
    "انتهى النزال": { kind: "status", key: "boutEnded" },
  };
  if (statusWord[v]) return statusWord[v]!;

  // "<period word> <n>" optionally followed by " · mm:ss"
  type PeriodUnit = Extract<ClockParts, { kind: "period" }>["unit"];
  const units: [RegExp, PeriodUnit][] = [
    [/^الربع\s+(\d+)$/, "quarter"],
    [/^المجموعة\s+(\d+)$/, "set"],
    [/^الشوط\s+(\d+)$/, "set"],
    [/^الفترة\s+(\d+)$/, "period"],
    [/^الإينينج\s+(\d+)$/, "inning"],
    [/^الجولة\s+(\d+)$/, "round"],
  ];
  for (const [re, unit] of units) {
    const m = re.exec(v);
    if (m) return { kind: "period", unit, index: Number(m[1]), remaining: null };
  }
  // "الشوط 2 · 12:40" — a half with a countdown
  const withTime = /^الشوط\s+(\d+)\s*·\s*(\d{1,2}:\d{2})$/.exec(v);
  if (withTime)
    return { kind: "period", unit: "half", index: Number(withTime[1]), remaining: withTime[2] ?? null };
  const qTime = /^الربع\s+(\d+)\s*·\s*(\d{1,2}:\d{2})$/.exec(v);
  if (qTime)
    return { kind: "period", unit: "quarter", index: Number(qTime[1]), remaining: qTime[2] ?? null };

  // a bare minute "67'"
  const minute = /^(\d+)'$/.exec(v);
  if (minute) return { kind: "minute", minute: Number(minute[1]) };
  const stoppage = /^90\+(\d+)'$/.exec(v);
  if (stoppage) return { kind: "stoppage", minute: Number(stoppage[1]) };

  return { kind: "raw", value: v };
}

function clockFor(
  sport: string,
  elapsed: number,
  m: Match,
): { clock: string; clockParts: ClockParts; minute: number; status: MatchStatus } {
  if (m.status === "POSTPONED")
    return { clock: "مؤجلة", clockParts: { kind: "status", key: "postponed" }, minute: 0, status: "POSTPONED" };
  if (m.status === "CANCELLED")
    return { clock: "ملغاة", clockParts: { kind: "status", key: "cancelled" }, minute: 0, status: "CANCELLED" };
  // Kickoff has not arrived yet — regardless of sport or stored status.
  if (elapsed <= 0)
    return {
      clock: m.clock || "لم تبدأ",
      // A custom operator-entered clock has no structure to translate, so it is
      // passed through verbatim rather than guessed at.
      clockParts: m.clock ? partsForStoredClock(m.clock) : { kind: "status", key: "notStarted" },
      minute: 0,
      status: "UPCOMING",
    };

  switch (sport) {
    case "basketball": {
      const total = 48;
      if (elapsed >= total)
        return { clock: "نهائي", clockParts: { kind: "status", key: "final" }, minute: total, status: "FINISHED" };
      const q = Math.min(4, Math.floor(elapsed / 12) + 1);
      const left = Math.ceil((q * 12 - elapsed) * 60);
      const mm = String(Math.floor(left / 60)).padStart(2, "0");
      const ss = String(left % 60).padStart(2, "0");
      return {
        clock: `الربع ${q} · ${mm}:${ss}`,
        clockParts: { kind: "period", unit: "quarter", index: q, remaining: `${mm}:${ss}` },
        minute: Math.floor(elapsed),
        status: "LIVE",
      };
    }
    case "tennis": {
      const sets = m.periods?.length ?? 1;
      if (elapsed >= 150)
        return { clock: "انتهت", clockParts: { kind: "status", key: "finished" }, minute: 150, status: "FINISHED" };
      return {
        clock: `المجموعة ${Math.min(sets + 1, 5)}`,
        clockParts: { kind: "period", unit: "set", index: Math.min(sets + 1, 5), remaining: null },
        minute: Math.floor(elapsed),
        status: "LIVE",
      };
    }
    case "volleyball": {
      const played = m.periods?.length ?? 0;
      if (played >= 5 || elapsed >= 130)
        return { clock: "انتهت", clockParts: { kind: "status", key: "finished" }, minute: 0, status: "FINISHED" };
      return {
        clock: `الشوط ${played + 1}`,
        clockParts: { kind: "period", unit: "set", index: played + 1, remaining: null },
        minute: Math.floor(elapsed),
        status: "LIVE",
      };
    }
    case "handball": {
      if (elapsed >= 60)
        return { clock: "انتهت", clockParts: { kind: "status", key: "finished" }, minute: 60, status: "FINISHED" };
      const half = elapsed < 30 ? 1 : 2;
      const left = Math.ceil((half * 30 - elapsed) * 60);
      const mm = String(Math.floor(left / 60)).padStart(2, "0");
      const ss = String(left % 60).padStart(2, "0");
      return {
        clock: `الشوط ${half} · ${mm}:${ss}`,
        clockParts: { kind: "period", unit: "half", index: half, remaining: `${mm}:${ss}` },
        minute: Math.floor(elapsed),
        status: "LIVE",
      };
    }
    case "hockey": {
      if (elapsed >= 60)
        return { clock: "نهائي", clockParts: { kind: "status", key: "final" }, minute: 60, status: "FINISHED" };
      const p = Math.min(3, Math.floor(elapsed / 20) + 1);
      return {
        clock: `الفترة ${p}`,
        clockParts: { kind: "period", unit: "period", index: p, remaining: null },
        minute: Math.floor(elapsed),
        status: "LIVE",
      };
    }
    case "baseball": {
      if (elapsed >= 180)
        return { clock: "نهائي", clockParts: { kind: "status", key: "final" }, minute: 9, status: "FINISHED" };
      return {
        clock: `الإينينج ${Math.min(9, Math.floor(elapsed / 20) + 1)}`,
        clockParts: { kind: "period", unit: "inning", index: Math.min(9, Math.floor(elapsed / 20) + 1), remaining: null },
        minute: Math.floor(elapsed),
        status: "LIVE",
      };
    }
    case "boxing": {
      if (elapsed >= 36)
        return { clock: "انتهى النزال", clockParts: { kind: "status", key: "boutEnded" }, minute: 12, status: "FINISHED" };
      return {
        clock: `الجولة ${Math.min(12, Math.floor(elapsed / 3) + 1)}`,
        clockParts: { kind: "period", unit: "round", index: Math.min(12, Math.floor(elapsed / 3) + 1), remaining: null },
        minute: Math.floor(elapsed),
        status: "LIVE",
      };
    }
    default: {
      // football + fallback
      if (elapsed >= 90 + 4)
        return { clock: "انتهت", clockParts: { kind: "status", key: "finished" }, minute: 90, status: "FINISHED" };
      if (elapsed >= 45 && elapsed < 47)
        return { clock: "الاستراحة", clockParts: { kind: "status", key: "halfTime" }, minute: 45, status: "HT" };
      if (elapsed >= 90)
        return {
          clock: `90+${Math.round(elapsed - 90)}'`,
          clockParts: { kind: "stoppage", minute: Math.round(elapsed - 90) },
          minute: 90,
          status: "LIVE",
        };
      return {
        clock: `${Math.floor(elapsed)}'`,
        clockParts: { kind: "minute", minute: Math.floor(elapsed) },
        minute: Math.floor(elapsed),
        status: "LIVE",
      };
    }
  }
}

function liveState(m: Match, now: number, prev?: Record<string, LiveState>): LiveState {
  const kickoff = +new Date(m.kickoff);
  const elapsed = (now - kickoff) / 60000;
  const { clock, clockParts, minute, status } = clockFor(m.sport, elapsed, m);

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
    // Must mirror the override above exactly, or the structured form and the
    // Arabic string would disagree for finished basketball/hockey/baseball.
    clockParts: isDone
      ? {
          kind: "status",
          key: m.sport === "basketball" || m.sport === "hockey" || m.sport === "baseball" ? "final" : "finished",
        }
      : clockParts,
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
