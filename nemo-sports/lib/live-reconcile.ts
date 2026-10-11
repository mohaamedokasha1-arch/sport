/**
 * NEMO Sports · live-state reconciliation (pure, no I/O)
 * ──────────────────────────────────────────────────────────────────────────
 * Why this exists (production, 2026-10-11): the homepage and /live reported
 * zero (later 6 / 16) live matches while /matches?date=today reported 24. Three
 * independent causes, each reproduced against the live site:
 *
 *   1. Scope — /live, the homepage, /api/live and /api/v1/live asked for
 *      FOOTBALL only, while /matches aggregates every public sport
 *      (16 football + 8 basketball = 24 at 00:58 UTC).
 *   2. Separate snapshots — `live_matches` and `fixtures` are two cache entries
 *      of the same provider feed with different lifetimes (50 s vs 120 s, and a
 *      1-hour stale grace for fixtures vs 2 minutes for live). During a provider
 *      outage /matches kept serving an hour-old "live" while /live had nothing.
 *   3. Provider failure rendered as "no live matches" on /live.
 *
 * The rule implemented here: for one sport, every snapshot we hold (the live
 * view and the full fixtures view) is merged, the FRESHEST version of each
 * match wins, and a "live" claim survives only when the freshest relevant data
 * still backs it. Every live count and every live list on the site is derived
 * from the resulting board, so two pages can only disagree when they ask for a
 * different scope (sport/date) — never because they read different caches.
 *
 * Nothing is hidden: a withdrawn live claim becomes `unverified` (resolved to
 * the "unconfirmed" state by lib/match-state.ts) and stays listed.
 */

import type { NormalizedFixture } from "@/packages/sdl/src";
import { LIVE_CLAIM_MAX_AGE_MS, UNVERIFIED_STATUS, isLiveStatus, matchStateOf } from "@/lib/match-state";

/** One provider answer, reduced to what reconciliation needs. */
export interface SnapshotInput {
  ok: boolean;
  provider?: string | null;
  fetchedAt?: string | null;
  stale?: boolean;
  degraded?: boolean;
  fromCache?: boolean;
  fixtures?: NormalizedFixture[];
  error?: string | null;
}

type Version = { fixture: NormalizedFixture; at: number; provider: string; fromLiveView: boolean };

export interface SportBoard {
  sport: string;
  /** At least one snapshot for this sport answered. */
  ok: boolean;
  /** Provider of the freshest snapshot used. */
  provider: string | null;
  /** Time of the freshest snapshot used (ISO). */
  fetchedAt: string | null;
  /** Time of the oldest snapshot used (ISO) — "data as of" for honest labels. */
  oldestFetchedAt: string | null;
  stale: boolean;
  degraded: boolean;
  /** Every snapshot used came from cache. */
  fromCache: boolean;
  /** Reconciled in-play matches, kickoff ascending. */
  live: NormalizedFixture[];
  /** Freshest reconciled version of every match seen, by provider id. */
  versions: Map<string, Version>;
  /** The live view's own snapshot, when it answered. */
  liveView: { at: number; provider: string; ids: Set<string> } | null;
  error: string | null;
}

/** Editorial live statuses older than this after kickoff are not presented as live. */
const EDITORIAL_LIVE_MAX_MS = 6 * 60 * 60_000;

const ts = (iso: string | null | undefined): number => {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? t : 0;
};

const withStatus = (fixture: NormalizedFixture, status: string): NormalizedFixture =>
  fixture.status === status ? fixture : { ...fixture, status, minute: null };

/**
 * Should this live claim be withdrawn?
 *  · an editorial (operator-entered) "live" is trusted unless it is implausibly
 *    old (6 h after kickoff; cricket excepted — multi-day formats exist);
 *  · a provider claim must come from a snapshot younger than LIVE_CLAIM_MAX_AGE_MS;
 *  · and a fresher live view from the SAME provider must still list the match.
 */
function liveClaimWithdrawn(
  fixture: NormalizedFixture,
  claim: { at: number; provider: string; fromLiveView: boolean },
  liveView: SportBoard["liveView"],
  now: number,
): boolean {
  if (!isLiveStatus(fixture.status)) return false;
  if (fixture.editorialUpdatedAt) {
    const kickoff = ts(fixture.scheduledAt);
    return fixture.sport !== "cricket" && kickoff > 0 && now - kickoff > EDITORIAL_LIVE_MAX_MS;
  }
  if (claim.at > 0 && now - claim.at > LIVE_CLAIM_MAX_AGE_MS) return true;
  if (!claim.fromLiveView && liveView && liveView.provider === claim.provider && liveView.at > claim.at) {
    return !liveView.ids.has(fixture.providerId);
  }
  return false;
}

/**
 * Merge the live view and the fixtures view of ONE sport into a board.
 * `live` is the result of the live-matches query, `schedule` the full fixtures
 * feed for the sport. Either may have failed.
 */
