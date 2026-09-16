import { NextResponse } from "next/server";
import { diagnostics } from "@/lib/sdl-gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/system
 * Provider health, cost ledger, cache hit rates, open conflicts and the
 * polling/in-flight state. Consumed by the admin dashboard (§10).
 *
 * In production this must sit behind the admin role check and MFA (§12.2);
 * the guard is applied by the middleware that owns the /admin and /api/v1/system
 * namespaces, not here, so the route stays testable.
 */
export async function GET() {
  const d = await diagnostics();
  return NextResponse.json(
    {
      ok: true,
      mode: d.mode,
      infrastructure: d.infra,
      missingProviders: d.missing,
      providers: d.providers,
      health: d.health,
      cost: d.cost,
      cache: d.cache,
      conflicts: d.conflicts,
      inFlightRequests: d.inFlight,
      throttled: d.throttled,
      recentLogs: (d.logs as unknown[]).slice(0, 25),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
