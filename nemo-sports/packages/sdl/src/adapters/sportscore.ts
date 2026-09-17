/**
 * SDL · SportScore adapter (free / open tier — no API key)
 * ─────────────────────────────────────────────────────────
 * Official public widget API (https://sportscore.com/developers/):
 *   · 8 REST endpoints, JSON, `Access-Control-Allow-Origin: *`
 *   · no key required for the attribution tier
 *   · responses cached 60 s at their edge
 *   · ~10,000 requests / 24 h / IP, burst friendly
 *
 * Attribution is part of the license: every page that renders SportScore
 * data MUST show a visible dofollow "Powered by SportScore" link to
 * https://sportscore.com/ — see components/ui/PoweredBy.tsx (wired into the
 * site footer and every data panel). This adapter adds `src=nemo-sports` to
 * every call as the documented optional self-identification.
 *
 * Failure policy (§Instruction 12): SportScore failures surface as typed
 * SDL failures. The frontend renders "البيانات غير متوفرة" — never a
 * fabricated match, score or minute.
 *
 * Known response shapes (captured live, 2026-09):
 *   GET /matches/?sport=football&limit=50
 *     { sport, count, matches: [{ home, away, home_logo, away_logo,
 *        home_score: "2"|null, away_score, status: "finished"|"upcoming"|"live"…,
 *        status_text: "Finished"|"23'"|…, time: ISO, competition,
 *        competition_logo, url: "/football/match/<slug>/" }], updated }
 *   GET /match/?sport=…&slug=…
 *     { match: { …same…, live_minute, incidents[], stats[], lineups{
 *        home_formation, away_formation, home_coach, away_coach, confirmed,
 *        home_xi[], home_subs[], away_xi[], away_subs[] },
 *        home_ht_score, away_ht_score, tracker } }
 *   GET /standings/?sport=…&slug=…
 *     { tables: [{ group, rows: [{ pos, team, team_slug, p, w, d, l, gf, ga,
 *        gd, pts, promo_name }]}] }  — or { error: "No current season" }
 *   GET /topscorers/?sport=…&slug=…&limit=…
 *     { scorers: [{ rank, player, player_slug, team, team_slug, goals,
 *        assists, matches, rating, minutes }] }
 *   GET /player/?sport=…&slug=…
 *     { player: { name, logo, slug }, stats: { team, competition, matches,
 *        goals, assists, minutes, rating, yellow_cards, red_cards, shots, … } }
 */

import { parseMinute, toInt, toIso, str, withDefaults, type HttpOptions } from "./base";
import type {
  DataType,
  DateRange,
  NormalizedEvent,
  NormalizedFixture,
  NormalizedLineup,
  NormalizedLineupPlayer,
  NormalizedPlayerStats,
  NormalizedStandingRow,
  NormalizedStat,
  NormalizedTopScorer,
  ProviderHealth,
  ProviderResult,
} from "../provider";

export type SportScoreConfig = HttpOptions & {
  /** override for tests / proxies — default https://sportscore.com/api/widget */
  baseUrl?: string;
  /** documented optional self-identification param */
  src?: string;
  /** sport used for endpoints whose input carries no sport (default football) */
  defaultSport?: string;
};

/* ── raw payload types (only the fields we actually read) ──── */

type SSMatch = {
  home: string;
  away: string;
  home_logo?: string | null;
  away_logo?: string | null;
  home_score?: string | number | null;
  away_score?: string | number | null;
  status: string;
  status_text?: string | null;
  time: string;
  competition?: string | null;
  competition_logo?: string | null;
  url?: string | null;
  live_minute?: number | null;
  home_ht_score?: number | null;
  away_ht_score?: number | null;
};

type SSIncident = {
  time?: number | null;
  type?: string | null;
  side?: string | null;
  player?: string | null;
  player_in?: string | null;
  player_out?: string | null;
  assist?: string | null;
  is_goal?: boolean;
  is_card?: boolean;
  is_sub?: boolean;
};