export function buildSportBoard(sport: string, live: SnapshotInput, schedule: SnapshotInput, now = Date.now()): SportBoard {
  const answered = [
    live.ok ? { snap: live, fromLiveView: true } : null,
    schedule.ok ? { snap: schedule, fromLiveView: false } : null,
  ].filter((x): x is { snap: SnapshotInput; fromLiveView: boolean } => x !== null);

  if (answered.length === 0) {
    return {
      sport,
      ok: false,
      provider: null,
      fetchedAt: null,
      oldestFetchedAt: null,
      stale: false,
      degraded: false,
      fromCache: false,
      live: [],
      versions: new Map(),
      liveView: null,
      error: live.error ?? schedule.error ?? "no provider answered",
    };
  }

  const liveView = live.ok
    ? {
        at: ts(live.fetchedAt),
        provider: String(live.provider ?? ""),
        ids: new Set((live.fixtures ?? []).filter((f) => isLiveStatus(f.status)).map((f) => f.providerId)),
      }
    : null;

  // Oldest first, so the freshest snapshot overwrites. On a tie (one shared
  // upstream snapshot) the live view is applied last.
  const ordered = [...answered].sort(
    (a, b) => ts(a.snap.fetchedAt) - ts(b.snap.fetchedAt) || Number(a.fromLiveView) - Number(b.fromLiveView),
  );
  const versions = new Map<string, Version>();
  for (const { snap, fromLiveView } of ordered) {
    const at = ts(snap.fetchedAt);
    const provider = String(snap.provider ?? "");
    for (const fixture of snap.fixtures ?? []) {
      if (!fixture?.providerId) continue;
      versions.set(fixture.providerId, { fixture, at, provider, fromLiveView });
    }
  }

  for (const [id, version] of versions) {
    if (liveClaimWithdrawn(version.fixture, version, liveView, now)) {
      versions.set(id, { ...version, fixture: withStatus(version.fixture, UNVERIFIED_STATUS) });
    }
  }

  const liveList = [...versions.values()]
    .map((v) => v.fixture)
    .filter((f) => matchStateOf(f.status, f.scheduledAt, now) === "live")
    .sort((a, b) => ts(a.scheduledAt) - ts(b.scheduledAt) || a.providerId.localeCompare(b.providerId));

  const times = answered.map((a) => ts(a.snap.fetchedAt)).filter((t) => t > 0).sort((a, b) => a - b);
  const freshest = ordered[ordered.length - 1].snap;
  return {
    sport,
    ok: true,
    provider: freshest.provider ?? null,
    fetchedAt: times.length ? new Date(times[times.length - 1]).toISOString() : null,
    oldestFetchedAt: times.length ? new Date(times[0]).toISOString() : null,
    stale: answered.some((a) => a.snap.stale),
    degraded: answered.length < 2 || answered.some((a) => a.snap.degraded),
    fromCache: answered.every((a) => a.snap.fromCache === true),
    live: liveList,
    versions,
    liveView,
    error: null,
  };
}

/**
 * Bring any other fixture list (a dated query, a competition query…) in line
 * with the boards: a fresher board version replaces the list's version, and a
 * live claim the board no longer backs is withdrawn. Matches the boards do not
 * know are kept untouched (other than the snapshot-age rule).
 */
export function reconcileFixtures(
  fixtures: NormalizedFixture[],
  snapshot: { fetchedAt?: string | null; provider?: string | null },
  boards: SportBoard[],
  now = Date.now(),
): NormalizedFixture[] {
  const bySport = new Map(boards.map((b) => [b.sport, b]));
  const at = ts(snapshot.fetchedAt);
  const provider = String(snapshot.provider ?? "");
  return fixtures.map((fixture) => {
    const board = bySport.get(fixture.sport);
    const version = board?.ok ? board.versions.get(fixture.providerId) : undefined;
    if (version && version.at >= at) return version.fixture;
    const claim = { at, provider, fromLiveView: false };
    return liveClaimWithdrawn(fixture, claim, board?.ok ? board.liveView : null, now)
      ? withStatus(fixture, UNVERIFIED_STATUS)
      : fixture;
  });
}

export interface LiveBoardSummary {
  /** Sports this board covers, in display order. */
  sports: string[];
  boards: SportBoard[];
  /** All reconciled live matches, sport order first, then kickoff. */
  live: NormalizedFixture[];
  total: number;
  bySport: Record<string, number>;
  /** At least one sport answered. */
  ok: boolean;
  /** Every requested sport answered. */
  complete: boolean;
  failedSports: string[];
  /** Oldest snapshot used across sports (ISO) — the honest "data as of". */
  fetchedAt: string | null;
  providers: string[];
  stale: boolean;
  degraded: boolean;
  fromCache: boolean;
}

/** Combine per-sport boards into one site-wide live picture. */
export function summarizeBoards(boards: SportBoard[]): LiveBoardSummary {
  const sports = boards.map((b) => b.sport);
  const order = new Map(sports.map((s, i) => [s, i]));
  const live = boards
    .flatMap((b) => b.live)
    .sort((a, b) => (order.get(a.sport) ?? 99) - (order.get(b.sport) ?? 99) || ts(a.scheduledAt) - ts(b.scheduledAt));
  const okBoards = boards.filter((b) => b.ok);
  const times = okBoards.map((b) => ts(b.oldestFetchedAt)).filter((t) => t > 0).sort((a, b) => a - b);
  return {
    sports,
    boards,
    live,
    total: live.length,
    bySport: Object.fromEntries(boards.map((b) => [b.sport, b.live.length])),
    ok: okBoards.length > 0,
    complete: okBoards.length === boards.length,
    failedSports: boards.filter((b) => !b.ok).map((b) => b.sport),
    fetchedAt: times.length ? new Date(times[0]).toISOString() : null,
    providers: [...new Set(okBoards.map((b) => b.provider).filter((p): p is string => Boolean(p)))],
    stale: okBoards.some((b) => b.stale),
    degraded: okBoards.length < boards.length || okBoards.some((b) => b.degraded),
    fromCache: okBoards.length > 0 && okBoards.every((b) => b.fromCache),
  };
}
