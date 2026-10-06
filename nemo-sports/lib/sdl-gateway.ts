/**
 * Data gateway — the app's ONLY door into the Sports Data Layer.
 * ──────────────────────────────────────────────────────────────
 * Server components and `/api/v1/*` routes call these functions. They never
 * import an adapter, never build a provider URL and never see a provider
 * payload: the SDL returns canonical data or a documented failure.
 *
 * When the platform runs without provider keys the SDL falls back to the
 * offline demo adapter, and every response carries `source: "demo"` so the
 * frontend can mark the page non-indexable (Instruction 6).
 */

import { getSdl, configureSdl, type FetchReport, type NormalizedFixture, type ProviderName, type SdlFailure, type DataType, type NormalizedEvent, type NormalizedStandingRow, type NormalizedTopScorer, type NormalizedLineup, type NormalizedStat, type NormalizedPlayerStats } from "@/packages/sdl/src";
import { getCanonicalStore, dbHealth } from "@/lib/db/pg";
import { getRedisKv, redisHealth } from "@/lib/cache/redis";

export type DataSource = "provider" | "demo";

/**
 * SDL failure kinds that a retry can never change.
 * ─────────────────────────────────────────────────────────────────────────
 * Dynamic pages must distinguish "the provider is having a bad minute" from
 * "this entity does not and cannot exist":
 *
 *   · transient  → rethrow, so ISR keeps serving the last good page and an
 *                  outage never writes a permanent 404 into the cache.
 *   · permanent  → call notFound(), so a typo'd or legacy slug answers a
 *                  stable 404 instead of a 500.
 *
 * `all_providers_failed` stays transient on purpose: it genuinely does not
 * know whether the entity exists, and guessing 404 there would let an outage
 * delete real pages from the index.
 *
 * Shared by app/matches/[slug] and app/players/[slug]. It lives here rather
 * than in either page because the two previously disagreed — matches excluded
 * `no_provider_configured`, players did not, and every unknown player slug
 * returned HTTP 500 as a result.
 */
export const PERMANENT_FAILURE_KINDS: ReadonlySet<SdlFailure["kind"]> = new Set<SdlFailure["kind"]>([
  "not_found",
  "no_provider_configured",
  "unsupported",
]);

/** True when a gateway failure should produce a stable 404, not a retry. */
export function isPermanentFailure(error: SdlFailure): boolean {
  return PERMANENT_FAILURE_KINDS.has(error.kind);
}

/**
 * Does this normalized fixture carry enough identity to be a real page?
 * ─────────────────────────────────────────────────────────────────────────
 * A provider can answer a match-detail request successfully and still return a
 * shell with no team identities — an empty object, or a list payload where a
 * single match was expected. Rendering that produces a page titled "— ضد —"
 * with no score, no competition and no teams, served with HTTP 200, a
 * self-referencing canonical and `index, follow`.
 *
 * Because /matches/[slug] accepts any provider slug, that is an unbounded
 * space of indexable empty pages — a crawl trap. Anything failing this check
 * is a 404, not a thin page.
 */
export function hasMatchIdentity(fixture: NormalizedFixture): boolean {
  const home = fixture.homeName ?? fixture.homeProviderId;
  const away = fixture.awayName ?? fixture.awayProviderId;
  return Boolean(home) && Boolean(away) && Boolean(fixture.scheduledAt);
}
export type GatewayResult<T> =
  | { ok: true; data: T; provider: ProviderName; fromCache: boolean; stale: boolean; degraded: boolean; fetchedAt: string; source: DataSource }
  | { ok: false; error: SdlFailure };

export type InfraState = {
  postgres: { ok: boolean; detail: string };
  redis: { ok: boolean; detail: string };
  canonical: "postgres" | "memory";
  cache: "redis" | "memory";
};

let infraPromise: Promise<InfraState> | null = null;

/**
 * Build the durable infrastructure once and hand it to the SDL. Both drivers
 * return `null` when not configured, so this never blocks startup.
 */
async function initInfra(): Promise<InfraState> {
  const [canonical, kv, pg, rd] = await Promise.all([getCanonicalStore(), getRedisKv(), dbHealth(), redisHealth()]);
  configureSdl({
    ...(canonical ? { canonical } : {}),
    ...(kv ? { store: kv } : {}),
  });
  return { postgres: pg, redis: rd, canonical: canonical ? "postgres" : "memory", cache: kv ? "redis" : "memory" };
}

function infra(): Promise<InfraState> {
  if (!infraPromise) infraPromise = initInfra();
  return infraPromise;
}

/** The SDL process is a singleton so cache and rate limits are shared. */
export async function sdlContext() {
  const i = await infra();
  const { sdl, mode, missing } = getSdl();
  return { sdl, mode, missing, infra: i };
}

