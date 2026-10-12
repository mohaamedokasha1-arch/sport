/**
 * NEMO Sports · Pipeline · discrepancy audit
 * ──────────────────────────────────────────
 * §6 of the brief: when two sources disagree, the losing value is still
 * preserved — in `raw_payloads` (the bytes the source sent) and, when it is
 * worth a human's attention, as a row in `data_conflicts` that the admin panel
 * can review and resolve.
 *
 * `data_conflicts` already exists in the canonical schema (values jsonb,
 * providers text[], severity, resolution) — duplicating it with a second
 * "discrepancies" table would give two places to look during an incident.
 */

import { getDb } from "@/lib/db/pg";
import type { SourceName } from "./types";

export type Discrepancy = {
  entityType: string;
  entityId: string;
  field: string;
  severity: "critical" | "high" | "medium" | "low";
  /** values per source, e.g. { football_data: 2, thesportsdb: 3 } */
  values: Record<string, unknown>;
  /** the source whose value was persisted */
  winner: SourceName;
  losers: SourceName[];
  notes?: string | null;
};

/** Persist one disagreement. Never throws — an audit write cannot break a sync. */
export async function recordDiscrepancy(input: Discrepancy): Promise<boolean> {
  const db = await getDb().catch(() => null);
  if (!db) return false;
  try {
    await db.run(
      `INSERT INTO data_conflicts (severity, field, entity_type, entity_id, values, providers, resolved, resolution, notes)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::text[], false, NULL, $7)`,
      [
        input.severity,
        input.field,
        input.entityType,
        input.entityId,
        JSON.stringify({ ...input.values, __winner: input.winner, __losers: input.losers }),
        [input.winner, ...input.losers],
        input.notes ?? null,
      ],
    );
    return true;
  } catch {
    return false;
  }
}

export type OpenConflict = {
  id: string;
  severity: string;
  field: string;
  entityType: string;
  entityId: string;
  providers: string[];
  values: Record<string, unknown>;
  detectedAt: string;
};

export async function openConflicts(limit = 50): Promise<OpenConflict[]> {
  const db = await getDb().catch(() => null);
  if (!db) return [];
  try {
    const rows = await db.select<{
      id: string;
      severity: string;
      field: string;
      entity_type: string;
      entity_id: string;
      providers: string[] | null;
      values: unknown;
      detected_at: string;
    }>(
      `SELECT id, severity, field, entity_type, entity_id, providers, values, detected_at
         FROM data_conflicts
        WHERE NOT resolved
        ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                 detected_at DESC
        LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({
      id: r.id,
      severity: r.severity,
      field: r.field,
      entityType: r.entity_type,
      entityId: r.entity_id,
      providers: r.providers ?? [],
      values: (typeof r.values === "string" ? (JSON.parse(r.values) as Record<string, unknown>) : (r.values as Record<string, unknown>)) ?? {},
      detectedAt: new Date(r.detected_at).toISOString(),
    }));
  } catch {
    return [];
  }
}

/** Count of unresolved disagreements, split by severity — used by the admin page. */
export async function conflictCounts(): Promise<{ total: number; critical: number; high: number }> {
  const db = await getDb().catch(() => null);
  if (!db) return { total: 0, critical: 0, high: 0 };
  try {
    const rows = await db.select<{ total: string; critical: string; high: string }>(
      `SELECT count(*)::text AS total,
              count(*) FILTER (WHERE severity = 'critical')::text AS critical,
              count(*) FILTER (WHERE severity = 'high')::text AS high
         FROM data_conflicts WHERE NOT resolved`,
      [],
    );
    const r = rows[0];
    return { total: Number(r?.total ?? 0), critical: Number(r?.critical ?? 0), high: Number(r?.high ?? 0) };
  } catch {
    return { total: 0, critical: 0, high: 0 };
  }
}
