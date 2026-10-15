/**
 * NEMO Sports · cross-source fixture identity & merge (pure)
 * ─────────────────────────────────────────────────────────
 * The same real-world match can arrive from two doors of the platform:
 *
 *   · the PROVIDER chain (SportScore / Football-Data.org via the SDL) — live
 *     status, scores, minute, events, official permalink id;
 *   · the EDITORIAL layer (lib/admin-matches.ts) — the desk's bilingual names,
 *     venue, round, TV channels, verified crests.
 *
 * Before this module the public merge (lib/sdl-gateway.ts `corrected()`) kept
 * both records whenever their slugs differed, so one Egyptian league match
 * could appear twice on the same list — once as «الأهلي ضد الإسماعيلي» and
 * once as «Al Ahly vs Ismaily SC» — with the editorial copy stuck at
 * «قادمة» forever and the provider copy missing the desk's channels/venue.
 *
 * The rule set here is deliberately conservative and shared by every surface:
 *
 *   · TWO fixtures are THE SAME meeting only when the sport matches, BOTH
 *     sides pair (either orientation) across languages — Latin ↔ Arabic via
 *     the curated pairs of lib/name-aliases.ts and the latin `home-vs-away`
 *     slug each record carries — and the kickoffs sit within the tolerance
 *     lib/match-resolution.ts already uses (120 min). A shared club name alone
 *     never merges two different matches.
 *   · when both name a competition and the canonical catalogue resolves them
 *     to DIFFERENT competitions, they are different matches — never merged.
 *   · the BASE record of a merge keeps identity and live state: its official
 *     match id, kickoff instant, status and score (an operator correction on
 *     top is lib/match-overrides.ts, applied later by the gateway). The EXTRA
 *     record only FILLS GAPS — absence in one source is never a deletion —
 *     and supplies the curated bilingual display pair when the base carries
 *     none (editorial «الأهلي» + "Al Ahly" beats a bare "Al Ahly SC" label).
 *   · a bare «scheduled» never overrules an interruption the desk recorded
 *     (postponed/cancelled/…) nor anything the feed reports; the fresher,
 *     more specific state wins.
 *
 * No I/O, no env: unit-testable in isolation (scripts/verify-fixture-merge.test.ts).
 */

import type { NormalizedFixture } from "@/packages/sdl/src";
import { parseSlugRequest, sideAliases, DEFAULT_KICKOFF_TOLERANCE_MIN } from "@/lib/match-resolution";
import { competitionByPath } from "@/lib/competition-catalog";

/* ── identity ─────────────────────────────────────────────────────────── */

type Side = "home" | "away";

const isPresent = (v: string | null | undefined): v is string => typeof v === "string" && v.trim() !== "";

/** A provider payload may use this literal when it does not know the league. */
const UNKNOWN_COMPETITION = "unknown";

/**
 * Every comparable spelling of one side of a fixture: the display names in
 * both scripts, the team provider id, and that side of the match's own
 * `home-vs-away` slug (the bridge that lets «الأهلي» meet "Al Ahly SC" even
 * for clubs the Arabic alias dictionary does not carry).
 */
function sideAliasSet(fixture: NormalizedFixture, side: Side): Set<string> {
  const name = side === "home" ? fixture.homeName : fixture.awayName;
  const nameEn = side === "home" ? fixture.homeNameEn : fixture.awayNameEn;
  const teamId = side === "home" ? fixture.homeProviderId : fixture.awayProviderId;
  const set = new Set<string>();
  for (const value of [name, nameEn, teamId]) {
    for (const alias of sideAliases(value)) set.add(alias);
  }
  const slug = parseSlugRequest(fixture.providerId);
  if (slug) {
    for (const alias of sideAliases(side === "home" ? slug.first : slug.second)) set.add(alias);
  }
  return set;
}

function sidesPair(a: NormalizedFixture, b: NormalizedFixture, sideA: Side, sideB: Side): boolean {
  const x = sideAliasSet(a, sideA);
  const y = sideAliasSet(b, sideB);
  if (x.size === 0 || y.size === 0) return false;
  for (const alias of x) if (y.has(alias)) return true;
  return false;
}

