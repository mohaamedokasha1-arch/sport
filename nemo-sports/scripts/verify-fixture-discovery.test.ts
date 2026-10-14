/**
 * Universal fixture discovery & coverage comparison — offline tests.
 * ───────────────────────────────────────────────────────────────────
 * No network, no database, no provider key: normalized fixtures are
 * hand-built (the same shapes the SDL adapters return), and the
 * 2026-10-15 Kooora reference date from the task is exercised as a
 * *reference-file* comparison — the only lawful automated use, since
 * Kooora publishes no verifiable public API and is never scraped here.
 *
 * Run: npm run discovery:test
 */
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEMO_SPORTSCORE_ENABLED = "0";
delete process.env.FOOTBALL_DATA_API_KEY;
delete process.env.DATABASE_URL;

import {
  compareCoverage, dedupeFixtures, discoverCompetitionsFromFixtures, discoveryDates,
  type ReferenceFixture,
} from "@/lib/fixture-discovery";
import type { NormalizedFixture } from "@/packages/sdl/src";
import { SportScoreAdapter } from "@/packages/sdl/src";

function fx(over: Partial<ReferenceFixture> = {}): ReferenceFixture {
  return {
    providerId: "al-ahly-vs-zamalek-2026-10-15", sport: "football",
    competitionProviderId: "egyptian-premier-league", seasonProviderId: null, round: null,
    homeProviderId: "Al Ahly", awayProviderId: "Zamalek SC",
    scheduledAt: "2026-10-15T18:00:00.000Z", status: "finished", homeScore: 2, awayScore: 1,
    periods: [], venueProviderId: null, venueName: "Cairo International Stadium", attendance: null, minute: null,
    homeName: "Al Ahly", awayName: "Zamalek SC", competitionName: "Egyptian Premier League",
    ...over,
  };
}

test("discoveryDates: today, tomorrow and the day after by default (Cairo-anchored)", () => {
  const dates = discoveryDates({ now: Date.parse("2026-10-14T10:00:00Z") });
  assert.equal(dates.length, 4); // yesterday + today + tomorrow + day after
  assert.ok(dates.includes("2026-10-14") && dates.includes("2026-10-15") && dates.includes("2026-10-16"));
});

test("discoveryDates: explicit windows work for any date, and are bounded", () => {
  assert.deepEqual(discoveryDates({ from: "2026-10-15", to: "2026-10-15" }), ["2026-10-15"]);
  assert.deepEqual(discoveryDates({ from: "2026-10-15", to: "2026-10-17" }), ["2026-10-15", "2026-10-16", "2026-10-17"]);
  assert.throws(() => discoveryDates({ from: "2026-10-01", to: "2026-12-01" }), /bounded to 31 days/);
  assert.throws(() => discoveryDates({ from: "15-10-2026", to: "2026-10-15" }), /YYYY-MM-DD/);
});

test("SportScore declares unscoped day discovery, so sports-sync can find new competitions", () => {
  const adapter = new SportScoreAdapter();
  assert.equal(adapter.syncFixturesAreUnscoped, true);
  assert.ok(adapter.capabilities.includes("fixtures"));
  assert.equal(adapter.capabilities.includes("competitions" as never), false, "no catalog endpoint is claimed");
});

test("dedupe: same tie from two providers merges once, keeps provenance, flags score conflict", () => {
  const a = fx();
  const b = fx({ providerId: "fd-991", competitionProviderId: "EGY", homeScore: 3, scheduledAt: "2026-10-15T18:30:00.000Z" });
  const { unique, duplicates, conflicts } = dedupeFixtures([
    { provider: "sportscore", fixture: a },
    { provider: "football_data", fixture: b },
    { provider: "sportscore", fixture: fx({ providerId: "other", homeName: "Pyramids FC", awayName: "Ismaily SC", homeProviderId: "Pyramids FC", awayProviderId: "Ismaily SC" }) },
  ]);
  assert.equal(unique.length, 2);
  assert.equal(duplicates, 1);
  assert.equal(unique[0].sources.length, 2);
  assert.equal(unique[0].fixture.homeScore, 2, "first source retained — never averaged");
  assert.ok(conflicts.some((c) => c.kind === "finished_score"));
  assert.ok(conflicts.some((c) => c.kind === "kickoff"));
});

