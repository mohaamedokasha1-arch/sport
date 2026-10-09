/**
 * NEMO Sports · admin-managed matches
 * ───────────────────────────────────────────────────────────────────
 * Matches created by the editorial team from the admin panel. They live in
 * their own store (`admin_matches`) and are merged into the public surfaces
 * (matches list, match detail, fixtures, results, live, sitemap) as
 * first-class fixtures — provider data is never modified.
 *
 *   · Status vocabulary (per the admin spec): upcoming / live / finished /
 *     postponed / cancelled — mapped to the SDL vocabulary on the boundary.
 *   · A match is publicly visible only when is_published = true; hiding a
 *     match never deletes it and never touches its streams.
 *   · Streams bind to admin matches by the match slug (lib/match-streams.ts),
 *     so a published stream appears on /matches/<slug> and /live immediately.
 *   · Storage: Postgres when DATABASE_URL is configured, in-process memory
 *     otherwise (same driver pattern as the rest of the platform).
 */

import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db/pg";
import { persistOrThrow, storeErrorMessage } from "@/lib/db/store-policy";
import { SITE_TZ } from "@/lib/tz";
import { decodeSlug } from "@/lib/slug";
import type { NormalizedFixture } from "@/packages/sdl/src";

export type AdminMatchStatus = "upcoming" | "live" | "finished" | "postponed" | "cancelled";

export const ADMIN_MATCH_STATUSES: AdminMatchStatus[] = ["upcoming", "live", "finished", "postponed", "cancelled"];

export const ADMIN_MATCH_STATUS_AR: Record<AdminMatchStatus, string> = {
  upcoming: "قادمة",
  live: "مباشرة",
  finished: "انتهت",
  postponed: "مؤجلة",
  cancelled: "ملغاة",
};

/** SDL status vocabulary used on every public surface. */
const STATUS_TO_FIXTURE: Record<AdminMatchStatus, string> = {
  upcoming: "scheduled",
  live: "live",
  finished: "finished",
  postponed: "postponed",
  cancelled: "cancelled",
};

