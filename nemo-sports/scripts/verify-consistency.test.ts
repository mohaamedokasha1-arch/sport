/**
 * Regression tests — post-deployment fixes of 2026-10-11.
 *   P1  one live-state model: live counts agree for the same sport/date scope
 *   P3  broadcast lifecycle separate from match state
 *   P4  team monograms / score orientation (no accidental duplication)
 * Offline: pure modules only, no server, no network, no database.
 * Run: npm run consistency:test
 */
import test from "node:test";
import assert from "node:assert/strict";

if (process.env.DATABASE_URL) throw new Error("Offline regression tests refuse a configured database");
process.env.NEMO_TEST_MEMORY_ONLY = "1";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { NormalizedFixture } from "@/packages/sdl/src";
import { mapSportScoreStatus } from "@/packages/sdl/src";
import { buildSportBoard, reconcileFixtures, summarizeBoards, type SnapshotInput } from "@/lib/live-reconcile";
import { LIVE_CLAIM_MAX_AGE_MS, UNVERIFIED_STATUS, matchStateOf, unconfirmedNoteAr, UNVERIFIED_NOTE_AR, UNCONFIRMED_NOTE_AR } from "@/lib/match-state";
import { filterProviderMatches, providerMatchCounts, dateScopeIncludesToday } from "@/lib/provider-match-filter";
import { resolveDateParam, validateMatchQuery } from "@/lib/match-query";
import { broadcastStateOf, broadcastBadgeAr, hasRightsEvidence, streamApproval, type BroadcastStreamFacts } from "@/lib/broadcast-state";
import { inactiveStreamNote, streamPhase } from "@/lib/match-streams";
import { teamMonogram } from "@/lib/team-monogram";
import ScorePair from "@/components/ui/ScorePair";
import ProviderCrest from "@/components/ui/ProviderCrest";

const NOW = Date.parse("2026-10-11T01:00:00Z"); // 04:00 Cairo
const iso = (ms: number) => new Date(ms).toISOString();

function fx(over: Partial<NormalizedFixture> = {}): NormalizedFixture {
  return {
    providerId: "a-vs-b",
    sport: "football",
    competitionProviderId: "League",
    seasonProviderId: null,
    round: null,
    homeProviderId: "A",
    awayProviderId: "B",
    scheduledAt: iso(NOW - 30 * 60_000),
    status: "live",
    homeScore: 1,
    awayScore: 0,
    periods: [],
    venueProviderId: null,
    venueName: null,
    attendance: null,
    minute: null,
    homeName: "A",
    awayName: "B",
    competitionName: "League",
    ...over,
  };
}

const snap = (fixtures: NormalizedFixture[], at = NOW - 10_000, over: Partial<SnapshotInput> = {}): SnapshotInput => ({
  ok: true,
  provider: "sportscore",
  fetchedAt: iso(at),
  stale: false,
  degraded: false,
  fixtures,
  ...over,
});
const failed: SnapshotInput = { ok: false, error: "network down" };

/* ───────────────────────────── P1 ───────────────────────────── */

test("P1 · scope: football-only vs all sports is the production 16 vs 24 — the board reports both, explicitly", () => {
  const football = Array.from({ length: 16 }, (_, i) => fx({ providerId: `f${i}` }));
  const basketball = Array.from({ length: 8 }, (_, i) => fx({ providerId: `b${i}`, sport: "basketball" }));
  const boards = [
    buildSportBoard("football", snap(football), snap(football), NOW),
    buildSportBoard("basketball", snap(basketball), snap(basketball), NOW),
    buildSportBoard("tennis", snap([]), snap([]), NOW),
    buildSportBoard("cricket", snap([]), snap([]), NOW),
  ];
  const all = summarizeBoards(boards);
  assert.equal(all.total, 24);
  assert.deepEqual(all.bySport, { football: 16, basketball: 8, tennis: 0, cricket: 0 });
  assert.equal(summarizeBoards(boards.filter((b) => b.sport === "football")).total, 16);
  assert.equal(all.live[0].sport, "football", "football first, then the other sports");
});

