import { NextResponse } from "next/server";
import { ingestSport } from "@/lib/sdl-ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/v1/ingest   — run one ingestion pass.
 *
 * Called by cron (§3.6 polling, §16 deployment) rather than by the frontend.
 * It is token-gated because it spends real provider quota: without
 * `NEMO_INGEST_TOKEN` set, the route refuses to run at all instead of
 * accepting anonymous requests that would burn a paid allowance.
 */
export async function POST(request: Request) {
  const expected = process.env.NEMO_INGEST_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: { code: "not_configured", message: "NEMO_INGEST_TOKEN is not set, so ingestion is disabled" } },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (supplied !== expected) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "a valid bearer token is required" } },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const sport = new URL(request.url).searchParams.get("sport") ?? "football";
  const report = await ingestSport(sport);
  // `report` already carries the discriminant; spreading it alone keeps the
  // body honest about which variant was produced.
  return NextResponse.json(report, {
    status: report.ok ? 200 : 409,
    headers: { "cache-control": "no-store" },
  });
}
