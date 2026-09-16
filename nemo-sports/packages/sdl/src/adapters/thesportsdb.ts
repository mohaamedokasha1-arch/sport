/**
 * SDL · TheSportsDB adapter — v1/v2, doc-verified.
 *
 * v1 base : https://www.thesportsdb.com/api/v1/json/{apikey}/…   (key in path)
 * v2 base : https://www.thesportsdb.com/api/v2/json/…            (key in X-API-KEY header)
 *
 * IMPORTANT constraints that shape how this provider is used:
 *  · the public test keys (`123`, `3`) are shared, rate limited (~30 req/min)
 *    and have some methods disabled — NEVER used for production live data;
 *  · this provider's real value is artwork and descriptive metadata
 *    (team logos, player photos, venue images, banners);
 *  · images are supplied by a community database, so every image URL is stored
 *    with `photoAttribution` and must be reviewed for licence before display
 *    (legal-only rule, §8.1). It is therefore placed on the `images` data type
 *    in the default priority chain and never on live scores.
 */

import { withDefaults, str, toInt, toIso, type HttpOptions } from "./base";
import type {
  DataType,
  NormalizedCompetition,
  NormalizedPlayer,
  NormalizedSeason,
  NormalizedSquadMember,
  NormalizedTeam,
  NormalizedVenue,
  ProviderResult,
} from "../provider";
import type { ProviderHealth } from "../provider";

export type TheSportsDbConfig = HttpOptions & {
  apiKey?: string;
  /** v1 puts the key in the path; v2 sends it as X-API-KEY */
  version?: 1 | 2;
};

type TsdTeam = {
  idTeam: string;
  idLeague?: string;
  idSoccerXML?: string;
  strTeam: string;
  strTeamShort?: string;
  strLeague?: string;
  strSport?: string;
  intFormedYear?: string;
  strStadium?: string;
  strCountry?: string;
  strCountryCode?: string;
  strTeamBadge?: string;
  strTeamJersey?: string;
  strTeamLogo?: string;
  strTeamFanart1?: string;
  strTeamBanner?: string;
  strStadiumThumb?: string;
  strInstagram?: string;
  strTwitter?: string;
  strWebsite?: string;
  strRSS?: string;
  strDescriptionEN?: string;
  strDescriptionAR?: string;
};

type TsdPlayer = {
  idPlayer: string;
  idTeam?: string;
  strPlayer: string;
  strTeam?: string;
  strNationality?: string;
  dateBorn?: string;
  strPosition?: string;
  strThumb?: string;
  strCutout?: string;
  strRender?: string;
  strHeight?: string;
  strWeight?: string;
  strFoot?: string;
  strBanner?: string;
  strDescriptionEN?: string;
  strDescriptionAR?: string;
  strNationalTeamNo?: string;
};

type TsdEvent = {
  idEvent: string;
  idLeague?: string;
  idSeason?: string;
  strEvent: string;
  strLeague?: string;
  strSeason?: string;
  strTimestamp?: string;
  dateEvent?: string;
  strTime?: string;
  strStatus?: string;
  intHomeScore?: string | null;
  intAwayScore?: string | null;
  idHomeTeam?: string;
  idAwayTeam?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  strVenue?: string;
  intRound?: string;
  strThumb?: string;
  strPoster?: string;
  strFanart?: string;
  strBanner?: string;
};

type TsdLeague = {
  idLeague: string;
  strLeague: string;
  strLeagueAlternate?: string;
  strSport: string;
  strCountry?: string;
  strBadge?: string;
  strLogo?: string;
  strTrophy?: string;
  strDescriptionEN?: string;
  strDescriptionAR?: string;
};

type TsdSeason = { idSeason: string; strSeason: string; strLeague?: string; idLeague?: string };

