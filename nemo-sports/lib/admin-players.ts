/**
 * NEMO Sports · admin-managed players
 * ───────────────────────────────────────────────────────────────────
 * Players created/curated from the admin panel (/admin/players). They merge
 * into the public directory (/players, /players/[slug], sitemap). Only
 * operator-entered facts are stored — nothing is invented (nationality,
 * stats etc. are optional and render as "—" when absent).
 *
 * Storage: Postgres (`admin_players`) when DATABASE_URL is configured,
 * in-process memory otherwise.
 */

import { getDb } from "@/lib/db/pg";

export interface AdminPlayer {
  id: string;
  slug: string;
  fullNameAr: string;
  fullNameEn: string;
  teamSlug: string;
  teamName: string;
  position: string;
  nationality: string;
  jerseyNumber: number | null;
  photoUrl: string;
  dateOfBirth: string | null;
  heightCm: number | null;
  weightKg: number | null;
  /** free-form, operator-entered stats (e.g. goals/assists) — displayed as key/value pairs */
  stats: Record<string, string>;
  isPublished: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const SLUG_RE = /[^a-z0-9\u0600-\u06FF]+/g;

export function slugifyPlayer(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(SLUG_RE, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

function cleanText(v: unknown, max = 160): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function parseIntOrNull(v: unknown): number | null {
  const n = Number(String(v ?? "").trim());
  return Number.isInteger(n) && n >= 0 && n <= 999 ? n : null;
}

function parseIsoDate(v: unknown): string | null {
  const s = cleanText(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return Number.isFinite(+new Date(`${s}T00:00:00.000Z`)) ? `${s}T00:00:00.000Z` : null;
}

/** Parse "goals: 12, assists: 5" style input into a clean stats map. */
export function parseStatsInput(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of String(raw ?? "").split(/[\n,;]+/)) {
    const m = /^\s*([^:：]{1,40})[:：]\s*(.{1,40})\s*$/.exec(line);
    if (m) out[cleanText(m[1], 40)] = cleanText(m[2], 40);
  }
  return out;
}

export interface AdminPlayerInput {
  fullNameAr: string;
  fullNameEn?: string;
  teamSlug?: string;
  teamName?: string;
  position?: string;
  nationality?: string;
  jerseyNumber?: number | null;
  photoUrl?: string;
  dateOfBirth?: string;
  heightCm?: number | null;
  weightKg?: number | null;
  stats?: Record<string, string>;
  isPublished?: boolean;
  slug?: string;
}

export function validatePlayerInput(input: AdminPlayerInput): string | null {
  if (!cleanText(input.fullNameAr, 2)) return "اسم اللاعب (عربي) مطلوب";
  return null;
}

const DDL = `
CREATE TABLE IF NOT EXISTS admin_players (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  full_name_ar  TEXT NOT NULL,
  full_name_en  TEXT NOT NULL DEFAULT '',
  team_slug     TEXT NOT NULL DEFAULT '',
  team_name     TEXT NOT NULL DEFAULT '',
  position      TEXT NOT NULL DEFAULT '',
  nationality   TEXT NOT NULL DEFAULT '',
  jersey_number INTEGER,
  photo_url     TEXT NOT NULL DEFAULT '',
  date_of_birth DATE,
  height_cm     INTEGER,
  weight_kg     INTEGER,
  stats         JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_published  BOOLEAN NOT NULL DEFAULT false,
  created_by    TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_players_team ON admin_players(team_slug);
CREATE INDEX IF NOT EXISTS idx_admin_players_published ON admin_players(is_published);
`;

const mem = new Map<string, AdminPlayer>();
let ddlDone = false;
const now = () => new Date().toISOString();
const genId = () => `plr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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

const iso = (v: unknown): string => {
  const d = v instanceof Date ? v : new Date(String(v ?? ""));
  return Number.isFinite(+d) ? d.toISOString() : now();
};

function statsFromRow(v: unknown): Record<string, string> {
  if (v && typeof v === "object") {
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[String(k)] = String(val);
    return out;
  }
  if (typeof v === "string" && v) {
    try {
      return statsFromRow(JSON.parse(v));
    } catch {
      return {};
    }
  }
  return {};
}

function fromRow(r: Row): AdminPlayer {
  return {
    id: String(r.id),
    slug: String(r.slug),
    fullNameAr: String(r.full_name_ar ?? ""),
    fullNameEn: String(r.full_name_en ?? ""),
    teamSlug: String(r.team_slug ?? ""),
    teamName: String(r.team_name ?? ""),
    position: String(r.position ?? ""),
    nationality: String(r.nationality ?? ""),
    jerseyNumber: r.jersey_number === null || r.jersey_number === undefined ? null : Number(r.jersey_number),
    photoUrl: String(r.photo_url ?? ""),
    dateOfBirth: r.date_of_birth ? iso(r.date_of_birth).slice(0, 10) : null,
    heightCm: r.height_cm === null || r.height_cm === undefined ? null : Number(r.height_cm),
    weightKg: r.weight_kg === null || r.weight_kg === undefined ? null : Number(r.weight_kg),
    stats: statsFromRow(r.stats),
    isPublished: r.is_published === true,
    createdBy: String(r.created_by ?? ""),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

async function allPlayers(): Promise<AdminPlayer[]> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<Row>("SELECT * FROM admin_players ORDER BY full_name_ar", []);
      return rows.map(fromRow);
    } catch {
      // fall through
    }
  }
  return [...mem.values()].sort((a, b) => a.fullNameAr.localeCompare(b.fullNameAr, "ar"));
}

export interface AdminPlayerFilter {
  q?: string;
  team?: string;
  publishedOnly?: boolean;
  limit?: number;
}

export async function listAdminPlayers(filter: AdminPlayerFilter = {}): Promise<AdminPlayer[]> {
  let list = await allPlayers();
  const q = filter.q?.trim().toLowerCase();
  if (q) {
    list = list.filter((p) =>
      [p.fullNameAr, p.fullNameEn, p.teamName, p.slug, p.nationality].join(" ").toLowerCase().includes(q),
    );
  }
  if (filter.team) list = list.filter((p) => p.teamSlug === filter.team);
  if (filter.publishedOnly) list = list.filter((p) => p.isPublished);
  return list.slice(0, Math.min(500, Math.max(1, filter.limit ?? 300)));
}

export async function getAdminPlayerBySlug(slug: string): Promise<AdminPlayer | null> {
  const list = await allPlayers();
  return list.find((p) => p.slug === slug) ?? null;
}

export async function getAdminPlayerById(id: string): Promise<AdminPlayer | null> {
  const list = await allPlayers();
  return list.find((p) => p.id === id) ?? null;
}

export async function adminPlayerCounts(): Promise<{ total: number; published: number }> {
  const list = await allPlayers();
  return { total: list.length, published: list.filter((p) => p.isPublished).length };
}

const COLUMNS = `id, slug, full_name_ar, full_name_en, team_slug, team_name, position, nationality,
  jersey_number, photo_url, date_of_birth, height_cm, weight_kg, stats, is_published, created_by, created_at, updated_at`;

function valuesOf(p: AdminPlayer): unknown[] {
  return [
    p.id, p.slug, p.fullNameAr, p.fullNameEn, p.teamSlug, p.teamName, p.position, p.nationality,
    p.jerseyNumber, p.photoUrl, p.dateOfBirth, p.heightCm, p.weightKg, JSON.stringify(p.stats),
    p.isPublished, p.createdBy, p.createdAt, p.updatedAt,
  ];
}

export async function createAdminPlayer(
  input: AdminPlayerInput,
  createdBy = "",
): Promise<{ ok: true; player: AdminPlayer } | { ok: false; error: string }> {
  const err = validatePlayerInput(input);
  if (err) return { ok: false, error: err };

  const t = now();
  const baseSlug = cleanText(input.slug, 100) || slugifyPlayer(input.fullNameAr);
  let slug = baseSlug || `player-${Date.now().toString(36)}`;
  let n = 2;
  while ((await allPlayers()).some((x) => x.slug === slug)) {
    slug = `${baseSlug}-${n}`;
    n += 1;
  }

  const player: AdminPlayer = {
    id: genId(),
    slug,
    fullNameAr: cleanText(input.fullNameAr, 160),
    fullNameEn: cleanText(input.fullNameEn, 160),
    teamSlug: cleanText(input.teamSlug, 120),
    teamName: cleanText(input.teamName, 160),
    position: cleanText(input.position, 80),
    nationality: cleanText(input.nationality, 120),
    jerseyNumber: parseIntOrNull(input.jerseyNumber),
    photoUrl: cleanText(input.photoUrl, 1000),
    dateOfBirth: parseIsoDate(input.dateOfBirth),
    heightCm: parseIntOrNull(input.heightCm),
    weightKg: parseIntOrNull(input.weightKg),
    stats: input.stats ?? {},
    isPublished: input.isPublished === true,
    createdBy,
    createdAt: t,
    updatedAt: t,
  };

  const db = await pg();
  if (db) {
    try {
      await db.run(
        `INSERT INTO admin_players (${COLUMNS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        valuesOf(player),
      );
      return { ok: true, player };
    } catch {
      // fall through to memory
    }
  }
  mem.set(player.id, player);
  return { ok: true, player };
}

export async function updateAdminPlayer(
  id: string,
  patch: Partial<AdminPlayerInput>,
): Promise<{ ok: true; player: AdminPlayer } | { ok: false; error: string }> {
  const list = await allPlayers();
  const found = list.find((p) => p.id === id);
  if (!found) return { ok: false, error: "اللاعب غير موجود" };

  if (patch.fullNameAr !== undefined) found.fullNameAr = cleanText(patch.fullNameAr, 160);
  if (!found.fullNameAr) return { ok: false, error: "اسم اللاعب (عربي) مطلوب" };
  if (patch.fullNameEn !== undefined) found.fullNameEn = cleanText(patch.fullNameEn, 160);
  if (patch.teamSlug !== undefined) found.teamSlug = cleanText(patch.teamSlug, 120);
  if (patch.teamName !== undefined) found.teamName = cleanText(patch.teamName, 160);
  if (patch.position !== undefined) found.position = cleanText(patch.position, 80);
  if (patch.nationality !== undefined) found.nationality = cleanText(patch.nationality, 120);
  if (patch.jerseyNumber !== undefined) found.jerseyNumber = parseIntOrNull(patch.jerseyNumber);
  if (patch.photoUrl !== undefined) found.photoUrl = cleanText(patch.photoUrl, 1000);
  if (patch.dateOfBirth !== undefined) found.dateOfBirth = parseIsoDate(patch.dateOfBirth);
  if (patch.heightCm !== undefined) found.heightCm = parseIntOrNull(patch.heightCm);
  if (patch.weightKg !== undefined) found.weightKg = parseIntOrNull(patch.weightKg);
  if (patch.stats !== undefined) found.stats = patch.stats;
  if (patch.isPublished !== undefined) found.isPublished = patch.isPublished === true;
  if (patch.slug && patch.slug.trim() && patch.slug.trim() !== found.slug) {
    const newSlug = cleanText(patch.slug, 100);
    if ((await allPlayers()).some((x) => x.slug === newSlug && x.id !== id)) {
      return { ok: false, error: "الـ slug مستخدم بالفعل" };
    }
    found.slug = newSlug;
  }
  found.updatedAt = now();

  const db = await pg();
  if (db) {
    try {
      await db.run(
        `UPDATE admin_players SET slug=$2, full_name_ar=$3, full_name_en=$4, team_slug=$5, team_name=$6,
           position=$7, nationality=$8, jersey_number=$9, photo_url=$10, date_of_birth=$11, height_cm=$12,
           weight_kg=$13, stats=$14, is_published=$15, updated_at=now() WHERE id=$1`,
        [
          id, found.slug, found.fullNameAr, found.fullNameEn, found.teamSlug, found.teamName,
          found.position, found.nationality, found.jerseyNumber, found.photoUrl, found.dateOfBirth,
          found.heightCm, found.weightKg, JSON.stringify(found.stats), found.isPublished,
        ],
      );
      return { ok: true, player: found };
    } catch {
      // fall through to memory
    }
  }
  mem.set(id, found);
  return { ok: true, player: found };
}

export async function setAdminPlayerPublished(id: string, isPublished: boolean): Promise<boolean> {
  const list = await allPlayers();
  const found = list.find((p) => p.id === id);
  if (!found) return false;
  found.isPublished = isPublished;
  found.updatedAt = now();
  const db = await pg();
  if (db) {
    try {
      await db.run("UPDATE admin_players SET is_published = $2, updated_at = now() WHERE id = $1", [id, isPublished]);
      return true;
    } catch {
      // fall through
    }
  }
  mem.set(id, found);
  return true;
}

export async function deleteAdminPlayer(id: string): Promise<boolean> {
  const db = await pg();
  if (db) {
    try {
      await db.run("DELETE FROM admin_players WHERE id = $1", [id]);
    } catch {
      // fall through
    }
  }
  return mem.delete(id) || true;
}
