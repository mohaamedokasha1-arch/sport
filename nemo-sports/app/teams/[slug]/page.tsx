import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Tabs from "@/components/ui/Tabs";
import Crest from "@/components/ui/Crest";
import MatchCard from "@/components/match/MatchCard";
import NewsCard from "@/components/news/NewsCard";
import StandingsTable from "@/components/competition/StandingsTable";
import DataSourceNote from "@/components/data/DataSourceNote";
import { articles, standings, teamMatches } from "@/lib/data";
import {
  competitionBySlug,
  playersByTeam,
  sportBySlug,
  teamBySlug,
  teams,
} from "@/lib/core-data";
import { age, number } from "@/lib/format";
import { footballDataCompetitions, footballMatches, footballStandings } from "@/lib/football-data";
import { team as sdlTeam, PERMANENT_FAILURE_KINDS } from "@/lib/sdl-gateway";
import { demoContentVisible } from "@/lib/site";
import type { NormalizedFixture, NormalizedStandingRow } from "@/packages/sdl/src";
import { getAdminTeamBySlug } from "@/lib/admin-teams";
import { AdminTeamDetail } from "@/components/public/AdminPublished";
import { cache } from "react";
import { decodeSlug } from "@/lib/slug";

/**
 * Find a provider team row by looking it up in the league tables.
 * 
 * The keyless provider does not have a team detail endpoint, so looking up a
 * team directly returns "unsupported". But the tables contain the full team row
 * (name, short name, logo) alongside the league position, so we can just extract it.
 */
type RealTeamLookup = {
  row: NormalizedStandingRow;
  compId: string;
  provider: string;
  fromCache: boolean;
  stale?: boolean;
  fetchedAt: string;
};

const findTeamInRealTables = cache(async function findTeamInRealTables(
  teamId: string,
): Promise<RealTeamLookup | null> {
  const majors = footballDataCompetitions(true);
  const ids = majors.map((c) => c.slug ?? c.code);
  const tables = await Promise.all(ids.map((id) => footballStandings(id)));
  for (let i = 0; i < tables.length; i += 1) {
    const res = tables[i];
    if (!res.ok || res.source.provider === "demo") continue;
    const row = res.data.find((candidate) => candidate.teamProviderId === teamId);
    if (!row) continue;
    return {
      row,
      compId: ids[i] ?? "",
      provider: res.source.provider,
      fromCache: res.source.fromCache,
      stale: res.source.stale,
      fetchedAt: res.source.fetchedAt,
    };
  }
  return null;
});

/**
 * Bound the lifetime of an on-demand ISR entry.
 *
 * Without this, a page (or a 404) rendered while a provider was briefly
 * unreachable is cached with no expiry: team identity and league position would stay wrong until the
 * next deploy. A bounded revalidate lets a transient outage self-heal while
 * still serving from cache in the normal case.
 */
export const revalidate = 1800;

export function generateStaticParams() {
  // Demo slugs are prerendered for development/preview only; real provider
  // team ids render on demand (dynamicParams stays true).
  return demoContentVisible() ? teams.map((t) => ({ slug: t.slug })) : [];
}

/** Local name of a competition id (code or SportScore slug). */
function competitionNameAr(id: string): string {
  const majors = footballDataCompetitions(true);
  return majors.find((c) => c.slug === id || c.code === id)?.nameAr ?? id;
}

