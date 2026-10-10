import type { NormalizedFixture } from "@/packages/sdl/src";
import { fixtureBelongsToCompetition } from "@/lib/competition-catalog";
import { matchesSearchText } from "@/lib/search-text";
import { siteDay, siteDateKey, isDateKey } from "@/lib/tz";
import { isFinishedStatus, isLiveStatus, matchStateOf } from "@/lib/match-state";

export type ProviderMatchQuery = {
  sport?: string;
  competition?: string;
  date?: string;
  status?: string;
  team?: string;
};

/**
 * Status buckets, resolved through the site-wide rule in lib/match-state.ts so
 * the filter chips, the counters and the match cards cannot disagree.
 *
 * `isFixtureUpcoming` used to be `status === "scheduled"` with no look at the
 * kickoff, so a match whose day had already passed was still counted under
 * «قادمة» and still sorted into the upcoming group — the exact contradiction
 * the fixture list is supposed to resolve. A stale `scheduled` now resolves to
 * `unconfirmed`: it is no longer counted as upcoming, and it is NOT counted as
 * finished either (we do not know a result), but it still appears under
 * «الكل» so no match ever disappears from the list.
 */
export const isFixtureLive = (fixture: NormalizedFixture) => isLiveStatus(fixture.status);

export const isFixtureUpcoming = (fixture: NormalizedFixture, now = Date.now()) =>
  matchStateOf(fixture.status, fixture.scheduledAt, now) === "upcoming";
export const isFixtureFinished = (fixture: NormalizedFixture) => isFinishedStatus(fixture.status);
/** Stored status lags reality: the kickoff day passed and no update arrived. */
export const isFixtureUnconfirmed = (fixture: NormalizedFixture, now = Date.now()) =>
  matchStateOf(fixture.status, fixture.scheduledAt, now) === "unconfirmed";

function onDate(fixture: NormalizedFixture, date: string | undefined, now: number): boolean {
  if (!Number.isFinite(Date.parse(fixture.scheduledAt))) return false;
  if (date && isDateKey(date)) return siteDateKey(fixture.scheduledAt) === date;
  const day = Math.round((siteDay(fixture.scheduledAt) - siteDay(now)) / 86_400_000);
  switch (date ?? "today") {
    case "all": return true;
    case "yesterday": return day === -1;
    case "tomorrow": return day === 1;
    case "week": return day >= 0 && day <= 6;
    case "today":
    default: return day === 0;
  }
}

function withinScope(fixture: NormalizedFixture, query: ProviderMatchQuery): boolean {
  if (query.sport && fixture.sport !== query.sport) return false;
  if (query.competition && !fixtureBelongsToCompetition(fixture, query.competition)) return false;
  if (query.team && !matchesSearchText(query.team, fixture.homeName, fixture.homeProviderId, fixture.awayName, fixture.awayProviderId)) return false;
  return true;
}

function onStatus(fixture: NormalizedFixture, status: string | undefined, now: number): boolean {
  switch (status) {
    case "live": return isFixtureLive(fixture);
    case "upcoming": return isFixtureUpcoming(fixture, now);
    case "finished": return isFixtureFinished(fixture);
    case "unconfirmed": return isFixtureUnconfirmed(fixture, now);
    default: return true;
  }
}

export function filterProviderMatches(
  fixtures: NormalizedFixture[],
  query: ProviderMatchQuery,
  now = Date.now(),
): NormalizedFixture[] {
  return fixtures.filter((fixture) => withinScope(fixture, query) && onDate(fixture, query.date, now) && onStatus(fixture, query.status, now));
}

export function providerMatchCounts(
  fixtures: NormalizedFixture[],
  query: ProviderMatchQuery,
  now = Date.now(),
): Record<string, number> {
  const scoped = fixtures.filter((fixture) => withinScope(fixture, query));
  const counts: Record<string, number> = {
    "date:yesterday": 0,
    "date:today": 0,
    "date:tomorrow": 0,
    "date:week": 0,
    "status:all": 0,
    "status:live": 0,
    "status:upcoming": 0,
    "status:finished": 0,
    "status:unconfirmed": 0,
  };

  for (const fixture of scoped) {
    for (const date of ["yesterday", "today", "tomorrow", "week"]) {
      if (onDate(fixture, date, now)) counts[`date:${date}`]++;
    }
    if (!onDate(fixture, query.date, now)) continue;
    counts["status:all"]++;
    if (isFixtureLive(fixture)) counts["status:live"]++;
    if (isFixtureUpcoming(fixture, now)) counts["status:upcoming"]++;
    if (isFixtureFinished(fixture)) counts["status:finished"]++;
    if (isFixtureUnconfirmed(fixture, now)) counts["status:unconfirmed"]++;
  }

  return counts;
}

export function sortProviderMatches(fixtures: NormalizedFixture[], now = Date.now()): NormalizedFixture[] {
  return [...fixtures].sort((a, b) => {
    const rank = (fixture: NormalizedFixture) => isFixtureLive(fixture) ? 0 : isFixtureUpcoming(fixture, now) ? 1 : 2;
    return rank(a) - rank(b) || +new Date(a.scheduledAt) - +new Date(b.scheduledAt);
  });
}
