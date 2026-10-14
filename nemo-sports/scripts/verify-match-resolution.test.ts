/**
 * NEMO Sports · match identity & current-meeting resolution — verification.
 * ────────────────────────────────────────────────────────────────────────
 * The defect this guards: an inbound link naming two clubs (a partner gate,
 * a bookmark, a share) could send the visitor to an OLD meeting of that
 * pairing while a current one existed — e.g. last month's Zamalek × Al Ahly
 * league game instead of tonight's cup tie, or القناة × المصري resolving to
 * a finished fixture instead of the upcoming one.
 *
 * Coverage:
 *   · pure rules on synthetic fixtures (parseSlugRequest, sameMeeting across
 *     TheSportsDB / API-Football-shaped ids, pickCurrentMeeting, dated slugs,
 *     Arabic «-ضد-» slugs, ambiguity → honest null);
 *   · the live gateway rule (lib/sdl-gateway.ts resolveInboundMatchSlug)
 *     against published admin fixtures in the memory store — provider network
 *     disabled, so ONLY the resolution rule itself is exercised.
 *
 * Run: npm run match-resolution:test
 */
import assert from "node:assert/strict";
import { test } from "node:test";

if (process.env.DATABASE_URL) throw new Error("Offline regression tests refuse a configured database");
process.env.NEMO_TEST_MEMORY_ONLY = "1";
// No provider network calls: SportScore disabled, no keys.
process.env.NEMO_SPORTSCORE_ENABLED = "0";
delete process.env.FOOTBALL_DATA_API_KEY;

import {
  fixtureMatchesRequest,
  parseSlugRequest,
  pickCurrentMeeting,
  resolveCurrentMeetingForSlug,
  sameMeeting,
  verifySameMatch,
  type MeetingFixtureLike,
} from "@/lib/match-resolution";
import { createAdminMatch } from "@/lib/admin-matches";
import { resolveInboundMatchSlug } from "@/lib/sdl-gateway";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const NOW = Date.now();
const iso = (t: number) => new Date(t).toISOString();
const dayKey = (t: number) => iso(t).slice(0, 10);

function fixture(patch: Partial<MeetingFixtureLike> & Pick<MeetingFixtureLike, "providerId" | "scheduledAt" | "status">): MeetingFixtureLike {
  return {
    homeName: null,
    awayName: null,
    homeProviderId: null,
    awayProviderId: null,
    competitionProviderId: "egyptian-premier-league",
    sport: "football",
    ...patch,
  };
}

/* ── 1 · slug parsing ──────────────────────────────────────────────────── */

test("parseSlugRequest: latin, dated and Arabic «ضد» shapes", () => {
  assert.deepEqual(parseSlugRequest("al-qanah-vs-al-masry"), { first: "al-qanah", second: "al-masry", date: null });
  assert.deepEqual(parseSlugRequest("zamalek-vs-al-ahly-2026-10-13"), { first: "zamalek", second: "al-ahly", date: "2026-10-13" });
  assert.deepEqual(parseSlugRequest("الزمالك-ضد-الاهلي"), { first: "الزمالك", second: "الاهلي", date: null });
  assert.deepEqual(parseSlugRequest("القناه ضد المصري-2030-01-05"), { first: "القناه", second: "المصري", date: "2030-01-05" });
  assert.equal(parseSlugRequest("oneside"), null);
  assert.equal(parseSlugRequest(""), null);
});

test("fixtureMatchesRequest: order-insensitive, hamza-folding, never partial", () => {
  const derby = fixture({ providerId: "d1", homeName: "Al Ahly FC", awayName: "Zamalek SC", scheduledAt: iso(NOW), status: "scheduled" });
  assert.equal(fixtureMatchesRequest(derby, { first: "al-ahly", second: "zamalek", date: null }), true);
  assert.equal(fixtureMatchesRequest(derby, { first: "zamalek", second: "al-ahly", date: null }), true, "side order never matters");
  const arabic = fixture({ providerId: "d2", homeName: "الأهلي", awayName: "الزمالك", scheduledAt: iso(NOW), status: "scheduled" });
  assert.equal(fixtureMatchesRequest(arabic, { first: "الاهلي", second: "الزمالك", date: null }), true, "hamza folds for Arabic slugs");
  assert.equal(fixtureMatchesRequest(derby, { first: "al", second: "zamalek", date: null }), false, "a bare token is not a club");
  assert.equal(fixtureMatchesRequest(derby, { first: "al-masry", second: "zamalek", date: null }), false);
});

/* ── 2 · same match across providers (TheSportsDB ↔ API-Football) ─────── */

