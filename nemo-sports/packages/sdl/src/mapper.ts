/**
 * SDL · Canonical mapping — provider payloads → canonical entities (§3.4)
 *
 * This is the only place where a provider id becomes a NEMO UUID. It also
 * applies conflict rules before overwriting any authoritative field, so a
 * secondary provider can never silently rewrite a primary provider's score.
 */

import type { SportsDataProvider } from "./provider";
import type { NormalizedCompetition, NormalizedFixture, NormalizedStandingRow, NormalizedTeam, NormalizedTopScorer, ProviderName } from "./provider";
import { canonicalId, type CanonicalStore } from "./store";
import { EntityResolver } from "./entity-resolver";
import { nowIso, seededId } from "./normalize";
import type { ConflictDetector } from "./conflict";
import type { Competition, LocalizedText, Match, MatchStatus, Standing, Team, TopScorer, UUID } from "./types";

export type MapperDeps = {
  store: CanonicalStore;
  resolver: EntityResolver;
  conflicts: ConflictDetector;
  /** provider that owns a given data type right now — wins score/status conflicts */
  primaryProviderFor: (competition: string | null, dataType: "fixtures" | "standings") => ProviderName | null;
  /** optional bilingual name dictionary maintained by editors */
  nameDictionary?: (kind: "team" | "competition", providerName: string) => LocalizedText | null;
};

export type UpsertReport = {
  created: string[];
  updated: string[];
  reviewQueue: string[];
  conflicts: number;
};

export class CanonicalMapper {
  constructor(private deps: MapperDeps) {}

  async upsertCompetition(provider: ProviderName, input: NormalizedCompetition, sportId: UUID): Promise<UUID> {
    const { store, resolver } = this.deps;
    const res = await resolver.resolveCompetition(provider, input);
    const id = res.created ? canonicalId("competition", `${input.name}-${input.countryName ?? ""}`) : res.canonicalId;
    const existing = await store.competitions.get(id);
    const dictionary = this.deps.nameDictionary?.("competition", input.name);
    const name: LocalizedText = dictionary ?? { en: input.name, ar: existing?.name.ar || input.name };

    // slugs are public URLs: derive from the full name, never from an abbreviation
    const slug = existing?.slug ?? slugify(input.name);
    const entity: Competition = {
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

  async upsertTeam(provider: ProviderName, input: NormalizedTeam, sportId: UUID): Promise<{ id: UUID; needsReview: boolean }> {
    const { store, resolver } = this.deps;
    const res = await resolver.resolveTeam(provider, input);
    const id = res.created ? canonicalId("team", input.name) : res.canonicalId;
    const existing = await store.teams.get(id);
    const dictionary = this.deps.nameDictionary?.("team", input.name);

    const entity: Team = {
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
  async upsertMatch(
    provider: ProviderName,
    input: NormalizedFixture,
    refs: { sportId: UUID; competitionId: UUID; seasonId: UUID | null; homeTeamId: UUID | null; awayTeamId: UUID | null; venueId?: UUID | null },
    primaryProvider: ProviderName | null,
  ): Promise<{ id: UUID; created: boolean; conflicts: number }> {
    const { store, resolver, conflicts } = this.deps;
    const res = await resolver.resolveMatch(
      provider,
      {
        providerMatchId: input.providerId,
        homeProviderId: input.homeProviderId,
        awayProviderId: input.awayProviderId,
        scheduledAt: input.scheduledAt,
        competitionProviderId: input.competitionProviderId,
      },
      { homeTeamId: refs.homeTeamId, awayTeamId: refs.awayTeamId, competitionId: refs.competitionId },
    );

    const created = res.created;
    const id = created ? canonicalId("match", `${input.providerId}:${input.scheduledAt}`) : res.canonicalId;
    if (created) {
      await store.mappings.put({ entityType: "match", canonicalId: id, provider, providerId: input.providerId, confidence: 1, verified: true, notes: "created from provider" });
    }

    const existing = await store.matches.get(id);
    const storedProvider = ((existing?.extension.provider as ProviderName | undefined) ?? provider) as ProviderName;
    const storedAt = (existing?.extension.providerUpdatedAt as string | undefined) ?? nowIso();
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
        incomingAt: nowIso(),
        valuesAreEqual: (a, b) => a === b,
      });
      if (!statusConflict.accept) {
        input = { ...input, status: existing.status };
        raised++;
      } else if (statusConflict.conflict) {
        raised++;
      }
    }

    const status = input.status as MatchStatus;
    const winner = status === "finished" && homeScore != null && awayScore != null ? (homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "draw") : existing?.winner ?? null;

    const entity: Match = {
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
        providerUpdatedAt: nowIso(),
        providerMatchId: input.providerId,
        providerStatus: input.status,
        minute: input.minute,
        venueName: input.venueName,
      },
    };
    await store.matches.put(entity);
    return { id, created, conflicts: raised };
  }

