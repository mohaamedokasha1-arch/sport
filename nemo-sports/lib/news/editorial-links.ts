/**
 * NEMO Sports · editorial internal links (hub & spoke)
 * ─────────────────────────────────────────────────────────────────────
 * The master SEO plan asks every article to carry strategic internal links:
 * the competition it belongs to, the club it is about, the fixtures and the
 * news hub. The data was already being captured — `/admin/news/manual` stores
 * `relatedCompetition` and `relatedTeam` — but nothing rendered it, so every
 * editorial article was a leaf page with no way in or out for a crawler.
 *
 * The rule this module enforces is the one the rest of the site already
 * follows (lib/news/entity-links.ts): **a link is emitted only when the
 * destination is known to exist.** A free-text team name that resolves to no
 * page renders as a label, never as a 404 that would waste crawl budget and
 * hand the reader a dead end.
 *
 *   · competition — resolved against the canonical catalogue, which accepts
 *     the Arabic name, the English name, the provider slug and the code
 *     (lib/competition-catalog.ts). The route renders an honest "unavailable"
 *     state when a provider is down, so it is always a safe destination.
 *   · team — resolved against: an admin-published team (by slug or name), the
 *     curated demo catalogue, or the provider tables the `/teams/<id>` page
 *     itself reads (ASCII slugs only — an Arabic label is never guessed into a
 *     provider id). Anything else stays a label.
 *
 * Run: npm run discover:test
 */

import { canonicalCompetitions, competitionByPath } from "@/lib/competition-catalog";
import { normalizeSearchText } from "@/lib/search-text";
import { listAdminTeams } from "@/lib/admin-teams";
import { demoContentVisible } from "@/lib/site";
import { teams as demoTeams } from "@/lib/core-data";
import { coveredFootballCompetitionIds, findTeamRow } from "@/lib/team-lookup";
import { footballStandings } from "@/lib/football-data";
import type { ManualNews } from "@/lib/manual-news";

export type EditorialLink = {
  href: string;
  label: string;
  kind: "competition" | "team" | "hub";
};

/**
 * Links that are valid by construction: they are static routes that always
 * render (real data, or an honest "unavailable" notice). They guarantee that
 * even an article whose entities do not resolve is not a dead end.
 */
export const EDITORIAL_HUB_LINKS: readonly EditorialLink[] = [
  { href: "/matches", label: "مباريات اليوم", kind: "hub" },
  { href: "/results", label: "نتائج المباريات", kind: "hub" },
  { href: "/competitions", label: "البطولات والجداول", kind: "hub" },
  { href: "/news", label: "آخر الأخبار", kind: "hub" },
];

/** Resolve an operator-typed competition name / slug / code to its public hub. */
export function competitionLink(value: string | null | undefined): EditorialLink | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const exact = competitionByPath(raw);
  if (exact) {
    return { href: `/competitions/${encodeURIComponent(exact.canonicalSlug)}`, label: exact.nameAr, kind: "competition" };
  }

  // «الدوري المصري» must reach the Egyptian Premier League page even though the
  // catalogue spells it «الدوري المصري الممتاز» — accept a contained match, but
  // only while it names exactly ONE competition (an ambiguous label links
  // nowhere rather than to the wrong league).
  const needle = normalizeSearchText(raw);
  if (needle.length < 4) return null;
  const hits = canonicalCompetitions.filter((competition) =>
    [competition.name, competition.nameAr, competition.canonicalSlug, competition.slug, competition.code]
      .filter(Boolean)
      .some((alias) => normalizeSearchText(String(alias)).includes(needle)),
  );
  if (hits.length !== 1) return null;
  const hit = hits[0]!;
  return { href: `/competitions/${encodeURIComponent(hit.canonicalSlug)}`, label: hit.nameAr, kind: "competition" };
}

/** ASCII, hyphenated — the shape a provider slug (never an Arabic label) has. */
const PROVIDER_SLUG_RE = /^[a-z0-9][a-z0-9 ._-]{1,59}$/i;

/**
 * Resolve an operator-typed team name / slug to a real `/teams/<id>` page.
 * Returns null — never a guessed URL — when nothing matches.
 */
export async function teamLink(value: string | null | undefined): Promise<EditorialLink | null> {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const needle = normalizeSearchText(raw);

  try {
    const admin = await listAdminTeams({ publishedOnly: true, limit: 500 });
    const hit =
      admin.find((t) => t.slug === raw) ??
      admin.find((t) => [t.nameAr, t.nameEn, t.shortName].some((name) => name && normalizeSearchText(name) === needle));
    if (hit) return { href: `/teams/${encodeURIComponent(hit.slug)}`, label: hit.nameAr, kind: "team" };
  } catch {
    // An unreachable store means "no verified page" — the label stays a label.
  }

  if (demoContentVisible()) {
    const hit = demoTeams.find(
      (t) => t.slug === raw || normalizeSearchText(t.name) === needle || normalizeSearchText(t.nameEn) === needle,
    );
    if (hit) return { href: `/teams/${encodeURIComponent(hit.slug)}`, label: hit.name, kind: "team" };
  }

  // A provider id/slug typed by the editor: confirm it against the same tables
  // the team page reads before linking to it.
  if (PROVIDER_SLUG_RE.test(raw)) {
    try {
      const ids = coveredFootballCompetitionIds();
      for (const id of ids) {
        const res = await footballStandings(id);
        if (!res.ok || res.source.provider === "demo") continue;
        const row = findTeamRow(res.data, raw);
        if (!row) continue;
        const slug = row.teamProviderSlug || row.teamProviderId;
        if (!slug) continue;
        return { href: `/teams/${encodeURIComponent(slug)}`, label: row.teamName || raw, kind: "team" };
      }
    } catch {
      // Provider outage → no link. Never a best-effort guess.
    }
  }

  return null;
}

/**
 * Every internal link an editorial article should carry: the resolved entities
 * first, then the hubs that are always valid. Deduplicated by href.
 */
export async function editorialInternalLinks(article: {
  relatedCompetition?: string;
  relatedTeam?: string;
}): Promise<EditorialLink[]> {
  const [competition, team] = await Promise.all([
    Promise.resolve(competitionLink(article.relatedCompetition)),
    teamLink(article.relatedTeam),
  ]);
  const links: EditorialLink[] = [];
  const seen = new Set<string>();
  for (const link of [...(competition ? [competition] : []), ...(team ? [team] : []), ...EDITORIAL_HUB_LINKS]) {
    if (seen.has(link.href)) continue;
    seen.add(link.href);
    links.push(link);
  }
  return links;
}

/**
 * "اقرأ أيضًا": published articles from the same category first, then the most
 * recent of the rest — never the article itself, never more than `limit`.
 */
export function relatedEditorialNews(current: ManualNews, all: readonly ManualNews[], limit = 5): ManualNews[] {
  const others = all.filter((n) => n.status === "published" && n.slug !== current.slug);
  const sameSection = others.filter((n) => n.category === current.category);
  const rest = others.filter((n) => n.category !== current.category);
  return [...sameSection, ...rest].slice(0, Math.max(0, limit));
}
