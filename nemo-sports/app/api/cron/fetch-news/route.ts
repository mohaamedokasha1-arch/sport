import { NextResponse } from "next/server";
import { ingestAllSources, DurableStorageRequiredError, IngestBusyError } from "@/lib/news/pipeline";
import { invalidateSearchIndex } from "@/lib/search-service";
import { newsBackend } from "@/lib/news/store";
import { authorizeCron, cronRefusal } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/fetch-news — scheduled news ingestion (Vercel Cron).
 * ─────────────────────────────────────────────────────────────────
 * Vercel Cron hits this path on schedule (see vercel.json). Auth accepts
 * either secret via Bearer header (Vercel sends CRON_SECRET automatically)
 * or ?token= for manual schedulers.
 *
 * HOBBY-PLAN NOTE: Vercel's free tier REJECTS any cron more frequent than
 * once-daily at deploy time, so vercel.json schedules this daily (03:30 UTC).
 * Public reads no longer launch unawaited work. For a tighter cadence use an
 * authorized scheduler sending a Bearer header, subject to hosting limits and
 * feed permissions. DATABASE_URL is required for durable production ingestion.
 * Each job is bounded and uses a Postgres advisory lock; unfinished sources
 * stay due. Repeated triggers honor each source's interval and failure backoff.
 */

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    const refusal = cronRefusal("NEMO_INGEST_TOKEN / CRON_SECRET is not set, so scheduled ingestion is disabled");
    return NextResponse.json(refusal.body, { status: refusal.http, headers: { "cache-control": "no-store" } });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const only = url.searchParams.get("source");
  try {
    const stats = await ingestAllSources({
      force,
      ...(only ? { sourceIds: [only] } : {}),
    });
    invalidateSearchIndex();
    // `storage` tells the scheduler's operator whether this run persisted. "memory"
    // with DATABASE_URL set means the database is misconfigured (see server logs).
    const storage = await newsBackend();
    return NextResponse.json(
      { ok: stats.perSource.every((s) => s.ok), storage, ...stats },
      { status: stats.perSource.every((s) => s.ok) ? 200 : 502, headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    // Distinct, honest outcomes for the scheduler: a run already in progress is
    // not a failure, and a missing database is a configuration problem (503),
    // not an internal error. Anything else is a genuine 500.
    if (e instanceof IngestBusyError) {
      return NextResponse.json(
        { ok: false, error: { code: "already_running", message: "another ingestion run holds the lock; it will finish on its own" } },
        { status: 409, headers: { "cache-control": "no-store" } },
      );
    }
    if (e instanceof DurableStorageRequiredError) {
      return NextResponse.json(
        { ok: false, error: { code: "durable_storage_required", message: "DATABASE_URL is required for scheduled news ingestion in production" } },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "ingest_failed", message: "News ingestion failed; check database and provider health." } },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
