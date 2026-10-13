/**
 * NEMO Sports · «حدّث المباريات الآن» — the response contract
 * ───────────────────────────────────────────────────────────
 * What a finished `matches` run means for the caller of
 * `GET /api/cron/update-matches`. Kept beside the route rather than inside it
 * because Next allows a route file to export only its handlers and config, and
 * because this decision is the one worth testing: it is the difference between
 * "matches were updated" and "matches were not updated, and here is why".
 *
 * The rule: `run.ok` (the runner's own verdict — no source errored and at least
 * one source completed) is the ONLY route to 200 / "success". Everything else
 * answers with a non-success status and carries `run.sources[].reason` or
 * `run.errors` so the human reading the alert can act on it.
 *
 *   200 success   every source that was supposed to run, ran
 *   207 partial   some sources updated, at least one failed
 *   500 error     no source was called at all (gate closed, source disabled,
 *                 unknown job) — nothing was updated, so nothing claims to be
 *   401 / 503     refused before the run (lib/cron-auth.ts)
 */
import type { JobRunSummary } from "@/lib/pipeline";

export type MatchUpdateOutcome = { http: number; body: Record<string, unknown> };

export function outcomeFor(run: JobRunSummary): MatchUpdateOutcome {
  const nothingRan = run.sources.length === 0 || run.sources.every((s) => s.status === "skipped");

  if (run.ok) {
    return {
      http: 200,
      body: { ok: true, status: "success", message: "Matches updated successfully", job: run.job, run },
    };
  }

  if (nothingRan) {
    // Every source was skipped (provider gate closed, source disabled), so no
    // provider was touched: that is not a partial update, it is no update.
    return {
      http: 500,
      body: {
        ok: false,
        status: "error",
        message: "Failed to update matches — no source was called",
        note: "every source was skipped; see run.sources[].reason",
        job: run.job,
        run,
      },
    };
  }

  return {
    http: 207,
    body: { ok: false, status: "partial", message: "Matches updated partially — see run.errors", job: run.job, run },
  };
}
