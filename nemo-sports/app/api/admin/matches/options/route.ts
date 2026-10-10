import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-session";
import { listAdminMatches } from "@/lib/admin-matches";
import { fixtures as sdlFixtures, liveMatches as sdlLiveMatches } from "@/lib/sdl-gateway";
import { hasMatchIdentity } from "@/lib/sdl-gateway";
import { isLiveStatus } from "@/lib/match-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface MatchOption {
  id: string;
  slug: string;
  home: string;
  away: string;
  homeLogo: string;
  awayLogo: string;
  competition: string;
  competitionSlug: string;
  kickoff: string;
  sport: string;
  status: string;
  source: "admin" | "provider";
  published: boolean;
}

/**
 * Searchable match list for the live-stream form's match picker.
 * Returns admin-managed matches plus the current provider feed (football).
 * Gated: any operator who can manage streams/matches (middleware + here).
 */
export async function GET(request: NextRequest) {
  try {
    await requirePermission("streams");
  } catch {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();

  const [adminMatches, feed, live] = await Promise.all([
    listAdminMatches({ limit: 200 }),
    sdlFixtures({ sport: "football" }).catch(() => null),
    sdlLiveMatches("football").catch(() => null),
  ]);

  const items: MatchOption[] = [];

  for (const m of adminMatches) {
    items.push({
      id: m.id,
      slug: m.slug,
      home: m.homeName,
      away: m.awayName,
      homeLogo: m.homeLogo,
      awayLogo: m.awayLogo,
      competition: m.competitionName || m.competitionSlug,
      competitionSlug: m.competitionSlug,
      kickoff: m.scheduledAt,
      sport: m.sport,
      status: m.status,
      source: "admin",
      published: m.isPublished,
    });
  }

  const seen = new Set(items.map((i) => i.slug));
  const providerFixtures = [
    ...(feed && feed.ok ? feed.data : []),
    ...(live && live.ok ? live.data : []),
  ];
  for (const f of providerFixtures) {
    if (!f.providerId || seen.has(f.providerId) || !hasMatchIdentity(f)) continue;
    seen.add(f.providerId);
    items.push({
      id: f.providerId,
      slug: f.providerId,
      home: f.homeName ?? f.homeProviderId ?? "",
      away: f.awayName ?? f.awayProviderId ?? "",
      homeLogo: f.homeLogoUrl ?? "",
      awayLogo: f.awayLogoUrl ?? "",
      competition: f.competitionName ?? f.competitionProviderId ?? "",
      competitionSlug: f.competitionProviderId ?? "",
      kickoff: f.scheduledAt,
      sport: f.sport,
      status: f.status,
      source: "provider",
      published: true,
    });
  }

  const filtered = q
    ? items.filter((i) => `${i.home} ${i.away} ${i.competition} ${i.slug}`.toLowerCase().includes(q))
    : items;

  // Live first, then upcoming by kickoff, then the rest.
  const rank = (i: MatchOption) =>
    isLiveStatus(i.status) ? 0
      : i.status === "scheduled" || i.status === "upcoming" ? 1
        : 2;
  filtered.sort((a, b) => rank(a) - rank(b) || +new Date(a.kickoff) - +new Date(b.kickoff));

  return NextResponse.json(
    { ok: true, count: filtered.length, items: filtered.slice(0, 120) },
    { headers: { "cache-control": "no-store" } },
  );
}