function wrap<T>(result: { ok: true; value: FetchReport<T> } | { ok: false; error: SdlFailure }): GatewayResult<T> {
  if (!result.ok) return result;
  const v = result.value;
  return {
    ok: true,
    data: v.data,
    provider: v.provider,
    fromCache: v.fromCache,
    stale: v.stale,
    degraded: v.degraded,
    fetchedAt: v.fetchedAt,
    source: v.provider === "demo" ? "demo" : "provider",
  };
}

/** In-play matches across every supported sport. */
export async function liveMatches(sport = "football"): Promise<GatewayResult<NormalizedFixture[]>> {
  const { sdl } = await sdlContext();
  return wrap(
    await sdl.fetch<NormalizedFixture[]>({
      sport,
      dataType: "live_matches",
      endpoint: "live",
      params: { sport },
      call: (p) => p.getLiveMatches({ sport }),
    }),
  );
}

/** Fixtures for one day (or a competition within a range). */
export async function fixtures(input: { sport?: string; date?: string; competitionProviderId?: string }): Promise<GatewayResult<NormalizedFixture[]>> {
  const sport = input.sport ?? "football";
  const { sdl } = await sdlContext();
  return wrap(
    await sdl.fetch<NormalizedFixture[]>({
      sport,
      dataType: "fixtures",
      endpoint: "fixtures",
      params: { sport, date: input.date, competition: input.competitionProviderId },
      call: (p) => p.getFixtures({ sport, date: input.date, competitionProviderId: input.competitionProviderId }),
    }),
  );
}

/** Events of one match, in canonical vocabulary. */
export async function matchEvents(providerMatchId: string): Promise<GatewayResult<NormalizedEvent[]>> {
  const { sdl } = await sdlContext();
  return wrap(
    await sdl.fetch<NormalizedEvent[]>({
      sport: "football",
      dataType: "match_events",
      endpoint: "events",
      params: { providerMatchId },
      call: (p) => p.getMatchEvents({ providerMatchId }),
    }),
  );
}

/**
 * Full detail for one match by provider slug (e.g. "cruz-azul-vs-inter-miami-cf").
 * Score, status, live minute and display metadata.
 */
export async function matchDetail(sport: string, providerMatchId: string): Promise<GatewayResult<NormalizedFixture>> {
  const { sdl } = await sdlContext();
  return wrap(
    await sdl.fetch<NormalizedFixture>({
      sport,
      dataType: "match_detail",
      endpoint: "match_detail",
      params: { sport, providerMatchId },
      call: (p) => p.getMatchDetail({ providerMatchId, sport }),
    }),
  );
}

/** Timeline of one match, in canonical event vocabulary. */
export async function matchStats(sport: string, providerMatchId: string): Promise<GatewayResult<NormalizedStat[]>> {
  const { sdl } = await sdlContext();
  return wrap(
    await sdl.fetch<NormalizedStat[]>({
      sport,
      dataType: "match_stats",
      endpoint: "match_stats",
      params: { sport, providerMatchId },
      call: (p) => p.getMatchStats({ providerMatchId, sport }),
    }),
  );
}

/** Starting XIs and benches for one match (when the provider has them). */
export async function matchLineups(sport: string, providerMatchId: string): Promise<GatewayResult<NormalizedLineup[]>> {
  const { sdl } = await sdlContext();
  return wrap(
    await sdl.fetch<NormalizedLineup[]>({
      sport,
      dataType: "match_lineups",
      endpoint: "match_lineups",
      params: { sport, providerMatchId },
      call: (p) => p.getMatchLineups({ providerMatchId, sport }),
    }),
  );
}

/** League table rows for one competition (provider competition slug). */
export async function standings(sport: string, competitionProviderId: string): Promise<GatewayResult<NormalizedStandingRow[]>> {
  const { sdl } = await sdlContext();
  return wrap(
    await sdl.fetch<NormalizedStandingRow[]>({
      sport,
      dataType: "standings",
      endpoint: "standings",
      params: { sport, competitionProviderId },
      call: (p) => p.getStandings({ providerCompetitionId: competitionProviderId, sport }),
    }),
  );
}

/** Top scorers for one competition (provider competition slug). */
export async function topScorers(sport: string, competitionProviderId: string): Promise<GatewayResult<NormalizedTopScorer[]>> {
  const { sdl } = await sdlContext();
  return wrap(
    await sdl.fetch<NormalizedTopScorer[]>({
      sport,
      dataType: "top_scorers",
      endpoint: "topscorers",
      params: { sport, competitionProviderId },
      call: (p) => p.getTopScorers({ providerCompetitionId: competitionProviderId, sport }),
    }),
  );
}

/** Season statistics for one player (provider player slug). */
export async function playerStats(sport: string, providerPlayerId: string): Promise<GatewayResult<NormalizedPlayerStats>> {
  const { sdl } = await sdlContext();
  return wrap(
    await sdl.fetch<NormalizedPlayerStats>({
      sport,
      dataType: "player_stats",
      endpoint: "player_stats",
      params: { sport, providerPlayerId },
      call: (p) => p.getPlayerStats({ providerPlayerId, sport }),
    }),
  );
}