export class TheSportsDbAdapter extends withDefaults("thesportsdb") {
  readonly capabilities: DataType[] = ["team", "team_squad", "player", "competition", "competition_seasons", "venue", "images", "fixtures", "health"];
  readonly supportedSports = ["football", "basketball", "tennis", "volleyball", "handball", "hockey", "baseball", "boxing"];

  private apiKey: string | null;
  private version: 1 | 2;

  constructor(cfg: TheSportsDbConfig = {}) {
    super(cfg);
    this.apiKey = cfg.apiKey ?? process.env.THESPORTSDB_KEY ?? null;
    this.version = cfg.version ?? 2;
    // community endpoints are strict: 1 rps and short retries
    this.timeoutMs = cfg.timeoutMs ?? 6000;
    this.retries = cfg.retries ?? 0;
  }

  /** @internal */ override baseUrl(): string {
    return this.version === 2 ? "https://www.thesportsdb.com/api/v2/json" : `https://www.thesportsdb.com/api/v1/json/${this.apiKey ?? "123"}`;
  }

  /** @internal */ override auth(): { headers: Record<string, string> } {
    return this.version === 2 ? { headers: { "X-API-KEY": this.apiKey ?? "" } } : { headers: {} };
  }

  /** TheSportsDB returns nulls and empty arrays interchangeably. */
  private unwrap<T>(res: ProviderResult<Record<string, T[] | null>>): ProviderResult<T[]> {
    if (!res.ok) return res;
    const first = Object.values(res.data)[0];
    const arr = Array.isArray(first) ? first : [];
    return { ok: true, data: arr, provider: this.name, fetchedAt: res.fetchedAt, requestKey: res.requestKey, fromCache: false };
  }

  /** Images are licensed by a community DB — attribution travels with the URL. */
  private static readonly ATTRIBUTION = "TheSportsDB (community metadata — verify licence before display)";

