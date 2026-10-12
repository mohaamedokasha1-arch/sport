/**
 * NEMO Sports · Pipeline · web normalizers (EPL · EFA · FIFA)
 * ──────────────────────────────────────────────────────────
 * The priority-1 sources publish HTML, not a documented API. Two extraction
 * strategies, in this order:
 *
 *   1. **schema.org JSON-LD** — many league sites publish `SportsEvent`
 *      objects for search engines. Structured by the site itself, so it is the
 *      first thing to read.
 *   2. **HTML tables** — headers are matched against an Arabic/English alias
 *      table, so a table is only accepted when its meaning is unambiguous
 *      (a team column plus a points/played column). Anything else is skipped
 *      and counted, never guessed.
 *
 * Because `enabled: false` + `scraping_licensed: false` gate these sources in
 * the registry, this code path only ever runs after a human has confirmed the
 * licence AND the markup — which is exactly why the warnings it emits tell the
 * operator to re-verify against the live page before trusting a single row.
 */

import type { NormalizedCompetition, NormalizedMatch, NormalizedStanding, NormalizerContext, NormalizerResult } from "../types";
import { derivedId, iso, num, text } from "./util";
import { extractTables, findJsonLdSportsEvents, parseDateCell, parseScoreCell, type HtmlTable } from "./web";

/* ─── header aliases (Arabic + English) ──────────────────────────────────── */

type Column =
  | "position"
  | "team"
  | "played"
  | "won"
  | "drawn"
  | "lost"
  | "goalsFor"
  | "goalsAgainst"
  | "points"
  | "round"
  | "date"
  | "score"
  | "venue";

const ALIASES: Record<Column, string[]> = {
  position: ["#", "م", "الترتيب", "ترتيب", "المركز", "pos", "position", "rank", "no", "no."],
  team: ["الفريق", "فريق", "النادي", "نادى", "team", "club", "الاسم", "name"],
  played: ["لعب", "المباريات", "مباريات", "ل", "p", "pl", "mp", "played", "games"],
  won: ["فاز", "الفوز", "ف", "w", "won", "wins"],
  drawn: ["تعادل", "التعادل", "ت", "d", "drawn", "draws"],
  lost: ["خسر", "الخسارة", "خ", "لخ", "l", "lost", "losses"],
  goalsFor: ["له", "أهداف له", "اهداف له", "سجل", "gf", "for", "sf", "goals for"],
  goalsAgainst: ["عليه", "ضده", "أهداف عليه", "ga", "against", "sa", "goals against"],
  points: ["نقاط", "النقاط", "ن", "pts", "points", "pt"],
  round: ["الجولة", "جولة", "ج", "round", "md", "matchday", "week"],
  date: ["التاريخ", "تاريخ", "date", "time", "الموعد"],
  score: ["النتيجة", "نتيجة", "score", "result", "الاهداف", "الأهداف"],
  venue: ["الملعب", "الاستاد", "الإستاد", "stadium", "venue", "ground"],
};

const canonicalHeader = (raw: string): Column | null => {
  const value = raw.trim().toLowerCase().replace(/[\s._-]+/g, " ");
  if (!value) return null;
  for (const [column, aliases] of Object.entries(ALIASES) as [Column, string[]][]) {
    if (aliases.some((alias) => alias.toLowerCase() === value)) return column;
  }
  return null;
};

/** Score a table by how many columns are recognised; returns its column map. */
function mapColumns(table: HtmlTable): { columns: Partial<Record<Column, number>>; score: number } {
  const columns: Partial<Record<Column, number>> = {};
  table.headers.forEach((header, index) => {
    const column = canonicalHeader(header);
    if (column && columns[column] === undefined) columns[column] = index;
  });
  return { columns, score: Object.keys(columns).length };
}

/* ─── standings ──────────────────────────────────────────────────────────── */

export function normalizeWebStandings(html: string, ctx: NormalizerContext): NormalizerResult<NormalizedStanding> {
  const warnings: string[] = [];
  const items: NormalizedStanding[] = [];
  let skipped = 0;

  const candidates = extractTables(html)
    .map((table) => ({ table, ...mapColumns(table) }))
    .filter((c) => c.columns.team !== undefined && (c.columns.points !== undefined || c.columns.played !== undefined))
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (!best) {
    return { items, skipped, warnings: ["no recognisable standings table (needs a team column plus points/played)"] };
  }
  if (best.score < 4) warnings.push(`standings table matched only ${best.score} columns — verify the page markup before trusting it`);

  const cell = (row: string[], index: number | undefined): string | null => (index === undefined ? null : row[index] ?? null);

  best.table.rows.forEach((row, index) => {
    const teamName = text(cell(row, best.columns.team));
    if (!teamName) {
      skipped += 1;
      return;
    }
    // Some sites repeat the header row inside <tbody>; a row without a number
    // in the position column is not a standings row.
    const position = num(cell(row, best.columns.position)) ?? index + 1;
    const points = num(cell(row, best.columns.points)) ?? 0;
    const played = num(cell(row, best.columns.played)) ?? 0;
    if (played === 0 && points === 0 && best.columns.played !== undefined && best.columns.points !== undefined) {
      skipped += 1;
      return;
    }
    items.push({
      sourceId: `${ctx.competitionSlug}:${ctx.seasonName ?? "current"}:${derivedId(teamName)}`,
      competitionSlug: ctx.competitionSlug,
      seasonName: ctx.seasonName ?? null,
      groupName: null,
      teamSourceId: derivedId(teamName),
      teamName,
      position,
      played,
      won: num(cell(row, best.columns.won)) ?? 0,
      drawn: num(cell(row, best.columns.drawn)) ?? 0,
      lost: num(cell(row, best.columns.lost)) ?? 0,
      goalsFor: num(cell(row, best.columns.goalsFor)) ?? 0,
      goalsAgainst: num(cell(row, best.columns.goalsAgainst)) ?? 0,
      points,
      form: null,
      status: null,
    });
  });

  return { items, skipped, warnings };
}

