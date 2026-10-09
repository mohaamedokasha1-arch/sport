import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin-session";
import { validateEmbedUrl } from "@/lib/match-streams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Light rate limit for the validation endpoint (per process, per IP).
const hits = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_HITS = 30;

function clientKey(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * Validate an embed URL before preview/publish. Applies the safety checks
 * (https, no markup/script, no credentials, no private host) plus the ACTIVE
 * domain policy from lib/stream-policy.ts — by default `open`, meaning any
 * https host the operator enters is accepted. Used by the "معاينة" button in
 * /admin/live; the actual iframe is rendered client-side only after this check
 * passes. A `warning` may come back alongside `ok: true` (host outside the
 * reference list) — it is informational and never blocks.
 */
export async function POST(request: NextRequest) {
  try {
    await requirePermission("streams");
  } catch {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const key = clientKey(request);
  const nowMs = Date.now();
  const current = hits.get(key);
  if (current && current.resetAt > nowMs && current.count >= MAX_HITS) {
    return NextResponse.json(
      { ok: false, error: "محاولات كثيرة. انتظر دقيقة ثم أعد المحاولة." },
      { status: 429, headers: { "cache-control": "no-store" } },
    );
  }
  if (!current || current.resetAt <= nowMs) {
    hits.set(key, { count: 1, resetAt: nowMs + WINDOW_MS });
  } else {
    current.count += 1;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "طلب غير صالح" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  const url = typeof (body as { url?: unknown })?.url === "string" ? (body as { url: string }).url : "";
  if (!url || url.length > 1000) {
    return NextResponse.json(
      { ok: false, error: "رابط الـEmbed غير صالح." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  const result = validateEmbedUrl(url);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.reason },
      { status: 422, headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.json(
    { ok: true, reason: result.reason, host: result.host, policy: result.policy, warning: result.warning ?? undefined },
    { headers: { "cache-control": "no-store" } },
  );
}
