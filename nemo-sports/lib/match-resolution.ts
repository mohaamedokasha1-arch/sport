/**
 * NEMO Sports · WHICH meeting of two clubs does this link mean?
 * ─────────────────────────────────────────────────────────────
 * A visitor (or a partner gate) addresses a tie as «الزمالك ضد الأهلي» or
 * `al-qanah-vs-al-masry`. Provider data can hold SEVERAL meetings of that
 * pairing at once — a finished league game from weeks ago AND the cup tie
 * kicking off tonight — under different provider ids (a SportScore slug, a
 * TheSportsDB `idEvent`, an API-Football fixture id). The old rule resolved a
 * slug to ANY unique fixture naming the two clubs, so a shared link could
 * send the visitor to the OLD match while the current one also existed.
 *
 * The rules here are pure and deterministic:
 *
 *   1.  identity  — both sides must really be the requested clubs (no
 *                   placeholders), order-insensitively, Latin AND Arabic;
 *   2.  currency  — among the candidate meetings the CURRENT one wins:
 *                   live first, then the nearest upcoming kickoff, then the
 *                   most recently finished meeting inside a short window.
 *                   A meeting older than the window never wins over a newer
 *                   one;
 *   3.  certainty — a dated slug (`…-2026-10-13`) resolves ONLY to the
 *                   meeting on that exact day, and two equally-current live
 *                   meetings of the same pairing are an honest "unknown"
 *                   rather than a coin flip.
 *
 * Cross-provider fixtures of THE SAME match (kickoff drift included) are
 * recognised by `verifySameMatch`/`sameMeeting`, so the same game known to
 * TheSportsDB as `idEvent` 2052713 and to API-Football as fixture 1383825
 * is one meeting, not two candidates.
 *
 * No I/O, no env: the module is unit-testable in isolation, and the gateway
 * (lib/sdl-gateway.ts) is the only caller that supplies real fixtures.
 */

import { sideKeys } from "./match-links";
import { arabicAliasesFor, englishKeysForArabic } from "./name-aliases";
import { normalizeSearchText } from "./search-text";
import { isLiveStatus } from "./match-state";

export interface MeetingFixtureLike {
  providerId: string;
  homeName?: string | null;
  awayName?: string | null;
  homeProviderId?: string | null;
  awayProviderId?: string | null;
  scheduledAt: string;
  status: string;
  sport?: string;
  competitionProviderId?: string | null;
}

/* ── 1 · sides ─────────────────────────────────────────────────────────── */

/** Separator between the two sides of an inbound slug, Latin and Arabic. */
const SIDE_SPLIT = /-(?:vs|v|ضد)-|(?:^|\s)ضد\s|__|_/u;

export interface SlugRequest {
  first: string;
  second: string;
  /** exact day requested by a dated slug (UTC, `YYYY-MM-DD`) */
  date: string | null;
}

/**
 * Parse an inbound slug into the two requested sides (+ optional date).
 *   `al-qanah-vs-al-masry`                 → qanah / al-masry
 *   `zamalek-vs-al-ahly-2026-10-13`        → zamalek / al-ahly, that day only
 *   `الزمالك-ضد-الاهلي`                    → الزمالك / الاهلي
 * A trailing date is detached BEFORE the sides are split, so a club named
 * with a year in it can never be mistaken for the day.
 */
export function parseSlugRequest(slug: string): SlugRequest | null {
  let raw = String(slug ?? "").trim().toLowerCase();
  if (!raw) return null;
  let date: string | null = null;
  const dated = /-(20\d{2}-\d{2}-\d{2})$/.exec(raw);
  if (dated) {
    date = dated[1]!;
    raw = raw.slice(0, dated.index);
  }
  const parts = raw.split(SIDE_SPLIT).map((p) => p.trim().replace(/^-+|-+$/g, "")).filter(Boolean);
  if (parts.length < 2) return null;
  return { first: parts[0]!, second: parts.slice(1).join("-"), date };
}

