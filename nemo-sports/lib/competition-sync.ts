/**
 * NEMO Sports · automatic competition discovery & synchronization
 * ───────────────────────────────────────────────────────────────
 * Turns a provider's competition *catalog* into auditable local records so the
 * platform can show coverage that nobody had to type in by hand.
 *
 * What this module is NOT allowed to do, and why:
 *
 *  · It never publishes a page. A catalog row proves a competition exists; it
 *    says nothing about fixtures, live scores or standings. Publishing stays a
 *    separate, explicit decision (`published` defaults to false) so a listing
 *    can never manufacture an indexable empty competition page.
 *  · It never deletes on failure. A provider returning a partial or empty list
 *    must not be able to erase previously valid records, so a run only ever
 *    inserts or touches rows. Removal is an explicit admin action.
 *  · It keeps the LAST SUCCESSFUL run separate from the LAST ATTEMPT. Those are
 *    different facts, and an operator reading "synced 2 h ago" must not be
 *    told that when the last three attempts all failed.
 *
 * Storage follows the existing admin-store policy (lib/db/store-policy.ts):
 * Postgres when DATABASE_URL is set, in-process memory otherwise, and writes
 * are refused in production without a database rather than silently vanishing.
 */

import { getDb } from "@/lib/db/pg";
import { persistOrThrow, storeErrorMessage } from "@/lib/db/store-policy";
import { sdlContext } from "@/lib/sdl-gateway";
import { emptyCapabilities, type CompetitionCapabilities, type NormalizedCatalogCompetition, type ProviderName } from "@/packages/sdl/src";

export type ProviderCompetition = {
  id: string;
  /** SDL provider name — the provenance key for every other field here. */
  provider: ProviderName;
  /** The provider's own stable id/code. Never rewritten by us. */
  providerId: string;
  sport: string;
  name: string;
  shortName: string;
  country: string;
  countryCode: string;
  type: string;
  logoUrl: string;
  /**
   * Per-capability verification. `listed` is the only flag a catalog response
   * may set; everything else stays null until a real response proves it.
   */
  capabilities: CompetitionCapabilities;
  /**
   * Explicit publication decision. Stays false from discovery: the sitemap and
   * the public catalog only ever read this, never the raw catalog.
   */
  published: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
};

export type SyncRunStatus = "success" | "partial" | "failed" | "skipped";

export type CompetitionSyncRun = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: SyncRunStatus;
  /** Provider catalog requests that answered. */
  providersOk: string[];
  /** Providers asked that failed, or that cannot enumerate at all. */
  providersFailed: { provider: string; reason: string }[];
  seen: number;
  inserted: number;
  updated: number;
  /** Rows in the response that could not be stored (bad id, bad name). */
  rejected: number;
  message: string;
};

export type CompetitionSyncStatus = {
  /** When a run last SUCCEEDED and wrote something usable. */
  lastSuccessfulAt: string | null;
  /** When a run was last started, successful or not. */
  lastAttemptAt: string | null;
  lastRun: CompetitionSyncRun | null;
  storedCompetitions: number;
  publishedCompetitions: number;
  /** True only when the platform can actually keep this across restarts. */
  durable: boolean;
};

const DDL = `
CREATE TABLE IF NOT EXISTS provider_competitions (
  id            TEXT PRIMARY KEY,
  provider      TEXT NOT NULL,
  provider_id   TEXT NOT NULL,
  sport         TEXT NOT NULL DEFAULT 'football',
  name          TEXT NOT NULL,
  short_name    TEXT NOT NULL DEFAULT '',
  country       TEXT NOT NULL DEFAULT '',
  country_code  TEXT NOT NULL DEFAULT '',
  type          TEXT NOT NULL DEFAULT '',
  logo_url      TEXT NOT NULL DEFAULT '',
  capabilities  JSONB NOT NULL DEFAULT '{}'::jsonb,
  published     BOOLEAN NOT NULL DEFAULT false,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_id)
);
CREATE INDEX IF NOT EXISTS idx_provider_competitions_sport ON provider_competitions(sport);
CREATE INDEX IF NOT EXISTS idx_provider_competitions_published ON provider_competitions(published);
CREATE TABLE IF NOT EXISTS provider_competition_sync_runs (
  id               TEXT PRIMARY KEY,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at      TIMESTAMPTZ,
  status           TEXT NOT NULL,
  providers_ok     JSONB NOT NULL DEFAULT '[]'::jsonb,
  providers_failed JSONB NOT NULL DEFAULT '[]'::jsonb,
  seen             INTEGER NOT NULL DEFAULT 0,
  inserted         INTEGER NOT NULL DEFAULT 0,
  updated          INTEGER NOT NULL DEFAULT 0,
  rejected         INTEGER NOT NULL DEFAULT 0,
  message          TEXT NOT NULL DEFAULT ''
);
`;

