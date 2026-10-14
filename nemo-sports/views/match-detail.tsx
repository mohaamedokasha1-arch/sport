import ShareMatch from "@/components/match/ShareMatch";
import type { Metadata } from "next";
import Link from "@/components/i18n/Link";
import { cache } from "react";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import MatchLive from "@/components/match/MatchLive";
import MatchStreamPlayer from "@/components/match/MatchStreamPlayer";
import AdsterraBanner from "@/components/ads/AdsterraBanner";
import DataSourceNote from "@/components/data/DataSourceNote";
import { allMatches, articles, matchBySlug } from "@/lib/data";
import { getLiveStates } from "@/lib/live";
import { broadcastFor, streamForMatch } from "@/lib/match-streams";
import { broadcastNoticeKey } from "@/lib/i18n/broadcast";
import { applyDemoOverride, getOverride } from "@/lib/match-overrides";
import { awayTeam, compOf, homeTeam, timeOf } from "@/lib/format";
import { siteDay } from "@/lib/tz";
import { matchStateOf } from "@/lib/match-state";
import { matchStateLabel, unconfirmedNote } from "@/lib/i18n/match-state";
import { decodeSlug } from "@/lib/slug";
import { competitionBySlug, teamBySlug } from "@/lib/core-data";
import { competitionByPath } from "@/lib/competition-catalog";
import { getAdminMatchBySlug, adminMatchToFixture } from "@/lib/admin-matches";
import ProviderCrest from "@/components/ui/ProviderCrest";
import ScorePair from "@/components/ui/ScorePair";
import { matchDetail as sdlMatchDetail, matchEvents, matchLineups, matchStats, sportForMatchId, PERMANENT_FAILURE_KINDS, hasMatchIdentity, resolveInboundMatchSlug } from "@/lib/sdl-gateway";
import { demoContentVisible } from "@/lib/site";
import { serializeJsonLd } from "@/lib/json-ld";
import type { NormalizedEvent, NormalizedFixture, NormalizedLineup, NormalizedStat } from "@/packages/sdl/src";
import { isLiveStatus } from "@/lib/match-state";
import { matchPath, matchUrl, schemaSportName } from "@/lib/match-links";
import { isBracketSlotFixture } from "@/lib/match-identity";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";
import { localeAlternates } from "@/lib/i18n/metadata";
import { formatClock, formatDate } from "@/lib/i18n/dates";
import { countryName } from "@/lib/i18n/names";

export type ViewProps = { params: Promise<{ slug: string }> };


// Rendered per request: the page carries admin-controlled stream state
// (publish / stop / edit / delete). ISR with revalidatePath() does not reliably
// purge entries for percent-encoded Arabic slugs, so a stopped stream could
// stay visible. Provider data is still cached in lib/ (see lib/cache).
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  // Demo slugs are prerendered for development/preview only; production
  // renders real provider matches on demand (dynamicParams stays true).
  return demoContentVisible() ? allMatches.map((m) => ({ slug: m.slug })) : [];
}

/**
 * The sport this match belongs to, memoized for the request.
 *
 * The slug carries no sport and the page used to assume "football", which made
 * every basketball / tennis / cricket link the list pages render a 404. An id
 * nothing resolves keeps the previous assumption rather than probing four
 * providers for a slug that is simply unknown.
 */
const matchSport = cache(async (slug: string): Promise<string> => (await sportForMatchId(slug)) ?? "football");

const STATUS_AR: Record<string, string> = {
  live: "md.status.live",
  halftime: "md.status.halftime",
  extra_time: "md.status.extra_time",
  extra_time_halftime: "md.status.extra_time_halftime",
  penalty_shootout: "md.status.penalty_shootout",
  finished: "md.status.finished",
  scheduled: "md.status.scheduled",
  postponed: "md.status.postponed",
  cancelled: "md.status.cancelled",
  suspended: "md.status.suspended",
  abandoned: "md.status.abandoned",
  walkover: "md.status.walkover",
  awarded: "md.status.awarded",
};

const EVENT_ICON: Record<string, string> = {
  goal: "⚽",
  penalty: "⚽",
  "own-goal": "⚽",
  own_goal: "⚽",
  penalty_awarded: "⚽",
  "missed-penalty": "🚫",
  penalty_missed: "🚫",
  yellow: "🟨",
  yellow_card: "🟨",
  red: "🟥",
  red_card: "🟥",
  yellow_red_card: "🟥",
  "second-yellow": "🟥",
  "sub-in": "🔄",
  substitution: "🔄",
  var: "📺",
  var_review: "📺",
  var_decision: "📺",
  period_start: "⏱",
  period_end: "⏱",
};

