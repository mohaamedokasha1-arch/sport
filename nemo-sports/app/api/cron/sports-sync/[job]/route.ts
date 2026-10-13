import { NextResponse } from "next/server";
import { sdlContext } from "@/lib/sdl-gateway";
import { synchronize, nextDueJob } from "@/lib/sports-sync/service";
import { JOBS, CADENCE, type Job } from "@/lib/sports-sync/model";
import { getDb, sanitizeDbMessage } from "@/lib/db/pg";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ job: string }> }) {
  const secrets = [process.env.CRON_SECRET, process.env.NEMO_INGEST_TOKEN, process.env.VERCEL_CRON_SECRET].filter((s): s is string => Boolean(s));
  const url = new URL(request.url);
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("token") ?? "";
  if (!secrets.length || !secrets.includes(token)) return NextResponse.json({ ok: false, error: secrets.length ? "unauthorized" : "not_configured" }, { status: secrets.length ? 401 : 503 });
  const name = (await params).job;
  if (name === "status") {
    const db = await getDb();
    if (!db) return NextResponse.json({ ok: false, error: "no_database" }, { status: 503 });
    try {
      const [runs, states, issues, coverage] = await Promise.all([
        db.select("SELECT payload FROM sports_sync_runs ORDER BY started_at DESC LIMIT 20", []),
        db.select("SELECT job,payload FROM sports_sync_state", []),
        db.select("SELECT code,detail,observed_at FROM sports_sync_issues ORDER BY id DESC LIMIT 50", []),
        db.select("SELECT provider,kind,count(*)::int AS count,max((payload->>'lastSuccessAt')::timestamptz) AS last_success_at FROM sports_sync_records GROUP BY provider,kind", []),
      ]);
      const { sdl, missing } = await sdlContext();
      const providers = await Promise.all(sdl.registeredProviders().filter(p => p.name !== "demo").map(async p => ({ ...p, sports: sdl.provider(p.name)!.supportedSports, catalogSupported: p.capabilities.includes("competitions"), quota: await sdl.rateLimiter.usage(p.name) })));
      return NextResponse.json({ ok: true, runs, states, issues, coverage, providers, missing, cadenceSeconds: CADENCE }, { headers: { "cache-control": "no-store" } });
    } catch (e) { return NextResponse.json({ ok: false, error: sanitizeDbMessage(e instanceof Error ? e.message : String(e)) }, { status: 503 }); }
  }
  if (name !== "tick" && !JOBS.includes(name as Job)) return NextResponse.json({ ok: false, error: "unknown_job" }, { status: 400 });
  try {
    const job = name === "tick" ? await nextDueJob() : name as Job;
    if (!job) return NextResponse.json({ ok: true, skipped: true, reason: "nothing_due" });
    const run = await synchronize(job, url.searchParams.get("force") === "1");
    return NextResponse.json({ ok: run.status === "success", run }, { status: run.status === "failed" ? 502 : run.status === "partial" ? 207 : run.status === "skipped" ? 409 : 200, headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: sanitizeDbMessage(e instanceof Error ? e.message : String(e)) }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
