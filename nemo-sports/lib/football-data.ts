/**
 * Football-Data.org · backend service
 * ───────────────────────────────────
 * The single server-side door between the product and the Football-Data.org
 * data feed. Pages, API routes and jobs call these functions; nothing else in
 * the app builds a football-data.org URL, reads its token or shapes its
 * payloads.
 *
 * How it is wired
 *   pages / api routes → this service → lib/sdl-gateway.ts → Sports Data Layer
 *                     → FootballDataAdapter → https://api.football-data.org/v4
 *
 * Why through the SDL: caching, request coalescing, rate limiting, failover and
 * canonical mapping already live there, so this provider gets the same
 * protection as every paid one — and the key stays in ONE place (the adapter's
 * `X-Auth-Token` header), injected from a server-side environment variable.
 *
 * Guarantees:
 *   · the API key is read from `process.env.FOOTBALL_DATA_API_KEY` only, at
 *     request time, on the server. It is never referenced in a component, never
 *     prefixed `NEXT_PUBLIC_`, and never returned in a response;
 *   · every response states where it came from, whether it was cached, and when
 *     it was fetched — clients can degrade honestly;
 *   · on failure the service returns `DATA_UNAVAILABLE_MESSAGE` ("Data
 *     temporarily unavailable"). It NEVER fabricates matches, tables or scorers
 *     and never falls back to the offline demo dataset.
 */

import {
  fixtures as gatewayFixtures,
  standings as gatewayStandings,
  topScorers as gatewayTopScorers,
  cachePolicyFor,
  sdlContext,
  type GatewayResult,
} from "@/lib/sdl-gateway";
import { FOOTBALL_DATA_COMPETITIONS, FOOTBALL_DATA_HOME, footballDataCode, type DataType, type NormalizedFixture, type NormalizedStandingRow, type NormalizedTopScorer, type ProviderName } from "@/packages/sdl/src";

/** The provider name inside the Sports Data Layer. */
export const FOOTBALL_DATA_PROVIDER: ProviderName = "football_data";

/** Public home of the source — the attribution link its terms require. */
export const FOOTBALL_DATA_URL = FOOTBALL_DATA_HOME;

/** The exact wording shown whenever the feed cannot be served. */
export const DATA_UNAVAILABLE_MESSAGE = "Data temporarily unavailable";

export type FootballDataSource = {
  provider: ProviderName;
  /** true when the payload was served from a cache layer instead of the network */
  fromCache: boolean;
  /** true when every provider failed and the last known good value was served */
  stale: boolean;
  fetchedAt: string;
  /** seconds the canonical cache entry is valid for (SDL cache policy) */
  ttlSeconds: number;
  attribution: { label: string; url: string };
};

export type FootballDataResult<T> =
  | { ok: true; data: T; source: FootballDataSource }
  | {
      ok: false;
      error: {
        code: "unavailable" | "not_found";
        /** fixed, user-facing wording: never a provider message, never mock data */
        message: typeof DATA_UNAVAILABLE_MESSAGE;
        /** server-side detail for logs (provider errors stay server-side) */
        detail: string;
        attempts: { provider: ProviderName; ok: boolean; error?: string; ms: number }[];
      };
    };

export type FootballDataCompetitionRef = {
  code: string;
  slug: string | null;
  name: string;
  nameAr: string;
  countryAr: string;
  featured: boolean;
};

/** The major-league catalogue shown by the product (five leagues + the CL). */
export function footballDataCompetitions(featuredOnly = false): FootballDataCompetitionRef[] {
  return FOOTBALL_DATA_COMPETITIONS.filter((c) => (featuredOnly ? c.featured : true)).map((c) => ({
    // `slug` is the identifier the keyless SportScore provider understands, so
    // one string drives either provider and the chain can fall through.
    code: c.code,
    slug: c.sportscoreSlug,
    name: c.name,
    nameAr: c.nameAr,
    countryAr: c.countryAr,
    featured: c.featured,
  }));
}

/**
 * Is a Football-Data.org key configured on the server?
 * Deliberately a function (not a module constant): the value is read from the
 * environment at request time, which is what makes it safe to ship the same
 * build to several environments.
 */
export function footballDataConfigured(): boolean {
  return Boolean(process.env.FOOTBALL_DATA_API_KEY) && process.env.NEMO_SDL_MODE !== "demo";
}

/** UTC calendar day (YYYY-MM-DD) — the format every football-data.org filter expects. */
export function dayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

const ATTRIBUTION = { label: "Powered by Football-Data.org", url: FOOTBALL_DATA_URL };

/**
 * Translate a gateway result into the service contract: cache metadata on
 * success, the fixed honest message on failure. One place, so no caller can
 * accidentally leak a provider error to a visitor.
 */
