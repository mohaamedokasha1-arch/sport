import { NextResponse } from "next/server";
import { runJob, loadPipelineConfig, jobByName, pipelineStatus } from "@/lib/pipeline";
import { authorizeCron, cronRefusal } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/pipeline/{job} — scheduled ingestion tick.
 * ──────────────────────────────────────────────────────
 * One route for every job in `config/pipeline/endpoints.yml` (`competitions`,
 * `matches`, `standings`, `teams`, `players`, `bootstrap`). The cadence itself
 * lives in the registry and is enforced by the runner per source, so a
 * scheduler that fires too often costs almost nothing: the runner answers
 * `skipped: too soon` without touching a provider.
 *
 * The gate is the shared one (lib/cron-auth.ts: Bearer secret or `?token=`,
 * 503 when no secret is configured) — no cron surface gets to decide on its own
 * who may spend provider quota.
 *
 * Query parameters:
 *   force=1              ignore the cadence check
 *   dryRun=1             fetch + normalize + report, write nothing
 *   sources=a,b,c        restrict to some of the job's sources
 *   status=1             return the observability snapshot instead of running
 */

/** In-process single-flight: a double-scheduled cron must not double-fetch. */
const running = new Map<string, Promise<unknown>>();

export async function GET(request: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job: jobName } = await params;
  const url = new URL(request.url);

  if (!authorizeCron(request)) {
    const refusal = cronRefusal("NEMO_INGEST_TOKEN / CRON_SECRET is not set, so the pipeline is disabled");
    return NextResponse.json(refusal.body, { status: refusal.http, headers: { "cache-control": "no-store" } });
  }

  const cfg = loadPipelineConfig();
  const job = jobByName(cfg, jobName);
  if (!job) {
    return NextResponse.json(
      { ok: false, error: { code: "unknown_job", message: `no job «${jobName}» in config/pipeline/endpoints.yml`, jobs: cfg.jobs.map((j) => j.name) } },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  if (url.searchParams.get("status") === "1") {
    return NextResponse.json({ ok: true, status: await pipelineStatus(10) }, { headers: { "cache-control": "no-store" } });
  }

  const options = {
    trigger: "cron" as const,
    force: url.searchParams.get("force") === "1",
    dryRun: url.searchParams.get("dryRun") === "1",
    sources: (url.searchParams.get("sources") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };

  const previous = running.get(job.name);
  const run = previous ? previous.then(() => runJob(job.name, options)) : runJob(job.name, options);
  running.set(
    job.name,
    run.catch(() => undefined).finally(() => running.delete(job.name)),
  );

  const summary = (await run) as Awaited<ReturnType<typeof runJob>>;
  const requestedNothing = summary.sources.length === 0;
  return NextResponse.json(
    { ok: summary.ok, ...(requestedNothing ? { note: "every source was skipped — see sources[].reason" } : {}), run: summary },
    { status: summary.ok ? 200 : 207, headers: { "cache-control": "no-store" } },
  );
}
