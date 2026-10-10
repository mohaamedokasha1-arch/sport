/**
 * Regression tests — match IDs, detail links and the sitemap (priority 2),
 * and sport-aware match routes (priority 3). Offline, in-memory only.
 * Run: npm run sports:test
 */
import test from "node:test";
import assert from "node:assert/strict";

if (process.env.DATABASE_URL) throw new Error("Offline regression tests refuse a configured database");
process.env.NEMO_TEST_MEMORY_ONLY = "1";
// No provider network calls from tests: SportScore disabled, no keys.
process.env.NEMO_SPORTSCORE_ENABLED = "0";
delete process.env.FOOTBALL_DATA_API_KEY;

import { matchPath, matchUrl, schemaSportName } from "@/lib/match-links";
import { SITE_URL } from "@/lib/site";
import { createAdminMatch } from "@/lib/admin-matches";
import { GET as calendarGET } from "@/app/api/v1/calendar/[slug]/route";
import { sportForMatchId } from "@/lib/sdl-gateway";

test("one encoding rule for every match URL: ASCII unchanged, Arabic percent-encoded", () => {
  assert.equal(matchPath("cruz-azul-vs-inter-miami-cf"), "/matches/cruz-azul-vs-inter-miami-cf");
  assert.equal(matchPath("الفتح ضد الأهلي"), `/matches/${encodeURIComponent("الفتح ضد الأهلي")}`);
  assert.equal(matchUrl("al-fateh-vs-al-ahli"), `${SITE_URL}/matches/al-fateh-vs-al-ahli`);
  // A slug with a space must never produce a raw space in a URL.
  assert.ok(!matchUrl("a b").includes(" "));
});

test("schema.org sport names follow the match's sport and never default to Football", () => {
  assert.equal(schemaSportName("football"), "Football");
  assert.equal(schemaSportName("basketball"), "Basketball");
  assert.equal(schemaSportName("tennis"), "Tennis");
  assert.equal(schemaSportName("cricket"), "Cricket");
  assert.equal(schemaSportName("Basketball"), "Basketball");
  assert.equal(schemaSportName(""), "Sports");
  assert.equal(schemaSportName(null), "Sports");
  assert.equal(schemaSportName("esports"), "esports");
});

test("a published basketball match resolves to basketball and its .ics works (was 404 via football)", async () => {
  const created = await createAdminMatch(
    {
      sport: "basketball",
      competitionSlug: "nba",
      competitionName: "NBA",
      homeName: "Memphis Grizzlies",
      awayName: "Chicago Bulls",
      date: "2030-01-10",
      time: "20:00",
      status: "upcoming",
      slug: "memphis-grizzlies-vs-chicago-bulls",
      isPublished: true,
    },
    "test",
  );
  assert.ok(created.ok, created.ok ? "" : created.error);
  const slug = created.match.slug;

  assert.equal(await sportForMatchId(slug), "basketball");

  const res = await calendarGET(new Request(`http://test.local/api/v1/calendar/${encodeURIComponent(slug)}`), {
    params: Promise.resolve({ slug }),
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/calendar/);
  const body = await res.text();
  assert.match(body, /BEGIN:VCALENDAR/);
  assert.match(body, /SUMMARY:Memphis Grizzlies × Chicago Bulls/);
});

test("an unpublished match is never resolved or exported (draft stays private)", async () => {
  const created = await createAdminMatch(
    {
      sport: "tennis",
      competitionSlug: "wimbledon",
      competitionName: "Wimbledon",
      homeName: "Player A",
      awayName: "Player B",
      date: "2030-02-01",
      time: "12:00",
      status: "upcoming",
      slug: "draft-player-a-vs-player-b",
      isPublished: false,
    },
    "test",
  );
  assert.ok(created.ok);
  const res = await calendarGET(new Request("http://test.local/api/v1/calendar/x"), {
    params: Promise.resolve({ slug: created.match.slug }),
  });
  assert.notEqual(res.status, 200);
});

test("match events are requested for the match's own sport, not football", async () => {
  // Intercept the SDL call (no network): record the chain sport and the
  // sport argument the provider actually receives.
  const { getSdl } = await import("@/packages/sdl/src");
  const { sdl } = getSdl();
  const seen: { chainSport?: string; paramSport?: unknown; providerSport?: unknown } = {};
  const original = sdl.fetch.bind(sdl);
  (sdl as unknown as { fetch: unknown }).fetch = async (input: {
    sport: string;
    params: Record<string, unknown>;
    call: (p: unknown) => Promise<unknown>;
  }) => {
    seen.chainSport = input.sport;
    seen.paramSport = input.params.sport;
    const fakeProvider = {
      getMatchEvents: async (args: { sport?: string }) => {
        seen.providerSport = args.sport;
        return { ok: false, error: { kind: "not_found", message: "fake", dataType: "match_events", attempts: [] } };
      },
    };
    await input.call(fakeProvider);
    return { ok: false, error: { kind: "not_found", message: "fake", dataType: "match_events", attempts: [] } };
  };
  try {
    const { matchEvents } = await import("@/lib/sdl-gateway");
    const result = await matchEvents("memphis-grizzlies-vs-chicago-bulls", undefined, "basketball");
    assert.equal(result.ok, false);
    assert.equal(seen.chainSport, "basketball");
    assert.equal(seen.paramSport, "basketball");
    assert.equal(seen.providerSport, "basketball");
  } finally {
    (sdl as unknown as { fetch: unknown }).fetch = original;
  }
});
