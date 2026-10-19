/* ─────────────────────────────────────────────────────────────
   NEMO Sports · admin-published content on public pages
   Server components only. Every entity rendered here comes from the
   admin stores and is shown only when `isPublished` / status = published.
   Empty optional fields are omitted — nothing is invented.
   ───────────────────────────────────────────────────────────── */

import Link from "@/components/i18n/Link";
import SectionHead from "@/components/ui/SectionHead";
import { listAdminTeams, type AdminTeam } from "@/lib/admin-teams";
import { listAdminPlayers, type AdminPlayer } from "@/lib/admin-players";
import { listAdminCompetitions, type AdminCompetition } from "@/lib/admin-competitions";
import { listManualNews, newsParagraphs, type ManualNews } from "@/lib/manual-news";
import { SITE_TZ } from "@/lib/tz";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";
import { formatDate } from "@/lib/i18n/dates";
import { countryName, entityName, sportName } from "@/lib/i18n/names";
import { categoryMeta } from "@/lib/news/categorize";
import { editorialStructuredData } from "@/lib/news/editorial-seo";
import type { EditorialLink } from "@/lib/news/editorial-links";

const tr = (locale: Locale, k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);

/** Admin records carry `nameAr` + optional `nameEn`; never blank, never invented. */
const displayName = (locale: Locale, nameAr: string, nameEn?: string | null) =>
  entityName(locale, { nameAr, nameEn }) || nameAr;

/** News categories are machine values; only the label is translated. */
const categoryLabel = (locale: Locale, category: string) => {
  const meta = categoryMeta(category);
  return (locale === "ar" ? meta.nameAr : meta.nameEn) || category;
};
const cardCls = "card flex items-center gap-3 p-4 transition hover:border-gold-500/50";

function Logo({ url, alt }: { url: string; alt: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} width={40} height={40} loading="lazy" className="h-10 w-10 shrink-0 object-contain" />
  ) : (
    <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-[4px] bg-navy-850 text-[11px] font-extrabold text-gold-400">
      {alt.slice(0, 2)}
    </span>
  );
}

/* ── listing sections ───────────────────────────────────────── */

