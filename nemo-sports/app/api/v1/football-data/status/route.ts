import { NextResponse } from "next/server";
import { footballDataConfigured, footballDataStatus } from "@/lib/football-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/football-data/status
 * ────────────────────────────────
 * Operational view of the integration: is the key configured, is the provider
 * registered, how much of the published per-minute quota is left, which cache
 * TTLs are in force and how well the cache is performing.
 *
 * It exposes state, never secrets: the API key (and any header carrying it) is
 * not part of this payload, and the quota figure comes from the response header
 * the provider publishes, not from our own requests.
 */
export async function GET() {
  const status = await footballDataStatus();
  return NextResponse.json(
    {
      ok: true,
      configured: status.configured,
      registered: status.registered,
      mode: status.mode,
      provider: status.provider,
      baseUrl: status.baseUrl,
      quota: status.quota,
      rateLimit: status.rateLimit,
      cache: status.cache,
      attribution: status.attribution,
      note: footballDataConfigured()
        ? undefined
        : "FOOTBALL_DATA_API_KEY is not set on the server — requests are served by the remaining providers or fail honestly.",
    },
    { headers: { "cache-control": "no-store" } },
  );
}