test("P1 · the /matches?date=today live bucket equals the board's live count for the same scope", () => {
  const live = [fx({ providerId: "l1" }), fx({ providerId: "l2", sport: "basketball" })];
  // a live match that kicked off yesterday (Cairo) at 23:40 and is still running
  const overnight = fx({ providerId: "l3", scheduledAt: "2026-10-10T20:40:00Z" });
  const schedule = [...live, overnight, fx({ providerId: "s1", status: "scheduled", scheduledAt: iso(NOW + 3_600_000) })];
  const boards = ["football", "basketball"].map((sport) =>
    buildSportBoard(sport, snap([...live, overnight].filter((f) => f.sport === sport)), snap(schedule.filter((f) => f.sport === sport)), NOW),
  );
  const summary = summarizeBoards(boards);
  const reconciled = reconcileFixtures(schedule, { fetchedAt: iso(NOW - 10_000), provider: "sportscore" }, boards, NOW);
  const counts = providerMatchCounts(reconciled, { date: "today" }, NOW);
  assert.equal(summary.total, 3);
  assert.equal(counts["status:live"], summary.total, "same scope → same live count");
  assert.equal(filterProviderMatches(reconciled, { date: "today", status: "live" }, NOW).length, 3);
  assert.equal(filterProviderMatches(reconciled, { date: "today", status: "live", sport: "football" }, NOW).length, summarizeBoards(boards.filter((b) => b.sport === "football")).total);
});

test("P1 · freshest snapshot wins; a live claim the fresher live view no longer lists is withdrawn (not hidden)", () => {
  const olderSchedule = snap([fx({ providerId: "ended-1" }), fx({ providerId: "still-1" })], NOW - 50_000);
  const newerLive = snap([fx({ providerId: "still-1", minute: 70 })], NOW - 5_000);
  const board = buildSportBoard("football", newerLive, olderSchedule, NOW);
  assert.deepEqual(board.live.map((f) => f.providerId), ["still-1"]);
  assert.equal(board.versions.get("still-1")!.fixture.minute, 70, "fresher version used");
  const ended = board.versions.get("ended-1")!.fixture;
  assert.equal(ended.status, UNVERIFIED_STATUS, "kept, but not counted live");
  assert.equal(matchStateOf(ended.status, ended.scheduledAt, NOW), "unconfirmed");
  assert.equal(unconfirmedNoteAr(ended.status), UNVERIFIED_NOTE_AR);
});

test("P1 · a schedule FRESHER than the live view decides (same upstream feed)", () => {
  const olderLive = snap([fx({ providerId: "x" })], NOW - 50_000);
  const newerSchedule = snap([fx({ providerId: "x", status: "finished", homeScore: 2, awayScore: 1 })], NOW - 5_000);
  const board = buildSportBoard("football", olderLive, newerSchedule, NOW);
  assert.equal(board.live.length, 0);
  assert.equal(board.versions.get("x")!.fixture.status, "finished");
});

test("P1 · an hour-old stale 'live' (provider outage) is never presented as live", () => {
  const staleSchedule = snap([fx({ providerId: "old" })], NOW - 60 * 60_000, { stale: true, degraded: true });
  const board = buildSportBoard("football", failed, staleSchedule, NOW);
  assert.equal(board.ok, true, "the schedule still answered");
  assert.equal(board.live.length, 0);
  assert.equal(board.versions.get("old")!.fixture.status, UNVERIFIED_STATUS);
  // within the allowed age it still counts
  const fresh = buildSportBoard("football", failed, snap([fx({ providerId: "ok" })], NOW - (LIVE_CLAIM_MAX_AGE_MS - 1_000)), NOW);
  assert.equal(fresh.live.length, 1);
});