export async function AdminTeamsSection({ locale }: { locale: Locale }) {
  const teams = await listAdminTeams({ publishedOnly: true, limit: 60 });
  if (teams.length === 0) return null;
  return (
    <section className="mx-auto mb-8 max-w-[1280px] px-4">
      <SectionHead eyebrow={tr(locale, "ap.eyebrowAdmin")} title={tr(locale, "ap.teamsTitle")} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((team: AdminTeam) => (
          <li key={team.id}>
            <Link href={`/teams/${encodeURIComponent(team.slug)}`} className={cardCls}>
              <Logo url={team.logoUrl} alt={displayName(locale, team.nameAr, team.nameEn)} />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-bold">{displayName(locale, team.nameAr, team.nameEn)}</span>
                <span className="block truncate text-[11px] text-muted">{[countryName(locale, team.country), team.stadium].filter(Boolean).join(" · ") || "—"}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export async function AdminPlayersSection({ locale }: { locale: Locale }) {
  const players = await listAdminPlayers({ publishedOnly: true, limit: 60 });
  if (players.length === 0) return null;
  return (
    <section className="mx-auto mb-8 max-w-[1280px] px-4">
      <SectionHead eyebrow={tr(locale, "ap.eyebrowAdmin")} title={tr(locale, "ap.playersTitle")} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {players.map((p: AdminPlayer) => (
          <li key={p.id}>
            <Link href={`/players/${encodeURIComponent(p.slug)}`} className={cardCls}>
              <Logo url={p.photoUrl} alt={displayName(locale, p.fullNameAr, p.fullNameEn)} />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-bold">{displayName(locale, p.fullNameAr, p.fullNameEn)}</span>
                <span className="block truncate text-[11px] text-muted">{[p.teamName, p.position].filter(Boolean).join(" · ") || "—"}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export async function AdminCompetitionsSection({ locale }: { locale: Locale }) {
  const items = await listAdminCompetitions({ publishedOnly: true, limit: 60 });
  if (items.length === 0) return null;
  return (
    <section className="mx-auto mb-8 max-w-[1280px] px-4">
      <SectionHead eyebrow={tr(locale, "ap.eyebrowAdmin")} title={tr(locale, "ap.competitionsTitle")} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c: AdminCompetition) => (
          <li key={c.id}>
            <Link href={`/competitions/${encodeURIComponent(c.slug)}`} className={cardCls}>
              <Logo url={c.logoUrl} alt={displayName(locale, c.nameAr, c.nameEn)} />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-bold">{displayName(locale, c.nameAr, c.nameEn)}</span>
                <span className="block truncate text-[11px] text-muted">{[countryName(locale, c.country), c.season].filter(Boolean).join(" · ") || "—"}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export async function ManualNewsSection({ category, locale }: { category?: string; locale: Locale }) {
  if (category) return null;
  const items = await listManualNews({ publishedOnly: true, limit: 12 });
  if (items.length === 0) return null;
  return (
    <section className="mx-auto mb-8 max-w-[1280px] px-4">
      <SectionHead eyebrow={tr(locale, "ap.eyebrowEditorial")} title={tr(locale, "ap.newsTitle")} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((n) => (
          <li key={n.id}>
            <Link href={`/news/${encodeURIComponent(n.slug)}`} className="card block h-full p-4 transition hover:border-gold-500/50">
              <span className="num block text-[10px] text-muted">{formatDate(locale, n.publishedAt)} · {n.sourceName}</span>
              <span className="mt-1.5 block text-[14px] font-bold leading-snug">{displayName(locale, n.title, n.titleEn)}</span>
              {n.description ? <span className="mt-1.5 line-clamp-2 block text-[12px] text-muted">{n.description}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── detail views ───────────────────────────────────────────── */

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2 text-[13px] last:border-0">
      <span className="text-muted">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

export function AdminTeamDetail({ team, locale }: { team: AdminTeam; locale: Locale }) {
  const name = displayName(locale, team.nameAr, team.nameEn);
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <nav aria-label={tr(locale, "mt.breadcrumbAria")} className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/" className="hover:text-gold-600">{tr(locale, "mt.home")}</Link><span aria-hidden>/</span>
        <Link href="/teams" className="hover:text-gold-600">{tr(locale, "nav.teams")}</Link><span aria-hidden>/</span>
        <span className="font-semibold text-ink">{name}</span>
      </nav>
      <header className="card flex items-center gap-4 p-5">
        <Logo url={team.logoUrl} alt={name} />
        <div className="min-w-0">
          <p className="eyebrow mb-1">{tr(locale, "ap.teamEyebrow")}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{name}</h1>
          {team.nameEn ? <p className="text-[12px] text-muted" dir="ltr">{team.nameEn}</p> : null}
        </div>
      </header>
      <section className="card mt-6 px-4 py-2">
        <Row label={tr(locale, "ap.country")} value={countryName(locale, team.country)} />
        <Row label={tr(locale, "ap.stadium")} value={team.stadium} />
        <Row label={tr(locale, "ap.coach")} value={team.coach} />
        <Row label={tr(locale, "ap.foundedYear")} value={team.foundedYear} />
        <Row label={tr(locale, "nav.competitions")} value={team.competitionSlug} />
      </section>
    </div>
  );
}

export function AdminPlayerDetail({ player, locale }: { player: AdminPlayer; locale: Locale }) {
  const name = displayName(locale, player.fullNameAr, player.fullNameEn);
  const statEntries = Object.entries(player.stats);
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <nav aria-label={tr(locale, "mt.breadcrumbAria")} className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/" className="hover:text-gold-600">{tr(locale, "mt.home")}</Link><span aria-hidden>/</span>
        <Link href="/players" className="hover:text-gold-600">{tr(locale, "nav.players")}</Link><span aria-hidden>/</span>
        <span className="font-semibold text-ink">{name}</span>
      </nav>
      <header className="card flex items-center gap-4 p-5">
        <Logo url={player.photoUrl} alt={name} />
        <div className="min-w-0">
          <p className="eyebrow mb-1">{tr(locale, "ap.playerEyebrow")}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{name}</h1>
          {player.fullNameEn ? <p className="text-[12px] text-muted" dir="ltr">{player.fullNameEn}</p> : null}
        </div>
      </header>
      <section className="card mt-6 px-4 py-2">
        <Row label={tr(locale, "ap.team")} value={player.teamName} />
        <Row label={tr(locale, "ap.position")} value={player.position} />
        <Row label={tr(locale, "ap.jersey")} value={player.jerseyNumber} />
        <Row label={tr(locale, "ap.nationality")} value={player.nationality} />
        <Row label={tr(locale, "ap.dob")} value={player.dateOfBirth ? formatDate(locale, player.dateOfBirth) : null} />
        <Row label={tr(locale, "ap.heightCm")} value={player.heightCm} />
        <Row label={tr(locale, "ap.weightKg")} value={player.weightKg} />
        {statEntries.map(([k, v]) => (
          <Row key={k} label={k} value={v} />
        ))}
      </section>
    </div>
  );
}

export function AdminCompetitionDetail({ competition, locale }: { competition: AdminCompetition; locale: Locale }) {
  const name = displayName(locale, competition.nameAr, competition.nameEn);
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <nav aria-label={tr(locale, "mt.breadcrumbAria")} className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/" className="hover:text-gold-600">{tr(locale, "mt.home")}</Link><span aria-hidden>/</span>
        <Link href="/competitions" className="hover:text-gold-600">{tr(locale, "nav.competitions")}</Link><span aria-hidden>/</span>
        <span className="font-semibold text-ink">{name}</span>
      </nav>
      <header className="card flex items-center gap-4 p-5">
        <Logo url={competition.logoUrl} alt={name} />
        <div className="min-w-0">
          <p className="eyebrow mb-1">{competition.type}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{name}</h1>
          {competition.nameEn ? <p className="text-[12px] text-muted" dir="ltr">{competition.nameEn}</p> : null}
        </div>
      </header>
      <section className="card mt-6 px-4 py-2">
        <Row label={tr(locale, "ap.countryScope")} value={countryName(locale, competition.country)} />
        <Row label={tr(locale, "ap.season")} value={competition.season} />
        <Row label={tr(locale, "ap.displayTz")} value={SITE_TZ} />
      </section>
    </div>
  );
}

/**
 * A published editorial article, as Google News/Discover reads it:
 *
 *   · NewsArticle structured data (headline, image, datePublished,
 *     dateModified, section, publisher, mainEntityOfPage) — the "article"
 *     signal Discover and the news surfaces look for;
 *   · BreadcrumbList — home → news → headline;
 *   · <time datetime> for the publish date, machine-readable next to the
 *     Arabic label;
 *   · internal links (hub & spoke) resolved to real pages only, plus the
 *     "اقرأ أيضًا" block built from other published articles.
 *
 * Everything rendered here comes from the admin store; nothing is invented. An
 * article whose image or entities are missing simply renders without them.
 */
export function AdminNewsDetail({
  article,
  links = [],
  related = [],
  locale,
}: {
  article: ManualNews;
  links?: EditorialLink[];
  related?: ManualNews[];
  locale: Locale;
}) {
  const paragraphs = newsParagraphs(article.content);
  const headline = displayName(locale, article.title, article.titleEn);
  const section = categoryLabel(locale, article.category);
  const structuredData = editorialStructuredData(article, locale);

  return (
    <article className="mx-auto max-w-[800px] px-4 py-6">
      {structuredData.map((json, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
      ))}

      <nav aria-label={tr(locale, "mt.breadcrumbAria")} className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/" className="hover:text-gold-600">{tr(locale, "mt.home")}</Link><span aria-hidden>/</span>
        <Link href="/news" className="hover:text-gold-600">{tr(locale, "nav.news")}</Link>
        <span aria-hidden>/</span>
        <span className="font-semibold text-ink">{section}</span>
      </nav>

      <p className="num text-[11px] text-muted">
        <time dateTime={article.publishedAt}>{formatDate(locale, article.publishedAt)}</time> · {section}
      </p>
      <h1 className="mt-2 text-2xl font-extrabold leading-snug tracking-tight">{headline}</h1>
      {article.titleEn ? <p className="mt-1 text-[12px] text-muted" dir="ltr">{article.titleEn}</p> : null}
      {article.description ? <p className="mt-3 text-[15px] leading-relaxed text-muted">{article.description}</p> : null}
      {article.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={article.imageUrl} alt={headline} className="mt-5 w-full rounded-[6px] object-cover" />
      ) : null}
      <div className="mt-6 space-y-4 text-[15px] leading-8">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      {links.length > 0 ? (
        <nav aria-label={tr(locale, "ap.relatedLinks")} className="mt-8 border-t border-line pt-4">
          <p className="eyebrow mb-2">{tr(locale, "ap.relatedLinks")}</p>
          <ul className="flex flex-wrap gap-2">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex items-center rounded-[3px] border border-line px-2.5 py-1.5 text-[12px] font-bold transition hover:border-gold-500 hover:text-gold-600 dark:hover:text-gold-400"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      <p className="mt-6 border-t border-line pt-4 text-[12px] text-muted">
        {tr(locale, "ap.sourceLabel")}{" "}
        <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="font-bold text-gold-600 hover:underline">
          {article.sourceName} ↗
        </a>
      </p>

      {related.length > 0 ? (
        <section className="mt-8" aria-label={tr(locale, "ap.readAlso")}>
          <h2 className="mb-3 border-b-2 border-line pb-2 text-[15px] font-extrabold">{tr(locale, "ap.readAlso")}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {related.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/news/${encodeURIComponent(item.slug)}`}
                  className="card block h-full p-4 transition hover:border-gold-500/50"
                >
                  <span className="num block text-[10px] text-muted">
                    <time dateTime={item.publishedAt}>{formatDate(locale, item.publishedAt)}</time> · {categoryLabel(locale, item.category)}
                  </span>
                  <span className="mt-1.5 block text-[14px] font-bold leading-snug">{displayName(locale, item.title, item.titleEn)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
