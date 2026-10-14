/**
 * NEMO Sports · Pipeline · idempotent upsert layer
 * ────────────────────────────────────────────────
 * The only module that writes canonical entities from the pipeline. It is
 * deliberately explicit SQL rather than a second ORM: the canonical schema
 * already exists (db/schema.sql) and the Sports-Data-Layer already owns the
 * request-time reads, so this file does exactly two jobs —
 *
 *   1. turn "provider said X" into canonical rows, idempotently (re-running a
 *      job changes nothing but `updated_at` and `last_seen_at`);
 *   2. obey the priority rules in `priority.ts`, recording every disagreement
 *      it refuses to apply.
 *
 * Identity: a provider id is looked up in `source_id_map` first (then the SDL's
 * `provider_entity_map`), and only when neither knows it does the pipeline
 * derive a deterministic uuid. Every write also registers the mapping in BOTH
 * tables inside one transaction, so the ingestion path and the read path can
 * never disagree about which row an entity is.
 */

import { getDb, type PgDriver } from "@/lib/db/pg";
import { canonicalSchemaError } from "@/lib/db/canonical-schema";
import { canonicalId, slugify } from "@/packages/sdl/src";
import { arabicAliasesFor } from "@/lib/name-aliases";
import { decideField, rankOf, severityForField } from "./priority";
import { recordDiscrepancy } from "./discrepancies";
import type {
  CompetitionSpec,
  NormalizedMatch,
  NormalizedSeason,
  NormalizedStanding,
  NormalizedTeam,
  PipelineConfig,
  SourceName,
} from "./types";

export type Db = PgDriver;

export type UpsertOutcome = {
  id: string;
  created: boolean;
  conflicts: number;
  applied: string[];
};

/** Deterministic uuid for pipeline-owned reference rows (countries, venues). */
export const pipelineUuid = (entityType: string, seed: string): string =>
  canonicalId(entityType as Parameters<typeof canonicalId>[0], seed);

/* ─── reference rows ─────────────────────────────────────────────────────── */

export async function ensureSport(db: Db, slug = "football"): Promise<string> {
  // A missing relation here is not a data problem: the canonical schema was
  // never prepared (or the role lost its rights). The reason travels with the
  // remedy — see `canonicalSchemaError`.
  let found: { id: string }[];
  try {
    found = await db.select<{ id: string }>(`SELECT id FROM sports WHERE slug = $1 LIMIT 1`, [slug]);
  } catch (e) {
    throw canonicalSchemaError("sports", e);
  }
  if (found[0]?.id) return found[0].id;
  const id = pipelineUuid("sport", slug);
  try {
    await db.run(
      `INSERT INTO sports (id, slug, name_ar, name_en, short_name_ar, short_name_en, display_order, config)
     VALUES ($1, $2, $3, $4, $5, $6, 1, '{}'::jsonb)
     ON CONFLICT (slug) DO NOTHING`,
      [id, slug, slug === "football" ? "كرة القدم" : slug, slug === "football" ? "Football" : slug, slug, slug.toUpperCase()],
    );
  } catch (e) {
    throw canonicalSchemaError("sports", e);
  }
  const again = await db.select<{ id: string }>(`SELECT id FROM sports WHERE slug = $1 LIMIT 1`, [slug]);
  return again[0]?.id ?? id;
}

/**
 * Football nations are not ISO-3166 countries: providers publish `ENG`, `SCO`
 * or `EGY`, while `countries.iso2` is `char(2)`. Anything three letters long is
 * therefore resolved through this table instead of being truncated into a
 * different country by accident. An unknown three-letter code throws — writing
 * a wrong ISO code into the canonical tables is worse than skipping the row.
 */
const FIFA_TO_ISO: Record<string, [string, string]> = {
  EGY: ["EG", "EGY"],
  ENG: ["GB", "GBR"],
  SCO: ["GB", "GBR"],
  WAL: ["GB", "GBR"],
  NIR: ["GB", "GBR"],
};

