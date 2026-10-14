/* ─────────────────────────────────────────────────────────────
   NEMO Sports · admin-published content on public pages
   Server components only. Every entity rendered here comes from the
   admin stores and is shown only when `isPublished` / status = published.
   Empty optional fields are omitted — nothing is invented.
   ───────────────────────────────────────────────────────────── */

import Link from "next/link";
import SectionHead from "@/components/ui/SectionHead";
import { listAdminTeams, type AdminTeam } from "@/lib/admin-teams";
import { listAdminPlayers, type AdminPlayer } from "@/lib/admin-players";
import { listAdminCompetitions, type AdminCompetition } from "@/lib/admin-competitions";
import { listManualNews, newsParagraphs, type ManualNews } from "@/lib/manual-news";
import { dateAr } from "@/lib/format";
import { SITE_TZ } from "@/lib/tz";
import { editorialStructuredData } from "@/lib/news/editorial-seo";
import type { EditorialLink } from "@/lib/news/editorial-links";

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

export async function AdminTeamsSection() {
  const teams = await listAdminTeams({ publishedOnly: true, limit: 60 });
  if (teams.length === 0) return null;
  return (
    <section className="mx-auto mb-8 max-w-[1280px] px-4">
      <SectionHead eyebrow="من الإدارة" title="فرق مضافة يدويًا" />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((t: AdminTeam) => (
          <li key={t.id}>
            <Link href={`/teams/${encodeURIComponent(t.slug)}`} className={cardCls}>
              <Logo url={t.logoUrl} alt={t.nameAr} />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-bold">{t.nameAr}</span>
                <span className="block truncate text-[11px] text-muted">{[t.country, t.stadium].filter(Boolean).join(" · ") || "—"}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export async function AdminPlayersSection() {
  const players = await listAdminPlayers({ publishedOnly: true, limit: 60 });
  if (players.length === 0) return null;
  return (
    <section className="mx-auto mb-8 max-w-[1280px] px-4">
      <SectionHead eyebrow="من الإدارة" title="لاعبون مضافون يدويًا" />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {players.map((p: AdminPlayer) => (
          <li key={p.id}>
            <Link href={`/players/${encodeURIComponent(p.slug)}`} className={cardCls}>
              <Logo url={p.photoUrl} alt={p.fullNameAr} />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-bold">{p.fullNameAr}</span>
                <span className="block truncate text-[11px] text-muted">{[p.teamName, p.position].filter(Boolean).join(" · ") || "—"}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export async function AdminCompetitionsSection() {
  const items = await listAdminCompetitions({ publishedOnly: true, limit: 60 });
  if (items.length === 0) return null;
  return (
    <section className="mx-auto mb-8 max-w-[1280px] px-4">
      <SectionHead eyebrow="من الإدارة" title="بطولات مضافة يدويًا" />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c: AdminCompetition) => (
          <li key={c.id}>
            <Link href={`/competitions/${encodeURIComponent(c.slug)}`} className={cardCls}>
              <Logo url={c.logoUrl} alt={c.nameAr} />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-bold">{c.nameAr}</span>
                <span className="block truncate text-[11px] text-muted">{[c.country, c.season].filter(Boolean).join(" · ") || "—"}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export async function ManualNewsSection({ category }: { category?: string }) {
  if (category) return null;
  const items = await listManualNews({ publishedOnly: true, limit: 12 });
  if (items.length === 0) return null;
  return (
    <section className="mx-auto mb-8 max-w-[1280px] px-4">
      <SectionHead eyebrow="تحرير نيمو" title="أخبار منشورة" />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((n) => (
          <li key={n.id}>
            <Link href={`/news/${encodeURIComponent(n.slug)}`} className="card block h-full p-4 transition hover:border-gold-500/50">
              <span className="num block text-[10px] text-muted">{dateAr(n.publishedAt)} · {n.sourceName}</span>
              <span className="mt-1.5 block text-[14px] font-bold leading-snug">{n.title}</span>
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

export function AdminTeamDetail({ team }: { team: AdminTeam }) {
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <nav aria-label="مسار التنقل" className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/" className="hover:text-gold-600">الرئيسية</Link><span aria-hidden>/</span>
        <Link href="/teams" className="hover:text-gold-600">الفرق</Link><span aria-hidden>/</span>
        <span className="font-semibold text-ink">{team.nameAr}</span>
      </nav>
      <header className="card flex items-center gap-4 p-5">
        <Logo url={team.logoUrl} alt={team.nameAr} />
        <div className="min-w-0">
          <p className="eyebrow mb-1">فريق</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{team.nameAr}</h1>
          {team.nameEn ? <p className="text-[12px] text-muted" dir="ltr">{team.nameEn}</p> : null}
        </div>
      </header>
      <section className="card mt-6 px-4 py-2">
        <Row label="البلد" value={team.country} />
        <Row label="الملعب" value={team.stadium} />
        <Row label="المدرب" value={team.coach} />
        <Row label="سنة التأسيس" value={team.foundedYear} />
        <Row label="البطولة" value={team.competitionSlug} />
      </section>
    </div>
  );
}

export function AdminPlayerDetail({ player }: { player: AdminPlayer }) {
  const statEntries = Object.entries(player.stats);
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <nav aria-label="مسار التنقل" className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/" className="hover:text-gold-600">الرئيسية</Link><span aria-hidden>/</span>
        <Link href="/players" className="hover:text-gold-600">اللاعبون</Link><span aria-hidden>/</span>
        <span className="font-semibold text-ink">{player.fullNameAr}</span>
      </nav>
      <header className="card flex items-center gap-4 p-5">
        <Logo url={player.photoUrl} alt={player.fullNameAr} />
        <div className="min-w-0">
          <p className="eyebrow mb-1">لاعب</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{player.fullNameAr}</h1>
          {player.fullNameEn ? <p className="text-[12px] text-muted" dir="ltr">{player.fullNameEn}</p> : null}
        </div>
      </header>
      <section className="card mt-6 px-4 py-2">
        <Row label="الفريق" value={player.teamName} />
        <Row label="المركز" value={player.position} />
        <Row label="الرقم" value={player.jerseyNumber} />
        <Row label="الجنسية" value={player.nationality} />
        <Row label="تاريخ الميلاد" value={player.dateOfBirth ? dateAr(player.dateOfBirth) : null} />
        <Row label="الطول (سم)" value={player.heightCm} />
        <Row label="الوزن (كجم)" value={player.weightKg} />
        {statEntries.map(([k, v]) => (
          <Row key={k} label={k} value={v} />
        ))}
      </section>
    </div>
  );
}

export function AdminCompetitionDetail({ competition }: { competition: AdminCompetition }) {
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <nav aria-label="مسار التنقل" className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/" className="hover:text-gold-600">الرئيسية</Link><span aria-hidden>/</span>
        <Link href="/competitions" className="hover:text-gold-600">البطولات</Link><span aria-hidden>/</span>
        <span className="font-semibold text-ink">{competition.nameAr}</span>
      </nav>
      <header className="card flex items-center gap-4 p-5">
        <Logo url={competition.logoUrl} alt={competition.nameAr} />
        <div className="min-w-0">
          <p className="eyebrow mb-1">{competition.type}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{competition.nameAr}</h1>
          {competition.nameEn ? <p className="text-[12px] text-muted" dir="ltr">{competition.nameEn}</p> : null}
        </div>
      </header>
      <section className="card mt-6 px-4 py-2">
        <Row label="الدولة / النطاق" value={competition.country} />
        <Row label="الموسم" value={competition.season} />
        <Row label="المنطقة الزمنية للعرض" value={SITE_TZ} />
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
}: {
  article: ManualNews;
  links?: EditorialLink[];
  related?: ManualNews[];
}) {
  const paragraphs = newsParagraphs(article.content);
  const structuredData = editorialStructuredData(article);

  return (
    <article className="mx-auto max-w-[800px] px-4 py-6">
      {structuredData.map((json, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
      ))}

      <nav aria-label="مسار التنقل" className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/" className="hover:text-gold-600">الرئيسية</Link><span aria-hidden>/</span>
        <Link href="/news" className="hover:text-gold-600">الأخبار</Link>
        <span aria-hidden>/</span>
        <span className="font-semibold text-ink">{article.category}</span>
      </nav>

      <p className="num text-[11px] text-muted">
        <time dateTime={article.publishedAt}>{dateAr(article.publishedAt)}</time> · {article.category}
      </p>
      <h1 className="mt-2 text-2xl font-extrabold leading-snug tracking-tight">{article.title}</h1>
      {article.titleEn ? <p className="mt-1 text-[12px] text-muted" dir="ltr">{article.titleEn}</p> : null}
      {article.description ? <p className="mt-3 text-[15px] leading-relaxed text-muted">{article.description}</p> : null}
      {article.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={article.imageUrl} alt={article.title} className="mt-5 w-full rounded-[6px] object-cover" />
      ) : null}
      <div className="mt-6 space-y-4 text-[15px] leading-8">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      {links.length > 0 ? (
        <nav aria-label="روابط ذات صلة" className="mt-8 border-t border-line pt-4">
          <p className="eyebrow mb-2">روابط ذات صلة</p>
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
        المصدر:{" "}
        <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="font-bold text-gold-600 hover:underline">
          {article.sourceName} ↗
        </a>
      </p>

      {related.length > 0 ? (
        <section className="mt-8" aria-label="اقرأ أيضًا">
          <h2 className="mb-3 border-b-2 border-line pb-2 text-[15px] font-extrabold">اقرأ أيضًا</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {related.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/news/${encodeURIComponent(item.slug)}`}
                  className="card block h-full p-4 transition hover:border-gold-500/50"
                >
                  <span className="num block text-[10px] text-muted">
                    <time dateTime={item.publishedAt}>{dateAr(item.publishedAt)}</time> · {item.category}
                  </span>
                  <span className="mt-1.5 block text-[14px] font-bold leading-snug">{item.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
