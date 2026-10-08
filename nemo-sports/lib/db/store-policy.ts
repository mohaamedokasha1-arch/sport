/**
 * Write policy shared by every admin-managed store.
 *
 * Rules (production-grade, no silent data loss):
 *  - When DATABASE_URL is configured, a write MUST reach Postgres. If the
 *    database is unavailable or the statement fails, the write is rejected
 *    with an Arabic message and nothing is kept in process memory.
 *  - When DATABASE_URL is NOT configured, the in-process store is used only
 *    outside production (local development / tests). In production it is
 *    refused unless ADMIN_ALLOW_MEMORY_STORE=1 is set explicitly, because
 *    memory is lost on restart and is not shared between server instances.
 *
 * Errors carry an operator-safe Arabic message only; SQL text, stack traces
 * and connection strings are logged server-side (without the URL) and never
 * returned to the UI.
 */

export const STORE_WRITE_FAILED_AR =
  "تعذّر حفظ التغيير في قاعدة البيانات. لم يتم حفظ أي شيء — حاول مرة أخرى بعد قليل.";

export const STORE_MEMORY_DISABLED_AR =
  "قاعدة البيانات غير مُهيّأة على هذا الخادم (DATABASE_URL). لا يمكن حفظ البيانات بشكل دائم.";

export class StoreWriteError extends Error {
  readonly messageAr: string;
  constructor(messageAr: string) {
    super(messageAr);
    this.name = "StoreWriteError";
    this.messageAr = messageAr;
  }
}

/** Operator-safe message for any error thrown by a store write. */
export function storeErrorMessage(e: unknown): string {
  return e instanceof StoreWriteError ? e.messageAr : STORE_WRITE_FAILED_AR;
}

/** Whether the in-process memory store may be used for writes. */
export function memoryStoreAllowed(): boolean {
  if (process.env.DATABASE_URL) return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.ADMIN_ALLOW_MEMORY_STORE === "1";
}

/**
 * Run a write against Postgres when a database handle is available.
 * Returns `true` when the write was persisted to the database, `false` when
 * the caller should record it in the memory store instead, and throws a
 * `StoreWriteError` when the write must be rejected.
 */
export async function persistOrThrow<T>(
  db: T | null,
  run: (db: T) => Promise<unknown>,
): Promise<boolean> {
  if (db) {
    try {
      await run(db);
      return true;
    } catch (e) {
      console.error("[admin-store] database write failed:", e instanceof Error ? e.name : "unknown");
      throw new StoreWriteError(STORE_WRITE_FAILED_AR);
    }
  }
  if (process.env.DATABASE_URL) {
    // Configured but unreachable (connection or DDL failure): never fall back.
    throw new StoreWriteError(STORE_WRITE_FAILED_AR);
  }
  if (!memoryStoreAllowed()) throw new StoreWriteError(STORE_MEMORY_DISABLED_AR);
  return false;
}
