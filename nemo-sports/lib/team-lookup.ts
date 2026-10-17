/**
 * NEMO Sports · team identity, links and lookup — the ONE rule
 * ─────────────────────────────────────────────────────────────
 * A standings row, a scorer row and a directory card all describe the same
 * club, but the provider gives each of them a different string: SportScore's
 * standings row carries `team` ("Al Ahly FC") *and* `team_slug`
 * ("al-ahly-fc"), its top scorers carry only the slug, and the fixtures feed
 * carries only the display name. Before this module, every surface picked its
 * own favourite: the standings table linked the display name
 * (`/teams/Al%20Ahly%20FC`), the team page resolved ids by scanning only the
 * Football-Data featured leagues, and the two disagreed — so in production
 * every one of the 20 team links on `/competitions/egyptian-league` answered
 * 404 while the same page showed a real, current table.
 *
 * Everything here is pure so the round trip (link built here → resolved there)
 * can be tested without a provider: see scripts/verify-team-links.test.ts.
 */

import { canonicalCompetitions } from "@/lib/competition-catalog";
import { normalizeSearchText } from "@/lib/search-text";

/** The parts of a provider row that can identify a club. */
export type TeamIdentifiable = {
  /** The provider's entity key for the team (canonical resolution uses this). */
  teamProviderId?: string | null;
  /** Display name, when the provider attaches one separately. */
  teamName?: string | null;
  /** The provider's own URL-safe slug — preferred for links when it exists. */
  teamProviderSlug?: string | null;
};

const clean = (value: string | null | undefined): string => String(value ?? "").trim();

/**
 * The identifier a public team URL is built from: the provider's own slug when
 * it publishes one (stable, ASCII, URL-safe), otherwise the provider id.
 * `null` only when the row names no club at all — then no link is rendered
 * rather than a link to a page that cannot exist.
 */
export function teamLinkSlug(row: TeamIdentifiable): string | null {
  return clean(row.teamProviderSlug) || clean(row.teamProviderId) || null;
}

/** Public href for a provider row, or null when the row has no identity. */
export function teamHref(row: TeamIdentifiable): string | null {
  const slug = teamLinkSlug(row);
  return slug ? `/teams/${encodeURIComponent(slug)}` : null;
}

/** Extract the identifier back out of a `/teams/<id>` href. */
export function teamIdFromHref(href: string | null | undefined): string | null {
  const raw = clean(href);
  if (!raw) return null;
  const match = raw.match(/^\/teams\/([^/?#]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]) || null;
  } catch {
    // A malformed percent escape is not a crash condition; treat it literally.
    return match[1] || null;
  }
}

/**
 * Every comparable form of one identifier. `al-ahly-fc`, `Al Ahly FC` and
 * `Al  Ahly  FC` are the same club to a reader, so a link built from any of
 * them must resolve. Spaces and hyphens are interchangeable because the
 * provider uses spaces in names and hyphens in slugs; matching stays exact on
 * the whole string — a prefix or substring match is how «المصري» once matched
 * a club it did not belong to.
 */
export function teamLookupKeys(value: string | null | undefined): string[] {
  const base = normalizeSearchText(clean(value)).replace(/\s+/g, " ").trim();
  if (!base) return [];
  return [...new Set([base, base.replace(/\s+/g, "-"), base.replaceAll("-", " ")])];
}

/** All aliases a row answers to, for the reverse direction (row → keys). */
export function rowLookupKeys(row: TeamIdentifiable): string[] {
  return [...new Set([row.teamProviderSlug, row.teamProviderId, row.teamName].flatMap((value) => teamLookupKeys(value)))];
}

/**
 * Find the row a `/teams/<id>` page is about. Returns the first match in the
 * table's own order (league position), never a fuzzy "closest name".
 */
export function findTeamRow<T extends TeamIdentifiable>(rows: readonly T[], teamId: string): T | null {
  const wanted = teamLookupKeys(teamId);
  if (wanted.length === 0) return null;
  for (const row of rows) {
    const keys = rowLookupKeys(row);
    if (keys.length === 0) continue;
    if (keys.some((key) => wanted.includes(key))) return row;
  }
  return null;
}

/** Minimal result shape consumed by a lookup across provider standings tables. */
export type TeamLookupTable<T extends TeamIdentifiable> = {
  competitionId: string;
  result:
    | { ok: true; data: readonly T[]; source: { provider: string } }
    | { ok: false; error: { code: string; attempts?: readonly unknown[] } };
};

export type TeamTableResolution<T extends TeamIdentifiable> =
  | { kind: "found"; tableIndex: number; competitionId: string; row: T; provider: string }
  | { kind: "not_found" }
  | { kind: "unavailable" };

/**
 * Resolve one linked team from the same standings rows used to build its URL.
 * A provider outage is not evidence that a team does not exist: without this
 * distinction, a transient failure while reading the tables became a cached
 * 404 for a perfectly valid team link. A successful row wins even if a
 * different competition failed; an unavailable result only prevents a false
 * not-found when no matching row could be confirmed.
 */
export function resolveTeamFromTables<T extends TeamIdentifiable>(
  tables: readonly TeamLookupTable<T>[],
  teamId: string,
): TeamTableResolution<T> {
  let unavailable = false;
  for (let tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
    const { competitionId, result } = tables[tableIndex];
    if (!result.ok) {
      // `no_provider_configured` is also wrapped as unavailable by the service,
      // but its empty attempts list is a permanent deployment configuration,
      // not a transient failure worth retrying on every request.
      unavailable ||= result.error.code === "unavailable" && (result.error.attempts?.length ?? 0) > 0;
      continue;
    }
    if (result.source.provider === "demo") continue;
    const row = findTeamRow(result.data, teamId);
    if (row) return { kind: "found", tableIndex, competitionId, row, provider: result.source.provider };
  }
  return unavailable ? { kind: "unavailable" } : { kind: "not_found" };
}

/**
 * Every football competition this deployment covers, in the order the tables
 * should be scanned: featured leagues first (they answer most lookups), then
 * the rest of the catalogue — which is exactly where the Egyptian league sits,
 * and why its clubs used to 404.
 *
 * These are provider competition ids accepted by the SDL's standings chain, so
 * the lookup scans the same tables the pages and the directory already render
 * and cache — no extra provider is introduced and no id is invented.
 */
export function coveredFootballCompetitionIds(): string[] {
  const ordered = [...canonicalCompetitions].sort((a, b) => Number(b.featured) - Number(a.featured));
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const competition of ordered) {
    const id = clean(competition.providerId) || clean(competition.slug) || clean(competition.code);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Does the team appear in any fixture of the window the provider returned?
 *
 * A team page built from a league table alone (country, founding year and venue
 * are not provided by the keyless feed) with no fixture in that window is a thin
 * page: standings numbers and "لا توجد مباريات" notices. The team page uses this
 * to keep such pages out of the index while they carry no match content, and it
 * returns to the index on its own once fixtures for the team arrive. The rule
 * matches the one competition pages apply (app/competitions/[slug]).
 */
export function teamHasFixtureInWindow(
  fixtures: readonly { homeProviderId?: string | null; awayProviderId?: string | null }[],
  teamId: string,
): boolean {
  return fixtures.some((fixture) => fixture.homeProviderId === teamId || fixture.awayProviderId === teamId);
}
