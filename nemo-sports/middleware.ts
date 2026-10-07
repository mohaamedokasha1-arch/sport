/**
 * NEMO Sports · privileged namespace guard.
 *
 * The panel is closed by default. Operators can sign in with the configured
 * username/password hash at /admin/login, while ADMIN_ACCESS_TOKEN remains a
 * break-glass Basic Auth path for existing deployments. Every successful
 * login receives the same short-lived, HMAC-signed httpOnly cookie; no
 * password or token is ever copied into the browser.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_COOKIE,
  adminAuthConfigured,
  adminCookieOptions,
  createAdminSession,
  verifyAdminSession,
} from "@/lib/admin-auth-shared";

export const config = {
  matcher: [
    "/admin/:path*",
    "/admin",
    "/api/v1/system",
    "/api/admin/:path*",
  ],
};

function securityHeaders(): Record<string, string> {
  return {
    "cache-control": "no-store, max-age=0",
    "content-security-policy":
      "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  };
}

function credentialsFrom(request: NextRequest): { user: string; pass: string } | null {
  const header = request.headers.get("authorization") ?? "";
  if (!/^Basic\s+/i.test(header)) return null;
  try {
    const decoded = atob(header.replace(/^Basic\s+/i, "").trim());
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return { user: decoded.slice(0, separator), pass: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}

function sameSecret(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

function isLoginEndpoint(request: NextRequest): boolean {
  const path = request.nextUrl.pathname;
  return path === "/admin/login" || path === "/api/admin/auth/login" || path === "/api/admin/auth/logout";
}

function deny(request: NextRequest): NextResponse {
  const isApi = request.nextUrl.pathname.startsWith("/api/");
  const configured = adminAuthConfigured();

  if (isApi) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: configured ? "unauthorized" : "not_configured",
          message: configured ? "valid admin credentials are required" : "admin access is not configured",
        },
      },
      {
        status: configured ? 401 : 503,
        headers: {
          ...(configured ? { "www-authenticate": 'Basic realm="NEMO Admin", charset="UTF-8"' } : {}),
          ...securityHeaders(),
        },
      },
    );
  }

  // Do not advertise the panel to anonymous crawlers or scanners.
  return new NextResponse(
    "<!doctype html><meta charset=utf-8><title>404</title>" +
      "<body style=\"font:14px system-ui,sans-serif;display:grid;place-items:center;min-height:80vh;margin:0\">" +
      "<p>404 — الصفحة غير موجودة</p></body>",
    {
      status: 404,
      headers: {
        "content-type": "text/html; charset=utf-8",
        ...securityHeaders(),
      },
    },
  );
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  // The login screen and its two auth endpoints must be reachable before a
  // session exists. They still perform their own validation and are never
  // allowed to read or mutate admin data.
  if (isLoginEndpoint(request)) {
    const response = NextResponse.next({ headers: new Headers(securityHeaders()) });
    if (request.nextUrl.pathname === "/admin/login" && !adminAuthConfigured()) {
      response.headers.set("cache-control", "no-store, max-age=0");
    }
    return response;
  }

  const cookie = request.cookies.get(ADMIN_COOKIE)?.value;
  if (await verifyAdminSession(cookie)) {
    return NextResponse.next({ headers: new Headers(securityHeaders()) });
  }

  // Backwards-compatible break-glass login. Only the token is accepted here;
  // a bcrypt hash must be submitted through the login form because bcrypt is a
  // Node-only dependency and middleware runs on the Edge runtime.
  const accessToken = process.env.ADMIN_ACCESS_TOKEN?.trim();
  const credentials = credentialsFrom(request);
  if (accessToken && credentials && sameSecret(credentials.pass, accessToken)) {
    const value = await createAdminSession();
    if (value) {
      const response = NextResponse.next({ headers: new Headers(securityHeaders()) });
      response.cookies.set(ADMIN_COOKIE, value, adminCookieOptions(request.nextUrl.protocol === "https:"));
      return response;
    }
  }

  return deny(request);
}
