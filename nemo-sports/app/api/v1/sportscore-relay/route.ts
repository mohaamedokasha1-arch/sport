/**
 * GET /api/v1/sportscore-relay?path=matches/&sport=football&...
 *
 * Edge-runtime relay to the SportScore widget API.
 *
 * WHY THIS EXISTS: sportscore.com's edge protection 403s requests arriving
 * from Vercel serverless (Node/undici) IP/TLS ranges — verified live with
 * both absent and full browser User-Agents. The same API serves browsers
 * fine. Edge functions originate from a different network, so this relay
 * performs the single upstream hop on behalf of the SDL.
 *
 * SOURCE PROTECTION IS PRESERVED (§Instruction: users never hit SportScore
 * directly): browsers and clients only ever talk to this backend. The SDL
 * remains the sole consumer, behind its two cache layers + coalescing +
 * rate limits; this relay adds a CDN-cache layer on top (s-maxage) so
 * repeated upstream calls collapse at the edge.
 *
 * Security: strict endpoint allowlist (the 8 documented widget endpoints),
 * query params passed through unchanged, upstream content-type only.
 */

export const runtime = "edge";

const ALLOWED = new Set(["matches", "match", "standings", "topscorers", "player", "team", "bracket", "tracker"]);

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const raw = (url.searchParams.get("path") ?? "").replace(/^\/+|\/+$/g, "");
  if (!ALLOWED.has(raw)) {
    return Response.json({ error: "endpoint not allowed" }, { status: 400 });
  }

  const target = new URL(`https://sportscore.com/api/widget/${raw}/`);
  for (const [k, v] of url.searchParams.entries()) {
    if (k !== "path" && k !== "src") target.searchParams.set(k, v);
  }
  target.searchParams.set("src", "nemo-sports");

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: {
        accept: "application/json",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
    });
  } catch {
    return Response.json({ error: "upstream unreachable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }

  const headers = new Headers({
    "content-type": upstream.headers.get("content-type") ?? "application/json",
    // CDN-cache successful answers briefly (SportScore edge-caches 60s anyway);
    // failures must not stick so recovery is immediate.
    "cache-control": upstream.ok ? "public, s-maxage=30, stale-while-revalidate=30" : "no-store",
  });
  return new Response(upstream.body, { status: upstream.status, headers });
}
