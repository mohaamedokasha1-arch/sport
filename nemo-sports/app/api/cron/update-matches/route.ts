import { NextResponse } from "next/server";
import { runJob, type JobRunSummary } from "@/lib/pipeline";
import { authorizeCron, cronRefusal } from "@/lib/cron-auth";
import { outcomeFor } from "@/lib/matches-update";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/update-matches — «حدّث المباريات الآن».
 * ───────────────────────────────────────────────────
 * The immediate refresh surface for schedulers that cannot wait for the cadence
 * in `config/pipeline/endpoints.yml`: a VPS crontab, a manual curl after a
 * postponement, or a wrapper that only speaks one URL.
 *
 * Contract, deliberately narrow:
 *   · it ALWAYS runs the `matches` job with `force: true` — no status snapshot,
 *     no dry run, no cadence check. Those live on `/api/cron/pipeline/[job]`
 *     (`?status=1`, `?dryRun=1`, `?sources=`) where the full parameter set is;
 *   · it spends provider quota, so it is gated like every cron surface
 *     (lib/cron-auth.ts: Bearer / `?token=`, 503 with no secret configured);
 *   · **it never reports success for work it did not do.** The mapping lives in
 *     lib/matches-update.ts, where it is tested: a job whose sources were all
 *     skipped is a failure carrying the reason, not a 200. A handler whose
 *     `try` block awaits nothing can never keep that promise — it cannot fail,
 *     so its `catch` is unreachable and its success message is a claim it has
 *     no evidence for.
 */
const JOB = "matches";

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** In-process single-flight: a double-scheduled cron must not double-fetch. */
let inFlight: Promise<JobRunSummary> | null = null;

async function updateMatches(): Promise<JobRunSummary> {
  const shared = inFlight;
  if (shared) return shared;
  const started = runJob(JOB, { trigger: "cron", force: true });
  inFlight = started;
  try {
    return await started;
  } finally {
    if (inFlight === started) inFlight = null;
  }
}

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    const refusal = cronRefusal("NEMO_INGEST_TOKEN / CRON_SECRET is not set, so match updates are disabled");
    return json({ ...refusal.body, status: "error" }, refusal.http);
  }

  try {
    const run = await updateMatches();
    const outcome = outcomeFor(run);
    return json(outcome.body, outcome.http);
  } catch (error) {
    // `runJob` swallows per-source failures, so reaching here means the run
    // could not even be attempted — a broken registry (PipelineConfigError) or
    // an unexpected fault. Log the real cause, answer honestly, claim nothing.
    console.error("Match update failed", error);
    return json({ ok: false, status: "error", message: "Failed to update matches" }, 500);
  }
}