/* ── sport / country scope actually worth asking for ──────────
   Each entry is one provider request, so this list IS the quota budget of a
   sync run. It is deliberately short: TheSportsDB's free tier is ~30 req/min
   and the community endpoint refuses an unfiltered listing anyway. */
const CATALOG_QUERIES: { sport: string; country?: string }[] = [
  { sport: "football" },
  { sport: "basketball" },
  { sport: "tennis" },
  { sport: "cricket" },
];

const mem = new Map<string, ProviderCompetition>();
const memRuns: CompetitionSyncRun[] = [];
let ddlDone = false;

const now = () => new Date().toISOString();
const genId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function cleanText(v: unknown, max = 200): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function pg() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const db = await getDb();
    if (!db) return null;
    if (!ddlDone) {
      ddlDone = true;
      for (const stmt of DDL.split(";").map((s) => s.trim()).filter(Boolean)) await db.run(stmt, []);
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

function capsFrom(v: unknown): CompetitionCapabilities {
  const raw = typeof v === "string" ? safeJson(v) : v;
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<CompetitionCapabilities>;
  const tri = (x: unknown): boolean | null => (typeof x === "boolean" ? x : null);
  return {
    listed: o.listed === true,
    fixtures: tri(o.fixtures),
    live: tri(o.live),
    results: tri(o.results),
    standings: tri(o.standings),
    teams: tri(o.teams),
    players: tri(o.players),
  };
}

function safeJson(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function fromRow(r: Row): ProviderCompetition {
  return {
    id: String(r.id),
    provider: String(r.provider) as ProviderName,
    providerId: String(r.provider_id),
    sport: String(r.sport ?? "football"),
    name: String(r.name ?? ""),
    shortName: String(r.short_name ?? ""),
    country: String(r.country ?? ""),
    countryCode: String(r.country_code ?? ""),
    type: String(r.type ?? ""),
    logoUrl: String(r.logo_url ?? ""),
    capabilities: capsFrom(r.capabilities),
    published: r.published === true,
    firstSeenAt: iso(r.first_seen_at),
    lastSeenAt: iso(r.last_seen_at),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

/** Every synchronized competition, newest sighting first. */
export async function listProviderCompetitions(filter: { sport?: string; publishedOnly?: boolean; limit?: number } = {}): Promise<ProviderCompetition[]> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<Row>("SELECT * FROM provider_competitions ORDER BY last_seen_at DESC, name", []);
      let list = rows.map(fromRow);
      if (filter.sport) list = list.filter((c) => c.sport === filter.sport);
      if (filter.publishedOnly) list = list.filter((c) => c.published);
      return list.slice(0, Math.min(2000, Math.max(1, filter.limit ?? 500)));
    } catch {
      // fall through to memory
    }
  }
  let list = [...mem.values()].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt) || a.name.localeCompare(b.name));
  if (filter.sport) list = list.filter((c) => c.sport === filter.sport);
  if (filter.publishedOnly) list = list.filter((c) => c.published);
  return list.slice(0, Math.min(2000, Math.max(1, filter.limit ?? 500)));
}

/** The most recent run, whether it worked or not. */
export async function lastSyncRun(): Promise<CompetitionSyncRun | null> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<Row>("SELECT * FROM provider_competition_sync_runs ORDER BY started_at DESC LIMIT 1", []);
      if (rows[0]) {
        const r = rows[0];
        return {
          id: String(r.id),
          startedAt: iso(r.started_at),
          finishedAt: r.finished_at ? iso(r.finished_at) : null,
          status: String(r.status) as SyncRunStatus,
          providersOk: (safeJson(String(r.providers_ok ?? "[]")) as string[]) ?? [],
          providersFailed: (safeJson(String(r.providers_failed ?? "[]")) as { provider: string; reason: string }[]) ?? [],
          seen: Number(r.seen ?? 0),
          inserted: Number(r.inserted ?? 0),
          updated: Number(r.updated ?? 0),
          rejected: Number(r.rejected ?? 0),
          message: String(r.message ?? ""),
        };
      }
      return null;
    } catch {
      // fall through
    }
  }
  return memRuns[memRuns.length - 1] ?? null;
}

