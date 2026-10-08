/**
 * NEMO Sports · admin users & roles (RBAC)
 * ───────────────────────────────────────────────────────────────────
 * Real, database-backed operator accounts with three roles:
 *
 *   super_admin  — full access, including users & site settings
 *   admin        — content operations (matches, streams, news, teams,
 *                  players, competitions, standings, broadcast, providers)
 *   editor       — news, matches and live streams only; can never touch
 *                  system settings, users or reference data
 *
 * Storage: Postgres (`admin_users`) when DATABASE_URL is configured,
 * an in-process store otherwise (same driver pattern as the rest of the
 * platform). Passwords are ALWAYS bcrypt-hashed (cost 12) — a plaintext
 * password never touches this module or the database.
 *
 * Bootstrap: when the user table is empty and ADMIN_USERNAME +
 * ADMIN_PASSWORD_HASH are configured, a super_admin account is seeded from
 * them on first use, so existing deployments keep working and the operator
 * can then manage accounts from /admin/users. Without a database the store
 * is per-process (multi-user management needs Postgres — stated honestly in
 * the UI).
 */

import { getDb } from "@/lib/db/pg";
import { isSuperAdminOnlyPath, SUPER_ADMIN_ONLY_PREFIXES } from "@/lib/admin-auth-shared";
import { ADMIN_ROLES, type AdminRole } from "@/lib/admin-roles";
import { compare, hash } from "bcryptjs";

export { isSuperAdminOnlyPath, SUPER_ADMIN_ONLY_PREFIXES };
export { ADMIN_ROLES, ROLE_AR, ROLE_HINT_AR, ROLE_PERMISSIONS, can } from "@/lib/admin-roles";
export type { AdminRole } from "@/lib/admin-roles";

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

/* ── validation ───────────────────────────────────────────────── */

const USERNAME_RE = /^[a-zA-Z0-9_.\-]{3,32}$/;

