import { requirePermission } from "@/lib/admin-session";
import { NextResponse } from "next/server";
import { runJob, loadPipelineConfig, jobByName } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/v1/pipeline/run — operator-initiated sync.
 * ───────────────────────────────────────────────────
 * Body: `{ job: string, sources?: string[], dryRun?: boolean, force?: boolean }`
 *
 * Guarded by the admin session + the `providers` permission, because a manual
 * run spends provider quota. `dryRun` is offered deliberately: an operator can
 * watch a source parse correctly before trusting it with a real write.
 */
export async function POST(request: Request) {
  try {
    await requirePermission("providers");
  } catch {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const input = (body ?? {}) as { job?: unknown; sources?: unknown; dryRun?: unknown; force?: unknown };
  const jobName = typeof input.job === "string" ? input.job : "";
  const cfg = loadPipelineConfig();
  if (!jobByName(cfg, jobName)) {
    return NextResponse.json(
      { ok: false, error: "unknown_job", jobs: cfg.jobs.map((j) => j.name) },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  const summary = await runJob(jobName, {
    trigger: "manual",
    sources: Array.isArray(input.sources) ? input.sources.filter((s): s is string => typeof s === "string") : [],
    dryRun: input.dryRun === true,
    force: input.force === true,
  });

  return NextResponse.json({ ok: summary.ok, run: summary }, { headers: { "cache-control": "no-store" } });
}
