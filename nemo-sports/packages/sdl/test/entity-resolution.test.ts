import test from "node:test";
import assert from "node:assert/strict";

import { EntityResolver } from "../src/entity-resolver";
import { MemoryCanonicalStore } from "../src/store";
import type { NormalizedCompetition, NormalizedPlayer, NormalizedTeam } from "../src/provider";
import type { Match, Team } from "../src/types";

const team = (id: string, en: string, ar: string): Team => ({
  id,
  sportId: "sport-football",
  countryId: null,
  name: { en, ar },
  shortName: { en, ar },
  abbreviation: en.slice(0, 3).toUpperCase(),
  slug: en.toLowerCase().replace(/\s+/g, "-"),
  logoUrl: null,
  foundedYear: null,
  venueId: null,
  primaryColor: null,
  secondaryColor: null,
  isNationalTeam: false,
  type: "club",
  isActive: true,
  social: {},
});

const normalizedTeam = (providerId: string, name: string, shortName?: string, abbreviation?: string): NormalizedTeam => ({
  providerId,
  name,
  shortName: shortName ?? null,
  abbreviation: abbreviation ?? null,
  countryCode: null,
  countryName: null,
  logoUrl: null,
  foundedYear: null,
  venueName: null,
  primaryColor: null,
  secondaryColor: null,
  isNationalTeam: false,
});

const baseMatch = (id: string, kickoff: string): Match => ({
  id,
  sportId: "sport-football",
  competitionId: "comp-1",
  seasonId: "season-1",
  round: null,
  homeTeamId: "team-ahly",
  awayTeamId: "team-zamalek",
  venueId: null,
  scheduledAt: kickoff,
  status: "scheduled",
  homeScore: null,
  awayScore: null,
  periods: [],
  aggregateScore: null,
  winner: null,
  leg: null,
  neutralVenue: false,
  referee: null,
  attendance: null,
  isFeatured: false,
  extension: {},
});

async function seed() {
  const store = new MemoryCanonicalStore();
  await store.teams.put(team("team-ahly", "Al Ahly", "الأهلي"));
  await store.teams.put(team("team-zamalek", "Zamalek", "الزمالك"));
  return { store, resolver: new EntityResolver(store) };
}

test("identical name resolves by fingerprint and is auto-verified", async () => {
  const { store, resolver } = await seed();
  const res = await resolver.resolveTeam("sportmonks", normalizedTeam("sm-1", "Al Ahly"));
  assert.equal(res.canonicalId, "team-ahly");
  assert.equal(res.created, false);
  assert.equal(res.matchedBy, "fingerprint");
  assert.equal(res.needsReview, false);

  const mapping = await store.mappings.find("team", "sportmonks", "sm-1");
  assert.ok(mapping);
  assert.equal(mapping.canonicalId, "team-ahly");
  assert.equal(mapping.verified, true);
  assert.ok(mapping.confidence >= 0.9);
});

test("spelling variant links to the same canonical entity", async () => {
  const { resolver } = await seed();
  const a = await resolver.resolveTeam("sportmonks", normalizedTeam("sm-1", "Al Ahly"));
  const b = await resolver.resolveTeam("api_football", normalizedTeam("af-32", "AL-AHLY SC"));
  assert.equal(a.canonicalId, "team-ahly");
  assert.equal(b.canonicalId, "team-ahly");
  assert.equal(b.matchedBy, "fingerprint");
});

test("an unmapped provider id replays the exact mapping on the second call", async () => {
  const { store, resolver } = await seed();
  await resolver.resolveTeam("sportmonks", normalizedTeam("sm-1", "Al Ahly"));
  const before = (await store.mappings.all()).length;
  const again = await resolver.resolveTeam("sportmonks", normalizedTeam("sm-1", "Totally Different Name"));
  assert.equal(again.matchedBy, "exact_mapping");
  assert.equal(again.canonicalId, "team-ahly");
  assert.equal((await store.mappings.all()).length, before, "no duplicate mapping rows");
});

test("a weak match never auto-links — the entity is created instead", async () => {
  const { resolver } = await seed();
  const res = await resolver.resolveTeam("sportmonks", normalizedTeam("sm-9", "Bayern München"));
  assert.equal(res.created, true);
  assert.equal(res.canonicalId, "");
  assert.equal(res.matchedBy, "created");
});

test("a borderline match links but is flagged for admin review", async () => {
  const { store } = await seed();
  // lower the review floor so the borderline band is reachable deterministically
  const resolver = new EntityResolver(store, { autoVerifyAbove: 0.99, reviewBelow: 0.5 });
  const res = await resolver.resolveTeam("api_football", normalizedTeam("af-1", "Al Ahly Tripoli"));
  assert.equal(res.matchedBy, "fuzzy");
  assert.equal(res.needsReview, true);
  const mapping = await store.mappings.find("team", "api_football", "af-1");
  assert.equal(mapping?.verified, false);
});