export interface AdminMatch {
  id: string;
  slug: string;
  sport: string;
  competitionSlug: string;
  competitionName: string;
  season: string;
  homeName: string;
  homeNameEn: string;
  homeLogo: string;
  awayName: string;
  awayNameEn: string;
  awayLogo: string;
  scheduledAt: string;
  status: AdminMatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  venue: string;
  referee: string;
  isPublished: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * The 5 verified fixtures (October 9, 2026).
 * Kickoff timestamps are stored in UTC; wall-clock times in Cairo/Mecca (UTC+3):
 *  1. الفتح × الأهلي: 17:55 (5:55 PM) → 14:55 UTC
 *  2. النصر × الدرعية: 21:00 (9:00 PM) → 18:00 UTC
 *  3. بوروسيا دورتموند × فيردر بريمن: 21:30 (9:30 PM) → 18:30 UTC
 *  4. لانس × أولمبيك ليون: 21:45 (9:45 PM) → 18:45 UTC
 *  5. مالقا × إسبانيول: 22:00 (10:00 PM) → 19:00 UTC
 */
export const INITIAL_ADMIN_MATCHES: AdminMatch[] = [
  {
    id: "adm_match_fateh_ahli_20261009",
    slug: "al-fateh-vs-al-ahli",
    sport: "football",
    competitionSlug: "saudi-pro-league",
    competitionName: "دوري روشن السعودي",
    season: "2026/2027",
    homeName: "الفتح",
    homeNameEn: "Al-Fateh",
    homeLogo: "https://media.api-sports.io/football/teams/2939.png",
    awayName: "الأهلي",
    awayNameEn: "Al-Ahli",
    awayLogo: "https://media.api-sports.io/football/teams/2932.png",
    scheduledAt: "2026-10-09T14:55:00.000Z",
    status: "upcoming",
    homeScore: null,
    awayScore: null,
    venue: "ملعب الأمير عبد الله بن جلوي (الأحساء)",
    referee: "",
    isPublished: true,
    createdBy: "editorial",
    createdAt: "2026-10-08T12:00:00.000Z",
    updatedAt: "2026-10-08T12:00:00.000Z",
  },
  {
    id: "adm_match_nassr_diriyah_20261009",
    slug: "al-nassr-vs-al-diriyah",
    sport: "football",
    competitionSlug: "saudi-pro-league",
    competitionName: "دوري روشن السعودي",
    season: "2026/2027",
    homeName: "النصر",
    homeNameEn: "Al-Nassr",
    homeLogo: "https://media.api-sports.io/football/teams/2934.png",
    awayName: "الدرعية",
    awayNameEn: "Al-Diriyah",
    awayLogo: "https://media.api-sports.io/football/teams/10204.png",
    scheduledAt: "2026-10-09T18:00:00.000Z",
    status: "upcoming",
    homeScore: null,
    awayScore: null,
    venue: "الأول بارك (الرياض)",
    referee: "",
    isPublished: true,
    createdBy: "editorial",
    createdAt: "2026-10-08T12:00:00.000Z",
    updatedAt: "2026-10-08T12:00:00.000Z",
  },
  {
    id: "adm_match_dortmund_bremen_20261009",
    slug: "borussia-dortmund-vs-werder-bremen",
    sport: "football",
    competitionSlug: "bundesliga",
    competitionName: "الدوري الألماني",
    season: "2026/2027",
    homeName: "بوروسيا دورتموند",
    homeNameEn: "Borussia Dortmund",
    homeLogo: "https://crests.football-data.org/4.png",
    awayName: "فيردر بريمن",
    awayNameEn: "Werder Bremen",
    awayLogo: "https://crests.football-data.org/12.png",
    scheduledAt: "2026-10-09T18:30:00.000Z",
    status: "upcoming",
    homeScore: null,
    awayScore: null,
    venue: "سيغنال إيدونا بارك (دورتموند)",
    referee: "",
    isPublished: true,
    createdBy: "editorial",
    createdAt: "2026-10-08T12:00:00.000Z",
    updatedAt: "2026-10-08T12:00:00.000Z",
  },
  {
    id: "adm_match_lens_lyon_20261009",
    slug: "lens-vs-lyon",
    sport: "football",
    competitionSlug: "ligue-1",
    competitionName: "الدوري الفرنسي",
    season: "2026/2027",
    homeName: "لانس",
    homeNameEn: "RC Lens",
    homeLogo: "https://crests.football-data.org/546.png",
    awayName: "أولمبيك ليون",
    awayNameEn: "Olympique Lyonnais",
    awayLogo: "https://crests.football-data.org/523.png",
    scheduledAt: "2026-10-09T18:45:00.000Z",
    status: "upcoming",
    homeScore: null,
    awayScore: null,
    venue: "ملعب بولار ديلولي (لانس)",
    referee: "",
    isPublished: true,
    createdBy: "editorial",
    createdAt: "2026-10-08T12:00:00.000Z",
    updatedAt: "2026-10-08T12:00:00.000Z",
  },
  {
    id: "adm_match_malaga_espanyol_20261009",
    slug: "malaga-vs-espanyol",
    sport: "football",
    competitionSlug: "la-liga",
    competitionName: "الدوري الإسباني",
    season: "2026/2027",
    homeName: "مالقا",
    homeNameEn: "Málaga CF",
    homeLogo: "https://crests.football-data.org/84.png",
    awayName: "إسبانيول",
    awayNameEn: "RCD Espanyol",
    awayLogo: "https://crests.football-data.org/80.png",
    scheduledAt: "2026-10-09T19:00:00.000Z",
    status: "upcoming",
    homeScore: null,
    awayScore: null,
    venue: "ملعب لا روزاليدا (مالقة)",
    referee: "",
    isPublished: true,
    createdBy: "editorial",
    createdAt: "2026-10-08T12:00:00.000Z",
    updatedAt: "2026-10-08T12:00:00.000Z",
  },
];

/* ── validation ───────────────────────────────────────────────── */

const SLUG_RE = /[^a-z0-9\u0600-\u06FF]+/g;

export function slugifyMatch(home: string, away: string, scheduledAt: string): string {
  const part = (v: string) =>
    v
      .trim()
      .toLowerCase()
      .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
      .replace(SLUG_RE, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
  const date = new Date(scheduledAt);
  const datePart = Number.isFinite(+date) ? date.toISOString().slice(0, 10) : "";
  const base = [part(home) || "home", part(away) || "away", datePart].filter(Boolean).join("-");
  return base.slice(0, 120);
}

function cleanText(v: unknown, max = 160): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function parseScore(v: unknown): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n >= 0 && n <= 99 ? n : null;
}

/**
 * Interpret a wall-clock date+time in the SITE timezone (Africa/Cairo) and
 * return the UTC instant. The admin forms are Cairo-local by design — the
 * same anchor every public page uses for display.
 */
export function scheduledAtFromLocal(date: string, time: string): string | null {
  const d = cleanText(date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const t = cleanText(time, 5);
  const hhmm = /^\d{2}:\d{2}$/.test(t) ? t : "20:00";
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, day, hh, mm);
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: SITE_TZ,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const parts = dtf.formatToParts(new Date(guess));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
    const offset = asUtc - guess;
    return new Date(guess - offset).toISOString();
  } catch {
    return new Date(guess).toISOString();
  }
}

