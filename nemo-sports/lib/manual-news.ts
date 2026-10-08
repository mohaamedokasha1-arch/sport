/**
 * NEMO Sports · manually-created news (editorial)
 * ───────────────────────────────────────────────────────────────────
 * News articles written from the admin panel (/admin/news → news manually).
 * Distinct from the automatic RSS pipeline (lib/news/store.ts): an editorial
 * article has a full body written by the team, an image, and MUST carry a
 * real source name + source URL (requirement §11 — no article is published
 * without a real source).
 *
 *   · Statuses: draft / published / hidden.
 *   · The body is stored and rendered as PLAIN TEXT (paragraphs split on
 *     blank lines) — never as raw HTML — so stored content cannot inject
 *     scripts (XSS-safe by construction).
 *   · Storage: Postgres (`manual_news`) when DATABASE_URL is configured,
 *     in-process memory otherwise.
 */

import { getDb } from "@/lib/db/pg";
import { persistOrThrow, storeErrorMessage } from "@/lib/db/store-policy";

export type ManualNewsStatus = "draft" | "published" | "hidden";

export const MANUAL_NEWS_STATUSES: ManualNewsStatus[] = ["draft", "published", "hidden"];

export const MANUAL_NEWS_STATUS_AR: Record<ManualNewsStatus, string> = {
  draft: "مسودة",
  published: "منشور",
  hidden: "مخفي",
};

