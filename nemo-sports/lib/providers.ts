/**
 * NEMO Sports · provider registry + attribution (zero-cost edition)
 * ─────────────────────────────────────────────────────────────────
 * Every external data source in one auditable place: capabilities, free-tier
 * limits, and the REQUIRED attribution. Pages rendering provider data must
 * show the attribution link — see components/ui/AttributionFooter.tsx.
 *
 * FREE-TIER LIMITS (verify against provider docs before launch):
 *  · SportScore open tier — ~10,000 req / 24h / IP, responses cached 60s at
 *    their edge. Attribution REQUIRED (dofollow "Powered by SportScore").
 *  · Football-Data.org free — 10 req/min, 12 competitions. Attribution
 *    appreciated (we show it regardless).
 *  · TheSportsDB free — community metadata/images ONLY (teams, players,
 *    artwork). NEVER live scores / premium V2 endpoints. Attribution REQUIRED.
 *  · Google News RSS — metadata + short snippet only, always link original.
 */

import { demoContentVisible } from "./site";

export type ProviderTier = "free" | "paid";
export type ProviderRole = "primary" | "secondary" | "fallback";

export interface ProviderCapabilities {
  liveScores: boolean;
  fixtures: boolean;
  results: boolean;
  standings: boolean;
  teamData: boolean;
  playerData: boolean;
  matchDetails: boolean;
  images: boolean;
  news: boolean;
}

export interface ISportDataProvider {
  name: string;
  /** SDL adapter name (matches packages/sdl provider registry) */
  sdlName: string | null;
  type: ProviderRole;
  tier: ProviderTier;
  capabilities: ProviderCapabilities;
  rateLimit: { requestsPerMinute: number | null; requestsPerDay: number | null };
  attributionRequired: boolean;
  attributionText: string;
  attributionTextAr: string;
  attributionUrl: string;
  termsUrl: string;
  notes: string;
}

const NONE: ProviderCapabilities = {
  liveScores: false,
  fixtures: false,
  results: false,
  standings: false,
  teamData: false,
  playerData: false,
  matchDetails: false,
  images: false,
  news: false,
};

export const PROVIDERS: ISportDataProvider[] = [
  {
    name: "SportScore",
    sdlName: "sportscore",
    type: "primary",
    tier: "free",
    capabilities: {
      ...NONE,
      liveScores: true,
      fixtures: true,
      results: true,
      standings: true,
      playerData: true,
      matchDetails: true,
    },
    // Documented open-tier budget: ~10k/day/IP, burst-friendly.
    rateLimit: { requestsPerMinute: null, requestsPerDay: 10000 },
    attributionRequired: true,
    attributionText: "Match data: SportScore",
    attributionTextAr: "بيانات المباريات: SportScore",
    attributionUrl: "https://www.sportscore.com",
    termsUrl: "https://sportscore.com/developers/",
    notes: "Keyless open tier. Every page rendering its data shows a visible dofollow link.",
  },
  {
    name: "Football-Data.org",
    sdlName: "football_data",
    type: "primary",
    tier: "free",
    capabilities: {
      ...NONE,
      fixtures: true,
      results: true,
      standings: true,
      teamData: true,
      matchDetails: true,
    },
    rateLimit: { requestsPerMinute: 10, requestsPerDay: null },
    attributionRequired: true,
    attributionText: "Football data: Football-Data.org",
    attributionTextAr: "بيانات كرة القدم: Football-Data.org",
    attributionUrl: "https://www.football-data.org",
    termsUrl: "https://www.football-data.org/terms",
    notes: "Free plan: 12 competitions, delayed scores — leads tables/scorers, live fallback only.",
  },
  {
    name: "TheSportsDB",
    sdlName: "thesportsdb",
    type: "secondary",
    tier: "free",
    capabilities: { ...NONE, teamData: true, playerData: true, images: true },
    rateLimit: { requestsPerMinute: 30, requestsPerDay: 5000 },
    attributionRequired: true,
    attributionText: "Teams & players metadata: TheSportsDB",
    attributionTextAr: "بيانات الفرق واللاعبين: TheSportsDB",
    attributionUrl: "https://www.thesportsdb.com",
    termsUrl: "https://www.thesportsdb.com/terms.php",
    notes: "FREE TIER ONLY: metadata/images. Live scores + premium V2 endpoints are NEVER used.",
  },
  {
    name: "Google News RSS",
    sdlName: null,
    type: "primary",
    tier: "free",
    capabilities: { ...NONE, news: true },
    rateLimit: { requestsPerMinute: null, requestsPerDay: null },
    attributionRequired: true,
    attributionText: "Headlines via Google News — read the original publisher",
    attributionTextAr: "العناوين عبر أخبار جوجل — اقرأ الخبر من ناشره الأصلي",
    attributionUrl: "https://news.google.com",
    termsUrl: "https://news.google.com",
    notes: "Metadata + short snippet only. Every article links its original publisher.",
  },
];

export function providerBySdlName(sdlName: string): ISportDataProvider | undefined {
  return PROVIDERS.find((p) => p.sdlName === sdlName);
}

export function requiredAttributions(): ISportDataProvider[] {
  const demoMode = demoContentVisible() || process.env.NEMO_SDL_MODE === "demo";
  const enabled = new Set<string>();

  if (!demoMode) {
    if (process.env.NEMO_SPORTSCORE_ENABLED !== "0") enabled.add("sportscore");
    if (process.env.FOOTBALL_DATA_API_KEY) enabled.add("football_data");
    if (process.env.THESPORTSDB_KEY || process.env.THESPORTSDB_API_KEY) enabled.add("thesportsdb");
  }

  return PROVIDERS.filter((provider) => {
    if (!provider.attributionRequired) return false;
    // The Google News RSS feed is a built-in editorial input, independent of
    // the sports-data-provider mode. SDL sources are listed only when enabled.
    if (provider.name === "Google News RSS") return true;
    return provider.sdlName !== null && enabled.has(provider.sdlName);
  });
}
