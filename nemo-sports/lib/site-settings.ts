/**
 * NEMO Sports · site settings (key/value store)
 * ───────────────────────────────────────────────────────────────────
 * Operator-editable site configuration managed from /admin/settings.
 * Sensitive sections (everything on that page) are super_admin-only.
 *
 *   · Storage: Postgres (`site_settings` key/value JSONB) when DATABASE_URL
 *     is configured, in-process memory otherwise.
 *   · Values are plain JSON — no secrets belong here (secrets stay in env).
 *   · getSiteSettings() always returns a complete object (defaults merged),
 *     so consumers never handle missing keys.
 */

import { getDb } from "@/lib/db/pg";
import { persistOrThrow, storeErrorMessage } from "@/lib/db/store-policy";

export interface SiteSettings {
  siteName: string;
  siteNameAr: string;
  logoUrl: string;
  contactEmail: string;
  defaultLanguage: "ar" | "en";
  timezone: string;
  social: {
    twitter: string;
    facebook: string;
    instagram: string;
    youtube: string;
    telegram: string;
  };
  live: {
    /** default label suggested when registering a stream */
    defaultStreamLabel: string;
    /** when false, publishing a stream is blocked from the UI (safety switch) */
    publishingEnabled: boolean;
  };
  news: {
    /** auto-publish RSS articles instead of holding them for review */
    autoPublish: boolean;
  };
  seo: {
    metaDescription: string;
    keywords: string;
  };
}

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: "NEMO Sports",
  siteNameAr: "نيمو سبورتس",
  logoUrl: "",
  contactEmail: "",
  defaultLanguage: "ar",
  timezone: "Africa/Cairo",
  social: { twitter: "", facebook: "", instagram: "", youtube: "", telegram: "" },
  live: { defaultStreamLabel: "البث المباشر", publishingEnabled: true },
  news: { autoPublish: false },
  seo: {
    metaDescription:
      "مواعيد ونتائج المباريات من مصادر البيانات المتاحة، مع توضيح حالة التحديث وعدم عرض بيانات غير مؤكدة.",
    keywords: "نتائج المباريات, مباريات اليوم, جدول المباريات, نتائج كرة القدم",
  },
};

const DDL = `
CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL DEFAULT ''
);
`;

const mem = new Map<string, { value: unknown; updatedAt: string; updatedBy: string }>();
let ddlDone = false;
const now = () => new Date().toISOString();

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

function parseValue(raw: unknown): unknown {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw === "string" && raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

/** Read all stored key/value pairs. */
async function readAll(): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<Row>("SELECT key, value FROM site_settings", []);
      for (const r of rows) {
        const v = parseValue(r.value);
        if (v !== null && v !== undefined) out.set(String(r.key), v);
      }
      return out;
    } catch {
      // fall through
    }
  }
  for (const [k, v] of mem) out.set(k, v.value);
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v && typeof v === "object" && !Array.isArray(v));
}

function mergeSettings(stored: Map<string, unknown>): SiteSettings {
  const merged: SiteSettings = structuredClone(DEFAULT_SETTINGS);
  const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

  const siteName = stored.get("siteName");
  if (siteName !== undefined) merged.siteName = str(siteName, merged.siteName);
  const siteNameAr = stored.get("siteNameAr");
  if (siteNameAr !== undefined) merged.siteNameAr = str(siteNameAr, merged.siteNameAr);
  const logoUrl = stored.get("logoUrl");
  if (logoUrl !== undefined) merged.logoUrl = str(logoUrl, merged.logoUrl);
  const contactEmail = stored.get("contactEmail");
  if (contactEmail !== undefined) merged.contactEmail = str(contactEmail, merged.contactEmail);
  const timezone = stored.get("timezone");
  if (timezone !== undefined) merged.timezone = str(timezone, merged.timezone);
  const lang = stored.get("defaultLanguage");
  if (lang === "ar" || lang === "en") merged.defaultLanguage = lang;

  const social = stored.get("social");
  if (isPlainObject(social)) {
    for (const k of Object.keys(merged.social) as (keyof SiteSettings["social"])[]) {
      merged.social[k] = str(social[k], merged.social[k]);
    }
  }
  const live = stored.get("live");
  if (isPlainObject(live)) {
    merged.live.defaultStreamLabel = str(live.defaultStreamLabel, merged.live.defaultStreamLabel);
    merged.live.publishingEnabled = bool(live.publishingEnabled, merged.live.publishingEnabled);
  }
  const news = stored.get("news");
  if (isPlainObject(news)) merged.news.autoPublish = bool(news.autoPublish, merged.news.autoPublish);
  const seo = stored.get("seo");
  if (isPlainObject(seo)) {
    merged.seo.metaDescription = str(seo.metaDescription, merged.seo.metaDescription);
    merged.seo.keywords = str(seo.keywords, merged.seo.keywords);
  }
  return merged;
}

