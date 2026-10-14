import type { Metadata } from "next";
import Link from "@/components/i18n/Link";
import LiveAutoRefresh from "@/components/data/LiveAutoRefresh";
import DataSourceNote from "@/components/data/DataSourceNote";
import { listAdminMatches, adminMatchToFixture, type AdminMatch } from "@/lib/admin-matches";
import type { MatchStreamSource } from "@/lib/match-streams";
import LiveStreams from "@/components/public/LiveStreams";
import LiveMatchCard, { type LiveCardData } from "@/components/live/LiveMatchCard";
import DataUnavailable from "@/components/ui/DataUnavailable";
import { matchStateOf } from "@/lib/match-state";
import { matchStateLabel } from "@/lib/i18n/match-state";
import { sportName, scopeLabel as scopeLabelFor } from "@/lib/i18n/names";
import { t } from "@/lib/i18n/translate";
import { LIVE_SPORT_SLUGS, liveBoard, liveScope } from "@/lib/live-board";
import { judgedStreams, type PublicStreamCard } from "@/lib/public-streams";
import { PUBLIC_SPORTS } from "@/lib/core-data";
import type { NormalizedFixture } from "@/packages/sdl/src";
import type { Locale } from "@/lib/i18n/locales";

export type ViewProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };


export function generateMetadata(locale: Locale, _props: ViewProps = {} as ViewProps): Metadata {
  return {
  title: t(locale, "live.metaTitle"),
  description: t(locale, "live.metaDescription"),
  alternates: { canonical: "/live" },
};
}

export const revalidate = 30;

function cardFromFixture(locale: Locale, f: NormalizedFixture, stream: MatchStreamSource | null, mixedSports: boolean): LiveCardData {
  return {
    id: f.providerId,
    slug: f.providerId,
    homeName: f.homeName || f.homeProviderId || "—",
    awayName: f.awayName || f.awayProviderId || "—",
    homeLogo: f.homeLogoUrl,
    awayLogo: f.awayLogoUrl,
    competitionName: f.competitionName || "",
    scheduledAt: f.scheduledAt,
    status: f.status,
    sport: f.sport,
    sportLabel: mixedSports ? sportName(locale, f.sport) || null : null,
    homeScore: f.homeScore,
    awayScore: f.awayScore,
    minute: f.minute,
    stream,
  };
}

