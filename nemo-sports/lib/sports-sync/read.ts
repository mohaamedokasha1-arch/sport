import { getDb, sanitizeDbMessage } from "@/lib/db/pg";
import type { Kind, RecordData } from "./model";
import { PgSyncStore } from "./store";

export async function syncedRecords(kind?: Kind): Promise<{ data: RecordData[]; error: string | null }> {
  if (!process.env.DATABASE_URL) return { data: [], error: "لم تُهيّأ قاعدة البيانات للمزامنة بعد" };
  try {
    const db = await getDb();
    if (!db) throw new Error("database driver unavailable");
    return { data: await new PgSyncStore(db).list(kind), error: null };
  } catch (e) {
    console.error("sports-sync read failed:", sanitizeDbMessage(e instanceof Error ? e.message : String(e)));
    return { data: [], error: "تعذّر قراءة البيانات المحفوظة؛ لا يعني ذلك عدم وجود مباريات" };
  }
}
export async function syncedBySlug(kind: Kind, slug: string): Promise<RecordData | null> {
  // Only our explicitly namespaced slugs; never claim an existing provider/admin URL.
  if (!/--[a-f0-9-]{36}$/.test(slug)) return null;
  if (!process.env.DATABASE_URL) return null;
  const db = await getDb();
  if (!db) throw new Error("sports-sync database unavailable");
  const rows = await db.select<{ payload: RecordData }>("SELECT payload FROM sports_sync_records WHERE kind=$1 AND payload->>'slug'=$2", [kind, slug]);
  return rows[0]?.payload ?? null;
}
