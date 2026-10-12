/**
 * NEMO Sports · Pipeline · TheSportsDB normalizer
 * ──────────────────────────────────────────────
 * TheSportsDB answers either as a wrapper object (`{"events":[…]}`,
 * `{"table":[…]}` — v1 style) or as a bare array (v2 style), and it uses empty
 * strings, `null` and `"0"` interchangeably for "no value". `unwrap()` handles
 * both shapes so one normalizer serves a v1 or v2 base URL.
 *
 * Free-tier reality (documented by the provider): community metadata and
 * artwork, with limits on live/premium endpoints. That is why this source is
 * LAST in the priority list — it may confirm a team's badge or stadium, it
 * never decides a score against a higher-priority source.
 */

import type { NormalizedMatch, NormalizedStanding, NormalizedTeam, NormalizerContext, NormalizerResult } from "../types";
import { derivedId, isoFromDateAndTime, list, num, pick, rec, str } from "./util";

/** `{"events":[…]}` / `{"table":[…]}` / `[…]` → the array. */
export function unwrap(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const node = rec(payload);
  if (!node) return [];
  const preferred = ["events", "table", "teams", "countries", "leagues", "lookup", "results", "schedule", "honours", "players"];
  for (const key of preferred) {
    const value = node[key];
    if (Array.isArray(value)) return value;
  }
  const arrays = Object.values(node).filter(Array.isArray) as unknown[][];
  return arrays.length === 1 ? arrays[0]! : [];
}

/** TheSportsDB free-text status → canonical status. */
export function tsdStatus(raw: string | null, progress: string | null): NormalizedMatch["status"] {
  const s = (raw ?? "").toLowerCase();
  const p = (progress ?? "").toLowerCase();
  if (/postpon/.test(s)) return "postponed";
  if (/cancel/.test(s)) return "cancelled";
  if (/suspend|abandon/.test(s)) return "suspended";
  if (/awarded/.test(s)) return "awarded";
  if (/penalt/.test(s)) return "penalty_shootout";
  if (/extra time|aet/.test(s)) return "extra_time";
  if (/half ?time|\bht\b/.test(s) || p === "ht") return "halftime";
  if (/finished|\bft\b|match finished|after extra time/.test(s)) return "finished";
  if (/\b1h\b|\b2h\b|first half|second half|in ?play|live/.test(s) || p === "1h" || p === "2h") return "live";
  return "scheduled";
}

/** League discovery: find the Egyptian league id inside a league listing. */
export function discoverLeagueId(payload: unknown, matchField: string, contains: string): string | null {
  const needle = contains.toLowerCase();
  for (const entry of unwrap(payload)) {
    const value = str(pick(entry, matchField)) ?? str(rec(entry)?.strLeague) ?? str(rec(entry)?.name);
    if (!value) continue;
    if (!value.toLowerCase().includes(needle)) continue;
    const id = str(rec(entry)?.idLeague) ?? str(rec(entry)?.id) ?? str(rec(entry)?.idLeague2);
    if (id) return id;
  }
  return null;
}

export function normalizeTsdMatches(payload: unknown, ctx: NormalizerContext): NormalizerResult<NormalizedMatch> {
  const items: NormalizedMatch[] = [];
  let skipped = 0;
  const warnings: string[] = [];

  for (const eventRaw of unwrap(payload)) {
    const event = rec(eventRaw);
    if (!event) {
      skipped += 1;
      continue;
    }
    const date = str(event.dateEvent);
    const scheduledAt = isoFromDateAndTime(date, str(event.strTime));
    const homeName = str(event.strHomeTeam);
    const awayName = str(event.strAwayTeam);
    const homeId = str(event.idHomeTeam) ?? (homeName ? derivedId("tsd", homeName) : null);
    const awayId = str(event.idAwayTeam) ?? (awayName ? derivedId("tsd", awayName) : null);
    if (!scheduledAt || !homeName || !awayName || !homeId || !awayId) {
      skipped += 1;
      continue;
    }
    const statusRaw = str(event.strStatus) ?? str(event.strProgress);
    items.push({
      sourceId: str(event.idEvent) ?? derivedId(ctx.competitionSlug, homeId, awayId, date),
      competitionSlug: ctx.competitionSlug,
      seasonName: str(event.strSeason) ?? ctx.seasonName ?? null,
      round: event.intRound !== undefined && event.intRound !== null ? `R${num(event.intRound)}` : str(event.strRound),
      homeSourceId: homeId,
      awaySourceId: awayId,
      homeName,
      awayName,
      scheduledAt,
      status: tsdStatus(statusRaw, str(event.strProgress)),
      homeScore: num(event.intHomeScore),
      awayScore: num(event.intAwayScore),
      venueName: str(event.strVenue),
    });
  }
  if (items.length === 0) warnings.push("no events in the payload");
  return { items, skipped, warnings };
}