/* ─── matches ────────────────────────────────────────────────────────────── */

const looksLikeTeam = (value: string | null): boolean => {
  const v = text(value);
  if (!v) return false;
  if (v.length < 3 || v.length > 60) return false;
  if (/^\d+$/.test(v)) return false;
  if (parseDateCell(v) || parseScoreCell(v)) return false;
  return /[\p{L}]/u.test(v);
};

export function normalizeWebMatches(html: string, ctx: NormalizerContext): NormalizerResult<NormalizedMatch> {
  const warnings: string[] = [];
  const items: NormalizedMatch[] = [];
  let skipped = 0;

  // 1 · structured data published by the site
  for (const event of findJsonLdSportsEvents(html)) {
    const scheduledAt = iso(event.startDate);
    if (!scheduledAt || !event.homeName || !event.awayName) {
      skipped += 1;
      continue;
    }
    const hasScore = event.homeScore !== null && event.awayScore !== null;
    items.push({
      sourceId: derivedId(ctx.competitionSlug, event.homeName, event.awayName, scheduledAt),
      competitionSlug: ctx.competitionSlug,
      seasonName: ctx.seasonName ?? null,
      round: null,
      homeSourceId: derivedId("web", event.homeName),
      awaySourceId: derivedId("web", event.awayName),
      homeName: event.homeName,
      awayName: event.awayName,
      scheduledAt,
      status: hasScore ? "finished" : "scheduled",
      homeScore: event.homeScore,
      awayScore: event.awayScore,
      venueName: event.venue,
    });
  }
  if (items.length) {
    warnings.push("matches came from schema.org JSON-LD published by the source");
    return { items, skipped, warnings };
  }

  // 2 · HTML tables: a row must contain a date cell and a score cell, with two
  //     readable team names between them.
  for (const table of extractTables(html)) {
    const { columns } = mapColumns(table);
    for (const row of table.rows) {
      const cells = row.map((c) => text(c));
      const dateCell = cells.find((c) => parseDateCell(c));
      const scoreIndex = cells.findIndex((c) => parseScoreCell(c));
      const scheduledDate = parseDateCell(dateCell ?? null);
      if (!scheduledDate || scoreIndex < 0) continue;

      const teamCells = cells.filter((c, index) => index !== scoreIndex && looksLikeTeam(c) && c !== dateCell);
      if (teamCells.length < 2) {
        skipped += 1;
        continue;
      }
      const [score] = ((): [number, number] | null => parseScoreCell(cells[scoreIndex] ?? null))() as [number, number];
      const home = teamCells[0]!;
      const away = teamCells[1]!;
      const roundCell = columns.round !== undefined ? text(row[columns.round] ?? null) : null;
      items.push({
        sourceId: derivedId(ctx.competitionSlug, home, away, scheduledDate),
        competitionSlug: ctx.competitionSlug,
        seasonName: ctx.seasonName ?? null,
        round: roundCell,
        homeSourceId: derivedId("web", home),
        awaySourceId: derivedId("web", away),
        homeName: home,
        awayName: away,
        scheduledAt: scheduledDate,
        status: "finished",
        homeScore: score,
        awayScore: parseScoreCell(cells[scoreIndex] ?? null)?.[1] ?? null,
        venueName: columns.venue !== undefined ? text(row[columns.venue] ?? null) : null,
      });
    }
    if (items.length) break;
  }

  if (items.length === 0) warnings.push("no recognisable fixtures/results table on the page");
  else warnings.push("matches were read from an HTML table heuristic — verify the markup after any site redesign");
  return { items, skipped, warnings };
}

/* ─── competitions (catalog discovery) ───────────────────────────────────── */

export function normalizeWebCompetitions(html: string, ctx: NormalizerContext): NormalizerResult<NormalizedCompetition> {
  const items: NormalizedCompetition[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  const offers = (label: string, href: string): void => {
    const name = text(label);
    if (!name || name.length < 4 || name.length > 80) return;
    if (!/(دوري|كأس|كاس|بطولة|سوبر|league|cup|tournament|competition|premier)/i.test(name)) return;
    const key = derivedId(name);
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ sourceId: href || key, slug: key, name });
  };

  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    offers(match[2] ?? "", match[1] ?? "");
    if (items.length > 40) break;
  }

  if (items.length === 0) warnings.push("no competition links recognised on the page");
  return { items, skipped: 0, warnings };
}

export const WEB_NORMALIZER = {
  matches: normalizeWebMatches,
  standings: normalizeWebStandings,
  competitions: normalizeWebCompetitions,
} as const;