type SSLineupPlayer = { name: string; number?: number | null; position?: string | null; captain?: boolean };
type SSLineups = {
  home_formation?: string | null;
  away_formation?: string | null;
  home_coach?: string | null;
  away_coach?: string | null;
  confirmed?: boolean;
  home_xi?: SSLineupPlayer[] | null;
  home_subs?: SSLineupPlayer[] | null;
  away_xi?: SSLineupPlayer[] | null;
  away_subs?: SSLineupPlayer[] | null;
};

type SSFeed = { sport?: string; count?: number; matches?: SSMatch[] | null; updated?: string };
type SSDetail = { match?: SSMatch & { incidents?: SSIncident[] | null; stats?: unknown; lineups?: SSLineups | null } | null; updated?: string };
type SSStandings = {
  competition?: string;
  tables?: { group?: string | null; rows?: Record<string, unknown>[] }[] | null;
  error?: string;
};
type SSTopScorers = { scorers?: Record<string, unknown>[] | null; error?: string };
type SSPlayer = { player?: { name?: string; logo?: string | null; slug?: string } | null; stats?: Record<string, unknown> | null; error?: string };

/** Map a SportScore status/status_text pair onto the NEMO vocabulary. */
export function mapStatus(status: string | null | undefined, statusText: string | null | undefined): { status: string; minute: number | null } {
  const s = String(status ?? "").toLowerCase();
  const text = String(statusText ?? "").trim();
  const fromText = parseMinute(text);

  if (s.includes("finish") || s.includes("ended") || s === "ft" || text === "Finished") return { status: "finished", minute: null };
  if (s.includes("half") && !s.includes("final")) return { status: "halftime", minute: fromText.minute };
  if (s.includes("extra") || text.includes("extra")) return { status: "extra_time", minute: fromText.minute };
  if (s.includes("penalt")) return { status: "penalty_shootout", minute: fromText.minute };
  if (s.includes("postpone")) return { status: "postponed", minute: null };
  if (s.includes("cancel")) return { status: "cancelled", minute: null };
  if (s.includes("suspend")) return { status: "suspended", minute: null };
  if (s.includes("abandon")) return { status: "abandoned", minute: null };
  if (s.includes("walkover")) return { status: "walkover", minute: null };

  const looksLive = s.includes("live") || s.includes("play") || s.includes("1st") || s.includes("2nd") || /^\d+('\+)?$/.test(text) || /^\d+\+\d+$/.test(text);
  if (looksLive) return { status: "live", minute: fromText.minute };

  // "upcoming" / "scheduled" / "not started" / "delayed" / anything unknown
  // without a live minute → scheduled (never invent a state).
  return { status: "scheduled", minute: null };
}

/** "/football/match/cruz-azul-vs-inter-miami-cf/" → "cruz-azul-vs-inter-miami-cf" */
export function matchSlugFromUrl(url: string | null | undefined): string | null {
  const m = String(url ?? "").match(/\/match\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

function score(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

const mapLineupPlayers = (list: SSLineupPlayer[] | null | undefined): NormalizedLineupPlayer[] =>
  (list ?? []).filter((p) => p && p.name).map((p) => ({ providerId: p.name, name: p.name, position: str(p.position), jerseyNumber: toInt(p.number) }));

export class SportScoreAdapter extends withDefaults("sportscore") {
  readonly capabilities: DataType[] = [
    "live_matches",
    "fixtures",
    "match_detail",
    "match_events",
    "match_stats",
    "match_lineups",
    "standings",
    "top_scorers",
    "player_stats",
    "health",
  ];
  readonly supportedSports = ["football", "basketball", "cricket", "tennis"];

  private baseUrlOverride: string | null;
  private src: string;
  private defaultSport: string;

  constructor(cfg: SportScoreConfig = {}) {
    super(cfg);
    this.baseUrlOverride = cfg.baseUrl ?? null;
    this.src = cfg.src ?? "nemo-sports";
    this.defaultSport = cfg.defaultSport ?? "football";
    // free open API: be polite — short timeout, no retries beyond one
    this.timeoutMs = cfg.timeoutMs ?? 8000;
    this.retries = cfg.retries ?? 1;
  }

  /** @internal */
  override baseUrl(): string {
    return (this.baseUrlOverride ?? process.env.SPORTSCORE_BASE_URL ?? "https://sportscore.com/api/widget").replace(/\/+$/, "");
  }

  /** @internal documented optional self-identification */
  override auth(): { headers: Record<string, string>; query?: Record<string, string> } {
    return { headers: {}, query: { src: this.src } };
  }

  /* ── shared helpers ─────────────────────────────────────── */

  private fixtureFrom(m: SSMatch, sport: string): NormalizedFixture | null {
    if (!m || !m.home || !m.away || !m.time) return null;
    const slug = matchSlugFromUrl(m.url) ?? `${m.home}-vs-${m.away}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const st = mapStatus(m.status, m.status_text);
    const htHome = toInt(m.home_ht_score);
    const htAway = toInt(m.away_ht_score);
    return {
      providerId: slug,
      sport,
      competitionProviderId: str(m.competition) ?? "unknown",
      seasonProviderId: null,
      round: null,
      // SportScore's stable display identifier for a team in this payload is
      // its name; the canonical mapper resolves/dedupes it per provider.
      homeProviderId: m.home,
      awayProviderId: m.away,
      scheduledAt: toIso(m.time) ?? new Date().toISOString(),
      status: st.status,
      homeScore: score(m.home_score),
      awayScore: score(m.away_score),
      periods: htHome !== null && htAway !== null ? [{ label: "HT", home: htHome, away: htAway }] : [],
      venueProviderId: null,
      venueName: null,
      attendance: null,
      minute: toInt(m.live_minute) ?? st.minute,
      homeName: m.home,
      awayName: m.away,
      homeLogoUrl: str(m.home_logo),
      awayLogoUrl: str(m.away_logo),
      competitionName: str(m.competition),
      sourceUrl: m.url ? `https://sportscore.com${m.url}` : null,
    };
  }

  /** The feed is the unit of pagination — 50 = max limit (1..50 documented). */
  private async feed(sport: string, limit = 50): Promise<ProviderResult<SSMatch[]>> {
    const res = await this.getJson<SSFeed>("matches/", { sport, limit: Math.min(Math.max(limit, 1), 50) });
    if (!res.ok) return res;
    if (!Array.isArray(res.data.matches)) {
      return { ok: false, provider: this.name, requestKey: res.requestKey, fromCache: false, error: { code: "bad_response", message: "sportScore: feed without matches array" } };
    }
    return { ok: true, data: res.data.matches, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  private async detail(sport: string, slug: string): Promise<ProviderResult<SSMatch & { incidents?: SSIncident[] | null; stats?: unknown; lineups?: SSLineups | null }>> {
    const res = await this.getJson<SSDetail>("match/", { sport, slug });
    if (!res.ok) return res;
    if (!res.data.match) {
      return { ok: false, provider: this.name, requestKey: res.requestKey, fromCache: false, error: { code: "not_found", message: `sportscore: match "${slug}" not found` } };
    }
    return { ok: true, data: res.data.match, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  private async detailFixture(input: { providerMatchId: string; sport?: string }): Promise<ProviderResult<NormalizedFixture>> {
    const sport = input.sport ?? this.defaultSport;
    const res = await this.detail(sport, input.providerMatchId);
    if (!res.ok) return res;
    const fixture = this.fixtureFrom(res.data, sport);
    if (!fixture) {
      return { ok: false, provider: this.name, requestKey: res.requestKey, fromCache: false, error: { code: "bad_response", message: "sportscore: detail payload incomplete" } };
    }
    return { ok: true, data: fixture, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  /* ── fixtures & live ────────────────────────────────────── */

  override async getLiveMatches(input: { sport: string }): Promise<ProviderResult<NormalizedFixture[]>> {
    const res = await this.feed(input.sport);
    if (!res.ok) return res;
    const live = res.data
      .map((m) => this.fixtureFrom(m, input.sport))
      .filter((f): f is NormalizedFixture => f !== null)
      .filter((f) => f.status === "live" || f.status === "halftime" || f.status === "extra_time" || f.status === "penalty_shootout");
    return { ok: true, data: live, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  override async getFixtures(input: { sport: string; competitionProviderId?: string; range?: DateRange; date?: string }): Promise<ProviderResult<NormalizedFixture[]>> {
    const res = await this.feed(input.sport);
    if (!res.ok) return res;
    let list = res.data
      .map((m) => this.fixtureFrom(m, input.sport))
      .filter((f): f is NormalizedFixture => f !== null);

    if (input.date) {
      // provider feed carries "live + recent" only — filter to that UTC day
      // and return [] when nothing matches (never pad with other days).
      list = list.filter((f) => f.scheduledAt.slice(0, 10) === input.date);
    } else if (input.range) {
      const from = +new Date(input.range.from);
      const to = +new Date(input.range.to);
      list = list.filter((f) => {
        const t = +new Date(f.scheduledAt);
        return Number.isFinite(from) && Number.isFinite(to) ? t >= from && t <= to : true;
      });
    }
    if (input.competitionProviderId) {
      list = list.filter((f) => f.competitionProviderId === input.competitionProviderId);
    }
    return { ok: true, data: list, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  /* ── match detail / events / stats / lineups ────────────── */

  override getMatchDetail(input: { providerMatchId: string; sport?: string }): Promise<ProviderResult<NormalizedFixture>> {
    return this.detailFixture(input);
  }

  override async getMatchEvents(input: { providerMatchId: string; sport?: string }): Promise<ProviderResult<NormalizedEvent[]>> {
    const sport = input.sport ?? this.defaultSport;
    const res = await this.detail(sport, input.providerMatchId);
    if (!res.ok) return res;
    const incidents = res.data.incidents ?? [];
    const home = res.data.home ?? "home";
    const away = res.data.away ?? "away";
    const events: NormalizedEvent[] = incidents
      .map((inc, i) => {
        const minute = toInt(inc.time);
        if (minute === null && inc.time !== 0) return null;
        const type = this.mapEventType(str(inc.type), inc);
        const sideHome = inc.side === "home";
        const description = inc.is_sub
          ? `in: ${str(inc.player_in) ?? "—"} · out: ${str(inc.player_out) ?? "—"}`
          : str(inc.assist)
            ? `assist: ${str(inc.assist)}`
            : null;
        const ev: NormalizedEvent = {
          providerEventId: `${input.providerMatchId}:${i}:${minute}:${type}`,
          providerMatchId: input.providerMatchId,
          type,
          minute,
          additionalMinute: null,
          teamProviderId: sideHome ? home : away,
          playerProviderId: str(inc.player) ?? str(inc.player_in) ?? null,
          secondaryPlayerProviderId: str(inc.assist) ?? (inc.is_sub ? str(inc.player_out) : null),
          description,
        };
        return ev;
      })
      .filter((e): e is NormalizedEvent => e !== null);
    return { ok: true, data: events, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  /** SportScore type strings → canonical event vocabulary (unknown → kebab). */
  private mapEventType(raw: string | null, inc: SSIncident): string {
    const t = (raw ?? "").toLowerCase();
    if (inc.is_sub || t.includes("sub")) return "sub-in";
    if (t.includes("own")) return "own-goal";
    if (t.includes("missed") && t.includes("penalt")) return "missed-penalty";
    if (t.includes("penalt")) return "penalty";
    if (t.includes("second") && t.includes("yellow")) return "second-yellow";
    if (t.includes("yellow")) return "yellow";
    if (t.includes("red")) return "red";
    if (t.includes("var")) return "var";
    if (t.includes("goal")) return "goal";
    return t.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
  }

  override async getMatchStats(input: { providerMatchId: string; sport?: string }): Promise<ProviderResult<NormalizedStat[]>> {
    const sport = input.sport ?? this.defaultSport;
    const res = await this.detail(sport, input.providerMatchId);
    if (!res.ok) return res;
    const raw = Array.isArray(res.data.stats) ? (res.data.stats as Record<string, unknown>[]) : [];
    // The stats array shape is not documented and was empty in every captured
    // payload — map defensively over the plausible {label/type, home, away}
    // form and return [] when nothing recognisable is present (no invented
    // numbers, ever).
    const out: NormalizedStat[] = [];
    for (const row of raw) {
      const label = str(row.type) ?? str(row.name) ?? str(row.label) ?? str(row.stat);
      if (!label) continue;
      const homeVal = row.home ?? row.home_value ?? row.value_home;
      const awayVal = row.away ?? row.away_value ?? row.value_away;
      if (homeVal === undefined || awayVal === undefined) continue;
      const period = str(row.period) ?? "ALL";
      out.push({ teamProviderId: str(res.data.home) ?? "home", type: label, value: homeVal as number | string, period });
      out.push({ teamProviderId: str(res.data.away) ?? "away", type: label, value: awayVal as number | string, period });
    }
    return { ok: true, data: out, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  override async getMatchLineups(input: { providerMatchId: string; sport?: string }): Promise<ProviderResult<NormalizedLineup[]>> {
    const sport = input.sport ?? this.defaultSport;
    const res = await this.detail(sport, input.providerMatchId);
    if (!res.ok) return res;
    const lu = res.data.lineups;
    if (!lu) return { ok: true, data: [], provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
    const out: NormalizedLineup[] = [];
    const home = str(res.data.home);
    const away = str(res.data.away);
    if (home && (lu.home_xi?.length || lu.home_subs?.length)) {
      out.push({ teamProviderId: home, formation: str(lu.home_formation), coach: str(lu.home_coach), starters: mapLineupPlayers(lu.home_xi), bench: mapLineupPlayers(lu.home_subs) });
    }
    if (away && (lu.away_xi?.length || lu.away_subs?.length)) {
      out.push({ teamProviderId: away, formation: str(lu.away_formation), coach: str(lu.away_coach), starters: mapLineupPlayers(lu.away_xi), bench: mapLineupPlayers(lu.away_subs) });
    }
    return { ok: true, data: out, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  /* ── standings / scorers / player ───────────────────────── */

  override async getStandings(input: { providerCompetitionId: string; season?: string; sport?: string }): Promise<ProviderResult<NormalizedStandingRow[]>> {
    const sport = input.sport ?? this.defaultSport;
    const res = await this.getJson<SSStandings>("standings/", { sport, slug: input.providerCompetitionId });
    if (!res.ok) return res;
    if (res.data.error) {
      // e.g. { "error": "No current season" } — surface it verbatim, honestly.
      return { ok: false, provider: this.name, requestKey: res.requestKey, fromCache: false, error: { code: "not_found", message: `sportscore: standings unavailable — ${res.data.error}` } };
    }
    const rows: NormalizedStandingRow[] = [];
    for (const table of res.data.tables ?? []) {
      for (const r of table.rows ?? []) {
        const teamName = str(r.team);
        const pos = toInt(r.pos);
        if (!teamName || pos === null) continue;
        rows.push({
          teamProviderId: teamName,
          group: str(table.group),
          position: pos,
          played: toInt(r.p) ?? 0,
          won: toInt(r.w) ?? 0,
          drawn: toInt(r.d) ?? 0,
          lost: toInt(r.l) ?? 0,
          goalsFor: toInt(r.gf) ?? 0,
          goalsAgainst: toInt(r.ga) ?? 0,
          points: toInt(r.pts) ?? 0,
          form: [],
          status: str(r.promo_name),
        });
      }
    }
    return { ok: true, data: rows, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  override async getTopScorers(input: { providerCompetitionId: string; season?: string; sport?: string }): Promise<ProviderResult<NormalizedTopScorer[]>> {
    const sport = input.sport ?? this.defaultSport;
    const res = await this.getJson<SSTopScorers>("topscorers/", { sport, slug: input.providerCompetitionId, limit: 20 });
    if (!res.ok) return res;
    if (res.data.error) {
      return { ok: false, provider: this.name, requestKey: res.requestKey, fromCache: false, error: { code: "not_found", message: `sportscore: top scorers unavailable — ${res.data.error}` } };
    }
    const scorers: NormalizedTopScorer[] = [];
    for (const s of res.data.scorers ?? []) {
      const playerName = str(s.player);
      const goals = toInt(s.goals);
      if (!playerName || goals === null) continue;
      scorers.push({
        playerProviderId: str(s.player_slug) ?? playerName,
        teamProviderId: str(s.team_slug) ?? str(s.team),
        goals,
        appearances: toInt(s.matches),
        penalties: null,
      });
    }
    return { ok: true, data: scorers, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  override async getPlayerStats(input: { providerPlayerId: string; season?: string; sport?: string }): Promise<ProviderResult<NormalizedPlayerStats>> {
    const sport = input.sport ?? this.defaultSport;
    const res = await this.getJson<SSPlayer>("player/", { sport, slug: input.providerPlayerId });
    if (!res.ok) return res;
    if (res.data.error || !res.data.stats) {
      return { ok: false, provider: this.name, requestKey: res.requestKey, fromCache: false, error: { code: "not_found", message: `sportscore: player "${input.providerPlayerId}" not found` } };
    }
    const s = res.data.stats;
    // rating arrives on an undocumented scale (e.g. 3124 across a season) —
    // passed through `extra` verbatim, never rescaled into an invented value.
    const rating = toInt(s.rating);
    return {
      ok: true,
      data: {
        providerId: str(res.data.player?.slug) ?? input.providerPlayerId,
        seasonName: null,
        appearances: toInt(s.matches),
        goals: toInt(s.goals),
        assists: toInt(s.assists),
        minutes: toInt(s.minutes),
        yellowCards: toInt(s.yellow_cards),
        redCards: toInt(s.red_cards),
        rating: null,
        extra: {
          ...(str(s.team) ? { team: str(s.team) as string | number } : {}),
          ...(str(s.competition) ? { competition: str(s.competition) as string | number } : {}),
          ...(rating !== null ? { ratingRaw: rating } : {}),
          ...(toInt(s.shots) !== null ? { shots: toInt(s.shots) as number } : {}),
          ...(toInt(s.shots_on_target) !== null ? { shotsOnTarget: toInt(s.shots_on_target) as number } : {}),
          ...(toInt(s.dribbles) !== null ? { dribbles: toInt(s.dribbles) as number } : {}),
          ...(toInt(s.key_passes) !== null ? { keyPasses: toInt(s.key_passes) as number } : {}),
        },
      },
      provider: this.name,
      fetchedAt: res.fetchedAt,
      requestKey: res.requestKey,
      fromCache: false,
    };
  }

  /* ── health ─────────────────────────────────────────────── */

  override async healthCheck(): Promise<ProviderResult<ProviderHealth>> {
    const t0 = Date.now();
    const res = await this.getJson<SSFeed>("matches/", { sport: this.defaultSport, limit: 1 });
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      return {
        ok: false,
        provider: this.name,
        requestKey: res.requestKey,
        fromCache: false,
        error: res.error,
      };
    }
    return {
      ok: true,
      data: { provider: this.name, reachable: true, checkedAt: new Date().toISOString(), latencyMs, quotaRemaining: null, detail: "feed reachable" },
      provider: this.name,
      fetchedAt: new Date().toISOString(),
      requestKey: res.requestKey,
      fromCache: false,
    };
  }
}
