import type { Metadata } from "next";
import MyFootballDay from "@/components/personal/MyFootballDay";
import DataSourceNote from "@/components/data/DataSourceNote";
import { fixtures, hasMatchIdentity } from "@/lib/sdl-gateway";
import { footballTopScorers } from "@/lib/football-data";
import { getNewsFeed } from "@/lib/news/service";
import { siteDateKey } from "@/lib/tz";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";
import { localeAlternates } from "@/lib/i18n/metadata";

export type ViewProps = Record<string, never>;

export const dynamic = "force-dynamic";
export function generateMetadata(locale: Locale, _props: ViewProps = {} as ViewProps): Metadata {
  return { title: t(locale, "md.pageTitle"), alternates: localeAlternates(locale, "/my-day", { noHreflang: true }), robots: { index: false, follow: true } };
}
export default async function MyDayPage({ locale }: { locale: Locale }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const [matches, scorers, news] = await Promise.all([fixtures({ sport: "football" }), footballTopScorers("PL"), getNewsFeed({ limit: 100 })]);
  const data = matches.ok && matches.source === "provider" ? matches.data.filter(hasMatchIdentity) : [];
  const players = scorers.ok && scorers.source.provider !== "demo" ? scorers.data.filter((p) => p.playerName).map((p) => ({ id: `${scorers.source.provider}:${p.playerProviderId}`, name: p.playerName! })) : [];
  return <div className="mx-auto max-w-[1280px] space-y-6 px-4 py-6">
    <header className="border-b-2 border-line pb-4"><p className="eyebrow">{tr("md.eyebrow")}</p><h1 className="mt-2 text-3xl font-extrabold">{tr("md.heading")}</h1><p className="mt-2 text-sm text-muted">{tr("md.pageLead")}</p></header>
    {!matches.ok && <p role="status" className="card p-4">{tr("md.loadFailed")}</p>}
    {matches.ok && <DataSourceNote provider={matches.provider} stale={matches.stale} fetchedAt={matches.fetchedAt} fromCache={matches.fromCache} />}
    {news.stale && <p className="text-sm text-muted">{tr("md.newsStale")}</p>}
    <MyFootballDay fixtures={data} provider={matches.ok ? matches.provider : "unavailable"} players={players} news={news.items} today={siteDateKey()} />
  </div>;
}
