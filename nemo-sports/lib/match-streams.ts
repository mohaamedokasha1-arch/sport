/**
 * NEMO Sports · per-match live stream registry
 * ───────────────────────────────────────────────────────────────
 * Binds ONE embeddable live player (an iframe URL) to ONE specific match.
 *
 * Rules of the road:
 *   · A stream is registered PER MATCH — never site-wide. Pages/components
 *     must call streamForMatch(); no stream URL is ever hardcoded inside a
 *     component or shared across matches.
 *   · Lookup order: the provider slug first (e.g. "argentina-vs-benin"),
 *     then team-name aliases in either home/away order — so a
 *     provider-generated slug we don't control still resolves correctly.
 *   · A match with NO registered source renders NO player and NO section:
 *     the page keeps exactly its current look, nothing is replaced.
 *   · Storage: Postgres (`match_streams`) when DATABASE_URL is configured,
 *     an in-memory seeded registry otherwise — the same driver pattern as
 *     lib/broadcasts.ts. The write helpers at the bottom are the extension
 *     point for the admin panel or a data-source ingest: adding a stream
 *     for another match later requires no page change.
 *   · No paid API, no re-hosting: the iframe loads the provider's own
 *     player page directly in the visitor's browser; no signal passes
 *     through our servers.
 *
 * UI contract (components/match/MatchStreamPlayer.tsx):
 *   · "live"/"upcoming" + a source → the player renders.
 *   · "inactive" (finished/cancelled/…) → a static notice instead of an
 *     active live player.
 *   · no source → nothing renders at all.
 */

import { getDb } from "@/lib/db/pg";

export type MatchStreamPhase = "live" | "upcoming" | "inactive";

export interface MatchStreamSource {
  id: string;
  label: string;
  embedUrl: string;
  /** provider slugs this source belongs to (exact match, first priority) */
  slugs: string[];
  /** team-name aliases for the home side (either order is accepted) */
  homeAliases: string[];
  /** team-name aliases for the away side */
  awayAliases: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ── name normalization (Arabic + Latin aliases must compare equal) ── */

function norm(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "") // tashkeel + tatweel
    .replace(/[أإآٱ]/g, "ا") // alef variants → bare alef
    .replace(/ى/g, "ي") // alef maqsura → yeh
    .replace(/\s+/g, " ");
}

