import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Tabs from "@/components/ui/Tabs";
import Crest from "@/components/ui/Crest";
import NewsCard from "@/components/news/NewsCard";
import { articles, teamMatches } from "@/lib/data";
import { competitionBySlug, playerBySlug, players, teamBySlug } from "@/lib/core-data";
import { age } from "@/lib/format";
import DataSourceNote from "@/components/data/DataSourceNote";
import { providerLabel } from "@/lib/i18n/data-source";
import { t } from "@/lib/i18n/translate";
import { localeAlternates } from "@/lib/i18n/metadata";
import { playerStats as sdlPlayerStats, PERMANENT_FAILURE_KINDS } from "@/lib/sdl-gateway";
import { demoContentVisible } from "@/lib/site";
import { getAdminPlayerBySlug } from "@/lib/admin-players";
import { AdminPlayerDetail } from "@/components/public/AdminPublished";
import { decodeSlug } from "@/lib/slug";
import type { Locale } from "@/lib/i18n/locales";

export type ViewProps = { params: Promise<{ slug: string }> };


export const revalidate = 1800;

function realPlayerDisplayName(name: string | null | undefined): string {
  return name?.trim() || "";
}

/** Maps an SDL `extra` field to a message key (values are translated at render). */
const EXTRA_STAT_LABELS: Record<string, string> = {
  penalties: "player.stat.penalties",
  position: "player.stat.position",
  ratingRaw: "player.stat.ratingRaw",
  shots: "player.stat.shots",
  shotsOnTarget: "player.stat.shotsOnTarget",
  dribbles: "player.stat.dribbles",
  keyPasses: "player.stat.keyPasses",
};

export function generateStaticParams() {
  // demo players are prerendered for dev/preview only; real provider players
  // (e.g. /players/erling-haaland from SportScore slugs) render on demand.
  return demoContentVisible() ? players.map((p) => ({ slug: p.slug })) : [];
}

async function playerMetadataBody(locale: Locale, {
  params,
}: ViewProps): Promise<Metadata> {
  const tr = (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);
  const { slug } = await params;

  // real provider player first (SportScore slugs, e.g. "erling-haaland")
  const real = await sdlPlayerStats("football", slug);
  if (real.ok && real.source === "provider") {
    const team = String(real.data.extra.team ?? "");
    const name = realPlayerDisplayName(real.data.playerName);
    const scope = real.data.seasonName ? tr("player.scopeSeason", { season: real.data.seasonName }) : tr("player.scopeSource");
    const hasRealName = Boolean(real.data.playerName?.trim());
    return {
      title: `${name}${team ? ` | ${team}` : ""} | ${tr("player.metaTitleSuffix")}`,
      description: t(locale, "players.metaStats", { name, scope, provider: providerLabel(locale, real.provider) }),
      alternates: localeAlternates(locale, `/players/${slug}`),
      ...(!hasRealName ? { robots: { index: false, follow: true } } : {}),
    };
  }

  const p = demoContentVisible() ? playerBySlug(slug) : undefined;
  // Explicit robots so the 404 emits one directive, not the layout's
  // `index, follow` stacked on Next.js's built-in not-found `noindex`.
  if (!p) return { title: tr("player.notFound"), robots: { index: false, follow: true } };

  const playerTeam = teamBySlug(p.team);
  return {
    title: `${p.name} | ${playerTeam?.name ?? p.position} | ${tr("player.metaTitleSuffix")}`,
    description: tr("player.demoMetaDescription", { name: p.name }),
    alternates: localeAlternates(locale, `/players/${p.slug}`),
  };
}

