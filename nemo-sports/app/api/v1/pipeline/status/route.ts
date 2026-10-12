import { requirePermission } from "@/lib/admin-session";
import { NextResponse } from "next/server";
import { pipelineStatus } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/pipeline/status
 * ───────────────────────────
 * The observability surface for the ingestion pipeline: configured sources and
 * whether they are callable, which endpoints are still unverified, per-job run
 * history, cursors/next-due, raw-archive size and open discrepancies.
 *
 * Guarded like `/api/v1/system` (middleware owns the namespace, the route
 * double-checks the permission and fails closed).
 */
export async function GET() {
  try {
    await requirePermission("providers");
  } catch {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }
  const status = await pipelineStatus(25);
  return NextResponse.json({ ok: true, status }, { headers: { "cache-control": "no-store" } });
}