/** Split a UTC instant into Cairo-local { date, time } for form prefill. */
export function matchDateTimeLocal(isoStr: string): { date: string; time: string } {
  try {
    const dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone: SITE_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = dtf.formatToParts(new Date(isoStr));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return {
      date: `${get("year")}-${get("month")}-${get("day")}`,
      time: `${String(get("hour")).padStart(2, "0")}:${get("minute")}`,
    };
  } catch {
    return { date: isoStr.slice(0, 10), time: isoStr.slice(11, 16) };
  }
}

function parseScheduledAt(date: string, time: string): string | null {
  return scheduledAtFromLocal(date, time);
}

export interface AdminMatchInput {
  sport: string;
  competitionSlug: string;
  competitionName: string;
  season?: string;
  homeName: string;
  homeNameEn?: string;
  homeLogo?: string;
  awayName: string;
  awayNameEn?: string;
  awayLogo?: string;
  date: string;
  time: string;
  status: AdminMatchStatus;
  homeScore?: number | null;
  awayScore?: number | null;
  venue?: string;
  referee?: string;
  isPublished?: boolean;
  slug?: string;
}

export function validateMatchInput(input: AdminMatchInput): string | null {
  if (!cleanText(input.homeName, 2)) return "اسم الفريق المضيف مطلوب";
  if (!cleanText(input.awayName, 2)) return "اسم الفريق الضيف مطلوب";
  if (!cleanText(input.competitionSlug, 2)) return "البطولة مطلوبة";
  if (!parseScheduledAt(input.date, input.time)) return "التاريخ غير صالح (YYYY-MM-DD)";
  if (!ADMIN_MATCH_STATUSES.includes(input.status)) return "الحالة غير صالحة";
  if (!cleanText(input.sport, 2)) return "الرياضة مطلوبة";
  for (const [label, raw] of [["أهداف المضيف", input.homeScore], ["أهداف الضيف", input.awayScore]] as const) {
    if (raw !== null && raw !== undefined && (!Number.isInteger(raw) || raw < 0)) return `${label} يجب أن يكون رقمًا صحيحًا غير سالب`;
  }
  return null;
}

/* ── storage (Postgres → memory) ──────────────────────────────── */

