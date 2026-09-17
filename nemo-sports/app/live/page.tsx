import type { Metadata } from "next";
import Link from "next/link";
import MatchCard from "@/components/match/MatchCard";
import SectionHead from "@/components/ui/SectionHead";
import { allMatches, liveMatches } from "@/lib/data";
import { getLiveStates } from "@/lib/live";
import { competitionBySlug, sports } from "@/lib/core-data";
import LiveFeed from "@/components/live/LiveFeed";
import ProviderMatchList from "@/components/data/ProviderMatchList";
import LiveAutoRefresh from "@/components/data/LiveAutoRefresh";
import { liveMatches as sdlLiveMatches } from "@/lib/sdl-gateway";
import { demoContentVisible } from "@/lib/site";
import DataUnavailable from "@/components/ui/DataUnavailable";

export const metadata: Metadata = {
  title: "النتائج المباشرة — كل المباريات الجارية الآن",
  description: "غرفة النتائج المباشرة: كل المباريات الجارية الآن عبر 8 رياضات مع تحديث تلقائي كل 5 ثوانٍ.",
  alternates: { canonical: "/live" },
};

export const revalidate = 30;

export default async function LivePage() {
  // ── real data first (SportScore via the SDL) ──────────────────────────
  const real = await sdlLiveMatches("football");
  const realLive = real.ok ? real.data : [];

  // Demo content renders in development/preview only; production never shows it.
  const showDemo = demoContentVisible();

  const states = getLiveStates();
  const now = Date.now();

  const bySport = liveMatches.reduce<Record<string, typeof liveMatches>>((acc, m) => {
    (acc[m.sport] ||= []).push(m);
    return acc;
  }, {});

  const startingSoon = allMatches
    .filter((m) => {
      const s = states[m.id]?.status;
      const diff = +new Date(m.kickoff) - now;
      return s === "UPCOMING" && diff > 0 && diff < 3 * 3600 * 1000;
    })
    .sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff));

  const justFinished = allMatches
    .filter((m) => states[m.id]?.status === "FINISHED" && now - +new Date(m.kickoff) < 6 * 3600 * 1000)
    .sort((a, b) => +new Date(b.kickoff) - +new Date(a.kickoff))
    .slice(0, 6);

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <LiveFeed sport="football" />
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1 flex items-center gap-2">
            <span className="live-dot" aria-hidden /> Live Scores
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight">النتائج المباشرة</h1>
        </div>
        <p className="text-[12px] text-muted">
          <span className="num font-bold text-live">{liveMatches.length}</span> مباراة جارية ·{" "}
          <span className="num font-bold">{startingSoon.length}</span> تبدأ خلال 3 ساعات
        </p>
      </header>

      {real.ok && realLive.length > 0 ? (
        <section className="mb-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] font-bold text-live-red">
              <span className="live-dot" aria-hidden /> {realLive.length} مباراة جارية الآن (بيانات حقيقية)
            </p>
            <LiveAutoRefresh intervalSeconds={60} />
          </div>
          <ProviderMatchList fixtures={realLive} />
        </section>
      ) : real.ok ? (
        <div className="card grid place-items-center gap-2 px-6 py-16 text-center">
          <p className="text-[15px] font-bold">لا توجد مباريات جارية حاليًا</p>
          <p className="text-[13px] text-muted">ستظهر هنا تلقائيًا فور انطلاق أول مباراة.</p>
        </div>
      ) : showDemo && liveMatches.length > 0 ? (
        <div className="space-y-8">
          {Object.entries(bySport).map(([sport, list]) => (
            <section key={sport}>
              <SectionHead
                eyebrow={competitionBySlug(list[0].competition)?.country}
                title={`${sports.find((s) => s.slug === sport)?.icon ?? ""} ${sports.find((s) => s.slug === sport)?.name ?? ""}`}
                accent
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <DataUnavailable
          title="البيانات المباشرة غير متوفرة حاليًا"
          message="تعذر الوصول إلى مصدر البيانات الحي الآن. لن نعرض أي مباراة أو نتيجة أو دقيقة غير مؤكدة — ستعود القسم للعمل تلقائيًا فئما يتاح المصدر."
        />
      )}

      {startingSoon.length > 0 ? (
        <section className="mt-10">
          <SectionHead eyebrow="Kick-off soon" title="تبدأ قريبًا" href="/fixtures" />
          <div className="card overflow-hidden">
            {startingSoon.slice(0, 8).map((m) => (
              <MatchCard key={m.id} match={m} variant="row" />
            ))}
          </div>
        </section>
      ) : null}

      {justFinished.length > 0 ? (
        <section className="mt-10">
          <SectionHead eyebrow="Full time" title="انتهت مؤخرًا" href="/results" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {justFinished.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-10 card p-5">
        <h2 className="mb-2 text-[14px] font-extrabold">كيف تعمل التحديثات؟</h2>
        <ul className="space-y-1.5 text-[12px] leading-relaxed text-muted">
          <li>• تُجلب النتائج أثناء المباريات كل 5 ثوانٍ عبر واجهة <Link href="/api/live" className="font-bold text-gold-600 dark:text-gold-400">/api/live</Link> دون إعادة تحميل الصفحة.</li>
          <li>• في الإنتاج تُرسل التحديثات عبر WebSocket مع إرسال الفروق فقط (delta updates) لتقليل الحمل.</li>
          <li>• عند انقطاع المصدر تُعرض آخر نتيجة محفوظة مع تنبيه واضح بدلًا من شاشة فارغة.</li>
          <li>• الإشعارات (هدف، بداية، نهاية) تحتاج تسجيل الدخول — <Link href="/account" className="font-bold text-gold-600 dark:text-gold-400">أنشئ حسابًا</Link> لتفعيلها.</li>
        </ul>
      </section>
    </div>
  );
}
