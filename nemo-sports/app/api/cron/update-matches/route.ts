import { NextResponse } from "next/server";
import { runJob } from "@/lib/pipeline";
import { authorizeCron, cronRefusal } from "@/lib/cron-auth";
import { outcomeFor } from "@/lib/matches-update";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/update-matches — «حدّث المباريات الآن».
 * ─────────────────────────────────────────────────────
 * Previously this route answered `200 {status:"success"}` to ANY caller
 * without running anything: an unauthenticated fake-success that made
 * schedulers and operators believe matches were updating when nothing
 * had run. It now goes through the shared cron gate (lib/cron-auth.ts)
 * and actually runs the pipeline `matches` job; the response contract is
 * lib/matches-update.ts (`outcomeFor`): 200 only when the run succeeded,
 * 207 for a partial run, 500 when no source was called at all.
 */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    const refusal = cronRefusal("NEMO_INGEST_TOKEN / CRON_SECRET is not set, so match updates are disabled");
    return NextResponse.json(refusal.body, { status: refusal.http, headers: { "cache-control": "no-store" } });
  }
  const url = new URL(request.url);
  try {
    const run = await runJob("matches", {
      trigger: "cron",
      force: url.searchParams.get("force") === "1",
      dryRun: url.searchParams.get("dryRun") === "1",
      sources: (url.searchParams.get("sources") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    });
    const outcome = outcomeFor(run);
    return NextResponse.json(outcome.body, { status: outcome.http, headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, status: "error", message: e instanceof Error ? e.message : "Failed to update matches" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
