/**
 * NEMO Sports · Pipeline · raw archive
 * ────────────────────────────────────
 * §3 of the brief: raw responses are kept so a discrepancy can be re-litigated
 * months later without re-asking a provider (and without paying quota twice).
 *
 * One row per HTTP exchange, including failed and 304 responses, in the shape
 * the brief asks for plus the fields an operator actually needs during an
 * incident: status, etag, hash, bytes, duration, attempt count and the run id.
 *
 * Rows are append-only. `pruneRaw()` enforces the retention window from the
 * registry; nothing else ever deletes.
 */

import { createHash } from "node:crypto";
import { getDb } from "@/lib/db/pg";
import type { RawRecord, SourceName } from "./types";

/** Bodies larger than this are stored truncated — the hash always covers everything. */
export const MAX_ARCHIVED_BYTES = 512 * 1024;

export const sha256 = (input: string): string => createHash("sha256").update(input).digest("hex");

export type ArchiveInput = {
  source: SourceName;
  endpoint: string;
  url: string;
  fetchedAt?: string;
  statusCode: number | null;
  etag: string | null;
  lastModified: string | null;
  contentType: string | null;
  payloadHash?: string | null;
  /** parsed JSON body, stored in `payload_json` */
  payloadJson?: unknown | null;
  /** raw body (any content type), stored truncated in `payload_text` */
  payload?: unknown;
  payloadText?: string | null;
  bytes?: number | null;
  durationMs?: number | null;
  runId?: string | null;
  notModified: boolean;
  attempts: number;
  error: string | null;
};

export async function archiveRaw(input: ArchiveInput): Promise<number | null> {
  const db = await getDb().catch(() => null);
  if (!db) return null;

  const payloadText = input.payloadText ?? (input.payload === null || input.payload === undefined ? null : JSON.stringify(input.payload));
  const truncated = payloadText && payloadText.length > MAX_ARCHIVED_BYTES ? payloadText.slice(0, MAX_ARCHIVED_BYTES) : payloadText;
  const bytes = payloadText ? Buffer.byteLength(payloadText, "utf8") : null;

  try {
    const rows = await db.select<{ id: string }>(
      `INSERT INTO raw_payloads
         (source, endpoint, request_url, status_code, etag, last_modified, content_type,
          payload_hash, payload_json, payload_text, bytes, duration_ms, run_id, not_modified, attempts, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id`,
      [
        input.source,
        input.endpoint,
        input.url,
        input.statusCode,
        input.etag,
        input.lastModified,
        input.contentType,
        input.payloadHash ?? (payloadText ? sha256(payloadText) : null),
        input.payloadJson === null || input.payloadJson === undefined ? null : JSON.stringify(input.payloadJson),
        truncated,
        bytes,
        input.durationMs,
        input.runId,
        input.notModified,
        input.attempts,
        input.error,
      ],
    );
    return rows[0]?.id ? Number(rows[0].id) : null;
  } catch (error) {
    // The archive never breaks a sync — but a silent archive failure is an
    // audit gap, so it is reported once per failing exchange.
    console.warn(JSON.stringify({ at: new Date().toISOString(), level: "warn", msg: "pipeline.archive_failed", source: input.source, endpoint: input.endpoint, error: error instanceof Error ? error.message : String(error) }));
    return null;
  }
}

/** Delete raw rows older than the retention window. Returns rows removed. */
export async function pruneRaw(days: number): Promise<number> {
  const db = await getDb().catch(() => null);
  if (!db || !Number.isFinite(days) || days <= 0) return 0;
  try {
    const rows = await db.select<{ id: string }>(
      `DELETE FROM raw_payloads WHERE fetched_at < now() - ($1::int * interval '1 day') RETURNING id`,
      [Math.floor(days)],
    );
    return rows.length;
  } catch {
    return 0;
  }
}

export type RawStats = { rows: number; bytes: number; oldest: string | null; newest: string | null; failures24h: number };

export async function rawStats(): Promise<RawStats> {
  const db = await getDb().catch(() => null);
  if (!db) return { rows: 0, bytes: 0, oldest: null, newest: null, failures24h: 0 };
  try {
    const rows = await db.select<{ rows: string; bytes: string | null; oldest: string | null; newest: string | null; failures: string }>(
      `SELECT count(*)::text AS rows,
              COALESCE(sum(bytes), 0)::text AS bytes,
              min(fetched_at) AS oldest,
              max(fetched_at) AS newest,
              count(*) FILTER (WHERE (status_code IS NULL OR status_code >= 400) AND fetched_at > now() - interval '24 hours')::text AS failures
         FROM raw_payloads`,
      [],
    );
    const r = rows[0];
    return {
      rows: Number(r?.rows ?? 0),
      bytes: Number(r?.bytes ?? 0),
      oldest: r?.oldest ? new Date(r.oldest).toISOString() : null,
      newest: r?.newest ? new Date(r.newest).toISOString() : null,
      failures24h: Number(r?.failures ?? 0),
    };
  } catch {
    return { rows: 0, bytes: 0, oldest: null, newest: null, failures24h: 0 };
  }
}

/** Last archived exchange for one source+endpoint (incident triage). */
export async function lastRaw(source: SourceName, endpoint: string): Promise<{ fetchedAt: string; statusCode: number | null; error: string | null } | null> {
  const db = await getDb().catch(() => null);
  if (!db) return null;
  try {
    const rows = await db.select<{ fetched_at: string; status_code: number | null; error: string | null }>(
      `SELECT fetched_at, status_code, error FROM raw_payloads WHERE source = $1 AND endpoint = $2 ORDER BY fetched_at DESC LIMIT 1`,
      [source, endpoint],
    );
    const r = rows[0];
    return r ? { fetchedAt: new Date(r.fetched_at).toISOString(), statusCode: r.status_code, error: r.error } : null;
  } catch {
    return null;
  }
}
