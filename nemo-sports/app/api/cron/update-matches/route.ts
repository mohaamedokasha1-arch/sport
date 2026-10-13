import { NextResponse } from "next/server";
import { GET as runPipeline } from "@/app/api/cron/pipeline/[job]/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Update matches immediately, retaining the existing cron authentication. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  // This endpoint always updates matches, rather than returning a status
  // snapshot, doing a dry run, or waiting for the normal polling cadence.
  const token = url.searchParams.get("token");
  url.search = "";
  url.searchParams.set("force", "1");
  if (token !== null) url.searchParams.set("token", token);

  try {
    const response = await runPipeline(
      new Request(url, { headers: request.headers }),
      { params: Promise.resolve({ job: "matches" }) },
    );
    // The pipeline uses 207 for partial failures; never report those as ok.
    if (response.status !== 200) return response;

    return NextResponse.json(
      { status: "ok" },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("Match update failed", error);
    return NextResponse.json(
      { status: "error" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
