/**
 * GET /api/v1/sportscore-relay/<endpoint>/?query…
 *   e.g. /api/v1/sportscore-relay/matches/?sport=football&limit=50
 *
 * Edge-runtime relay to the SportScore widget API. The endpoint rides the
 * PATH (exactly how SportscoreAdapter builds URLs: baseUrl + /<endpoint>/ +
 * query), so the adapter needs no special-casing — its default baseUrl on
 * Vercel simply points here.
 *
 * WHY THIS EXISTS: sportscore.com's edge protection 403s/challenges requests
 * arriving from Vercel serverless (Node/undici) ranges — verified live with
 * absent, bot and full browser User-Agents. Edge functions originate from a
 * different network and mostly pass.
 *
 * SOURCE PROTECTION IS PRESERVED: users never talk to SportScore directly —
 * this relay is part of OUR backend, consumed only by the SDL (two cache
 * layers + coalescing + rate limits sit in front of it), with an extra CDN
 * cache layer here (s-maxage=30).
 *
 * Security: strict single-segment allowlist (the 8 documented widget
 * endpoints), query passthrough, forced src=nemo-sports, JSON-only origin.
 */

export const runtime = "edge";

const ALLOWED = new Set([
  "matches",
  "match",
  "standings",
  "topscorers",
  "player",
  "team",
  "bracket",
  "tracker",
]);

export async function GET(request: Request, ctx: { params: Promise<{ path?: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  const segments = path ?? [];
  const endpoint = segments.length === 1 ? segments[0] : "";
  if (!ALLOWED.has(endpoint)) {
    return Response.json({ error: "endpoint not allowed" }, { status: 400 });
  }

  const incoming = new URL(request.url);
  const target = new URL(`https://sportscore.com/api/widget/${endpoint}/`);
  for (const [k, v] of incoming.searchParams.entries()) {
    if (k !== "src") target.searchParams.set(k, v);
  }
  target.searchParams.set("src", "nemo-sports");

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: {
        accept: "application/json",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
    });
  } catch {
    return Response.json({ error: "upstream unreachable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }

  // SportScore's bot page can arrive as HTML even with 200 — surface it as a
  // 502 so the SDL treats it as a transient failure (retry/stale) instead of
  // trying to parse it, and never caches it.
  const ctype = upstream.headers.get("content-type") ?? "";
  if (!ctype.includes("json")) {
    return Response.json(
      { error: "upstream challenged (non-JSON response)" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }

  const headers = new Headers({
    "content-type": ctype,
    // Cache successful JSON briefly (SportScore edge-caches 60s anyway);
    // failures never stick so recovery is immediate.
    "cache-control": upstream.ok ? "public, s-maxage=30, stale-while-revalidate=30" : "no-store",
  });
  return new Response(upstream.body, { status: upstream.status, headers });
}