test("verifySameMatch: one real match under two provider ids is ONE meeting", () => {
  // TheSportsDB-shaped record: idEvent + team names, kickoff on the hour.
  const theSportsDb = fixture({
    providerId: "2052713",
    homeName: "Zamalek",
    awayName: "Al Ahly",
    homeProviderId: "134879",
    awayProviderId: "134880",
    scheduledAt: "2026-10-13T18:00:00.000Z",
    status: "scheduled",
  });
  // API-Football-shaped record of the SAME tie, kickoff 35 minutes off.
  const apiFootball = fixture({
    providerId: "1383825",
    homeName: "Zamalek SC",
    awayName: "Al Ahly SC",
    homeProviderId: "1045",
    awayProviderId: "1046",
    scheduledAt: "2026-10-13T18:35:00.000Z",
    status: "scheduled",
  });
  assert.equal(sameMeeting(theSportsDb, apiFootball), true);
  const check = verifySameMatch(theSportsDb, apiFootball);
  assert.equal(check.consistent, true);
  assert.match(check.reasons.join(" "), /kickoff-drift: 35m/);

  // Home/away swap between providers (a rescheduled return leg typo) is still
  // the same pairing — but a different pairing or a next-day kickoff is NOT
  // the same match and must never share a link.
  assert.equal(sameMeeting(theSportsDb, { ...apiFootball, homeName: "Al Ahly SC", awayName: "Zamalek SC" }), true, "a swapped listing reconciles");
  const differentDay = verifySameMatch(theSportsDb, { ...apiFootball, scheduledAt: "2026-10-15T18:00:00.000Z" });
  assert.equal(differentDay.consistent, false);
  assert.match(differentDay.reasons.join(" "), /kickoff-gap/);
  const otherPairing = verifySameMatch(theSportsDb, { ...apiFootball, awayName: "Pyramids FC" });
  assert.equal(otherPairing.consistent, false);
  assert.match(otherPairing.reasons.join(" "), /teams-mismatch/);
  assert.equal(sameMeeting(theSportsDb, { ...apiFootball, scheduledAt: "not a date" }), false);
});

/* ── 3 · the CURRENT meeting of a pairing ──────────────────────────────── */

const OLD_LEAGUE_DERBY = fixture({
  providerId: "zamalek-vs-ahly-league-sep",
  homeName: "Zamalek",
  awayName: "Al Ahly",
  scheduledAt: iso(NOW - 20 * DAY),
  status: "finished",
  homeProviderId: "zamalek",
  awayProviderId: "al-ahly",
});
const NEXT_CUP_DERBY = fixture({
  providerId: "zamalek-vs-ahly-cup-tomorrow",
  homeName: "Zamalek",
  awayName: "Al Ahly",
  competitionProviderId: "egypt-cup",
  scheduledAt: iso(NOW + DAY),
  status: "scheduled",
  homeProviderId: "zamalek",
  awayProviderId: "al-ahly",
});

test("pickCurrentMeeting: the upcoming tie wins over last month's finished one", () => {
  const picked = pickCurrentMeeting([OLD_LEAGUE_DERBY, NEXT_CUP_DERBY], { now: NOW });
  assert.equal(picked?.fixture.providerId, "zamalek-vs-ahly-cup-tomorrow");
  assert.equal(picked?.via, "upcoming");
  // Order of the input array must not matter.
  assert.equal(pickCurrentMeeting([NEXT_CUP_DERBY, OLD_LEAGUE_DERBY], { now: NOW })?.fixture.providerId, "zamalek-vs-ahly-cup-tomorrow");
});

test("pickCurrentMeeting: a live meeting beats any kickoff still to come", () => {
  const live = fixture({ ...NEXT_CUP_DERBY, providerId: "derby-live", scheduledAt: iso(NOW - HOUR), status: "live" });
  assert.equal(pickCurrentMeeting([NEXT_CUP_DERBY, live], { now: NOW })?.fixture.providerId, "derby-live");
  // The same live match served by two providers is ONE meeting, not ambiguity —
  // and the choice between its provider records is deterministic (earliest
  // reported kickoff, then id), so both input orders give the SAME answer.
  const alsoLive = fixture({ ...live, providerId: "1383825", scheduledAt: iso(NOW - HOUR - 30 * 60_000), homeName: "Zamalek SC", awayName: "Al Ahly SC" });
  assert.equal(pickCurrentMeeting([live, alsoLive], { now: NOW })?.fixture.providerId, "1383825");
  assert.equal(pickCurrentMeeting([alsoLive, live], { now: NOW })?.fixture.providerId, "1383825", "deterministic regardless of input order");
  // Two DIFFERENT live meetings of one pairing cannot be chosen between.
  const otherLive = fixture({ ...live, providerId: "other-comp-live", scheduledAt: iso(NOW - 5 * HOUR), competitionProviderId: "other-cup" });
  assert.equal(pickCurrentMeeting([live, otherLive], { now: NOW }), null, "ambiguity is an honest null, never a coin flip");
});

