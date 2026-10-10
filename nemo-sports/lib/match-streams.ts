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
 *     an in-memory registry otherwise — the same driver pattern as
 *     lib/broadcasts.ts. The write helpers at the bottom are used by the
 *     authenticated admin panel (/admin/live): adding a stream for another
 *     match later requires no page change.
 *   · Link acceptance is governed by lib/stream-policy.ts. By default
 *     (`NEMO_STREAM_DOMAIN_POLICY=open`) any https embed an authorized admin
 *     enters is accepted — the operator owns the rights question. Setting the
 *     policy to `allowlist` restores the curated official-domain mode. Either
 *     way: no paid API and no re-hosting — the iframe loads the provider's own
 *     player page directly in the visitor's browser.
 *
 * Lifecycle (admin spec §8): every stream carries a status —
 *   draft     → saved but NEVER visible publicly
 *   published → visible on the match page + /live
 *   live      → published + highlighted as "بث حي"
 *   ended     → hidden publicly, kept for the record
 *   disabled  → hidden publicly (operator takedown), kept for the record
 *
 * UI contract (components/match/MatchStreamPlayer.tsx):
 *   · "live"/"upcoming" + a source → the player renders.
 *   · "inactive" (finished/cancelled/…) → a static notice instead of an
 *     active live player.
 *   · no source → nothing renders at all.
 */

import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db/pg";
import { persistOrThrow, storeErrorMessage } from "@/lib/db/store-policy";
import { validateBroadcastLink, type StreamDomainPolicy, type StreamPolicyOptions } from "@/lib/broadcasts";
import { siteDay } from "@/lib/tz";

export type MatchStreamPhase = "live" | "upcoming" | "inactive";

/** How the player is delivered (admin spec §6). */
export {
  LIVE_STREAM_TYPES,
  LIVE_STREAM_TYPE_AR,
  LIVE_STREAM_STATUSES,
  LIVE_STREAM_STATUS_AR,
  PUBLIC_STREAM_STATUSES,
  type LiveStreamType,
  type LiveStreamStatus,
} from "@/lib/live-stream-consts";
import {
  LIVE_STREAM_TYPES,
  LIVE_STREAM_STATUSES,
  PUBLIC_STREAM_STATUSES as PUBLIC_STATUSES,
  type LiveStreamType,
  type LiveStreamStatus,
} from "@/lib/live-stream-consts";

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
  /* ── extended model (migration 0003) ── */
  streamType: LiveStreamType;
  status: LiveStreamStatus;
  /** canonical match slug this stream is bound to (admin + provider matches) */
  matchSlug: string;
  homeName: string;
  awayName: string;
  competitionName: string;
  kickoffAt: string | null;
  publishedAt: string | null;
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

export interface EmbedUrlCheck {
  ok: boolean;
  reason: string;
  host: string;
  policy: StreamDomainPolicy;
  /** Non-blocking note shown next to the field; never prevents saving. */
  warning: string | null;
}

/**
 * Validate an embed URL coming from the admin panel (or an ingest fixture).
 *
 * The domain restriction is a policy switch, not a hardcoded gate:
 * `NEMO_STREAM_DOMAIN_POLICY=open` (the default) accepts any https host the
 * operator enters, so a legally held embed from a domain that is not on the
 * reference list saves and publishes without being refused. Safety checks
 * (https, no markup/script, no credentials, no private host) still apply.
 * Pass `{ policy: "allowlist" }` to force the curated mode.
 */
export function validateEmbedUrl(raw: string, options: StreamPolicyOptions = {}): EmbedUrlCheck {
  return validateBroadcastLink(raw, options);
}

/* ── seed: match-specific sources (each one belongs to ONE match) ─── */

const now = () => new Date().toISOString();