async function PlayerPageBody({ locale, params }: ViewProps & { locale: Locale }) {
  const tr = (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);
  const { slug } = await params;

  /* ══ 1) real provider player (SportScore) ══ */
  const real = await sdlPlayerStats("football", slug);
  if (!real.ok && !PERMANENT_FAILURE_KINDS.has(real.error.kind)) {
    // Transient outage only: abort the render so ISR keeps the last good page
    // and an outage can never write a permanent 404 into the ISR cache.
    //
    // PERMANENT failures fall through to the honest notFound() below. This
    // used to rethrow on `no_provider_configured`, so every unknown player
    // slug answered HTTP 500 on a deployment with no stats provider — a
    // condition retrying can never change. app/matches/[slug] already reasoned
    // its way to the same conclusion in a comment; the two sibling pages were
    // simply inconsistent.
    throw new Error(`player_stats_unavailable:${real.error.kind}`);
  }
  if (real.ok && real.source === "provider") {
    const s = real.data;
    const name = realPlayerDisplayName(s.playerName);
    const statsHeading = s.seasonName ? tr("player.statsSeason", { season: s.seasonName }) : tr("player.statsFromSource");
    const statCells: { label: string; value: string }[] = [
      { label: tr("player.stat.appearances"), value: s.appearances !== null ? String(s.appearances) : "—" },
      { label: tr("player.stat.goals"), value: s.goals !== null ? String(s.goals) : "—" },
      { label: tr("player.stat.assists"), value: s.assists !== null ? String(s.assists) : "—" },
      { label: tr("player.stat.minutes"), value: s.minutes !== null ? String(s.minutes) : "—" },
      { label: tr("player.stat.yellows"), value: s.yellowCards !== null ? String(s.yellowCards) : "—" },
      { label: tr("player.stat.reds"), value: s.redCards !== null ? String(s.redCards) : "—" },
    ];
    const extraEntries = Object.entries(s.extra).flatMap(([key, value]) => {
      const labelKey = EXTRA_STAT_LABELS[key];
      if (!labelKey || (typeof value !== "string" && typeof value !== "number")) return [];
      if ((typeof value === "string" && !value.trim()) || (typeof value === "number" && !Number.isFinite(value))) return [];
      return [{ key, label: tr(labelKey), value: String(value) }];
    });
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <nav aria-label={tr("player.breadcrumbAria")} className="mb-4 text-[11px] text-muted">
          <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">{tr("player.home")}</Link>
          <span aria-hidden> / </span>
          <Link href="/standings" className="hover:text-gold-600 dark:hover:text-gold-400">{tr("player.scorers")}</Link>
          <span aria-hidden> / </span>
          <span className="font-semibold text-ink capitalize">{name}</span>
        </nav>

        <header className="card mb-6 flex flex-wrap items-center gap-5 px-5 py-6">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-navy-900 text-xl font-extrabold text-gold-400" aria-hidden>
            {name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold capitalize">{name}</h1>
            <p className="mt-1 text-[12.5px] text-muted">
              {String(s.extra.team ?? "—")}
              {s.extra.competition ? ` · ${String(s.extra.competition)}` : ""}
            </p>
          </div>
        </header>

        <section aria-label={statsHeading}>
          <h2 className="mb-3 border-b-2 border-line pb-2 text-[15px] font-extrabold">{statsHeading}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {statCells.map((c) => (
              <div key={c.label} className="card px-3 py-4 text-center">
                <p className="num text-2xl font-extrabold text-gold-600 dark:text-gold-400">{c.value}</p>
                <p className="mt-1 text-[11px] text-muted">{c.label}</p>
              </div>
            ))}
          </div>
        </section>

        {extraEntries.length > 0 ? (
          <section className="mt-8" aria-label={tr("player.extraStatsAria")}>
            <h2 className="mb-3 border-b-2 border-line pb-2 text-[15px] font-extrabold">{tr("player.extraDetails")}</h2>
            <div className="card grid grid-cols-2 gap-px overflow-hidden sm:grid-cols-4">
              {extraEntries.map((entry) => (
                <div key={entry.key} className="bg-surface px-3 py-3">
                  <p className="num text-[15px] font-extrabold">{entry.value}</p>
                  <p className="text-[10.5px] text-muted">{entry.label}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <DataSourceNote className="mt-8 border-t border-line pt-4" provider={real.provider} fromCache={real.fromCache} stale={real.stale} fetchedAt={real.fetchedAt} />
      </div>
    );
  }

  /* ══ 2) development/demo player ══ */
  const player = demoContentVisible() ? playerBySlug(slug) : undefined;
  if (!player) {
    // honest 404: real player pages come from real provider slugs only
    notFound();
  }

  const team = teamBySlug(player.team);
  const comp = competitionBySlug(player.competition);
  const matches = teamMatches(player.team).slice(0, 12);
  const news = articles.filter((a) => a.players?.includes(player.slug)).slice(0, 6);

  const peers = players
    .filter((p) => p.slug !== player.slug && p.competition === player.competition && p.positionGroup === player.positionGroup)
    .slice(0, 3);

  const facts = [
    { k: tr("player.fullName"), v: player.nameEn },
    { k: t(locale, "players.birthDate"), v: tr("player.birthWithAge", { date: player.birth, age: age(player.birth) }) },
    { k: t(locale, "players.nationality"), v: `${player.flag} ${player.nationality}` },
    { k: tr("player.currentTeam"), v: team?.name ?? player.team },
    { k: t(locale, "players.position"), v: player.position },
    { k: tr("player.shirtNumber"), v: player.number ? String(player.number) : "—" },
    { k: "Height", v: player.height ? tr("player.heightCm", { value: player.height }) : "—" },
    { k: "Weight", v: player.weight ? tr("player.weightKg", { value: player.weight }) : "—" },
    { k: tr("player.preferredFoot"), v: player.foot ?? "—" },
  ];

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <nav aria-label={tr("player.breadcrumbAria")} className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">{tr("player.home")}</Link>
        <span aria-hidden>/</span>
        <Link href="/players" className="hover:text-gold-600 dark:hover:text-gold-400">{tr("player.players")}</Link>
        <span aria-hidden>/</span>
        <span className="font-semibold text-ink">{player.name}</span>
      </nav>

      <p className="mb-4 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[11px] font-semibold text-muted">{tr("player.demoNotice")}</p>
      <header className="stripes mb-6 overflow-hidden rounded-[8px] border border-navy-700 bg-navy-850 text-white">
        <div className="flex flex-wrap items-center gap-5 px-5 py-6">
          <span className="grid h-24 w-24 shrink-0 place-items-center rounded-[6px] border border-white/10 bg-white/5">
            {team ? <Crest slug={team.slug} size={64} /> : <span className="text-3xl" aria-hidden>👤</span>}
          </span>
          <div className="min-w-0">
            <p className="eyebrow !text-white/50">{comp?.nameEn ?? player.sport}</p>
            <h1 className="text-2xl font-extrabold tracking-tight">{player.name}</h1>
            <p className="mt-1 text-[12px] text-white/65">
              {player.nameEn} · {player.position} · {player.flag} {player.nationality}
            </p>
            {team ? (
              <Link href={`/teams/${team.slug}`} className="mt-2 inline-block rounded-[3px] bg-white/10 px-3 py-1.5 text-[11px] font-bold transition hover:bg-gold-500 hover:text-navy-900">
                {team.name} ←
              </Link>
            ) : null}
          </div>

          <dl className="ms-auto flex flex-wrap gap-6 text-center">
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">{tr("player.cardMatches")}</dt>
              <dd className="num text-xl font-extrabold">{player.seasonApps}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">{tr("player.cardGoals")}</dt>
              <dd className="num text-xl font-extrabold text-gold-400">{player.seasonGoals}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">{tr("player.cardAssists")}</dt>
              <dd className="num text-xl font-extrabold">{player.seasonAssists}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">{tr("player.cardMinutes")}</dt>
              <dd className="num text-xl font-extrabold">{player.minutes}</dd>
            </div>
          </dl>
        </div>
      </header>

      <Tabs
        label={tr("player.tabsLabel")}
        items={[
          {
            id: "overview",
            label: tr("player.tabOverview"),
            content: (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="card p-5">
                  <h2 className="mb-2 text-[14px] font-extrabold">{tr("player.aboutHeading")}</h2>
                  <p className="text-[13px] leading-relaxed text-muted">{player.bio}</p>
                  <h2 className="mt-5 mb-2 text-[14px] font-extrabold">{tr("player.seasonNumbers")}</h2>
                  <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { k: tr("player.cardMatches"), v: player.seasonApps },
                      { k: tr("player.cardGoals"), v: player.seasonGoals },
                      { k: tr("player.cardAssists"), v: player.seasonAssists },
                      { k: tr("player.stat.yellows"), v: player.yellows },
                    ].map((s) => (
                      <div key={s.k} className="rounded-[3px] bg-navy-850/[0.04] px-3 py-2.5 dark:bg-white/[0.05]">
                        <dt className="text-[10px] text-muted">{s.k}</dt>
                        <dd className="num text-lg font-extrabold">{s.v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="card overflow-hidden">
                  <h2 className="border-b border-line bg-navy-850 px-3 py-2.5 text-[13px] font-extrabold text-white">
                    {tr("player.idCard")}
                  </h2>
                  <dl className="divide-y divide-line">
                    {facts.map((f) => (
                      <div key={f.k} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[12px]">
                        <dt className="text-muted">{f.k}</dt>
                        <dd className="num text-end font-bold">{f.v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            ),
          },
          {
            id: "stats",
            label: tr("player.tabStats"),
            content: (
              <div className="card overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-line bg-navy-850/[0.04] text-muted dark:bg-white/[0.04]">
                      <th className="px-3 py-2.5 text-start font-semibold">{tr("player.tableSeason")}</th>
                      <th className="px-3 py-2.5 text-start font-semibold">{t(locale, "players.team")}</th>
                      <th className="px-3 py-2.5 text-start font-semibold">{tr("player.tableCompetition")}</th>
                      <th className="num px-3 py-2.5 font-semibold">{tr("player.cardMatches")}</th>
                      <th className="num px-3 py-2.5 font-semibold">{tr("player.cardMinutes")}</th>
                      <th className="num px-3 py-2.5 font-semibold">{tr("player.cardGoals")}</th>
                      <th className="num px-3 py-2.5 font-semibold">{tr("player.cardAssists")}</th>
                      <th className="num px-3 py-2.5 font-semibold">🟨</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-line">
                      <td className="px-3 py-2.5 font-bold">{comp?.season ?? "—"}</td>
                      <td className="px-3 py-2.5">{team?.name ?? player.team}</td>
                      <td className="px-3 py-2.5 text-muted">{comp?.name ?? "—"}</td>
                      <td className="num px-3 py-2.5 text-center">{player.seasonApps}</td>
                      <td className="num px-3 py-2.5 text-center">{player.minutes}</td>
                      <td className="num px-3 py-2.5 text-center font-extrabold">{player.seasonGoals}</td>
                      <td className="num px-3 py-2.5 text-center">{player.seasonAssists}</td>
                      <td className="num px-3 py-2.5 text-center">{player.yellows}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="border-t border-line px-3 py-2.5 text-[11px] text-muted">
                  {tr("player.historicalNote")}
                </p>
              </div>
            ),
          },
          {
            id: "matches",
            label: tr("player.tabMatches"),
            content:
              matches.length > 0 ? (
                <ul className="space-y-2">
                  {matches.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/matches/${m.slug}`}
                        className="card flex items-center justify-between gap-3 px-3 py-2.5 text-[12px] transition hover:border-gold-500/50"
                      >
                        <span className="truncate font-bold">
                          {teamBySlug(m.home)?.short} × {teamBySlug(m.away)?.short}
                        </span>
                        <span className="num shrink-0 font-extrabold">
                          {m.status === "UPCOMING" ? "—" : `${m.homeScore}–${m.awayScore}`}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="card px-4 py-10 text-center text-[13px] text-muted">{tr("player.noMatches")}</p>
              ),
          },
          {
            id: "compare",
            label: tr("player.tabCompare"),
            content:
              peers.length > 0 ? (
                <div className="card overflow-hidden">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-line bg-navy-850/[0.04] text-muted dark:bg-white/[0.04]">
                        <th className="px-3 py-2.5 text-start font-semibold">{tr("player.tablePlayer")}</th>
                        <th className="num px-3 py-2.5 font-semibold">{tr("player.cardMatches")}</th>
                        <th className="num px-3 py-2.5 font-semibold">{tr("player.cardGoals")}</th>
                        <th className="num px-3 py-2.5 font-semibold">{tr("player.cardAssists")}</th>
                        <th className="num px-3 py-2.5 font-semibold">{tr("player.contribPerMatch")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[player, ...peers].map((p, i) => (
                        <tr key={p.slug} className={`border-b border-line last:border-0 ${i === 0 ? "bg-gold-500/10 font-bold" : ""}`}>
                          <td className="px-3 py-2.5">
                            <Link href={`/players/${p.slug}`} className="transition hover:text-gold-600 dark:hover:text-gold-400">
                              {p.name}
                            </Link>
                          </td>
                          <td className="num px-3 py-2.5 text-center">{p.seasonApps}</td>
                          <td className="num px-3 py-2.5 text-center">{p.seasonGoals}</td>
                          <td className="num px-3 py-2.5 text-center">{p.seasonAssists}</td>
                          <td className="num px-3 py-2.5 text-center">
                            {((p.seasonGoals + p.seasonAssists) / Math.max(1, p.seasonApps)).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="card px-4 py-10 text-center text-[13px] text-muted">
                  {tr("player.noComparable")}
                </p>
              ),
          },
          {
            id: "news",
            label: tr("player.tabNews"),
            content:
              news.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {news.map((a) => (
                    <NewsCard key={a.slug} article={a} />
                  ))}
                </div>
              ) : (
                <p className="card px-4 py-10 text-center text-[13px] text-muted">{tr("player.noNews")}</p>
              ),
          },
        ]}
      />
    </div>
  );
}

export async function generateMetadata(locale: Locale, { params }: ViewProps): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const p = await getAdminPlayerBySlug(slug);
  if (p?.isPublished) {
    return {
      title: `${p.fullNameAr}${p.teamName ? ` | ${p.teamName}` : ""} | ${t(locale, "player.metaTitleSuffixPlayer")}`,
      description: t(locale, "player.adminMetaDescription", { name: p.fullNameAr, team: p.teamName ? ` — ${p.teamName}` : "" }),
      alternates: localeAlternates(locale, `/players/${slug}`),
    };
  }
  return playerMetadataBody(locale, { params });
}

export default async function PlayerPage({ locale, params }: ViewProps & { locale: Locale }) {
  const { slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const adminPlayer = await getAdminPlayerBySlug(slug);
  if (adminPlayer?.isPublished) return <AdminPlayerDetail player={adminPlayer} locale={locale} />;
  return <PlayerPageBody locale={locale} params={params} />;
}
