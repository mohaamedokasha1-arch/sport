/**
 * Cross-source fixture identity, merge & Egyptian display priority — verification
 * ─────────────────────────────────────────────────────────────────────────────
 * What this guards (the "one match, one row" contract):
 *   · the SAME meeting known to the provider feed AND the editorial desk
 *     appears ONCE on every public list — keeping the provider's official id,
 *     kickoff, status and score, and gaining the desk's channels/venue/round
 *     and bilingual names;
 *   · two DIFFERENT matches never merge on a shared club name;
 *   · an editorial match page absorbs the feed's live state (it used to stay
 *     «قادمة» forever), and a provider match page gains the desk's details —
 *     without either page's identity moving;
 *   · Egyptian competitions lead the display order;
 *   · the Cairo day boundary files a 00:30 kickoff under its own day, never
 *     under yesterday.
 *
 * Layers:
 *   1. pure rules on hand-built NormalizedFixtures (no I/O);
 *   2. a gateway integration against a LOCAL SportScore-shaped mock (the
 *      provider protocol, not the live service) + one editorial record created
 *      through the real admin store — the exact production merge path
 *      (lib/sdl-gateway.ts `corrected()` / `matchDetail`).
 *
 * Run: npm run fixture-merge:test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

if (process.env.DATABASE_URL) throw new Error("Offline regression tests refuse a configured database");
process.env.NEMO_TEST_MEMORY_ONLY = "1";
// The keyless adapter is registered against a LOCAL mock below — never the live service.
process.env.NEMO_SPORTSCORE_ENABLED = "1";
delete process.env.FOOTBALL_DATA_API_KEY;
delete process.env.SPORTMONKS_TOKEN;
delete process.env.SPORTMONKS_API_TOKEN;
delete process.env.API_FOOTBALL_KEY;
delete process.env.SPORTRADAR_KEY;
delete process.env.THESPORTSDB_KEY;
delete process.env.THESPORTSDB_API_KEY;

import {
  absorbLiveState,
  combineFixtureLists,
  isSameMeeting,
  mergeFixturePair,
  resolveMergedStatus,
} from "@/lib/fixture-merge";
import { isEgyptianCompetition, filterProviderMatches, sortDayFixtures, sortProviderMatches } from "@/lib/provider-match-filter";
import { createAdminMatch, getAdminMatchBySlug, adminMatchToFixture, scheduledAtFromLocal } from "@/lib/admin-matches";
import { fixturesForCairoDate, matchDetail } from "@/lib/sdl-gateway";
import { siteDateKey } from "@/lib/tz";
import type { NormalizedFixture } from "@/packages/sdl/src";

/* ── builders ─────────────────────────────────────────────────────────── */

function fx(over: Partial<NormalizedFixture> = {}): NormalizedFixture {
  return {
    providerId: "al-ahly-sc-vs-ismaily-sc",
    sport: "football",
    competitionProviderId: "Egyptian Premier League",
    seasonProviderId: null,
    round: null,
    homeProviderId: "Al Ahly SC",
    awayProviderId: "Ismaily SC",
    scheduledAt: "2026-10-15T16:00:00.000Z",
    status: "scheduled",
    homeScore: null,
    awayScore: null,
    periods: [],
    venueProviderId: null,
    venueName: null,
    attendance: null,
    minute: null,
    homeName: "Al Ahly SC",
    awayName: "Ismaily SC",
    homeLogoUrl: "https://img.example/al-ahly.png",
    awayLogoUrl: "https://img.example/ismaily.png",
    competitionName: "Egyptian Premier League",
    sourceUrl: "https://sportscore.com/football/match/al-ahly-sc-vs-ismaily-sc/x1/",
    ...over,
  };
}

