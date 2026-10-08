/**
 * NEMO Sports · server-side admin session helpers (Node runtime)
 * ───────────────────────────────────────────────────────────────────
 * The Edge middleware performs the coarse gate (valid signed cookie +
 * route-level role check). These helpers are the authoritative, fresh
 * check used by admin pages and server actions: they re-load the user from
 * the directory on every call, so a deactivated account or a changed role
 * takes effect immediately — a stale cookie alone is never enough.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, ENV_OPERATOR_ID, verifyAdminSession } from "@/lib/admin-auth-shared";
import { can, getUserById, type AdminUser } from "@/lib/admin-users";

/** The currently signed-in operator, re-verified against the directory. */
export async function getSessionUser(): Promise<AdminUser | null> {
  try {
    const store = await cookies();
    const session = await verifyAdminSession(store.get(ADMIN_COOKIE)?.value);
    if (!session) return null;
    if (session.userId === ENV_OPERATOR_ID) {
      // Break-glass / legacy env operator — no directory row required.
      return {
        id: ENV_OPERATOR_ID,
        username: process.env.ADMIN_USERNAME?.trim() || "admin",
        email: "",
        role: "super_admin",
        isActive: true,
        createdAt: "",
        updatedAt: "",
        lastLoginAt: null,
      };
    }
    const user = await getUserById(session.userId);
    if (!user || !user.isActive) return null;
    return user;
  } catch {
    return null;
  }
}

/** Require any authenticated operator; otherwise bounce to the login. */
export async function requireUser(): Promise<AdminUser> {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  return user;
}

/**
 * Require a permission. Unauthorized operators are sent back to the
 * dashboard with a generic notice — never a stack trace.
 */
export async function requirePermission(permission: string): Promise<AdminUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) {
    redirect(`/admin?err=${encodeURIComponent("ليس لديك صلاحية للوصول إلى هذا القسم")}`);
  }
  return user;
}
