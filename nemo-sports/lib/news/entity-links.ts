import { competitionByPath } from "../competition-catalog";
import { demoContentVisible } from "../site";
import type { NewsEntityRef } from "./types";

/**
 * Return an internal link only when the destination is known to exist.
 *
 * In preview mode, curated demo entities have matching, visibly marked pages.
 * In real RSS content, fuzzy name extraction produces canonical names, not
 * provider IDs; team/player chips therefore remain labels until a verified
 * provider-to-page mapping is available. Real competition links use the
 * canonical catalog, whose routes render honest unavailable states when no
 * provider data is available.
 */
export function newsEntityHref(entity: NewsEntityRef): string | null {
  if (demoContentVisible()) {
    if (entity.type === "team") return `/teams/${entity.internalId}`;
    if (entity.type === "player") return `/players/${entity.internalId}`;
    return `/competitions/${entity.internalId}`;
  }

  if (entity.type !== "competition") return null;
  const competition = competitionByPath(entity.internalId);
  return competition ? `/competitions/${competition.canonicalSlug}` : null;
}