/** The editorial twin of fx(): Arabic desk record with bilingual names + channels. */
function editorial(over: Partial<NormalizedFixture> = {}): NormalizedFixture {
  return {
    providerId: "al-ahly-vs-ismaily",
    sport: "football",
    competitionProviderId: "egyptian-league",
    seasonProviderId: "2026/2027",
    round: "الجولة 5",
    homeProviderId: null,
    awayProviderId: null,
    scheduledAt: "2026-10-15T15:50:00.000Z", // 10 min drift, within tolerance
    status: "scheduled",
    homeScore: null,
    awayScore: null,
    periods: [],
    venueProviderId: null,
    venueName: "ستاد القاهرة الدولي",
    attendance: null,
    minute: null,
    homeName: "الأهلي",
    awayName: "الإسماعيلي",
    homeNameEn: "Al Ahly",
    awayNameEn: "Ismaily",
    homeLogoUrl: "",
    awayLogoUrl: "",
    competitionName: "الدوري المصري الممتاز",
    competitionNameEn: "Egyptian Premier League",
    channels: ["ON Time Sports 1", "Koora Live"],
    sourceUrl: null,
    editorialUpdatedAt: "2026-10-14T10:00:00.000Z",
    ...over,
  };
}

/* ── 1 · identity ─────────────────────────────────────────────────────── */

test("isSameMeeting: Arabic editorial record pairs with the English provider record", () => {
  assert.equal(isSameMeeting(fx(), editorial()), true);
});

test("isSameMeeting: sides may arrive swapped (neutral venue bookkeeping)", () => {
  assert.equal(
    isSameMeeting(
      fx(),
      editorial({ homeName: "الإسماعيلي", awayName: "الأهلي", homeNameEn: "Ismaily", awayNameEn: "Al Ahly", providerId: "ismaily-vs-al-ahly" }),
    ),
    true,
  );
});

test("isSameMeeting: a shared club alone never merges two different matches", () => {
  const other = fx({
    providerId: "pyramids-fc-vs-ismaily-sc",
    homeName: "Pyramids FC",
    awayName: "Ismaily SC",
    homeProviderId: "Pyramids FC",
    awayProviderId: "Ismaily SC",
    competitionProviderId: "Egyptian Premier League",
  });
  assert.equal(isSameMeeting(other, editorial()), false, "Pyramids × Ismaily is not Al Ahly × Ismaily");
});

test("isSameMeeting: kickoff drift beyond the tolerance means different meetings", () => {
  assert.equal(isSameMeeting(fx(), editorial({ scheduledAt: "2026-10-15T19:00:00.000Z" })), false, "3h10m apart");
  assert.equal(isSameMeeting(fx(), editorial({ scheduledAt: "2026-10-15T14:00:00.000Z" })), true, "2h apart is the documented tolerance");
});

test("isSameMeeting: different sports and different competitions never merge", () => {
  assert.equal(isSameMeeting(fx(), editorial({ sport: "basketball" })), false);
  assert.equal(
    isSameMeeting(fx({ competitionProviderId: "champions-league", competitionName: "UEFA Champions League" }), editorial()),
    false,
    "same clubs in a different, catalogued competition is a different match",
  );
});

test("isSameMeeting: unparseable kickoff is never merged", () => {
  assert.equal(isSameMeeting(fx(), editorial({ scheduledAt: "TBD" })), false);
});

/* ── 2 · merge policy ─────────────────────────────────────────────────── */

test("mergeFixturePair: provider backbone + editorial enrichment, one row", () => {
  const live = fx({ status: "finished", homeScore: 2, awayScore: 1, minute: null, periods: [{ label: "HT", home: 1, away: 0 }] });
  const merged = mergeFixturePair(live, editorial());
  // identity + live state: the provider's
  assert.equal(merged.providerId, "al-ahly-sc-vs-ismaily-sc");
  assert.equal(merged.scheduledAt, "2026-10-15T16:00:00.000Z");
  assert.equal(merged.status, "finished");
  assert.equal(merged.homeScore, 2);
  assert.equal(merged.awayScore, 1);
  assert.equal(merged.periods.length, 1);
  assert.equal(merged.sourceUrl, live.sourceUrl);
  // curated bilingual display pair: the desk's
  assert.equal(merged.homeName, "الأهلي");
  assert.equal(merged.awayName, "الإسماعيلي");
  assert.equal(merged.homeNameEn, "Al Ahly");
  assert.equal(merged.awayNameEn, "Ismaily");
  assert.equal(merged.competitionName, "الدوري المصري الممتاز");
  assert.equal(merged.competitionNameEn, "Egyptian Premier League");
  // gap-fill: channels / venue / round / season come from the desk
  assert.deepEqual(merged.channels, ["ON Time Sports 1", "Koora Live"]);
  assert.equal(merged.venueName, "ستاد القاهرة الدولي");
  assert.equal(merged.round, "الجولة 5");
  assert.equal(merged.seasonProviderId, "2026/2027");
  // gap-fill: the provider's crests survive; empty editorial ones never delete them
  assert.equal(merged.homeLogoUrl, "https://img.example/al-ahly.png");
});

