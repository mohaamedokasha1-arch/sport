import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MatchLive from "@/components/match/MatchLive";
import MatchStreamPlayer from "@/components/match/MatchStreamPlayer";
import DataSourceNote from "@/components/data/DataSourceNote";
import { allMatches, articles, matchBySlug } from "@/lib/data";
import { getLiveStates } from "@/lib/live";
import { inactiveStreamNote, streamForMatch, streamPhase } from "@/lib/match-streams";
import { applyDemoOverride, getOverride } from "@/lib/match-overrides";
import { awayTeam, compOf, dateAr, homeTeam, timeOf } from "@/lib/format";
import { SITE_TZ } from "@/lib/tz";
import { decodeSlug } from "@/lib/slug";
import { competitionBySlug, teamBySlug } from "@/lib/core-data";
import { competitionByPath } from "@/lib/competition-catalog";
import { getAdminMatchBySlug, adminMatchToFixture } from "@/lib/admin-matches";
import { isPubliclyVisible } from "@/lib/match-streams";
import ProviderCrest from "@/components/ui/ProviderCrest";
import { matchDetail as sdlMatchDetail, matchEvents, matchLineups, matchStats, PERMANENT_FAILURE_KINDS, hasMatchIdentity } from "@/lib/sdl-gateway";
import { demoContentVisible } from "@/lib/site";
import { serializeJsonLd } from "@/lib/json-ld";
import type { NormalizedEvent, NormalizedFixture, NormalizedLineup, NormalizedStat } from "@/packages/sdl/src";

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

const STATUS_AR: Record<string, string> = {
  live: "مباشر الآن",
  halftime: "استراحة بين الشوطين",
  extra_time: "وقت إضافي",
  extra_time_halftime: "استراحة الوقت الإضافي",
  penalty_shootout: "ركلات الترجيح",
  finished: "انتهت المباراة",
  scheduled: "لم تبدأ بعد",
  postponed: "مؤجَّلة",
  cancelled: "ملغاة",
  suspended: "موقوفة",
  abandoned: "متوقفة",
  walkover: "انسحاب",
  awarded: "حُسمت بقرار",
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

const EVENT_AR: Record<string, string> = {
  goal: "هدف",
  penalty: "هدف من ركلة جزاء",
  penalty_awarded: "ركلة جزاء محتسبة",
  "own-goal": "هدف عكسي",
  own_goal: "هدف عكسي",
  "missed-penalty": "ركلة جزاء ضائعة",
  penalty_missed: "ركلة جزاء ضائعة",
  yellow: "بطاقة صفراء",
  yellow_card: "بطاقة صفراء",
  red: "بطاقة حمراء",
  red_card: "بطاقة حمراء",
  yellow_red_card: "بطاقة صفراء ثانية",
  "second-yellow": "بطاقة صفراء ثانية",
  "sub-in": "تبديل",
  substitution: "تبديل",
  var: "مراجعة الفيديو",
  var_review: "مراجعة الفيديو",
  var_decision: "قرار تقنية الفيديو",
  period_start: "بداية الفترة",
  period_end: "نهاية الفترة",
  match_start: "بداية المباراة",
  match_end: "نهاية المباراة",
  injury: "توقف للإصابة",
  extra_time_start: "بداية الوقت الإضافي",
  penalty_shootout_start: "بداية ركلات الترجيح",
};

const STAT_LABELS_AR: Record<string, string> = {
  ball_possession: "الاستحواذ",
  possession: "الاستحواذ",
  shots_total: "إجمالي التسديدات",
  total_shots: "إجمالي التسديدات",
  shots_on_target: "تسديدات على المرمى",
  shots_on_goal: "تسديدات على المرمى",
  shots_off_target: "تسديدات خارج المرمى",
  corners: "الركنيات",
  corner_kicks: "الركنيات",
  fouls: "الأخطاء",
  offsides: "التسلل",
  yellow_cards: "البطاقات الصفراء",
  red_cards: "البطاقات الحمراء",
  saves: "التصديات",
  passes: "التمريرات",
  passes_accuracy: "دقة التمرير",
};

const STAT_PERIODS_AR: Record<string, string> = {
  first_half: "الشوط الأول",
  firsthalf: "الشوط الأول",
  "1h": "الشوط الأول",
  second_half: "الشوط الثاني",
  secondhalf: "الشوط الثاني",
  "2h": "الشوط الثاني",
  extra_time: "الوقت الإضافي",
  penalty_shootout: "ركلات الترجيح",
  period_1: "الفترة الأولى",
  period_2: "الفترة الثانية",
  period_3: "الفترة الثالثة",
  period_4: "الفترة الرابعة",
  q1: "الربع الأول",
  q2: "الربع الثاني",
  q3: "الربع الثالث",
  q4: "الربع الرابع",
};

function statLabel(type: string): string {
  const key = type.toLowerCase().replace(/[\s-]+/g, "_");
  return STAT_LABELS_AR[key] ?? "إحصائية أخرى";
}

function statPeriodSuffix(period: string): string {
  const key = period.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["", "all", "total", "full_time", "fulltime", "ft"].includes(key)) return "";
  return ` · ${STAT_PERIODS_AR[key] ?? "فترة أخرى"}`;
}