function seed(): MatchStreamSource[] {
  // No stream is published by default. A source is displayed only after an
  // operator registers an official, verified embed for one concrete match;
  // in particular, never seed a third-party IPTV/pirate URL in source code.
  return [];
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

// Migration 0003 — extended lifecycle columns (idempotent).
const DDL_ALTER = `
ALTER TABLE match_streams ADD COLUMN IF NOT EXISTS stream_type TEXT NOT NULL DEFAULT 'embed';
ALTER TABLE match_streams ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
ALTER TABLE match_streams ADD COLUMN IF NOT EXISTS match_slug TEXT NOT NULL DEFAULT '';
ALTER TABLE match_streams ADD COLUMN IF NOT EXISTS home_name TEXT NOT NULL DEFAULT '';
ALTER TABLE match_streams ADD COLUMN IF NOT EXISTS away_name TEXT NOT NULL DEFAULT '';
ALTER TABLE match_streams ADD COLUMN IF NOT EXISTS competition_name TEXT NOT NULL DEFAULT '';
ALTER TABLE match_streams ADD COLUMN IF NOT EXISTS kickoff_at TIMESTAMPTZ;
ALTER TABLE match_streams ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_match_streams_status ON match_streams(status);
CREATE INDEX IF NOT EXISTS idx_match_streams_match_slug ON match_streams(match_slug);
`;

let mem: MatchStreamSource[] | null = null;
let ddlDone = false;

const STREAMS_FILE = path.join(process.cwd(), "db", "match-streams.json");

function loadDiskStreams(): MatchStreamSource[] {
  if (process.env.NEMO_TEST_MEMORY_ONLY === "1") return [];
  try {
    if (fs.existsSync(STREAMS_FILE)) {
      const raw = fs.readFileSync(STREAMS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // fall through
  }
  return seed();
}

function saveDiskStreams(list: MatchStreamSource[]): void {
  if (process.env.NEMO_TEST_MEMORY_ONLY === "1" || process.env.NODE_ENV === "production") return;
  try {
    const dir = path.dirname(STREAMS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STREAMS_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch {
    // ignore
  }
}

function memory(): MatchStreamSource[] {
  if (!mem) mem = loadDiskStreams();
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
        for (const stmt of DDL_ALTER.split(";").map((s) => s.trim()).filter(Boolean)) await db.run(stmt, []);
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
  const isoOrNull = (v: unknown): string | null => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(String(v));
    return Number.isFinite(+d) ? d.toISOString() : null;
  };
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : splitList(String(v ?? "")));
  const rawStatus = String(r.status ?? "published");
  const status: LiveStreamStatus = (LIVE_STREAM_STATUSES as string[]).includes(rawStatus)
    ? (rawStatus as LiveStreamStatus)
    : "published";
  const rawType = String(r.stream_type ?? "embed");
  const streamType: LiveStreamType = (LIVE_STREAM_TYPES as string[]).includes(rawType)
    ? (rawType as LiveStreamType)
    : "embed";
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
    streamType,
    status,
    matchSlug: String(r.match_slug ?? ""),
    homeName: String(r.home_name ?? ""),
    awayName: String(r.away_name ?? ""),
    competitionName: String(r.competition_name ?? ""),
    kickoffAt: isoOrNull(r.kickoff_at),
    publishedAt: isoOrNull(r.published_at),
  };
}

/** A stream is publicly visible only when enabled, in a public status, and its URL still passes validation. */
export function isPubliclyVisible(s: MatchStreamSource): boolean {
  return s.enabled && PUBLIC_STATUSES.has(s.status) && validateEmbedUrl(s.embedUrl).ok;
}

/* ── reads ─────────────────────────────────────────────────────────── */

/** All registered sources (admin=true includes drafts/disabled entries). */
export async function listMatchStreams(admin = false): Promise<MatchStreamSource[]> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<Row>("SELECT * FROM match_streams ORDER BY created_at", []);
      const entries = rows.map(fromRow);
      // Rows are re-validated on read: a legacy or manually inserted URL that
      // no longer passes validation (bad scheme, markup, private host) stays
      // out of public pages even if it was written before this check existed.
      return admin ? entries : entries.filter(isPubliclyVisible);
    } catch {
      // fall through
    }
  }
  if (process.env.DATABASE_URL) return [];
  const all = memory();
  return admin ? [...all] : all.filter(isPubliclyVisible);
}

/** Alias kept for readability at call sites. */
export const listLiveStreams = listMatchStreams;

/** Only the publicly visible streams (published + live). */
export async function listPublishedStreams(): Promise<MatchStreamSource[]> {
  return listMatchStreams(false);
}

/** Counts per lifecycle status (admin dashboard + /admin/live stats). */
export async function liveStreamStats(): Promise<Record<LiveStreamStatus, number>> {
  const all = await listMatchStreams(true);
  const stats: Record<LiveStreamStatus, number> = { draft: 0, scheduled: 0, published: 0, live: 0, ended: 0, disabled: 0 };
  for (const s of all) stats[s.status] += 1;
  return stats;
}