test("mergeFixturePair: absence in one source is never a deletion", () => {
  const merged = mergeFixturePair(fx({ venueName: "Cairo International Stadium" }), editorial({ venueName: "", channels: null, round: "" }));
  assert.equal(merged.venueName, "Cairo International Stadium", "base keeps its own venue");
  assert.equal(merged.channels, null, "no channels anywhere → nothing invented");
});

test("resolveMergedStatus: a bare scheduled never overrules an interruption", () => {
  assert.equal(resolveMergedStatus("scheduled", "postponed"), "postponed");
  assert.equal(resolveMergedStatus("scheduled", "cancelled"), "cancelled");
  assert.equal(resolveMergedStatus("finished", "postponed"), "finished", "a real result beats a stale interruption");
  assert.equal(resolveMergedStatus("live", "upcoming"), "live");
});

test("absorbLiveState: the editorial page keeps its identity and takes the feed's state", () => {
  const target = editorial();
  const live = fx({ status: "live", homeScore: 1, awayScore: 0, minute: 63 });
  const out = absorbLiveState(target, live);
  assert.equal(out.providerId, "al-ahly-vs-ismaily", "the URL slug must not move");
  assert.equal(out.status, "live");
  assert.equal(out.homeScore, 1);
  assert.equal(out.minute, 63);
  assert.deepEqual(out.channels, ["ON Time Sports 1", "Koora Live"], "desk metadata untouched");
  assert.equal(out.homeName, "الأهلي");
});

test("combineFixtureLists: the same meeting appears once, both sources' details kept", () => {
  const out = combineFixtureLists(
    [fx({ status: "finished", homeScore: 2, awayScore: 1 }), fx({ providerId: "inter-milan-vs-roma", homeName: "Inter Milan", awayName: "AS Roma", homeProviderId: "Inter Milan", awayProviderId: "AS Roma", competitionProviderId: "Serie A", competitionName: "Serie A", scheduledAt: "2026-10-15T17:45:00.000Z" })],
    [editorial()],
  );
  assert.equal(out.length, 2, "one row for the merged meeting + the unrelated match");
  const merged = out.find((f) => f.providerId === "al-ahly-sc-vs-ismaily-sc")!;
  assert.ok(merged, "the provider's official id is the merged row's id");
  assert.equal(merged.status, "finished");
  assert.deepEqual(merged.channels, ["ON Time Sports 1", "Koora Live"]);
});

test("combineFixtureLists: provider-internal duplicates fold too, editorial-only rows survive", () => {
  const dup = fx({ providerId: "al-ahly-sc-vs-ismaily-sc-2", sourceUrl: "https://sportscore.com/football/match/al-ahly-sc-vs-ismaily-sc-2/y2/" });
  const onlyDesk = editorial({ providerId: "mansoura-vs-al-nasr-egypt", homeName: "المنصورة", awayName: "النصر", homeNameEn: "Mansoura", awayNameEn: "Al Nasr (Egypt)", scheduledAt: "2026-10-15T15:30:00.000Z", round: "", channels: [], venueName: "" });
  const out = combineFixtureLists([fx(), dup], [editorial(), onlyDesk]);
  assert.equal(out.length, 2, "two provider copies → one row; the editorial-only match is appended");
  const merged = out.find((f) => f.providerId === "al-ahly-sc-vs-ismaily-sc")!;
  assert.equal(out.filter((f) => isSameMeeting(f, merged)).length, 1);
  assert.ok(out.some((f) => f.providerId === "mansoura-vs-al-nasr-egypt"), "an editorial match with no provider twin stays");
});

