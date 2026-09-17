import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MatchLive from "@/components/match/MatchLive";
import PoweredBy from "@/components/ui/PoweredBy";
import { allMatches, articles, matchBySlug } from "@/lib/data";
import { getLiveStates } from "@/lib/live";
import { awayTeam, compOf, dateAr, homeTeam, timeOf } from "@/lib/format";
import { teamBySlug } from "@/lib/core-data";
import { matchDetail as sdlMatchDetail, matchEvents, matchLineups, matchStats } from "@/lib/sdl-gateway";
import { demoContentVisible } from "@/lib/site";
import type { NormalizedEvent, NormalizedFixture, NormalizedLineup, NormalizedStat } from "@/packages/sdl/src";

export const revalidate = 30;

export function generateStaticParams() {
  // Demo slugs are prerendered for development/preview only; production
  // renders real provider matches on demand (dynamicParams stays true).
  return demoContentVisible() ? allMatches.map((m) => ({ slug: m.slug })) : [];
}

const STATUS_AR: Record<string, string> = {
  live: "مباشر الآن",
  halftime: "الشوط الأول انتهى — استراحة",
  extra_time: "وقت إضافي",
  penalty_shootout: "ركلات الترجيح",
  finished: "انتهت المباراة",
  scheduled: "لم تبدأ بعد",
  postponed: "مؤجَّلة",
  cancelled: "ملغاة",
  suspended: "موقوفة",
  abandoned: "متوقفة",
  walkover: "انسحاب",
};

const EVENT_ICON: Record<string, string> = {
  goal: "⚽",
  penalty: "⚽",
  "own-goal": "⚽",
  "missed-penalty": "🚫",
  yellow: "🟨",
  red: "🟥",
  "second-yellow": "🟥",
  "sub-in": "🔄",
  var: "📺",
};

const EVENT_AR: Record<string, string> = {
  goal: "هدف",
  penalty: "هدف من ركلة جزاء",
  "own-goal": "هدف عكسي",
  "missed-penalty": "ركلة جزاء ضائعة",
  yellow: "بطاقة صفراء",
  red: "بطاقة حمراء",
  "second-yellow": "بطاقة صفراء ثانية",
  "sub-in": "تبديل",
  var: "مراجعة الفيديو",
};

function clockOf(f: NormalizedFixture): string {
  if (f.status === "halftime") return "استراحة";
  if (f.minute !== null && ["live", "extra_time", "penalty_shootout"].includes(f.status)) return `${f.minute}'`;
  if (f.status === "finished") return "انتهت";
  if (f.status === "scheduled") return new Date(f.scheduledAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  return STATUS_AR[f.status] ?? f.status;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  // ── real match first ──
  const real = await sdlMatchDetail("football", slug);
  if (real.ok) {
    const f = real.data;
    const home = f.homeName ?? f.homeProviderId ?? "—";
    const away = f.awayName ?? f.awayProviderId ?? "—";
    const comp = f.competitionName ?? "";
    const date = dateAr(f.scheduledAt);
    const title = `${home} ضد ${away} | ${comp} | ${date}`;
    const description = `نتيجة وتفاصيل مباراة ${home} و${away} في ${comp}: النتيجة، حالة المباراة، الأحداث، والتشكيلات — بيانات حية.`;
    return {
      title,
      description,
      alternates: { canonical: `/matches/${slug}` },
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
        title: `${home.name} ضد ${away.name} | ${comp.name} | ${dateAr(m.kickoff)}`,
        description: `نتيجة وتفاصيل مباراة ${home.name} و${away.name} في ${comp.name}.`,
        alternates: { canonical: `/matches/${m.slug}` },
        openGraph: { title: `${home.name} ضد ${away.name}`, type: "article" },
      };
    }
  }

  return { title: "المباراة غير موجودة" };
}

const StatBar = ({ label, home, away }: { label: string; home: string; away: string }) => (
  <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2 border-b border-line px-3 py-2 text-[12px] last:border-0">
    <span className="num text-end font-extrabold">{home}</span>
    <span className="text-center text-muted">{label}</span>
    <span className="num font-extrabold">{away}</span>
  </div>
);