/** Complete settings object (defaults merged with stored overrides). */
export async function getSiteSettings(): Promise<SiteSettings> {
  return mergeSettings(await readAll());
}

export type SiteSettingsPatch = {
  siteName?: string;
  siteNameAr?: string;
  logoUrl?: string;
  contactEmail?: string;
  defaultLanguage?: "ar" | "en";
  timezone?: string;
  social?: Partial<SiteSettings["social"]>;
  live?: Partial<SiteSettings["live"]>;
  news?: Partial<SiteSettings["news"]>;
  seo?: Partial<SiteSettings["seo"]>;
};

function cleanUrl(v: unknown): string {
  const s = String(v ?? "").trim().slice(0, 1000);
  return /^https?:\/\//i.test(s) ? s : "";
}

function cleanEmail(v: unknown): string {
  const s = String(v ?? "").trim().slice(0, 200);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : "";
}

function cleanText(v: unknown, max = 500): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Persist a partial settings update. Only known keys are accepted; unknown
 * keys are ignored so a tampered payload cannot inject arbitrary config.
 */
export async function updateSiteSettings(
  patch: SiteSettingsPatch,
  updatedBy = "",
): Promise<{ ok: true; settings: SiteSettings } | { ok: false; error: string }> {
  const current = await getSiteSettings();
  const next: SiteSettings = structuredClone(current);

  if (patch.siteName !== undefined) next.siteName = cleanText(patch.siteName, 120) || current.siteName;
  if (patch.siteNameAr !== undefined) next.siteNameAr = cleanText(patch.siteNameAr, 120) || current.siteNameAr;
  if (patch.logoUrl !== undefined) next.logoUrl = cleanUrl(patch.logoUrl);
  if (patch.contactEmail !== undefined) next.contactEmail = cleanEmail(patch.contactEmail);
  if (patch.defaultLanguage !== undefined) next.defaultLanguage = patch.defaultLanguage === "en" ? "en" : "ar";
  if (patch.timezone !== undefined) {
    const tz = cleanText(patch.timezone, 64);
    // Validate the IANA name by formatting with it.
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
      next.timezone = tz;
    } catch {
      return { ok: false, error: "المنطقة الزمنية غير صالحة" };
    }
  }
  if (patch.social) {
    for (const key of Object.keys(next.social) as (keyof SiteSettings["social"])[]) {
      if (patch.social[key] !== undefined) next.social[key] = cleanUrl(patch.social[key]);
    }
  }
  if (patch.live) {
    if (patch.live.defaultStreamLabel !== undefined) {
      next.live.defaultStreamLabel = cleanText(patch.live.defaultStreamLabel, 160) || current.live.defaultStreamLabel;
    }
    if (patch.live.publishingEnabled !== undefined) next.live.publishingEnabled = patch.live.publishingEnabled === true;
  }
  if (patch.news) {
    if (patch.news.autoPublish !== undefined) next.news.autoPublish = patch.news.autoPublish === true;
  }
  if (patch.seo) {
    if (patch.seo.metaDescription !== undefined) next.seo.metaDescription = cleanText(patch.seo.metaDescription, 400);
    if (patch.seo.keywords !== undefined) next.seo.keywords = cleanText(patch.seo.keywords, 400);
  }

  // Persist each top-level section as one key.
  const sections: [string, unknown][] = [
    ["siteName", next.siteName],
    ["siteNameAr", next.siteNameAr],
    ["logoUrl", next.logoUrl],
    ["contactEmail", next.contactEmail],
    ["defaultLanguage", next.defaultLanguage],
    ["timezone", next.timezone],
    ["social", next.social],
    ["live", next.live],
    ["news", next.news],
    ["seo", next.seo],
  ];

  const db = await pg();
  let inDb: boolean;
  try {
    inDb = await persistOrThrow(db, (d) =>
      d.transaction(async (tx) => {
        for (const [key, value] of sections) {
          await tx.run(
            `INSERT INTO site_settings (key, value, updated_at, updated_by)
             VALUES ($1, $2, now(), $3)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
            [key, JSON.stringify(value), updatedBy],
          );
        }
      }),
    );
  } catch (e) {
    return { ok: false, error: storeErrorMessage(e) };
  }
  if (!inDb) {
    for (const [key, value] of sections) {
      mem.set(key, { value, updatedAt: now(), updatedBy });
    }
  }

  return { ok: true, settings: next };
}
