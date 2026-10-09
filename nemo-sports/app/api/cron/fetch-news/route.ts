import { NextResponse } from "next/server";
import { ingestAllSources } from "@/lib/news/pipeline";
import { invalidateSearchIndex } from "@/lib/search-service";
import { newsBackend } from "@/lib/news/store";

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
 * Intraday freshness comes from the traffic-driven lazy refresh in
 * lib/news/service.ts (coalesced, 30-min staleness trigger) — the zero-cost
 * architecture works fully on Hobby. Upgrade paths for tighter cadence:
 *   · Vercel Pro → change the schedule to every-15-minutes, or
 *   · free external scheduler (e.g. cron-job.org) → GET this URL with
 *     ?token=$NEMO_INGEST_TOKEN as often as every 5 min.
 * Per-source refresh intervals + backoff are honoured inside the pipeline,
 * so extra triggers are cheap: due sources fetch, the rest skip.
 */

function expectedSecrets(): string[] {
  return [process.env.NEMO_INGEST_TOKEN, process.env.CRON_SECRET, process.env.VERCEL_CRON_SECRET].filter(
    (s): s is string => Boolean(s),
  );
}

function authorize(request: Request): boolean {
  const secrets = expectedSecrets();
  if (secrets.length === 0) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const query = new URL(request.url).searchParams.get("token") ?? "";
  return secrets.some((s) => s.length > 0 && (bearer === s || query === s));
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    const configured = expectedSecrets().length > 0;
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: configured ? "unauthorized" : "not_configured",
          message: configured
            ? "a valid bearer token (or ?token=) is required"
            : "NEMO_INGEST_TOKEN / CRON_SECRET is not set, so scheduled ingestion is disabled",
        },
      },
      { status: configured ? 401 : 503, headers: { "cache-control": "no-store" } },
    );
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
      { ok: true, storage, ...stats },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: { code: "ingest_failed", message: e instanceof Error ? e.message : String(e) } },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