async function wrap<T>(result: GatewayResult<T>, dataType: DataType): Promise<FootballDataResult<T>> {
  if (!result.ok) {
    const notFound = result.error.kind === "not_found";
    return {
      ok: false,
      error: {
        code: notFound ? "not_found" : "unavailable",
        message: DATA_UNAVAILABLE_MESSAGE,
        detail: result.error.message,
        attempts: result.error.attempts,
      },
    };
  }
  const policy = await cachePolicyFor(dataType).catch(() => null);
  return {
    ok: true,
    data: result.data,
    source: {
      provider: result.provider,
      fromCache: result.fromCache,
      stale: result.stale,
      fetchedAt: result.fetchedAt,
      ttlSeconds: policy?.canonical ?? 0,
      attribution: ATTRIBUTION,
    },
  };
}

/**
 * Stable form of a competition identifier: `PL`, `pl`, `Premier League` and
 * `english-premier-league` all collapse to ONE string before the cache key is
 * built. Otherwise the same league requested under two spellings would occupy
 * two cache entries and spend two upstream calls out of the provider's
 * 10-per-minute budget.
 *
 * The stable form is the slug the keyless SportScore provider also understands
 * (when the league has one), so a single identifier keeps both the primary
 * provider and its fallback resolvable; the adapter maps it to the official
 * football-data.org code internally.
 */
function normalizeCompetitionId(id: string): string {
  const code = footballDataCode(id);
  if (!code) return id;
  return FOOTBALL_DATA_COMPETITIONS.find((c) => c.code === code)?.sportscoreSlug ?? code;
}

/** League table for one competition (code, SportScore slug or name). */
export async function footballStandings(competitionId: string): Promise<FootballDataResult<NormalizedStandingRow[]>> {
  return wrap(await gatewayStandings("football", normalizeCompetitionId(competitionId)), "standings");
}

/** Top scorers for one competition. Requires a plan that includes scorer data. */
export async function footballTopScorers(competitionId: string): Promise<FootballDataResult<NormalizedTopScorer[]>> {
  return wrap(await gatewayTopScorers("football", normalizeCompetitionId(competitionId)), "top_scorers");
}

/**
 * Matches of one UTC day (the day's fixtures and results), or of one
 * competition when `competitionId` is given.
 */
export async function footballMatches(input: { date?: string; competitionId?: string } = {}): Promise<FootballDataResult<NormalizedFixture[]>> {
  return wrap(
    await gatewayFixtures({
      sport: "football",
      date: input.date,
      competitionProviderId: input.competitionId ? normalizeCompetitionId(input.competitionId) : undefined,
    }),
    "fixtures",
  );
}

/** Today's matches and results, in one call. */
export async function footballToday(): Promise<FootballDataResult<NormalizedFixture[]>> {
  return footballMatches({ date: dayKey() });
}

export type FootballDataStatus = {
  configured: boolean;
  registered: boolean;
  mode: "live" | "demo";
  provider: ProviderName;
  attribution: { label: string; url: string };
  /** what the last response said about the published quota */
  quota: { requestsAvailableMinute: number | null; resetSeconds: number | null; at: string } | null;
  rateLimit: {
    perSecond: number | null;
    perMinute: number | null;
    usedLastMinute: number | null;
    concurrency: number | null;
    throttled: boolean;
  } | null;
  cache: {
    layers: { layer: string; hits: number; misses: number; hitRate: number }[];
    policy: { dataType: DataType; raw: number; canonical: number; staleGrace: number }[];
  };
  baseUrl: string;
};

/**
 * Operational state of the integration: is the key configured, is the provider
 * registered, how much of the published quota is left, and how well the cache
 * is doing. Powers /api/v1/football-data/status and the admin providers page.
 */
export async function footballDataStatus(): Promise<FootballDataStatus> {
  const { sdl, mode } = await sdlContext();
  const registered = sdl.registeredProviders().some((p) => p.name === FOOTBALL_DATA_PROVIDER);
  const provider = sdl.provider(FOOTBALL_DATA_PROVIDER);
  const quotaOf = provider as unknown as { quotaSnapshot?: () => FootballDataStatus["quota"] } | undefined;
  const cfg = sdl.rateLimiter.config(FOOTBALL_DATA_PROVIDER);
  const usage = await sdl.rateLimiter.usage(FOOTBALL_DATA_PROVIDER).catch(() => []);
  const perMinuteUsed = usage.find((u) => u.window === "minute")?.used ?? null;

  const dataTypes: DataType[] = ["standings", "top_scorers", "fixtures", "results", "live_matches", "match_detail"];
  return {
    configured: footballDataConfigured(),
    registered,
    mode,
    provider: FOOTBALL_DATA_PROVIDER,
    attribution: ATTRIBUTION,
    quota: quotaOf?.quotaSnapshot?.() ?? null,
    rateLimit: cfg
      ? {
          perSecond: cfg.perSecond,
          perMinute: cfg.perMinute,
          usedLastMinute: perMinuteUsed,
          concurrency: cfg.concurrency,
          throttled: sdl.isThrottled(FOOTBALL_DATA_PROVIDER),
        }
      : null,
    cache: {
      layers: sdl.cache.stats(),
      policy: dataTypes.map((dataType) => ({ dataType, ...sdl.cachePolicy(dataType) })),
    },
    baseUrl: "https://api.football-data.org/v4",
  };
}