/* ── 3 · Egyptian priority + Cairo day boundary ───────────────────────── */

test("isEgyptianCompetition: reads competition fields only, Arabic and Latin", () => {
  assert.equal(isEgyptianCompetition(fx()), true, "Egyptian Premier League");
  assert.equal(isEgyptianCompetition(fx({ competitionProviderId: "egyptian-second-division", competitionName: "الدرجة الثانية" })), true);
  assert.equal(isEgyptianCompetition(fx({ competitionProviderId: "saudi-professional-league", competitionName: "دوري روشن السعودي", competitionNameEn: "Saudi Pro League" })), false);
  assert.equal(isEgyptianCompetition(fx({ competitionProviderId: "saudi-professional-league", competitionName: "النصر", homeName: "Al Nasr (Egypt)" })), false, "a club named (Egypt) is not an Egyptian competition");
});

test("sortProviderMatches: live first, Egyptian first inside every group, then kickoff", () => {
  const now = Date.parse("2026-10-15T12:00:00.000Z");
  const day = "2026-10-15T";
  const list = [
    fx({ providerId: "eg-finished", status: "finished", homeScore: 1, awayScore: 0, scheduledAt: `${day}10:00:00.000Z`, competitionProviderId: "egyptian-league" }),
    fx({ providerId: "eu-upcoming", status: "scheduled", scheduledAt: `${day}14:00:00.000Z`, competitionProviderId: "premier-league", competitionName: "Premier League" }),
    fx({ providerId: "eu-live", status: "live", minute: 20, scheduledAt: `${day}11:00:00.000Z`, competitionProviderId: "premier-league", competitionName: "Premier League" }),
    fx({ providerId: "eg-upcoming", status: "scheduled", scheduledAt: `${day}18:00:00.000Z`, competitionProviderId: "egyptian-league" }),
    fx({ providerId: "eg-upcoming-2", status: "scheduled", scheduledAt: `${day}16:00:00.000Z`, competitionProviderId: "egyptian-league" }),
  ];
  const sorted = sortProviderMatches(list, now).map((f) => f.providerId);
  assert.deepEqual(sorted, ["eu-live", "eg-upcoming-2", "eg-upcoming", "eu-upcoming", "eg-finished"]);
});

test("sortDayFixtures: the day schedule keeps kickoff order with Egyptian competitions first", () => {
  const list = [
    fx({ providerId: "eu", scheduledAt: "2026-10-15T11:00:00.000Z", competitionProviderId: "premier-league", competitionName: "Premier League" }),
    fx({ providerId: "eg-late", scheduledAt: "2026-10-15T18:30:00.000Z", competitionProviderId: "egyptian-league" }),
    fx({ providerId: "eg-early", scheduledAt: "2026-10-15T12:30:00.000Z", competitionProviderId: "egyptian-league" }),
  ];
  assert.deepEqual(sortDayFixtures(list).map((f) => f.providerId), ["eg-early", "eg-late", "eu"]);
});

test("Cairo day boundary: a 00:30 kickoff belongs to its own day, never to yesterday", () => {
  const late = fx({
    providerId: "midnight-match",
    scheduledAt: scheduledAtFromLocal("2026-10-16", "00:30")!,
    status: "scheduled",
    competitionProviderId: "premier-league",
    competitionName: "Premier League",
  });
  assert.equal(filterProviderMatches([late], { date: "2026-10-16" }).length, 1, "files under 16 October (Cairo)");
  assert.equal(filterProviderMatches([late], { date: "2026-10-15" }).length, 0, "never under 15 October");
});

/* ── 4 · gateway integration (local SportScore-shaped mock + desk record) ─ */

type MockMatch = Record<string, unknown>;
let mockDayMatches: MockMatch[] = [];
let mockDetailMatch: MockMatch | null = null;

