import test from "node:test";
import assert from "node:assert/strict";

import { CanonicalMapper, slugify, type MapperDeps } from "../src/mapper";
import { ConflictDetector } from "../src/conflict";
import { EntityResolver } from "../src/entity-resolver";
import { MemoryCanonicalStore } from "../src/store";
import type { NormalizedCompetition, NormalizedFixture, NormalizedStandingRow, NormalizedTeam, NormalizedTopScorer, ProviderName } from "../src/provider";

function setup(primary: ProviderName = "sportradar") {
  const store = new MemoryCanonicalStore();
  const resolver = new EntityResolver(store);
  const conflicts = new ConflictDetector();
  const deps: MapperDeps = {
    store,
    resolver,
    conflicts,
    primaryProviderFor: () => primary,
    nameDictionary: (kind, providerName) => {
      const dictionary: Record<string, { en: string; ar: string }> = {
        "Al Ahly": { en: "Al Ahly", ar: "الأهلي" },
        "Zamalek": { en: "Zamalek", ar: "الزمالك" },
        "Egyptian Premier League": { en: "Egyptian Premier League", ar: "الدوري المصري الممتاز" },
      };
      return kind && providerName ? dictionary[providerName] ?? null : null;
    },
  };
  return { store, resolver, conflicts, mapper: new CanonicalMapper(deps), primary };
}

const afTeam = (id: string, name: string): NormalizedTeam => ({
  providerId: id,
  name,
  shortName: null,
  abbreviation: null,
  countryCode: "EG",
  countryName: "Egypt",
  logoUrl: `https://cdn.example/${id}.png`,
  foundedYear: 1907,
  venueName: "Cairo International Stadium",
  primaryColor: "#C8102E",
  secondaryColor: null,
  isNationalTeam: false,
});

const fixture = (over: Partial<NormalizedFixture> = {}): NormalizedFixture => ({
  providerId: "af-1000",
  sport: "football",
  competitionProviderId: "af-eg",
  seasonProviderId: "2026",
  round: "Matchday 18",
  homeProviderId: "af-ahly",
  awayProviderId: "af-zamalek",
  scheduledAt: "2026-04-10T18:00:00.000Z",
  status: "live",
  homeScore: 1,
  awayScore: 0,
  periods: [{ label: "1H", home: 1, away: 0 }],
  venueProviderId: "af-venue-1",
  venueName: "Cairo International Stadium",
  attendance: 74000,
  minute: 34,
  ...over,
});

test("slugify is stable, lowercase and hyphenated", () => {
  assert.equal(slugify("Premier League"), "premier-league");
  assert.equal(slugify("  Al Ahly  SC "), "al-ahly-sc");
  assert.equal(slugify("Copa del Rey"), "copa-del-rey");
  assert.equal(slugify("الدوري المصري"), "الدوري-المصري");
  assert.equal(slugify("Ligue 1"), "ligue-1");
});

test("competition upsert applies the bilingual dictionary and keeps the slug", async () => {
  const { store, mapper } = setup();
  const input: NormalizedCompetition = { providerId: "af-eg", name: "Egyptian Premier League", shortName: "Egypt PL", countryCode: "EG", countryName: "Egypt", type: "League", logoUrl: null };
  const id = await mapper.upsertCompetition("api_football", input, "sport-football");

  const saved = await store.competitions.get(id);
  assert.ok(saved);
  assert.equal(saved.name.ar, "الدوري المصري الممتاز");
  assert.equal(saved.name.en, "Egyptian Premier League");
  assert.equal(saved.slug, "egyptian-premier-league");
  assert.equal(saved.type, "league");

  const mapping = await store.mappings.find("competition", "api_football", "af-eg");
  assert.equal(mapping?.canonicalId, id, "the creating provider id must be linked to the new canonical entity");
  assert.equal(mapping?.verified, true);
});

