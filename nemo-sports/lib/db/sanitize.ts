/**
 * NEMO Sports · database message sanitisation
 * ───────────────────────────────────────────
 * `pg` echoes the connection string on some errors, and those messages reach
 * response bodies (cron routes, `/admin/providers`, `/api/v1/system`) and log
 * sinks. Every message that leaves the database layer passes through here
 * first, so a credential can never be printed by accident.
 *
 * Kept in its own module (rather than inside `lib/db/pg.ts`) so the schema
 * bootstrap can sanitise its failures without importing the pg driver — the
 * driver imports the bootstrap, and a cycle would make the import order
 * fragile.
 */

export function sanitizeDbMessage(raw: string): string {
  return raw
    .replace(/postgres(ql)?:\/\/[^\s@]*@/gi, "postgres://***@")
    .replace(/password=\S+/gi, "password=***");
}