test("P1 · provider failure is reported as failure, never as 'no live matches'", () => {
  const board = buildSportBoard("football", failed, failed, NOW);
  assert.equal(board.ok, false);
  const summary = summarizeBoards([board, buildSportBoard("basketball", snap([fx({ providerId: "b", sport: "basketball" })]), failed, NOW)]);
  assert.equal(summary.ok, true);
  assert.equal(summary.complete, false);
  assert.deepEqual(summary.failedSports, ["football"]);
  assert.equal(summary.total, 1);
});

test("P1 · editorial 'live' is trusted, but not 6 hours after kickoff", () => {
  const editorial = fx({ providerId: "adm", editorialUpdatedAt: "2026-10-01T00:00:00Z" });
  assert.equal(buildSportBoard("football", failed, snap([editorial], NOW - 10 * 60_000), NOW).live.length, 1);
  const forgotten = fx({ providerId: "adm2", editorialUpdatedAt: "2026-10-01T00:00:00Z", scheduledAt: iso(NOW - 7 * 3_600_000) });
  assert.equal(buildSportBoard("football", failed, snap([forgotten]), NOW).live.length, 0);
});

test("P1 · SportScore status_text: period labels are not minutes; Half time / Postponed are real states", () => {
  assert.deepEqual(mapSportScoreStatus("live", "1st half"), { status: "live", minute: null });
  assert.deepEqual(mapSportScoreStatus("live", "2nd quarter"), { status: "live", minute: null });
  assert.deepEqual(mapSportScoreStatus("live", "Half time"), { status: "halftime", minute: null });
  assert.deepEqual(mapSportScoreStatus("upcoming", "Postponed"), { status: "postponed", minute: null });
  assert.equal(matchStateOf("halftime", iso(NOW - 3_000_000), NOW), "live", "a break inside a live match is still live");
});

test("P1 · /api/v1/matches accepts the same date words as /matches; sport=all is a valid scope", () => {
  assert.equal(validateMatchQuery(new URLSearchParams("date=today")), null);
  assert.equal(validateMatchQuery(new URLSearchParams("date=yesterday&sport=all")), null);
  assert.equal(resolveDateParam("today", NOW), "2026-10-11");
  assert.equal(resolveDateParam("yesterday", NOW), "2026-10-10");
  assert.equal(resolveDateParam("tomorrow", NOW), "2026-10-12");
  assert.equal(resolveDateParam("2026-02-30", NOW), null);
  assert.ok(validateMatchQuery(new URLSearchParams("date=someday")));
  assert.ok(validateMatchQuery(new URLSearchParams("sport=curling")));
  assert.equal(dateScopeIncludesToday("today", NOW), true);
  assert.equal(dateScopeIncludesToday("2026-10-11", NOW), true);
  assert.equal(dateScopeIncludesToday("tomorrow", NOW), false);
});

/* ───────────────────────────── P3 ───────────────────────────── */

const approved: BroadcastStreamFacts = {
  status: "published",
  enabled: true,
  rightsHolder: "beIN SPORTS MENA",
  rightsEvidence: "https://www.beinsports.com/rights/x",
  displayable: true,
};

test("P3 · live match + approved stream with rights evidence → playable LIVE", () => {
  const v = broadcastStateOf(approved, { status: "live", scheduledAt: iso(NOW - 1_800_000) }, NOW)!;
  assert.equal(v.state, "live");
  assert.equal(v.playable, true);
  assert.equal(v.activeNow, true);
  assert.equal(broadcastBadgeAr(v), "يبث الآن");
});

test("P3 · scheduled match ahead → standby (player may render, not 'active now')", () => {
  const v = broadcastStateOf(approved, { status: "scheduled", scheduledAt: iso(NOW + 3_600_000) }, NOW)!;
  assert.equal(v.state, "standby");
  assert.equal(v.playable, true);
  assert.equal(v.activeNow, false);
});