test("pickCurrentMeeting: only a RECENT finished meeting is current", () => {
  const yesterday = fixture({ ...OLD_LEAGUE_DERBY, providerId: "derby-yesterday", scheduledAt: iso(NOW - DAY), status: "finished" });
  assert.equal(pickCurrentMeeting([OLD_LEAGUE_DERBY, yesterday], { now: NOW })?.fixture.providerId, "derby-yesterday");
  assert.equal(pickCurrentMeeting([OLD_LEAGUE_DERBY], { now: NOW }), null, "a 20-day-old meeting answers nobody's link");
  // A stale "scheduled" whose kickoff passed long ago is unconfirmed — never
  // picked as an upcoming match (that is exactly the old-match trap).
  const staleScheduled = fixture({ ...NEXT_CUP_DERBY, providerId: "stale", scheduledAt: iso(NOW - 3 * HOUR), status: "scheduled" });
  assert.equal(pickCurrentMeeting([staleScheduled], { now: NOW }), null);
});

/* ── 4 · slug → meeting resolution ─────────────────────────────────────── */

test("resolveCurrentMeetingForSlug: an undated slug lands on the CURRENT derby", () => {
  const pool = [OLD_LEAGUE_DERBY, NEXT_CUP_DERBY];
  const hit = resolveCurrentMeetingForSlug("zamalek-vs-al-ahly", pool, { now: NOW });
  assert.equal(hit?.fixture.providerId, "zamalek-vs-ahly-cup-tomorrow");
  assert.equal(hit?.candidateCount, 2);
  assert.equal(resolveCurrentMeetingForSlug("real-madrid-vs-barcelona", pool, { now: NOW }), null);
});

test("resolveCurrentMeetingForSlug: a dated slug resolves ONLY the meeting on that day", () => {
  const yesterday = fixture({ ...NEXT_CUP_DERBY, providerId: "derby-yesterday", scheduledAt: `${dayKey(NOW - DAY)}T19:00:00.000Z`, status: "finished" });
  const tomorrow = { ...NEXT_CUP_DERBY, providerId: "derby-tomorrow", scheduledAt: `${dayKey(NOW + DAY)}T19:00:00.000Z` };
  const pool = [yesterday, tomorrow];
  const datedTomorrow = resolveCurrentMeetingForSlug(`zamalek-vs-al-ahly-${dayKey(NOW + DAY)}`, pool, { now: NOW });
  assert.equal(datedTomorrow?.fixture.providerId, "derby-tomorrow");
  assert.equal(datedTomorrow?.via, "dated");
  const datedYesterday = resolveCurrentMeetingForSlug(`zamalek-vs-al-ahly-${dayKey(NOW - DAY)}`, pool, { now: NOW });
  assert.equal(datedYesterday?.fixture.providerId, "derby-yesterday");
  assert.equal(resolveCurrentMeetingForSlug(`zamalek-vs-al-ahly-${dayKey(NOW + 2 * DAY)}`, pool, { now: NOW }), null, "no meeting that day → no guess");
});

test("resolveCurrentMeetingForSlug: القناة ضد المصري in Arabic resolves like the latin slug", () => {
  // The provider's own id IS a home-vs-away permalink, so a fixture whose
  // display names are Arabic-only is still addressable by its latin sides —
  // exactly how SportScore permalinks and editorial slugs behave.
  const qanahMasry = fixture({
    providerId: "al-qanah-vs-al-masry",
    homeName: "القناة",
    awayName: "المصري",
    competitionProviderId: "egyptian-premier-league",
    scheduledAt: iso(NOW + 6 * HOUR),
    status: "scheduled",
  });
  const oldReverse = fixture({
    providerId: "al-masry-vs-al-qanah-august",
    homeName: "المصري",
    awayName: "القناة",
    scheduledAt: iso(NOW - 40 * DAY),
    status: "finished",
  });
  const pool = [qanahMasry, oldReverse];
  assert.equal(resolveCurrentMeetingForSlug("القناه-ضد-المصري", pool, { now: NOW })?.fixture.providerId, "al-qanah-vs-al-masry", "هاء/تاء تُطوي كما في البحث");
  assert.equal(resolveCurrentMeetingForSlug("المصري-ضد-القناه", pool, { now: NOW })?.fixture.providerId, "al-qanah-vs-al-masry", "side order never matters");
  // The provider's own permalink id states the pairing in latin too.
  assert.equal(resolveCurrentMeetingForSlug("al-qanah-vs-al-masry", pool, { now: NOW })?.fixture.providerId, "al-qanah-vs-al-masry", "the latin id sides answer the latin slug");
  // Curated cross-lingual bridge (lib/name-aliases.ts): القناة/المصري are
  // curated, so the latin slug also reaches an Arabic-NAMED fixture with an
  // opaque id — while an unknown pairing still answers nothing.
  const arabicOnly = fixture({ providerId: "2052713", homeName: "القناة", awayName: "المصري", scheduledAt: iso(NOW + 6 * HOUR), status: "scheduled" });
  assert.equal(resolveCurrentMeetingForSlug("al-qanah-vs-al-masry", [arabicOnly], { now: NOW })?.fixture.providerId, "2052713", "curated aliases bridge languages");
  const numeric = fixture({ providerId: "2052714", homeName: null, awayName: null, homeProviderId: null, awayProviderId: null, scheduledAt: iso(NOW + 6 * HOUR), status: "scheduled" });
  assert.equal(resolveCurrentMeetingForSlug("القناه-ضد-المصري", [numeric], { now: NOW }), null, "a nameless numeric-id fixture answers nothing");
});

