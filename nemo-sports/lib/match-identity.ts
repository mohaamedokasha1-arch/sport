/**
 * NEMO Sports · does this fixture describe a match a person could read?
 * ─────────────────────────────────────────────────────────────────────
 * Pure, dependency-free rule shared by the match page, every list, the live
 * board and the sitemap. It lives here rather than in `lib/sdl-gateway.ts` so
 * it can be unit-tested without pulling in the database, cache and admin
 * imports that the gateway needs.
 */

/**
 * A provider identifier standing in for a name it does not have.
 *
 * SportScore emits `team-<opaque id>` for a side whose club name is missing from
 * the payload — production listed `/matches/team-4wyrn4h9jwyq86p-vs-
 * team-dn1m1gh15xlmoep` in the sitemap, i.e. it advertised a page titled
 * «team-4wyrn4h9jwyq86p ضد team-dn1m1gh15xlmoep». That is not a match a reader
 * or a search engine can use, so it is not identity: the page is a 404 and the
 * URL never enters the sitemap.
 *
 * The shape is deliberately narrow (`<kind>-<at least 8 opaque chars>`) so a
 * real club whose name starts with "Team " is not discarded.
 */
const PLACEHOLDER_IDENTITY = /^(?:team|club|player|home|away)-[a-z0-9]{8,}$/i;

export function isPlaceholderIdentity(value: string | null | undefined): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return true;
  return PLACEHOLDER_IDENTITY.test(raw);
}

export type IdentityLike = {
  homeName?: string | null;
  awayName?: string | null;
  homeProviderId?: string | null;
  awayProviderId?: string | null;
  scheduledAt?: string | null;
};

/**
 * Both sides are named and the kick-off is known — the minimum a page needs to
 * be a match rather than a shell. An empty payload, or a list where a single
 * match was expected, fails here and answers 404 instead of rendering a
 * canonical, index, follow page with no content.
 */
export function fixtureHasIdentity(fixture: IdentityLike | null | undefined): boolean {
  if (!fixture) return false;
  const home = fixture.homeName ?? fixture.homeProviderId;
  const away = fixture.awayName ?? fixture.awayProviderId;
  if (!home || !away || !fixture.scheduledAt) return false;
  return !isPlaceholderIdentity(home) && !isPlaceholderIdentity(away);
}
