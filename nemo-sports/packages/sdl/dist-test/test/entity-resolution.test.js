"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const entity_resolver_1 = require("../src/entity-resolver");
const store_1 = require("../src/store");
const team = (id, en, ar) => ({
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
const normalizedTeam = (providerId, name, shortName, abbreviation) => ({
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
const baseMatch = (id, kickoff) => ({
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
    const store = new store_1.MemoryCanonicalStore();
    await store.teams.put(team("team-ahly", "Al Ahly", "الأهلي"));
    await store.teams.put(team("team-zamalek", "Zamalek", "الزمالك"));
    return { store, resolver: new entity_resolver_1.EntityResolver(store) };
}
(0, node_test_1.default)("identical name resolves by fingerprint and is auto-verified", async () => {
    const { store, resolver } = await seed();
    const res = await resolver.resolveTeam("sportmonks", normalizedTeam("sm-1", "Al Ahly"));
    strict_1.default.equal(res.canonicalId, "team-ahly");
    strict_1.default.equal(res.created, false);
    strict_1.default.equal(res.matchedBy, "fingerprint");
    strict_1.default.equal(res.needsReview, false);
    const mapping = await store.mappings.find("team", "sportmonks", "sm-1");
    strict_1.default.ok(mapping);
    strict_1.default.equal(mapping.canonicalId, "team-ahly");
    strict_1.default.equal(mapping.verified, true);
    strict_1.default.ok(mapping.confidence >= 0.9);
});
(0, node_test_1.default)("spelling variant links to the same canonical entity", async () => {
    const { resolver } = await seed();
    const a = await resolver.resolveTeam("sportmonks", normalizedTeam("sm-1", "Al Ahly"));
    const b = await resolver.resolveTeam("api_football", normalizedTeam("af-32", "AL-AHLY SC"));
    strict_1.default.equal(a.canonicalId, "team-ahly");
    strict_1.default.equal(b.canonicalId, "team-ahly");
    strict_1.default.equal(b.matchedBy, "fingerprint");
});
(0, node_test_1.default)("an unmapped provider id replays the exact mapping on the second call", async () => {
    const { store, resolver } = await seed();
    await resolver.resolveTeam("sportmonks", normalizedTeam("sm-1", "Al Ahly"));
    const before = (await store.mappings.all()).length;
    const again = await resolver.resolveTeam("sportmonks", normalizedTeam("sm-1", "Totally Different Name"));
    strict_1.default.equal(again.matchedBy, "exact_mapping");
    strict_1.default.equal(again.canonicalId, "team-ahly");
    strict_1.default.equal((await store.mappings.all()).length, before, "no duplicate mapping rows");
});
(0, node_test_1.default)("a weak match never auto-links — the entity is created instead", async () => {
    const { resolver } = await seed();
    const res = await resolver.resolveTeam("sportmonks", normalizedTeam("sm-9", "Bayern München"));
    strict_1.default.equal(res.created, true);
    strict_1.default.equal(res.canonicalId, "");
    strict_1.default.equal(res.matchedBy, "created");
});
(0, node_test_1.default)("a borderline match links but is flagged for admin review", async () => {
    const { store } = await seed();
    // lower the review floor so the borderline band is reachable deterministically
    const resolver = new entity_resolver_1.EntityResolver(store, { autoVerifyAbove: 0.99, reviewBelow: 0.5 });
    const res = await resolver.resolveTeam("api_football", normalizedTeam("af-1", "Al Ahly Tripoli"));
    strict_1.default.equal(res.matchedBy, "fuzzy");
    strict_1.default.equal(res.needsReview, true);
    const mapping = await store.mappings.find("team", "api_football", "af-1");
    strict_1.default.equal(mapping?.verified, false);
});
(0, node_test_1.default)("pending() returns only unverified mappings for the admin queue", async () => {
    const { store } = await seed();
    const resolver = new entity_resolver_1.EntityResolver(store, { autoVerifyAbove: 0.99, reviewBelow: 0.5 });
    // a fuzzy hit lands in the review queue…
    await resolver.resolveTeam("sportmonks", normalizedTeam("sm-1", "Al Ahly Tripoli"));
    let pending = await store.mappings.pending();
    strict_1.default.equal(pending.length, 1);
    strict_1.default.equal(pending[0].provider, "sportmonks");
    strict_1.default.equal(pending[0].canonicalId, "team-ahly");
    // …an exact hit does not
    await resolver.resolveTeam("api_football", normalizedTeam("af-1", "Al Ahly"));
    strict_1.default.equal((await store.mappings.all()).length, 2);
    strict_1.default.equal((await store.mappings.pending()).length, 1, "auto-verified mappings stay out of the queue");
    await store.mappings.verify(pending[0].id, true);
    strict_1.default.equal((await store.mappings.pending()).length, 0);
});
(0, node_test_1.default)("relink moves a provider id to the correct canonical entity without deleting ids", async () => {
    const { store, resolver } = await seed();
    const wrong = await resolver.resolveTeam("sportmonks", normalizedTeam("sm-7", "Al Ahly"));
    strict_1.default.equal(wrong.canonicalId, "team-ahly");
    await resolver.relink("team", "sportmonks", "sm-7", "team-zamalek", "editor: this feed id is Zamalek");
    const mapping = await store.mappings.find("team", "sportmonks", "sm-7");
    strict_1.default.equal(mapping?.canonicalId, "team-zamalek");
    strict_1.default.equal(mapping?.verified, true);
    strict_1.default.ok((await store.teams.get("team-ahly")) !== null, "canonical id survives a relink");
});
(0, node_test_1.default)("players and competitions resolve through the same path", async () => {
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
    const playerInput = {
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
    strict_1.default.equal(p.canonicalId, "player-1");
    strict_1.default.equal(p.matchedBy, "fingerprint");
    const comp = { providerId: "sm-8", name: "Egyptian Premier League", shortName: "Egypt PL", countryCode: "EG", countryName: "Egypt", type: "league", logoUrl: null };
    const c = await resolver.resolveCompetition("sportmonks", comp);
    strict_1.default.equal(c.created, true, "unknown competition must be created, never guessed");
});
(0, node_test_1.default)("matches are deduped by competition + kickoff window + teams", async () => {
    const { store, resolver } = await seed();
    const kickoff = "2026-04-10T18:00:00.000Z";
    await store.matches.put(baseMatch("match-1", kickoff));
    const refs = { homeTeamId: "team-ahly", awayTeamId: "team-zamalek", competitionId: "comp-1" };
    const same = await resolver.resolveMatch("sportmonks", { providerMatchId: "sm-500", homeProviderId: "sm-1", awayProviderId: "sm-2", scheduledAt: "2026-04-10T18:05:00.000Z", competitionProviderId: "sm-8" }, refs);
    strict_1.default.equal(same.canonicalId, "match-1");
    strict_1.default.equal(same.matchedBy, "fingerprint");
    const later = await resolver.resolveMatch("api_football", { providerMatchId: "af-900", homeProviderId: "af-1", awayProviderId: "af-2", scheduledAt: "2026-04-17T18:00:00.000Z", competitionProviderId: "af-8" }, refs);
    strict_1.default.equal(later.created, true, "a fixture a week later is a different match");
});
(0, node_test_1.default)("match mapping is replayed for the same provider id", async () => {
    const { store, resolver } = await seed();
    await store.matches.put(baseMatch("match-1", "2026-04-10T18:00:00.000Z"));
    const refs = { homeTeamId: "team-ahly", awayTeamId: "team-zamalek", competitionId: "comp-1" };
    const input = { providerMatchId: "sm-500", homeProviderId: "sm-1", awayProviderId: "sm-2", scheduledAt: "2026-04-10T18:05:00.000Z", competitionProviderId: "sm-8" };
    const first = await resolver.resolveMatch("sportmonks", input, refs);
    const second = await resolver.resolveMatch("sportmonks", input, refs);
    strict_1.default.equal(first.canonicalId, "match-1");
    strict_1.default.equal(second.matchedBy, "exact_mapping");
    strict_1.default.equal(second.canonicalId, "match-1");
});
