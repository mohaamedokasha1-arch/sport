import { articles as demoArticles, allMatches as demoMatches } from "@/lib/data";
import { competitions as demoCompetitions, players as demoPlayers, teams as demoTeams } from "@/lib/core-data";
import { canonicalCompetitions } from "@/lib/competition-catalog";
import { footballDataCompetitions, footballTopScorers } from "@/lib/football-data";
import { fixtures, liveMatches, teamsDirectory, hasMatchIdentity, supportsPlayerStats } from "@/lib/sdl-gateway";
import { listArticles } from "@/lib/news/store";
import { getRedisKv } from "@/lib/cache/redis";
import { demoContentVisible, hasProviderKeys } from "@/lib/site";
import { matchesSearchText, searchMatchWeight } from "@/lib/search-text";
import { arabicAliasesFor } from "@/lib/name-aliases";
import { categoryMeta } from "@/lib/news/categorize";
import { teamBySlug } from "@/lib/core-data";
import { sportBySlug } from "@/lib/core-data";
import type { NormalizedFixture, NormalizedTopScorer } from "@/packages/sdl/src";

export type SearchHit = {
  id: string;
  type: "فريق" | "لاعب" | "بطولة" | "مباراة" | "خبر";
  title: string;
  sub: string;
  url: string;
  weight: number;
  external?: boolean;
  /**
   * Extra text that should MATCH a query but is never rendered.
   *
   * A news headline is usually English ("Al Ahly crushes Petrol Asyut"), so the
   * Arabic spelling an Egyptian visitor actually types («الأهلي») matched
   * nothing: `arabicAliasesFor()` only fires when a field normalizes to exactly
   * a club's full English name, which a headline never does. These are the
   * article's own entity labels — already stored and already shown on the news
   * card — plus the Arabic category name. Searched, never displayed.
   */
  aliases?: string[];
};

export type SearchResponse = {
  query: string;
  /** True when the index may include the local development sample catalogue. */
  preview: boolean;
  total: number;
  counts: Record<SearchHit["type"], number>;
  results: Omit<SearchHit, "weight" | "aliases">[];
};

type SearchIndex = { hits: SearchHit[]; createdAt: number };
// Search data changes far more slowly than live scores. Keep the combined
// index warm to avoid rebuilding the provider-backed directory on each search
// burst; match-status freshness is handled by the live and match endpoints.
const INDEX_TTL_MS = 5 * 60_000;
const INDEX_TTL_SECONDS = Math.ceil(INDEX_TTL_MS / 1000);
// v3: hits carry a non-rendered `aliases` list. Bumping the prefix means a
// pre-deploy shared copy (without them) is rebuilt instead of silently serving
// the old, weaker Arabic matching for the rest of its TTL.
const SHARED_INDEX_PREFIX = "nemo:search:index:v3:";
let cachedIndex: SearchIndex | null = null;
let indexInFlight: Promise<SearchIndex> | null = null;

const hitKey = (hit: SearchHit) => `${hit.type}:${hit.id}`;

/** Everything a query may match against, in the order the weight prefers. */
function searchTerms(hit: SearchHit): (string | null | undefined)[] {
  return [hit.title, ...(hit.aliases ?? []), hit.sub, hit.id, ...arabicAliasesFor(hit.title)];
}

function sharedIndexKey(): string {
  const scope = demoContentVisible() ? "preview" : hasProviderKeys() ? "provider" : "unavailable";
  return `${SHARED_INDEX_PREFIX}${scope}`;
}

function localDemoHits(): SearchHit[] {
  if (!demoContentVisible()) return [];
  const hits: SearchHit[] = [];

  for (const team of demoTeams) {
    hits.push({ id: team.slug, type: "فريق", title: team.name, sub: `${team.nameEn} · ${team.country}`, url: `/teams/${team.slug}`, weight: 0 });
  }
  for (const player of demoPlayers) {
    const team = teamBySlug(player.team);
    hits.push({ id: player.slug, type: "لاعب", title: player.name, sub: `${team?.name ?? player.team} · ${player.position}`, url: `/players/${player.slug}`, weight: 0 });
  }
  for (const competition of demoCompetitions) {
    hits.push({ id: competition.slug, type: "بطولة", title: competition.name, sub: `${competition.nameEn} · ${competition.country}`, url: `/competitions/${competition.slug}`, weight: 0 });
  }
  for (const article of demoArticles) {
    hits.push({ id: article.slug, type: "خبر", title: article.title, sub: `${article.category} · ${article.author}`, url: `/news/${article.slug}`, weight: 0 });
  }
  for (const match of demoMatches) {
    const home = teamBySlug(match.home);
    const away = teamBySlug(match.away);
    const competition = demoCompetitions.find((item) => item.slug === match.competition);
    hits.push({
      id: match.slug,
      type: "مباراة",
      title: `${home?.name ?? match.home} × ${away?.name ?? match.away}`,
      sub: competition?.name ?? "مباراة",
      url: `/matches/${match.slug}`,
      weight: 0,
    });
  }
  return hits;
}