/** Whether a real (non-demo) data provider is currently serving the platform. */
export async function realDataSourceActive(): Promise<boolean> {
  const { mode } = await sdlContext();
  return mode === "live";
}

/** SDL diagnostics for the admin dashboard (§10, §13). */
export async function diagnostics() {
  const { sdl, mode, missing, infra: i } = await sdlContext();
  return { mode, missing, ...sdl.diagnostics(), infra: i, logs: (sdl.logger as { peek?: () => unknown }).peek?.() ?? [] };
}

/** Provider priority chain actually in effect for one data type. */
export async function chainFor(sport: string, competition: string | null, dataType: DataType) {
  const { sdl } = await sdlContext();
  return sdl.chainFor(sport, competition, dataType);
}

/**
 * Cache lifetimes (seconds) the SDL is honouring for one data type.
 * Published in API responses as `meta.cache.ttlSeconds` so a client can reason
 * about freshness instead of guessing, and shown on the providers dashboard.
 */
export async function cachePolicyFor(dataType: DataType): Promise<{ raw: number; canonical: number; staleGrace: number }> {
  const { sdl } = await sdlContext();
  return sdl.cachePolicy(dataType);
}

/** Names + capabilities of the providers actually registered in this process. */
export async function registeredProviders() {
  const { sdl } = await sdlContext();
  return sdl.registeredProviders();
}

/** Targeted cache invalidation used after a goal, red card or status change. */
export async function invalidateMatch(matchId: string): Promise<number> {
  const { sdl } = await sdlContext();
  return sdl.invalidate(`sdl:canonical:match:${matchId}`);
}

/** Polling interval the scheduler should use for a match right now (§3.6). */
export { profileFor as pollingProfile } from "@/packages/sdl/src";

/**
 * Robots policy driven by the actual data source (Instruction 6).
 *
 * A deployment running on the demo adapter must not have its pages indexed,
 * because the content is not real. The moment provider keys are configured the
 * mode flips to "live" and the site becomes indexable again - no code change,
 * no redeploy of the metadata.
 *
 * BUT `mode === "live"` alone only means a provider is *registered*, not that
 * it can *answer*. SportScore is keyless and enabled by default, so mode was
 * "live" on every deployment — including ones where every provider was down
 * and every page rendered "Data temporarily unavailable". Those pages were
 * served `index, follow` and listed in sitemap.xml, offering Google a site of
 * empty shells. Indexability therefore also requires evidence that data can
 * actually be served. See dataServable().
 */
export async function robotsForDataSource(): Promise<{ index: boolean; follow: boolean }> {
  const indexable = await dataServable();
  return indexable ? { index: true, follow: true } : { index: false, follow: false };
}

/**
 * Can this deployment actually serve real data right now?
 *
 *   · demo mode                       → false (the content is not real)
 *   · any provider has ever succeeded → true  (data has genuinely flowed)
 *   · otherwise                       → probe once, and answer from the probe
 *
 * WHY THE PROBE
 *   The first implementation answered from accumulated health records alone,
 *   giving a cold process the benefit of the doubt. That made the result
 *   depend on *which requests happened to arrive first*: the sitemap (dynamic)
 *   could correctly withhold the data sections while a statically prerendered
 *   page baked in `index, follow` from a build that had not yet attempted
 *   anything. Two surfaces of the same deployment then disagreed about whether
 *   the site was indexable.
 *
 *   Probing makes the answer deterministic. The probe goes through the SDL, so
 *   it is served from the same cache layers and request coalescer as the pages
 *   themselves — it costs no extra provider quota in practice, and it is
 *   rate-limited to once per PROBE_TTL_MS per process.
 *
 * CAVEAT: health and this memo are per-process. On a multi-replica deployment
 * without Redis-backed health, replicas can still disagree briefly. Persisting
 * provider health to Redis is the durable fix and is tracked as follow-up work.
 */
const PROBE_TTL_MS = 60_000;
let probeMemo: { at: number; value: Promise<boolean> } | null = null;

async function probeServable(sdl: Awaited<ReturnType<typeof sdlContext>>["sdl"]): Promise<boolean> {
  try {
    // The cheapest real question the platform can ask: is anything in play?
    const res = await sdl.fetch<NormalizedFixture[]>({
      sport: "football",
      dataType: "live_matches",
      endpoint: "live",
      params: { sport: "football" },
      call: (p) => p.getLiveMatches({ sport: "football" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function dataServable(): Promise<boolean> {
  const { mode, sdl } = await sdlContext();
  if (mode !== "live") return false;

  const health = sdl.diagnostics().health;
  if (Array.isArray(health) && health.some((h) => h.lastSuccessAt !== null)) return true;

  const now = Date.now();
  if (!probeMemo || now - probeMemo.at >= PROBE_TTL_MS) {
    probeMemo = { at: now, value: probeServable(sdl) };
  }
  return probeMemo.value;
}
