/**
 * NEMO Sports · admin-managed competitions
 * ───────────────────────────────────────────────────────────────────
 * Competitions created/curated from the admin panel (/admin/competitions).
 * They merge into the public catalog (/competitions, /competitions/[slug],
 * sitemap) alongside the static reference catalog (lib/core-data.ts) and
 * provider competitions; provider data is never modified.
 *
 * Storage: Postgres (`admin_competitions`) when DATABASE_URL is configured,
 * in-process memory otherwise.
 */

import { getDb } from "@/lib/db/pg";

export interface AdminCompetition {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  sport: string;
  country: string;
  season: string;
  logoUrl: string;
  type: string;
  isPublished: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const COMPETITION_TYPES = ["دوري", "كأس", "بطولة", "ودية", "دولية"] as const;

const SLUG_RE = /[^a-z0-9\u0600-\u06FF]+/g;

export function slugifyCompetition(name: string): string {
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

export interface AdminCompetitionInput {
  nameAr: string;
  nameEn?: string;
  sport?: string;
  country?: string;
  season?: string;
  logoUrl?: string;
  type?: string;
  isPublished?: boolean;
  slug?: string;
}

export function validateCompetitionInput(input: AdminCompetitionInput): string | null {
  if (!cleanText(input.nameAr, 2)) return "اسم البطولة (عربي) مطلوب";
  return null;
}

const DDL = `
CREATE TABLE IF NOT EXISTS admin_competitions (
  id           TEXT PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name_ar      TEXT NOT NULL,
  name_en      TEXT NOT NULL DEFAULT '',
  sport        TEXT NOT NULL DEFAULT 'football',
  country      TEXT NOT NULL DEFAULT '',
  season       TEXT NOT NULL DEFAULT '',
  logo_url     TEXT NOT NULL DEFAULT '',
  type         TEXT NOT NULL DEFAULT 'دوري',
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by   TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_competitions_sport ON admin_competitions(sport);
CREATE INDEX IF NOT EXISTS idx_admin_competitions_published ON admin_competitions(is_published);
`;

const mem = new Map<string, AdminCompetition>();
let ddlDone = false;
const now = () => new Date().toISOString();
const genId = () => `comp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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

function fromRow(r: Row): AdminCompetition {
  return {
    id: String(r.id),
    slug: String(r.slug),
    nameAr: String(r.name_ar ?? ""),
    nameEn: String(r.name_en ?? ""),
    sport: String(r.sport ?? "football"),
    country: String(r.country ?? ""),
    season: String(r.season ?? ""),
    logoUrl: String(r.logo_url ?? ""),
    type: String(r.type ?? "دوري"),
    isPublished: r.is_published === true,
    createdBy: String(r.created_by ?? ""),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

async function allCompetitions(): Promise<AdminCompetition[]> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<Row>("SELECT * FROM admin_competitions ORDER BY name_ar", []);
      return rows.map(fromRow);
    } catch {
      // fall through
    }
  }
  return [...mem.values()].sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));
}

export interface AdminCompetitionFilter {
  q?: string;
  sport?: string;
  publishedOnly?: boolean;
  limit?: number;
}

export async function listAdminCompetitions(filter: AdminCompetitionFilter = {}): Promise<AdminCompetition[]> {
  let list = await allCompetitions();
  const q = filter.q?.trim().toLowerCase();
  if (q) {
    list = list.filter((c) => [c.nameAr, c.nameEn, c.slug, c.country].join(" ").toLowerCase().includes(q));
  }
  if (filter.sport) list = list.filter((c) => c.sport === filter.sport);
  if (filter.publishedOnly) list = list.filter((c) => c.isPublished);
  return list.slice(0, Math.min(300, Math.max(1, filter.limit ?? 200)));
}

export async function getAdminCompetitionBySlug(slug: string): Promise<AdminCompetition | null> {
  const list = await allCompetitions();
  return list.find((c) => c.slug === slug) ?? null;
}

export async function getAdminCompetitionById(id: string): Promise<AdminCompetition | null> {
  const list = await allCompetitions();
  return list.find((c) => c.id === id) ?? null;
}

export async function adminCompetitionCounts(): Promise<{ total: number; published: number }> {
  const list = await allCompetitions();
  return { total: list.length, published: list.filter((c) => c.isPublished).length };
}

const COLUMNS = `id, slug, name_ar, name_en, sport, country, season, logo_url, type, is_published, created_by, created_at, updated_at`;

function valuesOf(c: AdminCompetition): unknown[] {
  return [
    c.id, c.slug, c.nameAr, c.nameEn, c.sport, c.country, c.season, c.logoUrl, c.type,
    c.isPublished, c.createdBy, c.createdAt, c.updatedAt,
  ];
}

export async function createAdminCompetition(
  input: AdminCompetitionInput,
  createdBy = "",
): Promise<{ ok: true; competition: AdminCompetition } | { ok: false; error: string }> {
  const err = validateCompetitionInput(input);
  if (err) return { ok: false, error: err };

  const t = now();
  const baseSlug = cleanText(input.slug, 100) || slugifyCompetition(input.nameAr);
  let slug = baseSlug || `competition-${Date.now().toString(36)}`;
  let n = 2;
  while ((await allCompetitions()).some((x) => x.slug === slug)) {
    slug = `${baseSlug}-${n}`;
    n += 1;
  }

  const competition: AdminCompetition = {
    id: genId(),
    slug,
    nameAr: cleanText(input.nameAr, 160),
    nameEn: cleanText(input.nameEn, 160),
    sport: cleanText(input.sport, 40) || "football",
    country: cleanText(input.country, 120),
    season: cleanText(input.season, 40),
    logoUrl: cleanText(input.logoUrl, 1000),
    type: cleanText(input.type, 40) || "دوري",
    isPublished: input.isPublished === true,
    createdBy,
    createdAt: t,
    updatedAt: t,
  };

  const db = await pg();
  if (db) {
    try {
      await db.run(
        `INSERT INTO admin_competitions (${COLUMNS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        valuesOf(competition),
      );
      return { ok: true, competition };
    } catch {
      // fall through to memory
    }
  }
  mem.set(competition.id, competition);
  return { ok: true, competition };
}