export async function ensureCountry(db: Db, iso2: string, nameAr: string, nameEn: string): Promise<string> {
  const raw = iso2.trim().toUpperCase();
  let alpha2 = raw;
  let alpha3 = raw;
  if (raw.length === 3) {
    const mapped = FIFA_TO_ISO[raw];
    if (!mapped) throw new Error(`ensureCountry: «${raw}» is not an ISO-3166 alpha-2 code and is not a known football-nation alias`);
    [alpha2, alpha3] = mapped;
  } else if (raw.length !== 2) {
    throw new Error(`ensureCountry: «${raw}» must be a 2-letter ISO code or a known 3-letter football-nation alias`);
  } else {
    alpha3 = raw === "EG" ? "EGY" : raw;
  }

  const id = pipelineUuid("country", alpha2);
  let rows: { id: string }[];
  try {
    await db.run(
      `INSERT INTO countries (id, iso2, iso3, name_ar, name_en)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (iso2) DO UPDATE SET name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en, updated_at = now()`,
      [id, alpha2, alpha3, nameAr, nameEn],
    );
    rows = await db.select<{ id: string }>(`SELECT id FROM countries WHERE iso2 = $1 LIMIT 1`, [alpha2]);
  } catch (e) {
    throw canonicalSchemaError("countries", e);
  }
  return rows[0]?.id ?? id;
}

/* ─── source id mapping (both tables, one transaction) ───────────────────── */

export type EntityType = "sport" | "country" | "competition" | "season" | "venue" | "team" | "player" | "match" | "standing";

export async function lookupInternalId(db: Db, source: SourceName, entityType: EntityType, sourceId: string): Promise<string | null> {
  const own = await db.select<{ internal_id: string }>(
    `SELECT internal_id FROM source_id_map WHERE source = $1 AND entity_type = $2 AND source_id = $3`,
    [source, entityType, sourceId],
  );
  if (own[0]?.internal_id) return own[0].internal_id;

  // The SDL resolver may have seen this provider id first (request-time path).
  const shared = await db.select<{ canonical_id: string }>(
    `SELECT canonical_id FROM provider_entity_map WHERE provider = $1 AND entity_type = $2 AND provider_id = $3`,
    [source, entityType, sourceId],
  );
  return shared[0]?.canonical_id ?? null;
}

export async function recordSourceMapping(
  db: Db,
  input: { source: SourceName; entityType: EntityType; sourceId: string; internalId: string; extra?: Record<string, unknown>; confidence?: number },
): Promise<void> {
  const extra = JSON.stringify(input.extra ?? {});
  const confidence = input.confidence ?? 1;
  await db.transaction(async (tx) => {
    await tx.run(
      `INSERT INTO source_id_map (source, entity_type, source_id, internal_id, last_seen_at, extra_json)
       VALUES ($1, $2, $3, $4, now(), $5::jsonb)
       ON CONFLICT (source, entity_type, source_id) DO UPDATE
         SET internal_id = EXCLUDED.internal_id,
             last_seen_at = now(),
             extra_json = source_id_map.extra_json || EXCLUDED.extra_json`,
      [input.source, input.entityType, input.sourceId, input.internalId, extra],
    );
    await tx.run(
      `INSERT INTO provider_entity_map (entity_type, canonical_id, provider, provider_id, confidence, verified, notes)
       VALUES ($1, $2, $3, $4, $5, true, 'pipeline')
       ON CONFLICT (entity_type, provider, provider_id) DO UPDATE
         SET canonical_id = EXCLUDED.canonical_id, confidence = EXCLUDED.confidence, updated_at = now()`,
      [input.entityType, input.internalId, input.source, input.sourceId, confidence],
    );
  });
}

/* ─── competitions & seasons ─────────────────────────────────────────────── */

