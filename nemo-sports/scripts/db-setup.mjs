#!/usr/bin/env node
/**
 * NEMO Sports · database setup without `psql`.
 * ───────────────────────────────────────────
 * Applies db/schema.sql (first run only), db/seed.sql and the migrations in
 * order. Safe to re-run: the schema is skipped once its tables exist, and the
 * seed and migrations are written idempotently.
 *
 * Usage:  DATABASE_URL='postgres://…' npm run db:setup
 * The URL is never printed. Exit code 1 on any failure.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Export it, then run this again.");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(join(root, "db", f), "utf8");

const client = new pg.Client({ connectionString: url, ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : undefined });

try {
  await client.connect();
} catch (e) {
  console.error(`Could not connect to Postgres: ${String(e.message).replace(/postgres(ql)?:\/\/[^\s@]*@/gi, "postgres://***@")}`);
  process.exit(1);
}

const steps = [];
const { rows } = await client.query("SELECT to_regclass('public.sports') IS NOT NULL AS has_core");
if (!rows[0].has_core) steps.push(["schema.sql", read("schema.sql")]);
else console.log("· schema.sql skipped (core tables already exist)");
steps.push(["seed.sql", read("seed.sql")]);
steps.push(["migration-0002-news.sql", read("migration-0002-news.sql")]);
steps.push(["migration-0003-admin.sql", read("migration-0003-admin.sql")]);
steps.push(["migration-0004-durable-storage.sql", read("migration-0004-durable-storage.sql")]);

let failed = false;
for (const [name, sql] of steps) {
  try {
    await client.query(sql);
    console.log(`✓ ${name}`);
  } catch (e) {
    failed = true;
    console.error(`✗ ${name}: ${e.message}`);
    break;
  }
}

await client.end();
if (failed) process.exit(1);
console.log("Database ready.");
