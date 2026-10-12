import { NextResponse } from "next/server";
import { runJob, loadPipelineConfig, jobByName, pipelineStatus } from "@/lib/pipeline";

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
 * Auth mirrors `/api/cron/sync-competitions` exactly (Bearer secret or
 * `?token=`, 503 when no secret is configured) — the two cron surfaces must not
 * disagree about who may spend provider quota.
 *
 * Query parameters:
 *   force=1              ignore the cadence check
 *   dryRun=1             fetch + normalize + report, write nothing
 *   sources=a,b,c        restrict to some of the job's sources
 *   status=1             return the observability snapshot instead of running
 */
function expectedSecrets(): string[] {
  return [process.env.NEMO_INGEST_TOKEN, process.env.CRON_SECRET, process.env.VERCEL_CRON_SECRET].filter((s): s is string => Boolean(s));
}

function authorize(request: Request): boolean {
  const secrets = expectedSecrets();
  if (secrets.length === 0) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const query = new URL(request.url).searchParams.get("token") ?? "";
  return secrets.some((s) => s.length > 0 && (bearer === s || query === s));
}

/** In-process single-flight: a double-scheduled cron must not double-fetch. */
const running = new Map<string, Promise<unknown>>();

export async function GET(request: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job: jobName } = await params;
  const url = new URL(request.url);

  if (!authorize(request)) {
    const configured = expectedSecrets().length > 0;
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: configured ? "unauthorized" : "not_configured",
          message: configured
            ? "a valid bearer token (or ?token=) is required"
            : "NEMO_INGEST_TOKEN / CRON_SECRET is not set, so the pipeline is disabled",
        },
      },
      { status: configured ? 401 : 503, headers: { "cache-control": "no-store" } },
    );
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