  private compareScore(
    existing: Match,
    input: NormalizedFixture,
    provider: ProviderName,
    storedProvider: ProviderName,
    primaryProvider: ProviderName | null,
    storedAt: string,
    matchId: string,
  ): { accept: boolean } {
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
      incomingAt: nowIso(),
      valuesAreEqual: (a, b) => a === b,
    });
    return { accept: res.accept };
  }

  async upsertStandings(provider: ProviderName, rows: NormalizedStandingRow[], refs: { competitionId: UUID; seasonId: UUID; resolveTeam: (providerTeamId: string) => Promise<UUID | null> }, primaryProvider: ProviderName | null): Promise<UpsertReport> {
    const { store, conflicts } = this.deps;
    const report: UpsertReport = { created: [], updated: [], reviewQueue: [], conflicts: 0 };

    for (const row of rows) {
      const teamId = await refs.resolveTeam(row.teamProviderId);
      if (!teamId) continue;
      const id = seededId(`standing:${refs.seasonId}:${row.group ?? "-"}:${teamId}`);
      const existing = (await store.standings.list()).find((s) => s.id === id);
      const storedProvider = existing?.provider ?? provider;

      const incoming: Standing = {
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
        updatedAt: nowIso(),
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
          incomingAt: nowIso(),
          valuesAreEqual: (a, b) => a === b,
        });
        if (!verdict.accept) {
          report.conflicts++;
          continue;
        }
        if (verdict.conflict) report.conflicts++;
      }

      await store.standings.put(incoming);
      report.updated.push(id);
    }
    return report;
  }

  async upsertTopScorers(rows: NormalizedTopScorer[], refs: { competitionId: UUID; seasonId: UUID; resolvePlayer: (providerPlayerId: string) => Promise<UUID | null> }): Promise<number> {
    const { store } = this.deps;
    let written = 0;
    for (const row of rows) {
      const playerId = await refs.resolvePlayer(row.playerProviderId);
      if (!playerId) continue;
      const entity: TopScorer = {
        id: "",
        competitionId: refs.competitionId,
        seasonId: refs.seasonId,
        playerId,
        teamId: null,
        goals: row.goals,
        appearances: row.appearances ?? 0,
        penalties: row.penalties ?? 0,
        updatedAt: nowIso(),
      };
      entity.id = seededId(`scorer:${refs.seasonId}:${playerId}`);
      await store.topScorers.put(entity);
      written++;
    }
    return written;
  }
}

/* ── helpers ─────────────────────────────────────────────── */

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[^\w\s\u0600-\u06ff-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function initialism(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const initials = words.map((w) => w[0]).join("");
  const base = initials.length > 1 ? initials : name.replace(/[^A-Za-z\u0600-\u06ff]/g, "");
  return base.slice(0, 3).toUpperCase();
}

function mapCompetitionType(type: string | null): Competition["type"] | null {
  if (!type) return null;
  const t = type.toLowerCase();
  if (t.includes("cup")) return "cup";
  if (t.includes("league")) return "league";
  if (t.includes("tournament")) return "tournament";
  if (t.includes("friendly")) return "friendly";
  return null;
}

function mapStandingStatus(status: string | null): Standing["status"] {
  if (!status) return null;
  const allowed: Standing["status"][] = ["champion", "promotion", "promotion_playoff", "cup_position", "relegation_playoff", "relegation"];
  return allowed.includes(status as Standing["status"]) ? (status as Standing["status"]) : null;
}

export type { SportsDataProvider };
