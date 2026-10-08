/**
 * NEMO Sports · admin roles & permissions (client/Edge-safe)
 * ───────────────────────────────────────────────────────────────────
 * Pure role vocabulary shared by the client shell (sidebar visibility), the
 * Edge middleware (route gating) and the server (action guards). This module
 * MUST stay free of server-only imports (no bcrypt, no pg) so it can be
 * bundled for the browser and the Edge runtime.
 */

export type AdminRole = "super_admin" | "admin" | "editor";

export const ADMIN_ROLES: AdminRole[] = ["super_admin", "admin", "editor"];

export const ROLE_AR: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  editor: "Editor",
};

export const ROLE_HINT_AR: Record<AdminRole, string> = {
  super_admin: "صلاحيات كاملة: المستخدمون، الإعدادات الحساسة، وكل المحتوى",
  admin: "إدارة المحتوى: مباريات، بث، أخبار، فرق، لاعبون، بطولات، مصادر",
  editor: "الأخبار والمباريات والبث فقط — لا يمكنه تعديل إعدادات النظام",
};

/**
 * Permission vocabulary. `super_admin` implicitly holds every permission.
 * Route-level gating lives in middleware.ts + lib/admin-session.ts.
 */
export const ROLE_PERMISSIONS: Record<AdminRole, ReadonlySet<string>> = {
  super_admin: new Set(["*"]),
  admin: new Set([
    "matches",
    "streams",
    "news",
    "teams",
    "players",
    "competitions",
    "standings",
    "broadcast",
    "providers",
    "activity",
  ]),
  editor: new Set(["matches", "streams", "news", "activity"]),
};

export function can(role: string, permission: string): boolean {
  if (role === "super_admin") return true;
  const set = ROLE_PERMISSIONS[role as AdminRole];
  if (!set) return false;
  return set.has("*") || set.has(permission);
}