export async function upsertCompetition(db: Db, spec: CompetitionSpec, sportId: string, countryId: string | null): Promise<string> {
  const id = pipelineUuid("competition", spec.slug);
  let rows: { id: string }[];
  try {
    rows = await db.select<{ id: string }>(
      `INSERT INTO competitions
       (id, sport_id, country_id, name_ar, name_en, short_name_ar, short_name_en, slug, type, is_active, is_featured, display_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11)
     ON CONFLICT (slug) DO UPDATE SET
       name_ar = EXCLUDED.name_ar,
       name_en = EXCLUDED.name_en,
       short_name_ar = EXCLUDED.short_name_ar,
       short_name_en = EXCLUDED.short_name_en,
       type = EXCLUDED.type,
       is_featured = EXCLUDED.is_featured,
       country_id = COALESCE(EXCLUDED.country_id, competitions.country_id),
       is_active = true,
       updated_at = now()
     RETURNING id`,
      [
        id,
        sportId,
        countryId,
        spec.name_ar,
        spec.name_en,
        spec.short_ar,
        spec.short_en,
        spec.slug,
        spec.type,
        spec.featured,
        spec.featured ? 10 : 100,
      ],
    );
  } catch (e) {
    throw canonicalSchemaError("competitions", e);
  }
  return rows[0]?.id ?? id;
}