/**
 * Every comparable spelling of one side: the Latin club-suffix keys
 * (`al-ahly-fc` / `al-ahly`) and the search-normalized form — in its spaced
 * AND dashed spellings — which folds hamza, ة and ى for Arabic
 * (`الأهلي` / `الاهلي`).
 */
export function sideAliases(name: string | null | undefined): string[] {
  const keys = sideKeys(name);
  const normalized = normalizeSearchText(String(name ?? ""));
  return [...new Set([...keys, normalized, normalized.replace(/\s+/g, "-")].filter(Boolean))];
}

function aliasSet(fixture: MeetingFixtureLike, side: "home" | "away"): Set<string> {
  const name = side === "home" ? fixture.homeName : fixture.awayName;
  const providerId = side === "home" ? fixture.homeProviderId : fixture.awayProviderId;
  const aliases = new Set([...sideAliases(name), ...sideAliases(providerId)]);
  // A provider id can itself be a `home-vs-away` permalink (SportScore slugs,
  // editorial slugs). Its two sides add the pairing stated by the id itself —
  // valuable when the side NAMES are Arabic-only (editorial fixtures) while
  // the id is latin. Numeric ids (TheSportsDB, API-Football) parse to nothing.
  const slugSides = parseSlugRequest(fixture.providerId);
  if (slugSides) {
    for (const alias of sideAliases(side === "home" ? slugSides.first : slugSides.second)) aliases.add(alias);
  }
  return aliases;
}

/**
 * One requested side against one fixture side: exact alias membership, PLUS
 * the curated cross-lingual pairs of lib/name-aliases.ts («الزمالك» ↔
 * "zamalek"). Clubs that nobody curated simply do not bridge — that is a
 * deliberate honest-404, never a transliteration guessed on the fly.
 */
function sideMatches(requested: string, fixture: MeetingFixtureLike, side: "home" | "away"): boolean {
  const wanted = new Set(sideAliases(requested));
  for (const alias of arabicAliasesFor(requested)) {
    const n = normalizeSearchText(alias);
    wanted.add(n);
    wanted.add(n.replace(/\s+/g, "-"));
  }
  for (const key of englishKeysForArabic(requested)) {
    wanted.add(key);
    wanted.add(key.replace(/\s+/g, "-"));
  }
  if (wanted.size === 0) return false;
  const actual = aliasSet(fixture, side);
  for (const alias of wanted) if (actual.has(alias)) return true;
  return false;
}

/** Both clubs of the request are the two sides of the fixture (any order). */
export function fixtureMatchesRequest(fixture: MeetingFixtureLike, request: SlugRequest): boolean {
  const forward = sideMatches(request.first, fixture, "home") && sideMatches(request.second, fixture, "away");
  const reverse = sideMatches(request.second, fixture, "home") && sideMatches(request.first, fixture, "away");
  return forward || reverse;
}

/** The pairing of a fixture, order-insensitive, for meeting comparisons. */
function pairingOf(fixture: MeetingFixtureLike): string {
  const home = [...aliasSet(fixture, "home")].sort().join("|");
  const away = [...aliasSet(fixture, "away")].sort().join("|");
  return [home, away].sort().join("::");
}

/* ── 2 · same match across providers ───────────────────────────────────── */

export const DEFAULT_KICKOFF_TOLERANCE_MIN = 120;

export interface MatchConsistency {
  consistent: boolean;
  reasons: string[];
}

/**
 * Do two normalized fixtures describe THE SAME real-world match?
 * Provider ids mean nothing across providers (TheSportsDB `idEvent`,
 * API-Football fixture id, SportScore slug never collide), so identity is
 * established from the two clubs and the kickoff instant:
 *
 *   · both sides must pair (any order) — a shared opponent is not enough;
 *   · scheduledAt must parse on both, and differ by no more than the
 *     tolerance (providers disagree on kickoff by minutes, not by hours);
 *   · when both name a competition, identical COMPETITION NAMES are a strong
 *     positive signal but different spellings/ids across providers are not
 *     counted against consistency.
 */
