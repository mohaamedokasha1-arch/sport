/**
 * Edge-safe primitives shared by the admin middleware and the Node login route.
 *
 * The cookie is intentionally an HMAC-signed expiry, not a bearer copy of the
 * configured password. Rotating any configured admin secret invalidates all
 * existing sessions without a database round-trip.
 */

export const ADMIN_COOKIE = "nemo_admin_session";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 12;

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

/** Create a signed, expiring session cookie value. */
export async function createAdminSession(now = Date.now()): Promise<string | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  const payload = String(now + ADMIN_SESSION_MAX_AGE * 1000);
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

/** Validate the signature and expiry without revealing the secret. */
export async function verifyAdminSession(value: string | undefined, now = Date.now()): Promise<boolean> {
  const secret = sessionSecret();
  if (!secret || !value) return false;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = value.slice(0, dot);
  const expiry = Number(payload);
  if (!Number.isSafeInteger(expiry) || expiry <= now) return false;
  try {
    const expected = await signature(secret, payload);
    return constantTimeEqual(expected, value.slice(dot + 1));
  } catch {
    return false;
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
