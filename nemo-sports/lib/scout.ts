import type { NormalizedFixture, NormalizedTopScorer } from "@/packages/sdl/src";

export function completedSample(fixtures: NormalizedFixture[]): NormalizedFixture[] {
  return [...new Map(fixtures.filter((f) => f.status === "finished" &&
    Number.isFinite(Date.parse(f.scheduledAt)) && f.homeProviderId && f.awayProviderId &&
    Number.isInteger(f.homeScore) && Number.isInteger(f.awayScore) && f.homeScore! >= 0 && f.awayScore! >= 0)
    .map((f) => [f.providerId, f])).values()].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export function teamSample(fixtures: NormalizedFixture[], team: string, venue: "all" | "home" | "away" = "all") {
  const matches = completedSample(fixtures).filter((f) => venue === "home" ? f.homeProviderId === team : venue === "away" ? f.awayProviderId === team : f.homeProviderId === team || f.awayProviderId === team);
  const results = matches.map((f) => {
    const home = f.homeProviderId === team;
    const scored = (home ? f.homeScore : f.awayScore)!;
    const conceded = (home ? f.awayScore : f.homeScore)!;
    return { fixture: f, scored, conceded, result: scored > conceded ? "W" : scored < conceded ? "L" : "D" };
  });
  return { played: results.length, won: results.filter((r) => r.result === "W").length,
    drawn: results.filter((r) => r.result === "D").length, lost: results.filter((r) => r.result === "L").length,
    goalsFor: results.reduce((n, r) => n + r.scored, 0), goalsAgainst: results.reduce((n, r) => n + r.conceded, 0),
    recent: results.slice(-5), from: matches[0]?.scheduledAt ?? null, to: matches.at(-1)?.scheduledAt ?? null };
}

export function headToHead(fixtures: NormalizedFixture[], a: string, b: string): NormalizedFixture[] {
  if (!a || a === b) return [];
  return completedSample(fixtures).filter((f) => (f.homeProviderId === a && f.awayProviderId === b) || (f.homeProviderId === b && f.awayProviderId === a));
}

export interface ScoutTeam {
  id: string;
  name: string;
  /** completed matches of this team in the provider sample */
  completed: number;
}

/**
 * Selectable teams, identified by the PROVIDER id (never renamed), named by
 * the provider label. Teams with completed matches come first, so the default
 * comparison shows real numbers instead of two columns of «غير متاح».
 */
export function scoutTeams(fixtures: NormalizedFixture[]): ScoutTeam[] {
  const names = new Map<string, string>();
  for (const f of fixtures) {
    if (f.homeProviderId && f.homeName && !names.has(f.homeProviderId)) names.set(f.homeProviderId, f.homeName);
    if (f.awayProviderId && f.awayName && !names.has(f.awayProviderId)) names.set(f.awayProviderId, f.awayName);
  }
  const done = completedSample(fixtures);
  const counts = new Map<string, number>();
  for (const f of done) {
    counts.set(f.homeProviderId!, (counts.get(f.homeProviderId!) ?? 0) + 1);
    counts.set(f.awayProviderId!, (counts.get(f.awayProviderId!) ?? 0) + 1);
  }
  return [...names.entries()]
    .map(([id, name]) => ({ id, name, completed: counts.get(id) ?? 0 }))
    .sort((x, y) => y.completed - x.completed || x.name.localeCompare(y.name));
}

export type TeamSelectionIssue = "no-teams" | "one-team" | "missing" | "same" | null;

/** Validation for the two team pickers — the message shown instead of a table. */
export function teamSelectionIssue(teams: ScoutTeam[], a: string, b: string): TeamSelectionIssue {
  if (teams.length === 0) return "no-teams";
  if (teams.length === 1) return "one-team";
  const known = new Set(teams.map((t) => t.id));
  if (!a || !b || !known.has(a) || !known.has(b)) return "missing";
  if (a === b) return "same";
  return null;
}

export const TEAM_SELECTION_MESSAGE_AR: Record<Exclude<TeamSelectionIssue, null>, string> = {
  "no-teams": "لا تتضمن عينة المصدر الحالية لهذه البطولة أي مباراة بفريقين معروفين، لذلك لا يمكن المقارنة الآن.",
  "one-team": "تتضمن عينة المصدر فريقًا واحدًا فقط لهذه البطولة — لا يوجد فريق ثانٍ للمقارنة.",
  missing: "اختر فريقين من القائمة.",
  same: "اختر فريقين مختلفين — لا معنى لمقارنة الفريق بنفسه.",
};

export type PlayerMetricKey = "goals" | "appearances" | "assists" | "penalties";
export const PLAYER_METRICS: [PlayerMetricKey, string][] = [
  ["goals", "الأهداف"],
  ["appearances", "المشاركات"],
  ["assists", "التمريرات الحاسمة"],
  ["penalties", "أهداف الجزاء"],
];

/** The two selected scorers, or the reason no comparison is shown. */
export function playerComparison(scorers: NormalizedTopScorer[], p1: string, p2: string):
  | { ok: true; one: NormalizedTopScorer; two: NormalizedTopScorer; rows: { key: PlayerMetricKey; label: string; one: number | null; two: number | null }[] }
  | { ok: false; reason: "no-scorers" | "missing" | "same" } {
  if (scorers.length === 0) return { ok: false, reason: "no-scorers" };
  const one = scorers.find((p) => p.playerProviderId === p1);
  const two = scorers.find((p) => p.playerProviderId === p2);
  if (!one || !two) return { ok: false, reason: "missing" };
  if (p1 === p2) return { ok: false, reason: "same" };
  const value = (p: NormalizedTopScorer, key: PlayerMetricKey): number | null => {
    const v = p[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  return { ok: true, one, two, rows: PLAYER_METRICS.map(([key, label]) => ({ key, label, one: value(one, key), two: value(two, key) })) };
}