export function verifySameMatch(
  a: MeetingFixtureLike,
  b: MeetingFixtureLike,
  opts: { toleranceMinutes?: number } = {},
): MatchConsistency {
  const tolerance = (opts.toleranceMinutes ?? DEFAULT_KICKOFF_TOLERANCE_MIN) * 60_000;
  const reasons: string[] = [];
  const homeA = a.homeName ?? a.homeProviderId ?? "";
  const awayA = a.awayName ?? a.awayProviderId ?? "";
  const homeB = b.homeName ?? b.homeProviderId ?? "";
  const awayB = b.awayName ?? b.awayProviderId ?? "";
  const direct = sideEquals(homeA, homeB) && sideEquals(awayA, awayB);
  const swapped = sideEquals(homeA, awayB) && sideEquals(awayA, homeB);
  if (!direct && !swapped) {
    reasons.push(`teams-mismatch: «${homeA} vs ${awayA}» ≠ «${homeB} vs ${awayB}»`);
    return { consistent: false, reasons };
  }
  const kickA = Date.parse(a.scheduledAt);
  const kickB = Date.parse(b.scheduledAt);
  if (!Number.isFinite(kickA) || !Number.isFinite(kickB)) {
    reasons.push("kickoff-missing: at least one fixture has no parseable scheduledAt");
    return { consistent: false, reasons };
  }
  const gapMinutes = Math.round(Math.abs(kickA - kickB) / 60_000);
  if (Math.abs(kickA - kickB) > tolerance) {
    reasons.push(`kickoff-gap: ${gapMinutes}m > ${Math.round(tolerance / 60000)}m tolerance`);
    return { consistent: false, reasons };
  }
  return { consistent: true, reasons: gapMinutes > 0 ? [`kickoff-drift: ${gapMinutes}m (within tolerance)`] : [] };
}

function sideEquals(a: string, b: string): boolean {
  const ka = sideAliases(a);
  const kb = new Set(sideAliases(b));
  return ka.some((k) => kb.has(k));
}

/** Two fixtures are one meeting when the consistency check passes. */
export function sameMeeting(a: MeetingFixtureLike, b: MeetingFixtureLike, opts: { toleranceMinutes?: number } = {}): boolean {
  return verifySameMatch(a, b, opts).consistent;
}

/* ── 3 · the current meeting of a pairing ──────────────────────────────── */

type MeetingClass = "live" | "upcoming" | "finished" | "void";

function classOf(fixture: MeetingFixtureLike, now: number): MeetingClass {
  if (isLiveStatus(fixture.status)) return "live";
  if (fixture.status === "finished") return "finished";
  // A kickoff that "started" a few minutes ago while the provider still says
  // scheduled is an upcoming match whose feed is late, not a finished one.
  if (fixture.status === "scheduled") {
    const kickoff = Date.parse(fixture.scheduledAt);
    if (Number.isFinite(kickoff) && kickoff > now - 15 * 60_000) return "upcoming";
    return "void"; // stale "scheduled" — lib/match-state calls this unconfirmed
  }
  return "void";
}

export interface CurrentMeetingOptions {
  now?: number;
  /** a finished meeting counts as "current" for this many days */
  finishedWindowDays?: number;
  kickoffToleranceMinutes?: number;
}

/**
 * Choose THE meeting of a pairing a link should land on, or null when the
 * pool cannot answer honestly:
 *
 *   · any live meeting wins; two DISTINCT live meetings of the same pairing
 *     cannot be chosen between → null (never a coin flip);
 *   · otherwise the EARLIEST upcoming meeting (time orders the future, so
 *     picking the nearest kickoff is a choice, not a guess);
 *   · otherwise the LATEST finished meeting inside finishedWindowDays;
 *   · older or empty pools answer null.
 *
 * `distinct` in the live branch honours `sameMeeting`: the same derby served
 * by two providers at once is ONE meeting, not an ambiguity.
 */
