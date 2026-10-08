import Link from "next/link";
import { AdminHead, Btn, NotConnected, Panel, Pill, Stat, Table } from "@/components/admin/ui";
import { actionLabel, listActivity } from "@/lib/activity";
import { dateAr, timeOf } from "@/lib/format";
import { listArticles } from "@/lib/news/store";
import { liveStreamStats, listMatchStreams } from "@/lib/match-streams";
import { adminMatchCounts } from "@/lib/admin-matches";
import { adminTeamCounts } from "@/lib/admin-teams";
import { adminPlayerCounts } from "@/lib/admin-players";
import { adminCompetitionCounts } from "@/lib/admin-competitions";
import { manualNewsCounts } from "@/lib/manual-news";
import { listOverrides } from "@/lib/match-overrides";
import { listBroadcasters } from "@/lib/broadcasts";
import { fixtures as loadFixtures, liveMatches as loadLiveMatches } from "@/lib/sdl-gateway";
import type { NormalizedFixture } from "@/packages/sdl/src";
import { requireUser } from "@/lib/admin-session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function safeDate(iso: string): string {
  return Number.isFinite(new Date(iso).getTime()) ? `${dateAr(iso)} · ${timeOf(iso)}` : "—";
}

function matchTitle(match: NormalizedFixture): string {
  return `${match.homeName || "الفريق المضيف"} × ${match.awayName || "الفريق الضيف"}`;
}

function matchScore(match: NormalizedFixture): string {
  return match.homeScore === null || match.awayScore === null
    ? "— : —"
    : `${match.homeScore} : ${match.awayScore}`;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    scheduled: "قادمة",
    live: "مباشرة",
    halftime: "استراحة",
    extra_time: "وقت إضافي",
    extra_time_halftime: "استراحة الوقت الإضافي",
    penalty_shootout: "ركلات الترجيح",
    finished: "انتهت",
    postponed: "مؤجلة",
    cancelled: "ملغاة",
    suspended: "موقوفة",
  };
  return labels[status] ?? status;
}

function sourcePill(source: "demo" | "provider", stale: boolean) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Pill tone={source === "demo" ? "warn" : "ok"}>
        {source === "demo" ? "بيانات تجريبية" : "مزوّد حقيقي"}
      </Pill>
      {stale ? <Pill tone="warn">آخر قيمة محفوظة</Pill> : null}
    </span>
  );
}

