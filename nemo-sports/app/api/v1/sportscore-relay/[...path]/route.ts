/** Bounded compatibility relay. Does not evade upstream access controls.
 * Disabled unless explicitly enabled by an operator with permission to use it.
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
  if (process.env.NEMO_SPORTSCORE_RELAY_ENABLED !== "1") {
    return Response.json({ error: "relay not enabled" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  const { path } = await ctx.params;
  const segments = path ?? [];
  const endpoint = segments.length === 1 ? segments[0] : "";
  if (!ALLOWED.has(endpoint)) {
    return Response.json({ error: "endpoint not allowed" }, { status: 400 });
  }

  const incoming = new URL(request.url);
  if (incoming.search.length > 2048) return Response.json({ error: "query too long" }, { status: 400 });
  const target = new URL(`https://sportscore.com/api/widget/${endpoint}/`);
  for (const [k, v] of incoming.searchParams.entries()) {
    if (k !== "src") target.searchParams.set(k, v);
  }
  target.searchParams.set("src", "nemo-sports");

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      signal: AbortSignal.timeout(8000),
      redirect: "error",
      headers: {
        accept: "application/json",
        "user-agent":
          "NEMO-Sports/1.0",
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