test("team upsert is idempotent per provider id and preserves the editor slug", async () => {
  const { store, mapper } = setup();
  const first = await mapper.upsertTeam("api_football", afTeam("af-ahly", "Al Ahly"), "sport-football");
  assert.equal(first.needsReview, false);
  let saved = await store.teams.get(first.id);
  assert.equal(saved?.name.ar, "الأهلي");
  assert.equal(saved?.slug, "al-ahly");
  assert.equal(saved?.abbreviation, "AA", "initial of each word, capped at three");

  // an editor renames the slug; a later provider sync must not revert it
  await store.teams.put({ ...saved!, slug: "al-ahly-cairo" });
  const second = await mapper.upsertTeam("sportmonks", { ...afTeam("sm-9", "Al Ahly"), logoUrl: null }, "sport-football");
  assert.equal(second.id, first.id, "both providers must land on the same canonical id");
  assert.equal((await store.mappings.find("team", "api_football", "af-ahly"))?.canonicalId, first.id);
  assert.equal((await store.mappings.find("team", "sportmonks", "sm-9"))?.canonicalId, first.id);
  assert.equal((await store.teams.list()).length, 1, "no duplicate canonical team");
  saved = await store.teams.get(first.id);
  assert.equal(saved?.slug, "al-ahly-cairo");
  assert.equal(saved?.logoUrl, "https://cdn.example/af-ahly.png", "a null logo must not erase a known one");
});

test("match upsert creates a canonical match with provenance in extension", async () => {
  const { store, mapper } = setup();
  const home = await mapper.upsertTeam("api_football", afTeam("af-ahly", "Al Ahly"), "sport-football");
  const away = await mapper.upsertTeam("api_football", afTeam("af-zamalek", "Zamalek"), "sport-football");
  const competitionId = await mapper.upsertCompetition("api_football", { providerId: "af-eg", name: "Egyptian Premier League", shortName: null, countryCode: "EG", countryName: "Egypt", type: "league", logoUrl: null }, "sport-football");

  const res = await mapper.upsertMatch(
    "api_football",
    fixture(),
    { sportId: "sport-football", competitionId, seasonId: "season-2026", homeTeamId: home.id, awayTeamId: away.id },
    "api_football",
  );
  assert.equal(res.created, true);
  assert.equal(res.conflicts, 0);

  const match = await store.matches.get(res.id);
  assert.ok(match);
  assert.equal(match.status, "live");
  assert.equal(match.homeScore, 1);
  assert.equal(match.awayScore, 0);
  assert.equal(match.extension.provider, "api_football");
  assert.equal(match.extension.providerMatchId, "af-1000");
  assert.equal(match.extension.minute, 34);
  assert.equal(match.scheduledAt, "2026-04-10T18:00:00.000Z", "kickoffs are stored in UTC as received");
  assert.equal(match.periods.length, 1);
});

test("a secondary provider cannot rewrite the primary provider's score", async () => {
  const { store, mapper, conflicts } = setup("sportradar");
  const home = await mapper.upsertTeam("api_football", afTeam("af-ahly", "Al Ahly"), "sport-football");
  const away = await mapper.upsertTeam("api_football", afTeam("af-zamalek", "Zamalek"), "sport-football");
  const competitionId = await mapper.upsertCompetition("api_football", { providerId: "af-eg", name: "Egyptian Premier League", shortName: null, countryCode: "EG", countryName: "Egypt", type: "league", logoUrl: null }, "sport-football");
  const refs = { sportId: "sport-football", competitionId, seasonId: "season-2026", homeTeamId: home.id, awayTeamId: away.id };

  const first = await mapper.upsertMatch("sportradar", fixture({ providerId: "sr-77" }), refs, "sportradar");
  assert.equal(first.conflicts, 0);

  const disputed = await mapper.upsertMatch("api_football", fixture({ providerId: "af-1000", homeScore: 2, awayScore: 2 }), refs, "sportradar");
  assert.equal(disputed.created, false, "same fixture, already mapped by kickoff window");
  assert.ok(disputed.conflicts >= 1, "the score disagreement must be recorded");

  const match = await store.matches.get(first.id);
  assert.equal(match?.homeScore, 1, "primary value must survive");
  assert.equal(match?.awayScore, 0);
  assert.equal(conflicts.open().filter((c) => c.severity === "critical").length, 1);
});