async function buildSearchIndex(): Promise<SearchIndex> {
  const preview = demoContentVisible();
  const hits = localDemoHits();

  // Search must be a read-only enhancement: unlike the public news feed, it
  // must not kick off an RSS refresh simply because someone typed a query.
  // listArticles reads only already-stored, published items.
  const articlesPromise = listArticles({ limit: 100 })
    .then(({ items }) => items)
    .catch(() => []);

  // The preview catalogue already contains its sample teams, players, matches
  // and competitions. Likewise, an explicitly disabled/no-provider deployment
  // has nothing real to index. Skip those SDL fan-outs rather than spending
  // cache/quota work on data this search cannot display.
  const providerPromise = !preview && hasProviderKeys()
    ? Promise.allSettled([
        teamsDirectory("football", footballDataCompetitions(true).map((competition) => competition.slug ?? competition.code)),
        Promise.all(["football", "basketball", "tennis", "cricket"].map((sport) => fixtures({ sport }))),
        Promise.all(["football", "basketball", "tennis", "cricket"].map((sport) => liveMatches(sport))),
        Promise.all(canonicalCompetitions.map((competition) => footballTopScorers(competition.providerId))),
      ])
    : Promise.resolve(null);

  const [articleItems, realTasks] = await Promise.all([articlesPromise, providerPromise]);

  if (realTasks) {
    const teamTask = realTasks[0];
    const teamResult = teamTask.status === "fulfilled" ? teamTask.value : null;
    if (teamResult?.ok && teamResult.source === "provider") {
      for (const team of teamResult.data) {
        hits.push({
          id: team.providerId,
          type: "فريق",
          title: team.name,
          sub: team.competition,
          url: `/teams/${encodeURIComponent(team.providerId)}`,
          weight: 0,
        });
      }
    }

    const fixtureTask = realTasks[1];
    const fixtureResults = fixtureTask.status === "fulfilled" ? fixtureTask.value : [];
    const liveTask = realTasks[2];
    const liveResults = liveTask.status === "fulfilled" ? liveTask.value : [];
    const fixturesById = new Map<string, NormalizedFixture>();
    for (const result of [...fixtureResults, ...liveResults]) {
      if (!result.ok || result.source !== "provider") continue;
      for (const fixture of result.data) {
        if (fixture.providerId && hasMatchIdentity(fixture)) fixturesById.set(fixture.providerId, fixture);
      }
    }
    for (const fixture of fixturesById.values()) {
      hits.push({
        id: fixture.providerId,
        type: "مباراة",
        title: `${fixture.homeName ?? fixture.homeProviderId} × ${fixture.awayName ?? fixture.awayProviderId}`,
        sub: fixture.competitionName ?? sportBySlug(fixture.sport)?.name ?? "مباراة",
        url: `/matches/${encodeURIComponent(fixture.providerId)}`,
        weight: 0,
      });
    }

    const scorerTask = realTasks[3];
    const scorerResults = scorerTask.status === "fulfilled" ? scorerTask.value : [];
    const scorersById = new Map<string, { scorer: NormalizedTopScorer; competition: string }>();
    scorerResults.forEach((result, index) => {
      if (!result.ok || result.source.provider === "demo" || !supportsPlayerStats(result.source.provider)) return;
      for (const scorer of result.data) {
        if (!scorer.playerProviderId.trim() || !scorer.playerName?.trim() || !scorer.profileAvailable) continue;
        scorersById.set(scorer.playerProviderId, { scorer, competition: canonicalCompetitions[index]?.nameAr ?? "" });
      }
    });
    for (const [playerId, { scorer, competition }] of scorersById) {
      const name = scorer.playerName!.trim();
      hits.push({
        id: playerId,
        type: "لاعب",
        title: name,
        sub: [scorer.teamName, competition].filter(Boolean).join(" · "),
        url: `/players/${encodeURIComponent(playerId)}`,
        weight: 0,
      });
    }
  }

  for (const article of articleItems) {
    hits.push({
      id: article.id,
      type: "خبر",
      title: article.title,
      sub: `${article.sourceName} · ${article.category}`,
      url: article.sourceUrl,
      weight: 0,
      external: true,
      aliases: [
        // The Arabic labels this article is already tagged with on /news.
        ...article.relatedEntities.map((entity) => entity.displayName),
        // …plus the provider spelling, so «Ahly» finds it too.
        ...article.relatedEntities.map((entity) => entity.extractedName),
        categoryMeta(article.category).nameAr,
      ].filter(Boolean),
    });
  }

  // The editorial catalogue's competitions remain discoverable even when a
  // provider is temporarily unavailable. These are known competition entries,
  // not fabricated standings or match results.
  if (!preview) {
    for (const competition of canonicalCompetitions) {
      hits.push({
        id: competition.canonicalSlug,
        type: "بطولة",
        title: competition.nameAr,
        sub: competition.countryAr,
        url: `/competitions/${competition.canonicalSlug}`,
        weight: 0,
      });
    }
  }

  const deduplicated = new Map<string, SearchHit>();
  for (const hit of hits) {
    const key = hitKey(hit);
    const existing = deduplicated.get(key);
    if (!existing || (hit.external && !existing.external)) deduplicated.set(key, hit);
  }

  return { hits: [...deduplicated.values()], createdAt: Date.now() };
}