/** Last successful run, independent of how many attempts failed since. */
export async function lastSuccessfulRun(): Promise<CompetitionSyncRun | null> {
  const db = await pg();
  if (db) {
    try {
      const rows = await db.select<Row>(
        "SELECT * FROM provider_competition_sync_runs WHERE status IN ('success','partial') ORDER BY started_at DESC LIMIT 1",
        [],
      );
      if (rows[0]) {
        const r = rows[0];
        return {
          id: String(r.id),
          startedAt: iso(r.started_at),
          finishedAt: r.finished_at ? iso(r.finished_at) : null,
          status: String(r.status) as SyncRunStatus,
          providersOk: (safeJson(String(r.providers_ok ?? "[]")) as string[]) ?? [],
          providersFailed: (safeJson(String(r.providers_failed ?? "[]")) as { provider: string; reason: string }[]) ?? [],
          seen: Number(r.seen ?? 0),
          inserted: Number(r.inserted ?? 0),
          updated: Number(r.updated ?? 0),
          rejected: Number(r.rejected ?? 0),
          message: String(r.message ?? ""),
        };
      }
      return null;
    } catch {
      // fall through
    }
  }
  for (let i = memRuns.length - 1; i >= 0; i--) {
    if (memRuns[i].status === "success" || memRuns[i].status === "partial") return memRuns[i];
  }
  return null;
}

export async function competitionSyncStatus(): Promise<CompetitionSyncStatus> {
  const [ok, attempt, all] = await Promise.all([lastSuccessfulRun(), lastSyncRun(), listProviderCompetitions({ limit: 2000 })]);
  return {
    lastSuccessfulAt: ok?.finishedAt ?? ok?.startedAt ?? null,
    lastAttemptAt: attempt?.startedAt ?? null,
    lastRun: attempt,
    storedCompetitions: all.length,
    publishedCompetitions: all.filter((c) => c.published).length,
    durable: Boolean(process.env.DATABASE_URL),
  };
}

/**
 * Which registered providers can enumerate a competition catalog at all.
 *
 * This is the honest answer to "can we discover competitions automatically?":
 * it reads each adapter's declared capabilities rather than guessing, so a
 * provider without a listing endpoint shows up as unable instead of silently
 * contributing zero rows.
 */
export async function catalogCapableProviders(): Promise<{ provider: ProviderName; capable: boolean }[]> {
  const { sdl } = await sdlContext();
  return sdl.registeredProviders().map((p) => ({
    provider: p.name as ProviderName,
    capable: p.capabilities.includes("competitions"),
  }));
}

export type DiscoveryOutcome = {
  provider: ProviderName;
  query: { sport: string; country?: string };
  ok: boolean;
  reason?: string;
  competitions: NormalizedCatalogCompetition[];
};

/**
 * Ask every capable provider for its catalog. One request per (provider,
 * sport) pair — the whole run stays inside a single minute of TheSportsDB's
 * ~30 req/min budget and inside Football-Data's 8/min internal budget.
 *
 * A provider that cannot enumerate is reported as `not_supported`, never as an
 * empty catalog, because those two facts need opposite reactions: one means
 * "ask someone else", the other means "the provider's index really is empty".
 */
export async function discoverCompetitions(queries: { sport: string; country?: string }[] = CATALOG_QUERIES): Promise<DiscoveryOutcome[]> {
  const { sdl, mode } = await sdlContext();
  const out: DiscoveryOutcome[] = [];
  if (mode === "demo") {
    return [{ provider: "demo", query: { sport: "football" }, ok: false, reason: "demo_mode", competitions: [] }];
  }

  for (const query of queries) {
    const result = await sdl.fetch<NormalizedCatalogCompetition[]>({
      sport: query.sport,
      dataType: "competitions",
      endpoint: "competitions",
      params: { sport: query.sport, ...(query.country ? { country: query.country } : {}) },
      call: (p) => p.getCompetitions({ ...(query.sport ? { sport: query.sport } : {}), ...(query.country ? { country: query.country } : {}) }),
    });
    if (!result.ok) {
      out.push({ provider: "unknown" as ProviderName, query, ok: false, reason: `${result.error.kind}: ${result.error.message}`, competitions: [] });
      continue;
    }
    out.push({ provider: result.value.provider, query, ok: true, competitions: result.value.data });
  }
  return out;
}

export type SyncResult =
  | { ok: true; run: CompetitionSyncRun }
  | { ok: false; reason: "no_provider" | "store_failed" | "demo_mode" | "all_failed"; detail: string; run?: CompetitionSyncRun };