test("P3 · past fixture still 'scheduled' (unconfirmed) → expired, and NEVER labelled finished", () => {
  const v = broadcastStateOf({ ...approved, status: "live" }, { status: "scheduled", scheduledAt: "2026-10-09T14:55:00Z" }, NOW)!;
  assert.equal(v.matchState, "unconfirmed");
  assert.equal(v.state, "expired");
  assert.equal(v.playable, false);
  assert.doesNotMatch(v.noticeAr, /انتهت المباراة/);
  assert.equal(broadcastBadgeAr(v), "انتهت نافذة البث");
  // the legacy helper used by older callers agrees
  assert.doesNotMatch(inactiveStreamNote("scheduled", "2026-10-09T14:55:00Z"), /انتهت المباراة/);
  assert.equal(streamPhase("scheduled", "2026-10-09T14:55:00Z", NOW), "inactive");
});

test("P3 · today's kickoff, source still 'scheduled' long after the window → expired", () => {
  const v = broadcastStateOf(approved, { status: "scheduled", scheduledAt: iso(NOW - 4 * 3_600_000), sport: "football" }, NOW + 0)!;
  // 4 h after kickoff, same Cairo day → match state is still "upcoming", but the football window (3 h) is over
  assert.equal(v.state, "expired");
  assert.equal(v.playable, false);
});

test("P3 · finished / postponed / cancelled / suspended matches → expired with the matching notice", () => {
  const cases: [string, RegExp, string][] = [
    ["finished", /انتهت المباراة/, "انتهت المباراة"],
    ["postponed", /تأجّلت/, "مؤجَّلة"],
    ["cancelled", /أُلغيت/, "ملغاة"],
    ["suspended", /موقوفة/, "موقوفة"],
    ["abandoned", /توقّفت/, "متوقفة"],
  ];
  for (const [status, notice, badge] of cases) {
    const v = broadcastStateOf(approved, { status, scheduledAt: iso(NOW - 3_600_000) }, NOW)!;
    assert.equal(v.state, "expired", status);
    assert.equal(v.playable, false, status);
    assert.match(v.noticeAr, notice, status);
    assert.equal(broadcastBadgeAr(v), badge, status);
  }
});

test("P3 · an operator-ended stream is never playable, even while the match is live", () => {
  const v = broadcastStateOf({ ...approved, status: "ended" }, { status: "live", scheduledAt: iso(NOW - 600_000) }, NOW)!;
  assert.equal(v.state, "ended");
  assert.equal(v.playable, false);
  assert.equal(v.publicVisible, false);
});

test("P3 · approval and rights evidence are independent requirements", () => {
  assert.equal(streamApproval({ ...approved, status: "draft" }), "unpublished");
  assert.equal(streamApproval({ ...approved, status: "disabled" }), "unpublished");
  assert.equal(streamApproval({ ...approved, enabled: false }), "unpublished");
  assert.equal(streamApproval({ ...approved, displayable: false }), "unpublished");
  assert.equal(streamApproval({ ...approved, rightsEvidence: "" }), "review");
  assert.equal(streamApproval({ ...approved, rightsHolder: "  " }), "review");
  assert.equal(hasRightsEvidence(approved), true);
  const review = broadcastStateOf({ ...approved, rightsEvidence: "" }, { status: "live", scheduledAt: iso(NOW) }, NOW)!;
  assert.equal(review.state, "review");
  assert.equal(review.playable, false, "a live match does not make an unapproved link playable");
  assert.equal(review.publicVisible, false);
});

/* ───────────────────────────── P4 ───────────────────────────── */

test("P4 · monograms: initials, not a 3-letter slice; Arabic ignores the article; provider codes kept", () => {
  assert.equal(teamMonogram("Vaqueros Reynosa"), "VR");
  assert.equal(teamMonogram("Real Madriz FC"), "RM");
  assert.equal(teamMonogram("São Paulo - SP"), "SP");
  assert.equal(teamMonogram("Diriangen"), "DIR");
  assert.equal(teamMonogram("Criollos de Caguas (W)"), "CC");
  assert.equal(teamMonogram("الأهلي"), "أ");
  assert.equal(teamMonogram("بوروسيا دورتموند"), "بد");
  assert.equal(teamMonogram("Manchester City", "MCI"), "MCI", "a valid provider abbreviation is preserved");
  assert.equal(teamMonogram(""), "؟");
  assert.equal(teamMonogram("Club Atlético Independiente de Avellaneda Reserve Team"), "AI");
});