export function pickCurrentMeeting<T extends MeetingFixtureLike>(
  candidates: readonly T[],
  opts: CurrentMeetingOptions = {},
): { fixture: T; via: "live" | "upcoming" | "finished" } | null {
  const now = opts.now ?? Date.now();
  const windowDays = opts.finishedWindowDays ?? 5;
  const tolerance = { toleranceMinutes: opts.kickoffToleranceMinutes ?? DEFAULT_KICKOFF_TOLERANCE_MIN };

  const usable = candidates.filter((f) => {
    if (!f?.providerId || !Number.isFinite(Date.parse(f.scheduledAt))) return false;
    // pairings must be real: a placeholder side can never be verified
    return aliasSet(f, "home").size > 0 && aliasSet(f, "away").size > 0;
  });

  const live = usable.filter((f) => classOf(f, now) === "live");
  if (live.length > 0) {
    const representative = [...live].sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt) || a.providerId.localeCompare(b.providerId))[0]!;
    for (const other of live) {
      if (!sameMeeting(representative, other, tolerance)) return null; // two different live meetings — ambiguous
    }
    return { fixture: representative, via: "live" };
  }

  const upcoming = usable
    .filter((f) => classOf(f, now) === "upcoming")
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt) || a.providerId.localeCompare(b.providerId));
  if (upcoming.length > 0) return { fixture: upcoming[0]!, via: "upcoming" };

  const cutoff = now - windowDays * 86_400_000;
  const finished = usable
    .filter((f) => classOf(f, now) === "finished" && Date.parse(f.scheduledAt) >= cutoff && Date.parse(f.scheduledAt) <= now + 15 * 60_000)
    .sort((a, b) => Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt) || a.providerId.localeCompare(b.providerId));
  if (finished.length > 0) return { fixture: finished[0]!, via: "finished" };

  return null;
}

/* ── 4 · slug → meeting ────────────────────────────────────────────────── */

export interface SlugResolution<T> {
  fixture: T;
  via: "live" | "upcoming" | "finished" | "dated";
  /** how many fixtures of that pairing were considered — audit trail */
  candidateCount: number;
}

/**
 * Resolve an inbound slug to the CURRENT meeting of the pairing it names.
 *   · a dated slug only ever resolves to the meeting on that UTC day;
 *   · an undated slug resolves through pickCurrentMeeting();
 *   · anything ambiguous, unverifiable or absent answers null — the caller
 *     keeps its old behaviour (404) rather than guessing.
 */
export function resolveCurrentMeetingForSlug<T extends MeetingFixtureLike>(
  slug: string,
  fixtures: readonly T[],
  opts: CurrentMeetingOptions = {},
): SlugResolution<T> | null {
  const request = parseSlugRequest(slug);
  if (!request) return null;
  const candidates = fixtures.filter((f) => fixtureMatchesRequest(f, request));
  if (candidates.length === 0) return null;

  if (request.date) {
    const onDay = candidates.filter((f) => {
      const t = Date.parse(f.scheduledAt);
      return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === request.date;
    });
    // Two providers serving the same dated meeting are ONE meeting.
    const distinct: T[] = [];
    for (const f of onDay) {
      if (!distinct.some((d) => sameMeeting(d, f, { toleranceMinutes: opts.kickoffToleranceMinutes }))) distinct.push(f);
    }
    if (distinct.length !== 1) return null;
    return { fixture: distinct[0]!, via: "dated", candidateCount: candidates.length };
  }

  const current = pickCurrentMeeting(candidates, opts);
  if (!current) return null;
  return { ...current, candidateCount: candidates.length };
}
