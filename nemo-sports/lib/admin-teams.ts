/**
 * NEMO Sports · admin-managed teams
 * ───────────────────────────────────────────────────────────────────
 * Teams created/curated from the admin panel (/admin/teams). They merge into
 * the public directory (/teams, /teams/[slug], sitemap) as first-class
 * entries; provider data is never modified. No invented data: every field is
 * operator-entered, and empty optional fields render as "—".
 *
 * Storage: Postgres (`admin_teams`) when DATABASE_URL is configured,
 * in-process memory otherwise.
 */

import { getDb } from "@/lib/db/pg";

export interface AdminTeam {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  shortName: string;
  sport: string;
  country: string;
  logoUrl: string;
  competitionSlug: string;
  stadium: string;
  coach: string;
  foundedYear: number | null;
  primaryColor: string;
  secondaryColor: string;
  isPublished: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const SLUG_RE = /[^a-z0-9\u0600-\u06FF]+/g;

export function slugifyTeam(name: string): string {
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

function parseYear(v: unknown): number | null {
  const n = Number(String(v ?? "").trim());
  return Number.isInteger(n) && n >= 1850 && n <= 2100 ? n : null;
}

function parseColor(v: unknown): string {
  const s = cleanText(v, 7);
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s : "";
}

export interface AdminTeamInput {
  nameAr: string;
  nameEn?: string;
  shortName?: string;
  sport?: string;
  country?: string;
  logoUrl?: string;
  competitionSlug?: string;
  stadium?: string;
  coach?: string;
  foundedYear?: number | null;
  primaryColor?: string;
  secondaryColor?: string;
  isPublished?: boolean;
  slug?: string;
}

export function validateTeamInput(input: AdminTeamInput): string | null {
  if (!cleanText(input.nameAr, 2)) return "اسم الفريق (عربي) مطلوب";
  return null;
}

const DDL = `
CREATE TABLE IF NOT EXISTS admin_teams (
  id               TEXT PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  name_ar          TEXT NOT NULL,
  name_en          TEXT NOT NULL DEFAULT '',
  short_name       TEXT NOT NULL DEFAULT '',
  sport            TEXT NOT NULL DEFAULT 'football',
  country          TEXT NOT NULL DEFAULT '',
  logo_url         TEXT NOT NULL DEFAULT '',
  competition_slug TEXT NOT NULL DEFAULT '',
  stadium          TEXT NOT NULL DEFAULT '',
  coach            TEXT NOT NULL DEFAULT '',
  founded_year     INTEGER,
  primary_color    TEXT NOT NULL DEFAULT '',
  secondary_color  TEXT NOT NULL DEFAULT '',
  is_published     BOOLEAN NOT NULL DEFAULT false,
  created_by       TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_teams_sport ON admin_teams(sport);
CREATE INDEX IF NOT EXISTS idx_admin_teams_competition ON admin_teams(competition_slug);
CREATE INDEX IF NOT EXISTS idx_admin_teams_published ON admin_teams(is_published);
`;

const mem = new Map<string, AdminTeam>();
let ddlDone = false;
const now = () => new Date().toISOString();
const genId = () => `team_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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

function fromRow(r: Row): AdminTeam {
  return {
    id: String(r.id),
    slug: String(r.slug),
    nameAr: String(r.name_ar ?? ""),
    nameEn: String(r.name_en ?? ""),
    shortName: String(r.short_name ?? ""),
    sport: String(r.sport ?? "football"),
    country: String(r.country ?? ""),
    logoUrl: String(r.logo_url ?? ""),
    competitionSlug: String(r.competition_slug ?? ""),
    stadium: String(r.stadium ?? ""),
    coach: String(r.coach ?? ""),
    foundedYear: r.founded_year === null || r.founded_year === undefined ? null : Number(r.founded_year),
    primaryColor: String(r.primary_color ?? ""),
    secondaryColor: String(r.secondary_color ?? ""),
    isPublished: r.is_published === true,
    createdBy: String(r.created_by ?? ""),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

async function allTeams(): Promise<AdminTeam[]> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<Row>("SELECT * FROM admin_teams ORDER BY name_ar", []);
      return rows.map(fromRow);
    } catch {
      // fall through
    }
  }
  return [...mem.values()].sort((a, b) => a.nameAr.localeCompare(b.nameAr, "ar"));
}

export interface AdminTeamFilter {
  q?: string;
  sport?: string;
  competition?: string;
  publishedOnly?: boolean;
  limit?: number;
}

export async function listAdminTeams(filter: AdminTeamFilter = {}): Promise<AdminTeam[]> {
  let list = await allTeams();
  const q = filter.q?.trim().toLowerCase();
  if (q) {
    list = list.filter((t) => [t.nameAr, t.nameEn, t.shortName, t.slug, t.country].join(" ").toLowerCase().includes(q));
  }
  if (filter.sport) list = list.filter((t) => t.sport === filter.sport);
  if (filter.competition) list = list.filter((t) => t.competitionSlug === filter.competition);
  if (filter.publishedOnly) list = list.filter((t) => t.isPublished);
  return list.slice(0, Math.min(500, Math.max(1, filter.limit ?? 300)));
}

export async function getAdminTeamBySlug(slug: string): Promise<AdminTeam | null> {
  const list = await allTeams();
  return list.find((t) => t.slug === slug) ?? null;
}

export async function getAdminTeamById(id: string): Promise<AdminTeam | null> {
  const list = await allTeams();
  return list.find((t) => t.id === id) ?? null;
}

export async function adminTeamCounts(): Promise<{ total: number; published: number }> {
  const list = await allTeams();
  return { total: list.length, published: list.filter((t) => t.isPublished).length };
}

const COLUMNS = `id, slug, name_ar, name_en, short_name, sport, country, logo_url, competition_slug,
  stadium, coach, founded_year, primary_color, secondary_color, is_published, created_by, created_at, updated_at`;

function valuesOf(t: AdminTeam): unknown[] {
  return [
    t.id, t.slug, t.nameAr, t.nameEn, t.shortName, t.sport, t.country, t.logoUrl, t.competitionSlug,
    t.stadium, t.coach, t.foundedYear, t.primaryColor, t.secondaryColor, t.isPublished,
    t.createdBy, t.createdAt, t.updatedAt,
  ];
}

export async function createAdminTeam(
  input: AdminTeamInput,
  createdBy = "",
): Promise<{ ok: true; team: AdminTeam } | { ok: false; error: string }> {
  const err = validateTeamInput(input);
  if (err) return { ok: false, error: err };

  const t = now();
  const baseSlug = cleanText(input.slug, 100) || slugifyTeam(input.nameAr);
  let slug = baseSlug || `team-${Date.now().toString(36)}`;
  let n = 2;
  while ((await getAdminTeamBySlug(slug)) || (await allTeams()).some((x) => x.slug === slug)) {
    slug = `${baseSlug}-${n}`;
    n += 1;
  }

  const team: AdminTeam = {
    id: genId(),
    slug,
    nameAr: cleanText(input.nameAr, 160),
    nameEn: cleanText(input.nameEn, 160),
    shortName: cleanText(input.shortName, 40) || cleanText(input.nameEn, 40).slice(0, 3).toUpperCase(),
    sport: cleanText(input.sport, 40) || "football",
    country: cleanText(input.country, 120),
    logoUrl: cleanText(input.logoUrl, 1000),
    competitionSlug: cleanText(input.competitionSlug, 120),
    stadium: cleanText(input.stadium, 200),
    coach: cleanText(input.coach, 160),
    foundedYear: parseYear(input.foundedYear),
    primaryColor: parseColor(input.primaryColor),
    secondaryColor: parseColor(input.secondaryColor),
    isPublished: input.isPublished === true,
    createdBy,
    createdAt: t,
    updatedAt: t,
  };

  const db = await pg();
  if (db) {
    try {
      await db.run(
        `INSERT INTO admin_teams (${COLUMNS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        valuesOf(team),
      );
      return { ok: true, team };
    } catch {
      // fall through to memory
    }
  }
  mem.set(team.id, team);
  return { ok: true, team };
}

