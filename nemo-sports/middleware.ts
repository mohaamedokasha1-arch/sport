/**
 * NEMO Sports · edge middleware — the guard for the privileged namespaces.
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *   `app/api/v1/system/route.ts` has always documented that its protection is
 *   applied "by the middleware that owns the /admin and /api/v1/system
 *   namespaces, not here, so the route stays testable". That middleware did
 *   not exist, so both surfaces were reachable by anyone:
 *     · all nine /admin* routes answered 200 anonymously
 *     · /api/v1/system published Postgres/Redis configuration state, the
 *       unconfigured-provider list, live health/failover state, the cost
 *       ledger and internal log lines
 *   robots.txt disallowing /admin was never protection.
 *
 * WHAT IT GUARDS
 *   /admin, /admin/*        — the whole control panel
 *   /api/v1/system          — infrastructure diagnostics
 *
 * FAIL-CLOSED
 *   With no ADMIN_ACCESS_TOKEN configured the namespaces are DENIED, not
 *   opened. A forgotten environment variable must never mean "admin is
 *   public again" — that is the exact failure this file is here to prevent.
 *
 * RELATIONSHIP TO REAL AUTH (Phase 3)
 *   This is the interim gate. It authenticates an operator with a shared
 *   secret over HTTP Basic Auth and then issues a signed, httpOnly,
 *   SameSite=Lax cookie so the panel is usable without re-prompting on every
 *   navigation. When per-user accounts land (Auth.js + the users/roles tables
 *   in db/schema.sql), `isAuthorized` gains a session branch and the shared
 *   secret becomes a break-glass path; the matcher, the cookie plumbing and
 *   the fail-closed default all stay exactly as they are.
 */

import { NextResponse, type NextRequest } from "next/server";

export const config = {
  // Only the privileged namespaces. Everything public — including /api/v1/*
  // data routes, which are deliberately open — must stay out of this matcher
  // so the middleware never becomes a latency tax on the whole site.
  matcher: ["/admin/:path*", "/admin", "/api/v1/system"],
};

const COOKIE = "nemo_admin_session";
/** 12h — long enough for a working session, short enough to rotate daily. */
const MAX_AGE = 60 * 60 * 12;

/* ── signing ─────────────────────────────────────────────────────────────── */

/**
 * The signing key. Derived from the admin token itself so no second secret
 * has to be provisioned, and so revoking the token invalidates every issued
 * session cookie at once.
 */
async function signingKey(token: string): Promise<CryptoKey> {
  const enc = new TextEncoder().encode(`nemo-admin-session::${token}`);
  return crypto.subtle.importKey("raw", enc, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(token: string, payload: string): Promise<string> {
  const key = await signingKey(token);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(sig))}`;
}

async function verify(token: string, cookie: string): Promise<boolean> {
  const dot = cookie.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = cookie.slice(0, dot);
  try {
    // Recompute the signature over the cookie's own payload and compare, so a
    // tampered payload (a pushed-back expiry) can never validate.
    const expected = await sign(token, payload);
    const a = new TextEncoder().encode(expected);
    const b = new TextEncoder().encode(cookie);
    // Constant-time-ish compare: same length first, then XOR-accumulate.
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  } catch {
    return false;
  }
}

/** Session payload is just an expiry timestamp — no identity, no privileges. */
function freshPayload(): string {
  return String(Date.now() + MAX_AGE * 1000);
}

function notExpired(payload: string): boolean {
  const exp = Number(payload);
  return Number.isFinite(exp) && exp > Date.now();
}

/* ── basic auth ──────────────────────────────────────────────────────────── */

/**
 * Compare without short-circuiting on the first differing byte, so the token
 * cannot be probed one character at a time by measuring response latency.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

function credentialsFrom(request: NextRequest): { user: string; pass: string } | null {
  const header = request.headers.get("authorization") ?? "";
  if (!/^Basic\s+/i.test(header)) return null;
  try {
    const decoded = atob(header.replace(/^Basic\s+/i, "").trim());
    const sep = decoded.indexOf(":");
    if (sep < 0) return null;
    return { user: decoded.slice(0, sep), pass: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}

/* ── responses ───────────────────────────────────────────────────────────── */

/**
 * Deny. Deliberately a 404 rather than a 401/403 for the HTML surface: an
 * unauthenticated visitor should not learn that an admin panel exists at this
 * path. The API namespace keeps 401 so a legitimate operator with a wrong
 * secret gets an actionable answer instead of a mystery.
 */
function deny(request: NextRequest, token: string | undefined): NextResponse {
  const isApi = request.nextUrl.pathname.startsWith("/api/");

  // Unconfigured ⇒ fail closed. Say why, without opening the door.
  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "not_configured",
          message: isApi
            ? "ADMIN_ACCESS_TOKEN is not set, so this namespace is closed"
            : "Not found",
        },
      },
      {
        status: isApi ? 503 : 404,
        headers: { "cache-control": "no-store", ...securityHeaders() },
      },
    );
  }

  if (isApi) {
    return NextResponse.json(
      { ok: false, error: { code: "unauthorized", message: "valid admin credentials are required" } },
      {
        status: 401,
        headers: { "cache-control": "no-store", "www-authenticate": 'Basic realm="NEMO Admin", charset="UTF-8"', ...securityHeaders() },
      },
    );
  }

  return new NextResponse(
    "<!doctype html><meta charset=utf-8><title>404</title>" +
      "<body style=\"font:14px system-ui,sans-serif;display:grid;place-items:center;min-height:80vh;margin:0\">" +
      "<p>404 — الصفحة غير موجودة</p></body>",
    { status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", ...securityHeaders() } },
  );
}

/**
 * Baseline hardening for the privileged namespaces.
 *   frame-ancestors 'none' — the panel must never be framable (clickjacking).
 *   no-store everywhere — an authenticated admin response must never be
 *     written to a shared/CDN cache and served to the next visitor. This was
 *     the concrete risk behind the old `s-maxage=31536000` on /admin.
 */
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

/* ── entry point ─────────────────────────────────────────────────────────── */

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const token = process.env.ADMIN_ACCESS_TOKEN?.trim();

  // 1) An existing, unexpired, correctly-signed session cookie is enough.
  const cookie = request.cookies.get(COOKIE)?.value;
  if (token && cookie) {
    const dot = cookie.lastIndexOf(".");
    if (dot > 0 && notExpired(cookie.slice(0, dot)) && (await verify(token, cookie))) {
      return NextResponse.next({ headers: new Headers(securityHeaders()) });
    }
  }

  // 2) Otherwise try Basic Auth and, on success, issue the session cookie.
  const creds = credentialsFrom(request);
  if (token && creds && timingSafeEqual(creds.pass, token)) {
    const payload = freshPayload();
    const value = await sign(token, payload);
    const res = NextResponse.next({ headers: new Headers(securityHeaders()) });
    res.cookies.set(COOKIE, value, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: MAX_AGE,
    });
    return res;
  }

  return deny(request, token);
}
