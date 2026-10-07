/**
 * NEMO Sports · admin activity log
 * ───────────────────────────────────────────────────────────────────
 * Every admin server action records WHAT changed (action + entity + after
 * snapshot). Operators read it at /admin/activity.
 *
 *   · Storage: the canonical `audit_log` table (db/schema.sql) when Postgres
 *     is configured — created here with an identical definition if db:setup
 *     was never run — otherwise an in-process ring (last 300 entries).
 *   · actor_role is always "admin": the panel has one operator account, not a
 *     per-user RBAC directory, so the log never invents a person.
 *   · logActivity() NEVER throws: a logging failure must not break the admin
 *     action it annotates. On Postgres failure the entry falls back to memory
 *     so it is still visible this boot.
 */

import { getDb } from "@/lib/db/pg";

export interface ActivityEntry {
  id: string;
  action: string;
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
  "news.source.create": "إضافة مصدر أخبار",
  "news.source.toggle": "تفعيل/إيقاف مصدر أخبار",
  "news.source.delete": "حذف مصدر أخبار",
  "news.source.fetch": "جلب يدوي من مصدر",
  "news.ingest.run": "تشغيل جلب الأخبار",
  "news.article.status": "تغيير حالة خبر",
  "news.article.delete": "حذف خبر",
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
  return {
    id: String(r.id),
    action: String(r.action),
    entityType: r.entity_type ? String(r.entity_type) : null,
    entityId: r.entity_id ? String(r.entity_id) : null,
    after,
    createdAt: iso(r.created_at),
  };
}

/** Record one admin action. Never throws. */
export async function logActivity(input: ActivityInput): Promise<void> {
  const action = input.action.trim().slice(0, 120);
  if (!action) return;
  const entry: ActivityEntry = {
    id: `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    action,
    entityType: input.entityType?.trim().slice(0, 80) || null,
    entityId: input.entityId?.trim().slice(0, 160) || null,
    after: input.after ?? null,
    createdAt: new Date().toISOString(),
  };

  const db = await pg();
  if (db) {
    try {
      await db.run(
        `INSERT INTO audit_log (actor_role, action, entity_type, entity_id, after)
         VALUES ('admin', $1, $2, $3, $4)`,
        [entry.action, entry.entityType, entry.entityId, entry.after ? JSON.stringify(entry.after) : null],
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
        "SELECT id, action, entity_type, entity_id, after, created_at FROM audit_log ORDER BY created_at DESC, id DESC LIMIT $1",
        [n],
      );
      return { items: rows.map(fromRow), source: "postgres" };
    } catch {
      // fall through
    }
  }
  return { items: [...memory()].reverse().slice(0, n), source: "memory" };
}