test("pending() returns only unverified mappings for the admin queue", async () => {
  const { store } = await seed();
  const resolver = new EntityResolver(store, { autoVerifyAbove: 0.99, reviewBelow: 0.5 });

  // a fuzzy hit lands in the review queue…
  await resolver.resolveTeam("sportmonks", normalizedTeam("sm-1", "Al Ahly Tripoli"));
  let pending = await store.mappings.pending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].provider, "sportmonks");
  assert.equal(pending[0].canonicalId, "team-ahly");

  // …an exact hit does not
  await resolver.resolveTeam("api_football", normalizedTeam("af-1", "Al Ahly"));
  assert.equal((await store.mappings.all()).length, 2);
  assert.equal((await store.mappings.pending()).length, 1, "auto-verified mappings stay out of the queue");

  await store.mappings.verify(pending[0].id, true);
  assert.equal((await store.mappings.pending()).length, 0);
});

test("relink moves a provider id to the correct canonical entity without deleting ids", async () => {
  const { store, resolver } = await seed();
  const wrong = await resolver.resolveTeam("sportmonks", normalizedTeam("sm-7", "Al Ahly"));
  assert.equal(wrong.canonicalId, "team-ahly");

  await resolver.relink("team", "sportmonks", "sm-7", "team-zamalek", "editor: this feed id is Zamalek");
  const mapping = await store.mappings.find("team", "sportmonks", "sm-7");
  assert.equal(mapping?.canonicalId, "team-zamalek");
  assert.equal(mapping?.verified, true);
  assert.ok((await store.teams.get("team-ahly")) !== null, "canonical id survives a relink");
});

test("players and competitions resolve through the same path", async () => {
  const { store, resolver } = await seed();
  await store.players.put({
    id: "player-1",
    sportId: "sport-football",
    currentTeamId: "team-ahly",
    countryId: null,
    fullName: { en: "Mohamed Sherif", ar: "محمد شريف" },
    slug: "mohamed-sherif",
    dateOfBirth: null,
    position: "Forward",
    jerseyNumber: 9,
    photoUrl: null,
    photoAttribution: null,
    heightCm: null,
    weightKg: null,
    footPreference: null,
    careerStartedYear: null,
    isActive: true,
    biography: null,
  });

  const playerInput: NormalizedPlayer = {
    providerId: "sm-275",
    fullName: "Mohamed Sherif",
    dateOfBirth: null,
    countryCode: "EG",
    position: "Forward",
    photoUrl: null,
    photoAttribution: null,
    heightCm: null,
    weightKg: null,
    footPreference: null,
    teamProviderId: "sm-1",
  };
  const p = await resolver.resolvePlayer("sportmonks", playerInput);
  assert.equal(p.canonicalId, "player-1");
  assert.equal(p.matchedBy, "fingerprint");

  const comp: NormalizedCompetition = { providerId: "sm-8", name: "Egyptian Premier League", shortName: "Egypt PL", countryCode: "EG", countryName: "Egypt", type: "league", logoUrl: null };
  const c = await resolver.resolveCompetition("sportmonks", comp);
  assert.equal(c.created, true, "unknown competition must be created, never guessed");
});

test("matches are deduped by competition + kickoff window + teams", async () => {
  const { store, resolver } = await seed();
  const kickoff = "2026-04-10T18:00:00.000Z";
  await store.matches.put(baseMatch("match-1", kickoff));
  const refs = { homeTeamId: "team-ahly", awayTeamId: "team-zamalek", competitionId: "comp-1" };

  const same = await resolver.resolveMatch(
    "sportmonks",
    { providerMatchId: "sm-500", homeProviderId: "sm-1", awayProviderId: "sm-2", scheduledAt: "2026-04-10T18:05:00.000Z", competitionProviderId: "sm-8" },
    refs,
  );
  assert.equal(same.canonicalId, "match-1");
  assert.equal(same.matchedBy, "fingerprint");

  const later = await resolver.resolveMatch(
    "api_football",
    { providerMatchId: "af-900", homeProviderId: "af-1", awayProviderId: "af-2", scheduledAt: "2026-04-17T18:00:00.000Z", competitionProviderId: "af-8" },
    refs,
  );
  assert.equal(later.created, true, "a fixture a week later is a different match");
});

test("match mapping is replayed for the same provider id", async () => {
  const { store, resolver } = await seed();
  await store.matches.put(baseMatch("match-1", "2026-04-10T18:00:00.000Z"));
  const refs = { homeTeamId: "team-ahly", awayTeamId: "team-zamalek", competitionId: "comp-1" };
  const input = { providerMatchId: "sm-500", homeProviderId: "sm-1", awayProviderId: "sm-2", scheduledAt: "2026-04-10T18:05:00.000Z", competitionProviderId: "sm-8" };

  const first = await resolver.resolveMatch("sportmonks", input, refs);
  const second = await resolver.resolveMatch("sportmonks", input, refs);
  assert.equal(first.canonicalId, "match-1");
  assert.equal(second.matchedBy, "exact_mapping");
  assert.equal(second.canonicalId, "match-1");
});
