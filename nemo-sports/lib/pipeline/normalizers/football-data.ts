/**
 * NEMO Sports · Pipeline · Football-Data.org normalizer
 * ────────────────────────────────────────────────────
 * Payload shapes of API v4 (https://docs.football-data.org):
 *
 *   /competitions                       → { competitions: [{ id, code, name, emblem, area }] }
 *   /competitions/{code}                → { id, code, name, …, seasons: [{ id, startDate, endDate, currentMatchday }] }
 *   /competitions/{code}/standings      → { season, standings: [{ stage, type, group, table: [ … ] }] }
 *   /competitions/{code}/matches        → { competition, matches: [{ id, utcDate, status, matchday, homeTeam, awayTeam, score }] }
 *
 * Only the fields the canonical model needs are read, and every unmappable row
 * is counted rather than silently dropped.
 */

import type { NormalizedMatch, NormalizedSeason, NormalizedStanding, NormalizerContext, NormalizerResult } from "../types";
import { derivedId, iso, list, num, pick, rec, seasonNameFromDates, str } from "./util";

/** football-data.org status → canonical match status. */
export const FD_STATUS: Record<string, NormalizedMatch["status"]> = {
  SCHEDULED: "scheduled",
  TIMED: "scheduled",
  IN_PLAY: "live",
  PAUSED: "halftime",
  EXTRA_TIME: "extra_time",
  PENALTY_SHOOTOUT: "penalty_shootout",
  FINISHED: "finished",
  POSTPONED: "postponed",
  SUSPENDED: "suspended",
  CANCELLED: "cancelled",
  AWARDED: "awarded",
};

const TYPE_STATUS: Record<string, NormalizedStanding["status"]> = {
  CHAMPION: "champion",
  PROMOTION: "promotion",
  PROMOTION_PLAYOFF: "promotion_playoff",
  RELEGATION: "relegation",
  RELEGATION_PLAYOFF: "relegation_playoff",
};

export function fdSeasonName(payload: unknown, ctx: NormalizerContext): string | null {
  const start = str(pick(payload, "season.startDate"));
  const end = str(pick(payload, "season.endDate"));
  const derived = seasonNameFromDates(start, end);
  return derived ?? ctx.seasonName ?? null;
}

export function normalizeFdStandings(payload: unknown, ctx: NormalizerContext): NormalizerResult<NormalizedStanding> {
  const warnings: string[] = [];
  const items: NormalizedStanding[] = [];
  let skipped = 0;
  const seasonName = fdSeasonName(payload, ctx);

  const groups = list(pick(payload, "standings"));
  for (const groupRaw of groups) {
    const group = rec(groupRaw);
    if (!group) continue;
    if (str(group.type) !== "TOTAL") continue; // HOME/AWAY splits are not the table
    const groupName = str(group.group);
    for (const rowRaw of list(group.table)) {
      const row = rec(rowRaw);
      const team = rec(row?.team);
      if (!row || !team) {
        skipped += 1;
        continue;
      }
      const teamId = str(team.id) ?? str(team.name);
      const position = num(row.position);
      if (!teamId || position === null) {
        skipped += 1;
        continue;
      }
      items.push({
        sourceId: `${str(pick(payload, "competition.id")) ?? ctx.competitionSlug}:${seasonName ?? "current"}:${teamId}`,
        competitionSlug: ctx.competitionSlug,
        seasonName,
        groupName,
        teamSourceId: teamId,
        teamName: str(team.name) ?? str(team.shortName) ?? `team ${teamId}`,
        position,
        played: num(row.playedGames) ?? 0,
        won: num(row.won) ?? 0,
        drawn: num(row.draw) ?? 0,
        lost: num(row.lost) ?? 0,
        goalsFor: num(row.goalsFor) ?? 0,
        goalsAgainst: num(row.goalsAgainst) ?? 0,
        points: num(row.points) ?? 0,
        form: str(row.form),
        status: TYPE_STATUS[str(row.status) ?? ""] ?? null,
      });
    }
  }
  if (items.length === 0) warnings.push("no TOTAL standings table in the payload");
  return { items, skipped, warnings };
}

export function normalizeFdMatches(payload: unknown, ctx: NormalizerContext): NormalizerResult<NormalizedMatch> {
  const items: NormalizedMatch[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  const seasonName = fdSeasonName(payload, ctx);

  for (const matchRaw of list(pick(payload, "matches"))) {
    const match = rec(matchRaw);
    const home = rec(match?.homeTeam);
    const away = rec(match?.awayTeam);
    const scheduledAt = iso(pick(matchRaw, "utcDate"));
    if (!match || !home || !away || !scheduledAt) {
      skipped += 1;
      continue;
    }
    const homeId = str(home.id) ?? str(home.name);
    const awayId = str(away.id) ?? str(away.name);
    if (!homeId || !awayId) {
      skipped += 1;
      continue;
    }
    const statusRaw = str(match.status) ?? "SCHEDULED";
    const status = FD_STATUS[statusRaw];
    if (!status) {
      skipped += 1;
      warnings.push(`unknown status «${statusRaw}»`);
      continue;
    }
    const fullTimeHome = num(pick(matchRaw, "score.fullTime.home"));
    const fullTimeAway = num(pick(matchRaw, "score.fullTime.away"));
    items.push({
      sourceId: str(match.id) ?? derivedId(ctx.competitionSlug, homeId, awayId, scheduledAt),
      competitionSlug: ctx.competitionSlug,
      seasonName,
      round: match.matchday !== null && match.matchday !== undefined ? `MD${num(match.matchday)}` : str(match.stage),
      homeSourceId: homeId,
      awaySourceId: awayId,
      homeName: str(home.name) ?? str(home.shortName) ?? `team ${homeId}`,
      awayName: str(away.name) ?? str(away.shortName) ?? `team ${awayId}`,
      scheduledAt,
      status,
      homeScore: fullTimeHome,
      awayScore: fullTimeAway,
      venueName: null,
    });
  }
  return { items, skipped, warnings };
}

/** `/competitions/{code}` → seasons (the catalog carries the season list). */
export function normalizeFdSeasons(payload: unknown, ctx: NormalizerContext): NormalizerResult<NormalizedSeason> {
  const items: NormalizedSeason[] = [];
  let skipped = 0;
  const competitionId = str(pick(payload, "id")) ?? ctx.competitionSlug;
  const seasons = list(pick(payload, "seasons"));
  const currentStart = str(pick(payload, "currentSeason.startDate"));

  for (const seasonRaw of seasons) {
    const start = str(pick(seasonRaw, "startDate"));
    const end = str(pick(seasonRaw, "endDate"));
    const name = seasonNameFromDates(start, end);
    if (!name) {
      skipped += 1;
      continue;
    }
    items.push({
      sourceId: `${competitionId}:${str(pick(seasonRaw, "id")) ?? name}`,
      competitionSlug: ctx.competitionSlug,
      name,
      startDate: start,
      endDate: end,
      isCurrent: currentStart ? start === currentStart : undefined,
      status: end && new Date(end) < new Date() ? "completed" : "active",
    });
  }
  return { items, skipped, warnings: [] };
}

export const FOOTBALL_DATA_NORMALIZER = {
  source: "football_data",
  seasons: normalizeFdSeasons,
  matches: normalizeFdMatches,
  standings: normalizeFdStandings,
} as const;