const server: Server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === "/api/v1/fixtures/") {
    send(200, { sport: url.searchParams.get("sport") ?? "football", date: url.searchParams.get("date"), count: mockDayMatches.length, matches: mockDayMatches });
    return;
  }
  if (url.pathname === "/api/widget/match/") {
    if (!mockDetailMatch) return send(404, { error: "not found" });
    send(200, { match: mockDetailMatch, updated: new Date().toISOString() });
    return;
  }
  if (url.pathname === "/api/widget/matches/") {
    send(200, { sport: "football", count: mockDayMatches.length, matches: mockDayMatches, updated: new Date().toISOString() });
    return;
  }
  send(404, { error: "not found" });
});

function ssMatch(over: Partial<Record<string, string | null>> = {}): MockMatch {
  return {
    home: "Al Ahly SC",
    away: "Ismaily SC",
    home_logo: "https://img.example/al-ahly.png",
    away_logo: "https://img.example/ismaily.png",
    home_score: "2",
    away_score: "1",
    status: "finished",
    status_text: "Finished",
    time: "2026-10-15T16:10:00+00:00",
    competition: "Egyptian Premier League",
    competition_logo: null,
    url: "/football/match/al-ahly-sc-vs-ismaily-sc/abc123xyz890/",
    ...over,
  };
}

test("gateway: the provider + editorial merge serves ONE row per meeting, with both sources' details", async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  process.env.SPORTSCORE_BASE_URL = `http://127.0.0.1:${port}/api/widget`;

  const created = await createAdminMatch(
    {
      sport: "football",
      competitionSlug: "egyptian-league",
      competitionName: "الدوري المصري الممتاز",
      competitionNameEn: "Egyptian Premier League",
      season: "2026/2027",
      homeName: "الأهلي",
      homeNameEn: "Al Ahly",
      awayName: "الإسماعيلي",
      awayNameEn: "Ismaily",
      date: "2026-10-15",
      time: "19:00",
      status: "upcoming",
      venue: "ستاد القاهرة الدولي",
      round: "الجولة 5",
      channels: ["ON Time Sports 1", "Koora Live"],
      isPublished: true,
      slug: "al-ahly-vs-ismaily",
    },
    "fixture-merge:test",
  );
  assert.ok(created.ok, created.ok ? "" : String(created.error));
  const admin = await getAdminMatchBySlug("al-ahly-vs-ismaily");
  assert.ok(admin);

  // The feed carries the SAME meeting (10 min later, finished) twice under two
  // permalinks, plus a neighbour sharing one club (must never merge into it).
  const iso = (s: string) => new Date(Date.parse(s) + 10 * 60_000).toISOString().replace(".000Z", "+00:00");
  mockDayMatches = [
    ssMatch({ url: "/football/match/al-ahly-sc-vs-ismaily-sc/abc123xyz890/", time: iso(admin!.scheduledAt) }),
    ssMatch({ url: "/football/match/al-ahly-sc-vs-ismaily-sc-2/def456uvw000/", time: iso(admin!.scheduledAt) }),
    ssMatch({
      home: "Pyramids FC",
      away: "Ismaily SC",
      url: "/football/match/pyramids-fc-vs-ismaily-sc/ghi789rst111/",
      home_score: null,
      away_score: null,
      status: "upcoming",
      status_text: "",
      time: iso(admin!.scheduledAt),
    }),
  ];
  mockDetailMatch = ssMatch({ url: "/football/match/al-ahly-sc-vs-ismaily-sc/abc123xyz890/", time: iso(admin!.scheduledAt) });

  const day = siteDateKey(admin!.scheduledAt);
  const res = await fixturesForCairoDate({ sport: "football", date: day });
  assert.ok(res.ok, res.ok ? "" : JSON.stringify(res.error));
  assert.equal(res.source, "provider", "provider results are never presented as editorial-only");

  const ahlyIsmaily = res.data.filter((f) => isSameMeeting(f, adminMatchToFixture(admin!)));
  assert.equal(ahlyIsmaily.length, 1, "the meeting appears exactly once (provider dup + editorial twin folded)");
  const row = ahlyIsmaily[0]!;
  assert.equal(row.providerId, "al-ahly-sc-vs-ismaily-sc", "the provider's official id is kept");
  assert.equal(row.status, "finished", "the feed's live state wins over the desk's upcoming");
  assert.equal(row.homeScore, 2);
  assert.equal(row.awayScore, 1);
  assert.deepEqual(row.channels, ["ON Time Sports 1", "Koora Live"], "the desk's channels merged in");
  assert.equal(row.venueName, "ستاد القاهرة الدولي");
  assert.equal(row.round, "الجولة 5");
  assert.equal(row.homeName, "الأهلي", "the bilingual display pair is kept");
  assert.equal(row.homeNameEn, "Al Ahly");

  const pyramids = res.data.filter((f) => f.homeName === "Pyramids FC" || f.homeProviderId === "Pyramids FC");
  assert.equal(pyramids.length, 1, "Pyramids × Ismaily stays a row of its own (shared club ≠ same match)");
});