export async function updateAdminCompetition(
  id: string,
  patch: Partial<AdminCompetitionInput>,
): Promise<{ ok: true; competition: AdminCompetition } | { ok: false; error: string }> {
  const list = await allCompetitions();
  const found = list.find((c) => c.id === id);
  if (!found) return { ok: false, error: "البطولة غير موجودة" };

  if (patch.nameAr !== undefined) found.nameAr = cleanText(patch.nameAr, 160);
  if (!found.nameAr) return { ok: false, error: "اسم البطولة (عربي) مطلوب" };
  if (patch.nameEn !== undefined) found.nameEn = cleanText(patch.nameEn, 160);
  if (patch.sport !== undefined) found.sport = cleanText(patch.sport, 40) || "football";
  if (patch.country !== undefined) found.country = cleanText(patch.country, 120);
  if (patch.season !== undefined) found.season = cleanText(patch.season, 40);
  if (patch.logoUrl !== undefined) found.logoUrl = cleanText(patch.logoUrl, 1000);
  if (patch.type !== undefined) found.type = cleanText(patch.type, 40) || "دوري";
  if (patch.isPublished !== undefined) found.isPublished = patch.isPublished === true;
  if (patch.slug && patch.slug.trim() && patch.slug.trim() !== found.slug) {
    const newSlug = cleanText(patch.slug, 100);
    if ((await allCompetitions()).some((x) => x.slug === newSlug && x.id !== id)) {
      return { ok: false, error: "الـ slug مستخدم بالفعل" };
    }
    found.slug = newSlug;
  }
  found.updatedAt = now();

  const db = await pg();
  if (db) {
    try {
      await db.run(
        `UPDATE admin_competitions SET slug=$2, name_ar=$3, name_en=$4, sport=$5, country=$6, season=$7,
           logo_url=$8, type=$9, is_published=$10, updated_at=now() WHERE id=$1`,
        [
          id, found.slug, found.nameAr, found.nameEn, found.sport, found.country, found.season,
          found.logoUrl, found.type, found.isPublished,
        ],
      );
      return { ok: true, competition: found };
    } catch {
      // fall through to memory
    }
  }
  mem.set(id, found);
  return { ok: true, competition: found };
}

export async function setAdminCompetitionPublished(id: string, isPublished: boolean): Promise<boolean> {
  const list = await allCompetitions();
  const found = list.find((c) => c.id === id);
  if (!found) return false;
  found.isPublished = isPublished;
  found.updatedAt = now();
  const db = await pg();
  if (db) {
    try {
      await db.run("UPDATE admin_competitions SET is_published = $2, updated_at = now() WHERE id = $1", [id, isPublished]);
      return true;
    } catch {
      // fall through
    }
  }
  mem.set(id, found);
  return true;
}

export async function deleteAdminCompetition(id: string): Promise<boolean> {
  const db = await pg();
  if (db) {
    try {
      await db.run("DELETE FROM admin_competitions WHERE id = $1", [id]);
    } catch {
      // fall through
    }
  }
  return mem.delete(id) || true;
}