export interface ManualNews {
  id: string;
  slug: string;
  title: string;
  titleEn: string;
  imageUrl: string;
  description: string;
  /** plain-text body (paragraphs separated by blank lines) */
  content: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string;
  category: string;
  relatedTeam: string;
  relatedCompetition: string;
  status: ManualNewsStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const SLUG_RE = /[^a-z0-9\u0600-\u06FF]+/g;

export function slugifyNews(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(SLUG_RE, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

function cleanText(v: unknown, max = 2000): string {
  return String(v ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim().slice(0, max);
}

function cleanUrl(v: unknown, max = 1000): string {
  const s = String(v ?? "").trim().slice(0, max);
  if (!s) return "";
  // Only http(s) URLs are accepted — no javascript:/data: schemes.
  return /^https?:\/\//i.test(s) ? s : "";
}

function parseDate(v: unknown): string | null {
  const s = cleanText(v, 30);
  if (!s) return null;
  const d = new Date(s.length === 10 ? `${s}T00:00:00.000Z` : s);
  return Number.isFinite(+d) ? d.toISOString() : null;
}

export interface ManualNewsInput {
  title: string;
  titleEn?: string;
  imageUrl?: string;
  description?: string;
  content?: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt?: string;
  category?: string;
  relatedTeam?: string;
  relatedCompetition?: string;
  status?: ManualNewsStatus;
  slug?: string;
}

export function validateNewsInput(input: ManualNewsInput): string | null {
  if (!cleanText(input.title, 2)) return "عنوان الخبر مطلوب";
  if (!cleanText(input.sourceName, 2)) return "اسم المصدر مطلوب — لا يمكن نشر خبر بدون مصدر حقيقي";
  const sourceUrl = cleanUrl(input.sourceUrl);
  if (!sourceUrl) return "رابط المصدر مطلوب — يجب أن يكون رابط HTTP/HTTPS صالح";
  return null;
}

const DDL = `
CREATE TABLE IF NOT EXISTS manual_news (
  id                 TEXT PRIMARY KEY,
  slug               TEXT NOT NULL UNIQUE,
  title              TEXT NOT NULL,
  title_en           TEXT NOT NULL DEFAULT '',
  image_url          TEXT NOT NULL DEFAULT '',
  description        TEXT NOT NULL DEFAULT '',
  content            TEXT NOT NULL DEFAULT '',
  source_name        TEXT NOT NULL,
  source_url         TEXT NOT NULL,
  published_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  category           TEXT NOT NULL DEFAULT 'أخبار',
  related_team       TEXT NOT NULL DEFAULT '',
  related_competition TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','published','hidden')),
  created_by         TEXT NOT NULL DEFAULT '',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_manual_news_status ON manual_news(status);
CREATE INDEX IF NOT EXISTS idx_manual_news_published ON manual_news(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_manual_news_category ON manual_news(category);
`;

const mem = new Map<string, ManualNews>();
let ddlDone = false;
const now = () => new Date().toISOString();
const genId = () => `news_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

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

function fromRow(r: Row): ManualNews {
  return {
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title ?? ""),
    titleEn: String(r.title_en ?? ""),
    imageUrl: String(r.image_url ?? ""),
    description: String(r.description ?? ""),
    content: String(r.content ?? ""),
    sourceName: String(r.source_name ?? ""),
    sourceUrl: String(r.source_url ?? ""),
    publishedAt: iso(r.published_at),
    category: String(r.category ?? "أخبار"),
    relatedTeam: String(r.related_team ?? ""),
    relatedCompetition: String(r.related_competition ?? ""),
    status: (String(r.status) as ManualNewsStatus) || "draft",
    createdBy: String(r.created_by ?? ""),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

async function allNews(): Promise<ManualNews[]> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<Row>("SELECT * FROM manual_news ORDER BY published_at DESC, created_at DESC", []);
      return rows.map(fromRow);
    } catch {
      // fall through
    }
  }
  return [...mem.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export interface ManualNewsFilter {
  q?: string;
  status?: ManualNewsStatus;
  category?: string;
  publishedOnly?: boolean;
  limit?: number;
}

export async function listManualNews(filter: ManualNewsFilter = {}): Promise<ManualNews[]> {
  let list = await allNews();
  const q = filter.q?.trim().toLowerCase();
  if (q) {
    list = list.filter((n) => [n.title, n.titleEn, n.description, n.sourceName].join(" ").toLowerCase().includes(q));
  }
  if (filter.status) list = list.filter((n) => n.status === filter.status);
  if (filter.category) list = list.filter((n) => n.category === filter.category);
  if (filter.publishedOnly) list = list.filter((n) => n.status === "published");
  return list.slice(0, Math.min(300, Math.max(1, filter.limit ?? 100)));
}

export async function getManualNewsBySlug(slug: string): Promise<ManualNews | null> {
  const list = await allNews();
  return list.find((n) => n.slug === slug) ?? null;
}

export async function getManualNewsById(id: string): Promise<ManualNews | null> {
  const list = await allNews();
  return list.find((n) => n.id === id) ?? null;
}

export async function manualNewsCounts(): Promise<Record<ManualNewsStatus, number>> {
  const list = await allNews();
  return {
    draft: list.filter((n) => n.status === "draft").length,
    published: list.filter((n) => n.status === "published").length,
    hidden: list.filter((n) => n.status === "hidden").length,
  };
}

/** Published articles as plain-text paragraphs (XSS-safe rendering boundary). */
export function newsParagraphs(content: string): string[] {
  return String(content ?? "")
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

const COLUMNS = `id, slug, title, title_en, image_url, description, content, source_name, source_url,
  published_at, category, related_team, related_competition, status, created_by, created_at, updated_at`;

function valuesOf(n: ManualNews): unknown[] {
  return [
    n.id, n.slug, n.title, n.titleEn, n.imageUrl, n.description, n.content, n.sourceName, n.sourceUrl,
    n.publishedAt, n.category, n.relatedTeam, n.relatedCompetition, n.status, n.createdBy, n.createdAt, n.updatedAt,
  ];
}

export async function createManualNews(
  input: ManualNewsInput,
  createdBy = "",
): Promise<{ ok: true; article: ManualNews } | { ok: false; error: string }> {
  const err = validateNewsInput(input);
  if (err) return { ok: false, error: err };

  const t = now();
  const baseSlug = cleanText(input.slug, 100) || slugifyNews(input.title);
  let slug = baseSlug || `news-${Date.now().toString(36)}`;
  let n = 2;
  while ((await allNews()).some((x) => x.slug === slug)) {
    slug = `${baseSlug}-${n}`;
    n += 1;
  }

  const status = input.status && (MANUAL_NEWS_STATUSES as string[]).includes(input.status) ? input.status : "draft";
  const article: ManualNews = {
    id: genId(),
    slug,
    title: cleanText(input.title, 300),
    titleEn: cleanText(input.titleEn, 300),
    imageUrl: cleanUrl(input.imageUrl),
    description: cleanText(input.description, 600),
    content: cleanText(input.content, 20000),
    sourceName: cleanText(input.sourceName, 160),
    sourceUrl: cleanUrl(input.sourceUrl),
    publishedAt: parseDate(input.publishedAt) ?? t,
    category: cleanText(input.category, 80) || "أخبار",
    relatedTeam: cleanText(input.relatedTeam, 120),
    relatedCompetition: cleanText(input.relatedCompetition, 120),
    status,
    createdBy,
    createdAt: t,
    updatedAt: t,
  };

  const db = await pg();
  try {
    const inDb = await persistOrThrow(db, (d) =>
      d.run(
        `INSERT INTO manual_news (${COLUMNS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        valuesOf(article),
      ),
    );
    if (!inDb) mem.set(article.id, article);
  } catch (e) {
    return { ok: false, error: storeErrorMessage(e) };
  }
  return { ok: true, article };
}

export async function updateManualNews(
  id: string,
  patch: Partial<ManualNewsInput>,
): Promise<{ ok: true; article: ManualNews } | { ok: false; error: string }> {
  const list = await allNews();
  const found = list.find((n) => n.id === id);
  if (!found) return { ok: false, error: "الخبر غير موجود" };

  if (patch.title !== undefined) found.title = cleanText(patch.title, 300);
  if (!found.title) return { ok: false, error: "عنوان الخبر مطلوب" };
  if (patch.titleEn !== undefined) found.titleEn = cleanText(patch.titleEn, 300);
  if (patch.imageUrl !== undefined) found.imageUrl = cleanUrl(patch.imageUrl);
  if (patch.description !== undefined) found.description = cleanText(patch.description, 600);
  if (patch.content !== undefined) found.content = cleanText(patch.content, 20000);
  if (patch.sourceName !== undefined) found.sourceName = cleanText(patch.sourceName, 160);
  if (!found.sourceName) return { ok: false, error: "اسم المصدر مطلوب" };
  if (patch.sourceUrl !== undefined) {
    found.sourceUrl = cleanUrl(patch.sourceUrl);
    if (!found.sourceUrl) return { ok: false, error: "رابط المصدر يجب أن يكون HTTP/HTTPS صالح" };
  }
  if (patch.publishedAt !== undefined) {
    const d = parseDate(patch.publishedAt);
    if (d) found.publishedAt = d;
  }
  if (patch.category !== undefined) found.category = cleanText(patch.category, 80) || "أخبار";
  if (patch.relatedTeam !== undefined) found.relatedTeam = cleanText(patch.relatedTeam, 120);
  if (patch.relatedCompetition !== undefined) found.relatedCompetition = cleanText(patch.relatedCompetition, 120);
  if (patch.status !== undefined && (MANUAL_NEWS_STATUSES as string[]).includes(patch.status)) {
    found.status = patch.status;
  }
  if (patch.slug && patch.slug.trim() && patch.slug.trim() !== found.slug) {
    const newSlug = cleanText(patch.slug, 100);
    if ((await allNews()).some((x) => x.slug === newSlug && x.id !== id)) {
      return { ok: false, error: "الـ slug مستخدم بالفعل" };
    }
    found.slug = newSlug;
  }
  found.updatedAt = now();

  const db = await pg();
  try {
    const inDb = await persistOrThrow(db, (d) =>
      d.run(
        `UPDATE manual_news SET slug=$2, title=$3, title_en=$4, image_url=$5, description=$6, content=$7,
           source_name=$8, source_url=$9, published_at=$10, category=$11, related_team=$12,
           related_competition=$13, status=$14, updated_at=now() WHERE id=$1`,
        [
          id, found.slug, found.title, found.titleEn, found.imageUrl, found.description, found.content,
          found.sourceName, found.sourceUrl, found.publishedAt, found.category, found.relatedTeam,
          found.relatedCompetition, found.status,
        ],
      ),
    );
    if (!inDb) mem.set(id, found);
  } catch (e) {
    return { ok: false, error: storeErrorMessage(e) };
  }
  return { ok: true, article: found };
}

export async function setManualNewsStatus(id: string, status: ManualNewsStatus): Promise<boolean> {
  const list = await allNews();
  const found = list.find((n) => n.id === id);
  if (!found) return false;
  found.status = status;
  found.updatedAt = now();
  const db = await pg();
  const inDb = await persistOrThrow(db, (d) => d.run("UPDATE manual_news SET status = $2, updated_at = now() WHERE id = $1", [id, status]));
  if (!inDb) mem.set(id, found);
  return true;
}

export async function deleteManualNews(id: string): Promise<boolean> {
  const db = await pg();
  const inDb = await persistOrThrow(db, (d) => d.run("DELETE FROM manual_news WHERE id = $1", [id]));
  if (!inDb) mem.delete(id);
  return true;
}
