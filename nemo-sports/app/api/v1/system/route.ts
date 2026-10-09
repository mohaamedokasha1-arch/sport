import { requirePermission } from "@/lib/admin-session";
import { NextResponse } from "next/server";
import { diagnostics } from "@/lib/sdl-gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/system
 * Provider health, cost ledger, cache hit rates, open conflicts and the
 * polling/in-flight state. Consumed by the admin dashboard (§10).
 *
 * GUARDED BY middleware.ts, which owns the /admin and /api/v1/system
 * namespaces — the route itself stays unauthenticated so it remains testable.
 *
 * This comment used to promise a middleware that did not exist, so the route
 * answered 200 to anyone and published Postgres/Redis configuration state, the
 * unconfigured-provider list, live health/failover state, the cost ledger and
 * internal log lines. Anonymous requests now get 401; with no
 * ADMIN_ACCESS_TOKEN configured at all they get 503 (fail-closed).
 *
 * Still to come (§12.2): per-user roles and MFA, replacing the shared secret.
 */
export async function GET() {
  try { await requirePermission("providers"); } catch { return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 }); }
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