export function seasonSlug(name: string): string {
  const cleaned = name.trim().replace(/[^0-9a-zA-Z]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return cleaned || slugify(name);
}

export async function upsertSeason(
  db: Db,
  competitionId: string,
  season: Pick<NormalizedSeason, "name" | "startDate" | "endDate" | "isCurrent" | "status">,
): Promise<{ id: string; isCurrent: boolean }> {
  const slug = seasonSlug(season.name);
  const id = pipelineUuid("season", `${competitionId}:${slug}`);
  const isCurrent = season.isCurrent ?? true;

  return db.transaction(async (tx) => {
    if (isCurrent) {
      // idx_seasons_one_current is a partial unique index: only one season per
      // competition may be current, so the previous one is demoted first.
      await tx.run(`UPDATE seasons SET is_current = false, updated_at = now() WHERE competition_id = $1 AND slug <> $2 AND is_current`, [
        competitionId,
        slug,
      ]);
    }
    const rows = await tx.select<{ id: string }>(
      `INSERT INTO seasons (id, competition_id, name, slug, start_date, end_date, is_current, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (competition_id, slug) DO UPDATE SET
         name = EXCLUDED.name,
         start_date = COALESCE(EXCLUDED.start_date, seasons.start_date),
         end_date = COALESCE(EXCLUDED.end_date, seasons.end_date),
         is_current = EXCLUDED.is_current,
         status = EXCLUDED.status,
         updated_at = now()
       RETURNING id`,
      [
        id,
        competitionId,
        season.name,
        slug,
        season.startDate ?? null,
        season.endDate ?? null,
        isCurrent,
        season.status ?? (isCurrent ? "active" : "upcoming"),
      ],
    );
    const seasonId = rows[0]?.id ?? id;
    if (isCurrent) {
      await tx.run(`UPDATE competitions SET current_season_id = $2, updated_at = now() WHERE id = $1`, [competitionId, seasonId]);
    }
    return { id: seasonId, isCurrent };
  });
}

/* ─── teams & venues ─────────────────────────────────────────────────────── */

async function freeSlug(db: Db, base: string, id: string): Promise<string> {
  const candidate = base || "entity";
  const rows = await db.select<{ id: string; slug: string }>(`SELECT id, slug FROM teams WHERE slug = $1 OR slug LIKE $2 LIMIT 50`, [
    candidate,
    `${candidate}-%`,
  ]);
  const taken = new Set(rows.filter((r) => r.id !== id).map((r) => r.slug));
  if (!taken.has(candidate)) return candidate;
  for (let i = 2; i < 100; i += 1) {
    const next = `${candidate}-${i}`;
    if (!taken.has(next)) return next;
  }
  return `${candidate}-${id.slice(0, 8)}`;
}

export async function upsertTeam(
  db: Db,
  cfg: PipelineConfig,
  team: NormalizedTeam,
  ctx: { sportId: string; countryId: string | null; source: SourceName },
): Promise<{ id: string; created: boolean; conflicts: number }> {
  const mapped = await lookupInternalId(db, ctx.source, "team", team.sourceId);
  let id = mapped;
  let conflictCount = 0;

  if (!id) {
    // Second chance: same provider, same normalized name (providers change ids).
    const byName = await db.select<{ id: string }>(
      `SELECT t.id FROM teams t
         JOIN provider_entity_map m ON m.canonical_id = t.id AND m.entity_type = 'team'
        WHERE m.provider = $1 AND lower(t.name_en) = lower($2)
        LIMIT 1`,
      [ctx.source, team.name],
    );
    id = byName[0]?.id ?? canonicalId("team", team.name);
  }

  const source = ctx.source;
  const existing = await db.select<{
    id: string;
    name_en: string;
    name_ar: string;
    logo_url: string | null;
    founded_year: number | null;
    country_id: string | null;
    is_active: boolean;
    extension_provider: string | null;
  }>(
    `SELECT id, name_en, name_ar, logo_url, founded_year, country_id, is_active,
            NULL::text AS extension_provider
       FROM teams WHERE id = $1`,
    [id],
  );
  const current = existing[0] ?? null;
  const created = !current;

  const storedOwner = created ? null : source; // teams carry no per-field provenance table; the provider that created the row owns it
  const nameDecision = current
    ? decideField(cfg, { field: "name", stored: current.name_en, incoming: team.name, storedSource: storedOwner, incomingSource: source })
    : null;
  if (nameDecision?.conflict) conflictCount += 1;

  const nameEn = nameDecision?.value ?? team.name;
  const aliases = arabicAliasesFor(nameEn);
  const nameAr = current?.name_ar && current.name_ar !== current.name_en ? current.name_ar : aliases[0] ?? nameEn;

  const slug = created ? await freeSlug(db, slugify(nameEn), id) : (await db.select<{ slug: string }>(`SELECT slug FROM teams WHERE id = $1`, [id]))[0]?.slug ?? slugify(nameEn);

  const short = (team.shortName ?? nameEn).slice(0, 40);
  const abbreviation = nameEn
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || nameEn.slice(0, 3).toUpperCase();

  await db.run(
    `INSERT INTO teams
       (id, sport_id, country_id, name_ar, name_en, short_name_ar, short_name_en, abbreviation, slug, logo_url,
        logo_source, founded_year, is_national, type, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,true)
     ON CONFLICT (id) DO UPDATE SET
       name_en = EXCLUDED.name_en,
       name_ar = EXCLUDED.name_ar,
       short_name_en = EXCLUDED.short_name_en,
       short_name_ar = EXCLUDED.short_name_ar,
       abbreviation = EXCLUDED.abbreviation,
       logo_url = COALESCE(EXCLUDED.logo_url, teams.logo_url),
       logo_source = COALESCE(EXCLUDED.logo_source, teams.logo_source),
       founded_year = COALESCE(EXCLUDED.founded_year, teams.founded_year),
       country_id = COALESCE(EXCLUDED.country_id, teams.country_id),
       is_active = true,
       updated_at = now()`,
    [
      id,
      ctx.sportId,
      ctx.countryId,
      nameAr,
      nameEn,
      short,
      short,
      abbreviation,
      slug,
      team.logoUrl ?? null,
      team.logoUrl ? source : null,
      team.foundedYear ?? null,
      Boolean(team.countryCode && team.countryCode !== "EG" && /national/i.test(team.name)),
      team.countryCode && /national/i.test(team.name) ? "national" : "club",
    ],
  );

  await recordSourceMapping(db, { source, entityType: "team", sourceId: team.sourceId, internalId: id, extra: { name: team.name } });
  return { id, created, conflicts: conflictCount };
}

export async function ensureVenue(db: Db, name: string, countryId: string | null): Promise<string> {
  const clean = name.trim();
  const id = pipelineUuid("venue", clean);
  const aliases = arabicAliasesFor(clean);
  await db.run(
    `INSERT INTO venues (id, name_ar, name_en, country_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       name_en = EXCLUDED.name_en,
       country_id = COALESCE(EXCLUDED.country_id, venues.country_id),
       updated_at = now()`,
    [id, aliases[0] ?? clean, clean, countryId],
  );
  return id;
}

/* ─── matches ────────────────────────────────────────────────────────────── */

type MatchProvenance = {
  provider?: SourceName;
  providerUpdatedAt?: string;
  pipeline?: {
    updatedAt?: string;
    fields?: Record<string, SourceName>;
    sources?: Record<string, { id: string; seenAt: string }>;
    venueName?: string | null;
  };
};

/** Schedule day used for the natural key (kickoff can move by a few hours). */
const dayKey = (iso: string): string => new Date(iso).toISOString().slice(0, 10);

export async function upsertMatch(
  db: Db,
  cfg: PipelineConfig,
  match: NormalizedMatch,
  refs: {
    sportId: string;
    competitionId: string;
    seasonId: string | null;
    homeTeamId: string;
    awayTeamId: string;
    countryId: string | null;
    source: SourceName;
    runId?: string | null;
  },
): Promise<UpsertOutcome> {
  const applied: string[] = [];
  let conflicts = 0;

  const mapped = await lookupInternalId(db, refs.source, "match", match.sourceId);
  let id = mapped;

  if (!id) {
    const natural = await db.select<{ id: string }>(
      `SELECT id FROM matches
        WHERE competition_id = $1
          AND home_team_id = $2
          AND away_team_id = $3
          AND scheduled_at BETWEEN $4::timestamptz - interval '36 hours' AND $4::timestamptz + interval '36 hours'
        LIMIT 1`,
      [refs.competitionId, refs.homeTeamId, refs.awayTeamId, match.scheduledAt],
    );
    id = natural[0]?.id ?? canonicalId("match", `${refs.competitionId}:${refs.homeTeamId}:${refs.awayTeamId}:${dayKey(match.scheduledAt)}`);
  }

  const existingRows = await db.select<{
    id: string;
    scheduled_at: string;
    status: string;
    home_score: number | null;
    away_score: number | null;
    round: string | null;
    venue_id: string | null;
    extension: unknown;
  }>(
    `SELECT id, scheduled_at, status, home_score, away_score, round, venue_id, extension FROM matches WHERE id = $1`,
    [id],
  );
  const existing = existingRows[0] ?? null;
  const created = !existing;
  const provenance = (existing?.extension && typeof existing.extension === "object" ? (existing.extension as MatchProvenance) : {}) ?? {};
  const fields = provenance.pipeline?.fields ?? {};
  const storedOwner = (field: string): SourceName | null => fields[field] ?? provenance.provider ?? null;

  const scheduledStored = existing ? new Date(existing.scheduled_at).toISOString() : null;
  const scheduled = decideField<string>(cfg, {
    field: "scheduledAt",
    stored: scheduledStored,
    incoming: match.scheduledAt,
    storedSource: storedOwner("scheduledAt"),
    incomingSource: refs.source,
    equal: (a, b) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 60_000,
  });
  const status = decideField<string>(cfg, {
    field: "status",
    stored: existing?.status ?? null,
    incoming: match.status,
    storedSource: storedOwner("status"),
    incomingSource: refs.source,
  });
  const homeScore = decideField<number | null>(cfg, {
    field: "homeScore",
    stored: existing?.home_score ?? null,
    incoming: match.homeScore,
    storedSource: storedOwner("homeScore"),
    incomingSource: refs.source,
  });
  const awayScore = decideField<number | null>(cfg, {
    field: "awayScore",
    stored: existing?.away_score ?? null,
    incoming: match.awayScore,
    storedSource: storedOwner("awayScore"),
    incomingSource: refs.source,
  });
  const round = decideField<string | null>(cfg, {
    field: "round",
    stored: existing?.round ?? null,
    incoming: match.round ?? null,
    storedSource: storedOwner("round"),
    incomingSource: refs.source,
  });

  const decisions: { field: string; decision: ReturnType<typeof decideField> }[] = [
    { field: "scheduledAt", decision: scheduled },
    { field: "status", decision: status },
    { field: "homeScore", decision: homeScore },
    { field: "awayScore", decision: awayScore },
    { field: "round", decision: round },
  ];

  const finalHome = homeScore.value;
  const finalAway = awayScore.value;
  const finalStatus = status.value;
  const terminal = ["finished", "awarded", "walkover", "abandoned", "cancelled"].includes(finalStatus);
  const winner = finalStatus === "finished" && finalHome !== null && finalAway !== null ? (finalHome > finalAway ? "home" : finalAway > finalHome ? "away" : "draw") : null;

  const venueId = match.venueName ? await ensureVenue(db, match.venueName, refs.countryId) : existing?.venue_id ?? null;

  const nextProvenance: MatchProvenance = {
    provider: refs.source,
    providerUpdatedAt: new Date().toISOString(),
    pipeline: {
      updatedAt: new Date().toISOString(),
      fields: { ...fields },
      sources: { ...(provenance.pipeline?.sources ?? {}) },
      venueName: match.venueName ?? provenance.pipeline?.venueName ?? null,
    },
  };
  for (const { field, decision } of decisions) {
    if (decision.applied && (match.homeScore !== null || field !== "homeScore")) nextProvenance.pipeline!.fields![field] = refs.source;
  }
  nextProvenance.pipeline!.sources![refs.source] = { id: match.sourceId, seenAt: new Date().toISOString() };

  await db.run(
    `INSERT INTO matches
       (id, sport_id, competition_id, season_id, round, home_team_id, away_team_id, venue_id, scheduled_at, status,
        home_score, away_score, winner, extension)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       season_id = COALESCE(EXCLUDED.season_id, matches.season_id),
       round = EXCLUDED.round,
       venue_id = COALESCE(EXCLUDED.venue_id, matches.venue_id),
       scheduled_at = EXCLUDED.scheduled_at,
       status = EXCLUDED.status,
       home_score = CASE WHEN EXCLUDED.status IN ('scheduled','postponed','cancelled') THEN matches.home_score ELSE EXCLUDED.home_score END,
       away_score = CASE WHEN EXCLUDED.status IN ('scheduled','postponed','cancelled') THEN matches.away_score ELSE EXCLUDED.away_score END,
       winner = EXCLUDED.winner,
       extension = EXCLUDED.extension,
       updated_at = now()`,
    [
      id,
      refs.sportId,
      refs.competitionId,
      refs.seasonId,
      round.value ?? null,
      refs.homeTeamId,
      refs.awayTeamId,
      venueId,
      scheduled.value,
      finalStatus,
      terminal ? finalHome : finalStatus === "live" || finalStatus === "halftime" || finalStatus === "extra_time" || finalStatus === "penalty_shootout" ? finalHome : null,
      terminal ? finalAway : finalStatus === "live" || finalStatus === "halftime" || finalStatus === "extra_time" || finalStatus === "penalty_shootout" ? finalAway : null,
      winner,
      JSON.stringify(nextProvenance),
    ],
  );

  await recordSourceMapping(db, {
    source: refs.source,
    entityType: "match",
    sourceId: match.sourceId,
    internalId: id,
    extra: { competition: match.competitionSlug, scheduledAt: match.scheduledAt },
  });

  for (const { field, decision } of decisions) {
    if (!decision.conflict) continue;
    conflicts += 1;
    const winner = decision.applied ? refs.source : decision.owner;
    const loser = decision.applied ? decision.owner : refs.source;
    const incomingValue =
      field === "scheduledAt" ? match.scheduledAt : field === "status" ? match.status : field === "homeScore" ? match.homeScore : field === "awayScore" ? match.awayScore : match.round ?? null;
    const storedValue =
      field === "scheduledAt" ? scheduledStored : field === "status" ? existing?.status ?? null : field === "homeScore" ? existing?.home_score ?? null : field === "awayScore" ? existing?.away_score ?? null : existing?.round ?? null;
    await recordDiscrepancy({
      entityType: "match",
      entityId: id,
      field,
      severity: severityForField(field),
      values: { [refs.source]: incomingValue, [loser]: storedValue },
      winner,
      losers: [loser],
      notes: `field=${field} decision=${decision.reason}`,
    });
  }

  return { id, created, conflicts, applied };
}

/* ─── standings ──────────────────────────────────────────────────────────── */

export type StandingsOutcome = { applied: number; skipped: number; replacedOtherProviders: number; provider: SourceName };

/**
 * A league table is a set, not a stream: the whole table for one
 * (season, group) is replaced atomically, and only for the provider that owns
 * it. A source that outranks the current owner takes the table over — the
 * previous owner's rows are removed (their bytes stay in `raw_payloads`).
 */
export async function replaceStandings(
  db: Db,
  cfg: PipelineConfig,
  rows: NormalizedStanding[],
  ctx: { competitionId: string; seasonId: string; source: SourceName; teamIdFor: (sourceId: string) => string | null },
): Promise<StandingsOutcome> {
  if (rows.length === 0) return { applied: 0, skipped: 0, replacedOtherProviders: 0, provider: ctx.source };

  const groupName = rows[0]?.groupName ?? null;
  const incomingRank = rankOf(cfg, ctx.source);

  // Identity guard: the table is replaced only when EVERY row resolves to a
  // known team. Otherwise the delete below would remove the stored rows and
  // insert only the resolvable subset (or nothing), silently shrinking or
  // wiping a good table because of an identity gap. In that case the stored
  // table is kept and the gap is recorded for review.
  const unresolved = rows.filter((row) => !ctx.teamIdFor(row.teamSourceId)).length;
  if (unresolved > 0) {
    await recordDiscrepancy({
      entityType: "standing",
      entityId: ctx.seasonId,
      field: "table",
      severity: "high",
      values: { [ctx.source]: `${rows.length} rows, ${unresolved} unresolved team(s)` },
      winner: ctx.source,
      losers: [],
      notes: "standings replacement skipped: unresolved team identities; stored table kept",
    });
    return { applied: 0, skipped: rows.length, replacedOtherProviders: 0, provider: ctx.source };
  }

  return db.transaction(async (tx) => {
    const existing = await tx.select<{ provider: string; count: string }>(
      `SELECT provider, count(*)::text AS count
         FROM standings
        WHERE season_id = $1 AND COALESCE(group_name, '') = COALESCE($2, '')
        GROUP BY provider`,
      [ctx.seasonId, groupName],
    );

    let replacedOtherProviders = 0;
    for (const other of existing) {
      if (other.provider === ctx.source) continue;
      if (rankOf(cfg, other.provider) > incomingRank) {
        await tx.run(`DELETE FROM standings WHERE season_id = $1 AND COALESCE(group_name, '') = COALESCE($2, '') AND provider = $3`, [
          ctx.seasonId,
          groupName,
          other.provider,
        ]);
        replacedOtherProviders += 1;
        await recordDiscrepancy({
          entityType: "standing",
          entityId: ctx.seasonId,
          field: "table",
          severity: "high",
          values: { [ctx.source]: `${rows.length} rows`, [other.provider]: `${other.count} rows` },
          winner: ctx.source,
          losers: [other.provider],
          notes: "higher-priority source replaced the league table",
        });
      }
    }

    await tx.run(`DELETE FROM standings WHERE season_id = $1 AND COALESCE(group_name, '') = COALESCE($2, '') AND provider = $3`, [
      ctx.seasonId,
      groupName,
      ctx.source,
    ]);

    let applied = 0;
    let skipped = 0;
    for (const row of rows) {
      const teamId = ctx.teamIdFor(row.teamSourceId);
      if (!teamId) {
        skipped += 1;
        continue;
      }
      const status = row.status && ["champion", "promotion", "promotion_playoff", "cup_position", "relegation_playoff", "relegation"].includes(row.status) ? row.status : null;
      await tx.run(
        `INSERT INTO standings
           (competition_id, season_id, group_name, team_id, position, played, won, drawn, lost, goals_for, goals_against, points, form, status, provider, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())`,
        [
          ctx.competitionId,
          ctx.seasonId,
          groupName,
          teamId,
          row.position,
          row.played,
          row.won,
          row.drawn,
          row.lost,
          row.goalsFor,
          row.goalsAgainst,
          row.points,
          row.form ?? null,
          status,
          ctx.source,
        ],
      );
      applied += 1;
    }
    return { applied, skipped, replacedOtherProviders, provider: ctx.source };
  });
}

/** Standings ownership per season — used by the status page and the doctor. */
export async function standingsOwners(seasonId: string): Promise<{ provider: string; rows: number }[]> {
  const db = await getDb().catch(() => null);
  if (!db) return [];
  try {
    const rows = await db.select<{ provider: string; count: string }>(
      `SELECT provider, count(*)::text AS count FROM standings WHERE season_id = $1 GROUP BY provider ORDER BY count DESC`,
      [seasonId],
    );
    return rows.map((r) => ({ provider: r.provider, rows: Number(r.count) }));
  } catch {
    return [];
  }
}
