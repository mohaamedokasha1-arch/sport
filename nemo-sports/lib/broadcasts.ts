/**
 * NEMO Sports · legal broadcast registry (official broadcasters ONLY)
 * ───────────────────────────────────────────────────────────────────
 * NEVER: illegal streams, pirate sites, IPTV sellers, unauthorized embeds.
 * This registry holds OFFICIAL broadcasters only, each verified against an
 * official source (league site, broadcaster site, federation site).
 *
 * Storage: Postgres when configured, seeded in-memory registry otherwise.
 * Admin manages entries at /admin/broadcast.
 */

import { getDb } from "@/lib/db/pg";

export type BroadcastPlatform = "TV" | "Website" | "Mobile App" | "Streaming" | "Other";
export type BroadcastStatus = "approved" | "pending" | "rejected";

export interface BroadcasterEntry {
  id: string;
  competitionId: string;
  competitionName: string;
  broadcasterName: string;
  platform: BroadcastPlatform;
  regions: string[];
  broadcastWebsite: string;
  verificationSource: string;
  isOfficialBroadcaster: boolean;
  requiresSubscription: boolean;
  freeAccess: boolean;
  notes?: string;
  status: BroadcastStatus;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Official domains ONLY. Any broadcast link whose hostname is not on this
 * list (or a subdomain of an entry) is rejected by validateBroadcastLink().
 * Admin-added entries must still pass this check — unknown hosts can never
 * be published, only kept as pending for manual verification.
 */
export const OFFICIAL_BROADCAST_DOMAINS = [
  // Egypt / MENA official
  "ontvplus.com",
  "onsport.tv",
  "shahid.mbc.net",
  "shahid.net",
  "mbc.net",
  "thmanyah.com",
  "thmanyah.sa",
  "ssc.sa",
  "koora.com",
  "bein.com",
  "beinsports.com",
  // Global sports platforms
  "dazn.com",
  "espn.com",
  "skysports.com",
  "tntsports.co.uk",
  "peacocktv.com",
  "paramountplus.com",
  "fubo.tv",
  "nba.com",
  "tennistv.com",
  "canalplus.com",
  "movistarplus.es",
  // Video and stream players (authorized embeds)
  "vimeo.com",
  "player.vimeo.com",
  "youtube.com",
  "youtube-nocookie.com",
  "dailymotion.com",
  "nemo-sports.com",
  "stream.nemo-sports.com",
  "cdn.nemo-sports.com",
  "nemo-sports.vercel.app",
  // League / federation official sites (guides & rights pages)
  "epl.eg",
  "premierleague.com",
  "laliga.com",
  "legaseriea.it",
  "bundesliga.com",
  "ligue1.com",
  "ligue1.fr",
  "uefa.com",
  "caf.net",
  "caf-online.com",
  "fifa.com",
  "the-afc.com",
  "concacaf.com",
] as const;

export function validateBroadcastLink(link: string): { ok: boolean; reason: string } {
  let host: string;
  try {
    const u = new URL(link.trim());
    if (u.protocol !== "https:") return { ok: false, reason: "broadcast links must be https" };
    host = u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return { ok: false, reason: "invalid URL" };
  }
  const allowed = OFFICIAL_BROADCAST_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  if (!allowed) return { ok: false, reason: `unverified host: ${host} — official broadcasters only` };
  return { ok: true, reason: "official domain" };
}

/* ── seed: verified official broadcasters ─────────────────────── */

const now = () => new Date().toISOString();

function seed(): BroadcasterEntry[] {
  const t = now();
  const e = (
    id: string,
    competitionId: string,
    competitionName: string,
    broadcasterName: string,
    platform: BroadcastPlatform,
    regions: string[],
    broadcastWebsite: string,
    verificationSource: string,
    extra: Partial<BroadcasterEntry> = {},
  ): BroadcasterEntry => ({
    id,
    competitionId,
    competitionName,
    broadcasterName,
    platform,
    regions,
    broadcastWebsite,
    verificationSource,
    isOfficialBroadcaster: true,
    requiresSubscription: true,
    freeAccess: false,
    status: "approved",
    enabled: true,
    createdAt: t,
    updatedAt: t,
    ...extra,
  });
  return [
    e("bc_epl_onsport", "egyptian-league", "الدوري المصري الممتاز", "أون سبورت", "TV", ["مصر"], "https://www.onsport.tv", "epl.eg — official rights page"),
    e("bc_epl_shahid", "egyptian-league", "الدوري المصري الممتاز", "Shahid", "Streaming", ["الشرق الأوسط", "شمال أفريقيا"], "https://shahid.mbc.net", "shahid.mbc.net — official platform", { notes: "اشتراك مطلوب لبعض المباريات." }),
    e("bc_pl_bein", "premier-league", "الدوري الإنجليزي الممتاز", "beIN SPORTS", "TV", ["الشرق الأوسط", "شمال أفريقيا"], "https://www.beinsports.com", "premierleague.com — broadcast list"),
    e("bc_ucl_bein", "champions-league", "دوري أبطال أوروبا", "beIN SPORTS", "TV", ["الشرق الأوسط", "شمال أفريقيا"], "https://www.beinsports.com", "uefa.com — broadcast partners"),
    e("bc_laliga_dazn", "la-liga", "الدوري الإسباني", "DAZN", "Streaming", ["إسبانيا", "ألمانيا"], "https://www.dazn.com", "laliga.com — official broadcasters"),
    e("bc_nba_pass", "nba", "دوري كرة السلة الأمريكي", "NBA League Pass", "Streaming", ["العالم (باستثناء الولايات المتحدة)"], "https://www.nba.com/watch", "nba.com — official streaming"),
    e("bc_atp_tennistv", "atp-tour", "بطولات رابطة المحترفين", "Tennis TV", "Streaming", ["العالم"], "https://www.tennistv.com", "tennistv.com — official platform"),
    e("bc_caf_guide", "caf-champions-league", "دوري أبطال أفريقيا", "دليل البث الرسمي (CAF)", "Website", ["حسب الدولة"], "https://www.caf.net", "caf.net — official site", {
      requiresSubscription: false,
      freeAccess: true,
      notes: "الناقل يختلف حسب الدولة — تحقق من دليل CAF الرسمي قبل المباراة.",
    }),
  ];
}

/* ── storage (Postgres → memory) ──────────────────────────────── */

const DDL = `
CREATE TABLE IF NOT EXISTS broadcasts (
  id TEXT PRIMARY KEY,
  competition_id TEXT NOT NULL,
  competition_name TEXT NOT NULL,
  broadcaster_name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'TV',
  regions TEXT[] NOT NULL DEFAULT '{}',
  broadcast_website TEXT NOT NULL,
  verification_source TEXT NOT NULL,
  is_official_broadcaster BOOLEAN NOT NULL DEFAULT true,
  requires_subscription BOOLEAN NOT NULL DEFAULT true,
  free_access BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_broadcasts_comp ON broadcasts(competition_id);
`;

let mem: BroadcasterEntry[] | null = null;
let ddlDone = false;

function memory(): BroadcasterEntry[] {
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
        const existing = await db.select<{ c: string }>("SELECT COUNT(*)::text AS c FROM broadcasts", []);
        if (existing[0]?.c === "0") {
          for (const b of seed()) {
            await db.run(
              `INSERT INTO broadcasts (id, competition_id, competition_name, broadcaster_name, platform, regions,
               broadcast_website, verification_source, is_official_broadcaster, requires_subscription,
               free_access, notes, status, enabled)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO NOTHING`,
              [b.id, b.competitionId, b.competitionName, b.broadcasterName, b.platform, b.regions,
               b.broadcastWebsite, b.verificationSource, b.isOfficialBroadcaster, b.requiresSubscription,
               b.freeAccess, b.notes ?? null, b.status, b.enabled],
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

function fromRow(r: Row): BroadcasterEntry {
  const t = new Date().toISOString();
  const iso = (v: unknown): string => {
    const d = v instanceof Date ? v : new Date(String(v ?? ""));
    return Number.isFinite(+d) ? d.toISOString() : t;
  };
  return {
    id: String(r.id),
    competitionId: String(r.competition_id),
    competitionName: String(r.competition_name),
    broadcasterName: String(r.broadcaster_name),
    platform: (String(r.platform) as BroadcastPlatform) || "TV",
    regions: Array.isArray(r.regions) ? (r.regions as string[]) : [],
    broadcastWebsite: String(r.broadcast_website),
    verificationSource: String(r.verification_source),
    isOfficialBroadcaster: r.is_official_broadcaster !== false,
    requiresSubscription: r.requires_subscription === true,
    freeAccess: r.free_access === true,
    notes: (r.notes as string) ?? undefined,
    status: (String(r.status) as BroadcastStatus) || "pending",
    enabled: r.enabled !== false,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export async function listBroadcasters(admin = false): Promise<BroadcasterEntry[]> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<Row>(
        admin
          ? "SELECT * FROM broadcasts ORDER BY competition_name, broadcaster_name"
          : "SELECT * FROM broadcasts WHERE status = 'approved' AND enabled = true ORDER BY competition_name, broadcaster_name",
        [],
      );
      return rows.map(fromRow);
    } catch {
      // fall through
    }
  }
  const all = memory();
  return admin ? [...all] : all.filter((b) => b.status === "approved" && b.enabled);
}

/** Official broadcasters for ONE competition (public: approved only). */
export async function broadcastersForCompetition(competitionId: string): Promise<BroadcasterEntry[]> {
  const all = await listBroadcasters(false);
  return all.filter((b) => b.competitionId === competitionId);
}

export async function coverageStats(): Promise<{ competitions: number; entries: number; pending: number }> {
  const all = await listBroadcasters(true);
  return {
    competitions: new Set(all.filter((b) => b.status === "approved" && b.enabled).map((b) => b.competitionId)).size,
    entries: all.filter((b) => b.status === "approved" && b.enabled).length,
    pending: all.filter((b) => b.status === "pending").length,
  };
}

export interface BroadcasterInput {
  competitionId: string;
  competitionName: string;
  broadcasterName: string;
  platform?: BroadcastPlatform;
  regions?: string[];
  broadcastWebsite: string;
  verificationSource: string;
  requiresSubscription?: boolean;
  freeAccess?: boolean;
  notes?: string;
}

export async function createBroadcaster(input: BroadcasterInput): Promise<{ ok: true; entry: BroadcasterEntry } | { ok: false; error: string }> {
  const check = validateBroadcastLink(input.broadcastWebsite);
  if (!check.ok) return { ok: false, error: check.reason };
  const t = now();
  const entry: BroadcasterEntry = {
    id: `bc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    competitionId: input.competitionId.trim(),
    competitionName: input.competitionName.trim().slice(0, 120),
    broadcasterName: input.broadcasterName.trim().slice(0, 120),
    platform: input.platform ?? "TV",
    regions: (input.regions ?? []).map((r) => r.trim()).filter(Boolean).slice(0, 12),
    broadcastWebsite: input.broadcastWebsite.trim(),
    verificationSource: input.verificationSource.trim().slice(0, 300),
    isOfficialBroadcaster: true,
    requiresSubscription: input.requiresSubscription !== false,
    freeAccess: input.freeAccess === true,
    notes: input.notes?.slice(0, 500) || undefined,
    status: "pending", // admin must verify before it goes public
    enabled: true,
    createdAt: t,
    updatedAt: t,
  };
  const db = await pg();
  if (db) {
    try {
      await db.run(
        `INSERT INTO broadcasts (id, competition_id, competition_name, broadcaster_name, platform, regions,
         broadcast_website, verification_source, is_official_broadcaster, requires_subscription,
         free_access, notes, status, enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [entry.id, entry.competitionId, entry.competitionName, entry.broadcasterName, entry.platform, entry.regions,
         entry.broadcastWebsite, entry.verificationSource, entry.isOfficialBroadcaster, entry.requiresSubscription,
         entry.freeAccess, entry.notes ?? null, entry.status, entry.enabled],
      );
      return { ok: true, entry };
    } catch {
      // fall through
    }
  }
  memory().push(entry);
  return { ok: true, entry };
}

export async function setBroadcasterStatus(id: string, status: BroadcastStatus): Promise<boolean> {
  const db = await pg();
  if (db) {
    try {
      await db.run("UPDATE broadcasts SET status = $2, updated_at = now() WHERE id = $1", [id, status]);
      return true;
    } catch {
      // fall through
    }
  }
  const list = memory();
  const i = list.findIndex((b) => b.id === id);
  if (i < 0) return false;
  list[i] = { ...list[i]!, status, updatedAt: now() };
  return true;
}

export async function deleteBroadcaster(id: string): Promise<boolean> {
  const db = await pg();
  if (db) {
    try {
      await db.run("DELETE FROM broadcasts WHERE id = $1", [id]);
      return true;
    } catch {
      // fall through
    }
  }
  const list = memory();
  const i = list.findIndex((b) => b.id === id);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
}