export type CatalogApplyInput = {
  provider: ProviderName;
  sport: string;
  competition: NormalizedCatalogCompetition;
};

export type CatalogApplyResult = {
  row: ProviderCompetition;
  /** true when this row did not exist before this pass. */
  created: boolean;
};

/**
 * Pure normalization of one catalog row into a storable record.
 *
 * Extracted from the sync loop so the rules can be tested without a database, a
 * provider or a network: what makes a row acceptable, what is cleaned, and —
 * the part that matters most — that a capability already verified in an earlier
 * run is never reset to "unknown" by a later catalog response that simply does
 * not mention it.
 *
 * Returns null for a row that cannot be stored safely (no stable provider id, or
 * no name): such a row can be neither de-duplicated nor displayed, so it is
 * rejected and counted rather than written half-formed.
 */
export function catalogRow(
  input: CatalogApplyInput,
  previous: ProviderCompetition | undefined,
  at: string,
  idFactory: () => string,
): CatalogApplyResult | null {
  const providerId = cleanText(input.competition.providerId, 120);
  const name = cleanText(input.competition.name, 200);
  if (!providerId || !name) return null;

  const sport = cleanText(input.competition.sport ?? input.sport, 40) || "football";
  const capabilities: CompetitionCapabilities = {
    ...emptyCapabilities(true),
    // Never downgrade a capability we already verified: a catalog response
    // carries no opinion about fixtures or standings, so its silence must not
    // overwrite an earlier observed fact.
    ...(previous?.capabilities ?? {}),
    listed: true,
  };

  if (previous) {
    return {
      created: false,
      row: {
        ...previous,
        sport,
        name,
        shortName: cleanText(input.competition.shortName, 120) || previous.shortName,
        country: cleanText(input.competition.countryName, 120) || previous.country,
        countryCode: cleanText(input.competition.countryCode, 8) || previous.countryCode,
        type: cleanText(input.competition.type, 60) || previous.type,
        logoUrl: cleanText(input.competition.logoUrl, 1000) || previous.logoUrl,
        capabilities,
        lastSeenAt: at,
        updatedAt: at,
      },
    };
  }

  return {
    created: true,
    row: {
      id: idFactory(),
      provider: input.provider,
      providerId,
      sport,
      name,
      shortName: cleanText(input.competition.shortName, 120),
      country: cleanText(input.competition.countryName, 120),
      countryCode: cleanText(input.competition.countryCode, 8),
      type: cleanText(input.competition.type, 60),
      logoUrl: cleanText(input.competition.logoUrl, 1000),
      capabilities,
      published: false,
      firstSeenAt: at,
      lastSeenAt: at,
      createdAt: at,
      updatedAt: at,
    },
  };
}


/**
 * Run one catalog synchronization pass.
 *
 * Guarantees the callers rely on:
 *  · existing rows are matched on (provider, providerId) — the stable pair — so
 *    a re-run updates in place and cannot create duplicates;
 *  · a row never disappears because it was missing from one response;
 *  · capability flags already verified are preserved, never reset to null;
 *  · the run is recorded even when every provider failed, with the reason.
 */
