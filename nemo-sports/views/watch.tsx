import type { Metadata } from "next";
import DataUnavailable from "@/components/ui/DataUnavailable";
import Link from "@/components/i18n/Link";
import Crest from "@/components/ui/Crest";
import SectionHead from "@/components/ui/SectionHead";
import { allMatches, broadcastPartners } from "@/lib/data";
import { competitionBySlug, teamBySlug } from "@/lib/core-data";
import { dateAr, timeOf } from "@/lib/format";
import { listBroadcasters } from "@/lib/broadcasts";
import { judgedStreams, type PublicStreamCard } from "@/lib/public-streams";
import { broadcastBadgeKey, broadcastNoticeKey } from "@/lib/i18n/broadcast";
import { t } from "@/lib/i18n/translate";
import { localeAlternates } from "@/lib/i18n/metadata";
import { formatDate, formatTime } from "@/lib/i18n/dates";
import { demoContentVisible } from "@/lib/site";
import type { Locale } from "@/lib/i18n/locales";

export type ViewProps = Record<string, never>;


export function generateMetadata(locale: Locale, _props: ViewProps = {} as ViewProps): Metadata {
  return {
  title: t(locale, "watch.metaTitle"),
  description: t(locale, "watch.metaDescription"),
  alternates: localeAlternates(locale, "/watch"),
};
}

export const revalidate = 60;

/* ── live registry → schedule rows ────────────────────────────── */

type StreamRow = {
  key: string;
  slug: string | null;
  home: string;
  away: string;
  competition: string | null;
  kickoff: string | null;
  group: "live" | "upcoming" | "inactive" | "unlinked";
  badge: string;
  note: string;
};

/**
 * One APPROVED stream (operator approval + rights evidence) joined with its
 * match and judged by the broadcast lifecycle (lib/broadcast-state.ts) — the
 * same verdict the match page, /live and the live cards use, so the Watch
 * Guide can no longer say "ended" while another surface offers a watch action.
 */
function rowOf(locale: Locale, card: PublicStreamCard): StreamRow {
  const slug = card.stream.matchSlug || card.stream.slugs[0] || null;
  const group: StreamRow["group"] = !card.fixture
    ? card.verdict.playable ? "upcoming" : "unlinked"
    : card.verdict.state === "live"
      ? "live"
      : card.verdict.state === "standby"
        ? "upcoming"
        : "inactive";
  return {
    key: card.stream.id,
    slug,
    home: card.home,
    away: card.away,
    competition: card.competition || null,
    kickoff: card.kickoff,
    group,
    badge: group === "unlinked" ? t(locale, "watch.badgeUnlinked") : t(locale, broadcastBadgeKey(card.verdict)),
    note: t(locale, broadcastNoticeKey(card.verdict.noticeAr, card.verdict.matchState)),
  };
}

/* ── page ─────────────────────────────────────────────────────── */

