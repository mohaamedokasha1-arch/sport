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

/**
 * The same opaque id arrives with a SPACE instead of a hyphen as the display
 * name of a side: production served `/matches/team-4wyrn4h9jwyq86p-vs-…` with
 * the title «Team dn1m1gh15xlmoep ضد Team 4wyrn4h9jwyq86p» (HTTP 200, listed in
 * the sitemap). The hyphen-only rule above missed it because the name differs.
 *
 * The id must be lowercase, 8+ characters and contain at least one digit —
 * provider ids look like `dn1m1gh15xlmoep`, while a real club such as
 * «Team Wellbeing» or «Team Galaxy» has no digit in its opaque tail and is kept.
 */
const PLACEHOLDER_DISPLAY_NAME = /^(?:[Tt]eam|[Cc]lub|[Pp]layer|[Hh]ome|[Aa]way)\s+(?=[a-z0-9]*\d)[a-z0-9]{8,}$/;

export function isPlaceholderIdentity(value: string | null | undefined): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return true;
  return PLACEHOLDER_IDENTITY.test(raw) || PLACEHOLDER_DISPLAY_NAME.test(raw);
}

/**
 * Knockout / bracket slots that a provider publishes before the sides are known.
 *
 * Production served `/matches/1st-place-team-vs-2nd-place-team` (title «1st Place
 * Team ضد 2nd Place Team», Pearl T20) and `/matches/r32p28-vs-r32p27` (title
 * «R32P27 ضد R32P28», ATP Shanghai) as indexable, canonical pages and listed
 * them in the sitemap. Neither is a match a reader can use yet, so they are
 * kept out of the index and out of the sitemap.
 *
 * This is deliberately a SEO-only predicate. `fixtureHasIdentity` (used by the
 * live board, the stream lookup and every list) is NOT changed by it, so a
 * bracket fixture that is live or has a published stream keeps behaving exactly
 * as before — only its crawl signals change.
 */
const BRACKET_SLOT_PATTERNS: RegExp[] = [
  /^\d{1,2}(?:st|nd|rd|th) place team$/, // "1st Place Team"
  /^(?:winner|loser|runner up)s? of\b/, // "Winner of Match 12"
  /^(?:tbd|tba|to be (?:announced|determined))$/, // "TBD"
  /^r\d{1,3} ?p\d{1,3}$/, // provider draw slot, e.g. "R32P27"
  /^[wl]\d{1,3}$/, // bracket reference, e.g. "W1", "L2"
];

export function isBracketSlotName(value: string | null | undefined): boolean {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
  if (!normalized) return false;
  return BRACKET_SLOT_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** True when either side of the fixture is an unresolved bracket slot. */
export function isBracketSlotFixture(
  fixture: { homeName?: string | null; awayName?: string | null; homeProviderId?: string | null; awayProviderId?: string | null } | null | undefined,
): boolean {
  if (!fixture) return false;
  return (
    isBracketSlotName(fixture.homeName ?? fixture.homeProviderId) ||
    isBracketSlotName(fixture.awayName ?? fixture.awayProviderId)
  );
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