export async function getLiveStream(id: string): Promise<MatchStreamSource | null> {
  const all = await listMatchStreams(true);
  return all.find((s) => s.id === id) ?? null;
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
  // Exact IDs only. Never strip dates or match merely by two team names:
  // both strategies attach a link to later meetings / reverse fixtures.
  if (slug) {
    return all.find((s) => s.matchSlug.trim().toLowerCase() === slug ||
      s.slugs.some((x) => x.trim().toLowerCase() === slug)) ?? null;
  }
  // Legacy alias-only records remain stored for admin rebinding; they cannot
  // safely establish the identity of a particular match on a public page.

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
 *
 * A match still marked "scheduled" whose kickoff DAY (site calendar) has
 * already passed is "inactive" too: a stored status can lag behind reality
 * (an editorial match is not refreshed once its day is over), so the calendar
 * — not the status — decides. The comparison is day-level on purpose: a match
 * that just kicked off keeps its player until the status flips to live/finished.
 */
export function streamPhase(
  status: string | null | undefined,
  scheduledAt?: string | null,
  now: string | number | Date = Date.now(),
): MatchStreamPhase {
  const s = String(status ?? "").trim().toLowerCase();
  if (LIVE_STATUSES.has(s)) return "live";
  if (INACTIVE_STATUSES.has(s)) return "inactive";
  if (scheduledAt) {
    const kickoff = new Date(scheduledAt);
    if (Number.isFinite(+kickoff) && siteDay(kickoff) < siteDay(now)) return "inactive";
  }
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

function baseEntry(input: {
  id: string;
  label: string;
  embedUrl: string;
  slugs: string[];
  homeAliases: string[];
  awayAliases: string[];
  enabled: boolean;
  status: LiveStreamStatus;
  streamType: LiveStreamType;
  matchSlug: string;
  homeName: string;
  awayName: string;
  competitionName: string;
  kickoffAt: string | null;
  publishedAt: string | null;
  createdAt?: string;
}): MatchStreamSource {
  return {
    id: input.id,
    label: input.label,
    embedUrl: input.embedUrl,
    slugs: input.slugs,
    homeAliases: input.homeAliases,
    awayAliases: input.awayAliases,
    enabled: input.enabled,
    createdAt: input.createdAt ?? now(),
    updatedAt: now(),
    streamType: input.streamType,
    status: input.status,
    matchSlug: input.matchSlug,
    homeName: input.homeName,
    awayName: input.awayName,
    competitionName: input.competitionName,
    kickoffAt: input.kickoffAt,
    publishedAt: input.publishedAt,
  };
}

const COLUMNS = `id, label, embed_url, slugs, home_aliases, away_aliases, enabled,
  stream_type, status, match_slug, home_name, away_name, competition_name, kickoff_at, published_at,
  created_at, updated_at`;

function valuesOf(s: MatchStreamSource): unknown[] {
  return [
    s.id, s.label, s.embedUrl, s.slugs, s.homeAliases, s.awayAliases, s.enabled,
    s.streamType, s.status, s.matchSlug, s.homeName, s.awayName, s.competitionName,
    s.kickoffAt, s.publishedAt, s.createdAt, s.updatedAt,
  ];
}

/**
 * Write one stream. Returns false when a configured database rejected the
 * write — the caller must report that instead of pretending it was saved.
 * Memory is used only when no database is configured at all.
 */
async function persistUpsert(entry: MatchStreamSource, previous: MatchStreamSource | null): Promise<string | null> {
  const db = await pg();
  try {
    const inDb = await persistOrThrow(db, (d) => {
      if (previous) {
        return d.run(
          `UPDATE match_streams SET label=$2, embed_url=$3, slugs=$4, home_aliases=$5, away_aliases=$6,
             enabled=$7, stream_type=$8, status=$9, match_slug=$10, home_name=$11, away_name=$12,
             competition_name=$13, kickoff_at=$14, published_at=$15, updated_at=now() WHERE id=$1`,
          [
            entry.id, entry.label, entry.embedUrl, entry.slugs, entry.homeAliases, entry.awayAliases,
            entry.enabled, entry.streamType, entry.status, entry.matchSlug, entry.homeName, entry.awayName,
            entry.competitionName, entry.kickoffAt, entry.publishedAt,
          ],
        );
      }
      const values = valuesOf(entry);
      return d.run(
        `INSERT INTO match_streams (${COLUMNS}) VALUES (${values.map((_, i) => `$${i + 1}`).join(",")}) ON CONFLICT (id) DO NOTHING`,
        values,
      );
    });
    if (inDb) return null;
  } catch (e) {
    return storeErrorMessage(e);
  }
  const list = memory();
  const i = list.findIndex((s) => s.id === entry.id);
  if (i >= 0) list[i] = entry;
  else list.push(entry);
  saveDiskStreams(list);
  return null;
}

/**
 * Add or update a stream for one match. `id` is a stable per-match key
 * (e.g. `ms_<slug>`), so re-ingesting the same match updates its link
 * instead of duplicating it. Returns the stored entry or a validation error.
 *
 * Legacy entry point kept for the broadcast page; new code should prefer
 * createLiveStream/updateLiveStream which carry the full lifecycle.
 */
export async function upsertMatchStream(
  id: string,
  input: MatchStreamInput,
): Promise<{ ok: true; entry: MatchStreamSource } | { ok: false; error: string }> {
  const check = validateEmbedUrl(input.embedUrl);
  if (!check.ok) return { ok: false, error: check.reason };

  const enabled = input.enabled !== false;
  const entry = baseEntry({
    id: id.trim().slice(0, 120),
    label: (input.label ?? "البث المباشر").trim().slice(0, 160),
    embedUrl: input.embedUrl.trim(),
    slugs: (input.slugs ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 12),
    homeAliases: (input.homeAliases ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 12),
    awayAliases: (input.awayAliases ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 12),
    enabled,
    status: enabled ? "published" : "disabled",
    streamType: "embed",
    matchSlug: (input.slugs ?? [])[0]?.trim() ?? "",
    homeName: (input.homeAliases ?? [])[0]?.trim() ?? "",
    awayName: (input.awayAliases ?? [])[0]?.trim() ?? "",
    competitionName: "",
    kickoffAt: null,
    publishedAt: enabled ? now() : null,
  });
  if (!entry.id) return { ok: false, error: "معرّف المباراة مطلوب" };
  if (entry.slugs.length === 0 && (entry.homeAliases.length === 0 || entry.awayAliases.length === 0)) {
    return { ok: false, error: "يجب ربط المصدر بـ slug المباراة أو اسمي الفريقين" };
  }

  const all = await listMatchStreams(true);
  const previous = all.find((s) => s.id === entry.id) ?? null;
  if (previous) entry.createdAt = previous.createdAt;
  if (previous) entry.publishedAt = previous.publishedAt ?? entry.publishedAt;
  const saveError = await persistUpsert(entry, previous);
  if (saveError) return { ok: false, error: saveError };
  return { ok: true, entry };
}

/* ── full lifecycle API (used by /admin/live) ─────────────────── */

export interface LiveStreamInput {
  matchSlug?: string;
  homeName?: string;
  awayName?: string;
  competitionName?: string;
  kickoffAt?: string | null;
  streamType?: LiveStreamType;
  embedUrl: string;
  label?: string;
  status?: LiveStreamStatus;
}

function cleanUrl(v: unknown): string {
  return String(v ?? "").trim().slice(0, 1000);
}

function cleanText(v: unknown, max = 160): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Create a stream bound to ONE match. The embed URL must pass the official
 * domain allowlist; the match binding (slug or both team names) is required.
 * New streams default to `draft` — nothing is public until the operator
 * publishes.
 */
export async function createLiveStream(
  input: LiveStreamInput,
): Promise<{ ok: true; entry: MatchStreamSource } | { ok: false; error: string }> {
  const embedUrl = cleanUrl(input.embedUrl);
  const check = validateEmbedUrl(embedUrl);
  if (!check.ok) return { ok: false, error: check.reason };

  const matchSlug = cleanText(input.matchSlug, 160);
  const homeName = cleanText(input.homeName, 160);
  const awayName = cleanText(input.awayName, 160);
  if (!matchSlug && !(homeName && awayName)) {
    return { ok: false, error: "اختر مباراة — يجب ربط البث بمباراة واحدة" };
  }

  const streamType = input.streamType && (LIVE_STREAM_TYPES as string[]).includes(input.streamType)
    ? input.streamType
    : "embed";
  const status = input.status && (LIVE_STREAM_STATUSES as string[]).includes(input.status)
    ? input.status
    : "draft";

  const t = now();
  const id = `ls_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const entry = baseEntry({
    id,
    label: cleanText(input.label, 160) || "البث المباشر",
    embedUrl,
    slugs: matchSlug ? [matchSlug] : [],
    homeAliases: homeName ? [homeName] : [],
    awayAliases: awayName ? [awayName] : [],
    enabled: status === "published" || status === "live",
    status,
    streamType,
    matchSlug,
    homeName,
    awayName,
    competitionName: cleanText(input.competitionName, 160),
    kickoffAt: input.kickoffAt && Number.isFinite(+new Date(input.kickoffAt)) ? new Date(input.kickoffAt).toISOString() : null,
    publishedAt: status === "published" || status === "live" ? t : null,
    createdAt: t,
  });

  const saveError = await persistUpsert(entry, null);
  if (saveError) return { ok: false, error: saveError };
  return { ok: true, entry };
}

/** Patch an existing stream. Re-validates the URL when it changes. */
export async function updateLiveStream(
  id: string,
  patch: Partial<LiveStreamInput>,
): Promise<{ ok: true; entry: MatchStreamSource } | { ok: false; error: string }> {
  const all = await listMatchStreams(true);
  const previous = all.find((s) => s.id === id);
  if (!previous) return { ok: false, error: "البث غير موجود" };

  const embedUrl = patch.embedUrl !== undefined ? cleanUrl(patch.embedUrl) : previous.embedUrl;
  const check = validateEmbedUrl(embedUrl);
  if (!check.ok) return { ok: false, error: check.reason };

  const matchSlug = patch.matchSlug !== undefined ? cleanText(patch.matchSlug, 160) : previous.matchSlug;
  const homeName = patch.homeName !== undefined ? cleanText(patch.homeName, 160) : previous.homeName;
  const awayName = patch.awayName !== undefined ? cleanText(patch.awayName, 160) : previous.awayName;
  if (!matchSlug && !(homeName && awayName)) {
    return { ok: false, error: "يجب ربط البث بمباراة واحدة (slug أو اسمي الفريقين)" };
  }

  const status =
    patch.status && (LIVE_STREAM_STATUSES as string[]).includes(patch.status)
      ? patch.status
      : previous.status;
  const streamType =
    patch.streamType && (LIVE_STREAM_TYPES as string[]).includes(patch.streamType)
      ? patch.streamType
      : previous.streamType;

  const entry: MatchStreamSource = {
    ...previous,
    label: patch.label !== undefined ? cleanText(patch.label, 160) || previous.label : previous.label,
    embedUrl,
    slugs: matchSlug ? [matchSlug] : previous.slugs,
    homeAliases: homeName ? [homeName] : previous.homeAliases,
    awayAliases: awayName ? [awayName] : previous.awayAliases,
    streamType,
    status,
    matchSlug,
    homeName,
    awayName,
    competitionName:
      patch.competitionName !== undefined ? cleanText(patch.competitionName, 160) : previous.competitionName,
    kickoffAt:
      patch.kickoffAt !== undefined
        ? patch.kickoffAt && Number.isFinite(+new Date(patch.kickoffAt))
          ? new Date(patch.kickoffAt).toISOString()
          : null
        : previous.kickoffAt,
    enabled: status === "published" || status === "live",
    publishedAt:
      status === "published" || status === "live"
        ? previous.publishedAt ?? now()
        : previous.publishedAt,
    updatedAt: now(),
  };
  const saveError = await persistUpsert(entry, previous);
  if (saveError) return { ok: false, error: saveError };
  return { ok: true, entry };
}

/**
 * Move a stream through its lifecycle. Publishing flips it public and stamps
 * published_at; stopping/disabling hides it without deleting anything.
 */
export async function setLiveStreamStatus(
  id: string,
  status: LiveStreamStatus,
): Promise<{ ok: true; entry: MatchStreamSource } | { ok: false; error: string }> {
  if (!(LIVE_STREAM_STATUSES as string[]).includes(status)) {
    return { ok: false, error: "حالة غير صالحة" };
  }
  return updateLiveStream(id, { status });
}

/** Enable/disable a match's stream without deleting it (soft takedown). */
export async function setMatchStreamEnabled(id: string, enabled: boolean): Promise<boolean> {
  const all = await listMatchStreams(true);
  const previous = all.find((s) => s.id === id);
  if (!previous) return false;
  const status: LiveStreamStatus = enabled
    ? previous.status === "draft" || previous.status === "disabled" || previous.status === "ended"
      ? "published"
      : previous.status
    : previous.status === "published" || previous.status === "live"
      ? "disabled"
      : previous.status;
  const result = await updateLiveStream(id, { status });
  return result.ok;
}

/** Remove a match's stream source entirely. Never touches the match itself. */
export async function deleteMatchStream(id: string): Promise<boolean> {
  // Throws StoreWriteError when the database rejects the delete (never silent).
  const db = await pg();
  const inDb = await persistOrThrow(db, (d) => d.run("DELETE FROM match_streams WHERE id = $1", [id]));
  if (inDb) return true;
  const list = memory();
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return false;
  list.splice(i, 1);
  saveDiskStreams(list);
  return true;
}

export const deleteLiveStream = deleteMatchStream;
