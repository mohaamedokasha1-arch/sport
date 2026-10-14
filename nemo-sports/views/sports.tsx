import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { syncedRecords } from "@/lib/sports-sync/read";
import { classification, type Kind } from "@/lib/sports-sync/model";
import { SyncedFixtureList, SyncNotice, syncedPath } from "@/components/data/SyncedSports";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";

export type ViewProps = { searchParams: Promise<{ state?: string; sport?: string; kind?: string }> };

export const dynamic = "force-dynamic";
export function generateMetadata(locale: Locale, _props: ViewProps = {} as ViewProps): Metadata {
  return { title: t(locale, "sp.metaTitle"), alternates: { canonical: "/sports" }, robots: { index: false, follow: true } };
}
async function SportsPageBody({ locale, searchParams }: { locale: Locale; searchParams: Promise<{ state?: string; sport?: string; kind?: string }> }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const filters = await searchParams;
  const result = await syncedRecords();
  const kind: Kind = filters.kind === "teams" ? "team" : filters.kind === "players" ? "player" : "fixture";
  const records = result.data.filter(r => r.kind === kind && (!filters.sport || r.sport === filters.sport) && (kind !== "fixture" || !filters.state || classification(String(r.data.status)) === filters.state));
  return <main className="mx-auto max-w-[1280px] space-y-5 px-4 py-6"><h1 className="text-2xl font-bold">{tr("sp.heading")}</h1><SyncNotice error={result.error} locale={locale} /><nav className="flex flex-wrap gap-4 text-gold-500"><Link href="/competitions">{tr("sp.navCompetitions")}</Link><Link href="/sports?state=upcoming">{tr("sp.stateUpcoming")}</Link><Link href="/sports?state=live">{tr("sp.stateLive")}</Link><Link href="/sports?state=completed">{tr("sp.stateCompleted")}</Link><Link href="/sports?kind=teams">{tr("sp.kindTeams")}</Link><Link href="/sports?kind=players">{tr("sp.kindPlayers")}</Link></nav><form className="flex flex-wrap gap-3" method="get"><input type="hidden" name="kind" value={filters.kind ?? "matches"} /><input type="hidden" name="state" value={filters.state ?? ""} /><label>{tr("sp.sportLabel")} <select name="sport" defaultValue={filters.sport ?? ""} className="border border-line bg-transparent p-2"><option value="">{tr("sp.all")}</option>{[...new Set(result.data.map(r => r.sport))].map(s => <option key={s}>{s}</option>)}</select></label><button className="border border-line px-3" type="submit">{tr("sp.show")}</button></form>{kind === "fixture" ? <SyncedFixtureList fixtures={records.slice(0, 300)} locale={locale} /> : <ul className="grid gap-3 sm:grid-cols-3">{records.slice(0, 300).map(r => <li key={r.id}><Link href={syncedPath(r)} className="card block p-4">{String(r.data.name ?? r.data.fullName)}</Link></li>)}</ul>}{!records.length && <p className="text-sm text-muted">{tr("sp.empty")}</p>}{records.length > 300 && <p className="text-sm text-muted">{tr("sp.truncated")}</p>}</main>;
}

export default function Page(props: ViewProps & { locale: Locale }) { return <Suspense fallback={<p role="status" className="p-6 text-muted">{t(props.locale, "sp.loading")}</p>}><SportsPageBody {...props} /></Suspense>; }