export function normalizeTsdTable(payload: unknown, ctx: NormalizerContext): NormalizerResult<NormalizedStanding> {
  const items: NormalizedStanding[] = [];
  let skipped = 0;
  const seasonName = ctx.seasonName ?? null;

  for (const rowRaw of unwrap(payload)) {
    const row = rec(rowRaw);
    if (!row) {
      skipped += 1;
      continue;
    }
    const teamName = str(row.strTeam) ?? str(row.name);
    const teamId = str(row.idTeam) ?? (teamName ? derivedId("tsd", teamName) : null);
    const position = num(row.intPosition) ?? num(row.intRank);
    if (!teamName || !teamId || position === null) {
      skipped += 1;
      continue;
    }
    items.push({
      sourceId: `${ctx.competitionSlug}:${seasonName ?? "current"}:${teamId}`,
      competitionSlug: ctx.competitionSlug,
      seasonName,
      groupName: str(row.strGroup),
      teamSourceId: teamId,
      teamName,
      position,
      played: num(row.intPlayed) ?? 0,
      won: num(row.intWin) ?? 0,
      drawn: num(row.intDraw) ?? 0,
      lost: num(row.intLoss) ?? 0,
      goalsFor: num(row.intGoalsFor) ?? 0,
      goalsAgainst: num(row.intGoalsAgainst) ?? 0,
      points: num(row.intPoints) ?? 0,
      form: str(row.strForm),
      status: null,
    });
  }
  return { items, skipped, warnings: [] };
}

export function normalizeTsdTeams(payload: unknown): NormalizerResult<NormalizedTeam> {
  const items: NormalizedTeam[] = [];
  let skipped = 0;

  for (const teamRaw of unwrap(payload)) {
    const team = rec(teamRaw);
    if (!team) {
      skipped += 1;
      continue;
    }
    const id = str(team.idTeam);
    const name = str(team.strTeam) ?? str(team.strTeamAlternate);
    if (!id || !name) {
      skipped += 1;
      continue;
    }
    items.push({
      sourceId: id,
      name,
      shortName: str(team.strTeamShort),
      countryCode: str(team.strCountryCode) ?? null,
      logoUrl: str(team.strBadge) ?? str(team.strTeamBadge) ?? str(team.strLogo) ?? null,
      foundedYear: num(team.intFormedYear),
      venueName: str(team.strStadium) ?? null,
    });
  }
  return { items, skipped, warnings: [] };
}

/** Teams referenced by a schedule/table payload (no extra API call needed). */
export function teamsFromEvents(payload: unknown): NormalizedTeam[] {
  const seen = new Map<string, NormalizedTeam>();
  for (const eventRaw of unwrap(payload)) {
    const event = rec(eventRaw);
    if (!event) continue;
    const pairs: [unknown, unknown][] = [
      [event.idHomeTeam, event.strHomeTeam],
      [event.idAwayTeam, event.strAwayTeam],
    ];
    for (const [idRaw, nameRaw] of pairs) {
      const id = str(idRaw);
      const name = str(nameRaw);
      if (!id || !name || seen.has(id)) continue;
      seen.set(id, { sourceId: id, name, shortName: null, countryCode: null, logoUrl: null, foundedYear: null, venueName: null });
    }
  }
  return [...seen.values()];
}

export const THESPORTSDB_NORMALIZER = {
  source: "thesportsdb",
  matches: normalizeTsdMatches,
  standings: normalizeTsdTable,
  teams: normalizeTsdTeams,
} as const;

export { list };
