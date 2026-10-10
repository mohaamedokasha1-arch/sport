import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import Tabs from "@/components/ui/Tabs";
import MatchCard from "@/components/match/MatchCard";
import StandingsTable from "@/components/competition/StandingsTable";
import NewsCard from "@/components/news/NewsCard";
import Crest from "@/components/ui/Crest";
import DataSourceNote from "@/components/data/DataSourceNote";
import DataUnavailable from "@/components/ui/DataUnavailable";
import ProviderMatchList from "@/components/data/ProviderMatchList";
import SectionHead from "@/components/ui/SectionHead";
import { footballMatches, footballStandings, footballTopScorers, type FootballDataCompetitionRef } from "@/lib/football-data";
import { demoContentVisible } from "@/lib/site";
import { hasMatchIdentity, supportsPlayerStats } from "@/lib/sdl-gateway";
import { competitionByPath } from "@/lib/competition-catalog";
import type { NormalizedFixture, NormalizedStandingRow, NormalizedTopScorer } from "@/packages/sdl/src";
import {
  articles,
  competitionMatches,
  competitions,
  standings,
  topScorers,
} from "@/lib/data";
import { playerBySlug, sportBySlug, teamBySlug, teamsByCompetition } from "@/lib/core-data";
import { getAdminCompetitionBySlug } from "@/lib/admin-competitions";
import { AdminCompetitionDetail } from "@/components/public/AdminPublished";
import { decodeSlug } from "@/lib/slug";
import { isLiveStatus } from "@/lib/match-state";

/**
 * Bound the lifetime of an on-demand ISR entry.
 *
 * Without this, a page (or a 404) rendered while a provider was briefly
 * unreachable is cached with no expiry: competition metadata and its table would stay wrong until the
 * next deploy. A bounded revalidate lets a transient outage self-heal while
 * still serving from cache in the normal case.
 */
export const revalidate = 1800;

export function generateStaticParams() {
  return demoContentVisible() ? competitions.map((c) => ({ slug: c.slug })) : [];
}