/* ── 5 · the live gateway rule, end to end (admin fixtures, no network) ── */

test("gateway: a shared derby slug lands on the upcoming meeting, never the old one", async () => {
  const oldOne = await createAdminMatch(
    {
      sport: "football",
      competitionSlug: "egyptian-premier-league",
      competitionName: "الدوري المصري",
      homeName: "الزمالك",
      homeNameEn: "Zamalek",
      awayName: "الأهلي",
      awayNameEn: "Al Ahly",
      date: "2026-09-21",
      time: "19:00",
      status: "finished",
      slug: "zamalek-vs-al-ahly-2026-09-21-resolution-test",
      isPublished: true,
    },
    "test",
  );
  assert.ok(oldOne.ok, oldOne.ok ? "" : oldOne.error);
  const upcoming = await createAdminMatch(
    {
      sport: "football",
      competitionSlug: "egypt-cup",
      competitionName: "كأس مصر",
      homeName: "الزمالك",
      homeNameEn: "Zamalek",
      awayName: "الأهلي",
      awayNameEn: "Al Ahly",
      date: dayKey(NOW + DAY),
      time: "19:00",
      status: "upcoming",
      slug: "zamalek-vs-al-ahly-resolution-test-upcoming",
      isPublished: true,
    },
    "test",
  );
  assert.ok(upcoming.ok, upcoming.ok ? "" : upcoming.error);

  // Previously: the only fixture naming these clubs that the feed knew could
  // route the visitor to the September league game. Now the rule picks the
  // CURRENT meeting of the pairing instead — via the Arabic names and via the
  // latin permalink sides alike.
  assert.equal(await resolveInboundMatchSlug("الزمالك-ضد-الاهلي"), "zamalek-vs-al-ahly-resolution-test-upcoming");
  assert.equal(await resolveInboundMatchSlug("zamalek-vs-al-ahly"), "zamalek-vs-al-ahly-resolution-test-upcoming", "latin slugs resolve through the permalink id sides");
  assert.equal(await resolveInboundMatchSlug("zamalek-vs-al-ahly-resolution-test-upcoming"), null, "a canonical slug never redirects onto itself");
});

test("gateway: القناة × المصري resolves to tonight's meeting, drafts stay invisible", async () => {
  const upcoming = await createAdminMatch(
    {
      sport: "football",
      competitionSlug: "egyptian-premier-league",
      competitionName: "الدوري المصري",
      homeName: "القناة",
      homeNameEn: "Al Qanah",
      awayName: "المصري",
      awayNameEn: "Al Masry",
      date: dayKey(NOW + DAY),
      time: "17:00",
      status: "upcoming",
      slug: "al-qanah-vs-al-masry-resolution-test",
      isPublished: true,
    },
    "test",
  );
  assert.ok(upcoming.ok, upcoming.ok ? "" : upcoming.error);
  const draft = await createAdminMatch(
    {
      sport: "football",
      competitionSlug: "egyptian-premier-league",
      competitionName: "الدوري المصري",
      homeName: "القناة",
      homeNameEn: "Al Qanah",
      awayName: "المصري",
      awayNameEn: "Al Masry",
      date: dayKey(NOW + 2 * DAY),
      time: "17:00",
      status: "upcoming",
      slug: "al-qanah-vs-al-masry-resolution-test-draft",
      isPublished: false,
    },
    "test",
  );
  assert.ok(draft.ok, draft.ok ? "" : draft.error);

  assert.equal(await resolveInboundMatchSlug("القناه-ضد-المصري"), "al-qanah-vs-al-masry-resolution-test", "العربية عبر الأسماء");
  assert.equal(await resolveInboundMatchSlug("al-qanah-vs-al-masry"), "al-qanah-vs-al-masry-resolution-test", "latin via curated aliases");
  assert.equal(await resolveInboundMatchSlug("al-qanah-vs-al-masry-resolution-test-draft"), null, "a draft is never the target of a redirect");
  assert.equal(await resolveInboundMatchSlug("al-qanah-vs-ismaily"), null, "an unknown tie stays a 404");
});