const DDL = `
CREATE TABLE IF NOT EXISTS admin_matches (
  id               TEXT PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  sport            TEXT NOT NULL DEFAULT 'football',
  competition_slug TEXT NOT NULL,
  competition_name TEXT NOT NULL DEFAULT '',
  season           TEXT NOT NULL DEFAULT '',
  home_name        TEXT NOT NULL,
  home_name_en     TEXT NOT NULL DEFAULT '',
  home_logo        TEXT NOT NULL DEFAULT '',
  away_name        TEXT NOT NULL,
  away_name_en     TEXT NOT NULL DEFAULT '',
  away_logo        TEXT NOT NULL DEFAULT '',
  scheduled_at     TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'upcoming'
                   CHECK (status IN ('upcoming','live','finished','postponed','cancelled')),
  home_score       INTEGER,
  away_score       INTEGER,
  venue            TEXT NOT NULL DEFAULT '',
  referee          TEXT NOT NULL DEFAULT '',
  is_published     BOOLEAN NOT NULL DEFAULT false,
  created_by       TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_matches_scheduled ON admin_matches(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_admin_matches_competition ON admin_matches(competition_slug);
CREATE INDEX IF NOT EXISTS idx_admin_matches_status ON admin_matches(status);
CREATE INDEX IF NOT EXISTS idx_admin_matches_published ON admin_matches(is_published);
`;

const mem = new Map<string, AdminMatch>();
let ddlDone = false;
let memInitialized = false;

const MATCHES_FILE = path.join(process.cwd(), "db", "admin-matches.json");

