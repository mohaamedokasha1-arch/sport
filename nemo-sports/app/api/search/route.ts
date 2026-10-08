import { NextResponse } from "next/server";
import { searchEntities } from "@/lib/search-service";
import { demoContentVisible } from "@/lib/site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const query = new URL(req.url).searchParams.get("q") ?? "";
  if (query.trim().length < 2) {
    return NextResponse.json(
      { query: query.trim(), preview: demoContentVisible(), total: 0, counts: { فريق: 0, لاعب: 0, بطولة: 0, مباراة: 0, خبر: 0 }, results: [] },
      { headers: { "cache-control": "private, max-age=0, no-store" } },
    );
  }

  try {
    const response = await searchEntities(query);
    return NextResponse.json(response, {
      headers: { "cache-control": "private, max-age=0, no-store" },
    });
  } catch {
    // Search is an enhancement: a temporary upstream failure should leave the
    // rest of the public site usable and produce a helpful empty result.
    return NextResponse.json(
      { query: query.trim().slice(0, 120), preview: demoContentVisible(), total: 0, counts: { فريق: 0, لاعب: 0, بطولة: 0, مباراة: 0, خبر: 0 }, results: [] },
      { headers: { "cache-control": "private, max-age=0, no-store" } },
    );
  }
}