export default async function LivePage({ locale, searchParams, }: ViewProps & { locale: Locale }) {
  const sp = await searchParams;
  const requestedSport = typeof sp.sport === "string" ? sp.sport : "";
  const scope = liveScope(requestedSport);
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const scopeLabel = scopeLabelFor(locale, scope, LIVE_SPORT_SLUGS.length);
  const now = Date.now();

  // ONE live board for every public sport (chip counts need all of them); the
  // page then shows the requested scope. The homepage, /matches, the score
  // rail and /api/v1/live read the same board.
  const [board, adminMatchesAll, judged] = await Promise.all([
    liveBoard(LIVE_SPORT_SLUGS, now),
    listAdminMatches().catch(() => [] as AdminMatch[]),
    judgedStreams(24, now).catch(() => [] as PublicStreamCard[]),
  ]);

  const streamBySlug = new Map<string, MatchStreamSource>();
  for (const card of judged) {
    const slug = card.stream.matchSlug || card.stream.slugs[0];
    if (slug && !streamBySlug.has(slug)) streamBySlug.set(slug, card.stream);
  }
  const playableStreams = judged.filter((card) => card.verdict.playable && scope.includes(card.fixture?.sport ?? "football"));
  const streamsLiveNow = playableStreams.filter((card) => card.verdict.activeNow).length;
  const streamsSoon = playableStreams.length - streamsLiveNow;

  const mixed = scope.length > 1;
  const scopeBoards = board.boards.filter((b) => scope.includes(b.sport));
  const scopeAnswered = scopeBoards.some((b) => b.ok);
  const scopeFailed = scopeBoards.filter((b) => !b.ok).map((b) => sportName(locale, b.sport) || b.sport);
  const liveFixtures = board.live.filter((f) => scope.includes(f.sport));
  const liveSlugs = new Set(liveFixtures.map((f) => f.providerId));
  const liveItems = liveFixtures.map((f) => cardFromFixture(locale, f, streamBySlug.get(f.providerId) ?? null, mixed));

  // Editorial (admin) matches that are not in play: upcoming / finished /
  // interrupted / unconfirmed sections. Live editorial matches already come
  // through the board.
  const publishedAdmin = adminMatchesAll.filter((m) => m.isPublished && scope.includes(m.sport || "football"));
  const lastEditorialUpdate = publishedAdmin.map((m) => m.updatedAt ?? "").filter(Boolean).sort().pop();
  const editorialItems: LiveCardData[] = publishedAdmin
    .filter((m) => !liveSlugs.has(m.slug))
    .map((m) => {
      const f = adminMatchToFixture(m);
      return { ...cardFromFixture(locale, f, streamBySlug.get(m.slug) ?? null, mixed), id: m.id, slug: m.slug, competitionSlug: m.competitionSlug };
    });
  // An operator-entered "live" match the board does not carry (e.g. during a
  // provider outage) is still an editorial claim the page must show.
  for (const item of editorialItems) if (matchStateOf(item.status, item.scheduledAt, now) === "live") liveItems.push(item);
  const otherItems = editorialItems.filter((item) => matchStateOf(item.status, item.scheduledAt, now) !== "live");

  const stateOf = (item: LiveCardData) => matchStateOf(item.status, item.scheduledAt, now);
  const finishedItems = otherItems.filter((item) => stateOf(item) === "finished");
  const interruptedItems = otherItems.filter((item) => ["postponed", "cancelled", "suspended", "abandoned"].includes(stateOf(item)));
  const unconfirmedItems = otherItems.filter((item) => stateOf(item) === "unconfirmed");
  const upcomingItems = otherItems
    .filter((item) => stateOf(item) === "upcoming")
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  const nothingAtAll = liveItems.length + otherItems.length === 0;

  const chip = (href: string, label: string, count: number | null, active: boolean, failed = false) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      title={failed ? tr("live.sportUnverified") : undefined}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-[3px] px-3 py-1.5 text-[12px] font-bold transition focus-ring ${
        active ? "bg-navy-850 text-white" : "border border-line bg-surface text-muted hover:border-gold-500"
      }`}
    >
      {label} <span className="num opacity-70">({failed ? "—" : count ?? 0})</span>
    </Link>
  );

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-4">
        <div>
          <p className="eyebrow mb-1">{tr("live.eyebrow")}</p>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{tr("live.heading")}</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="text-[12px] text-muted">
            <span className="num font-bold text-live">{liveItems.length}</span> {tr("live.countLive")} · {scopeLabel}
            {" · "}
            <span className="num font-bold text-gold-500">{streamsLiveNow}</span> {tr("live.countStreams")}
            {streamsSoon > 0 ? (
              <>
                {" "}
                (+<span className="num font-bold">{streamsSoon}</span> {tr("live.countSoon")})
              </>
            ) : null}
          </p>
          <LiveAutoRefresh intervalSeconds={60} />
        </div>
      </header>

      <nav aria-label={tr("live.filterAria")} className="mb-6 flex flex-wrap gap-2">
        {chip("/live", tr("live.allSports"), board.total, scope.length === LIVE_SPORT_SLUGS.length, !board.complete && board.total === 0)}
        {PUBLIC_SPORTS.map((s) => {
          const b = board.boards.find((x) => x.sport === s.slug);
          return chip(`/live?sport=${s.slug}`, `${s.icon} ${sportName(locale, s.slug)}`, board.bySport[s.slug] ?? 0, scope.length === 1 && scope[0] === s.slug, !b?.ok);
        })}
      </nav>

      {/* Playable broadcasts only (live, or inside their window) */}
      <LiveStreams cards={playableStreams} locale={locale} />

      {/* Live matches section */}
      {liveItems.length > 0 ? (
        <section aria-label={tr("live.liveSectionAria")} className="mb-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-live">
              <span className="live-dot !bg-live-red" aria-hidden />
              <span>
                {tr("live.liveHeading", { n: liveItems.length })} · {scopeLabel}
              </span>
            </h2>
            {scopeFailed.length > 0 ? (
              <p role="status" className="text-[11px] font-bold text-warn-600 dark:text-warn-400">
                {tr("live.scopeFailed", { list: scopeFailed.join(locale === "ar" ? "، " : ", ") })}
              </p>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {liveItems.map((match) => (
              <LiveMatchCard key={match.id} match={match} now={now} />
            ))}
          </div>
        </section>
      ) : scopeAnswered ? (
        <div className="mb-8 rounded-[6px] border border-line bg-navy-850/40 p-4 text-center">
          <p className="text-[13px] font-bold text-muted">{tr("live.noLive", { scope: scopeLabel })}</p>
          <p className="mt-1 text-[11px] text-muted">
            {scopeFailed.length > 0 ? `${tr("live.scopeFailedInline", { list: scopeFailed.join(locale === "ar" ? "، " : ", ") })} ` : ""}
            {tr("live.autoAppears")}{" "}
            <Link href="/matches?date=today" className="font-bold text-gold-600 dark:text-gold-400">{tr("live.todayMatches")}</Link>
          </p>
        </div>
      ) : (
        <DataUnavailable
          title={tr("live.unavailableTitle")}
          message={tr("live.unavailableMessage")}
          actionHref="/matches?date=today"
          actionLabel={tr("live.todayMatches")}
        />
      )}

      {upcomingItems.length > 0 ? (
        <section aria-label={tr("live.upcomingAria")} className="mb-10">
          <div className="mb-4 flex items-center justify-between border-b border-line pb-2">
            <h2 className="text-base font-extrabold text-ink">{tr("live.upcomingHeading", { n: upcomingItems.length })}</h2>
            <span className="text-[12px] text-muted">{tr("live.tzNote")}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingItems.map((match) => (
              <LiveMatchCard key={match.id} match={match} now={now} />
            ))}
          </div>
        </section>
      ) : null}

      {finishedItems.length > 0 ? (
        <section aria-label={tr("live.finishedAria")} className="mb-10">
          <div className="mb-4 flex items-center justify-between border-b border-line pb-2">
            <h2 className="text-base font-extrabold text-muted">{tr("live.finishedHeading", { n: finishedItems.length })}</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {finishedItems.map((match) => (
              <LiveMatchCard key={match.id} match={match} now={now} />
            ))}
          </div>
        </section>
      ) : null}

      {interruptedItems.length > 0 ? (
        <section aria-label={tr("live.interruptedAria")} className="mb-10">
          <div className="mb-4 flex items-center justify-between border-b border-line pb-2">
            <h2 className="text-base font-extrabold text-muted">{tr("live.interruptedHeading", { n: interruptedItems.length })}</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {interruptedItems.map((match) => (
              <div key={match.id}>
                <LiveMatchCard match={match} now={now} />
                <p className="mt-1 text-[11px] font-bold text-muted">{matchStateLabel(locale, stateOf(match))}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Kickoff day passed and the stored status was never refreshed. Neither
          upcoming nor finished as far as we can verify — labelled as such, and
          their broadcasts are never offered as playable. */}
      {unconfirmedItems.length > 0 ? (
        <section aria-label={tr("live.unconfirmedAria")} className="mb-10">
          <div className="mb-4 flex items-center justify-between border-b border-line pb-2">
            <h2 className="text-base font-extrabold text-muted">{tr("live.unconfirmedHeading", { n: unconfirmedItems.length })}</h2>
          </div>
          <p className="mb-3 text-[12px] leading-6 text-muted">{t(locale, "state.unconfirmedNote")}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {unconfirmedItems.map((match) => (
              <LiveMatchCard key={match.id} match={match} now={now} />
            ))}
          </div>
        </section>
      ) : null}

      {nothingAtAll && scopeAnswered ? (
        <DataUnavailable
          title={tr("live.emptyTitle")}
          message={tr("live.emptyMessage")}
          actionHref="/fixtures"
          actionLabel={tr("live.reviewSchedule")}
        />
      ) : null}

      <DataSourceNote
        className="mt-6 border-t border-line pt-4"
        provider={board.providers[0] ?? "admin"}
        fromCache={board.fromCache}
        stale={board.stale}
        degraded={board.degraded || !board.ok}
        // Never invent an update time: the oldest live snapshot used, or the
        // newest editorial touch when no live source answered.
        fetchedAt={board.fetchedAt ?? lastEditorialUpdate}
      />
    </div>
  );
}