test("P4 · fallback crest is decorative and CSS-drawn: no duplicate name text in the DOM", () => {
  const html = renderToStaticMarkup(createElement(ProviderCrest, { name: "Vaqueros Reynosa", logoUrl: null, size: 22 }));
  assert.match(html, /data-monogram="VR"/);
  assert.match(html, /aria-hidden="true"/);
  assert.doesNotMatch(html, />Vaq</, "no visible 'Vaq' text node next to the name");
  assert.doesNotMatch(html, />[^<]+</, "the badge contains no text node at all");
  const img = renderToStaticMarkup(createElement(ProviderCrest, { name: "River Plate", logoUrl: "https://img.example/x.png" }));
  assert.match(img, /alt=""/, "logo next to a visible name is not announced twice");
  const labelled = renderToStaticMarkup(createElement(ProviderCrest, { name: "River Plate", logoUrl: null, decorative: false }));
  assert.match(labelled, /role="img"/);
  assert.match(labelled, /aria-label="شعار River Plate/);
});

test("P4 · score pair: home score is the first child (right side in RTL), no dir=ltr flip", () => {
  const html = renderToStaticMarkup(createElement(ScorePair, { home: 0, away: 1 }));
  assert.doesNotMatch(html, /dir="ltr"/);
  const order = [...html.matchAll(/<bdi[^>]*>([^<]*)<\/bdi>/g)].map((m) => m[1]);
  assert.deepEqual(order, ["0", "1"], "home first, away second");
  assert.match(html, /صاحب الأرض 0، الضيف 1/);
});

test("matchStateOf keeps both unconfirmed explanations distinct", () => {
  assert.equal(unconfirmedNoteAr("scheduled"), UNCONFIRMED_NOTE_AR);
  assert.equal(unconfirmedNoteAr(UNVERIFIED_STATUS), UNVERIFIED_NOTE_AR);
});

/* ───────────────────────────── P5 ───────────────────────────── */

import { playerComparison, scoutTeams, teamSample, teamSelectionIssue, TEAM_SELECTION_MESSAGE_AR } from "@/lib/scout";
import ScoutWorkspace from "@/components/scout/ScoutWorkspace";
import type { NormalizedTopScorer } from "@/packages/sdl/src";

const done = (id: string, home: string, away: string, hs: number, as: number, day: string): NormalizedFixture =>
  fx({ providerId: id, homeProviderId: home, awayProviderId: away, homeName: home.toUpperCase(), awayName: away.toUpperCase(), homeScore: hs, awayScore: as, status: "finished", scheduledAt: `${day}T18:00:00Z` });

const sample = [
  done("m1", "ahly", "zamalek", 2, 1, "2026-09-01"),
  done("m2", "zamalek", "pyramids", 0, 0, "2026-09-08"),
  done("m3", "ahly", "pyramids", 3, 0, "2026-09-15"),
  fx({ providerId: "m4", homeProviderId: "ismaily", awayProviderId: "ahly", homeName: "ISMAILY", awayName: "AHLY", status: "scheduled", homeScore: null, awayScore: null, scheduledAt: "2026-10-20T18:00:00Z" }),
];

test("P5 · team list keeps provider ids, teams with completed matches first", () => {
  const teams = scoutTeams(sample);
  assert.deepEqual(teams.map((t) => t.id), ["ahly", "pyramids", "zamalek", "ismaily"]);
  assert.equal(teams.find((t) => t.id === "ismaily")!.completed, 0);
  assert.equal(teams[0].name, "AHLY", "provider label, not a rename");
});

test("P5 · validation: empty sample, single team, missing and identical selections", () => {
  assert.equal(teamSelectionIssue([], "", ""), "no-teams");
  assert.equal(teamSelectionIssue(scoutTeams([sample[3]]).slice(0, 1), "ismaily", ""), "one-team");
  const teams = scoutTeams(sample);
  assert.equal(teamSelectionIssue(teams, "ahly", ""), "missing");
  assert.equal(teamSelectionIssue(teams, "ahly", "not-in-sample"), "missing");
  assert.equal(teamSelectionIssue(teams, "ahly", "ahly"), "same");
  assert.equal(teamSelectionIssue(teams, "ahly", "zamalek"), null);
  assert.match(TEAM_SELECTION_MESSAGE_AR["no-teams"], /لا يمكن المقارنة/);
});

test("P5 · recalculation: metrics follow the selected team and venue", () => {
  assert.deepEqual([teamSample(sample, "ahly").played, teamSample(sample, "ahly").won, teamSample(sample, "ahly").goalsFor], [2, 2, 5]);
  assert.deepEqual([teamSample(sample, "zamalek").played, teamSample(sample, "zamalek").drawn, teamSample(sample, "zamalek").lost], [2, 1, 1]);
  assert.equal(teamSample(sample, "zamalek", "home").played, 1);
  assert.equal(teamSample(sample, "ismaily").played, 0, "no completed match → «غير متاح», never zeros presented as data");
});

test("P5 · rendered comparison: headers and numbers belong to the selected (default) teams; one source line", () => {
  const html = renderToStaticMarkup(createElement(ScoutWorkspace, { fixtures: sample, scorers: [] }));
  // default selection = first two teams with completed matches: AHLY vs PYRAMIDS
  assert.match(html, /<th scope="col">AHLY<\/th><th scope="col">PYRAMIDS<\/th>/);
  const played = [...html.matchAll(/مباريات العينة<\/th><td class="num text-center">(\d+)<\/td><td class="num text-center">(\d+)<\/td>/g)][0];
  assert.deepEqual([played[1], played[2]], [String(teamSample(sample, "ahly").played), String(teamSample(sample, "pyramids").played)]);
  assert.match(html, /قائمة الهدافين غير متاحة/, "missing scorer data is stated, not invented");
  const empty = renderToStaticMarkup(createElement(ScoutWorkspace, { fixtures: [], scorers: [] }));
  assert.match(empty, /لا يمكن المقارنة الآن/);
  assert.match(empty, /disabled=""/, "pickers are disabled when there is nothing to pick");
});

test("P5 · player comparison: selected players drive the table; missing stats are «غير متاح»", () => {
  const scorers: NormalizedTopScorer[] = [
    { playerProviderId: "p1", teamProviderId: "t1", goals: 5, appearances: 5, penalties: null, playerName: "Erling Haaland", assists: null },
    { playerProviderId: "p2", teamProviderId: "t2", goals: 4, appearances: 6, penalties: 1, playerName: "João Pedro", assists: 2 },
  ];
  const c = playerComparison(scorers, "p2", "p1");
  assert.equal(c.ok, true);
  if (!c.ok) return;
  assert.equal(c.one.playerName, "João Pedro");
  assert.deepEqual(c.rows.map((r) => [r.key, r.one, r.two]), [["goals", 4, 5], ["appearances", 6, 5], ["assists", 2, null], ["penalties", 1, null]]);
  assert.deepEqual(playerComparison(scorers, "p1", "p1"), { ok: false, reason: "same" });
  assert.deepEqual(playerComparison([], "p1", "p2"), { ok: false, reason: "no-scorers" });
});

test("P1 · an editorial-only fallback (every provider failed) is not a live answer", async () => {
  const { snapshotOf } = await import("@/lib/live-board");
  const editorialOnly = { ok: true as const, data: [fx({ providerId: "adm", status: "scheduled", editorialUpdatedAt: "2026-10-08T12:00:00Z" })], provider: "admin" as const, fromCache: false, stale: false, degraded: true, fetchedAt: "2026-10-08T12:00:00Z", source: "provider" as const };
  const snapshot = snapshotOf(editorialOnly);
  assert.equal(snapshot.ok, false, "never rendered as «لا توجد مباريات مباشرة»");
  const board = buildSportBoard("football", snapshot, snapshot, NOW);
  assert.equal(board.ok, false);
});