/* A goal is scored with a different ball per sport, and this page renders
 * basketball / tennis / cricket fixtures too (the list pages link every sport
 * in PUBLIC_SPORTS), so a fixed football glyph mislabels their events. */
const EVENT_GLYPH_BY_SPORT: Record<string, string> = {
  football: "⚽",
  basketball: "🏀",
  tennis: "🎾",
  cricket: "🏏",
};

function eventGlyph(type: string, sport: string | undefined): string {
  if (type === "goal" || type === "penalty") {
    return EVENT_GLYPH_BY_SPORT[sport ?? "football"] ?? EVENT_GLYPH_BY_SPORT.football;
  }
  return EVENT_ICON[type] ?? "•";
}

const EVENT_AR: Record<string, string> = {
  goal: "md.event.goal",
  penalty: "md.event.penalty",
  penalty_awarded: "md.event.penalty_awarded",
  "own-goal": "md.event.own-goal",
  own_goal: "md.event.own-goal",
  "missed-penalty": "md.event.missed-penalty",
  penalty_missed: "md.event.missed-penalty",
  yellow: "md.event.yellow",
  yellow_card: "md.event.yellow",
  red: "md.event.red",
  red_card: "md.event.red",
  yellow_red_card: "md.event.yellow_red_card",
  "second-yellow": "md.event.yellow_red_card",
  "sub-in": "md.event.sub-in",
  substitution: "md.event.sub-in",
  var: "md.event.var",
  var_review: "md.event.var",
  var_decision: "md.event.var_decision",
  period_start: "md.event.period_start",
  period_end: "md.event.period_end",
  match_start: "md.event.match_start",
  match_end: "md.event.match_end",
  injury: "md.event.injury",
  extra_time_start: "md.event.extra_time_start",
  penalty_shootout_start: "md.event.penalty_shootout_start",
};

const STAT_LABELS_AR: Record<string, string> = {
  ball_possession: "md.stat.ball_possession",
  possession: "md.stat.ball_possession",
  shots_total: "md.stat.shots_total",
  total_shots: "md.stat.shots_total",
  shots_on_target: "md.stat.shots_on_target",
  shots_on_goal: "md.stat.shots_on_target",
  shots_off_target: "md.stat.shots_off_target",
  corners: "md.stat.corners",
  corner_kicks: "md.stat.corners",
  fouls: "md.stat.fouls",
  offsides: "md.stat.offsides",
  yellow_cards: "md.stat.yellow_cards",
  red_cards: "md.stat.red_cards",
  saves: "md.stat.saves",
  passes: "md.stat.passes",
  passes_accuracy: "md.stat.passes_accuracy",
};

const STAT_PERIODS_AR: Record<string, string> = {
  first_half: "md.period.first_half",
  firsthalf: "md.period.first_half",
  "1h": "md.period.first_half",
  second_half: "md.period.second_half",
  secondhalf: "md.period.second_half",
  "2h": "md.period.second_half",
  extra_time: "md.period.extra_time",
  penalty_shootout: "md.period.penalty_shootout",
  period_1: "md.period.period_1",
  period_2: "md.period.period_2",
  period_3: "md.period.period_3",
  period_4: "md.period.period_4",
  q1: "md.period.q1",
  q2: "md.period.q2",
  q3: "md.period.q3",
  q4: "md.period.q4",
};

function statLabel(locale: Locale, type: string): string {
  const key = type.toLowerCase().replace(/[\s-]+/g, "_");
  const k = STAT_LABELS_AR[key];
  return k ? t(locale, k) : t(locale, "md.stat.fallback");
}

function statPeriodSuffix(locale: Locale, period: string): string {
  const key = period.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["", "all", "total", "full_time", "fulltime", "ft"].includes(key)) return "";
  const k = STAT_PERIODS_AR[key];
  return ` · ${k ? t(locale, k) : t(locale, "md.period.fallback")}`;
}

function eventDescription(locale: Locale, description: string | null): string | null {
  const text = description?.trim();
  if (!text) return null;
  // Arabic prose from the source is only meaningful on the Arabic page.
  if (locale === "ar" && /[\u0600-\u06ff]/.test(text)) return text;
  if (locale !== "ar" && /[\u0600-\u06ff]/.test(text)) return null;

  const substitution = /^(?:in|player in):\s*(.+?)\s*[·,|]\s*(?:out|player out):\s*(.+)$/i.exec(text);
  if (substitution) return t(locale, "md.detail.substitution", { in: substitution[1].trim(), out: substitution[2].trim() });

  const assist = /^(?:assist|assisted by):\s*(.+)$/i.exec(text);
  if (assist) return t(locale, "md.detail.assist", { player: assist[1].trim() });

  const key = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const known: Record<string, string> = {
    "goal disallowed": "md.note.goal_disallowed",
    "goal cancelled": "md.note.goal_disallowed",
    "penalty awarded": "md.note.penalty_awarded",
    "penalty missed": "md.note.penalty_missed",
    "tactical foul": "md.note.tactical_foul",
    offside: "md.note.offside",
    handball: "md.note.handball",
  };
  const k = known[key];
  if (k) return t(locale, k);
  return locale === "ar" ? text : text;
}