/**
 * Both fixtures name a competition the canonical catalogue knows — and they
 * are DIFFERENT competitions. Ids and spellings differ per provider, so only
 * two catalogue-resolved, unequal competitions count as a clash; unknown
 * names are never used to block a merge (they also never force one).
 */
function competitionsClash(a: NormalizedFixture, b: NormalizedFixture): boolean {
  const refA = competitionByPath(a.competitionProviderId || a.competitionName || "");
  const refB = competitionByPath(b.competitionProviderId || b.competitionName || "");
  return Boolean(refA && refB && refA.canonicalSlug !== refB.canonicalSlug);
}

export interface SameMeetingOptions {
  /** Kickoff drift tolerated between two sources (minutes). Default 120. */
  toleranceMinutes?: number;
}

/**
 * Do two normalized fixtures describe THE SAME real-world meeting?
 * Same rules as lib/match-resolution.ts `verifySameMatch` (both sides pair,
 * kickoff within tolerance) plus the cross-script alias/slug bridge and the
 * competition-clash guard this merge needs. Never merges on a shared club.
 */
export function isSameMeeting(a: NormalizedFixture, b: NormalizedFixture, opts: SameMeetingOptions = {}): boolean {
  if (!a || !b) return false;
  const sportA = (a.sport ?? "football").toLowerCase();
  const sportB = (b.sport ?? "football").toLowerCase();
  if (sportA !== sportB) return false;

  const direct = sidesPair(a, b, "home", "home") && sidesPair(a, b, "away", "away");
  const swapped = sidesPair(a, b, "home", "away") && sidesPair(a, b, "away", "home");
  if (!direct && !swapped) return false;

  const kickA = Date.parse(a.scheduledAt);
  const kickB = Date.parse(b.scheduledAt);
  if (!Number.isFinite(kickA) || !Number.isFinite(kickB)) return false;
  const tolerance = (opts.toleranceMinutes ?? DEFAULT_KICKOFF_TOLERANCE_MIN) * 60_000;
  if (Math.abs(kickA - kickB) > tolerance) return false;

  return !competitionsClash(a, b);
}

/* ── merge ────────────────────────────────────────────────────────────── */

/**
 * Which status survives a merge. The provider feed is the live truth for
 * everything it actually reports (in play, finished, postponed, …); a bare
 * «scheduled» placeholder never overrules an interruption the desk recorded.
 */
export function resolveMergedStatus(providerStatus: string, editorialStatus: string): string {
  const INTERRUPTED = new Set(["postponed", "cancelled", "canceled", "suspended", "abandoned"]);
  if (INTERRUPTED.has(editorialStatus) && providerStatus === "scheduled") return editorialStatus;
  return providerStatus;
}

/** A record carries the curated bilingual display pair (name + Latin name). */
function hasBilingualPair(fixture: NormalizedFixture, side: Side): boolean {
  return isPresent(side === "home" ? fixture.homeName : fixture.awayName) && isPresent(side === "home" ? fixture.homeNameEn : fixture.awayNameEn);
}

/**
 * Merge one meeting across sources. `base` keeps identity and live state;
 * `extra` fills gaps and — when it carries a bilingual display pair the base
 * lacks — supplies the display names (editorial «الأهلي»/"Al Ahly" over a bare
 * "Al Ahly SC"). Kickoff is the base's: a schedule change updates the merged
 * record instead of forking a duplicate.
 */
