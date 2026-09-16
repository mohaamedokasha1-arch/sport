"use strict";
/**
 * SDL · Canonical mapping — provider payloads → canonical entities (§3.4)
 *
 * This is the only place where a provider id becomes a NEMO UUID. It also
 * applies conflict rules before overwriting any authoritative field, so a
 * secondary provider can never silently rewrite a primary provider's score.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CanonicalMapper = void 0;
exports.slugify = slugify;
const store_1 = require("./store");
const normalize_1 = require("./normalize");
class CanonicalMapper {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async upsertCompetition(provider, input, sportId) {
        const { store, resolver } = this.deps;
        const res = await resolver.resolveCompetition(provider, input);
        const id = res.created ? (0, store_1.canonicalId)("competition", `${input.name}-${input.countryName ?? ""}`) : res.canonicalId;
        const existing = await store.competitions.get(id);
        const dictionary = this.deps.nameDictionary?.("competition", input.name);
        const name = dictionary ?? { en: input.name, ar: existing?.name.ar || input.name };
        // slugs are public URLs: derive from the full name, never from an abbreviation
        const slug = existing?.slug ?? slugify(input.name);
        const entity = {
            id,
            sportId,
            countryId: existing?.countryId ?? null,
            name,
            shortName: { en: input.shortName ?? input.name, ar: dictionary?.ar ?? existing?.shortName.ar ?? input.shortName ?? input.name },
            slug,
            logoUrl: input.logoUrl ?? existing?.logoUrl ?? null,
            type: mapCompetitionType(input.type) ?? existing?.type ?? "league",
            gender: existing?.gender ?? "male",
            ageCategory: existing?.ageCategory ?? "senior",
            isActive: true,
            isFeatured: existing?.isFeatured ?? false,
            displayOrder: existing?.displayOrder ?? 100,
            currentSeasonId: existing?.currentSeasonId ?? null,
        };
        await store.competitions.put(entity);
        // link the provider id to the canonical entity on first sight, so the next
        // sync resolves by exact mapping instead of creating a duplicate
        await store.mappings.put({
            entityType: "competition",
            canonicalId: id,
            provider,
            providerId: input.providerId,
            confidence: res.created ? 1 : res.confidence,
            verified: !res.needsReview,
            notes: res.created ? "created from provider" : `linked:${res.matchedBy}`,
        });
        return id;
    }
    async upsertTeam(provider, input, sportId) {
        const { store, resolver } = this.deps;
        const res = await resolver.resolveTeam(provider, input);
        const id = res.created ? (0, store_1.canonicalId)("team", input.name) : res.canonicalId;
        const existing = await store.teams.get(id);
        const dictionary = this.deps.nameDictionary?.("team", input.name);
        const entity = {
            id,
            sportId,
            countryId: existing?.countryId ?? null,
            name: dictionary ?? { en: input.name, ar: existing?.name.ar || input.name },
            shortName: { en: input.shortName ?? input.name, ar: dictionary?.ar ?? existing?.shortName.ar ?? input.shortName ?? input.name },
            abbreviation: input.abbreviation ?? existing?.abbreviation ?? initialism(input.name),
            slug: existing?.slug ?? slugify(input.name),
            logoUrl: input.logoUrl ?? existing?.logoUrl ?? null,
            foundedYear: input.foundedYear ?? existing?.foundedYear ?? null,
            venueId: existing?.venueId ?? null,
            primaryColor: input.primaryColor ?? existing?.primaryColor ?? null,
            secondaryColor: input.secondaryColor ?? existing?.secondaryColor ?? null,
            isNationalTeam: input.isNationalTeam || !!existing?.isNationalTeam,
            type: existing?.type ?? (input.isNationalTeam ? "national" : "club"),
            isActive: true,
            social: existing?.social ?? {},
        };
        await store.teams.put(entity);
        await store.mappings.put({
            entityType: "team",
            canonicalId: id,
            provider,
            providerId: input.providerId,
            confidence: res.created ? 1 : res.confidence,
            verified: !res.needsReview,
            notes: res.created ? "created from provider" : `linked:${res.matchedBy}`,
        });
        return { id, needsReview: res.needsReview };
    }
    /**
     * Match upsert. Score and status are authoritative fields: the primary
     * provider for that competition wins; anything else raises a Critical/High
     * conflict instead of overwriting.
     */
    async upsertMatch(provider, input, refs, primaryProvider) {
        const { store, resolver, conflicts } = this.deps;
        const res = await resolver.resolveMatch(provider, {
            providerMatchId: input.providerId,
            homeProviderId: input.homeProviderId,
            awayProviderId: input.awayProviderId,
            scheduledAt: input.scheduledAt,
            competitionProviderId: input.competitionProviderId,
        }, { homeTeamId: refs.homeTeamId, awayTeamId: refs.awayTeamId, competitionId: refs.competitionId });
        const created = res.created;
        const id = created ? (0, store_1.canonicalId)("match", `${input.providerId}:${input.scheduledAt}`) : res.canonicalId;
        if (created) {
            await store.mappings.put({ entityType: "match", canonicalId: id, provider, providerId: input.providerId, confidence: 1, verified: true, notes: "created from provider" });
        }
        const existing = await store.matches.get(id);
        const storedProvider = (existing?.extension.provider ?? provider);
        const storedAt = existing?.extension.providerUpdatedAt ?? (0, normalize_1.nowIso)();
        let raised = 0;
        let homeScore = input.homeScore;
        let awayScore = input.awayScore;
        if (existing) {
            const scoreConflict = this.compareScore(existing, input, provider, storedProvider, primaryProvider, storedAt, id);
            if (!scoreConflict.accept) {
                homeScore = existing.homeScore;
                awayScore = existing.awayScore;
                raised++;
            }
            const statusConflict = conflicts.evaluate({
                entityType: "match",
                entityId: id,
                field: "status",
                stored: existing.status,
                incoming: input.status,
                storedProvider,
                incomingProvider: provider,
                primaryProvider,
                storedAt,
                incomingAt: (0, normalize_1.nowIso)(),
                valuesAreEqual: (a, b) => a === b,
            });
            if (!statusConflict.accept) {
                input = { ...input, status: existing.status };
                raised++;
            }
            else if (statusConflict.conflict) {
                raised++;
            }
        }
        const status = input.status;
        const winner = status === "finished" && homeScore != null && awayScore != null ? (homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "draw") : existing?.winner ?? null;
        const entity = {
            id,
            sportId: refs.sportId,
            competitionId: refs.competitionId,
            seasonId: refs.seasonId,
            round: input.round ?? existing?.round ?? null,
            homeTeamId: refs.homeTeamId ?? existing?.homeTeamId ?? null,
            awayTeamId: refs.awayTeamId ?? existing?.awayTeamId ?? null,
            venueId: refs.venueId ?? existing?.venueId ?? null,
            scheduledAt: input.scheduledAt,
            status,
            homeScore,
            awayScore,
            periods: input.periods.length ? input.periods : existing?.periods ?? [],
            aggregateScore: existing?.aggregateScore ?? null,
            winner,
            leg: existing?.leg ?? null,
            neutralVenue: existing?.neutralVenue ?? false,
            referee: existing?.referee ?? null,
            attendance: input.attendance ?? existing?.attendance ?? null,
            isFeatured: existing?.isFeatured ?? false,
            extension: {
                ...(existing?.extension ?? {}),
                provider,
                providerUpdatedAt: (0, normalize_1.nowIso)(),
                providerMatchId: input.providerId,
                providerStatus: input.status,
                minute: input.minute,
                venueName: input.venueName,
            },
        };
        await store.matches.put(entity);
        return { id, created, conflicts: raised };
    }
    compareScore(existing, input, provider, storedProvider, primaryProvider, storedAt, matchId) {
        const { conflicts } = this.deps;
        const res = conflicts.evaluate({
            entityType: "match",
            entityId: matchId,
            field: "score",
            stored: `${existing.homeScore}-${existing.awayScore}`,
            incoming: `${input.homeScore}-${input.awayScore}`,
            storedProvider,
            incomingProvider: provider,
            primaryProvider,
            storedAt,
            incomingAt: (0, normalize_1.nowIso)(),
            valuesAreEqual: (a, b) => a === b,
        });
        return { accept: res.accept };
    }
    async upsertStandings(provider, rows, refs, primaryProvider) {
        const { store, conflicts } = this.deps;
        const report = { created: [], updated: [], reviewQueue: [], conflicts: 0 };
        for (const row of rows) {
            const teamId = await refs.resolveTeam(row.teamProviderId);
            if (!teamId)
                continue;
            const id = (0, normalize_1.seededId)(`standing:${refs.seasonId}:${row.group ?? "-"}:${teamId}`);
            const existing = (await store.standings.list()).find((s) => s.id === id);
            const storedProvider = existing?.provider ?? provider;
            const incoming = {
                id,
                competitionId: refs.competitionId,
                seasonId: refs.seasonId,
                group: row.group,
                teamId,
                position: row.position,
                played: row.played,
                won: row.won,
                drawn: row.drawn,
                lost: row.lost,
                goalsFor: row.goalsFor,
                goalsAgainst: row.goalsAgainst,
                goalDifference: row.goalsFor - row.goalsAgainst,
                points: row.points,
                form: row.form,
                status: mapStandingStatus(row.status),
                provider,
                updatedAt: (0, normalize_1.nowIso)(),
            };
            if (existing && existing.points !== incoming.points) {
                const verdict = conflicts.evaluate({
                    entityType: "standing",
                    entityId: id,
                    field: "standings",
                    stored: existing.points,
                    incoming: incoming.points,
                    storedProvider,
                    incomingProvider: provider,
                    primaryProvider,
                    storedAt: existing.updatedAt,
                    incomingAt: (0, normalize_1.nowIso)(),
                    valuesAreEqual: (a, b) => a === b,
                });
                if (!verdict.accept) {
                    report.conflicts++;
                    continue;
                }
                if (verdict.conflict)
                    report.conflicts++;
            }
            await store.standings.put(incoming);
            report.updated.push(id);
        }
        return report;
    }
    async upsertTopScorers(rows, refs) {
        const { store } = this.deps;
        let written = 0;
        for (const row of rows) {
            const playerId = await refs.resolvePlayer(row.playerProviderId);
            if (!playerId)
                continue;
            const entity = {
                id: "",
                competitionId: refs.competitionId,
                seasonId: refs.seasonId,
                playerId,
                teamId: null,
                goals: row.goals,
                appearances: row.appearances ?? 0,
                penalties: row.penalties ?? 0,
                updatedAt: (0, normalize_1.nowIso)(),
            };
            entity.id = (0, normalize_1.seededId)(`scorer:${refs.seasonId}:${playerId}`);
            await store.topScorers.put(entity);
            written++;
        }
        return written;
    }
}
exports.CanonicalMapper = CanonicalMapper;
/* ── helpers ─────────────────────────────────────────────── */
function slugify(input) {
    return input
        .normalize("NFKD")
        .replace(/[^\w\s\u0600-\u06ff-]/g, "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-");
}
function initialism(name) {
    const words = name.split(/\s+/).filter(Boolean);
    const initials = words.map((w) => w[0]).join("");
    const base = initials.length > 1 ? initials : name.replace(/[^A-Za-z\u0600-\u06ff]/g, "");
    return base.slice(0, 3).toUpperCase();
}
function mapCompetitionType(type) {
    if (!type)
        return null;
    const t = type.toLowerCase();
    if (t.includes("cup"))
        return "cup";
    if (t.includes("league"))
        return "league";
    if (t.includes("tournament"))
        return "tournament";
    if (t.includes("friendly"))
        return "friendly";
    return null;
}
function mapStandingStatus(status) {
    if (!status)
        return null;
    const allowed = ["champion", "promotion", "promotion_playoff", "cup_position", "relegation_playoff", "relegation"];
    return allowed.includes(status) ? status : null;
}
