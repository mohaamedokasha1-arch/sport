/**
 * SDL · Canonical entity resolution & deduplication (§3.4)
 *
 * Flow for every incoming provider entity:
 *   1. exact provider-entity mapping  → reuse canonical id
 *   2. strong fingerprint match       → link with high confidence (auto-verify)
 *   3. fuzzy match above threshold    → link with medium confidence (admin review flag)
 *   4. nothing                        → create canonical entity + mapping
 *
 * Canonical ids are never deleted. A wrong link is corrected by moving the
 * mapping, never by removing the entity (Instruction 4).
 */

import type { CanonicalStore } from "./store";
import { compactKey, normalizeName, rankCandidates } from "./normalize";
import type { EntityType, ProviderMapping, UUID } from "./types";
import type { NormalizedTeam, NormalizedPlayer, NormalizedCompetition, ProviderName } from "./provider";

export type Resolution = {
  canonicalId: UUID;
  created: boolean;
  matchedBy: "exact_mapping" | "fingerprint" | "fuzzy" | "created";
  confidence: number;
  needsReview: boolean;
};

export class EntityResolver {
  /** Above this score we trust the match and mark the mapping verified. */
  private autoVerifyAbove: number;
  /** Below this score we never auto-link — create instead. */
  private reviewBelow: number;

  constructor(
    private store: CanonicalStore,
    opts: { autoVerifyAbove?: number; reviewBelow?: number } = {},
  ) {
    this.autoVerifyAbove = opts.autoVerifyAbove ?? 0.9;
    this.reviewBelow = opts.reviewBelow ?? 0.82;
  }

  async resolveTeam(provider: ProviderName, input: NormalizedTeam): Promise<Resolution> {
    return this.resolve("team", provider, input.providerId, input.name, async () => {
      const pool = (await this.store.teams.list()).map((t) => ({
        id: t.id,
        name: [t.name.en, t.name.ar, t.shortName.en, t.shortName.ar, t.abbreviation].filter(Boolean),
      }));
      return rankCandidates(input.name, pool, this.reviewBelow);
    });
  }

  async resolvePlayer(provider: ProviderName, input: NormalizedPlayer): Promise<Resolution> {
    return this.resolve("player", provider, input.providerId, input.fullName, async () => {
      const pool = (await this.store.players.list()).map((p) => ({
        id: p.id,
        name: [p.fullName.en, p.fullName.ar].filter(Boolean),
      }));
      return rankCandidates(input.fullName, pool, this.reviewBelow);
    });
  }

  async resolveCompetition(provider: ProviderName, input: NormalizedCompetition): Promise<Resolution> {
    return this.resolve("competition", provider, input.providerId, input.name, async () => {
      const pool = (await this.store.competitions.list()).map((c) => ({
        id: c.id,
        name: [c.name.en, c.name.ar, c.shortName.en, c.shortName.ar].filter(Boolean),
      }));
      return rankCandidates(input.name, pool, this.reviewBelow);
    });
  }

  /**
   * Matches are deduped by a windowed fingerprint (teams + kickoff ± tolerance),
   * because providers do not share ids and kickoff can shift by a few minutes.
   */
  async resolveMatch(
    provider: ProviderName,
    input: {
      providerMatchId: string;
      homeProviderId: string | null;
      awayProviderId: string | null;
      scheduledAt: string;
      competitionProviderId: string;
    },
    canonicalRefs: { homeTeamId: UUID | null; awayTeamId: UUID | null; competitionId: UUID },
  ): Promise<Resolution> {
    const providerId = input.providerMatchId;
    const existing = await this.store.mappings.find("match", provider, providerId);
    if (existing) {
      return { canonicalId: existing.canonicalId, created: false, matchedBy: "exact_mapping", confidence: existing.confidence, needsReview: false };
    }

    // providers never share ids → dedupe on competition + kickoff window + teams
    const kickoff = +new Date(input.scheduledAt);
    const toleranceMs = 45 * 60_000;
    const candidates = (await this.store.matches.list()).filter((m) => {
      if (m.competitionId !== canonicalRefs.competitionId) return false;
      if (Math.abs(+new Date(m.scheduledAt) - kickoff) > toleranceMs) return false;
      const sameHome = canonicalRefs.homeTeamId ? m.homeTeamId === canonicalRefs.homeTeamId : false;
      const sameAway = canonicalRefs.awayTeamId ? m.awayTeamId === canonicalRefs.awayTeamId : false;
      return sameHome && sameAway;
    });

    if (candidates.length) {
      const id = candidates[0].id;
      await this.store.mappings.put({ entityType: "match", canonicalId: id, provider, providerId, confidence: 0.99, verified: true, notes: "kickoff-window match" });
      return { canonicalId: id, created: false, matchedBy: "fingerprint", confidence: 0.99, needsReview: false };
    }

    return { canonicalId: "", created: true, matchedBy: "created", confidence: 0, needsReview: false };
  }

  private async resolve(
    entityType: EntityType,
    provider: ProviderName,
    providerId: string,
    name: string,
    findCandidates: () => Promise<{ id: string; name: string; score: number }[]>,
  ): Promise<Resolution> {
    const mapped = await this.store.mappings.find(entityType, provider, providerId);
    if (mapped) {
      return { canonicalId: mapped.canonicalId, created: false, matchedBy: "exact_mapping", confidence: mapped.confidence, needsReview: !mapped.verified };
    }

    const candidates = await findCandidates();
    const best = candidates[0];

    if (best && best.score >= this.autoVerifyAbove) {
      await this.store.mappings.put({ entityType, canonicalId: best.id, provider, providerId, confidence: best.score, verified: true, notes: `auto:${compactKey(name)}` });
      return { canonicalId: best.id, created: false, matchedBy: "fingerprint", confidence: best.score, needsReview: false };
    }

    if (best && best.score >= this.reviewBelow) {
      await this.store.mappings.put({ entityType, canonicalId: best.id, provider, providerId, confidence: best.score, verified: false, notes: `fuzzy:${normalizeName(name)}` });
      return { canonicalId: best.id, created: false, matchedBy: "fuzzy", confidence: best.score, needsReview: true };
    }

    return { canonicalId: "", created: true, matchedBy: "created", confidence: 0, needsReview: false };
  }

  /** Admin action: point a provider id at the right canonical entity. */
  async relink(entityType: EntityType, provider: ProviderName, providerId: string, canonicalId: UUID, note: string): Promise<ProviderMapping> {
    return this.store.mappings.put({ entityType, canonicalId, provider, providerId, confidence: 1, verified: true, notes: `admin:${note}` });
  }

  async unlink(entityType: EntityType, provider: ProviderName, providerId: string): Promise<boolean> {
    const row = await this.store.mappings.find(entityType, provider, providerId);
    if (!row) return false;
    await this.store.mappings.verify(row.id, false);
    return true;
  }
}
