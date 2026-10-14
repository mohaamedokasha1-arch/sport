/**
 * NEMO Sports · «حدّث المباريات الآن» — the response contract
 * ───────────────────────────────────────────────────────────
 * What a finished `matches` run means for the caller of
 * `GET /api/cron/update-matches`. Kept beside the route rather than inside it
 * because Next allows a route file to export only its handlers and config, and
 * because this decision is the one worth testing: it is the difference between
 * "matches were updated" and "matches were not updated, and here is why".
 *
 * The route is OPEN (no auth — any visitor may trigger it) and answers
 * **HTTP 200 for every visitor once the run finishes**; this function's
 * verdict travels in the response BODY (`ok` / `status` / `message` / `run`).
 *
 * The `http` field is now 200 on EVERY branch: a finished run is a finished
 * run, and the caller (a scheduler, a curl in a runbook, a visitor) acted
 * correctly. A 5xx said "your request was bad / the server is broken" while
 * the truth was "the run finished and updated nothing" — indistinguishable
 * from an unhandled crash, and it made monitoring noisy for a non-event.
 * Callers that still want to branch on the old codes can read `body.status`
 * (`success` / `partial` / `error`); the route uses `http` as-is.
 *
 * The rule: `run.ok` (the runner's own verdict — no source errored and at least
 * one source completed) is the ONLY route to a `"success"` body. Everything
 * else reports honestly what happened and why, and carries
 * `run.sources[].reason` or `run.errors` so the human reading the body can act
 * on it:
 *
 *   ok:true, "success"  every source that was supposed to run, ran
 *   "partial"           some sources updated, at least one failed
 *   "error"             no source was called at all (gate closed, source
 *                       disabled, unknown job) — nothing was updated, so
 *                       nothing claims to be. This is what an offline run
 *                       (no keys / no DB) reports, still with HTTP 200.
 */
import type { JobRunSummary } from "@/lib/pipeline";
import { sanitizeDbMessage } from "@/lib/db/sanitize";

export type MatchUpdateOutcome = { http: number; body: Record<string, unknown> };

/**
 * The answer when the run itself throws before it can report (the last
 * remaining way a caller could have seen a 500). It is still **200 OK**: the
 * request was served, and the honest reason travels in the body —
 * `error` carries the sanitised cause (`pg` echoes connection strings on some
 * failures, so it is scrubbed before it is returned), `run` is `null` because
 * there is no run summary to attach.
 */
export function failureOutcome(cause: unknown): MatchUpdateOutcome {
  const raw = cause instanceof Error ? cause.message : String(cause ?? "");
  return {
    http: 200,
    body: {
      ok: false,
      status: "error",
      message: "Failed to update matches",
      error: sanitizeDbMessage(raw) || "unknown failure",
      job: "matches",
      run: null,
    },
  };
}

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
    // Still HTTP 200 — the run completed and reported; the caller is a cron
    // hit or a visitor, and neither can act on a 5xx. The verdict is in `ok`.
    return {
      http: 200,
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
    http: 200,
    body: { ok: false, status: "partial", message: "Matches updated partially — see run.errors", job: run.job, run },
  };
}