export function validateUsername(username: string): string | null {
  if (!USERNAME_RE.test(username)) {
    return "اسم المستخدم 3–32 حرفًا (حروف/أرقام/._-)";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "كلمة المرور 8 أحرف على الأقل";
  if (password.length > 256) return "كلمة المرور طويلة جدًا";
  return null;
}

export function validateEmail(email: string): string | null {
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : "البريد الإلكتروني غير صالح";
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/* ── storage (Postgres → memory) ──────────────────────────────── */

const DDL = `
CREATE TABLE IF NOT EXISTS admin_users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'editor'
                CHECK (role IN ('super_admin','admin','editor')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);
`;

const mem = new Map<string, AdminUser & { passwordHash: string }>();
let ddlDone = false;
let bootstrapped = false;

const now = () => new Date().toISOString();

function genId(): string {
  return `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Seed the first super_admin from the environment when the directory is
 * empty. This keeps existing deployments (ADMIN_USERNAME +
 * ADMIN_PASSWORD_HASH) working unchanged and hands account management to
 * the panel afterwards.
 */
async function bootstrap(list: (AdminUser & { passwordHash: string })[]): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;
  if (list.length > 0) return;
  const username = process.env.ADMIN_USERNAME?.trim();
  const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  if (!username || !passwordHash) return;
  const t = now();
  list.push({
    id: genId(),
    username: normalizeUsername(username),
    email: "",
    passwordHash,
    role: "super_admin",
    isActive: true,
    createdAt: t,
    updatedAt: t,
    lastLoginAt: null,
  });
}

async function pg() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const db = await getDb();
    if (!db) return null;
    if (!ddlDone) {
      ddlDone = true;
      try {
        for (const stmt of DDL.split(";").map((s) => s.trim()).filter(Boolean)) await db.run(stmt, []);
      } catch {
        return null;
      }
    }
    return db;
  } catch {
    return null;
  }
}

type Row = Record<string, unknown>;

function fromRow(r: Row): AdminUser & { passwordHash: string } {
  const iso = (v: unknown): string | null => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(String(v));
    return Number.isFinite(+d) ? d.toISOString() : null;
  };
  return {
    id: String(r.id),
    username: String(r.username),
    email: String(r.email ?? ""),
    passwordHash: String(r.password_hash ?? ""),
    role: (String(r.role) as AdminRole) || "editor",
    isActive: r.is_active !== false,
    createdAt: iso(r.created_at) ?? now(),
    updatedAt: iso(r.updated_at) ?? now(),
    lastLoginAt: iso(r.last_login_at),
  };
}

async function allUsers(): Promise<(AdminUser & { passwordHash: string })[]> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<Row>("SELECT * FROM admin_users ORDER BY created_at", []);
      const list = rows.map(fromRow);
      await bootstrap(list);
      if (list.length > rows.length) {
        // bootstrap added the env super_admin — persist it
        const seeded = list[list.length - 1]!;
        await db
          .run(
            `INSERT INTO admin_users (id, username, email, password_hash, role, is_active, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (username) DO NOTHING`,
            [seeded.id, seeded.username, seeded.email, seeded.passwordHash, seeded.role, seeded.isActive, seeded.createdAt, seeded.updatedAt],
          )
          .catch(() => {});
      }
      return list;
    } catch {
      // fall through to memory
    }
  }
  const list = [...mem.values()];
  await bootstrap(list);
  if (list.length > mem.size) mem.set(list[list.length - 1]!.id, list[list.length - 1]!);
  return list;
}

function publicUser(u: AdminUser & { passwordHash: string }): AdminUser {
  const { passwordHash: _omit, ...rest } = u;
  return rest;
}

/* ── reads ────────────────────────────────────────────────────── */

export async function listUsers(): Promise<AdminUser[]> {
  return (await allUsers()).map(publicUser);
}

export async function getUserById(id: string): Promise<AdminUser | null> {
  const list = await allUsers();
  const found = list.find((u) => u.id === id);
  return found ? publicUser(found) : null;
}

export async function getUserRecordByUsername(username: string): Promise<(AdminUser & { passwordHash: string }) | null> {
  const needle = normalizeUsername(username);
  const list = await allUsers();
  return list.find((u) => u.username === needle) ?? null;
}

export async function countActiveSuperAdmins(): Promise<number> {
  const list = await allUsers();
  return list.filter((u) => u.role === "super_admin" && u.isActive).length;
}

/* ── writes ───────────────────────────────────────────────────── */

export interface CreateUserInput {
  username: string;
  email?: string;
  password: string;
  role: AdminRole;
}

export async function createUser(
  input: CreateUserInput,
): Promise<{ ok: true; user: AdminUser } | { ok: false; error: string }> {
  const username = normalizeUsername(input.username);
  const email = (input.email ?? "").trim();
  const err = validateUsername(username) ?? validatePassword(input.password) ?? validateEmail(email);
  if (err) return { ok: false, error: err };
  if (!ADMIN_ROLES.includes(input.role)) return { ok: false, error: "الدور غير صالح" };

  const existing = await getUserRecordByUsername(username);
  if (existing) return { ok: false, error: "اسم المستخدم مستخدم بالفعل" };

  const passwordHash = await hash(input.password, 12);
  const t = now();
  const user: AdminUser & { passwordHash: string } = {
    id: genId(),
    username,
    email,
    passwordHash,
    role: input.role,
    isActive: true,
    createdAt: t,
    updatedAt: t,
    lastLoginAt: null,
  };

  const db = await pg();
  if (db) {
    try {
      await db.run(
        `INSERT INTO admin_users (id, username, email, password_hash, role, is_active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [user.id, user.username, user.email, user.passwordHash, user.role, user.isActive, user.createdAt, user.updatedAt],
      );
      return { ok: true, user: publicUser(user) };
    } catch {
      // fall through to memory
    }
  }
  mem.set(user.id, user);
  return { ok: true, user: publicUser(user) };
}

export async function updateUser(
  id: string,
  patch: { email?: string; role?: AdminRole; isActive?: boolean },
): Promise<{ ok: true; user: AdminUser } | { ok: false; error: string }> {
  const list = await allUsers();
  const found = list.find((u) => u.id === id);
  if (!found) return { ok: false, error: "المستخدم غير موجود" };
  if (patch.email !== undefined) {
    const err = validateEmail(patch.email.trim());
    if (err) return { ok: false, error: err };
    found.email = patch.email.trim();
  }
  if (patch.role !== undefined) {
    if (!ADMIN_ROLES.includes(patch.role)) return { ok: false, error: "الدور غير صالح" };
    found.role = patch.role;
  }
  if (patch.isActive !== undefined) found.isActive = patch.isActive;
  found.updatedAt = now();

  const db = await pg();
  if (db) {
    try {
      await db.run(
        "UPDATE admin_users SET email = $2, role = $3, is_active = $4, updated_at = now() WHERE id = $1",
        [id, found.email, found.role, found.isActive],
      );
      return { ok: true, user: publicUser(found) };
    } catch {
      // fall through to memory
    }
  }
  mem.set(id, found);
  return { ok: true, user: publicUser(found) };
}

export async function setUserPassword(
  id: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const err = validatePassword(password);
  if (err) return { ok: false, error: err };
  const list = await allUsers();
  const found = list.find((u) => u.id === id);
  if (!found) return { ok: false, error: "المستخدم غير موجود" };
  found.passwordHash = await hash(password, 12);
  found.updatedAt = now();

  const db = await pg();
  if (db) {
    try {
      await db.run("UPDATE admin_users SET password_hash = $2, updated_at = now() WHERE id = $1", [id, found.passwordHash]);
      return { ok: true };
    } catch {
      // fall through to memory
    }
  }
  mem.set(id, found);
  return { ok: true };
}

export async function deleteUser(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const list = await allUsers();
  const found = list.find((u) => u.id === id);
  if (!found) return { ok: false, error: "المستخدم غير موجود" };
  if (found.role === "super_admin" && found.isActive) {
    const superCount = list.filter((u) => u.role === "super_admin" && u.isActive && u.id !== id).length;
    if (superCount === 0) {
      return { ok: false, error: "لا يمكن حذف آخر Super Admin نشط" };
    }
  }

  const db = await pg();
  if (db) {
    try {
      await db.run("DELETE FROM admin_users WHERE id = $1", [id]);
      return { ok: true };
    } catch {
      // fall through to memory
    }
  }
  mem.delete(id);
  return { ok: true };
}

/* ── credentials ──────────────────────────────────────────────── */

/**
 * Verify username + password against the user directory. Returns the user
 * (without the hash) on success. Timing-safe enough for an admin panel
 * behind rate limiting; never reveals whether the username exists.
 */
export async function verifyUserCredentials(
  username: string,
  password: string,
): Promise<AdminUser | null> {
  const record = await getUserRecordByUsername(username);
  if (!record || !record.isActive) return null;
  try {
    const ok = await compare(password, record.passwordHash);
    if (!ok) return null;
  } catch {
    return null;
  }
  return publicUser(record);
}

export async function touchLastLogin(id: string): Promise<void> {
  const db = await pg();
  if (db) {
    try {
      await db.run("UPDATE admin_users SET last_login_at = now() WHERE id = $1", [id]);
      return;
    } catch {
      // fall through
    }
  }
  const found = mem.get(id);
  if (found) found.lastLoginAt = now();
}

/** True when at least one user account exists (env bootstrap may create it). */
export async function hasAnyUser(): Promise<boolean> {
  return (await allUsers()).length > 0;
}
