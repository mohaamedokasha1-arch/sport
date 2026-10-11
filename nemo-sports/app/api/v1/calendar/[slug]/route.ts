import { matchDetail, hasMatchIdentity, sportForMatchId } from "@/lib/sdl-gateway";
import { matchCalendar } from "@/lib/calendar";
import { SITE_URL } from "@/lib/site";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slug || slug.length > 160 || /[\r\n\x00]/.test(slug)) return Response.json({ error: "Invalid match ID" }, { status: 400 });
  // The page offers this .ics for every sport it links to; resolve the sport
  // from the id instead of assuming football (which 404'd basketball matches).
  const sport = (await sportForMatchId(slug)) ?? "football";
  const result = await matchDetail(sport, slug);
  if (!result.ok) return Response.json({ error: "Match unavailable" }, { status: result.error.kind === "not_found" ? 404 : 503 });
  if (result.source === "demo" || !hasMatchIdentity(result.data)) return Response.json({ error: "No verified fixture" }, { status: 404 });
  if (result.stale || !["scheduled", "cancelled"].includes(result.data.status)) return Response.json({ error: "No current scheduled kickoff. Check the match page for postponements or changes." }, { status: 409 });
  return new Response(matchCalendar(result.data, SITE_URL, result.fetchedAt), { headers: {
    "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="nemo-match.ics"',
    "cache-control": "no-store", "x-content-type-options": "nosniff",
  } });
}