  override async getTeam(input: { providerTeamId: string }): Promise<ProviderResult<NormalizedTeam>> {
    const res = await this.getJson<Record<string, TsdTeam[] | null>>("lookupteam.php", { id: input.providerTeamId });
    const list = this.unwrap(res);
    if (!list.ok) return list;
    const t = list.data[0];
    if (!t) return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `team ${input.providerTeamId} not found` } };
    return {
      ok: true,
      data: {
        providerId: t.idTeam,
        name: t.strTeam,
        shortName: str(t.strTeamShort),
        abbreviation: null,
        countryCode: str(t.strCountryCode),
        countryName: str(t.strCountry),
        logoUrl: str(t.strTeamBadge),
        foundedYear: toInt(t.intFormedYear),
        venueName: str(t.strStadium),
        primaryColor: null,
        secondaryColor: null,
        isNationalTeam: !!t.idLeague && t.idLeague === "4480",
      },
      provider: this.name,
      fetchedAt: list.fetchedAt,
      requestKey: list.requestKey,
      fromCache: false,
    };
  }

  /** Squad feed doubles as the player-photo source (the actual reason we call it). */
  override async getTeamSquad(input: { providerTeamId: string }): Promise<ProviderResult<NormalizedSquadMember[]>> {
    const res = await this.getJson<Record<string, TsdPlayer[] | null>>("lookup_all_players.php", { id: input.providerTeamId });
    const list = this.unwrap(res);
    if (!list.ok) return list;
    const data = list.data.map((p) => ({
      providerId: p.idPlayer,
      name: p.strPlayer,
      position: str(p.strPosition),
      jerseyNumber: toInt(p.strNationalTeamNo),
      dateOfBirth: toIso(p.dateBorn),
      countryCode: null,
      photoUrl: str(p.strThumb) ?? str(p.strCutout),
      photoAttribution: str(p.strThumb) || str(p.strCutout) ? TheSportsDbAdapter.ATTRIBUTION : null,
    }));
    return { ok: true, data, provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
  }

  override async getPlayer(input: { providerPlayerId: string }): Promise<ProviderResult<NormalizedPlayer>> {
    const res = await this.getJson<Record<string, TsdPlayer[] | null>>("lookupplayer.php", { id: input.providerPlayerId });
    const list = this.unwrap(res);
    if (!list.ok) return list;
    const p = list.data[0];
    if (!p) return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `player ${input.providerPlayerId} not found` } };
    const foot = str(p.strFoot)?.toLowerCase();
    return {
      ok: true,
      data: {
        providerId: p.idPlayer,
        fullName: p.strPlayer,
        dateOfBirth: toIso(p.dateBorn),
        countryCode: null,
        position: str(p.strPosition),
        photoUrl: str(p.strCutout) ?? str(p.strThumb),
        photoAttribution: str(p.strCutout) || str(p.strThumb) ? TheSportsDbAdapter.ATTRIBUTION : null,
        heightCm: p.strHeight ? Math.round(toCm(p.strHeight) ?? 0) || null : null,
        weightKg: p.strWeight ? toInt(p.strWeight) : null,
        footPreference: foot === "right" || foot === "left" || foot === "both" ? foot : null,
        teamProviderId: str(p.idTeam),
      },
      provider: this.name,
      fetchedAt: list.fetchedAt,
      requestKey: list.requestKey,
      fromCache: false,
    };
  }

  override async getCompetition(input: { providerCompetitionId: string }): Promise<ProviderResult<NormalizedCompetition>> {
    const res = await this.getJson<Record<string, TsdLeague[] | null>>("lookupleague.php", { id: input.providerCompetitionId });
    const list = this.unwrap(res);
    if (!list.ok) return list;
    const l = list.data[0];
    if (!l) return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `league ${input.providerCompetitionId} not found` } };
    return {
      ok: true,
      data: { providerId: l.idLeague, name: l.strLeague, shortName: str(l.strLeagueAlternate), countryCode: null, countryName: str(l.strCountry), type: str(l.strSport)?.toLowerCase() ?? null, logoUrl: str(l.strBadge) ?? str(l.strLogo) },
      provider: this.name,
      fetchedAt: list.fetchedAt,
      requestKey: list.requestKey,
      fromCache: false,
    };
  }

  override async getCompetitionSeasons(input: { providerCompetitionId: string }): Promise<ProviderResult<NormalizedSeason[]>> {
    const res = await this.getJson<Record<string, TsdSeason[] | null>>("search_all_seasons.php", { id: input.providerCompetitionId });
    const list = this.unwrap(res);
    if (!list.ok) return list;
    const data = list.data.map((s) => ({
      providerId: s.idSeason,
      competitionProviderId: s.idLeague ?? input.providerCompetitionId,
      name: s.strSeason,
      isCurrent: s.strSeason === String(new Date().getFullYear()),
      startDate: null,
      endDate: null,
    }));
    return { ok: true, data, provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
  }

  /** Only used for artwork enrichment (`images`), never for live scores. */
  override async getFixtures(input: { sport: string; competitionProviderId?: string; range?: { from: string; to: string }; date?: string }): Promise<ProviderResult<{ providerId: string; sport: string; competitionProviderId: string; seasonProviderId: string | null; round: string | null; homeProviderId: string | null; awayProviderId: string | null; scheduledAt: string; status: string; homeScore: number | null; awayScore: number | null; periods: { label: string; home: number | null; away: number | null }[]; venueProviderId: string | null; venueName: string | null; attendance: number | null; minute: number | null }[]>> {
    if (!input.date) {
      return { ok: false, provider: this.name, requestKey: this.key("events", {}), fromCache: false, error: { code: "bad_response", message: "thesportsdb events need a date (eventsday.php)" } };
    }
    const params: Record<string, unknown> = { d: input.date.slice(0, 10), s: input.sport === "football" ? "Soccer" : input.sport };
    const res = await this.getJson<Record<string, TsdEvent[] | null>>("eventsday.php", params);
    const list = this.unwrap(res);
    if (!list.ok) return list;
    const data = list.data.map((e) => ({
      providerId: e.idEvent,
      sport: input.sport,
      competitionProviderId: str(e.idLeague) ?? "",
      seasonProviderId: str(e.idSeason),
      round: str(e.intRound),
      homeProviderId: str(e.idHomeTeam),
      awayProviderId: str(e.idAwayTeam),
      scheduledAt: toIso(e.strTimestamp) ?? toIso(`${e.dateEvent}T${e.strTime ?? "00:00:00+00:00"}`) ?? new Date().toISOString(),
      status: mapTsdStatus(e.strStatus),
      homeScore: toInt(e.intHomeScore),
      awayScore: toInt(e.intAwayScore),
      periods: [],
      venueProviderId: null,
      venueName: str(e.strVenue),
      attendance: null,
      minute: null,
    }));
    return { ok: true, data, provider: this.name, fetchedAt: list.fetchedAt, requestKey: list.requestKey, fromCache: false };
  }

  override async getVenue(input: { providerVenueId: string }): Promise<ProviderResult<NormalizedVenue>> {
    const res = await this.getJson<Record<string, { idVenue: string; strVenue: string; strCity?: string; strCountry?: string; intCapacity?: string; strThumb?: string }[] | null>>("lookupeventvenue.php", { id: input.providerVenueId });
    const list = this.unwrap(res);
    if (!list.ok) return list;
    const v = list.data[0];
    if (!v) return { ok: false, provider: this.name, requestKey: list.requestKey, fromCache: false, error: { code: "not_found", message: `venue ${input.providerVenueId} not found` } };
    return {
      ok: true,
      data: { providerId: v.idVenue, name: v.strVenue, city: str(v.strCity), countryCode: null, capacity: toInt(v.intCapacity), lat: null, lng: null },
      provider: this.name,
      fetchedAt: list.fetchedAt,
      requestKey: list.requestKey,
      fromCache: false,
    };
  }

  override async healthCheck(): Promise<ProviderResult<ProviderHealth>> {
    const started = Date.now();
    const res = await this.getJson<Record<string, TsdLeague[] | null>>("search_all_leagues.php", { c: "England" });
    const at = new Date().toISOString();
    if (!res.ok) {
      return { ok: true, data: { provider: this.name, reachable: false, checkedAt: at, latencyMs: Date.now() - started, quotaRemaining: null, detail: res.error.message }, provider: this.name, fetchedAt: at, requestKey: res.requestKey, fromCache: false };
    }
    const count = Object.values(res.data)[0]?.length ?? 0;
    return {
      ok: true,
      data: { provider: this.name, reachable: true, checkedAt: at, latencyMs: Date.now() - started, quotaRemaining: null, detail: `${count} english leagues listed` },
      provider: this.name,
      fetchedAt: at,
      requestKey: res.requestKey,
      fromCache: false,
    };
  }
}

function toCm(raw: string): number | null {
  const text = raw.toLowerCase();
  if (text.includes("ft") || text.includes("'")) {
    const feet = Number.parseFloat(text);
    const inchesMatch = text.match(/(\d+)\s*(?:in|"|''|$)/);
    const inches = inchesMatch ? Number.parseFloat(inchesMatch[1]) : 0;
    if (!Number.isFinite(feet)) return null;
    return Math.round((feet * 12 + inches) * 2.54);
  }
  const n = Number.parseFloat(text);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function mapTsdStatus(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (s.includes("ft") || s.includes("match finished") || s.includes("full")) return "finished";
  if (s.includes("ns") || s.includes("not started")) return "scheduled";
  if (s.includes("ht")) return "halftime";
  if (s.includes("pst")) return "postponed";
  if (s.includes("canc")) return "cancelled";
  if (s.match(/^\d+'?$/)) return "live";
  return "scheduled";
}
