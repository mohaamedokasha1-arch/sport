import { NextResponse } from "next/server";
import { syncCompetitions, competitionSyncStatus } from "@/lib/competition-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/sync-competitions — scheduled competition-catalog discovery.
 * ──────────────────────────────────────────────────────────────────────────
 * Asks every registered provider that documents a competition-listing endpoint
 * for its catalog and lands the rows in `provider_competitions`.
 *
 * It spends provider quota, so it is gated exactly like the other cron routes
 * (Bearer CRON_SECRET / NEMO_INGEST_TOKEN, or ?token=). With no secret
 * configured it refuses with 503 instead of running anonymously.
 *
 * It NEVER publishes anything. A discovered competition stays unpublished until
 * an operator decides it has real content — that decision lives in the admin
 * panel, not here. See lib/competition-sync.ts for the full contract.
 */

const MIN_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 h — a catalog changes by season, not by minute

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

/**
 * In-process single-flight guard. The news pipeline uses a Postgres advisory
 * lock; this job runs at most once a day and only ever inserts-or-updates, so a
 * duplicate run is idempotent rather than harmful — the guard exists to stop a
 * double-scheduled cron from spending quota twice in the same minute, not to
 * protect data integrity.
 */
let running: Promise<unknown> | null = null;

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
            : "NEMO_INGEST_TOKEN / CRON_SECRET is not set, so competition sync is disabled",
        },
      },
      { status: configured ? 401 : 503, headers: { "cache-control": "no-store" } },
    );
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
  const result = running ? running.then(() => syncCompetitions()) : run();
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