async function readSharedIndex(): Promise<SearchIndex | null> {
  try {
    const store = await getRedisKv();
    const entry = await store?.get<SearchIndex>(sharedIndexKey());
    const index = entry?.value;
    return index && Array.isArray(index.hits) && Number.isFinite(index.createdAt) && Date.now() - index.createdAt < INDEX_TTL_MS
      ? index
      : null;
  } catch {
    // Redis is optional; local indexing remains a safe fallback.
    return null;
  }
}

async function writeSharedIndex(index: SearchIndex): Promise<void> {
  try {
    const store = await getRedisKv();
    if (store) await store.set(sharedIndexKey(), index, INDEX_TTL_SECONDS);
  } catch {
    // A cache write must not break search.
  }
}

async function searchIndex(): Promise<SearchIndex> {
  if (cachedIndex && Date.now() - cachedIndex.createdAt < INDEX_TTL_MS) return cachedIndex;
  if (!indexInFlight) {
    indexInFlight = (async () => {
      const shared = await readSharedIndex();
      if (shared) {
        cachedIndex = shared;
        return shared;
      }
      const next = await buildSearchIndex();
      cachedIndex = next;
      await writeSharedIndex(next);
      return next;
    })().finally(() => {
      indexInFlight = null;
    });
  }
  return indexInFlight;
}

export async function searchEntities(query: string): Promise<SearchResponse> {
  const cleanQuery = query.trim().slice(0, 120);
  const counts: SearchResponse["counts"] = { فريق: 0, لاعب: 0, بطولة: 0, مباراة: 0, خبر: 0 };
  if (cleanQuery.length < 2) return { query: cleanQuery, preview: demoContentVisible(), total: 0, counts, results: [] };

  const index = await searchIndex();
  const filtered = index.hits
    .map((hit) => ({ ...hit, weight: searchMatchWeight(cleanQuery, ...searchTerms(hit)) }))
    .filter((hit) => hit.weight > 0 || matchesSearchText(cleanQuery, ...searchTerms(hit)))
    .sort((a, b) => b.weight - a.weight || a.title.localeCompare(b.title, "ar"));

  // A compact suggestion list, while the search results page can return more.
  const results = filtered.slice(0, 40);
  for (const hit of filtered) counts[hit.type]++;

  return {
    query: cleanQuery,
    preview: demoContentVisible(),
    total: filtered.length,
    counts,
    results: results.map(({ weight: _weight, aliases: _aliases, ...hit }) => hit),
  };
}

/** Invalidate both local and shared suggestions after source/article changes. */
export function invalidateSearchIndex(): void {
  cachedIndex = null;
  void getRedisKv()
    .then((store) => store?.delPrefix(SHARED_INDEX_PREFIX))
    .catch(() => {});
}