export default async function MatchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  /* ══ 1) real provider match (SportScore via the SDL) ══════════════════ */
  const real = await sdlMatchDetail("football", slug);
  if (!real.ok && real.error.kind !== "not_found" && real.error.kind !== "no_provider_configured") {
    // Transient provider/cache outage: abort this render so ISR keeps the
    // last good page (a failed background revalidation retains the previous
    // version). First-time renders hit the branded error boundary. Throwing
    // here also prevents an outage from writing a permanent 404 into the
    // ISR cache — 404 is reserved for a match that truly cannot exist, which
    // includes a deployment with no detail provider configured at all
    // (retrying can never change that answer, so a stable 404 is honest).
    throw new Error(`match_detail_unavailable:${real.error.kind}`);
  }
  if (real.ok) {
    const f = real.data;
    const home = f.homeName ?? f.homeProviderId ?? "—";
    const away = f.awayName ?? f.awayProviderId ?? "—";
    const live = ["live", "halftime", "extra_time", "penalty_shootout"].includes(f.status);
    const played = f.homeScore !== null && f.awayScore !== null;

    const [eventsRes, lineupsRes, statsRes] = await Promise.all([
      matchEvents(slug),
      matchLineups("football", slug),
      matchStats("football", slug),
    ]);
    const events: NormalizedEvent[] = eventsRes.ok ? eventsRes.data : [];
    const lineups: NormalizedLineup[] = lineupsRes.ok ? lineupsRes.data : [];
    const rawStats: NormalizedStat[] = statsRes.ok ? statsRes.data : [];
    // pair home/away values per stat label
    const statPairs = new Map<string, { home: string; away: string }>();
    for (const s of rawStats) {
      const cur = statPairs.get(s.type) ?? { home: "—", away: "—" };
      if (s.teamProviderId === home) cur.home = String(s.value);
      else if (s.teamProviderId === away) cur.away = String(s.value);
      statPairs.set(s.type, cur);
    }
    const statRows = [...statPairs.entries()];

    const ht = f.periods.find((p) => p.label === "HT");

    const ld = {
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: `${home} vs ${away}`,
      startDate: f.scheduledAt,
      eventStatus:
        f.status === "finished"
          ? "https://schema.org/EventCompleted"
          : f.status === "postponed"
            ? "https://schema.org/EventPostponed"
            : f.status === "cancelled"
              ? "https://schema.org/EventCancelled"
              : "https://schema.org/EventScheduled",
      sport: "Football",
      url: `/matches/${slug}`,
      homeTeam: { "@type": "SportsTeam", name: home },
      awayTeam: { "@type": "SportsTeam", name: away },
      competitor: [{ "@type": "SportsTeam", name: home }, { "@type": "SportsTeam", name: away }],
    };

    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
        <div className="mx-auto max-w-[1280px] px-4 py-6">
          <nav aria-label="مسار التنقل" className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">الرئيسية</Link>
            <span aria-hidden>/</span>
            <Link href="/matches" className="hover:text-gold-600 dark:hover:text-gold-400">المباريات</Link>
            <span aria-hidden>/</span>
            <span className="font-semibold text-ink">{home} × {away}</span>
          </nav>

          {/* scoreboard */}
          <header className={`card relative overflow-hidden px-4 py-6 ${live ? "border-live-red/40" : ""}`}>
            {live ? <span className="absolute inset-x-0 top-0 h-0.5 bg-live-red" aria-hidden /> : null}
            <p className="mb-4 text-center text-[11px] text-muted">{f.competitionName ?? ""}</p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="flex flex-col items-center gap-2 text-center">
                {f.homeLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.homeLogoUrl} alt="" width={44} height={44} className="h-11 w-11 object-contain" />
                ) : null}
                <span className="text-[13px] font-extrabold">{home}</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                {played ? (
                  <span className="num text-4xl font-extrabold tabular-nums">
                    {f.homeScore} : {f.awayScore}
                  </span>
                ) : (
                  <span className="num text-2xl font-extrabold text-muted">— : —</span>
                )}
                <span className={`text-[12px] font-extrabold ${live ? "text-live-red" : "text-muted"}`}>
                  {clockOf(f)}
                </span>
                {ht ? (
                  <span className="num text-[11px] text-muted">
                    الشوط الأول: {ht.home} : {ht.away}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-col items-center gap-2 text-center">
                {f.awayLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.awayLogoUrl} alt="" width={44} height={44} className="h-11 w-11 object-contain" />
                ) : null}
                <span className="text-[13px] font-extrabold">{away}</span>
              </div>
            </div>
            <p className="mt-4 text-center text-[11px] text-muted">
              {dateAr(f.scheduledAt)} · {new Date(f.scheduledAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
              {" · "}
              {live ? "النتيجة والدقيقة تُحدَّثان تلقائيًا من المصدر" : "بيانات حقيقية من طبقة البيانات"}
            </p>
          </header>

          {/* events timeline */}
          <section className="mt-8">
            <h2 className="mb-3 border-b-2 border-line pb-2 text-[15px] font-extrabold">أحداث المباراة</h2>
            {events.length === 0 ? (
              <p className="card px-4 py-6 text-center text-[12.5px] text-muted">
                {f.status === "scheduled"
                  ? "لم تبدأ المباراة بعد — ستظهر الأحداث هنا مباشرة مع بدايتها."
                  : "لا توجد أحداث مسجَّلة لهذه المباراة من المصدر حاليًا."}
              </p>
            ) : (
              <ol className="card divide-y divide-line">
                {events.map((e) => (
                  <li key={e.providerEventId} className="flex items-center gap-3 px-3 py-2.5 text-[12.5px]">
                    <span className="num w-9 shrink-0 text-end font-extrabold text-gold-600 dark:text-gold-400">{e.minute !== null ? `${e.minute}'` : "—"}</span>
                    <span aria-hidden className="w-5 text-center">{EVENT_ICON[e.type] ?? "•"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-bold">{EVENT_AR[e.type] ?? e.type}</span>
                      {" · "}
                      <span>{e.playerProviderId ?? "—"}</span>
                      {e.description ? <span className="text-muted"> ({e.description})</span> : null}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted">{e.teamProviderId ?? ""}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* statistics (only when the provider has them) */}
          {statRows.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-3 border-b-2 border-line pb-2 text-[15px] font-extrabold">إحصائيات المباراة</h2>
              <div className="card overflow-hidden">
                {statRows.map(([label, v]) => (
                  <StatBar key={label} label={label} home={v.home} away={v.away} />
                ))}
              </div>
            </section>
          ) : null}

          {/* lineups */}
          {lineups.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-3 border-b-2 border-line pb-2 text-[15px] font-extrabold">التشكيلات</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {lineups.map((lu) => (
                  <div key={lu.teamProviderId} className="card overflow-hidden">
                    <header className="flex items-center justify-between border-b border-line bg-navy-850 px-3 py-2.5 text-white dark:bg-navy-850">
                      <h3 className="text-[13px] font-extrabold">{lu.teamProviderId}</h3>
                      {lu.formation ? <span className="num text-[12px] font-bold text-gold-400">{lu.formation}</span> : null}
                    </header>
                    <div className="grid gap-0 sm:grid-cols-2">
                      <div className="border-b border-line sm:border-e sm:border-b-0">
                        <p className="px-3 pt-2 text-[10.5px] font-bold uppercase tracking-wide text-muted">التشكيلة الأساسية</p>
                        <ul className="p-2">
                          {lu.starters.map((p) => (
                            <li key={p.providerId} className="flex items-center gap-2 px-1 py-1 text-[12px]">
                              <span className="num w-6 shrink-0 text-end font-bold text-muted">{p.jerseyNumber ?? "–"}</span>
                              <span className="truncate font-semibold">{p.name}</span>
                              {p.position ? <span className="shrink-0 text-[10px] text-muted">{p.position}</span> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {lu.bench.length > 0 ? (
                        <div>
                          <p className="px-3 pt-2 text-[10.5px] font-bold uppercase tracking-wide text-muted">البدلاء</p>
                          <ul className="p-2">
                            {lu.bench.map((p) => (
                              <li key={p.providerId} className="flex items-center gap-2 px-1 py-1 text-[12px] text-muted">
                                <span className="num w-6 shrink-0 text-end font-bold">{p.jerseyNumber ?? "–"}</span>
                                <span className="truncate">{p.name}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                    {lu.coach ? <p className="border-t border-line px-3 py-2 text-[11px] text-muted">المدرب: {lu.coach}</p> : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[11px] text-muted">
            <span>
              المصدر: {real.provider} · آخر جلب: {new Date(real.fetchedAt).toLocaleTimeString("ar-EG")}
              {real.fromCache ? " (من الكاش)" : ""}
            </span>
            <PoweredBy />
          </div>
        </div>
      </>
    );
  }

  /* ══ 2) development/demo fallback ══════════════════════════════════════ */
  if (demoContentVisible()) {
    const match = matchBySlug(slug);
    if (match) return <DemoMatchView slug={slug} />;
  }

  /* ══ 3) honest 404 — real pages come from real provider IDs only ══════ */
  notFound();
}

/* The original demo view, kept for development/preview design QA. */
function DemoMatchView({ slug }: { slug: string }) {
  const match = matchBySlug(slug);
  if (!match) notFound();

  const home = homeTeam(match);
  const away = awayTeam(match);
  const comp = compOf(match);
  const states = getLiveStates();
  const state = states[match.id];

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
        ? "https://schema.org/EventCompleted"
        : state.status === "POSTPONED"
          ? "https://schema.org/EventPostponed"
          : state.status === "CANCELLED"
            ? "https://schema.org/EventCancelled"
            : "https://schema.org/EventScheduled",
    sport: comp.nameEn,
    url: `/matches/${match.slug}`,
    location: match.venue
      ? { "@type": "Place", name: match.venue, address: { "@type": "PostalAddress", addressCountry: home.country } }
      : undefined,
    homeTeam: { "@type": "SportsTeam", name: home.nameEn },
    awayTeam: { "@type": "SportsTeam", name: away.nameEn },
    organizer: { "@type": "Organization", name: comp.nameEn },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <nav aria-label="مسار التنقل" className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">الرئيسية</Link>
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
          relatedNews={related.map((a) => ({
            slug: a.slug,
            title: a.title,
            excerpt: a.excerpt,
            author: a.author,
            publishedAgoMin: a.publishedAgoMin,
          }))}
        />

        <section className="mt-8">
          <h2 className="mb-3 border-b-2 border-line pb-2 text-[15px] font-extrabold">مباريات أخرى في {comp.name}</h2>
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
