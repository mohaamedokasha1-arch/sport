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
 */
export async function robotsForDataSource(): Promise<{ index: boolean; follow: boolean }> {
  const { mode } = await sdlContext();
  return mode === "live" ? { index: true, follow: true } : { index: false, follow: false };
}