function LiveMatchCard({ match }: { match: NormalizedFixture }) {
  return (
    <article key={match.providerId} className="rounded-[3px] border border-navy-800 bg-navy-950/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-extrabold">{matchTitle(match)}</p>
          <p className="mt-1 truncate text-[10px] text-white/45">
            {match.competitionName ?? match.competitionProviderId}
          </p>
        </div>
        <Pill tone="bad">{statusLabel(match.status)}</Pill>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3 border-t border-navy-800 pt-3">
        <span className="num text-[11px] text-white/50">
          {match.minute === null ? "الآن" : `${match.minute}′`}
        </span>
        <span className="num text-2xl font-extrabold text-gold-400">{matchScore(match)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-navy-800 pt-3">
        <Link
          href={`/admin/matches?slug=${encodeURIComponent(match.providerId)}#edit`}
          className="rounded-[3px] border border-navy-700 px-2.5 py-1.5 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400"
        >
          تصحيح النتيجة
        </Link>
        <Link
          href={`/matches/${encodeURIComponent(match.providerId)}`}
          className="rounded-[3px] border border-navy-700 px-2.5 py-1.5 text-[11px] font-bold text-white/55 transition hover:border-gold-500 hover:text-gold-400"
        >
          عرض المباراة
        </Link>
      </div>
    </article>
  );
}

export default async function AdminDashboard() {
  await requireUser();
  const [liveResult, fixturesResult, streams, overrides, broadcasters, articleResult, activityResult, matchCounts, teamCounts, playerCounts, competitionCounts, newsCounts, streamStats] = await Promise.all([
    loadLiveMatches("football"),
    loadFixtures({ sport: "football" }),
    listMatchStreams(false),
    listOverrides(),
    listBroadcasters(true),
    listArticles({ status: "published", limit: 5 }),
    listActivity(5),
    adminMatchCounts(),
    adminTeamCounts(),
    adminPlayerCounts(),
    adminCompetitionCounts(),
    manualNewsCounts(),
    liveStreamStats(),
  ]);
  const rssTotal = articleResult.items.length;

  const live = liveResult.ok ? liveResult.data.filter((match) =>
    ["live", "halftime", "extra_time", "extra_time_halftime", "penalty_shootout"].includes(match.status),
  ) : [];
  const now = Date.now();
  const upcoming = fixturesResult.ok
    ? fixturesResult.data
        .filter((match) => match.status === "scheduled" && +new Date(match.scheduledAt) >= now)
        .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))
        .slice(0, 6)
    : [];
  const pendingBroadcasters = broadcasters.filter((entry) => entry.status === "pending").length;
  const liveCount = liveResult.ok ? String(live.length) : "—";
  const upcomingCount = fixturesResult.ok
    ? String(fixturesResult.data.filter((match) => match.status === "scheduled" && +new Date(match.scheduledAt) >= now).length)
    : "—";

  return (
    <div>
      <AdminHead
        title="لوحة البيانات"
        subtitle={`نظرة عامة · ${dateAr(new Date().toISOString())} · نتائج كرة القدم من طبقة البيانات`}
        action={
          <span className="flex flex-wrap gap-2">
            <Link href="/admin/live-matches"><Btn tone="ghost">المباريات المباشرة</Btn></Link>
            <Link href="/admin/upcoming-matches"><Btn>المباريات القادمة</Btn></Link>
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Stat label="عدد المباريات" value={String(matchCounts.total + (fixturesResult.ok ? fixturesResult.data.length : 0))} hint={`${matchCounts.total} من الإدارة`} />
        <Stat label="مباريات اليوم" value={String(matchCounts.today)} hint="بتوقيت القاهرة (الإدارة)" />
        <Stat label="مباريات مباشرة" value={liveCount} hint={liveResult.ok ? `${matchCounts.live} من الإدارة` : "تعذّر جلب المزوّد"} />
        <Stat label="مباريات قادمة" value={upcomingCount} hint={`${matchCounts.upcoming} من الإدارة`} />
        <Stat label="عدد الفرق" value={String(teamCounts.total)} hint={`${teamCounts.published} منشور`} />
        <Stat label="عدد اللاعبين" value={String(playerCounts.total)} hint={`${playerCounts.published} منشور`} />
        <Stat label="عدد البطولات" value={String(competitionCounts.total)} hint={`${competitionCounts.published} منشورة`} />
        <Stat label="عدد الأخبار" value={String(newsCounts.published + rssTotal)} hint={`${newsCounts.published} يدوي · ${newsCounts.draft} مسودة`} />
        <Stat label="بثوث منشورة" value={String(streamStats.published + streamStats.live)} hint="تظهر للزوار" />
        <Stat label="بثوث نشطة الآن" value={String(streamStats.live)} hint={`${streamStats.draft} مسودة · ${streamStats.disabled} موقوف`} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Panel
            title="المباريات الجارية الآن"
            aside={liveResult.ok ? sourcePill(liveResult.source, liveResult.stale) : <Pill tone="warn">المصدر غير متاح</Pill>}
          >
            {!liveResult.ok ? (
              <NotConnected
                title="تعذّر جلب المباريات المباشرة"
                message="لم تُرجع طبقة البيانات نتيجة صالحة الآن. لن نستبدلها بنتيجة أو أرقام تقديرية."
                requires="راجع صحة المزوّدين"
              />
            ) : live.length === 0 ? (
              <p className="rounded-[3px] border border-dashed border-navy-700 px-4 py-6 text-center text-[12px] text-white/50">
                لا توجد مباراة جارية في المصدر حاليًا.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {live.slice(0, 4).map((match) => <LiveMatchCard key={match.providerId} match={match} />)}
              </div>
            )}
            <div className="mt-3 text-end">
              <Link href="/admin/live-matches" className="text-[11px] font-bold text-gold-400 hover:underline">
                كل المباريات المباشرة ←
              </Link>
            </div>
          </Panel>

          <Panel
            title="أقرب المباريات القادمة"
            aside={fixturesResult.ok ? sourcePill(fixturesResult.source, fixturesResult.stale) : <Pill tone="warn">المصدر غير متاح</Pill>}
          >
            {!fixturesResult.ok ? (
              <NotConnected
                title="تعذّر جلب جدول المباريات"
                message="طبقة البيانات لم تُرجع قائمة صالحة. راجع حالة المزوّدين؛ لا نملأ الجدول بمواعيد مخترعة."
                requires="مصدر مباريات متاح"
              />
            ) : upcoming.length === 0 ? (
              <p className="rounded-[3px] border border-dashed border-navy-700 px-4 py-6 text-center text-[12px] text-white/50">
                لا توجد مباريات قادمة ضمن نافذة البيانات الحالية.
              </p>
            ) : (
              <Table
                head={["المباراة", "البطولة", "الموعد", "الحالة", ""]}
                rows={upcoming.slice(0, 5).map((match) => [
                  <span key="match" className="block max-w-[220px] truncate font-bold" title={matchTitle(match)}>{matchTitle(match)}</span>,
                  <span key="competition" className="block max-w-[140px] truncate text-white/50">{match.competitionName ?? match.competitionProviderId}</span>,
                  <span key="date" className="num whitespace-nowrap text-[11px] text-white/65">{safeDate(match.scheduledAt)}</span>,
                  <Pill key="status" tone="idle">{statusLabel(match.status)}</Pill>,
                  <Link key="action" href={`/admin/broadcast?${new URLSearchParams({ match: match.providerId, home: match.homeName ?? "", away: match.awayName ?? "" }).toString()}#match-stream-form`} className="whitespace-nowrap text-[11px] font-bold text-gold-400 hover:underline">
                    ربط ناقل ←
                  </Link>,
                ])}
              />
            )}
            <div className="mt-3 text-end">
              <Link href="/admin/upcoming-matches" className="text-[11px] font-bold text-gold-400 hover:underline">
                جدول المباريات القادمة ←
              </Link>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="مهام سريعة" aside={<Pill tone={pendingBroadcasters > 0 ? "warn" : "idle"}>{pendingBroadcasters} قيد المراجعة</Pill>}>
            <ul className="space-y-2 text-[12px]">
              <li className="flex items-center justify-between gap-2 rounded-[3px] border border-navy-800 px-3 py-2">
                <span>مراجعة ناقل بث جديد</span>
                <Link href="/admin/broadcast" className="font-bold text-gold-400">مراجعة ←</Link>
              </li>
              <li className="flex items-center justify-between gap-2 rounded-[3px] border border-navy-800 px-3 py-2">
                <span>مراجعة {overrides.length} تصحيح نتيجة</span>
                <Link href="/admin/matches" className="font-bold text-gold-400">فتح ←</Link>
              </li>
              <li className="flex items-center justify-between gap-2 rounded-[3px] border border-navy-800 px-3 py-2">
                <span>فحص مزوّدي البيانات</span>
                <Link href="/admin/providers" className="font-bold text-gold-400">فحص ←</Link>
              </li>
            </ul>
          </Panel>

          <Panel title="آخر الأخبار المنشورة" aside={<Link href="/admin/news" className="text-[11px] font-bold text-gold-400">إدارة الأخبار ←</Link>}>
            {articleResult.items.length === 0 ? (
              <NotConnected
                title="لا توجد مقالات محفوظة"
                message="لا توجد مقالات منشورة في مخزن الأخبار الحالي. لن نعرض عناوين أو مشاهدات تجريبية هنا."
                requires="مخزن أخبار موصول ومحتوى منشور"
              />
            ) : (
              <ol className="space-y-3">
                {articleResult.items.map((article) => (
                  <li key={article.id} className="min-w-0 border-b border-navy-800 pb-2.5 last:border-0 last:pb-0">
                    <p className="truncate text-[11px] font-bold">{article.title}</p>
                    <p className="mt-1 truncate text-[10px] text-white/40">{article.sourceName} · {safeDate(article.publicationDate)}</p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="آخر نشاط إداري" aside={<Link href="/admin/activity" className="text-[11px] font-bold text-gold-400">السجل الكامل ←</Link>}>
            {activityResult.items.length === 0 ? (
              <p className="text-[11px] leading-relaxed text-white/45">لا توجد إجراءات مسجلة بعد. ستظهر هنا تصحيحات المباريات وإدارة المصادر عند حفظها.</p>
            ) : (
              <ol className="space-y-2">
                {activityResult.items.map((entry) => (
                  <li key={entry.id} className="flex min-w-0 items-start justify-between gap-3 border-b border-navy-800 pb-2 last:border-0 last:pb-0">
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-bold">{actionLabel(entry.action)}</span>
                      <span className="num mt-0.5 block truncate text-[10px] text-white/40" dir="ltr">{entry.entityId ?? entry.entityType ?? "—"}</span>
                    </span>
                    <span className="num shrink-0 text-[10px] text-white/40">{timeOf(entry.createdAt)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Panel title="تحليلات الزيارات">
          <NotConnected
            title="خدمة التحليلات غير موصولة"
            message="لا توجد خدمة قياس زيارات مرتبطة بالمنصة، لذلك لا نعرض عدد زوار أو مخططًا تقديريًا."
            requires="ربط خدمة تحليلات عند الحاجة"
          />
        </Panel>
        <Panel title="حدود إدارة المباريات">
          <p className="text-[11px] leading-relaxed text-white/50">
            المواعيد والفرق والنتائج الأساسية تأتي من مزوّدي البيانات. لوحة الإدارة تسجل تصحيحات قابلة للتراجع وتدير مصادر البث الرسمية لكل مباراة؛ لا تنشئ لقاءات أو روابط بث غير موثّقة.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/admin/matches"><Btn tone="ghost">تصحيحات النتائج</Btn></Link>
            <Link href="/admin/broadcast"><Btn tone="ghost">البث والترخيص</Btn></Link>
          </div>
        </Panel>
      </div>
    </div>
  );
}
