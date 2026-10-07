/**
 * NEMO Sports · admin match overrides (result/status corrections)
 * ───────────────────────────────────────────────────────────────────
 * Provider data is read-only by design — the admin panel cannot rewrite what
 * SportScore or Football-Data.org return. What it CAN do is layer a small,
 * auditable correction on top: wrong score, wrong status, or a note.
 *
 *   · Keyed by the SAME key the public pages use: the provider match id for
 *     real matches (`/matches/<providerId>`), the fixture slug for demo ones.
 *   · Merged centrally in lib/sdl-gateway.ts (liveMatches/fixtures/
 *     matchDetail), so every surface — pages, lists, API routes — sees the
 *     corrected values. Overrides never inject NEW matches; they only correct
 *     matches the provider already lists.
 *   · An override carrying neither score nor status nor note is rejected.
 *   · Storage: Postgres (`match_overrides`) when DATABASE_URL is configured,
 *     an in-memory map otherwise — the same driver pattern as
 *     lib/broadcasts.ts and lib/match-streams.ts.
 *
 * Status vocabulary is the SDL's lowercase set (scheduled/live/halftime/…).
 * Demo fixtures use UPPERCASE statuses; toDemoStatus() maps between them.
 */

import { getDb } from "@/lib/db/pg";
import type { Match, MatchStatus } from "@/lib/data";
import type { NormalizedFixture } from "@sdl/index";

export interface MatchOverride {
  slug: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string | null;
  note: string | null;
  updatedAt: string;
}

export interface MatchOverrideInput {
  homeScore?: number | null;
  awayScore?: number | null;
  status?: string | null;
  note?: string | null;
}

/** SDL status vocabulary accepted in the `status` column. */
export const OVERRIDE_STATUSES = [
  "scheduled",
  "live",
  "halftime",
  "extra_time",
  "penalty_shootout",
  "finished",
  "postponed",
  "cancelled",
  "suspended",
  "abandoned",
  "walkover",
] as const;

export const OVERRIDE_STATUS_AR: Record<string, string> = {
  scheduled: "لم تبدأ",
  live: "جارية",
  halftime: "استراحة",
  extra_time: "وقت إضافي",
  penalty_shootout: "ركلات الترجيح",
  finished: "انتهت",
  postponed: "مؤجلة",
  cancelled: "ملغاة",
  suspended: "موقوفة",
  abandoned: "متوقفة",
  walkover: "انسحاب",
};

const DEMO_STATUS_MAP: Record<string, MatchStatus> = {
  scheduled: "UPCOMING",
  live: "LIVE",
  halftime: "HT",
  extra_time: "LIVE",
  penalty_shootout: "LIVE",
  finished: "FINISHED",
  postponed: "POSTPONED",
  cancelled: "CANCELLED",
  suspended: "SUSPENDED",
  abandoned: "CANCELLED",
  walkover: "FINISHED",
};

export function toDemoStatus(status: string): MatchStatus | null {
  return DEMO_STATUS_MAP[status.trim().toLowerCase()] ?? null;
}

/* ── validation ───────────────────────────────────────────────────── */

