import type { Metadata } from "next";
import MyFootballDay from "@/components/personal/MyFootballDay";
import DataSourceNote from "@/components/data/DataSourceNote";
import { fixtures, hasMatchIdentity } from "@/lib/sdl-gateway";
import { footballTopScorers } from "@/lib/football-data";
import { getNewsFeed } from "@/lib/news/service";
import { siteDateKey } from "@/lib/tz";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "يومي الكروي — My Football Day", alternates: { canonical: "/my-day" }, robots: { index: false, follow: true } };
export default async function MyDayPage() {
  const [matches, scorers, news] = await Promise.all([fixtures({ sport: "football" }), footballTopScorers("PL"), getNewsFeed({ limit: 100 })]);
  const data = matches.ok && matches.source === "provider" ? matches.data.filter(hasMatchIdentity) : [];
  const players = scorers.ok && scorers.source.provider !== "demo" ? scorers.data.filter((p) => p.playerName).map((p) => ({ id: `${scorers.source.provider}:${p.playerProviderId}`, name: p.playerName! })) : [];
  return <div className="mx-auto max-w-[1280px] space-y-6 px-4 py-6">
    <header className="border-b-2 border-line pb-4"><p className="eyebrow">NEMO Sports · My Football Day</p><h1 className="mt-2 text-3xl font-extrabold">يومي الكروي</h1><p className="mt-2 text-sm text-muted">تابع فرقك وبطولاتك دون حساب. التفضيلات محلية لهذا المتصفح، ويمكنك حذفها في أي وقت.</p></header>
    {!matches.ok && <p role="status" className="card p-4">تعذّر تحميل المصدر. تفضيلاتك محفوظة؛ أعد المحاولة لاحقًا.</p>}
    {matches.ok && <DataSourceNote provider={matches.provider} stale={matches.stale} fetchedAt={matches.fetchedAt} fromCache={matches.fromCache} />}
    {news.stale && <p className="text-sm text-muted">الأخبار قديمة أو لم يكتمل تحديث بعض المصادر.</p>}
    <MyFootballDay fixtures={data} provider={matches.ok ? matches.provider : "unavailable"} players={players} news={news.items} today={siteDateKey()} />
  </div>;
}
