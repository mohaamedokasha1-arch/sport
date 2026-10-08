/**
 * Edge-safe primitives shared by the admin middleware and the Node login route.
 *
 * The cookie is an HMAC-signed, expiring JSON payload carrying the operator
 * identity and role — never a bearer copy of a password. Rotating any
 * configured admin secret invalidates all existing sessions without a
 * database round-trip.
 *
 * Format:  base64url({ u: userId, r: role, e: expiryMs }) . base64url(HMAC)
 * Legacy cookies (a bare numeric expiry) are still accepted and map to the
 * break-glass "env" operator with the super_admin role, so existing
 * deployments are not logged out by this change.
 */

export const ADMIN_COOKIE = "nemo_admin_session";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 12;

/** Break-glass identity used by ADMIN_ACCESS_TOKEN / legacy sessions. */
export const ENV_OPERATOR_ID = "env";

/**
 * Route prefixes reserved for the super_admin role (users & site settings,
 * including their API routes). The middleware gates these by the role
 * embedded in the signed session cookie; server actions re-check against
 * the live user directory (lib/admin-session.ts).
 */
export const SUPER_ADMIN_ONLY_PREFIXES = [
  "/admin/users",
  "/admin/settings",
  "/api/admin/users",
  "/api/admin/settings",
] as const;

export function isSuperAdminOnlyPath(pathname: string): boolean {
  return SUPER_ADMIN_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export interface AdminSession {
  userId: string;
  role: string;
  expiresAt: number;
}

export function adminAuthConfigured(): boolean {
  return Boolean(
    process.env.ADMIN_ACCESS_TOKEN?.trim() ||
      (process.env.ADMIN_USERNAME?.trim() && process.env.ADMIN_PASSWORD_HASH?.trim()),
  );
}

export function sessionSecret(): string | null {
  const secret =
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.ADMIN_ACCESS_TOKEN?.trim() ||
    process.env.ADMIN_PASSWORD_HASH?.trim();
  return secret || null;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function signature(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`nemo-admin-session::${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64Url(new Uint8Array(signed));
}

/** Create a signed, expiring session cookie value for one operator. */
export async function createAdminSession(
  user: { id: string; role: string },
  now = Date.now(),
): Promise<string | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  const expiresAt = now + ADMIN_SESSION_MAX_AGE * 1000;
  const payloadObject = { u: user.id, r: user.role, e: expiresAt };
  const payload = base64Url(new TextEncoder().encode(JSON.stringify(payloadObject)));
  return `${payload}.${await signature(secret, payload)}`;
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i]! ^ right[i]!;
  return diff === 0;
}

/**
 * Validate the signature and expiry without revealing the secret.
 * Returns the embedded identity, or null for a missing/invalid/expired
 * cookie.
 */
export async function verifyAdminSession(value: string | undefined, now = Date.now()): Promise<AdminSession | null> {
  const secret = sessionSecret();
  if (!secret || !value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  const given = value.slice(dot + 1);

  let expected: string;
  try {
    expected = await signature(secret, payload);
  } catch {
    return null;
  }
  if (!constantTimeEqual(expected, given)) return null;

  // New format: base64url JSON payload.
  try {
    const json = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as {
      u?: unknown;
      r?: unknown;
      e?: unknown;
    };
    const expiresAt = Number(json.e);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return null;
    const userId = typeof json.u === "string" && json.u ? json.u : ENV_OPERATOR_ID;
    const role = typeof json.r === "string" && json.r ? json.r : "super_admin";
    return { userId, role, expiresAt };
  } catch {
    // Legacy format: bare numeric expiry → break-glass env operator.
    const expiry = Number(payload);
    if (!Number.isSafeInteger(expiry) || expiry <= now) return null;
    return { userId: ENV_OPERATOR_ID, role: "super_admin", expiresAt: expiry };
  }
}

export function adminCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE,
  };
}