function validScore(v: unknown): v is number | null {
  if (v === null || v === undefined) return true;
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

function normalize(input: MatchOverrideInput): MatchOverrideInput {
  return {
    homeScore: input.homeScore ?? null,
    awayScore: input.awayScore ?? null,
    status: input.status?.trim() ? input.status.trim().toLowerCase() : null,
    note: input.note?.trim() ? input.note.trim().slice(0, 300) : null,
  };
}

/* ── storage (Postgres → memory), same pattern as lib/broadcasts.ts ─ */

const DDL = `
CREATE TABLE IF NOT EXISTS match_overrides (
  slug TEXT PRIMARY KEY,
  home_score INTEGER,
  away_score INTEGER,
  status TEXT,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

let mem: Map<string, MatchOverride> | null = null;
let ddlDone = false;

function memory(): Map<string, MatchOverride> {
  if (!mem) mem = new Map();
  return mem;
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

function fromRow(r: Row): MatchOverride {
  const iso = (v: unknown): string => {
    const d = v instanceof Date ? v : new Date(String(v ?? ""));
    return Number.isFinite(+d) ? d.toISOString() : new Date().toISOString();
  };
  const num = (v: unknown): number | null =>
    v === null || v === undefined || v === "" ? null : Number(v);
  return {
    slug: String(r.slug),
    homeScore: num(r.home_score),
    awayScore: num(r.away_score),
    status: r.status ? String(r.status) : null,
    note: r.note ? String(r.note) : null,
    updatedAt: iso(r.updated_at),
  };
}

/* ── reads ────────────────────────────────────────────────────────── */

export async function listOverrides(): Promise<MatchOverride[]> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<Row>("SELECT * FROM match_overrides ORDER BY updated_at DESC", []);
      return rows.map(fromRow);
    } catch {
      // fall through
    }
  }
  return [...memory().values()].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getOverride(slug: string): Promise<MatchOverride | null> {
  const key = slug.trim();
  if (!key) return null;
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<Row>("SELECT * FROM match_overrides WHERE slug = $1", [key]);
      return rows[0] ? fromRow(rows[0]) : null;
    } catch {
      // fall through
    }
  }
  return memory().get(key) ?? null;
}

/* ── writes ───────────────────────────────────────────────────────── */

export async function upsertOverride(
  slug: string,
  raw: MatchOverrideInput,
): Promise<{ ok: true; entry: MatchOverride } | { ok: false; error: string }> {
  const key = slug.trim().slice(0, 160);
  if (!key) return { ok: false, error: "معرّف المباراة (slug) مطلوب" };
  const input = normalize(raw);

  if (!validScore(input.homeScore) || !validScore(input.awayScore)) {
    return { ok: false, error: "النتيجة يجب أن تكون أرقامًا صحيحة غير سالبة" };
  }
  if (input.status && !(OVERRIDE_STATUSES as readonly string[]).includes(input.status)) {
    return { ok: false, error: `حالة غير معروفة: ${input.status}` };
  }
  if (input.homeScore === null && input.awayScore === null && !input.status && !input.note) {
    return { ok: false, error: "لا يوجد ما يُحفظ — أدخل نتيجة أو حالة أو ملاحظة" };
  }

  const entry: MatchOverride = {
    slug: key,
    homeScore: input.homeScore ?? null,
    awayScore: input.awayScore ?? null,
    status: input.status ?? null,
    note: input.note ?? null,
    updatedAt: new Date().toISOString(),
  };

  const db = await pg();
  if (db) {
    try {
      await db.run(
        `INSERT INTO match_overrides (slug, home_score, away_score, status, note, updated_at)
         VALUES ($1,$2,$3,$4,$5,now())
         ON CONFLICT (slug) DO UPDATE SET
           home_score = EXCLUDED.home_score,
           away_score = EXCLUDED.away_score,
           status = EXCLUDED.status,
           note = EXCLUDED.note,
           updated_at = now()`,
        [entry.slug, entry.homeScore, entry.awayScore, entry.status, entry.note],
      );
      return { ok: true, entry };
    } catch {
      // fall through
    }
  }
  memory().set(key, entry);
  return { ok: true, entry };
}

export async function deleteOverride(slug: string): Promise<boolean> {
  const key = slug.trim();
  if (!key) return false;
  const db = await pg();
  if (db) {
    try {
      await db.run("DELETE FROM match_overrides WHERE slug = $1", [key]);
      return true;
    } catch {
      // fall through
    }
  }
  return memory().delete(key);
}

/* ── merge helpers (gateway + demo pages) ─────────────────────────── */

/** Patch ONE real fixture with its override (no-op when there is none). */
export function applyFixtureOverride(f: NormalizedFixture, o: MatchOverride | null): NormalizedFixture {
  if (!o) return f;
  return {
    ...f,
    homeScore: o.homeScore ?? f.homeScore,
    awayScore: o.awayScore ?? f.awayScore,
    status: o.status ?? f.status,
  };
}

/**
 * Patch a whole real-fixture list. Reads the override table ONCE; when the
 * table is empty the input array is returned untouched (same references).
 */
export async function applyFixtureOverrides(list: NormalizedFixture[]): Promise<NormalizedFixture[]> {
  if (list.length === 0) return list;
  const all = await listOverrides();
  if (all.length === 0) return list;
  const bySlug = new Map(all.map((o) => [o.slug, o]));
  return list.map((f) => {
    const o = bySlug.get(f.providerId);
    return o ? applyFixtureOverride(f, o) : f;
  });
}

/** Patch ONE demo fixture (status mapped to the UPPERCASE demo vocabulary). */
export function applyDemoOverride(m: Match, o: MatchOverride | null): Match {
  if (!o) return m;
  const demoStatus = o.status ? toDemoStatus(o.status) : null;
  return {
    ...m,
    homeScore: o.homeScore ?? m.homeScore,
    awayScore: o.awayScore ?? m.awayScore,
    status: demoStatus ?? m.status,
  };
}

/** Patch a whole demo-fixture list (same single-read contract as above). */
export async function applyDemoOverrides(list: Match[]): Promise<Match[]> {
  if (list.length === 0) return list;
  const all = await listOverrides();
  if (all.length === 0) return list;
  const bySlug = new Map(all.map((o) => [o.slug, o]));
  return list.map((m) => {
    const o = bySlug.get(m.slug);
    return o ? applyDemoOverride(m, o) : m;
  });
}
