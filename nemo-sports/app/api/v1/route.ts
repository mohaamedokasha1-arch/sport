import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1 — the public contract.
 * Versioned from day one (§19.1): breaking changes go to /api/v2, and v1 keeps
 * working until every client has moved.
 */
export async function GET() {
  return NextResponse.json({
    name: "NEMO Sports Data API",
    version: "v1",
    deprecated: false,
    docs: "All responses are canonical: provider identifiers and payloads never leave the Sports Data Layer.",
    endpoints: {
      "/api/v1/live": "GET ?sport=football — in-play matches",
      "/api/v1/matches": "GET ?sport=&date=&competition= — fixtures · GET ?events=<providerMatchId> — match events",
      "/api/v1/football-data/standings": "GET ?competition=PL — league table (Football-Data.org, cached)",
      "/api/v1/football-data/matches": "GET ?date=YYYY-MM-DD&competition= — the day's fixtures and results",
      "/api/v1/football-data/scorers": "GET ?competition=PL — top scorers (plan-dependent upstream resource)",
      "/api/v1/football-data/status": "GET — key configured? quota left? cache TTLs and hit rates",
      "/api/v1/system": "GET — provider health, cost, cache and conflict state (admin)",
    },
    meta: {
      source: "demo data is used when no provider credentials are configured; such responses carry meta.source = 'demo'",
      cache: "live endpoints are cached 5s, static reference data up to 6h (SDL cache policy); meta.cache.ttlSeconds states the TTL in force",
      footballData:
        "Football-Data.org is a server-side provider: its API key lives in FOOTBALL_DATA_API_KEY and is never sent to the browser. Failed calls answer 503 with 'Data temporarily unavailable' — never placeholder data.",
    },
  });
}