async function teamMetadataBody({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  /* ── real provider team first ── */
  const real = await sdlTeam("football", slug);
  if (real.ok && real.source === "provider") {
    const t = real.data;
    const title = `${t.name} | الفريق`;
    const description = `كل ما يخص ${t.name}: الترتيب والنقاط وسلسلة النتائج وآخر المباريات — بيانات حقيقية من المصدر.`;
    return {
      title,
      description,
      alternates: { canonical: `/teams/${slug}` },
      openGraph: { title, description, type: "article" },
    };
  }

  /* ── or a real team the directory links to, resolved from the tables ── */
  if (!demoContentVisible()) {
    const listed = await findTeamInRealTables(slug);
    const name = listed?.row.teamName ?? listed?.row.teamShortName ?? null;
    if (listed && name) {
      const title = `${name} | الفريق`;
      const description = `كل ما يخص ${name}: الترتيب والنقاط وسلسلة النتائج وآخر المباريات — بيانات حقيقية من المصدر.`;
      return {
        title,
        description,
        alternates: { canonical: `/teams/${slug}` },
        openGraph: { title, description, type: "article" },
      };
    }
  }

  const t = demoContentVisible() ? teamBySlug(slug) : undefined;
  // Explicit robots so a 404 emits one consistent directive instead of the
  // layout's `index, follow` stacked on Next.js's built-in not-found noindex.
  if (!t) return { title: "الفريق غير موجود", robots: { index: false, follow: true } };
  const comp = competitionBySlug(t.competition);
  return {
    title: `${t.name} | ${comp?.name ?? sportBySlug(t.sport)?.name}`,
    description: `كل ما يخص ${t.name}: اللاعبون، المباريات القادمة، النتائج، الترتيب والإحصائيات.`,
    alternates: { canonical: `/teams/${t.slug}` },
  };
}

async function TeamPageBody({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  /* ══ 1) real provider team ══════════════════════════════════════════ */
  const real = await sdlTeam("football", slug);
  if (!real.ok && !PERMANENT_FAILURE_KINDS.has(real.error.kind)) {
    // Transient outage only: abort so ISR keeps the last good page rather than
    // caching a wrong answer. Permanent failures (not_found, no provider,
    // unsupported) fall through to the demo lookup and then to an honest 404.
    throw new Error(`team_unavailable:${real.error.kind}`);
  }
  if (real.ok && real.source === "provider") {
    return <RealTeamView slug={slug} provider={real.provider} fromCache={real.fromCache} stale={real.stale} fetchedAt={real.fetchedAt} name={real.data.name} shortName={real.data.shortName} logoUrl={real.data.logoUrl} countryName={real.data.countryName} foundedYear={real.data.foundedYear} venueName={real.data.venueName} primaryColor={real.data.primaryColor} secondaryColor={real.data.secondaryColor} />;
  }

  /* ══ 1b) a real team that /teams links to, resolved from the tables ══
     The directory on /teams is built from league-table rows, and the keyless
     provider has no team-detail endpoint for those ids — so they used to fall
     through to notFound() and every directory link was a 404. The same tables
     that produced the link carry the team's real row. */
  if (!demoContentVisible()) {
    const listed = await findTeamInRealTables(slug);
    const name = listed?.row.teamName ?? listed?.row.teamShortName ?? null;
    if (listed && name) {
      return (
        <RealTeamView
          slug={slug}
          lookup={listed}
          provider={listed.provider}
          fromCache={listed.fromCache}
          stale={listed.stale}
          fetchedAt={listed.fetchedAt}
          name={name}
          shortName={listed.row.teamShortName ?? null}
          logoUrl={listed.row.teamLogoUrl ?? null}
          countryName={null}
          foundedYear={null}
          venueName={null}
          primaryColor={null}
          secondaryColor={null}
        />
      );
    }
  }

  const team = demoContentVisible() ? teamBySlug(slug) : undefined;
  if (!team) notFound();

  const comp = competitionBySlug(team.competition);
  const sport = sportBySlug(team.sport);
  const matches = teamMatches(team.slug);
  const squad = playersByTeam(team.slug);
  const news = articles.filter((a) => a.teams?.includes(team.slug)).slice(0, 6);

  const played = matches.filter((m) => m.status === "FINISHED");
  const upcoming = matches.filter((m) => m.status === "UPCOMING");
  const live = matches.filter((m) => m.status === "LIVE");

  const record = played.reduce(
    (acc, m) => {
      const isHome = m.home === team.slug;
      const gf = isHome ? m.homeScore : m.awayScore;
      const ga = isHome ? m.awayScore : m.homeScore;
      acc.gf += gf;
      acc.ga += ga;
      if (gf > ga) acc.w += 1;
      else if (gf === ga) acc.d += 1;
      else acc.l += 1;
      return acc;
    },
    { w: 0, d: 0, l: 0, gf: 0, ga: 0 },
  );

  const table = standings[team.competition];
  const teamRow = table?.find((r) => r.team === team.slug);

  const groupOrder = ["حراسة المرمى", "الدفاع", "الوسط", "الهجوم", "أساسي", "فردي"];
  const grouped = groupOrder
    .map((g) => ({ title: g, list: squad.filter((p) => p.positionGroup === g) }))
    .filter((g) => g.list.length > 0);

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <p className="mb-4 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[11px] font-semibold text-muted">بيانات معاينة للتطوير فقط — ليست إحصاءات أو مباريات حقيقية.</p>
      <nav aria-label="مسار التنقل" className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">الرئيسية</Link>
        <span aria-hidden>/</span>
        <Link href="/teams" className="hover:text-gold-600 dark:hover:text-gold-400">الفرق</Link>
        <span aria-hidden>/</span>
        <span className="font-semibold text-ink">{team.name}</span>
      </nav>

      <header
        className="stripes mb-6 overflow-hidden rounded-[8px] border border-navy-700 text-white"
        style={{ backgroundImage: `linear-gradient(120deg, ${team.primary} 0%, #0F1B2E 65%)` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-6">
          <div className="flex items-center gap-4">
            <Crest slug={team.slug} size={76} />
            <div>
              <p className="eyebrow !text-white/50">{sport?.name}</p>
              <h1 className="text-2xl font-extrabold tracking-tight">{team.name}</h1>
              <p className="mt-1 text-[12px] text-white/70">
                {team.country} · {comp?.name} · تأسس <span className="num">{team.founded}</span>
              </p>
            </div>
          </div>

          <dl className="flex flex-wrap gap-6 text-center">
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">لعب</dt>
              <dd className="num text-xl font-extrabold">{record.w + record.d + record.l}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">ف/ت/خ</dt>
              <dd className="num text-xl font-extrabold text-gold-400">
                {record.w}/{record.d}/{record.l}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-white/45">الأهداف</dt>
              <dd className="num text-xl font-extrabold">
                {record.gf}–{record.ga}
              </dd>
            </div>
            {teamRow ? (
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-white/45">المركز</dt>
                <dd className="num text-xl font-extrabold text-gold-400">{teamRow.pos}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-2 border-t border-white/10 px-5 py-3 text-[11px] text-white/70">
          <span>🏟 {team.stadium ?? "—"}</span>
          {team.capacity ? <span className="num">السعة: {number(team.capacity)}</span> : null}
          <span>👔 المدرب: {team.coach ?? "—"}</span>
          <span>© القائد: {team.captain ?? "—"}</span>
        </div>
      </header>

      <Tabs
        label="تفاصيل الفريق"
        items={[
          {
            id: "overview",
            label: "نظرة عامة",
            content: (
              <div className="space-y-6">
                {live.length > 0 ? <Group title="مباشر الآن" list={live} /> : null}
                <Group title="المباريات القادمة" list={upcoming} />
                <Group title="آخر النتائج" list={played} />
                {matches.length === 0 ? (
                  <p className="card px-4 py-10 text-center text-[13px] text-muted">لا توجد مباريات مسجّلة لهذا الفريق.</p>
                ) : null}
              </div>
            ),
          },
          {
            id: "squad",
            label: "اللاعبون",
            content:
              grouped.length > 0 ? (
                <div className="space-y-5">
                  {grouped.map((g) => (
                    <section key={g.title}>
                      <h2 className="eyebrow mb-2">{g.title}</h2>
                      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {g.list.map((p) => (
                          <li key={p.slug}>
                            <Link
                              href={`/players/${p.slug}`}
                              className="card flex items-center gap-3 p-3 transition hover:border-gold-500/50"
                            >
                              <span className="num grid h-9 w-9 shrink-0 place-items-center rounded-[3px] bg-navy-850 text-[13px] font-extrabold text-gold-400">
                                {p.number ?? "—"}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-[13px] font-bold">{p.name}</span>
                                <span className="block truncate text-[11px] text-muted">
                                  {p.position} · {p.flag} {p.nationality} · {age(p.birth)} سنة
                                </span>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : (
                <p className="card px-4 py-10 text-center text-[13px] text-muted">
                  لا تتوفر قائمة لاعبين لهذا المشارك في النسخة التجريبية.
                </p>
              ),
          },
          {
            id: "matches",
            label: "المباريات والنتائج",
            content: <Group title="كل مباريات الموسم" list={matches} />,
          },
          {
            id: "table",
            label: "الترتيب",
            disabled: !table,
            content: table ? (
              <div className="space-y-3">
                <StandingsTable rows={table} />
                {teamRow ? (
                  <p className="text-[12px] text-muted">
                    يحتل {team.name} المركز <span className="num font-bold text-ink">{teamRow.pos}</span> برصيد{" "}
                    <span className="num font-bold text-ink">{teamRow.points}</span> نقطة في {comp?.name}.
                  </p>
                ) : null}
              </div>
            ) : null,
          },
          {
            id: "news",
            label: "الأخبار",
            content:
              news.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {news.map((a) => (
                    <NewsCard key={a.slug} article={a} />
                  ))}
                </div>
              ) : (
                <p className="card px-4 py-10 text-center text-[13px] text-muted">لا توجد أخبار مرتبطة بهذا الفريق.</p>
              ),
          },
        ]}
      />
    </div>
  );
}

function Group({ title, list }: { title: string; list: ReturnType<typeof teamMatches> }) {
  if (list.length === 0) return null;
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

/* ══════════════════════════════════════════════════════════════════════════
   Real-data team view
   ──────────────────────────────────────────────────────────────────────────
   Every value here is resolved from a provider: the identity from `team`, the
   league position/points/form from `standings`, and the matches from
   `fixtures` for the competition the standings row placed this team in. A
   section whose data could not be resolved says so instead of showing zeros.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Canonical NEMO match statuses are LOWERCASE — see FD_STATUS in
 * packages/sdl/src/adapters/football-data.ts, which normalizes football-data's
 * `FINISHED`/`IN_PLAY`/`TIMED` into `finished`/`live`/`scheduled`. The demo
 * `Match` type in lib/data.ts is the one domain that uses uppercase, so the two
 * vocabularies must not be mixed: comparing an SDL fixture against "FINISHED"
 * silently matches nothing and files every result under "upcoming".
 */
const STATUS_AR: Record<string, string> = {
  scheduled: "لم تبدأ",
  live: "جارية",
  halftime: "الاستراحة",
  extra_time: "وقت إضافي",
  extra_time_halftime: "استراحة الوقت الإضافي",
  penalty_shootout: "ركلات الترجيح",
  finished: "انتهت",
  awarded: "حُسمت بقرار",
  walkover: "انسحاب",
  suspended: "موقوفة",
  abandoned: "متوقفة",
  postponed: "مؤجلة",
  cancelled: "ملغاة",
};

const LIVE_STATUSES = new Set(["live", "halftime", "extra_time", "extra_time_halftime", "penalty_shootout"]);
const FINAL_STATUSES = new Set(["finished", "awarded", "walkover"]);

const arabicDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("ar-EG", {
    weekday: "short", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit", timeZone: "Africa/Cairo",
  });
};

function ProviderTeamFixtureList({ fixtures, showScore = false }: { fixtures: NormalizedFixture[]; showScore?: boolean }) {
  return (
    <ul className="space-y-2">
      {fixtures.slice(0, 10).map((fixture) => (
        <li key={fixture.providerId}>
          <Link href={`/matches/${encodeURIComponent(fixture.providerId)}`} className="card flex min-h-11 items-center justify-between gap-3 p-3 transition hover:border-gold-500/50 focus-ring">
            <span className="min-w-0 text-[13px]">
              <span className="block truncate font-bold">
                {fixture.homeName ?? fixture.homeProviderId ?? "—"} – {fixture.awayName ?? fixture.awayProviderId ?? "—"}
              </span>
              <span className="num block text-[11px] text-muted">{arabicDateTime(fixture.scheduledAt) ?? "—"}</span>
            </span>
            {showScore ? (
              <span className="num shrink-0 text-[15px] font-extrabold">
                {fixture.homeScore !== null && fixture.awayScore !== null ? `${fixture.homeScore} : ${fixture.awayScore}` : "النتيجة غير متاحة"}
              </span>
            ) : (
              <span className="chip shrink-0">{STATUS_AR[fixture.status] ?? "حالة غير معروفة"}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function RealTeamView(props: {
  slug: string;
  lookup?: RealTeamLookup;
  provider: string;
  fromCache: boolean;
  stale?: boolean;
  fetchedAt: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  countryName: string | null;
  foundedYear: number | null;
  venueName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
}) {
  /* Locate this team in a real league table: that row is the honest source for
   * its competition, position, points and form, and it also tells us which
   * competition to load matches from. */
  const found = props.lookup ?? (await findTeamInRealTables(props.slug));
  const row: NormalizedStandingRow | null = found?.row ?? null;
  const compId: string | null = found?.compId ?? null;

  /* Matches of that competition, filtered to this team. */
  const fixturesRes = compId ? await footballMatches({ competitionId: compId }) : null;
  const fixtureData = fixturesRes?.ok && fixturesRes.source.provider !== "demo" ? fixturesRes.data : [];
  const mine = fixtureData.filter(
    (f) => f.homeProviderId === props.slug || f.awayProviderId === props.slug,
  );
  const live = mine.filter((fixture) => LIVE_STATUSES.has(fixture.status)).sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  const upcoming = mine.filter((fixture) => fixture.status === "scheduled").sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  const played = mine.filter((fixture) => FINAL_STATUSES.has(fixture.status)).sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt));
  const special = mine.filter((fixture) => !LIVE_STATUSES.has(fixture.status) && fixture.status !== "scheduled" && !FINAL_STATUSES.has(fixture.status));

  const r = row as NormalizedStandingRow | null;

  const facts: [string, string | number | null][] = [
    ["الدولة", props.countryName],
    ["سنة التأسيس", props.foundedYear],
    ["الملعب", props.venueName],
    ["المركز", r?.position ?? null],
    ["النقاط", r?.points ?? null],
    ["لعب", r?.played ?? null],
    ["فاز / تعادل / خسر", r ? `${r.won} / ${r.drawn} / ${r.lost}` : null],
    ["فارق الأهداف", r ? r.goalsFor - r.goalsAgainst : null],
  ];

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-4 flex flex-wrap items-center gap-4">
        {props.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.logoUrl} alt="" width={72} height={72} className="h-[72px] w-[72px] object-contain" />
        ) : (
          <span className="grid h-[72px] w-[72px] place-items-center rounded-[6px] bg-navy-850 text-lg font-extrabold text-white/70">
            {(props.shortName ?? props.name).slice(0, 3).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="eyebrow mb-1">فريق · بيانات حقيقية</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{props.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
            {props.shortName ? <span>{props.shortName}</span> : null}
            {compId ? (
              <Link className="chip hover:text-white" href={`/competitions/${compId}`}>
                {competitionNameAr(compId)}
              </Link>
            ) : null}
            {props.primaryColor ? (
              <span className="flex items-center gap-1.5" title="ألوان الفريق">
                <span className="h-3 w-3 rounded-[2px]" style={{ background: props.primaryColor }} aria-hidden />
                {props.secondaryColor ? <span className="h-3 w-3 rounded-[2px]" style={{ background: props.secondaryColor }} aria-hidden /> : null}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <DataSourceNote provider={props.provider} fromCache={props.fromCache} stale={props.stale} fetchedAt={props.fetchedAt} className="mb-6" />

      <dl className="card mb-8 grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-4">
        {facts.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="truncate text-[11px] text-muted">{k}</dt>
            <dd className="num truncate text-[15px] font-bold">{v === null || v === "" ? "—" : v}</dd>
          </div>
        ))}
      </dl>

      {r?.form?.length ? <p className="mb-8 text-[12px] text-muted">سلسلة آخر النتائج: <span className="num font-bold tracking-[0.2em] text-white">{r.form.join("")}</span></p> : null}

      <div className="grid gap-8 lg:grid-cols-2">
        {live.length > 0 ? (
          <section>
            <h2 className="mb-3 border-b-2 border-line pb-2 text-lg font-extrabold">مباشر الآن</h2>
            <ProviderTeamFixtureList fixtures={live} />
          </section>
        ) : null}

        <section>
          <h2 className="mb-3 border-b-2 border-line pb-2 text-lg font-extrabold">المباريات القادمة</h2>
          {upcoming.length > 0 ? <ProviderTeamFixtureList fixtures={upcoming} /> : <p className="text-[12px] text-muted">لا توجد مباريات مجدولة ضمن نافذة المباريات المسترجعة حاليًا.</p>}
        </section>

        {special.length > 0 ? (
          <section>
            <h2 className="mb-3 border-b-2 border-line pb-2 text-lg font-extrabold">مباريات بحالات خاصة</h2>
            <ProviderTeamFixtureList fixtures={special} />
          </section>
        ) : null}

        <section>
          <h2 className="mb-3 border-b-2 border-line pb-2 text-lg font-extrabold">أحدث النتائج</h2>
          {played.length > 0 ? <ProviderTeamFixtureList fixtures={played} showScore /> : <p className="text-[12px] text-muted">لا توجد نتائج مكتملة ضمن نافذة المباريات المسترجعة حاليًا.</p>}
        </section>
      </div>


    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const t = await getAdminTeamBySlug(slug);
  if (t?.isPublished) {
    return {
      title: `${t.nameAr} | الفريق`,
      description: `${t.nameAr}${t.country ? ` — ${t.country}` : ""}: بيانات الفريق من إدارة نيمو سبورتس.`,
      alternates: { canonical: `/teams/${slug}` },
    };
  }
  return teamMetadataBody({ params });
}

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeSlug(rawSlug);
  const adminTeam = await getAdminTeamBySlug(slug);
  if (adminTeam?.isPublished) return <AdminTeamDetail team={adminTeam} />;
  return <TeamPageBody params={params} />;
}
