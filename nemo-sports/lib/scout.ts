import type { NormalizedFixture } from "@/packages/sdl/src";
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