test("gateway: the editorial match page absorbs the feed's live state without moving its identity", async () => {
  const detail = await matchDetail("football", "al-ahly-vs-ismaily");
  assert.ok(detail.ok, detail.ok ? "" : JSON.stringify(detail.error));
  assert.equal(detail.provider, "admin");
  assert.equal(detail.data.providerId, "al-ahly-vs-ismaily", "the requested slug is still the record's id");
  assert.equal(detail.data.status, "finished");
  assert.equal(detail.data.homeScore, 2);
  assert.deepEqual(detail.data.channels, ["ON Time Sports 1", "Koora Live"], "desk metadata survives");
});

test("gateway: the provider match page gains the desk's details", async () => {
  const detail = await matchDetail("football", "al-ahly-sc-vs-ismaily-sc");
  assert.ok(detail.ok, detail.ok ? "" : JSON.stringify(detail.error));
  assert.equal(detail.provider, "sportscore");
  assert.equal(detail.data.homeName, "الأهلي", "bilingual names on the provider page too");
  assert.equal(detail.data.homeNameEn, "Al Ahly");
  assert.deepEqual(detail.data.channels, ["ON Time Sports 1", "Koora Live"]);
  assert.equal(detail.data.venueName, "ستاد القاهرة الدولي");
});

test("gateway: provider outage keeps the editorial schedule visible (never an empty page)", async () => {
  // Same mock, but every provider answer fails from now on. A FRESH day is
  // requested so the earlier successful response cannot satisfy it from cache.
  const failing: Server = createServer((_req, res) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "upstream down" }));
  });
  await new Promise<void>((resolve) => failing.listen(0, "127.0.0.1", resolve));
  const { port } = failing.address() as AddressInfo;
  const previous = process.env.SPORTSCORE_BASE_URL;
  process.env.SPORTSCORE_BASE_URL = `http://127.0.0.1:${port}/api/widget`;
  try {
    const created = await createAdminMatch(
      {
        sport: "football",
        competitionSlug: "egyptian-league",
        competitionName: "الدوري المصري الممتاز",
        competitionNameEn: "Egyptian Premier League",
        homeName: "الزمالك",
        homeNameEn: "Zamalek",
        awayName: "طنطا",
        awayNameEn: "Tanta",
        date: "2026-10-16",
        time: "21:30",
        status: "upcoming",
        isPublished: true,
        slug: "zamalek-vs-tanta",
      },
      "fixture-merge:test",
    );
    assert.ok(created.ok, created.ok ? "" : String(created.error));
    const res = await fixturesForCairoDate({ sport: "football", date: "2026-10-16" });
    assert.ok(res.ok, "the editorial schedule still answers");
    const rows = res.data.filter((f) => siteDateKey(f.scheduledAt) === "2026-10-16");
    assert.ok(rows.some((f) => f.providerId === "zamalek-vs-tanta"), "the desk's match is still listed under its own day");
    assert.equal(rows.every((f) => siteDateKey(f.scheduledAt) === "2026-10-16"), true, "no rows leak from another Cairo day");
    assert.equal(res.degraded, true, "the degradation is stated, not hidden");
  } finally {
    process.env.SPORTSCORE_BASE_URL = previous;
    await new Promise<void>((resolve) => failing.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
