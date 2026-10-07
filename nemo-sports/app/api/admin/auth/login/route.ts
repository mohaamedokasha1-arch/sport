import { NextRequest, NextResponse } from "next/server";
import { verifyAdminCredentials, adminLoginConfigured } from "@/lib/admin-auth";
import { ADMIN_COOKIE, adminCookieOptions, createAdminSession } from "@/lib/admin-auth-shared";

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

  const valid = await verifyAdminCredentials(username, password);
  if (!valid) {
    recordFailure(key);
    // Keep the error deliberately generic so the username cannot be
    // enumerated from this endpoint.
    return NextResponse.json({ ok: false, error: "بيانات الدخول غير صحيحة." }, { status: 401 });
  }

  const session = await createAdminSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "تعذر إنشاء جلسة آمنة." }, { status: 503 });
  }

  clearFailures(key);
  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  response.cookies.set(ADMIN_COOKIE, session, adminCookieOptions(request.nextUrl.protocol === "https:"));
  return response;
}