export default async function WatchPage({ locale }: { locale: Locale }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const [broadcasters, judged] = await Promise.all([listBroadcasters(false), judgedStreams(48).catch(() => [] as PublicStreamCard[])]);

  // Dev/preview only: the legacy static schedule renders when the live
  // registry is empty. Production never takes this branch with real data.
  if (demoContentVisible() && broadcasters.length === 0 && judged.length === 0) {
    return <LegacyDemoWatch locale={locale} />;
  }

  const rows = judged.map((card) => rowOf(locale, card));
  const live = rows.filter((r) => r.group === "live");
  const soon = rows.filter((r) => r.group === "upcoming");
  const done = rows.filter((r) => r.group === "inactive");
  const unlinked = rows.filter((r) => r.group === "unlinked");

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">{tr("watch.eyebrow")}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{tr("watch.heading")}</h1>
        </div>
        <p className="text-[12px] text-muted">
          <span className="num font-bold">{live.length}</span> {tr("watch.countsLive")} · <span className="num font-bold">{soon.length}</span> {tr("watch.countsSoon")} ·{" "}
          <span className="num font-bold">{rows.length}</span> {tr("watch.countsLogged")} · <span className="num font-bold">{broadcasters.length}</span> {tr("watch.countsBroadcasters")}
        </p>
      </header>

      {rows.length === 0 ? (
        <DataUnavailable
          title={tr("watch.emptyTitle")}
          message={tr("watch.emptyMessage")}
        />
      ) : null}

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        {[
          { icon: "✅", title: tr("watch.pledge1Title"), text: tr("watch.pledge1Text") },
          { icon: "🚫", title: tr("watch.pledge2Title"), text: tr("watch.pledge2Text") },
          { icon: "🌍", title: tr("watch.pledge3Title"), text: tr("watch.pledge3Text") },
        ].map((c) => (
          <div key={c.title} className="card p-4">
            <p className="text-lg" aria-hidden>{c.icon}</p>
            <h2 className="mt-1 text-[13px] font-extrabold">{c.title}</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">{c.text}</p>
          </div>
        ))}
      </div>

      {live.length > 0 ? <StreamSchedule locale={locale} title={tr("watch.liveNow")} list={live} tone="live" /> : null}
      {soon.length > 0 ? <StreamSchedule locale={locale} title={tr("watch.startsSoon")} list={soon} tone="soon" /> : null}
      {unlinked.length > 0 ? <StreamSchedule locale={locale} title={tr("watch.unlinkedLogged")} list={unlinked} tone="unlinked" /> : null}
      {done.length > 0 ? <StreamSchedule locale={locale} title={tr("watch.outsideWindow")} list={done} tone="done" /> : null}

      <section className="mt-10">
        <SectionHead eyebrow={tr("watch.broadcasterEyebrow")} title={tr("watch.broadcasterTitle")} href="/broadcast-rights" linkLabel={tr("watch.rightsPolicy")} />
        {broadcasters.length === 0 ? (
          <DataUnavailable
            title={tr("watch.noBroadcastersTitle")}
            message={tr("watch.noBroadcastersMessage")}
          />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-line bg-navy-850/[0.04] text-muted dark:bg-white/[0.04]">
                  <th className="px-3 py-2.5 text-start font-semibold">{tr("watch.thBroadcaster")}</th>
                  <th className="px-3 py-2.5 text-start font-semibold">{tr("watch.thPlatform")}</th>
                  <th className="px-3 py-2.5 text-start font-semibold">{tr("watch.thCompetition")}</th>
                  <th className="px-3 py-2.5 text-start font-semibold">{tr("watch.thRegions")}</th>
                  <th className="px-3 py-2.5 text-start font-semibold">{tr("watch.thAccess")}</th>
                  <th className="num px-3 py-2.5 font-semibold">{tr("watch.thLastUpdate")}</th>
                </tr>
              </thead>
              <tbody>
                {broadcasters.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0 hover:bg-navy-850/[0.03] dark:hover:bg-white/[0.04]">
                    <td className="px-3 py-2.5 font-bold"><a href={p.broadcastWebsite} target="_blank" rel="noopener noreferrer" className="underline">{p.broadcasterName}</a></td>
                    <td className="px-3 py-2.5 text-muted">{p.platform}</td>
                    <td className="px-3 py-2.5 text-muted">{p.competitionName}</td>
                    <td className="px-3 py-2.5 text-muted">{p.regions.length > 0 ? p.regions.join(locale === "ar" ? "، " : ", ") : "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-[3px] px-2 py-0.5 text-[10px] font-extrabold ${p.freeAccess ? "bg-win/15 text-win" : "bg-gold-500/15 text-gold-600 dark:text-gold-400"}`}>
                        {p.platform === "Website" ? tr("watch.accessGuide") : p.freeAccess ? tr("watch.accessFree") : p.requiresSubscription ? tr("watch.accessSubscription") : tr("common.unknown")}
                      </span>
                    </td>
                    <td className="num px-3 py-2.5 text-center text-muted">{formatDate(locale, p.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          {tr("watch.registryNote")}
        </p>
      </section>
    </div>
  );
}

function StreamSchedule({
  locale,
  title,
  list,
  tone,
}: {
  locale: Locale;
  title: string;
  list: StreamRow[];
  tone: "live" | "soon" | "done" | "unlinked";
}) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const badge =
    tone === "live"
      ? "bg-live text-white"
      : tone === "soon"
        ? "bg-gold-500 text-navy-900"
        : "bg-navy-850/10 text-muted";

  return (
    <section className="mb-8">
      <SectionHead
        eyebrow={tone === "live" ? tr("watch.toneLive") : tone === "soon" ? tr("watch.toneSoon") : tone === "unlinked" ? tr("watch.toneLogged") : tr("watch.toneArchived")}
        title={title}
      />
      <ul className="space-y-2">
        {list.map((r) => {
          const inner = (
            <>
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="truncate text-[13px] font-bold">{r.home}</span>
                <span className="text-[11px] text-muted">×</span>
                <span className="truncate text-[13px] font-bold">{r.away}</span>
              </span>

              <span className="hidden text-[11px] text-muted sm:block">
                {r.competition ?? "—"}
                {r.kickoff ? ` · ${formatDate(locale, r.kickoff)}` : ""}
              </span>

              <span className="flex items-center justify-end gap-2">
                {r.kickoff ? <span className="num text-[12px] font-extrabold">{formatTime(locale, r.kickoff)}</span> : null}
                <span className={`rounded-[3px] px-2 py-1 text-[10px] font-extrabold ${badge}`} title={r.note}>
                  {r.badge}
                </span>
              </span>
            </>
          );
          const cls =
            "card grid grid-cols-[1fr_auto] items-center gap-3 p-3 transition hover:border-gold-500/50 sm:grid-cols-[1fr_220px_auto]";
          return (
            <li key={r.key}>
              {r.slug ? (
                <Link href={tone === "live" || tone === "soon" ? `/matches/${r.slug}#live-stream` : `/matches/${r.slug}`} className={cls}>
                  {inner}
                </Link>
              ) : (
                <div className={cls}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── legacy static schedule: dev/preview design QA only ───────────── */

function LegacyDemoWatch({ locale }: { locale: Locale }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const broadcastable = allMatches
    .filter((m) => m.broadcast)
    .sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff));

  const live = broadcastable.filter((m) => m.broadcast?.status === "LIVE_NOW");
  const soon = broadcastable.filter((m) => m.broadcast?.status === "COMING_SOON");
  const done = broadcastable.filter((m) => m.broadcast?.status === "FINISHED");

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">{tr("watch.eyebrow")}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{tr("watch.heading")}</h1>
        </div>
        <p className="text-[12px] text-muted">
          <span className="num font-bold">{broadcastable.length}</span> {tr("watch.demoCount")}
        </p>
      </header>
      <p className="mb-6 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[11px] font-semibold text-muted">{tr("watch.demoNotice")}</p>

      {broadcastable.length === 0 ? (
        <DataUnavailable
          title={tr("watch.demoEmptyTitle")}
          message={tr("watch.demoEmptyMessage")}
        />
      ) : null}

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        {[
          { icon: "✅", title: tr("watch.pledge1Title"), text: tr("watch.pledge1Text") },
          { icon: "🚫", title: tr("watch.pledge2Title"), text: tr("watch.pledge2Text") },
          { icon: "🌍", title: tr("watch.pledge3Title"), text: tr("watch.pledge3Text") },
        ].map((c) => (
          <div key={c.title} className="card p-4">
            <p className="text-lg" aria-hidden>{c.icon}</p>
            <h2 className="mt-1 text-[13px] font-extrabold">{c.title}</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">{c.text}</p>
          </div>
        ))}
      </div>

      {live.length > 0 ? <Schedule locale={locale} title={tr("watch.liveNow")} list={live} tone="live" /> : null}
      {soon.length > 0 ? <Schedule locale={locale} title={tr("watch.startsSoon")} list={soon} tone="soon" /> : null}
      {done.length > 0 ? <Schedule locale={locale} title={tr("watch.broadcastEnded")} list={done} tone="done" /> : null}

      <section className="mt-10">
        <SectionHead eyebrow={tr("watch.broadcasterEyebrow")} title={tr("watch.broadcasterTitle")} href="/broadcast-rights" linkLabel={tr("watch.rightsPolicy")} />
        <div className="card overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-line bg-navy-850/[0.04] text-muted dark:bg-white/[0.04]">
                <th className="px-3 py-2.5 text-start font-semibold">{tr("watch.thBroadcaster")}</th>
                <th className="px-3 py-2.5 text-start font-semibold">{tr("watch.thType")}</th>
                <th className="px-3 py-2.5 text-start font-semibold">{tr("watch.thLicense")}</th>
                <th className="px-3 py-2.5 text-start font-semibold">{tr("watch.thRegions")}</th>
                <th className="px-3 py-2.5 text-start font-semibold">{tr("watch.thStatus")}</th>
                <th className="num px-3 py-2.5 font-semibold">{tr("watch.thLastVerified")}</th>
              </tr>
            </thead>
            <tbody>
              {broadcastPartners.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-navy-850/[0.03] dark:hover:bg-white/[0.04]">
                  <td className="px-3 py-2.5 font-bold">{p.name}</td>
                  <td className="px-3 py-2.5 text-muted">{p.type}</td>
                  <td className="px-3 py-2.5">{p.licenseType === "embed" ? tr("watch.licenseEmbed") : tr("watch.licenseExternal")}</td>
                  <td className="px-3 py-2.5 text-muted">{p.regions.join(locale === "ar" ? "، " : ", ")}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-[3px] px-2 py-0.5 text-[10px] font-extrabold ${
                        p.status === "approved"
                          ? "bg-win/15 text-win"
                          : p.status === "pending"
                            ? "bg-warn/15 text-warn"
                            : "bg-live/15 text-live"
                      }`}
                    >
                      {p.status === "approved" ? tr("watch.statusApproved") : p.status === "pending" ? tr("watch.statusPending") : tr("watch.statusRejected")}
                    </span>
                  </td>
                  <td className="num px-3 py-2.5 text-center text-muted">{p.verifiedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          {tr("watch.registryNote")}
        </p>
      </section>
    </div>
  );
}

function Schedule({
  locale,
  title,
  list,
  tone,
}: {
  locale: Locale;
  title: string;
  list: typeof allMatches;
  tone: "live" | "soon" | "done";
}) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const badge =
    tone === "live" ? "bg-live text-white" : tone === "soon" ? "bg-gold-500 text-navy-900" : "bg-navy-850/10 text-muted";

  return (
    <section className="mb-8">
      <SectionHead eyebrow={tone === "live" ? tr("watch.toneLive") : tone === "soon" ? tr("watch.toneSoon") : tr("watch.toneReplay")} title={title} />
      <ul className="space-y-2">
        {list.map((m) => (
          <li key={m.id}>
            <Link
              href={`/matches/${m.slug}#broadcast`}
              className="card grid grid-cols-[1fr_auto] items-center gap-3 p-3 transition hover:border-gold-500/50 sm:grid-cols-[1fr_220px_auto]"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Crest slug={m.home} size={26} />
                <span className="truncate text-[13px] font-bold">{teamBySlug(m.home)?.name}</span>
                <span className="text-[11px] text-muted">×</span>
                <span className="truncate text-[13px] font-bold">{teamBySlug(m.away)?.name}</span>
                <Crest slug={m.away} size={26} />
              </span>

              <span className="hidden text-[11px] text-muted sm:block">
                {competitionBySlug(m.competition)?.name} · {formatDate(locale, m.kickoff)}
              </span>

              <span className="flex items-center justify-end gap-2">
                <span className="text-[11px] font-bold text-muted">{m.broadcast?.provider}</span>
                <span className="num text-[12px] font-extrabold">{formatTime(locale, m.kickoff)}</span>
                <span className={`rounded-[3px] px-2 py-1 text-[10px] font-extrabold ${badge}`}>
                  {tone === "live" ? tr("watch.toneLive") : tone === "soon" ? tr("watch.toneSoonShort") : tr("watch.toneEnded")}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