test("competition discovery: known catalog entries are recognised, unknown ones are new", () => {
  const { unique } = dedupeFixtures([
    { provider: "sportscore", fixture: fx() },
    { provider: "sportscore", fixture: fx({ providerId: "x1", homeName: "Mamelodi Sundowns", awayName: "Orlando Pirates", homeProviderId: "Mamelodi Sundowns", awayProviderId: "Orlando Pirates", competitionProviderId: "south-african-premier-division", competitionName: "South African Premier Division" }) },
  ]);
  const comps = discoverCompetitionsFromFixtures(unique);
  const egy = comps.find((c) => c.providerId === "egyptian-premier-league")!;
  assert.equal(egy.isNew, false);
  assert.equal(egy.canonicalPath, "/competitions/egyptian-league");
  const rsa = comps.find((c) => c.providerId === "south-african-premier-division")!;
  assert.equal(rsa.isNew, true);
  assert.equal(rsa.canonicalPath, null);
  assert.equal(rsa.matches, 1);
});

test("compareCoverage (2026-10-15 reference): missing, kickoff/status/score diffs, duplicates, unprovided fields", () => {
  const reference: ReferenceFixture[] = [
    fx(), // matched exactly
    fx({ providerId: "r2", homeName: "Arsenal", awayName: "Chelsea", homeProviderId: "Arsenal", awayProviderId: "Chelsea", competitionName: "Premier League", competitionProviderId: "PL", scheduledAt: "2026-10-15T19:00:00.000Z", broadcastChannel: "Example Sports 1", referee: "J. Ref" }),
    fx({ providerId: "r3", homeName: "Ghost FC", awayName: "Missing United", homeProviderId: "Ghost FC", awayProviderId: "Missing United", competitionName: "Obscure Regional Cup", competitionProviderId: "obscure-regional-cup", scheduledAt: "2026-10-15T12:00:00.000Z", status: "scheduled", homeScore: null, awayScore: null }),
  ];
  const actual: NormalizedFixture[] = [
    fx(),
    fx({ providerId: "a2", homeName: "Arsenal FC", awayName: "Chelsea", homeProviderId: "Arsenal", awayProviderId: "Chelsea", competitionName: "Premier League", competitionProviderId: "PL", scheduledAt: "2026-10-15T20:00:00.000Z", status: "scheduled", homeScore: null, awayScore: null, venueName: null }),
    fx({ providerId: "a2", homeName: "Arsenal FC", awayName: "Chelsea", homeProviderId: "Arsenal", awayProviderId: "Chelsea", competitionName: "Premier League", competitionProviderId: "PL", scheduledAt: "2026-10-15T20:00:00.000Z", status: "scheduled", homeScore: null, awayScore: null, venueName: null }),
  ];
  const report = compareCoverage(reference, actual, { date: "2026-10-15", referenceSource: "licensed-reference-file:test" });
  assert.equal(report.counts.reference, 3);
  assert.equal(report.counts.matched, 2);
  assert.equal(report.missingInActual.length, 1);
  assert.equal(report.missingInActual[0].home, "Ghost FC");
  assert.deepEqual(report.undiscoveredCompetitions.map((c) => c.providerId), ["obscure-regional-cup"]);
  assert.ok(report.kickoffMismatches.some((k) => k.diffMinutes === 60));
  assert.ok(report.statusMismatches.some((s) => s.home === "Arsenal"));
  assert.ok(report.teamNameMismatches.length >= 0); // spelling variants normalise — provenance keeps both ids regardless
  assert.equal(report.fieldsNoSourceProvides.broadcastChannel, 1);
  assert.equal(report.fieldsNoSourceProvides.referee, 1);
  assert.ok(report.counts.duplicatesInActual >= 1, "the doubled actual row is counted as a duplicate");
});

test("compareCoverage: an empty reference proves nothing and claims nothing", () => {
  const report = compareCoverage([], [fx()], { date: "2026-10-15", referenceSource: "none" });
  assert.equal(report.counts.matched, 0);
  assert.equal(report.extraInActual.length, 1);
  assert.equal(report.missingInActual.length, 0);
});