/**
 * The clock line under the score.
 *
 * It used to print the kickoff time for ANY match whose stored status was
 * `scheduled`, including one that kicked off the previous evening — the page
 * then read «— : —  · ١٠:٠٠ م · موعد معتمد» for a match that had long since
 * been played. The kickoff is only a forward-looking time while the match is
 * still genuinely upcoming (lib/match-state.ts); past that we say the state is
 * unconfirmed rather than implying a fixture still to come.
 */
/** Exported so scripts/verify-i18n-parity.test.ts can run the real function
 *  against the published Arabic instead of a copy of it. */
export function clockOf(locale: Locale, f: NormalizedFixture, now = Date.now()): string {
  // Short form on purpose: the clock line has always read «استراحة», not the
  // longer status label STATUS_AR.halftime ("استراحة بين الشوطين") that the
  // status badge above it carries.
  if (f.status === "halftime") return t(locale, "md.clock.halftime");
  if (f.minute !== null && ["live", "extra_time", "extra_time_halftime", "penalty_shootout"].includes(f.status)) return `${f.minute}'`;
  if (f.status === "finished") return t(locale, "state.finished");
  const state = matchStateOf(f.status, f.scheduledAt, now);
  if (state === "upcoming") return formatClock(locale, f.scheduledAt);
  if (state === "unconfirmed") return matchStateLabel(locale, "unconfirmed");
  // STATUS_AR here is this file's own map (lowercase MatchStatus → message
  // key), not the UPPERCASE provider-status map in lib/format.ts. It resolves
  // for every legal status; the state label is only the theoretical fallback.
  const k = STATUS_AR[f.status];
  return k ? t(locale, k) : matchStateLabel(locale, state);
}

export async function generateMetadata(locale: Locale, { params }: ViewProps): Promise<Metadata> {
  // Arabic slugs arrive percent-encoded; decode once so every lookup (admin
  // match, stream registry, overrides, provider) uses the real slug.
  const slug = decodeSlug((await params).slug);

  // ── real match first ──
  const real = await sdlMatchDetail(await matchSport(slug), slug);
  if (real.ok && real.source === "provider" && hasMatchIdentity(real.data)) {
    const f = real.data;
    const home = f.homeName ?? f.homeProviderId ?? "—";
    const away = f.awayName ?? f.awayProviderId ?? "—";
    const comp = f.competitionName ?? "";
    const date = formatDate(locale, f.scheduledAt);
    const title = t(locale, "md.metaTitle", { home, away, comp, date });
    const description = t(locale, "md.metaDescription", { home, away, comp });
    return {
      title,
      description,
      alternates: localeAlternates(locale, matchPath(slug)),
      openGraph: { title, description, type: "article" },
      // A bracket slot (e.g. "1st Place Team") is not a settled match yet: the
      // page stays reachable for anyone with the link, but is kept out of the index.
      ...(isBracketSlotFixture(f) ? { robots: { index: false, follow: true } } : {}),
    };
  }

  // ── admin match fallback ──
  const adminM = await getAdminMatchBySlug(slug).catch(() => null);
  if (adminM && adminM.isPublished) {
    const home = adminM.homeName || "—";
    const away = adminM.awayName || "—";
    const comp = adminM.competitionName || t(locale, "matches.fallbackCompetition");
    const date = formatDate(locale, adminM.scheduledAt);
    const title = t(locale, "md.metaTitle", { home, away, comp, date });
    const description = t(locale, "md.adminMetaDescription", { home, away, comp });
    return {
      title,
      description,
      alternates: localeAlternates(locale, matchPath(adminM.slug)),
      openGraph: { title, description, type: "article" },
    };
  }

  // ── dev/demo fallback ──
  if (demoContentVisible()) {
    const m = matchBySlug(slug);
    if (m) {
      const home = homeTeam(m);
      const away = awayTeam(m);
      const comp = compOf(m);
      return {
        title: t(locale, "md.metaTitle", { home: home.name, away: away.name, comp: comp.name, date: formatDate(locale, m.kickoff) }),
        description: t(locale, "md.demoMetaDescription", { home: home.name, away: away.name, comp: comp.name }),
        alternates: localeAlternates(locale, matchPath(m.slug)),
        openGraph: { title: t(locale, "md.metaTitleShort", { home: home.name, away: away.name }), type: "article" },
      };
    }
  }

  // No real match and no demo match: a stable, non-indexable "not found".
  // The explicit robots directive keeps Next.js's built-in not-found noindex
  // from being emitted alongside the layout's `index, follow`.
  return { title: t(locale, "md.notFound"), robots: { index: false, follow: true } };
}