function loadDiskMatches(): AdminMatch[] {
  if (process.env.NEMO_TEST_MEMORY_ONLY === "1") return [];
  try {
    if (fs.existsSync(MATCHES_FILE)) {
      const raw = fs.readFileSync(MATCHES_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // fall through
  }
  return INITIAL_ADMIN_MATCHES;
}

function saveDiskMatches(list: AdminMatch[]): void {
  if (process.env.NEMO_TEST_MEMORY_ONLY === "1" || process.env.NODE_ENV === "production") return;
  try {
    const dir = path.dirname(MATCHES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MATCHES_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch {
    // safe ignore in environments with read-only root
  }
}

function initMem(): void {
  if (memInitialized && mem.size > 0) return;
  memInitialized = true;
  const initial = loadDiskMatches();
  for (const m of initial) mem.set(m.id, m);
  saveDiskMatches(initial);
}

const now = () => new Date().toISOString();

function genId(): string {
  return `adm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
        const existing = await db.select<{ c: string }>("SELECT COUNT(*)::text AS c FROM admin_matches", []);
        if (existing[0]?.c === "0" && process.env.NEMO_BOOTSTRAP_LEGACY_DATA === "1") {
          for (const m of INITIAL_ADMIN_MATCHES) {
            await db.run(
              `INSERT INTO admin_matches (id, slug, sport, competition_slug, competition_name, season, home_name, home_name_en, home_logo, away_name, away_name_en, away_logo, scheduled_at, status, home_score, away_score, venue, referee, is_published, created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) ON CONFLICT (slug) DO NOTHING`,
              [
                m.id, m.slug, m.sport, m.competitionSlug, m.competitionName, m.season,
                m.homeName, m.homeNameEn, m.homeLogo, m.awayName, m.awayNameEn, m.awayLogo,
                m.scheduledAt, m.status, m.homeScore, m.awayScore, m.venue, m.referee, m.isPublished, m.createdBy,
              ],
            );
          }
        }
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

function fromRow(r: Row): AdminMatch {
  return {
    id: String(r.id),
    slug: String(r.slug),
    sport: String(r.sport ?? "football"),
    competitionSlug: String(r.competition_slug ?? ""),
    competitionName: String(r.competition_name ?? ""),
    season: String(r.season ?? ""),
    homeName: String(r.home_name ?? ""),
    homeNameEn: String(r.home_name_en ?? ""),
    homeLogo: String(r.home_logo ?? ""),
    awayName: String(r.away_name ?? ""),
    awayNameEn: String(r.away_name_en ?? ""),
    awayLogo: String(r.away_logo ?? ""),
    scheduledAt: iso(r.scheduled_at),
    status: (String(r.status) as AdminMatchStatus) || "upcoming",
    homeScore: r.home_score === null || r.home_score === undefined ? null : Number(r.home_score),
    awayScore: r.away_score === null || r.away_score === undefined ? null : Number(r.away_score),
    venue: String(r.venue ?? ""),
    referee: String(r.referee ?? ""),
    isPublished: r.is_published === true,
    createdBy: String(r.created_by ?? ""),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

async function allMatches(): Promise<AdminMatch[]> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<Row>("SELECT * FROM admin_matches ORDER BY scheduled_at DESC, created_at DESC", []);
      return rows.map(fromRow);
    } catch {
      // fall through
    }
  }
  initMem();
  return [...mem.values()].sort(
    (a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt) || b.createdAt.localeCompare(a.createdAt),
  );
}

/* ── reads ────────────────────────────────────────────────────── */

export interface AdminMatchFilter {
  q?: string;
  sport?: string;
  competition?: string;
  status?: string;
  date?: string; // YYYY-MM-DD (site-local day match)
  publishedOnly?: boolean;
  limit?: number;
}

function dayKey(isoStr: string): string {
  // Site display day (Africa/Cairo) — same anchor the public pages use.
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(isoStr));
  } catch {
    return isoStr.slice(0, 10);
  }
}

export async function listAdminMatches(filter: AdminMatchFilter = {}): Promise<AdminMatch[]> {
  let list = await allMatches();
  const q = filter.q?.trim().toLowerCase();
  if (q) {
    list = list.filter((m) =>
      [m.homeName, m.awayName, m.homeNameEn, m.awayNameEn, m.competitionName, m.slug, m.venue]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }
  if (filter.sport) list = list.filter((m) => m.sport === filter.sport);
  if (filter.competition) list = list.filter((m) => m.competitionSlug === filter.competition);
  if (filter.status && ADMIN_MATCH_STATUSES.includes(filter.status as AdminMatchStatus)) {
    list = list.filter((m) => m.status === filter.status);
  }
  if (filter.date) list = list.filter((m) => dayKey(m.scheduledAt) === filter.date);
  if (filter.publishedOnly) list = list.filter((m) => m.isPublished);
  const limit = Math.min(500, Math.max(1, filter.limit ?? 200));
  return list.slice(0, limit);
}

export async function getAdminMatchBySlug(slug: string): Promise<AdminMatch | null> {
  const list = await allMatches();
  const target = decodeSlug(slug).trim().toLowerCase();
  const exact = list.find((m) => m.slug.toLowerCase() === target || m.id === target);
  if (exact) return exact;
  // Backward-compatible undated aliases only if there is one unambiguous record.
  // A requested date must never resolve to a different meeting.
  if (/-20\d{2}-\d{2}-\d{2}$/.test(target)) return null;
  const aliases = list.filter((m) => m.slug.toLowerCase().replace(/-20\d{2}-\d{2}-\d{2}$/, "") === target);
  return aliases.length === 1 ? aliases[0] : null;
}

export async function getAdminMatchById(id: string): Promise<AdminMatch | null> {
  const list = await allMatches();
  return list.find((m) => m.id === id) ?? null;
}

export async function adminMatchCounts(): Promise<{
  total: number;
  published: number;
  live: number;
  upcoming: number;
  today: number;
}> {
  const list = await allMatches();
  const today = dayKey(now());
  return {
    total: list.length,
    published: list.filter((m) => m.isPublished).length,
    live: list.filter((m) => m.status === "live").length,
    upcoming: list.filter((m) => m.status === "upcoming").length,
    today: list.filter((m) => dayKey(m.scheduledAt) === today).length,
  };
}

/** Published admin matches as SDL fixtures — the public merge boundary. */
export async function publishedAdminFixtures(limit = 200): Promise<NormalizedFixture[]> {
  const list = await listAdminMatches({ publishedOnly: true, limit });
  return list.map(adminMatchToFixture);
}

export function adminMatchToFixture(m: AdminMatch): NormalizedFixture {
  return {
    providerId: m.slug,
    sport: m.sport,
    competitionProviderId: m.competitionSlug,
    seasonProviderId: m.season || null,
    round: null,
    homeProviderId: null,
    awayProviderId: null,
    scheduledAt: m.scheduledAt,
    status: STATUS_TO_FIXTURE[m.status],
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    periods: [],
    venueProviderId: null,
    venueName: m.venue || null,
    attendance: null,
    minute: m.status === "live" ? null : null,
    homeName: m.homeName,
    awayName: m.awayName,
    homeLogoUrl: m.homeLogo || null,
    awayLogoUrl: m.awayLogo || null,
    competitionName: m.competitionName || null,
    sourceUrl: null,
    editorialUpdatedAt: m.updatedAt,
  };
}

/* ── writes ───────────────────────────────────────────────────── */

export async function createAdminMatch(
  input: AdminMatchInput,
  createdBy = "",
): Promise<{ ok: true; match: AdminMatch } | { ok: false; error: string }> {
  const err = validateMatchInput(input);
  if (err) return { ok: false, error: err };

  const scheduledAt = parseScheduledAt(input.date, input.time)!;
  const t = now();
  const baseSlug = cleanText(input.slug, 120) || slugifyMatch(input.homeName, input.awayName, scheduledAt);

  // Guarantee slug uniqueness.
  let slug = baseSlug;
  let n = 2;
  while (await getAdminMatchBySlug(slug)) {
    slug = `${baseSlug}-${n}`;
    n += 1;
  }

  const match: AdminMatch = {
    id: genId(),
    slug,
    sport: cleanText(input.sport, 40) || "football",
    competitionSlug: cleanText(input.competitionSlug, 120),
    competitionName: cleanText(input.competitionName, 160),
    season: cleanText(input.season, 40),
    homeName: cleanText(input.homeName, 160),
    homeNameEn: cleanText(input.homeNameEn, 160),
    homeLogo: cleanText(input.homeLogo, 1000),
    awayName: cleanText(input.awayName, 160),
    awayNameEn: cleanText(input.awayNameEn, 160),
    awayLogo: cleanText(input.awayLogo, 1000),
    scheduledAt,
    status: input.status,
    homeScore: parseScore(input.homeScore),
    awayScore: parseScore(input.awayScore),
    venue: cleanText(input.venue, 200),
    referee: cleanText(input.referee, 160),
    isPublished: input.isPublished === true,
    createdBy,
    createdAt: t,
    updatedAt: t,
  };

  const db = await pg();
  try {
    const inDb = await persistOrThrow(db, (d) =>
      d.run(
        `INSERT INTO admin_matches (id, slug, sport, competition_slug, competition_name, season,
           home_name, home_name_en, home_logo, away_name, away_name_en, away_logo,
           scheduled_at, status, home_score, away_score, venue, referee, is_published,
           created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          match.id, match.slug, match.sport, match.competitionSlug, match.competitionName, match.season,
          match.homeName, match.homeNameEn, match.homeLogo, match.awayName, match.awayNameEn, match.awayLogo,
          match.scheduledAt, match.status, match.homeScore, match.awayScore, match.venue, match.referee,
          match.isPublished, match.createdBy, match.createdAt, match.updatedAt,
        ],
      ),
    );
    if (!inDb) {
      mem.set(match.id, match);
      saveDiskMatches([...mem.values()]);
    }
  } catch (e) {
    return { ok: false, error: storeErrorMessage(e) };
  }
  return { ok: true, match };
}

export async function updateAdminMatch(
  id: string,
  patch: Partial<AdminMatchInput> & { isPublished?: boolean },
): Promise<{ ok: true; match: AdminMatch } | { ok: false; error: string }> {
  const list = await allMatches();
  const found = list.find((m) => m.id === id);
  if (!found) return { ok: false, error: "المباراة غير موجودة" };

  const merged: AdminMatchInput = {
    sport: patch.sport ?? found.sport,
    competitionSlug: patch.competitionSlug ?? found.competitionSlug,
    competitionName: patch.competitionName ?? found.competitionName,
    season: patch.season ?? found.season,
    homeName: patch.homeName ?? found.homeName,
    homeNameEn: patch.homeNameEn ?? found.homeNameEn,
    homeLogo: patch.homeLogo ?? found.homeLogo,
    awayName: patch.awayName ?? found.awayName,
    awayNameEn: patch.awayNameEn ?? found.awayNameEn,
    awayLogo: patch.awayLogo ?? found.awayLogo,
    date: patch.date ?? found.scheduledAt.slice(0, 10),
    time: patch.time ?? found.scheduledAt.slice(11, 16),
    status: patch.status ?? found.status,
    homeScore: patch.homeScore !== undefined ? patch.homeScore : found.homeScore,
    awayScore: patch.awayScore !== undefined ? patch.awayScore : found.awayScore,
    venue: patch.venue ?? found.venue,
    referee: patch.referee ?? found.referee,
    isPublished: patch.isPublished !== undefined ? patch.isPublished : found.isPublished,
    slug: patch.slug ?? found.slug,
  };
  const err = validateMatchInput(merged);
  if (err) return { ok: false, error: err };

  found.sport = cleanText(merged.sport, 40) || "football";
  found.competitionSlug = cleanText(merged.competitionSlug, 120);
  found.competitionName = cleanText(merged.competitionName, 160);
  found.season = cleanText(merged.season, 40);
  found.homeName = cleanText(merged.homeName, 160);
  found.homeNameEn = cleanText(merged.homeNameEn, 160);
  found.homeLogo = cleanText(merged.homeLogo, 1000);
  found.awayName = cleanText(merged.awayName, 160);
  found.awayNameEn = cleanText(merged.awayNameEn, 160);
  found.awayLogo = cleanText(merged.awayLogo, 1000);
  found.scheduledAt = parseScheduledAt(merged.date, merged.time)!;
  found.status = merged.status;
  found.homeScore = parseScore(merged.homeScore);
  found.awayScore = parseScore(merged.awayScore);
  found.venue = cleanText(merged.venue, 200);
  found.referee = cleanText(merged.referee, 160);
  found.isPublished = merged.isPublished === true;
  if (patch.slug && patch.slug.trim() && patch.slug.trim() !== found.slug) {
    const newSlug = cleanText(patch.slug, 120);
    if (await getAdminMatchBySlug(newSlug)) return { ok: false, error: "الـ slug مستخدم بالفعل" };
    found.slug = newSlug;
  }
  found.updatedAt = now();

  const db = await pg();
  try {
    const inDb = await persistOrThrow(db, (d) =>
      d.run(
        `UPDATE admin_matches SET slug=$2, sport=$3, competition_slug=$4, competition_name=$5, season=$6,
           home_name=$7, home_name_en=$8, home_logo=$9, away_name=$10, away_name_en=$11, away_logo=$12,
           scheduled_at=$13, status=$14, home_score=$15, away_score=$16, venue=$17, referee=$18,
           is_published=$19, updated_at=now() WHERE id=$1`,
        [
          found.id, found.slug, found.sport, found.competitionSlug, found.competitionName, found.season,
          found.homeName, found.homeNameEn, found.homeLogo, found.awayName, found.awayNameEn, found.awayLogo,
          found.scheduledAt, found.status, found.homeScore, found.awayScore, found.venue, found.referee,
          found.isPublished,
        ],
      ),
    );
    if (!inDb) {
      mem.set(found.id, found);
      saveDiskMatches([...mem.values()]);
    }
  } catch (e) {
    return { ok: false, error: storeErrorMessage(e) };
  }
  return { ok: true, match: found };
}

export async function setAdminMatchPublished(id: string, isPublished: boolean): Promise<boolean> {
  const list = await allMatches();
  const found = list.find((m) => m.id === id);
  if (!found) return false;
  found.isPublished = isPublished;
  found.updatedAt = now();
  const db = await pg();
  const inDb = await persistOrThrow(db, (d) => d.run("UPDATE admin_matches SET is_published = $2, updated_at = now() WHERE id = $1", [id, isPublished]));
  if (!inDb) {
    mem.set(id, found);
    saveDiskMatches([...mem.values()]);
  }
  return true;
}

/** Hard delete. Streams bound to the match are removed as well (their link only). */
export async function deleteAdminMatch(id: string): Promise<boolean> {
  const list = await allMatches();
  const found = list.find((m) => m.id === id);
  if (!found) return false;
  const db = await pg();
  const inDb = await persistOrThrow(db, (d) => d.run("DELETE FROM admin_matches WHERE id = $1", [id]));
  if (!inDb) {
    mem.delete(id);
    saveDiskMatches([...mem.values()]);
  }
  return true;
}
