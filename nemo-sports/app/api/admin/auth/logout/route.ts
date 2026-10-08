import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/admin-auth-shared";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest) {
  // Record who is leaving before the cookie is cleared (best effort —
  // logging must never block a logout).
  try {
    const store = await cookies();
    const session = await verifyAdminSession(store.get(ADMIN_COOKIE)?.value);
    if (session) {
      await logActivity({
        action: "auth.logout",
        entityType: "auth",
        actor: session.userId === "env" ? "env" : session.userId,
        role: session.role,
      });
    }
  } catch {
    // ignore
  }
  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  response.cookies.delete(ADMIN_COOKIE);
  return response;
}
