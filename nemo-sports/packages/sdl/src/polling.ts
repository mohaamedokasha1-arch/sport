/**
 * SDL · Polling policy (§3.6)
 * Live matches are polled aggressively; finished ones stop entirely.
 * A provider near its quota is polled slower rather than harder.
 */

import type { MatchStatus } from "./types";

export type PollingProfile = {
  intervalSeconds: number;
  /** true while this profile is worth an expensive live request */
  realtime: boolean;
  reason: string;
};

const BASE: Record<MatchStatus, PollingProfile> = {
  live: { intervalSeconds: 10, realtime: true, reason: "match in play" },
  halftime: { intervalSeconds: 30, realtime: true, reason: "halftime — resume imminent" },
  extra_time: { intervalSeconds: 10, realtime: true, reason: "extra time in play" },
  extra_time_halftime: { intervalSeconds: 30, realtime: true, reason: "extra time break" },
  penalty_shootout: { intervalSeconds: 5, realtime: true, reason: "shootout — second-level changes" },
  scheduled: { intervalSeconds: 300, realtime: false, reason: "fixture — kickoff/lineup changes only" },
  finished: { intervalSeconds: 3600, realtime: false, reason: "settled — rare post-match corrections" },
  postponed: { intervalSeconds: 14400, realtime: false, reason: "postponed" },
  cancelled: { intervalSeconds: 86400, realtime: false, reason: "cancelled" },
  suspended: { intervalSeconds: 120, realtime: true, reason: "suspended — may resume" },
  abandoned: { intervalSeconds: 3600, realtime: false, reason: "abandoned" },
  walkover: { intervalSeconds: 3600, realtime: false, reason: "walkover recorded" },
  awarded: { intervalSeconds: 3600, realtime: false, reason: "awarded result" },
};

/** Kickoff windows get elevated attention for lineups and score start. */
export function profileFor(status: MatchStatus, opts: { kickoffAt?: string; now?: number; throttled?: boolean } = {}): PollingProfile {
  let p = BASE[status] ?? BASE.scheduled;
  const now = opts.now ?? Date.now();

  if (status === "scheduled" && opts.kickoffAt) {
    const toKickoff = +new Date(opts.kickoffAt) - now;
    if (toKickoff <= 15 * 60_000) p = { intervalSeconds: 30, realtime: true, reason: "kickoff within 15 min — lineups & first whistle" };
    else if (toKickoff <= 60 * 60_000) p = { intervalSeconds: 120, realtime: false, reason: "kickoff within an hour" };
  }

  // a freshly finished match is re-checked for a while (late corrections, VAR)
  if (status === "finished") p = { intervalSeconds: 900, realtime: false, reason: "settling window after full time" };

  if (opts.throttled && p.realtime) {
    p = { ...p, intervalSeconds: Math.min(60, Math.max(p.intervalSeconds, 15) * 2), reason: `${p.reason} (provider throttled)` };
  }
  if (opts.throttled && !p.realtime) {
    p = { ...p, intervalSeconds: Math.min(86400, p.intervalSeconds * 2) };
  }

  return p;
}

export const POLLING_TABLE = BASE;
