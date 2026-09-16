"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const mapper_1 = require("../src/mapper");
const conflict_1 = require("../src/conflict");
const entity_resolver_1 = require("../src/entity-resolver");
const store_1 = require("../src/store");
function setup(primary = "sportradar") {
    const store = new store_1.MemoryCanonicalStore();
    const resolver = new entity_resolver_1.EntityResolver(store);
    const conflicts = new conflict_1.ConflictDetector();
    const deps = {
        store,
        resolver,
        conflicts,
        primaryProviderFor: () => primary,
        nameDictionary: (kind, providerName) => {
            const dictionary = {
                "Al Ahly": { en: "Al Ahly", ar: "الأهلي" },
                "Zamalek": { en: "Zamalek", ar: "الزمالك" },
                "Egyptian Premier League": { en: "Egyptian Premier League", ar: "الدوري المصري الممتاز" },
            };
            return kind && providerName ? dictionary[providerName] ?? null : null;
        },
    };
    return { store, resolver, conflicts, mapper: new mapper_1.CanonicalMapper(deps), primary };
}
const afTeam = (id, name) => ({
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
const fixture = (over = {}) => ({
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
(0, node_test_1.default)("slugify is stable, lowercase and hyphenated", () => {
    strict_1.default.equal((0, mapper_1.slugify)("Premier League"), "premier-league");
    strict_1.default.equal((0, mapper_1.slugify)("  Al Ahly  SC "), "al-ahly-sc");
    strict_1.default.equal((0, mapper_1.slugify)("Copa del Rey"), "copa-del-rey");
    strict_1.default.equal((0, mapper_1.slugify)("الدوري المصري"), "الدوري-المصري");
    strict_1.default.equal((0, mapper_1.slugify)("Ligue 1"), "ligue-1");
});
(0, node_test_1.default)("competition upsert applies the bilingual dictionary and keeps the slug", async () => {
    const { store, mapper } = setup();
    const input = { providerId: "af-eg", name: "Egyptian Premier League", shortName: "Egypt PL", countryCode: "EG", countryName: "Egypt", type: "League", logoUrl: null };
    const id = await mapper.upsertCompetition("api_football", input, "sport-football");
    const saved = await store.competitions.get(id);
    strict_1.default.ok(saved);
    strict_1.default.equal(saved.name.ar, "الدوري المصري الممتاز");
    strict_1.default.equal(saved.name.en, "Egyptian Premier League");
    strict_1.default.equal(saved.slug, "egyptian-premier-league");
    strict_1.default.equal(saved.type, "league");
    const mapping = await store.mappings.find("competition", "api_football", "af-eg");
    strict_1.default.equal(mapping?.canonicalId, id, "the creating provider id must be linked to the new canonical entity");
    strict_1.default.equal(mapping?.verified, true);
});
(0, node_test_1.default)("team upsert is idempotent per provider id and preserves the editor slug", async () => {
    const { store, mapper } = setup();
    const first = await mapper.upsertTeam("api_football", afTeam("af-ahly", "Al Ahly"), "sport-football");
    strict_1.default.equal(first.needsReview, false);
    let saved = await store.teams.get(first.id);
    strict_1.default.equal(saved?.name.ar, "الأهلي");
    strict_1.default.equal(saved?.slug, "al-ahly");
    strict_1.default.equal(saved?.abbreviation, "AA", "initial of each word, capped at three");
    // an editor renames the slug; a later provider sync must not revert it
    await store.teams.put({ ...saved, slug: "al-ahly-cairo" });
    const second = await mapper.upsertTeam("sportmonks", { ...afTeam("sm-9", "Al Ahly"), logoUrl: null }, "sport-football");
    strict_1.default.equal(second.id, first.id, "both providers must land on the same canonical id");
    strict_1.default.equal((await store.mappings.find("team", "api_football", "af-ahly"))?.canonicalId, first.id);
    strict_1.default.equal((await store.mappings.find("team", "sportmonks", "sm-9"))?.canonicalId, first.id);
    strict_1.default.equal((await store.teams.list()).length, 1, "no duplicate canonical team");
    saved = await store.teams.get(first.id);
    strict_1.default.equal(saved?.slug, "al-ahly-cairo");
    strict_1.default.equal(saved?.logoUrl, "https://cdn.example/af-ahly.png", "a null logo must not erase a known one");
});
(0, node_test_1.default)("match upsert creates a canonical match with provenance in extension", async () => {
    const { store, mapper } = setup();
    const home = await mapper.upsertTeam("api_football", afTeam("af-ahly", "Al Ahly"), "sport-football");
    const away = await mapper.upsertTeam("api_football", afTeam("af-zamalek", "Zamalek"), "sport-football");
    const competitionId = await mapper.upsertCompetition("api_football", { providerId: "af-eg", name: "Egyptian Premier League", shortName: null, countryCode: "EG", countryName: "Egypt", type: "league", logoUrl: null }, "sport-football");
    const res = await mapper.upsertMatch("api_football", fixture(), { sportId: "sport-football", competitionId, seasonId: "season-2026", homeTeamId: home.id, awayTeamId: away.id }, "api_football");
    strict_1.default.equal(res.created, true);
    strict_1.default.equal(res.conflicts, 0);
    const match = await store.matches.get(res.id);
    strict_1.default.ok(match);
    strict_1.default.equal(match.status, "live");
    strict_1.default.equal(match.homeScore, 1);
    strict_1.default.equal(match.awayScore, 0);
    strict_1.default.equal(match.extension.provider, "api_football");
    strict_1.default.equal(match.extension.providerMatchId, "af-1000");
    strict_1.default.equal(match.extension.minute, 34);
    strict_1.default.equal(match.scheduledAt, "2026-04-10T18:00:00.000Z", "kickoffs are stored in UTC as received");
    strict_1.default.equal(match.periods.length, 1);
});
(0, node_test_1.default)("a secondary provider cannot rewrite the primary provider's score", async () => {
    const { store, mapper, conflicts } = setup("sportradar");
    const home = await mapper.upsertTeam("api_football", afTeam("af-ahly", "Al Ahly"), "sport-football");
    const away = await mapper.upsertTeam("api_football", afTeam("af-zamalek", "Zamalek"), "sport-football");
    const competitionId = await mapper.upsertCompetition("api_football", { providerId: "af-eg", name: "Egyptian Premier League", shortName: null, countryCode: "EG", countryName: "Egypt", type: "league", logoUrl: null }, "sport-football");
    const refs = { sportId: "sport-football", competitionId, seasonId: "season-2026", homeTeamId: home.id, awayTeamId: away.id };
    const first = await mapper.upsertMatch("sportradar", fixture({ providerId: "sr-77" }), refs, "sportradar");
    strict_1.default.equal(first.conflicts, 0);
    const disputed = await mapper.upsertMatch("api_football", fixture({ providerId: "af-1000", homeScore: 2, awayScore: 2 }), refs, "sportradar");
    strict_1.default.equal(disputed.created, false, "same fixture, already mapped by kickoff window");
    strict_1.default.ok(disputed.conflicts >= 1, "the score disagreement must be recorded");
    const match = await store.matches.get(first.id);
    strict_1.default.equal(match?.homeScore, 1, "primary value must survive");
    strict_1.default.equal(match?.awayScore, 0);
    strict_1.default.equal(conflicts.open().filter((c) => c.severity === "critical").length, 1);
});
(0, node_test_1.default)("the primary provider can update its own score", async () => {
    const { store, mapper } = setup("sportradar");
    const home = await mapper.upsertTeam("api_football", afTeam("af-ahly", "Al Ahly"), "sport-football");
    const away = await mapper.upsertTeam("api_football", afTeam("af-zamalek", "Zamalek"), "sport-football");
    const competitionId = await mapper.upsertCompetition("api_football", { providerId: "af-eg", name: "Egyptian Premier League", shortName: null, countryCode: "EG", countryName: "Egypt", type: "league", logoUrl: null }, "sport-football");
    const refs = { sportId: "sport-football", competitionId, seasonId: "season-2026", homeTeamId: home.id, awayTeamId: away.id };
    const first = await mapper.upsertMatch("sportradar", fixture({ providerId: "sr-77" }), refs, "sportradar");
    await mapper.upsertMatch("sportradar", fixture({ providerId: "sr-77", homeScore: 2, status: "finished" }), refs, "sportradar");
    const match = await store.matches.get(first.id);
    strict_1.default.equal(match?.homeScore, 2);
    strict_1.default.equal(match?.status, "finished");
    strict_1.default.equal(match?.winner, "home");
});
(0, node_test_1.default)("standings are written with a computed goal difference", async () => {
    const { store, mapper } = setup();
    const team = await mapper.upsertTeam("api_football", afTeam("af-ahly", "Al Ahly"), "sport-football");
    const rows = [
        { teamProviderId: "af-ahly", group: null, position: 1, played: 18, won: 14, drawn: 3, lost: 1, goalsFor: 40, goalsAgainst: 11, points: 45, form: ["W", "W", "D", "W", "W"], status: "Champions League" },
    ];
    const report = await mapper.upsertStandings("api_football", rows, { competitionId: "comp-1", seasonId: "season-2026", resolveTeam: async () => team.id }, "api_football");
    strict_1.default.equal(report.updated.length, 1);
    const saved = (await store.standings.list())[0];
    strict_1.default.equal(saved.goalDifference, 29);
    strict_1.default.equal(saved.status, null, "provider-specific status strings must not leak into canonical data");
    strict_1.default.equal(saved.provider, "api_football");
    strict_1.default.equal(saved.form.length, 5);
});
(0, node_test_1.default)("a secondary provider cannot change standings points", async () => {
    const { store, mapper, conflicts } = setup("sportradar");
    const team = await mapper.upsertTeam("api_football", afTeam("af-ahly", "Al Ahly"), "sport-football");
    const refs = { competitionId: "comp-1", seasonId: "season-2026", resolveTeam: async () => team.id };
    const row = (points) => ({ teamProviderId: "af-ahly", group: null, position: 1, played: 18, won: 14, drawn: 3, lost: 1, goalsFor: 40, goalsAgainst: 11, points, form: [], status: null });
    await mapper.upsertStandings("sportradar", [row(45)], refs, "sportradar");
    const report = await mapper.upsertStandings("api_football", [row(46)], refs, "sportradar");
    strict_1.default.equal(report.conflicts, 1);
    strict_1.default.equal(report.updated.length, 0);
    strict_1.default.equal((await store.standings.list())[0].points, 45);
    strict_1.default.equal(conflicts.open().length, 1);
});
(0, node_test_1.default)("top scorers are stored per season with a stable id", async () => {
    const { store, mapper } = setup();
    const rows = [{ playerProviderId: "af-p1", teamProviderId: null, goals: 19, appearances: 22, penalties: 3 }];
    const written = await mapper.upsertTopScorers(rows, { competitionId: "comp-1", seasonId: "season-2026", resolvePlayer: async () => "player-1" });
    strict_1.default.equal(written, 1);
    const saved = (await store.topScorers.list())[0];
    strict_1.default.equal(saved.goals, 19);
    strict_1.default.equal(saved.playerId, "player-1");
    strict_1.default.ok(saved.id.length > 0);
    await mapper.upsertTopScorers(rows, { competitionId: "comp-1", seasonId: "season-2026", resolvePlayer: async () => "player-1" });
    strict_1.default.equal((await store.topScorers.list()).length, 1, "re-sync must not duplicate rows");
});
