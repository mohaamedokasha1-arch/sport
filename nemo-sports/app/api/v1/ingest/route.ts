import { NextResponse } from "next/server";
import { ingestSport } from "@/lib/sdl-ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST/GET /api/v1/ingest — run one ingestion pass.
 *
 * Called by cron (§3.6 polling, §16 deployment) rather than by the frontend.
 * It is token-gated because it spends real provider quota: without a
 * configured secret the route refuses to run at all instead of accepting
 * anonymous requests that would burn a paid allowance.
 *
 * Cron cadence: vercel.json schedules it once per day because Vercel Hobby
 * deployments reject more frequent expressions. Live page freshness does NOT
 * depend on this — pages revalidate from SportScore on demand (30–300s TTLs)
 * — the cron keeps the durable canonical store (history/analytics) current.
 *
 * Auth accepts either secret, via Bearer header or ?token=:
 *  - NEMO_INGEST_TOKEN — manual/external schedulers
 *  - CRON_SECRET       — Vercel Cron sends `Authorization: Bearer
 *                        $CRON_SECRET` automatically on every cron hit
 *                        (vercel.json cron paths are NOT env-interpolated,
 *                        so the secret must ride the header, not the path).
 */

function expectedSecrets(): string[] {
  return [process.env.NEMO_INGEST_TOKEN, process.env.CRON_SECRET].filter((s): s is string => Boolean(s));
}

function authorize(request: Request): { ok: true } | { ok: false; status: 401 | 503; code: string; message: string } {
  const secrets = expectedSecrets();
  if (secrets.length === 0) {
    return { ok: false, status: 503, code: "not_configured", message: "NEMO_INGEST_TOKEN (or CRON_SECRET) is not set, so ingestion is disabled" };
  }
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const query = new URL(request.url).searchParams.get("token") ?? "";
  if (secrets.some((s) => s.length > 0 && (bearer === s || query === s))) return { ok: true };
  return { ok: false, status: 401, code: "unauthorized", message: "a valid bearer token (or ?token=) is required" };
}

function unauthorized(code: string, message: string, status: 401 | 503) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const a = authorize(request);
  if (!a.ok) return unauthorized(a.code, a.message, a.status);
  return runIngest(request.url);
}

export async function GET(request: Request) {
  const a = authorize(request);
  if (!a.ok) return unauthorized(a.code, a.message, a.status);
  return runIngest(request.url);
}

async function runIngest(url: string) {
  const sport = new URL(url).searchParams.get("sport") ?? "football";
  const report = await ingestSport(sport);
  // `report` already carries the discriminant; spreading it alone keeps the
  // body honest about which variant was produced.
  return NextResponse.json(report, {
    status: report.ok ? 200 : 409,
    headers: { "cache-control": "no-store" },
  });
}