export async function syncCompetitions(options: { queries?: { sport: string; country?: string }[]; triggeredBy?: string } = {}): Promise<SyncResult> {
  const startedAt = now();
  const runId = genId("csync");
  const { mode } = await sdlContext();

  const record = async (run: CompetitionSyncRun) => {
    const db = await pg();
    try {
      const inDb = await persistOrThrow(db, (d) =>
        d.run(
          `INSERT INTO provider_competition_sync_runs
             (id, started_at, finished_at, status, providers_ok, providers_failed, seen, inserted, updated, rejected, message)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            run.id, run.startedAt, run.finishedAt, run.status,
            JSON.stringify(run.providersOk), JSON.stringify(run.providersFailed),
            run.seen, run.inserted, run.updated, run.rejected, run.message,
          ],
        ),
      );
      if (!inDb) memRuns.push(run);
    } catch {
      // A bookkeeping failure must not erase the data we just stored; the run
      // stays visible through the in-memory copy for this process.
      memRuns.push(run);
    }
  };

  if (mode === "demo") {
    const run: CompetitionSyncRun = {
      id: runId, startedAt, finishedAt: now(), status: "skipped", providersOk: [], providersFailed: [],
      seen: 0, inserted: 0, updated: 0, rejected: 0,
      message: "الطبقة تعمل على محوّل تجريبي — لا يوجد فهرس حقيقي للمزامنة",
    };
    await record(run);
    return { ok: false, reason: "demo_mode", detail: run.message, run };
  }

  const capable = (await catalogCapableProviders()).filter((p) => p.capable);
  if (capable.length === 0) {
    const run: CompetitionSyncRun = {
      id: runId, startedAt, finishedAt: now(), status: "failed", providersOk: [],
      providersFailed: [{ provider: "*", reason: "لا يوجد مزوّد مُسجَّل يدعم تعداد البطولات" }],
      seen: 0, inserted: 0, updated: 0, rejected: 0,
      message: "لا يوجد مزوّد مُهيّأ يدعم تعداد البطولات (Football-Data أو TheSportsDB)",
    };
    await record(run);
    return { ok: false, reason: "no_provider", detail: run.message, run };
  }

  const outcomes = await discoverCompetitions(options.queries);
  const providersOk: string[] = [];
  const providersFailed: { provider: string; reason: string }[] = [];
  let seen = 0;
  let inserted = 0;
  let updated = 0;
  let rejected = 0;

  const db = await pg();
  const existing = new Map<string, ProviderCompetition>();
  for (const c of await listProviderCompetitions({ limit: 2000 })) existing.set(`${c.provider}::${c.providerId}`, c);

  for (const outcome of outcomes) {
    if (!outcome.ok) {
      providersFailed.push({ provider: String(outcome.provider), reason: outcome.reason ?? "unknown" });
      continue;
    }
    providersOk.push(`${outcome.provider}:${outcome.query.sport}`);
    for (const c of outcome.competitions) {
      seen++;
      const providerId = cleanText(c.providerId, 120);
      const name = cleanText(c.name, 200);
      // A row without a stable id or a name cannot be de-duplicated or shown;
      // counted as rejected rather than stored half-formed.
      if (!providerId || !name) {
        rejected++;
        continue;
      }
      const key = `${outcome.provider}::${providerId}`;
      const at = now();
      const applied = catalogRow(
        { provider: outcome.provider, sport: outcome.query.sport, competition: c },
        existing.get(key),
        at,
        () => genId("pcomp"),
      );
      if (!applied) {
        rejected++;
        continue;
      }
      const persisted = await save(db, applied.row);
      if (!persisted) {
        rejected++;
        continue;
      }
      existing.set(key, applied.row);
      if (applied.created) inserted++;
      else updated++;
    }
  }

  const allFailed = providersOk.length === 0;
  const status: SyncRunStatus = allFailed ? "failed" : providersFailed.length > 0 ? "partial" : "success";
  const message = allFailed
    ? `فشلت كل طلبات الفهرس (${providersFailed.map((f) => f.reason).join("؛ ")}) — لم يُحذف أي سجل موجود`
    : `شوهدت ${seen} بطولة · أُضيفت ${inserted} · حُدِّثت ${updated}${rejected ? ` · مرفوضة ${rejected}` : ""}`;

  const run: CompetitionSyncRun = {
    id: runId, startedAt, finishedAt: now(), status,
    providersOk, providersFailed, seen, inserted, updated, rejected, message,
  };
  await record(run);

  if (allFailed) return { ok: false, reason: "all_failed", detail: message, run };
  return { ok: true, run };
}

/** Insert-or-update one row. Returns false when the store refused the write. */
async function save(db: Awaited<ReturnType<typeof pg>>, c: ProviderCompetition): Promise<boolean> {
  try {
    const inDb = await persistOrThrow(db, (d) =>
      d.run(
        `INSERT INTO provider_competitions
           (id, provider, provider_id, sport, name, short_name, country, country_code, type, logo_url, capabilities, published, first_seen_at, last_seen_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16)
         ON CONFLICT (provider, provider_id) DO UPDATE SET
           sport=EXCLUDED.sport, name=EXCLUDED.name, short_name=EXCLUDED.short_name,
           country=EXCLUDED.country, country_code=EXCLUDED.country_code, type=EXCLUDED.type,
           logo_url=EXCLUDED.logo_url, capabilities=EXCLUDED.capabilities,
           last_seen_at=EXCLUDED.last_seen_at, updated_at=EXCLUDED.updated_at`,
        [
          c.id, c.provider, c.providerId, c.sport, c.name, c.shortName, c.country, c.countryCode,
          c.type, c.logoUrl, JSON.stringify(c.capabilities), c.published, c.firstSeenAt, c.lastSeenAt, c.createdAt, c.updatedAt,
        ],
      ),
    );
    if (!inDb) mem.set(`${c.provider}::${c.providerId}`, c);
    return true;
  } catch (e) {
    // A single bad row must not abort the whole run.
    if (process.env.NEMO_DEBUG === "1") console.error("[competition-sync] row write refused:", storeErrorMessage(e));
    return false;
  }
}

/**
 * Explicit publication decision — the ONLY path that lets a discovered
 * competition reach the public catalog and the sitemap. Kept separate from the
 * sync so automation can never publish on its own.
 */
export async function setProviderCompetitionPublished(provider: string, providerId: string, published: boolean): Promise<boolean> {
  const db = await pg();
  const key = `${provider}::${providerId}`;
  const found = (await listProviderCompetitions({ limit: 2000 })).find((c) => `${c.provider}::${c.providerId}` === key);
  if (!found) return false;
  try {
    const inDb = await persistOrThrow(db, (d) =>
      d.run("UPDATE provider_competitions SET published=$3, updated_at=now() WHERE provider=$1 AND provider_id=$2", [provider, providerId, published]),
    );
    if (!inDb) {
      mem.set(key, { ...found, published, updatedAt: now() });
    }
    return true;
  } catch {
    return false;
  }
}

/** Test/verification helper — clears the in-process store only. */
export function resetInMemoryCompetitions(): void {
  mem.clear();
  memRuns.length = 0;
}

/* ── machine-readable coverage inventory ────────────────────── */

export type CoverageEntry = {
  /** NEMO's public path when the competition has a working page, else null. */
  path: string | null;
  /** "canonical" = hand-verified catalog with a live page; "discovered" = found
   *  in a provider's catalog and not yet mapped to a page. */
  status: "canonical" | "discovered";
  provider: string | null;
  providerId: string | null;
  name: string;
  nameAr: string | null;
  sport: string;
  country: string | null;
  capabilities: CompetitionCapabilities;
  published: boolean;
  lastSeenAt: string | null;
};

export type CompetitionCoverage = {
  generatedAt: string;
  counts: { total: number; canonical: number; discovered: number; published: number };
  bySport: Record<string, number>;
  /** Which registered providers can enumerate a catalog at all. */
  catalogProviders: { provider: string; capable: boolean }[];
  entries: CoverageEntry[];
};

/**
 * The coverage inventory: what the site actually covers, next to what the
 * providers list but the site has not mapped yet.
 *
 * This is the honest separation Part 4 asks for. A `canonical` entry has a
 * public page and a hand-verified provider id; a `discovered` entry is only
 * proof that a provider's index contains the competition. Nothing here claims
 * fixtures, live scores or standings that were never observed — every such flag
 * stays null until a real response sets it.
 */
export async function competitionCoverage(): Promise<CompetitionCoverage> {
  const [{ canonicalCompetitions }, discovered, providers] = await Promise.all([
    import("@/lib/competition-catalog"),
    listProviderCompetitions({ limit: 2000 }),
    catalogCapableProviders(),
  ]);

  const entries: CoverageEntry[] = [
    ...canonicalCompetitions.map((c): CoverageEntry => ({
      path: `/competitions/${c.canonicalSlug}`,
      status: "canonical",
      provider: null,
      providerId: c.providerId,
      name: c.name,
      nameAr: c.nameAr,
      sport: "football",
      country: c.countryAr,
      // The canonical catalog's slugs were each confirmed against the live
      // SportScore standings endpoint when they were added, so `listed` is a
      // fact; every other capability still needs its own verified response.
      capabilities: emptyCapabilities(true),
      published: true,
      lastSeenAt: null,
    })),
    ...discovered.map((c): CoverageEntry => ({
      path: null,
      status: "discovered",
      provider: c.provider,
      providerId: c.providerId,
      name: c.name,
      nameAr: null,
      sport: c.sport,
      country: c.country || null,
      capabilities: c.capabilities,
      published: c.published,
      lastSeenAt: c.lastSeenAt,
    })),
  ];

  const bySport: Record<string, number> = {};
  for (const e of entries) bySport[e.sport] = (bySport[e.sport] ?? 0) + 1;

  return {
    generatedAt: now(),
    counts: {
      total: entries.length,
      canonical: entries.filter((e) => e.status === "canonical").length,
      discovered: entries.filter((e) => e.status === "discovered").length,
      published: entries.filter((e) => e.published).length,
    },
    bySport,
    catalogProviders: providers.map((p) => ({ provider: p.provider, capable: p.capable })),
    entries,
  };
}