async function competitionMetadataBody({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const providerCompetition = competitionByPath(slug);
  if (providerCompetition) {
    const title = `${providerCompetition.nameAr} | الترتيب والمباريات`;
    return {
      title,
      description: `مباريات ${providerCompetition.nameAr} ونتائجها وجدول الترتيب عند توفرها من مزود البيانات.`,
      // Canonical is always the registered path, never the alias the visitor used.
      alternates: { canonical: `/competitions/${providerCompetition.canonicalSlug}` },
    };
  }
  const c = demoContentVisible() ? competitions.find((x) => x.slug === slug) : undefined;
  if (!c) return { title: "البطولة غير موجودة", robots: { index: false, follow: true } };
  return {
    title: `${c.name} | معاينة البطولة`,
    description: `معلومات تجريبية عن ${c.name} لأغراض التطوير فقط.`,
    alternates: { canonical: `/competitions/${c.slug}` },
    robots: { index: false, follow: true },
  };
}

async function CompetitionPageBody({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const providerCompetition = competitionByPath(slug);
  // One public URL per competition: aliases (PL, english-premier-league, ...)
  // permanently redirect to the registered canonical path.
  if (providerCompetition && providerCompetition.canonicalSlug !== decodeSlug(slug)) {
    permanentRedirect(`/competitions/${encodeURIComponent(providerCompetition.canonicalSlug)}`);
  }
  if (providerCompetition) return <ProviderCompetitionPage competition={providerCompetition} id={providerCompetition.slug ?? providerCompetition.code} />;

  const comp = demoContentVisible() ? competitions.find((c) => c.slug === slug) : undefined;
  if (!comp) notFound();

  const sport = sportBySlug(comp.sport);
  const table = standings[comp.slug];
  const scorers = topScorers[comp.slug];
  const matches = competitionMatches(comp.slug);
  const teams = teamsByCompetition(comp.slug);

  const live = matches.filter((m) => m.status === "LIVE");
  const upcoming = matches.filter((m) => m.status === "UPCOMING");
  const finished = matches.filter((m) => m.status === "FINISHED");
  const news = articles.filter((a) => a.competition === comp.slug || a.sport === comp.sport).slice(0, 6);

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <p className="mb-4 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[11px] font-semibold text-muted">بيانات بطولة توضيحية للتطوير فقط — لا تمثل جدولًا أو نتائج حقيقية.</p>
      <nav aria-label="مسار التنقل" className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">الرئيسية</Link>
        <span aria-hidden>/</span>
        <Link href="/competitions" className="hover:text-gold-600 dark:hover:text-gold-400">البطولات</Link>
        <span aria-hidden>/</span>
        <span className="font-semibold text-ink">{comp.name}</span>
      </nav>

      <header className="stripes mb-6 overflow-hidden rounded-[8px] border border-navy-700 bg-navy-850 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-6">
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[4px] bg-gold-500 font-display text-lg font-extrabold tracking-wider text-navy-900">
              {comp.code}
            </span>
            <div>
              <p className="eyebrow !text-white/50">{sport?.name}</p>
              <h1 className="text-2xl font-extrabold tracking-tight">{comp.name}</h1>
              <p className="mt-1 text-[12px] text-white/60">
                {comp.country} · موسم {comp.season} · {comp.format} · {comp.rounds} جولة
              </p>
            </div>
          </div>
          <dl className="flex flex-wrap gap-6 text-center">
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">الفرق</dt>
              <dd className="num text-xl font-extrabold text-gold-400">{comp.teamsCount}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">مباشر</dt>
              <dd className="num text-xl font-extrabold text-live">{live.length}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">قادمة</dt>
              <dd className="num text-xl font-extrabold">{upcoming.length}</dd>
            </div>
          </dl>
        </div>
      </header>

      <Tabs
        label="أقسام البطولة"
        items={[
          {
            id: "standings",
            label: "الترتيب",
            disabled: !table,
            content: table ? (
              <StandingsTable rows={table} />
            ) : (
              <p className="card px-4 py-10 text-center text-[13px] text-muted">
                لا يتوفر جدول ترتيب لهذه البطولة (مسابقة فردية أو متعددة المراحل).
              </p>
            ),
          },
          {
            id: "matches",
            label: "المباريات والنتائج",
            content: (
              <div className="space-y-6">
                {live.length > 0 ? (
                  <Group title="مباشر الآن" list={live} />
                ) : null}
                {upcoming.length > 0 ? <Group title="القادمة" list={upcoming} /> : null}
                {finished.length > 0 ? <Group title="النتائج" list={finished} /> : null}
                {matches.length === 0 ? (
                  <p className="card px-4 py-10 text-center text-[13px] text-muted">
                    لا توجد مباريات مسجّلة لهذه البطولة في النسخة التجريبية.
                  </p>
                ) : null}
              </div>
            ),
          },
          {
            id: "scorers",
            label: "الهدافون",
            disabled: !scorers,
            content: scorers ? (
              <div className="card overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-line bg-navy-850/[0.04] text-muted dark:bg-white/[0.04]">
                      <th className="px-3 py-2.5 text-start font-semibold">#</th>
                      <th className="px-3 py-2.5 text-start font-semibold">اللاعب</th>
                      <th className="px-3 py-2.5 text-start font-semibold">الفريق</th>
                      <th className="num px-3 py-2.5 font-semibold">مباريات</th>
                      <th className="num px-3 py-2.5 font-semibold">جزائيات</th>
                      <th className="num px-3 py-2.5 font-semibold">أهداف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scorers.map((s) => {
                      const p = playerBySlug(s.player);
                      const t = teamBySlug(s.team);
                      return (
                        <tr key={s.player} className="border-b border-line last:border-0 hover:bg-navy-850/[0.03] dark:hover:bg-white/[0.04]">
                          <td className="num px-3 py-2.5 font-extrabold text-gold-600 dark:text-gold-400">{s.pos}</td>
                          <td className="px-3 py-2.5">
                            <Link href={`/players/${s.player}`} className="font-bold transition hover:text-gold-600 dark:hover:text-gold-400">
                              {p?.name ?? s.player}
                            </Link>
                          </td>
                          <td className="px-3 py-2.5">
                            {t ? (
                              <Link href={`/teams/${t.slug}`} className="flex items-center gap-2 transition hover:text-gold-600 dark:hover:text-gold-400">
                                <Crest slug={t.slug} size={20} />
                                {t.name}
                              </Link>
                            ) : (
                              s.team
                            )}
                          </td>
                          <td className="num px-3 py-2.5 text-center">{s.apps}</td>
                          <td className="num px-3 py-2.5 text-center">{s.penalties}</td>
                          <td className="num px-3 py-2.5 text-center text-[14px] font-extrabold">{s.goals}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null,
          },
          {
            id: "teams",
            label: "الفرق المشاركة",
            content:
              teams.length > 0 ? (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {teams.map((t) => (
                    <li key={t.slug}>
                      <Link
                        href={`/teams/${t.slug}`}
                        className="card flex items-center gap-3 p-3 transition hover:border-gold-500/50"
                      >
                        <Crest slug={t.slug} size={38} />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-bold">{t.name}</span>
                          <span className="block text-[11px] text-muted">
                            {t.stadium ?? t.country}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="card px-4 py-10 text-center text-[13px] text-muted">
                  المشاركون في هذه البطولة أفراد وليسوا فرقًا.
                </p>
              ),
          },
          {
            id: "news",
            label: "أخبار البطولة",
            content:
              news.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {news.map((a) => (
                    <NewsCard key={a.slug} article={a} />
                  ))}
                </div>
              ) : (
                <p className="card px-4 py-10 text-center text-[13px] text-muted">لا توجد أخبار مرتبطة.</p>
              ),
          },
        ]}
      />
    </div>
  );
}

async function ProviderCompetitionPage({ competition, id }: { competition: FootballDataCompetitionRef; id: string }) {
  const [tableResult, matchesResult] = await Promise.all([
    footballStandings(id),
    footballMatches({ competitionId: id }),
  ]);
  const tableData = tableResult.ok && tableResult.source.provider !== "demo" ? tableResult : null;
  const matchesData = matchesResult.ok && matchesResult.source.provider !== "demo" ? matchesResult : null;
  const rows: NormalizedStandingRow[] = tableData?.data ?? [];
  const fixtures: NormalizedFixture[] = (matchesData?.data ?? []).filter(hasMatchIdentity);
  const scorerResult = rows.length > 0 ? await footballTopScorers(id) : null;
  const scorerData = scorerResult?.ok && scorerResult.source.provider !== "demo" ? scorerResult : null;
  const scorers: NormalizedTopScorer[] = scorerData?.data ?? [];
  const live = fixtures.filter((fixture) => isLiveStatus(fixture.status));
  const upcoming = fixtures.filter((fixture) => fixture.status === "scheduled").sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt)).slice(0, 9);
  const results = fixtures.filter((fixture) => fixture.status === "finished").sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt)).slice(0, 9);
  const tableGroups = new Map<string, NormalizedStandingRow[]>();
  for (const row of rows) {
    const group = row.group ?? "";
    const list = tableGroups.get(group) ?? [];
    list.push(row);
    tableGroups.set(group, list);
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-9 px-4 py-6">
      <nav aria-label="مسار التنقل" className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">الرئيسية</Link><span aria-hidden>/</span>
        <Link href="/competitions" className="hover:text-gold-600 dark:hover:text-gold-400">البطولات</Link><span aria-hidden>/</span>
        <span className="font-semibold text-ink">{competition.nameAr}</span>
      </nav>
      <header className="stripes overflow-hidden rounded-[8px] border border-navy-700 bg-navy-850 text-white">
        <div className="flex flex-wrap items-center gap-4 px-5 py-5">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[4px] bg-gold-500 font-display text-sm font-extrabold text-navy-900">{competition.code}</span>
          <div className="min-w-0 flex-1">
            <p className="eyebrow !text-white/50">{competition.countryAr} · تغطية كرة القدم</p>
            <h1 className="text-2xl font-extrabold tracking-tight">{competition.nameAr}</h1>
          </div>
          <Link href={`/matches?competition=${encodeURIComponent(id)}`} className="inline-flex min-h-11 items-center rounded-[3px] bg-white/10 px-3 text-[12px] font-bold transition hover:bg-gold-500 hover:text-navy-900 focus-ring">مباريات البطولة</Link>
        </div>
      </header>

      <section>
        <SectionHead eyebrow="بيانات مزوّد المباريات" title="جدول الترتيب" />
        {rows.length > 0 ? (
          <div className="space-y-4">
            {[...tableGroups.entries()].map(([group, groupRows]) => (
              <div key={group || "main"} className="card overflow-x-auto">
                {group ? <h3 className="border-b border-line px-3 py-2 text-[12px] font-bold">{group.replaceAll("_", " ")}</h3> : null}
                <table className="w-full min-w-[580px] text-[12px]">
                  <thead><tr className="border-b border-line text-muted">
                    <th scope="col" className="px-2 py-2 text-start">#</th><th scope="col" className="px-2 py-2 text-start">الفريق</th>
                    <th scope="col" className="px-2 py-2 text-center">لعب</th><th scope="col" className="px-2 py-2 text-center">ف</th>
                    <th scope="col" className="px-2 py-2 text-center">ت</th><th scope="col" className="px-2 py-2 text-center">خ</th>
                    <th scope="col" className="px-2 py-2 text-center">له/عليه</th><th scope="col" className="px-2 py-2 text-center">نقاط</th><th scope="col" className="px-2 py-2 text-center">آخر 5</th>
                  </tr></thead>
                  <tbody>{groupRows.map((row) => (
                    <tr key={`${row.position}-${row.teamProviderId}`} className="border-b border-line/60 last:border-0">
                      <td className="num px-2 py-2 font-extrabold text-muted">{row.position}</td>
                      <td className="px-2 py-2 font-bold"><Link href={`/teams/${encodeURIComponent(row.teamProviderId)}`} className="flex min-h-8 items-center gap-2 hover:text-gold-600 dark:hover:text-gold-400">
                        {row.teamLogoUrl ? <img src={row.teamLogoUrl} alt="" width={20} height={20} loading="lazy" className="h-5 w-5 shrink-0 object-contain" /> : null}
                        <span className="truncate">{row.teamName ?? row.teamShortName ?? row.teamProviderId}</span>
                      </Link></td>
                      <td className="num px-2 py-2 text-center">{row.played}</td><td className="num px-2 py-2 text-center">{row.won}</td>
                      <td className="num px-2 py-2 text-center">{row.drawn}</td><td className="num px-2 py-2 text-center">{row.lost}</td>
                      <td className="num px-2 py-2 text-center text-muted">{row.goalsFor}:{row.goalsAgainst}</td><td className="num px-2 py-2 text-center font-extrabold">{row.points}</td>
                      <td className="px-2 py-2 text-center"><span className="inline-flex gap-0.5" aria-label="آخر النتائج">{row.form.slice(-5).map((value, index) => <span key={`${value}-${index}`} className={`inline-grid h-4 w-4 place-items-center rounded-[2px] text-[9px] font-extrabold ${value === "W" ? "bg-win-green/20 text-win-green" : value === "D" ? "bg-line text-muted" : "bg-live-red/15 text-live-red"}`}>{value}</span>)}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ))}
            {tableData ? <DataSourceNote className="mt-3" provider={tableData.source.provider} fromCache={tableData.source.fromCache} stale={tableData.source.stale} fetchedAt={tableData.source.fetchedAt} ttlSeconds={tableData.source.ttlSeconds} /> : null}
          </div>
        ) : <DataUnavailable title="جدول الترتيب غير متاح من المصدر" message="لا تتوفر بيانات مؤكدة لهذا الجدول الآن. لن نستبدلها بترتيب تجريبي." actionHref="/standings" actionLabel="عرض الجداول المتاحة" />}
      </section>

      <section>
        <SectionHead eyebrow="المباريات والنتائج" title="مباريات البطولة" href={`/matches?competition=${encodeURIComponent(id)}`} />
        {fixtures.length === 0 ? (
          <DataUnavailable title={matchesData ? "لا توجد مباريات في البيانات المسترجعة" : "مباريات البطولة غير متاحة"} message={matchesData ? "لم يتضمن آخر تحديث مباريات لهذه البطولة." : "لم يصل جدول مؤكد من مصدر البيانات."} actionHref="/matches" actionLabel="تصفّح المباريات" />
        ) : (
          <div className="space-y-7">
            {live.length ? <div><SectionHead eyebrow="الآن" title="مباشر" /><ProviderMatchList fixtures={live} /></div> : null}
            {upcoming.length ? <div><SectionHead eyebrow="المواعيد" title="قادمة" /><ProviderMatchList fixtures={upcoming} /></div> : null}
            {results.length ? <div><SectionHead eyebrow="النتائج" title="اكتملت" /><ProviderMatchList fixtures={results} /></div> : null}
            {matchesData ? <DataSourceNote className="mt-3" provider={matchesData.source.provider} fromCache={matchesData.source.fromCache} stale={matchesData.source.stale} fetchedAt={matchesData.source.fetchedAt} ttlSeconds={matchesData.source.ttlSeconds} /> : null}
          </div>
        )}
      </section>

      <section>
        <SectionHead eyebrow="إحصاءات البطولة" title="الهدافون" />
        {scorers.length > 0 ? (
          <div className="card divide-y divide-line overflow-hidden">
            {scorers.slice(0, 10).map((scorer) => {
              const playerId = scorer.playerProviderId.trim();
              const name = scorer.playerName?.trim() ?? "";
              const canOpenProfile = Boolean(
                playerId && name && scorer.profileAvailable === true && scorerData && supportsPlayerStats(scorerData.source.provider),
              );
              return (
                <div key={playerId || `${competition.code}-${scorer.goals}`} className="flex min-h-12 items-center gap-3 px-3 py-2.5">
                  <span className="num w-6 shrink-0 text-center text-[13px] font-extrabold text-gold-600 dark:text-gold-400">{scorer.goals}</span>
                  {canOpenProfile ? (
                    <Link href={`/players/${encodeURIComponent(playerId)}`} className="min-w-0 flex-1 truncate text-[12.5px] font-bold hover:text-gold-600 dark:hover:text-gold-400">{name}</Link>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold">{name || "اسم اللاعب غير متاح"}</span>
                  )}
                  <span className="hidden shrink-0 text-[11px] text-muted sm:block">{scorer.teamName ?? ""}</span>
                  {scorerData ? <span className="num text-[11px] text-muted">{scorer.appearances ?? "—"} مباراة</span> : null}
                </div>
              );
            })}
            {scorerData ? <div className="px-3 py-2"><DataSourceNote provider={scorerData.source.provider} fromCache={scorerData.source.fromCache} stale={scorerData.source.stale} fetchedAt={scorerData.source.fetchedAt} ttlSeconds={scorerData.source.ttlSeconds} /></div> : null}
          </div>
        ) : <DataUnavailable title="قائمة الهدافين غير متاحة" message="لا تتوفر إحصاءات موثوقة للهدافين في آخر تحديث." actionHref="/standings" actionLabel="الترتيب والإحصاءات" />}
      </section>
    </div>
  );
}

function Group({ title, list }: { title: string; list: Parameters<typeof MatchCard>[0]["match"][] }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-[13px] font-extrabold">
        <span className="h-4 w-1 rounded-full bg-gold-500" aria-hidden />
        {title}
        <span className="num rounded-[3px] bg-navy-850/5 px-1.5 py-0.5 text-[10px] dark:bg-white/10">{list.length}</span>
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((m) => (
          <MatchCard key={m.id} match={m} />
        ))}
      </div>
    </section>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const c = await getAdminCompetitionBySlug(slug);
  if (c?.isPublished) {
    return {
      title: `${c.nameAr} | البطولات`,
      description: `${c.nameAr}${c.season ? ` — موسم ${c.season}` : ""}: تفاصيل البطولة من إدارة نيمو سبورتس.`,
      alternates: { canonical: `/competitions/${slug}` },
    };
  }
  return competitionMetadataBody({ params });
}

export default async function CompetitionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const adminComp = await getAdminCompetitionBySlug(slug);
  if (adminComp?.isPublished) return <AdminCompetitionDetail competition={adminComp} />;
  return <CompetitionPageBody params={params} />;
}
