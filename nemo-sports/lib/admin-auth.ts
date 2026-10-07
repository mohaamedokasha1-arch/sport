import { compare } from "bcryptjs";
import { adminAuthConfigured } from "@/lib/admin-auth-shared";

function equalSecret(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/**
 * Verify the password-based login. ADMIN_ACCESS_TOKEN remains available as a
 * break-glass password for existing deployments, but new setups should use
 * ADMIN_USERNAME + ADMIN_PASSWORD_HASH.
 */
export async function verifyAdminCredentials(username: string, password: string): Promise<boolean> {
  const configuredUsername = process.env.ADMIN_USERNAME?.trim();
  const accessToken = process.env.ADMIN_ACCESS_TOKEN?.trim();

  if (accessToken && (!configuredUsername || username === configuredUsername) && equalSecret(password, accessToken)) {
    return true;
  }

  const hash = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (!configuredUsername || !hash || username !== configuredUsername) return false;

  try {
    return await compare(password, hash);
  } catch {
    return false;
  }
}

export function adminLoginConfigured(): boolean {
  return adminAuthConfigured();
}
