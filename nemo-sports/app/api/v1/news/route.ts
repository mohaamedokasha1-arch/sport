import { NextResponse } from "next/server";
import { getNewsFeed } from "@/lib/news/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/news — public news feed (ingested RSS metadata).
 * ───────────────────────────────────────────────────────────
 * Query: ?category=&team=&player=&competition=&limit=&offset=
 * Serves cached feed instantly; triggers a coalesced background refresh when
 * stale. Articles are metadata + snippet + original link — never full bodies.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams;
  for (const [key, value] of q) {
    if (value.length > 160 || (["limit", "offset"].includes(key) && (!/^\d+$/.test(value) || Number(value) > 10000))) return NextResponse.json({ ok: false, error: "Invalid query" }, { status: 400 });
  }
  const limit = Math.min(100, Math.max(1, Number(q.get("limit") ?? 24) || 24));
  const offset = Math.max(0, Number(q.get("offset") ?? 0) || 0);

  try {
    const feed = await getNewsFeed({
      ...(q.get("category") ? { category: q.get("category")! } : {}),
      ...(q.get("team") ? { team: q.get("team")! } : {}),
      ...(q.get("player") ? { player: q.get("player")! } : {}),
      ...(q.get("competition") ? { competition: q.get("competition")! } : {}),
      limit,
      offset,
    });

    return NextResponse.json(
      {
        ok: true,
        data: feed.items.map((a) => ({
          id: a.id,
          title: a.title,
          sourceUrl: a.sourceUrl,
          sourceName: a.sourceName,
          sourceDomain: a.sourceDomain,
          publicationDate: a.publicationDate,
          description: a.description,
          category: a.category,
          secondaryCategories: a.secondaryCategories,
          relatedEntities: a.relatedEntities,
          sourceBadge: a.sourceBadge,
        })),
        meta: {
          total: feed.total,
          limit,
          offset,
          lastUpdated: feed.lastUpdated,
          stale: feed.stale,
          categories: feed.categories,
          notice: "metadata + snippet only — read full articles at the original publisher",
        },
      },
      {
        status: 200,
        headers: {
          // CDN-cacheable briefly; staleness is disclosed in-body.
          "cache-control": feed.stale ? "no-store" : "public, s-maxage=60",
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: { code: "news_unavailable", message: "News temporarily unavailable" } },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
