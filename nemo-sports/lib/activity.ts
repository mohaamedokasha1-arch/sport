/**
 * NEMO Sports · admin activity log
 * ───────────────────────────────────────────────────────────────────
 * Every admin server action records WHAT changed (action + entity + after
 * snapshot). Operators read it at /admin/activity.
 *
 *   · Storage: the canonical `audit_log` table (db/schema.sql) when Postgres
 *     is configured — created here with an identical definition if db:setup
 *     was never run — otherwise an in-process ring (last 300 entries).
 *   · Every entry records WHO (actor username), their role, WHAT (action),
 *     the entity and an after-snapshot. Passwords and secrets are never
 *     written here.
 *   · logActivity() NEVER throws: a logging failure must not break the admin
 *     action it annotates. On Postgres failure the entry falls back to memory
 *     so it is still visible this boot.
 */

import { getDb } from "@/lib/db/pg";

export interface ActivityEntry {
  id: string;
  action: string;
  /** username of the operator who performed the action (never a password) */
  actor: string | null;
  /** role of the operator at the time of the action */
  role: string | null;
  entityType: string | null;
  entityId: string | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

export interface ActivityInput {
  action: string;
  entityType?: string;
  entityId?: string;
  after?: Record<string, unknown>;
  /** operator username — recorded for audit, never a secret */
  actor?: string;
  /** operator role at the time of the action */
  role?: string;
}

/** Arabic labels for known actions; unknown actions render raw. */
export const ACTION_AR: Record<string, string> = {
  "override.upsert": "تحديث نتيجة/حالة مباراة",
  "override.delete": "حذف تجاوز مباراة",
  "broadcaster.create": "إضافة ناقل رسمي",
  "broadcaster.status": "تغيير حالة ناقل",
  "broadcaster.delete": "حذف ناقل",
  "stream.upsert": "حفظ بث مباراة",
  "stream.toggle": "تفعيل/إيقاف بث",
  "stream.delete": "حذف بث مباراة",
  "stream.create": "إنشاء بث مباشر",
  "stream.update": "تعديل بث مباشر",
  "stream.publish": "نشر بث مباشر",
  "stream.live": "تحديد بث كبث حي",
  "stream.stop": "إيقاف بث مباشر",
  "stream.end": "إنهاء بث مباشر",
  "stream.status": "تغيير حالة بث",
  "match.create": "إنشاء مباراة",
  "match.update": "تعديل مباراة",
  "match.delete": "حذف مباراة",
  "match.publish": "نشر مباراة",
  "match.hide": "إخفاء مباراة",
  "team.create": "إنشاء فريق",
  "team.update": "تعديل فريق",
  "team.delete": "حذف فريق",
  "team.publish": "نشر/إخفاء فريق",
  "player.create": "إنشاء لاعب",
  "player.update": "تعديل لاعب",
  "player.delete": "حذف لاعب",
  "player.publish": "نشر/إخفاء لاعب",
  "competition.create": "إنشاء بطولة",
  "competition.update": "تعديل بطولة",
  "competition.delete": "حذف بطولة",
  "competition.publish": "نشر/إخفاء بطولة",
  "news.manual.create": "إنشاء خبر يدوي",
  "news.manual.update": "تعديل خبر يدوي",
  "news.manual.delete": "حذف خبر يدوي",
  "news.manual.status": "تغيير حالة خبر يدوي",
  "news.source.create": "إضافة مصدر أخبار",
  "news.source.toggle": "تفعيل/إيقاف مصدر أخبار",
  "news.source.delete": "حذف مصدر أخبار",
  "news.source.fetch": "جلب يدوي من مصدر",
  "news.ingest.run": "تشغيل جلب الأخبار",
  "news.article.status": "تغيير حالة خبر",
  "news.article.delete": "حذف خبر",
  "settings.update": "تحديث إعدادات الموقع",
  "user.create": "إنشاء مستخدم",
  "user.update": "تعديل مستخدم",
  "user.password": "تغيير كلمة مرور مستخدم",
  "user.delete": "حذف مستخدم",
  "auth.login": "تسجيل دخول",
  "auth.logout": "تسجيل خروج",
};

export function actionLabel(action: string): string {
  return ACTION_AR[action] ?? action;
}

// Identical to db/schema.sql — IF NOT EXISTS keeps both definitions compatible
// no matter which one runs first.
const DDL = `
CREATE TABLE IF NOT EXISTS audit_log (
  id          bigserial PRIMARY KEY,
  actor_id    uuid,
  actor_role  text,
  action      text NOT NULL,
  entity_type text,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  ip          inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
`;

const MEM_CAP = 300;
let mem: ActivityEntry[] | null = null;
let ddlDone = false;

function memory(): ActivityEntry[] {
  if (!mem) mem = [];
  return mem;
}

function pushMemory(entry: ActivityEntry): void {
  const list = memory();
  list.push(entry);
  if (list.length > MEM_CAP) list.splice(0, list.length - MEM_CAP);
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

function fromRow(r: Row): ActivityEntry {
  const iso = (v: unknown): string => {
    const d = v instanceof Date ? v : new Date(String(v ?? ""));
    return Number.isFinite(+d) ? d.toISOString() : new Date().toISOString();
  };
  let after: Record<string, unknown> | null = null;
  const raw = r.after;
  if (raw && typeof raw === "object") after = raw as Record<string, unknown>;
  else if (typeof raw === "string" && raw) {
    try {
      after = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      after = null;
    }
  }
  const actor = after && typeof after.actor === "string" ? after.actor : null;
  return {
    id: String(r.id),
    action: String(r.action),
    actor,
    role: r.actor_role ? String(r.actor_role) : null,
    entityType: r.entity_type ? String(r.entity_type) : null,
    entityId: r.entity_id ? String(r.entity_id) : null,
    after,
    createdAt: iso(r.created_at),
  };
}

/** Record one admin action. Never throws. Never logs secrets. */
export async function logActivity(input: ActivityInput): Promise<void> {
  const action = input.action.trim().slice(0, 120);
  if (!action) return;
  // The actor is folded into the `after` snapshot so the append-only row
  // keeps its shape while still naming who did it.
  const after: Record<string, unknown> | null = input.after
    ? { ...(input.actor ? { actor: input.actor.slice(0, 80) } : {}), ...input.after }
    : input.actor
      ? { actor: input.actor.slice(0, 80) }
      : null;
  const entry: ActivityEntry = {
    id: `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    action,
    actor: input.actor?.slice(0, 80) ?? null,
    role: input.role?.slice(0, 40) ?? null,
    entityType: input.entityType?.trim().slice(0, 80) || null,
    entityId: input.entityId?.trim().slice(0, 160) || null,
    after,
    createdAt: new Date().toISOString(),
  };

  const db = await pg();
  if (db) {
    try {
      await db.run(
        `INSERT INTO audit_log (actor_role, action, entity_type, entity_id, after)
         VALUES ($1, $2, $3, $4, $5)`,
        [entry.role ?? "admin", entry.action, entry.entityType, entry.entityId, after ? JSON.stringify(after) : null],
      );
      return;
    } catch {
      // fall through to memory — the entry must stay visible this boot
    }
  }
  pushMemory(entry);
}

/** Newest-first activity entries plus which backend served them. */
export async function listActivity(limit = 100): Promise<{ items: ActivityEntry[]; source: "postgres" | "memory" }> {
  const n = Math.min(Math.max(1, limit), 300);
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<Row>(
        "SELECT id, action, actor_role, entity_type, entity_id, after, created_at FROM audit_log ORDER BY created_at DESC, id DESC LIMIT $1",
        [n],
      );
      return { items: rows.map(fromRow), source: "postgres" };
    } catch {
      // fall through
    }
  }
  return { items: [...memory()].reverse().slice(0, n), source: "memory" };
}
