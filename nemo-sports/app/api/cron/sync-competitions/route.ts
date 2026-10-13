import { NextResponse } from "next/server";
import { syncCompetitions, competitionSyncStatus } from "@/lib/competition-sync";
import { authorizeCron, cronRefusal } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/sync-competitions — scheduled competition-catalog discovery.
 * ──────────────────────────────────────────────────────────────────────────
 * Asks every registered provider that documents a competition-listing endpoint
 * for its catalog and lands the rows in `provider_competitions`.
 *
 * It spends provider quota, so it is gated by the shared cron gate
 * (lib/cron-auth.ts: Bearer CRON_SECRET / NEMO_INGEST_TOKEN, or ?token=). With
 * no secret configured it refuses with 503 instead of running anonymously.
 *
 * It NEVER publishes anything. A discovered competition stays unpublished until
 * an operator decides it has real content — that decision lives in the admin
 * panel, not here. See lib/competition-sync.ts for the full contract.
 */

const MIN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 h — a catalog changes by season, not by minute

/**
 * In-process single-flight guard. The news pipeline uses a Postgres advisory
 * lock; this job runs at most once a day and only ever inserts-or-updates, so a
 * duplicate run is idempotent rather than harmful — the guard exists to stop a
 * double-scheduled cron from spending quota twice in the same minute, not to
 * protect data integrity.
 */
let running: ReturnType<typeof syncCompetitions> | null = null;

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    const refusal = cronRefusal("NEMO_INGEST_TOKEN / CRON_SECRET is not set, so competition sync is disabled");
    return NextResponse.json(refusal.body, { status: refusal.http, headers: { "cache-control": "no-store" } });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";

  // Skip a run that is too soon after the previous ATTEMPT, unless forced.
  if (!force) {
    const status = await competitionSyncStatus();
    const last = status.lastAttemptAt ? +new Date(status.lastAttemptAt) : 0;
    if (last && Date.now() - last < MIN_INTERVAL_MS) {
      return NextResponse.json(
        { ok: true, skipped: true, reason: "too_soon", lastAttemptAt: status.lastAttemptAt, status },
        { headers: { "cache-control": "no-store" } },
      );
    }
  }

  const run = () => syncCompetitions();
  const result = running ?? run();
  running = result.finally(() => {
    running = null;
  });

  const outcome = await result;
  const status = await competitionSyncStatus();
  return NextResponse.json(
    { ok: outcome.ok, ...(outcome.ok ? { run: outcome.run } : { reason: outcome.reason, detail: outcome.detail }), status },
    { status: outcome.ok ? 200 : 409, headers: { "cache-control": "no-store" } },
  );
}