export async function updateAdminTeam(
  id: string,
  patch: Partial<AdminTeamInput>,
): Promise<{ ok: true; team: AdminTeam } | { ok: false; error: string }> {
  const list = await allTeams();
  const found = list.find((t) => t.id === id);
  if (!found) return { ok: false, error: "الفريق غير موجود" };

  found.nameAr = patch.nameAr !== undefined ? cleanText(patch.nameAr, 160) : found.nameAr;
  if (!found.nameAr) return { ok: false, error: "اسم الفريق (عربي) مطلوب" };
  found.nameEn = patch.nameEn !== undefined ? cleanText(patch.nameEn, 160) : found.nameEn;
  found.shortName = patch.shortName !== undefined ? cleanText(patch.shortName, 40) : found.shortName;
  found.sport = patch.sport !== undefined ? cleanText(patch.sport, 40) || "football" : found.sport;
  found.country = patch.country !== undefined ? cleanText(patch.country, 120) : found.country;
  found.logoUrl = patch.logoUrl !== undefined ? cleanText(patch.logoUrl, 1000) : found.logoUrl;
  found.competitionSlug = patch.competitionSlug !== undefined ? cleanText(patch.competitionSlug, 120) : found.competitionSlug;
  found.stadium = patch.stadium !== undefined ? cleanText(patch.stadium, 200) : found.stadium;
  found.coach = patch.coach !== undefined ? cleanText(patch.coach, 160) : found.coach;
  found.foundedYear = patch.foundedYear !== undefined ? parseYear(patch.foundedYear) : found.foundedYear;
  found.primaryColor = patch.primaryColor !== undefined ? parseColor(patch.primaryColor) : found.primaryColor;
  found.secondaryColor = patch.secondaryColor !== undefined ? parseColor(patch.secondaryColor) : found.secondaryColor;
  found.isPublished = patch.isPublished !== undefined ? patch.isPublished === true : found.isPublished;
  if (patch.slug && patch.slug.trim() && patch.slug.trim() !== found.slug) {
    const newSlug = cleanText(patch.slug, 100);
    if ((await allTeams()).some((x) => x.slug === newSlug && x.id !== id)) {
      return { ok: false, error: "الـ slug مستخدم بالفعل" };
    }
    found.slug = newSlug;
  }
  found.updatedAt = now();

  const db = await pg();
  if (db) {
    try {
      await db.run(
        `UPDATE admin_teams SET slug=$2, name_ar=$3, name_en=$4, short_name=$5, sport=$6, country=$7,
           logo_url=$8, competition_slug=$9, stadium=$10, coach=$11, founded_year=$12, primary_color=$13,
           secondary_color=$14, is_published=$15, updated_at=now() WHERE id=$1`,
        [
          id, found.slug, found.nameAr, found.nameEn, found.shortName, found.sport, found.country,
          found.logoUrl, found.competitionSlug, found.stadium, found.coach, found.foundedYear,
          found.primaryColor, found.secondaryColor, found.isPublished,
        ],
      );
      return { ok: true, team: found };
    } catch {
      // fall through to memory
    }
  }
  mem.set(id, found);
  return { ok: true, team: found };
}

export async function setAdminTeamPublished(id: string, isPublished: boolean): Promise<boolean> {
  const list = await allTeams();
  const found = list.find((t) => t.id === id);
  if (!found) return false;
  found.isPublished = isPublished;
  found.updatedAt = now();
  const db = await pg();
  if (db) {
    try {
      await db.run("UPDATE admin_teams SET is_published = $2, updated_at = now() WHERE id = $1", [id, isPublished]);
      return true;
    } catch {
      // fall through
    }
  }
  mem.set(id, found);
  return true;
}

export async function deleteAdminTeam(id: string): Promise<boolean> {
  const db = await pg();
  if (db) {
    try {
      await db.run("DELETE FROM admin_teams WHERE id = $1", [id]);
    } catch {
      // fall through
    }
  }
  return mem.delete(id) || true;
}
