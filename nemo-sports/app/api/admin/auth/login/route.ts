import { NextRequest, NextResponse } from "next/server";
import { verifyAdminCredentials, adminLoginConfigured } from "@/lib/admin-auth";
import { ADMIN_COOKIE, adminCookieOptions, createAdminSession } from "@/lib/admin-auth-shared";
import { touchLastLogin, verifyUserCredentials } from "@/lib/admin-users";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const failures = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

function clientKey(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const current = failures.get(key);
  if (!current || current.resetAt <= now) {
    failures.delete(key);
    return false;
  }
  return current.count >= MAX_FAILURES;
}

function recordFailure(key: string): void {
  const now = Date.now();
  const current = failures.get(key);
  if (!current || current.resetAt <= now) {
    failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    current.count += 1;
  }
}

function clearFailures(key: string): void {
  failures.delete(key);
}

export async function POST(request: NextRequest) {
  const key = clientKey(request);
  if (rateLimited(key)) {
    return NextResponse.json(
      { ok: false, error: "محاولات كثيرة. حاول مجددًا بعد دقائق." },
      { status: 429, headers: { "retry-after": "900", "cache-control": "no-store" } },
    );
  }

  if (!adminLoginConfigured()) {
    return NextResponse.json(
      { ok: false, error: "لم تُهيّأ بيانات دخول لوحة التحكم بعد." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "طلب غير صالح." }, { status: 400 });
  }

  const input = body as { username?: unknown; password?: unknown };
  const username = typeof input.username === "string" ? input.username.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!username || !password || username.length > 128 || password.length > 256) {
    recordFailure(key);
    return NextResponse.json({ ok: false, error: "اسم المستخدم وكلمة المرور مطلوبان." }, { status: 400 });
  }

  // 1) user directory (bcrypt-hashed accounts, RBAC roles)
  const user = await verifyUserCredentials(username, password).catch(() => null);
  // 2) legacy env credentials (ADMIN_USERNAME/ADMIN_PASSWORD_HASH or the
  //    break-glass ADMIN_ACCESS_TOKEN) — kept for existing deployments.
  const legacyOk = user ? false : await verifyAdminCredentials(username, password);

  if (!user && !legacyOk) {
    recordFailure(key);
    // Keep the error deliberately generic so the username cannot be
    // enumerated from this endpoint.
    return NextResponse.json({ ok: false, error: "بيانات الدخول غير صحيحة." }, { status: 401 });
  }

  const sessionUser = user
    ? { id: user.id, role: user.role }
    : { id: "env", role: "super_admin" };

  const session = await createAdminSession(sessionUser);
  if (!session) {
    return NextResponse.json({ ok: false, error: "تعذر إنشاء جلسة آمنة." }, { status: 503 });
  }

  if (user) await touchLastLogin(user.id);
  clearFailures(key);
  await logActivity({
    action: "auth.login",
    entityType: "auth",
    actor: user?.username ?? username,
    role: sessionUser.role,
    after: { via: user ? "users" : "env" },
  });

  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  response.cookies.set(ADMIN_COOKIE, session, adminCookieOptions(request.nextUrl.protocol === "https:"));
  return response;
}