function eventDescriptionAr(description: string | null): string | null {
  const text = description?.trim();
  if (!text) return null;
  if (/[\u0600-\u06ff]/.test(text)) return text;

  const substitution = /^(?:in|player in):\s*(.+?)\s*[·,|]\s*(?:out|player out):\s*(.+)$/i.exec(text);
  if (substitution) return `دخول: ${substitution[1].trim()} · خروج: ${substitution[2].trim()}`;

  const assist = /^(?:assist|assisted by):\s*(.+)$/i.exec(text);
  if (assist) return `تمريرة حاسمة: ${assist[1].trim()}`;

  const key = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const known: Record<string, string> = {
    "goal disallowed": "هدف ملغى",
    "goal cancelled": "هدف ملغى",
    "penalty awarded": "احتُسبت ركلة جزاء",
    "penalty missed": "ركلة جزاء ضائعة",
    "tactical foul": "مخالفة تكتيكية",
    offside: "تسلل",
    handball: "لمسة يد",
  };
  return known[key] ?? null;
}

function clockOf(f: NormalizedFixture): string {
  if (f.status === "halftime") return "استراحة";
  if (f.minute !== null && ["live", "extra_time", "extra_time_halftime", "penalty_shootout"].includes(f.status)) return `${f.minute}'`;
  if (f.status === "finished") return "انتهت";
  if (f.status === "scheduled") return new Date(f.scheduledAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", timeZone: SITE_TZ });
  return STATUS_AR[f.status] ?? "حالة غير معروفة";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  // Arabic slugs arrive percent-encoded; decode once so every lookup (admin
  // match, stream registry, overrides, provider) uses the real slug.
  const slug = decodeSlug((await params).slug);

  // ── real match first ──
  const real = await sdlMatchDetail("football", slug);
  if (real.ok && real.source === "provider" && hasMatchIdentity(real.data)) {
    const f = real.data;
    const home = f.homeName ?? f.homeProviderId ?? "—";
    const away = f.awayName ?? f.awayProviderId ?? "—";
    const comp = f.competitionName ?? "";
    const date = dateAr(f.scheduledAt);
    const title = `${home} ضد ${away} | ${comp} | ${date}`;
    const description = `نتيجة وتفاصيل مباراة ${home} و${away} في ${comp}: النتيجة، حالة المباراة، الأحداث، والتشكيلات من مصدر البيانات المتاح.`;
    return {
      title,
      description,
      alternates: { canonical: `/matches/${slug}` },
      openGraph: { title, description, type: "article" },
    };
  }

  // ── admin match fallback ──
  const adminM = await getAdminMatchBySlug(slug).catch(() => null);
  if (adminM && adminM.isPublished) {
    const home = adminM.homeName || "—";
    const away = adminM.awayName || "—";
    const comp = adminM.competitionName || "مباراة";
    const date = dateAr(adminM.scheduledAt);
    const title = `${home} ضد ${away} | ${comp} | ${date}`;
    const description = `موعد وتفاصيل وبث مباراة ${home} ضد ${away} في ${comp}.`;
    return {
      title,
      description,
      alternates: { canonical: `/matches/${adminM.slug}` },
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

  // No real match and no demo match: a stable, non-indexable "not found".
  // The explicit robots directive keeps Next.js's built-in not-found noindex
  // from being emitted alongside the layout's `index, follow`.
  return { title: "المباراة غير موجودة", robots: { index: false, follow: true } };
}

const StatBar = ({ label, home, away }: { label: string; home: string; away: string }) => (
  <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2 border-b border-line px-3 py-2 text-[12px] last:border-0">
    <span className="num text-end font-extrabold">{home}</span>
    <span className="text-center text-muted">{label}</span>
    <span className="num font-extrabold">{away}</span>
  </div>
);

export default async function MatchPage({ params }: { params: Promise<{ slug: string }> }) {
  // Arabic slugs arrive percent-encoded; decode once so every lookup (admin
  // match, stream registry, overrides, provider) uses the real slug.
  const slug = decodeSlug((await params).slug);

  /* ══ 1) real match (SportScore via SDL or admin-managed fixture) ══════ */
  let f: NormalizedFixture | null = null;
  let providerName = "provider";
  let fromCache = false;
  let stale = false;
  let fetchedAt = new Date().toISOString();

  const real = await sdlMatchDetail("football", slug);
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
    const live = ["live", "halftime", "extra_time", "extra_time_halftime", "penalty_shootout"].includes(f.status);
    const played = f.homeScore !== null && f.awayScore !== null;

    // Stream source for THIS match only (null for every other match →
    // no player section renders there). See lib/match-streams.ts.
    const [eventsRes, lineupsRes, statsRes, stream, override] = await Promise.all([
      matchEvents(slug),
      matchLineups("football", slug),
      matchStats("football", slug),
      streamForMatch({ slug, home, away }),
      // The fixture itself is already corrected centrally in the gateway;
      // this read only decides whether the "corrected by admin" badge shows.
      getOverride(slug),
    ]);
    const events: NormalizedEvent[] = eventsRes.ok ? eventsRes.data : [];
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
        label: `${statLabel(pair.type)}${statPeriodSuffix(pair.period)}`,
        home: pair.home,
        away: pair.away,
      }));

    const ht = f.periods.find((p) => p.label === "HT");

    const homeTeamObj = teamBySlug(f.homeProviderId || home);
    const awayTeamObj = teamBySlug(f.awayProviderId || away);
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
          ? "https://schema.org/EventCompleted"
          : f.status === "postponed"
            ? "https://schema.org/EventPostponed"
          : f.status === "cancelled"
            ? "https://schema.org/EventCancelled"
            : ["live", "halftime", "extra_time", "extra_time_halftime", "penalty_shootout"].includes(f.status)
              ? "https://schema.org/EventInProgress"
              : "https://schema.org/EventScheduled",
      sport: "Football",
      url: `/matches/${slug}`,
      homeTeam: { "@type": "SportsTeam", name: home },
      awayTeam: { "@type": "SportsTeam", name: away },
      competitor: [{ "@type": "SportsTeam", name: home }, { "@type": "SportsTeam", name: away }],
    };

    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(ld) }} />
        <div className="mx-auto max-w-[1280px] px-4 py-6">
          <nav aria-label="مسار التنقل" className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
            <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">الرئيسية</Link>
            <span aria-hidden>/</span>
            <Link href="/matches" className="hover:text-gold-600 dark:hover:text-gold-400">المباريات</Link>
            <span aria-hidden>/</span>
            <Link href="/live" className="hover:text-gold-600 dark:hover:text-gold-400">البث المباشر</Link>
            <span aria-hidden>/</span>
            <span className="font-semibold text-ink">{home} × {away}</span>
          </nav>

          {/* H1 Title */}
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-ink text-center mb-3 tracking-tight">
            {home} ضد {away}
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
              {dateAr(f.scheduledAt)} · {new Date(f.scheduledAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", timeZone: SITE_TZ })}
              {f.venueName ? ` · ${f.venueName}` : ""}
              {" · "}
              {live ? "النتيجة والدقيقة تُحدَّثان تلقائيًا" : "موعد معتمد"}
            </p>
            {override ? (
              <p className="mt-2 text-center text-[11px]">
                <span className="inline-block rounded-[3px] bg-gold-500/15 px-2 py-0.5 font-bold text-gold-600 dark:text-gold-400">
                  مصحّحة من الإدارة{override.note ? ` — ${override.note}` : ""}
                </span>
              </p>
            ) : null}
          </header>

          {/* live stream — dedicated stream section */}
          {stream && isPubliclyVisible(stream) ? (
            <MatchStreamPlayer
              stream={stream}
              phase={streamPhase(f.status)}
              home={home}
              away={away}
              inactiveNote={inactiveStreamNote(f.status)}
            />
          ) : (
            <section id="live-stream" className="mt-8">
              <h2 className="mb-3 border-b-2 border-line pb-2 text-[15px] font-extrabold flex items-center justify-between">
                <span>البث المباشر</span>
                <span className="text-[11px] font-normal text-muted">مشغّل البث</span>
              </h2>
              <div className="card border-dashed px-4 py-8 text-center bg-navy-900/30">
                <span className="text-3xl block mb-2" aria-hidden>📺</span>
                <p className="text-[14px] font-extrabold text-ink">سيتم إتاحة البث عند توفره</p>
                <p className="mt-1.5 text-[12px] text-muted max-w-md mx-auto leading-relaxed">
                  لم يتم تفعيل رابط البث المباشر لهذه المباراة بعد. سيظهر المشغّل الرسمي تلقائيًا فور توفر بث رسمي مرخّص قبل انطلاق المباراة.
                </p>
              </div>
            </section>
          )}

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
                {events.map((event) => {
                  const teamName = event.teamProviderId && event.teamProviderId === f.homeProviderId
                    ? home
                    : event.teamProviderId && event.teamProviderId === f.awayProviderId
                      ? away
                      : null;
                  const description = eventDescriptionAr(event.description);
                  return (
                    <li key={event.providerEventId} className="flex items-center gap-3 px-3 py-2.5 text-[12.5px]">
                      <span className="num w-9 shrink-0 text-end font-extrabold text-gold-600 dark:text-gold-400">{event.minute !== null ? `${event.minute}'` : "—"}</span>
                      <span aria-hidden className="w-5 text-center">{EVENT_ICON[event.type] ?? "•"}</span>
                      <span className="min-w-0 flex-1">
                        <span className="font-bold">{EVENT_AR[event.type] ?? "حدث رياضي"}</span>
                        {teamName ? <span className="text-muted"> · {teamName}</span> : null}
                        {description ? <span className="text-muted"> · {description}</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {/* statistics (only when the provider has them) */}
          {statRows.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-3 border-b-2 border-line pb-2 text-[15px] font-extrabold">إحصائيات المباراة</h2>
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
              <h2 className="mb-3 border-b-2 border-line pb-2 text-[15px] font-extrabold">التشكيلات</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {lineups.map((lineup) => {
                  const teamName = lineup.teamProviderId === f.homeProviderId
                    ? home
                    : lineup.teamProviderId === f.awayProviderId
                      ? away
                      : "الفريق";
                  return (
                    <div key={lineup.teamProviderId} className="card overflow-hidden">
                      <header className="flex items-center justify-between border-b border-line bg-navy-850 px-3 py-2.5 text-white dark:bg-navy-850">
                        <h3 className="text-[13px] font-extrabold">{teamName}</h3>
                        {lineup.formation ? <span className="num text-[12px] font-bold text-gold-400">{lineup.formation}</span> : null}
                      </header>
                      <div className="grid gap-0 sm:grid-cols-2">
                        <div className="border-b border-line sm:border-e sm:border-b-0">
                          <p className="px-3 pt-2 text-[10.5px] font-bold uppercase tracking-wide text-muted">التشكيلة الأساسية</p>
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
                            <p className="px-3 pt-2 text-[10.5px] font-bold uppercase tracking-wide text-muted">البدلاء</p>
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
                      {lineup.coach ? <p className="border-t border-line px-3 py-2 text-[11px] text-muted">المدرب: {lineup.coach}</p> : null}
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

  /* ══ 2) development/demo fallback ══════════════════════════════════════ */
  if (demoContentVisible()) {
    const match = matchBySlug(slug);
    if (match) return <DemoMatchView slug={slug} />;
  }

  /* ══ 3) honest 404 — real pages come from real provider IDs only ══════ */
  notFound();
}

/* The original demo view, kept for development/preview design QA. */
async function DemoMatchView({ slug }: { slug: string }) {
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(ld) }} />
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <p className="mb-4 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[11px] font-semibold text-muted">بيانات معاينة للتطوير فقط — لا تمثل مباراة حقيقية.</p>
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