test("the primary provider can update its own score", async () => {
  const { store, mapper } = setup("sportradar");
  const home = await mapper.upsertTeam("api_football", afTeam("af-ahly", "Al Ahly"), "sport-football");
  const away = await mapper.upsertTeam("api_football", afTeam("af-zamalek", "Zamalek"), "sport-football");
  const competitionId = await mapper.upsertCompetition("api_football", { providerId: "af-eg", name: "Egyptian Premier League", shortName: null, countryCode: "EG", countryName: "Egypt", type: "league", logoUrl: null }, "sport-football");
  const refs = { sportId: "sport-football", competitionId, seasonId: "season-2026", homeTeamId: home.id, awayTeamId: away.id };

  const first = await mapper.upsertMatch("sportradar", fixture({ providerId: "sr-77" }), refs, "sportradar");
  await mapper.upsertMatch("sportradar", fixture({ providerId: "sr-77", homeScore: 2, status: "finished" }), refs, "sportradar");

  const match = await store.matches.get(first.id);
  assert.equal(match?.homeScore, 2);
  assert.equal(match?.status, "finished");
  assert.equal(match?.winner, "home");
});

test("standings are written with a computed goal difference", async () => {
  const { store, mapper } = setup();
  const team = await mapper.upsertTeam("api_football", afTeam("af-ahly", "Al Ahly"), "sport-football");
  const rows: NormalizedStandingRow[] = [
    { teamProviderId: "af-ahly", group: null, position: 1, played: 18, won: 14, drawn: 3, lost: 1, goalsFor: 40, goalsAgainst: 11, points: 45, form: ["W", "W", "D", "W", "W"], status: "Champions League" },
  ];
  const report = await mapper.upsertStandings("api_football", rows, { competitionId: "comp-1", seasonId: "season-2026", resolveTeam: async () => team.id }, "api_football");
  assert.equal(report.updated.length, 1);

  const saved = (await store.standings.list())[0];
  assert.equal(saved.goalDifference, 29);
  assert.equal(saved.status, null, "provider-specific status strings must not leak into canonical data");
  assert.equal(saved.provider, "api_football");
  assert.equal(saved.form.length, 5);
});

test("a secondary provider cannot change standings points", async () => {
  const { store, mapper, conflicts } = setup("sportradar");
  const team = await mapper.upsertTeam("api_football", afTeam("af-ahly", "Al Ahly"), "sport-football");
  const refs = { competitionId: "comp-1", seasonId: "season-2026", resolveTeam: async () => team.id };
  const row = (points: number): NormalizedStandingRow => ({ teamProviderId: "af-ahly", group: null, position: 1, played: 18, won: 14, drawn: 3, lost: 1, goalsFor: 40, goalsAgainst: 11, points, form: [], status: null });

  await mapper.upsertStandings("sportradar", [row(45)], refs, "sportradar");
  const report = await mapper.upsertStandings("api_football", [row(46)], refs, "sportradar");
  assert.equal(report.conflicts, 1);
  assert.equal(report.updated.length, 0);
  assert.equal((await store.standings.list())[0].points, 45);
  assert.equal(conflicts.open().length, 1);
});

test("top scorers are stored per season with a stable id", async () => {
  const { store, mapper } = setup();
  const rows: NormalizedTopScorer[] = [{ playerProviderId: "af-p1", teamProviderId: null, goals: 19, appearances: 22, penalties: 3 }];
  const written = await mapper.upsertTopScorers(rows, { competitionId: "comp-1", seasonId: "season-2026", resolvePlayer: async () => "player-1" });
  assert.equal(written, 1);

  const saved = (await store.topScorers.list())[0];
  assert.equal(saved.goals, 19);
  assert.equal(saved.playerId, "player-1");
  assert.ok(saved.id.length > 0);

  await mapper.upsertTopScorers(rows, { competitionId: "comp-1", seasonId: "season-2026", resolvePlayer: async () => "player-1" });
  assert.equal((await store.topScorers.list()).length, 1, "re-sync must not duplicate rows");
});