const StatBar = ({ label, home, away }: { label: string; home: string; away: string }) => (
  <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2 border-b border-line px-3 py-2 text-[12px] last:border-0">
    <span className="num text-end font-extrabold">{home}</span>
    <span className="text-center text-muted">{label}</span>
    <span className="num font-extrabold">{away}</span>
  </div>
);

export default async function MatchPage({ locale, params }: ViewProps & { locale: Locale }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  // Arabic slugs arrive percent-encoded; decode once so every lookup (admin
  // match, stream registry, overrides, provider) uses the real slug.
  const slug = decodeSlug((await params).slug);

  // Provider and admin slugs are lowercase (slugifyMatch, SportScore URLs), and the
  // store matches them case-insensitively. Without this, `/matches/MALAGA-vs-espanyol`
  // answered 200 with a self-referencing canonical: a second copy of the same page.
  if (/[A-Z]/.test(slug)) permanentRedirect(`/matches/${encodeURIComponent(slug.toLowerCase())}`);

  /* ══ 1) real match (SportScore via SDL or admin-managed fixture) ══════ */
  let f: NormalizedFixture | null = null;
  let providerName: import("@/lib/sdl-gateway").GatewayProvider = "admin";
  let fromCache = false;
  let stale = false;
  let fetchedAt = new Date().toISOString();

  const real = await sdlMatchDetail(await matchSport(slug), slug);
  if (real.ok && real.source === "provider" && hasMatchIdentity(real.data)) {
    f = real.data;
    providerName = real.provider;
    fromCache = real.fromCache;
    stale = real.stale;
    fetchedAt = real.fetchedAt;
  } else {
    const adminM = await getAdminMatchBySlug(slug).catch(() => null);
    if (adminM && adminM.isPublished) {
      f = adminMatchToFixture(adminM);
      providerName = "admin";
    } else if (!real.ok && !PERMANENT_FAILURE_KINDS.has(real.error.kind)) {
      throw new Error(`match_detail_unavailable:${real.error.kind}`);
    }
  }

  if (f) {
    // A successful call can still yield a contentless shell. Rendering it
    // would publish an indexable "— ضد —" page for an unbounded slug space,
    // so it is a 404 instead. See hasMatchIdentity().
    if (!hasMatchIdentity(f)) notFound();
    const home = f.homeName ?? f.homeProviderId ?? "—";
    const away = f.awayName ?? f.awayProviderId ?? "—";
    const live = isLiveStatus(f.status);
    const played = f.homeScore !== null && f.awayScore !== null;
    // One state rule for the whole site (lib/match-state.ts): a stored
    // `scheduled` whose kickoff day has passed is no longer an upcoming fixture.
    const matchState = matchStateOf(f.status, f.scheduledAt);
    const stateNote = live
      ? t(locale, "md.kickoffState.auto")
      : matchState === "upcoming"
        ? t(locale, "md.kickoffState.confirmed")
        : matchState === "unconfirmed"
          ? t(locale, "md.kickoffState.unconfirmed")
          : matchStateLabel(locale, matchState);

    // Stream source for THIS match only (null for every other match →
    // no player section renders there). See lib/match-streams.ts.
    const [eventsRes, lineupsRes, statsRes, stream, override] = await Promise.all([
      matchEvents(f.providerId, providerName, f.sport),
      matchLineups(f.sport, f.providerId, providerName),
      matchStats(f.sport, f.providerId, providerName),
      streamForMatch({ slug, home, away }),
      // The fixture itself is already corrected centrally in the gateway;
      // this read only decides whether the "corrected by admin" badge shows.
      getOverride(slug),
    ]);
    const broadcast = broadcastFor(stream, { status: f.status, scheduledAt: f.scheduledAt, sport: f.sport });
    const events: NormalizedEvent[] = eventsRes.ok ? eventsRes.data.filter((event) => event.providerMatchId === f!.providerId).sort((a, b) => (a.minute ?? 999) - (b.minute ?? 999) || (a.additionalMinute ?? 0) - (b.additionalMinute ?? 0)) : [];
    const lineups: NormalizedLineup[] = lineupsRes.ok ? lineupsRes.data : [];
    const rawStats: NormalizedStat[] = statsRes.ok ? statsRes.data : [];
    // Pair statistics by period and the provider IDs, not display names.
    // Providers may use numeric IDs even when the fixture has a team label.
    const statPairs = new Map<string, { type: string; period: string; home: string; away: string }>();
    for (const stat of rawStats) {
      const type = stat.type.toLowerCase().replace(/[\s-]+/g, "_");
      const period = stat.period.trim().toLowerCase().replace(/[\s-]+/g, "_");
      const key = JSON.stringify([type, period]);
      const pair = statPairs.get(key) ?? { type, period, home: "—", away: "—" };
      if (f.homeProviderId && stat.teamProviderId === f.homeProviderId) pair.home = String(stat.value);
      else if (f.awayProviderId && stat.teamProviderId === f.awayProviderId) pair.away = String(stat.value);
      statPairs.set(key, pair);
    }
    const statRows = [...statPairs.entries()]
      .filter(([, pair]) => pair.home !== "—" || pair.away !== "—")
      .map(([key, pair]) => ({
        key,
        label: `${statLabel(locale, pair.type)}${statPeriodSuffix(locale, pair.period)}`,
        home: pair.home,
        away: pair.away,
      }));

    const ht = f.periods.find((p) => p.label === "HT");

    /* A /teams/<slug> page exists in production only when the provider has a row
       for that id. `teamBySlug()` answers from the DEMO catalogue, so an
       editorial ("admin") fixture — whose team values are operator text such as
       "malaga", not a provider id — produced a link to a page production
       deliberately does not serve, i.e. two guaranteed 404s on every admin match
       page. Consult the demo catalogue only while it is actually being served;
       otherwise fall through to the plain <span> the markup already has. */
    const demoTeamsVisible = demoContentVisible();
    const homeTeamObj = demoTeamsVisible ? teamBySlug(f.homeProviderId || home) : undefined;
    const awayTeamObj = demoTeamsVisible ? teamBySlug(f.awayProviderId || away) : undefined;
    const compRef = (f.competitionProviderId || f.competitionName)
      ? competitionByPath(f.competitionProviderId || f.competitionName || "")
      : undefined;
    const compSlug = compRef?.canonicalSlug ?? (competitionBySlug(f.competitionProviderId ?? "") ? f.competitionProviderId : null);
    const compUrl = compSlug ? `/competitions/${compSlug}` : null;

    const ld = {
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: `${home} vs ${away}`,
      startDate: f.scheduledAt,
      eventStatus:
        f.status === "finished"
          ? undefined
          : f.status === "postponed"
            ? "https://schema.org/EventPostponed"
          : f.status === "cancelled"
            ? "https://schema.org/EventCancelled"
            : isLiveStatus(f.status)
              ? undefined
              : "https://schema.org/EventScheduled",
      sport: schemaSportName(f.sport),
      url: matchUrl(slug),
      homeTeam: { "@type": "SportsTeam", name: home },
      awayTeam: { "@type": "SportsTeam", name: away },
      competitor: [{ "@type": "SportsTeam", name: home }, { "@type": "SportsTeam", name: away }],
    };

    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(ld) }} />
        <div className="mx-auto max-w-[1280px] px-4 py-6">
          <nav aria-label={tr("md.breadcrumbAria")} className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">{tr("md.home")}</Link>
            <span aria-hidden>/</span>
            <Link href="/matches" className="hover:text-gold-600 dark:hover:text-gold-400">{tr("md.matches")}</Link>
            <span aria-hidden>/</span>
            <Link href="/live" className="hover:text-gold-600 dark:hover:text-gold-400">{tr("md.liveStream")}</Link>
            <span aria-hidden>/</span>
            <span className="font-semibold text-ink">{home} × {away}</span>
          </nav>

          {/* H1 Title */}
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-ink text-center mb-3 tracking-tight">
            {home} {tr("md.vs")} {away}
          </h1>

          {/* scoreboard */}
          <header className={`card relative overflow-hidden px-4 py-6 ${live ? "border-live-red/40" : ""}`}>
            {live ? <span className="absolute inset-x-0 top-0 h-0.5 bg-live-red" aria-hidden /> : null}
            {compUrl ? (
              <p className="mb-4 text-center text-[12px]">
                <Link href={compUrl} className="font-bold text-gold-600 dark:text-gold-400 hover:underline">
                  {f.competitionName ?? ""}
                </Link>
              </p>
            ) : (
              <p className="mb-4 text-center text-[12px] font-bold text-muted">{f.competitionName ?? ""}</p>
            )}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="flex flex-col items-center gap-2 text-center">
                <ProviderCrest name={home} logoUrl={f.homeLogoUrl} size={48} />
                {homeTeamObj ? (
                  <Link href={`/teams/${homeTeamObj.slug}`} className="text-[13px] font-extrabold hover:text-gold-500 transition">
                    {home}
                  </Link>
                ) : (
                  <span className="text-[13px] font-extrabold">{home}</span>
                )}
              </div>
              <div className="flex flex-col items-center gap-1">
                {played ? (
                  <ScorePair home={f.homeScore} away={f.awayScore} className="text-4xl font-extrabold" />
                ) : (
                  <span className="num text-2xl font-extrabold text-muted">— : —</span>
                )}
                <span className={`text-[12px] font-extrabold ${live ? "text-live-red" : "text-muted"}`} dir={/^\d+'$/.test(clockOf(locale, f)) ? "ltr" : undefined}>
                  {clockOf(locale, f)}
                </span>
                {ht ? (
                  <span className="num text-[11px] text-muted">
                    {tr("md.halfTimeScore", { home: ht.home ?? "—", away: ht.away ?? "—" })}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-col items-center gap-2 text-center">
                <ProviderCrest name={away} logoUrl={f.awayLogoUrl} size={48} />
                {awayTeamObj ? (
                  <Link href={`/teams/${awayTeamObj.slug}`} className="text-[13px] font-extrabold hover:text-gold-500 transition">
                    {away}
                  </Link>
                ) : (
                  <span className="text-[13px] font-extrabold">{away}</span>
                )}
              </div>
            </div>
            <p className="mt-4 text-center text-[11.5px] text-muted">
              {formatDate(locale, f.scheduledAt)} · {formatClock(locale, f.scheduledAt)}
              {f.venueName ? ` · ${f.venueName}` : ""}
              {" · "}
              {stateNote}
            </p>
            {matchState === "unconfirmed" ? (
              <p className="mt-2 rounded-[3px] bg-warn-500/10 px-3 py-2 text-center text-[11px] font-semibold leading-5 text-warn-700 dark:text-warn-400">
                {unconfirmedNote(locale, f.status)}
              </p>
            ) : null}
            {override ? (
              <p className="mt-2 text-center text-[11px]">
                <span className="inline-block rounded-[3px] bg-gold-500/15 px-2 py-0.5 font-bold text-gold-600 dark:text-gold-400">
                  {tr("md.adminCorrected")}{override.note ? ` — ${override.note}` : ""}
                </span>
              </p>
            ) : null}
          </header>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <ShareMatch title={`${home} × ${away} — NEMO Sports`} path={matchPath(slug)} />
            {matchState === "upcoming" && !stale ? (
              <>
                <a className="focus-ring min-h-11 rounded border border-line px-3 py-3 text-sm" href={`/api/v1/calendar/${encodeURIComponent(slug)}`}>{tr("md.calendarLink")} (.ics)</a>
                <p className="text-xs text-muted">{tr("md.calendarNote")}</p>
              </>
            ) : null}
          </div>
          {/* Two 300×250 Adsterra placements frame the watch action — one above
              the live-stream block, one below it (lib/ads.ts owns the keys). Each
              keeps a reserved 300×250 box and only asks for its ad document once
              it scrolls into range, so nothing here delays the page's own data
              and the layout never shifts when the creative lands. */}
          <AdsterraBanner slot="match-above-stream" className="mt-6" />

          {/* live stream — judged by the broadcast lifecycle (approval + rights
              evidence + match state + window), never by the stream record alone */}
          {broadcast && broadcast.publicVisible && stream ? (
            <MatchStreamPlayer
              stream={stream}
              phase={broadcast.state === "live" ? "live" : broadcast.state === "standby" ? "upcoming" : "inactive"}
              home={home}
              away={away}
              inactiveNote={tr(broadcastNoticeKey(broadcast.noticeAr, broadcast.matchState))}
            />
          ) : (
            <section id="live-stream" className="mt-8">
              <h2 className="mb-3 border-b-2 border-line pb-2 text-[15px] font-extrabold flex items-center justify-between">
                <span>{tr("md.streamTitle")}</span>
                <span className="text-[11px] font-normal text-muted">{tr("md.streamSubtitle")}</span>
              </h2>
              <div className="card border-dashed px-4 py-8 text-center bg-navy-900/30">
                <span className="text-3xl block mb-2" aria-hidden>📺</span>
                <p className="text-[14px] font-extrabold text-ink">{tr("md.noStreamTitle")}</p>
                <p className="mt-1.5 text-[12px] text-muted max-w-md mx-auto leading-relaxed">
                  {tr("md.noStreamBody")}
                </p>
              </div>
            </section>
          )}

          <AdsterraBanner slot="match-below-stream" />

          {/* events timeline */}
          <section className="mt-8">
            <h2 className="mb-3 border-b-2 border-line pb-2 text-[15px] font-extrabold">{tr("md.eventsHeading")}</h2>
            {events.length === 0 ? (
              <p className="card px-4 py-6 text-center text-[12.5px] text-muted">
                {f.status === "scheduled" && siteDay(f.scheduledAt) >= siteDay(Date.now())
                  ? tr("md.eventsNotStarted")
                  : tr("md.eventsNone")}
              </p>
            ) : (
              <ol className="card divide-y divide-line">
                {events.map((event) => {
                  const teamName = event.teamProviderId && event.teamProviderId === f.homeProviderId
                    ? home
                    : event.teamProviderId && event.teamProviderId === f.awayProviderId
                      ? away
                      : null;
                  const description = eventDescription(locale, event.description);
                  return (
                    <li key={event.providerEventId} className="flex items-center gap-3 px-3 py-2.5 text-[12.5px]">
                      <span className="num w-9 shrink-0 text-end font-extrabold text-gold-600 dark:text-gold-400">{event.minute !== null ? `${event.minute}${event.additionalMinute ? `+${event.additionalMinute}` : ""}'` : "—"}</span>
                      <span aria-hidden className="w-5 text-center">{eventGlyph(event.type, f.sport)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="font-bold">{tr(EVENT_AR[event.type] ?? "md.event.fallback")}</span>
                        {event.playerName ? <span> · {event.playerName}</span> : null}
                        {teamName ? <span className="text-muted"> · {teamName}</span> : null}
                        {description ? <span className="text-muted"> · {description}</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <p className="mt-3 text-xs text-muted">{tr("md.eventsNote")}</p>
          {statRows.length === 0 && <p className="card mt-4 p-4 text-sm text-muted">{tr("md.statsNone")}</p>}
          {lineups.length === 0 && <p className="card mt-4 p-4 text-sm text-muted">{tr("md.lineupsNone")}</p>}
          {/* statistics (only when the provider has them) */}
          {statRows.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-3 border-b-2 border-line pb-2 text-[15px] font-extrabold">{tr("md.statsHeading")}</h2>
              <div className="card overflow-hidden">
                {statRows.map((row) => (
                  <StatBar key={row.key} label={row.label} home={row.home} away={row.away} />
                ))}
              </div>
            </section>
          ) : null}

          {/* lineups */}
          {lineups.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-3 border-b-2 border-line pb-2 text-[15px] font-extrabold">{tr("md.lineupsHeading")}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {lineups.map((lineup) => {
                  const teamName = lineup.teamProviderId === f.homeProviderId
                    ? home
                    : lineup.teamProviderId === f.awayProviderId
                      ? away
                      : tr("md.sideFallback");
                  return (
                    <div key={lineup.teamProviderId} className="card overflow-hidden">
                      <header className="flex items-center justify-between border-b border-line bg-navy-850 px-3 py-2.5 text-white dark:bg-navy-850">
                        <h3 className="text-[13px] font-extrabold">{teamName}</h3>
                        {lineup.formation ? <span className="num text-[12px] font-bold text-gold-400">{lineup.formation}</span> : null}
                      </header>
                      <div className="grid gap-0 sm:grid-cols-2">
                        <div className="border-b border-line sm:border-e sm:border-b-0">
                          <p className="px-3 pt-2 text-[10.5px] font-bold uppercase tracking-wide text-muted">{tr("md.startingXI")}</p>
                          <ul className="p-2">
                            {lineup.starters.map((player) => (
                              <li key={player.providerId} className="flex items-center gap-2 px-1 py-1 text-[12px]">
                                <span className="num w-6 shrink-0 text-end font-bold text-muted">{player.jerseyNumber ?? "–"}</span>
                                <span className="truncate font-semibold">{player.name}</span>
                                {player.position ? <span className="shrink-0 text-[10px] text-muted">{player.position}</span> : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                        {lineup.bench.length > 0 ? (
                          <div>
                            <p className="px-3 pt-2 text-[10.5px] font-bold uppercase tracking-wide text-muted">{tr("md.bench")}</p>
                            <ul className="p-2">
                              {lineup.bench.map((player) => (
                                <li key={player.providerId} className="flex items-center gap-2 px-1 py-1 text-[12px] text-muted">
                                  <span className="num w-6 shrink-0 text-end font-bold">{player.jerseyNumber ?? "–"}</span>
                                  <span className="truncate">{player.name}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                      {lineup.coach ? <p className="border-t border-line px-3 py-2 text-[11px] text-muted">{tr("md.coach", { name: lineup.coach })}</p> : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <DataSourceNote className="mt-8 border-t border-line pt-4" provider={providerName} fromCache={fromCache} stale={stale} fetchedAt={fetchedAt} />
        </div>
      </>
    );
  }

  /* ══ 2) an inbound link that means a match we DO have ═══════════════════
     The match gate and shared links address a tie by their own spelling of the
     two clubs; NEMO pages are addressed by the provider's permalink slug. A
     live match linked from the gate answered 404 here while that page showed
     its score — a broken integration, not a missing fixture. Forward only when
     the current data contains exactly one tie between those two clubs.
  */
  const alias = await resolveInboundMatchSlug(slug);
  if (alias) redirect(matchPath(alias));

  /* ══ 3) development/demo fallback ══════════════════════════════════════ */
  if (demoContentVisible()) {
    const match = matchBySlug(slug);
    if (match) return <DemoMatchView locale={locale} slug={slug} />;
  }

  /* ══ 4) honest 404 — real pages come from real provider IDs only ════════ */
  notFound();
}

/* The original demo view, kept for development/preview design QA. */
async function DemoMatchView({ locale, slug }: { locale: Locale; slug: string }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const raw = matchBySlug(slug);
  if (!raw) notFound();
  // Admin corrections apply to demo fixtures too (same override table).
  const override = await getOverride(raw.slug);
  const match = applyDemoOverride(raw, override);

  const home = homeTeam(match);
  const away = awayTeam(match);
  const comp = compOf(match);
  const states = getLiveStates();
  const state = states[match.id];
  // Same per-match registry as the real page: null for every match that
  // has no registered source (see lib/match-streams.ts).
  const stream = await streamForMatch({ slug: match.slug, home: home.name, away: away.name });

  const related = articles
    .filter(
      (a) =>
        a.competition === match.competition ||
        a.teams?.includes(match.home) ||
        a.teams?.includes(match.away),
    )
    .slice(0, 4);

  const ld = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${home.nameEn} vs ${away.nameEn}`,
    startDate: match.kickoff,
    eventStatus:
      state.status === "FINISHED"
        ? undefined
        : state.status === "POSTPONED"
          ? "https://schema.org/EventPostponed"
          : state.status === "CANCELLED"
            ? "https://schema.org/EventCancelled"
            : "https://schema.org/EventScheduled",
    sport: comp.nameEn,
    url: `/matches/${match.slug}`,
    location: match.venue
      ? { "@type": "Place", name: match.venue, address: { "@type": "PostalAddress", addressCountry: countryName(locale, home.country) } }
      : undefined,
    homeTeam: { "@type": "SportsTeam", name: home.nameEn },
    awayTeam: { "@type": "SportsTeam", name: away.nameEn },
    organizer: { "@type": "Organization", name: comp.nameEn },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(ld) }} />
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <p className="mb-4 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[11px] font-semibold text-muted">{tr("md.demoNotice")}</p>
        <nav aria-label={tr("md.breadcrumbAria")} className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">{tr("md.home")}</Link>
          <span aria-hidden>/</span>
          <Link href={`/competitions/${comp.slug}`} className="hover:text-gold-600 dark:hover:text-gold-400">
            {comp.name}
          </Link>
          <span aria-hidden>/</span>
          <span className="font-semibold text-ink">
            {home.short} × {away.short}
          </span>
        </nav>

        <MatchLive
          match={match}
          initial={state}
          stream={stream}
          relatedNews={related.map((a) => ({
            slug: a.slug,
            title: a.title,
            excerpt: a.excerpt,
            author: a.author,
            publishedAgoMin: a.publishedAgoMin,
          }))}
        />

        <section className="mt-8">
          <h2 className="mb-3 border-b-2 border-line pb-2 text-[15px] font-extrabold">{tr("md.otherMatches", { comp: comp.name })}</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {allMatches
              .filter((x) => x.competition === match.competition && x.id !== match.id)
              .slice(0, 6)
              .map((x) => (
                <li key={x.id}>
                  <Link
                    href={`/matches/${x.slug}`}
                    className="card flex items-center justify-between gap-2 px-3 py-2.5 text-[12px] transition hover:border-gold-500/50"
                  >
                    <span className="truncate font-bold">
                      {teamBySlug(x.home)?.short} × {teamBySlug(x.away)?.short}
                    </span>
                    <span className="num shrink-0 text-muted">{timeOf(x.kickoff)}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      </div>
    </>
  );
}
