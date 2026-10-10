import type { Metadata } from "next";
import LiveAutoRefresh from "@/components/data/LiveAutoRefresh";
import { liveMatches as sdlLiveMatches } from "@/lib/sdl-gateway";
import DataSourceNote from "@/components/data/DataSourceNote";
import { listAdminMatches, type AdminMatch } from "@/lib/admin-matches";
import { listMatchStreams, streamForMatch, type MatchStreamSource } from "@/lib/match-streams";
import LiveStreams from "@/components/public/LiveStreams";
import LiveMatchCard, { type LiveCardData } from "@/components/live/LiveMatchCard";
import DataUnavailable from "@/components/ui/DataUnavailable";

export const metadata: Metadata = {
  title: "البث المباشر ومواعيد المباريات",
  description: "تابع البث المباشر ونتائج ومواعيد مباريات اليوم من مصادر البيانات الرسمية المعتمدة بتوقيت مكة والقاهرة.",
  alternates: { canonical: "/live" },
};

export const revalidate = 30;

export default async function LivePage() {
  const [sdlRes, adminMatchesAll, publicStreams] = await Promise.all([
    sdlLiveMatches("football").catch(() => null),
    listAdminMatches().catch(() => [] as AdminMatch[]),
    listMatchStreams(false).catch(() => [] as MatchStreamSource[]),
  ]);

  const realData = sdlRes && sdlRes.ok && sdlRes.source === "provider" ? sdlRes : null;
  const publishedAdmin = adminMatchesAll.filter((m) => m.isPublished);

  // Build unified cards from both real SDL live data and published admin fixtures
  const seenSlugs = new Set<string>();
  const cardItems: LiveCardData[] = [];

  // 1. Process provider live matches if any
  if (realData && realData.data.length > 0) {
    for (const f of realData.data) {
      const slug = f.providerId;
      seenSlugs.add(slug);
      const stream = await streamForMatch({ slug, home: f.homeName, away: f.awayName }).catch(() => null);
      cardItems.push({
        id: slug,
        slug,
        homeName: f.homeName || f.homeProviderId || "—",
        awayName: f.awayName || f.awayProviderId || "—",
        homeLogo: f.homeLogoUrl,
        awayLogo: f.awayLogoUrl,
        competitionName: f.competitionName || "كرة قدم",
        scheduledAt: f.scheduledAt,
        status: f.status,
        homeScore: f.homeScore,
        awayScore: f.awayScore,
        minute: f.minute,
        stream,
      });
    }
  }

  // 2. Process published admin matches (5 verified matches + any others)
  for (const m of publishedAdmin) {
    if (seenSlugs.has(m.slug)) continue;
    seenSlugs.add(m.slug);
    const stream = await streamForMatch({ slug: m.slug, home: m.homeName, away: m.awayName }).catch(() => null);
    cardItems.push({
      id: m.id,
      slug: m.slug,
      homeName: m.homeName,
      awayName: m.awayName,
      homeLogo: m.homeLogo,
      awayLogo: m.awayLogo,
      competitionName: m.competitionName,
      competitionSlug: m.competitionSlug,
      scheduledAt: m.scheduledAt,
      status: m.status === "upcoming" ? "scheduled" : m.status,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      stream,
    });
  }

  // Split into live, upcoming, and finished
  const liveItems = cardItems.filter((item) =>
    ["live", "halftime", "extra_time", "extra_time_halftime", "penalty_shootout"].includes(item.status.toLowerCase())
  );
  const finishedItems = cardItems.filter((item) =>
    ["finished", "ended"].includes(item.status.toLowerCase())
  );
  // A kickoff in the past is not "upcoming" — even when the stored status
  // still says so (the same convention as /fixtures and /api/live).
  const upcomingItems = cardItems
    .filter((item) => !liveItems.includes(item) && !finishedItems.includes(item))
    .filter((item) => Number.isFinite(+new Date(item.scheduledAt)) && +new Date(item.scheduledAt) > Date.now())
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      {/* Top Header */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-4">
        <div>
          <p className="eyebrow mb-1">مباشر الآن — مركز المباريات</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">البث المباشر والمباريات</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="text-[12px] text-muted">
            <span className="num font-bold text-gold-500">{publicStreams.length}</span> بث متاح
            {" · "}
            <span className="num font-bold text-live">{liveItems.length}</span> جارية الآن
          </p>
          <LiveAutoRefresh intervalSeconds={60} />
        </div>
      </header>

      {/* Featured stream players if any streams are published */}
      <LiveStreams />

      {/* Live matches section */}
      {liveItems.length > 0 ? (
        <section aria-label="المباريات الجارية الآن" className="mb-10">
          <div className="mb-4 flex items-center justify-between border-b border-line pb-2">
            <h2 className="flex items-center gap-2 text-base font-extrabold text-live">
              <span className="live-dot !bg-live-red" aria-hidden />
              <span>مباشر الآن ({liveItems.length})</span>
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {liveItems.map((match) => (
              <LiveMatchCard key={match.id} match={match} />
            ))}
          </div>
        </section>
      ) : (
        <div className="mb-8 rounded-[6px] border border-line bg-navy-850/40 p-4 text-center">
          <p className="text-[13px] font-bold text-muted">لا توجد مباريات مباشرة الآن</p>
          <p className="mt-1 text-[11px] text-muted">
            ستظهر المباريات الجارية تلقائيًا هنا مع انطلاق صافرة البداية. يمكنك متابعة مواعيد مباريات اليوم والقادمة أدناه.
          </p>
        </div>
      )}

      {/* Upcoming / Scheduled Matches */}
      {upcomingItems.length > 0 ? (
        <section aria-label="المباريات القادمة" className="mb-10">
          <div className="mb-4 flex items-center justify-between border-b border-line pb-2">
            <h2 className="text-base font-extrabold text-ink">
              مباريات اليوم والقادمة ({upcomingItems.length})
            </h2>
            <span className="text-[12px] text-muted">التوقيت معتمد بتوقيت مكة المكرمة والقاهرة</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingItems.map((match) => (
              <LiveMatchCard key={match.id} match={match} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Finished Matches (if any) */}
      {finishedItems.length > 0 ? (
        <section aria-label="المباريات المنتهية" className="mb-10">
          <div className="mb-4 flex items-center justify-between border-b border-line pb-2">
            <h2 className="text-base font-extrabold text-muted">
              المباريات المكتملة مؤخرًا
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {finishedItems.map((match) => (
              <LiveMatchCard key={match.id} match={match} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Fallback when no matches at all */}
      {cardItems.length === 0 ? (
        <DataUnavailable
          title="لا توجد مباريات مسجلة حاليًا"
          message="سيتم تحديث جدول المباريات والبث فور ورود التحديثات الرسمية."
          actionHref="/fixtures"
          actionLabel="مراجعة جدول المباريات"
        />
      ) : null}

      <DataSourceNote
        className="mt-6 border-t border-line pt-4"
        provider={realData?.provider ?? "admin"}
        fromCache={realData?.fromCache ?? false}
        stale={realData?.stale ?? false}
        fetchedAt={realData?.fetchedAt ?? new Date().toISOString()}
      />
    </div>
  );
}
