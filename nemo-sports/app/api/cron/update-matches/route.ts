import { NextResponse } from "next/server";
import { runJob } from "@/lib/pipeline";
import { outcomeFor } from "@/lib/matches-update";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/update-matches — «حدّث المباريات الآن».
 * ─────────────────────────────────────────────────────
 * OPEN by design: NO Bearer token, NO `?token=`, no other security condition.
 * Any visitor who opens the URL from a browser is processed directly: the
 * pipeline `matches` job runs (forced — no cadence wait) and the route answers
 * **200 OK** with the honest run summary from `outcomeFor` (`ok` / `status` /
 * `run`) in the body. An auth refusal can no longer come from this route; only
 * an unexpected server exception answers 500.
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
    return NextResponse.json(outcome.body, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, status: "error", message: e instanceof Error ? e.message : "Failed to update matches" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