export function mergeFixturePair(base: NormalizedFixture, extra: NormalizedFixture): NormalizedFixture {
  const useExtraNames = !hasBilingualPair(base, "home") && hasBilingualPair(extra, "home");

  const homeName = (useExtraNames ? extra.homeName : undefined) ?? base.homeName ?? extra.homeName ?? null;
  const awayName = (useExtraNames ? extra.awayName : undefined) ?? base.awayName ?? extra.awayName ?? null;
  const homeNameEn = (useExtraNames ? extra.homeNameEn : undefined) ?? base.homeNameEn ?? extra.homeNameEn ?? null;
  const awayNameEn = (useExtraNames ? extra.awayNameEn : undefined) ?? base.awayNameEn ?? extra.awayNameEn ?? null;

  const useExtraCompetition = !isPresent(base.competitionNameEn) && isPresent(extra.competitionNameEn);

  return {
    ...base,
    // ── identity + live state: the base's, unconditionally ──
    providerId: base.providerId,
    scheduledAt: base.scheduledAt,
    originalScheduledAt: base.originalScheduledAt ?? extra.originalScheduledAt,
    status: resolveMergedStatus(base.status, extra.status),
    homeScore: base.homeScore ?? extra.homeScore ?? null,
    awayScore: base.awayScore ?? extra.awayScore ?? null,
    minute: base.minute ?? extra.minute ?? null,
    periods: base.periods?.length ? base.periods : extra.periods ?? [],
    sourceUrl: base.sourceUrl ?? extra.sourceUrl ?? null,
    homeProviderId: base.homeProviderId ?? extra.homeProviderId ?? null,
    awayProviderId: base.awayProviderId ?? extra.awayProviderId ?? null,
    // ── competition id: the base's, unless missing/unknown ──
    competitionProviderId:
      isPresent(base.competitionProviderId) && base.competitionProviderId !== UNKNOWN_COMPETITION
        ? base.competitionProviderId
        : extra.competitionProviderId || base.competitionProviderId,
    // ── display pair ──
    homeName,
    awayName,
    homeNameEn,
    awayNameEn,
    competitionName: (useExtraCompetition ? extra.competitionName : undefined) ?? base.competitionName ?? extra.competitionName ?? null,
    competitionNameEn: (useExtraCompetition ? extra.competitionNameEn : undefined) ?? base.competitionNameEn ?? extra.competitionNameEn ?? null,
    // ── gap-fill display metadata (never a deletion) ──
    seasonProviderId: isPresent(base.seasonProviderId) ? base.seasonProviderId : extra.seasonProviderId ?? null,
    round: isPresent(base.round) ? base.round : extra.round ?? null,
    venueName: isPresent(base.venueName) ? base.venueName : extra.venueName ?? null,
    venueProviderId: isPresent(base.venueProviderId) ? base.venueProviderId : extra.venueProviderId ?? null,
    attendance: base.attendance ?? extra.attendance ?? null,
    homeLogoUrl: isPresent(base.homeLogoUrl) ? base.homeLogoUrl : extra.homeLogoUrl ?? null,
    awayLogoUrl: isPresent(base.awayLogoUrl) ? base.awayLogoUrl : extra.awayLogoUrl ?? null,
    channels: base.channels?.length ? base.channels : extra.channels?.length ? extra.channels : null,
    editorialUpdatedAt: extra.editorialUpdatedAt ?? base.editorialUpdatedAt,
  };
}

/**
 * Absorb only the live state of a provider twin into a record that keeps its
 * own identity (the editorial match page: its URL slug must not change).
 * Display metadata is untouched; status/score/minute follow the feed, with
 * the same «scheduled never overrules an interruption» rule.
 */
export function absorbLiveState(target: NormalizedFixture, live: NormalizedFixture): NormalizedFixture {
  return {
    ...target,
    status: resolveMergedStatus(live.status, target.status),
    homeScore: live.homeScore ?? target.homeScore,
    awayScore: live.awayScore ?? target.awayScore,
    minute: live.minute ?? target.minute,
    periods: target.periods?.length ? target.periods : live.periods ?? [],
  };
}

/**
 * Combine two lists of fixtures into one row per real meeting.
 *
 * `primary` is the backbone list (the provider chain's own order — its record
 * keeps the official match id). Every `secondary` record either merges into
 * its twin (gap-fill + curated names) or is appended; same-meeting duplicates
 * INSIDE either list fold into their first occurrence. The first record of a
 * pair is always the base — "keep the most reliable record, fill the gaps".
 */
export function combineFixtureLists(primary: NormalizedFixture[], secondary: NormalizedFixture[]): NormalizedFixture[] {
  const out: NormalizedFixture[] = [];

  const fold = (list: NormalizedFixture[]) => {
    for (const fixture of list) {
      const twin = out.find((kept) => isSameMeeting(kept, fixture));
      if (!twin) {
        out.push(fixture);
        continue;
      }
      out[out.indexOf(twin)] = mergeFixturePair(twin, fixture);
    }
  };

  fold(primary);
  fold(secondary);
  return out;
}
