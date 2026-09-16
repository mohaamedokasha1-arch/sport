/**
 * Postgres driver - the ONLY place in the app allowed to import a SQL client.
 *
 * The SDL never imports `pg`: it depends on its own `SqlClient` interface and
 * receives this implementation by injection (dependency inversion), which keeps
 * `packages/sdl` free of runtime dependencies and lets the row/entity mapping
 * be unit-tested with a fake client.
 *
 * Everything here degrades to `null` when `DATABASE_URL` is unset or the driver
 * cannot load, so the platform boots and serves from cache instead of failing.
 */

import { PgCanonicalStore, type SqlClient } from "@sdl/index";
import type { Pool, PoolClient } from "pg";

export type PgDriver = SqlClient & { end: () => Promise<void> };

type PoolCtor = new (config: { connectionString: string; max?: number; idleTimeoutMillis?: number }) => Pool;

/** `pg` is loaded lazily so a deployment without a database never pays for it. */
async function loadPg(): Promise<PoolCtor | null> {
  try {
    const mod = (await import("pg")) as unknown as { Pool: PoolCtor } | { default: { Pool: PoolCtor } };
    return "default" in mod ? mod.default.Pool : mod.Pool;
  } catch {
    return null;
  }
}

let pool: Pool | null = null;
let driver: PgDriver | null = null;
let loadFailed = false;

async function getPool(): Promise<Pool | null> {
  const url = process.env.DATABASE_URL;
  if (!url || loadFailed) return null;
  if (pool) return pool;
  const PgPool = await loadPg();
  if (!PgPool) {
    loadFailed = true;
    return null;
  }
  pool = new PgPool({ connectionString: url, max: Number(process.env.PG_POOL_MAX ?? 5), idleTimeoutMillis: 30_000 });
  return pool;
}

/** Wrap a pool or a transaction client as the SDL's `SqlClient`. */
function asSqlClient(runner: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }): SqlClient {
  return {
    async select<T extends object>(sql: string, params: unknown[]): Promise<T[]> {
      const res = await runner.query(sql, params);
      return res.rows as T[];
    },
    async run(sql: string, params: unknown[]): Promise<void> {
      await runner.query(sql, params);
    },
    transaction: () => {
      throw new Error("nested transactions are not supported; call transaction() on the driver");
    },
  };
}

/** The `SqlClient` handed to the SDL, or `null` when no database is configured. */
export async function getDb(): Promise<PgDriver | null> {
  if (driver) return driver;
  const p = await getPool();
  if (!p) return null;

  const base = asSqlClient(p);
  driver = {
    select: base.select,
    run: base.run,
    async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
      const client: PoolClient = await p.connect();
      try {
        await client.query("BEGIN");
        const tx = asSqlClient(client);
        const out = await fn({ ...tx, transaction: (inner) => inner(tx) });
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    async end() {
      await p.end();
      pool = null;
      driver = null;
    },
  };
  return driver;
}

/** The canonical store, or `null` when there is no database. */
export async function getCanonicalStore(): Promise<PgCanonicalStore | null> {
  const db = await getDb();
  return db ? new PgCanonicalStore(db) : null;
}

/**
 * Strip anything that looks like credentials before a message reaches a
 * response body or a log. `pg` echoes the connection string on some errors and
 * this probe is surfaced in the admin dashboard (§12).
 */
export function sanitizeDbMessage(raw: string): string {
  return raw
    .replace(/postgres(ql)?:\/\/[^\s@]*@/gi, "postgres://***@")
    .replace(/password=\S+/gi, "password=***");
}

/** One-shot health probe for the admin dashboard. Never throws. */
export async function dbHealth(): Promise<{ ok: boolean; detail: string }> {
  if (!process.env.DATABASE_URL) return { ok: false, detail: "DATABASE_URL غير مضبوط" };
  try {
    const db = await getDb();
    if (!db) return { ok: false, detail: "مشغّل pg غير متاح" };
    const rows = await db.select<{ ok: boolean }>("SELECT true AS ok", []);
    const v = await db
      .select<{ v: string }>("SELECT current_setting('server_version') AS v", [])
      .catch(() => [] as { v: string }[]);
    return { ok: rows[0]?.ok === true, detail: v[0]?.v ? `PostgreSQL ${v[0].v}` : "متّصل" };
  } catch (e) {
    return { ok: false, detail: sanitizeDbMessage(e instanceof Error ? e.message : String(e)) };
  }
}