function splitList(value: string | null | undefined): string[] {
  return String(value ?? "")
    .split(/[|,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/* ── validation (shared with future admin/data-source writes) ─────── */

export function validateEmbedUrl(raw: string): { ok: boolean; reason: string } {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") return { ok: false, reason: "رابط المشغّل يجب أن يكون https" };
    return { ok: true, reason: "ok" };
  } catch {
    return { ok: false, reason: "رابط غير صالح" };
  }
}

/* ── seed: match-specific sources (each one belongs to ONE match) ─── */

const now = () => new Date().toISOString();

function seed(): MatchStreamSource[] {
  const t = now();
  return [
    {
      id: "ms_argentina_vs_benin",
      // ⚠️ This source is EXCLUSIVE to Argentina × Benin. It must never be
      //    reused for any other match — matching below is per-match only.
      label: "بث مباراة الأرجنتين × بنين",
      embedUrl:
        "https://912acsss8af382.yasirtv.com/playerv5.php?match=4856705&key=9f39972b67d6ce22189507d008acwc26",
      slugs: ["argentina-vs-benin", "benin-vs-argentina"],
      homeAliases: ["الأرجنتين", "الارجنتين", "Argentina", "ARG"],
      awayAliases: ["بنين", "Benin", "BEN"],
      enabled: true,
      createdAt: t,
      updatedAt: t,
    },
  ];
}

/* ── storage (Postgres → memory), same pattern as lib/broadcasts.ts ─ */

const DDL = `
CREATE TABLE IF NOT EXISTS match_streams (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT 'البث المباشر',
  embed_url TEXT NOT NULL,
  slugs TEXT[] NOT NULL DEFAULT '{}',
  home_aliases TEXT[] NOT NULL DEFAULT '{}',
  away_aliases TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_match_streams_enabled ON match_streams(enabled);
`;

let mem: MatchStreamSource[] | null = null;
let ddlDone = false;

function memory(): MatchStreamSource[] {
  if (!mem) mem = seed();
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
        const existing = await db.select<{ c: string }>("SELECT COUNT(*)::text AS c FROM match_streams", []);
        if (existing[0]?.c === "0") {
          for (const s of seed()) {
            await db.run(
              `INSERT INTO match_streams (id, label, embed_url, slugs, home_aliases, away_aliases, enabled)
               VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
              [s.id, s.label, s.embedUrl, s.slugs, s.homeAliases, s.awayAliases, s.enabled],
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

function fromRow(r: Row): MatchStreamSource {
  const t = now().toString();
  const iso = (v: unknown): string => {
    const d = v instanceof Date ? v : new Date(String(v ?? ""));
    return Number.isFinite(+d) ? d.toISOString() : t;
  };
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : splitList(String(v ?? "")));
  return {
    id: String(r.id),
    label: String(r.label ?? "البث المباشر"),
    embedUrl: String(r.embed_url ?? ""),
    slugs: arr(r.slugs),
    homeAliases: arr(r.home_aliases),
    awayAliases: arr(r.away_aliases),
    enabled: r.enabled !== false,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

/* ── reads ─────────────────────────────────────────────────────────── */

/** All registered sources (admin=true includes disabled entries). */
export async function listMatchStreams(admin = false): Promise<MatchStreamSource[]> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<Row>(
        admin
          ? "SELECT * FROM match_streams ORDER BY created_at"
          : "SELECT * FROM match_streams WHERE enabled = true ORDER BY created_at",
        [],
      );
      return rows.map(fromRow);
    } catch {
      // fall through
    }
  }
  const all = memory();
  return admin ? [...all] : all.filter((s) => s.enabled);
}

/**
 * Resolve the live-stream source for ONE match, or null when this match has
 * none (→ the page renders no player at all).
 *
 * Matching is deliberately narrow: an exact provider slug, or the match's
 * two team names against a source's aliases. A source can therefore never
 * leak onto a different match.
 */
export async function streamForMatch(key: {
  slug?: string | null;
  home?: string | null;
  away?: string | null;
}): Promise<MatchStreamSource | null> {
  const all = await listMatchStreams(false);
  if (all.length === 0) return null;

  const slug = String(key.slug ?? "").trim().toLowerCase();
  if (slug) {
    const bySlug = all.find((s) => s.slugs.some((x) => x.trim().toLowerCase() === slug));
    if (bySlug) return bySlug;
  }

  const h = norm(String(key.home ?? ""));
  const a = norm(String(key.away ?? ""));
  if (h && a) {
    const byTeams = all.find((s) => {
      const homeSet = s.homeAliases.map(norm);
      const awaySet = s.awayAliases.map(norm);
      return (homeSet.includes(h) && awaySet.includes(a)) || (homeSet.includes(a) && awaySet.includes(h));
    });
    if (byTeams) return byTeams;
  }

  return null;
}

/* ── status → phase (shared by every match page surface) ───────────── */

const LIVE_STATUSES = new Set([
  // SDL / provider
  "live",
  "halftime",
  "extra_time",
  "extra_time_halftime",
  "penalty_shootout",
  // demo dataset (lib/data.ts)
  "ht",
]);

const INACTIVE_STATUSES = new Set([
  // SDL / provider
  "finished",
  "postponed",
  "cancelled",
  "suspended",
  "abandoned",
  "walkover",
  "awarded",
  // demo dataset (lib/data.ts) uses the same lowercase forms
]);

/**
 * "live"      → the player renders with a LIVE badge.
 * "upcoming"  → the match hasn't started; a registered link still renders
 *               (the requirement: show the player when the stream link exists).
 * "inactive"  → finished/cancelled/…: NEVER an active live player — a
 *               static notice is shown instead.
 */
export function streamPhase(status: string | null | undefined): MatchStreamPhase {
  const s = String(status ?? "").trim().toLowerCase();
  if (LIVE_STATUSES.has(s)) return "live";
  if (INACTIVE_STATUSES.has(s)) return "inactive";
  return "upcoming";
}

/** Arabic notice shown instead of the player once the match is not live anymore. */
export function inactiveStreamNote(status: string | null | undefined): string {
  switch (String(status ?? "").trim().toLowerCase()) {
    case "postponed":
      return "تأجّلت المباراة — لا يوجد بث مباشر حاليًا.";
    case "cancelled":
      return "أُلغيت المباراة — لا يوجد بث مباشر.";
    case "suspended":
      return "المباراة موقوفة — لا يوجد بث مباشر حاليًا.";
    case "abandoned":
      return "توقّفت المباراة — لم يعد البث المباشر نشطًا.";
    case "walkover":
    case "awarded":
      return "انتهت المباراة بقرار رسمي — لم يعد البث المباشر نشطًا.";
    case "finished":
    default:
      return "انتهت المباراة — لم يعد البث المباشر نشطًا.";
  }
}

/* ── writes: the extension point for the admin panel / data source ── */

export interface MatchStreamInput {
  label?: string;
  embedUrl: string;
  slugs?: string[];
  homeAliases?: string[];
  awayAliases?: string[];
  enabled?: boolean;
}

/**
 * Add or update a stream for one match. `id` is a stable per-match key
 * (e.g. `ms_<slug>`), so re-ingesting the same match updates its link
 * instead of duplicating it. Returns the stored entry or a validation error.
 */
export async function upsertMatchStream(
  id: string,
  input: MatchStreamInput,
): Promise<{ ok: true; entry: MatchStreamSource } | { ok: false; error: string }> {
  const check = validateEmbedUrl(input.embedUrl);
  if (!check.ok) return { ok: false, error: check.reason };

  const t = now();
  const entry: MatchStreamSource = {
    id: id.trim().slice(0, 120),
    label: (input.label ?? "البث المباشر").trim().slice(0, 160),
    embedUrl: input.embedUrl.trim(),
    slugs: (input.slugs ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 12),
    homeAliases: (input.homeAliases ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 12),
    awayAliases: (input.awayAliases ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 12),
    enabled: input.enabled !== false,
    createdAt: t,
    updatedAt: t,
  };
  if (!entry.id) return { ok: false, error: "معرّف المباراة مطلوب" };

  const db = await pg();
  if (db) {
    try {
      await db.run(
        `INSERT INTO match_streams (id, label, embed_url, slugs, home_aliases, away_aliases, enabled, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,now())
         ON CONFLICT (id) DO UPDATE SET
           label = EXCLUDED.label,
           embed_url = EXCLUDED.embed_url,
           slugs = EXCLUDED.slugs,
           home_aliases = EXCLUDED.home_aliases,
           away_aliases = EXCLUDED.away_aliases,
           enabled = EXCLUDED.enabled,
           updated_at = now()`,
        [entry.id, entry.label, entry.embedUrl, entry.slugs, entry.homeAliases, entry.awayAliases, entry.enabled],
      );
      return { ok: true, entry };
    } catch {
      // fall through
    }
  }

  const list = memory();
  const i = list.findIndex((s) => s.id === entry.id);
  if (i >= 0) {
    entry.createdAt = list[i]!.createdAt;
    list[i] = entry;
  } else {
    list.push(entry);
  }
  return { ok: true, entry };
}

/** Enable/disable a match's stream without deleting it (soft takedown). */
export async function setMatchStreamEnabled(id: string, enabled: boolean): Promise<boolean> {
  const db = await pg();
  if (db) {
    try {
      await db.run("UPDATE match_streams SET enabled = $2, updated_at = now() WHERE id = $1", [id, enabled]);
      return true;
    } catch {
      // fall through
    }
  }
  const list = memory();
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return false;
  list[i] = { ...list[i]!, enabled, updatedAt: now() };
  return true;
}

/** Remove a match's stream source entirely. */
export async function deleteMatchStream(id: string): Promise<boolean> {
  const db = await pg();
  if (db) {
    try {
      await db.run("DELETE FROM match_streams WHERE id = $1", [id]);
      return true;
    } catch {
      // fall through
    }
  }
  const list = memory();
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
}
