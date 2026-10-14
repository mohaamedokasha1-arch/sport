import { NextResponse } from "next/server";
import { authorizeCron, cronRefusal } from "@/lib/cron-auth";
import { discoveryDates, runFixtureDiscovery } from "@/lib/fixture-discovery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/discover-fixtures — universal fixture/competition discovery.
 * ─────────────────────────────────────────────────────────────────────────
 * Asks every registered fixtures-capable SDL provider for complete
 * calendar days (today, tomorrow, the day after by default; `?from=&to=`
 * or `?date=` for any other window a provider serves) and reports what
 * was actually found: unique fixtures after cross-source de-duplication,
 * competitions observed for the first time, conflicts, and — separately —
 * every provider/date that failed. A failure never reports success, and
 * HTTP 200 requires at least one provider to have answered.
 *
 * This route proves coverage; durable synchronisation remains the job of
 * /api/cron/sports-sync/<job> (catalog/seasons/upcoming/live/…).
 *
 * Query: ?date=YYYY-MM-DD · ?from=&to= · ?daysBefore=&daysAfter= ·
 *        ?sport=football|all (default football; `all` = every supported sport)
 */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    const refusal = cronRefusal("NEMO_INGEST_TOKEN / CRON_SECRET is not set, so fixture discovery is disabled");
    return NextResponse.json(refusal.body, { status: refusal.http, headers: { "cache-control": "no-store" } });
  }
  const url = new URL(request.url);
  try {
    const single = url.searchParams.get("date");
    const dates = single
      ? discoveryDates({ from: single, to: single })
      : discoveryDates({
          from: url.searchParams.get("from") ?? undefined,
          to: url.searchParams.get("to") ?? undefined,
          daysBefore: Number(url.searchParams.get("daysBefore") ?? 1) || 0,
          daysAfter: Number(url.searchParams.get("daysAfter") ?? 2) || 0,
        });
    const sportParam = url.searchParams.get("sport") ?? "football";
    const run = await runFixtureDiscovery({
      dates,
      sports: sportParam === "all" ? ["football", "basketball", "tennis", "cricket"] : [sportParam],
    });
    const { fixtures, ...summary } = run;
    void fixtures;
    const ok = run.perProvider.length > 0;
    return NextResponse.json(
      { ok, run: summary },
      { status: ok ? (run.errors.length ? 207 : 200) : 502, headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: { code: "bad_request", message: e instanceof Error ? e.message : String(e) } },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
}
