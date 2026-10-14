import { NextResponse } from "next/server";
import { runJob } from "@/lib/pipeline";
import { failureOutcome, outcomeFor } from "@/lib/matches-update";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const NO_STORE = { "cache-control": "no-store" } as const;

/**
 * GET /api/cron/update-matches — «حدّث المباريات الآن».
 * ─────────────────────────────────────────────────────
 * OPEN by design: NO Bearer token, NO `?token=`, no other security condition.
 * Any visitor who opens the URL from a browser is processed directly: the
 * pipeline `matches` job runs (forced — no cadence wait) and the route answers
 * **200 OK** with the honest run summary from `outcomeFor` (`ok` / `status` /
 * `run`) in the body.
 *
 * Two failure modes that used to answer 500 are handled:
 *
 *   1. a database whose canonical tables were never created
 *      (`relation "sports" does not exist`) — the pipeline bootstraps the
 *      schema before it writes (`lib/db/canonical-schema.ts`) and, if the
 *      database still refuses, reports that inside the run summary instead of
 *      throwing;
 *   2. any other unexpected exception — caught below, never returned raw
 *      (the message is sanitised: `pg` echoes connection strings), and still
 *      answered 200 with `ok:false` so a scheduler sees a completed request
 *      and the reason, not a bare `Internal Server Error`.
 *
 * The status line therefore always means "the request completed"; what the run
 * achieved is in `ok` / `status` / `run.errors`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const run = await runJob("matches", {
      trigger: "cron",
      force: true,
      dryRun: url.searchParams.get("dryRun") === "1",
      sources: (url.searchParams.get("sources") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    });
    const outcome = outcomeFor(run);
    // Any visitor → 200 OK after the run; the body carries the real verdict.
    return NextResponse.json(outcome.body, { status: 200, headers: NO_STORE });
  } catch (e) {
    console.error("[cron] update-matches: unexpected failure:", e instanceof Error ? e.stack ?? e.message : e);
    const outcome = failureOutcome(e);
    // Still 200: the request completed and the reason is in the body — never a
    // raw 500 with a database message (and never a credential in it).
    return NextResponse.json(outcome.body, { status: outcome.http, headers: NO_STORE });
  }
}
