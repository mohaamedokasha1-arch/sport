import Link from "next/link";
import type { Metadata } from "next";
import ScoutWorkspace from "@/components/scout/ScoutWorkspace";
import DataSourceNote from "@/components/data/DataSourceNote";
import { fixtures, hasMatchIdentity } from "@/lib/sdl-gateway";
import { footballDataCompetitions, footballTopScorers } from "@/lib/football-data";
export const dynamic = "force-dynamic";
export function generateMetadata(locale: Locale, _props: ViewProps = {} as ViewProps): Metadata {
  return { title: t(locale, "sc.metaTitle"), alternates: { canonical: "/scout" }, robots: { index: false, follow: true } };
}
export default async function ScoutPage({ locale, searchParams }: ViewProps & { locale: Locale }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const sp = await searchParams;
  const choices = footballDataCompetitions();
  const competition = choices.find((c) => c.code === sp.competition) ?? choices[0];
  const [matches, scorers] = await Promise.all([fixtures({ sport: "football", competitionProviderId: competition.slug ?? competition.code }), footballTopScorers(competition.code)]);
  // Manual matches may be merged by the gateway; require an actual competition match.
  const data = matches.ok && matches.source === "provider" ? matches.data.filter(hasMatchIdentity).filter((f) => fixtureBelongsToCompetition(f, competition.slug ?? competition.code)) : [];
  return <div className="mx-auto max-w-[1280px] space-y-6 px-4 py-6"><header className="border-b-2 border-line pb-4"><p className="eyebrow">{tr("sc.eyebrow")}</p><h1 className="mt-2 text-3xl font-extrabold">{tr("sc.heading")}</h1><p className="mt-2 text-sm text-muted">{tr("sc.lead")}</p></header>
    <form className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">{tr("sc.competitionLabel")}<select name="competition" defaultValue={competition.code} className="min-h-11 rounded border border-line bg-surface p-2">{choices.map((c) => <option key={c.code} value={c.code}>{locale === "ar" ? c.nameAr : c.name}</option>)}</select></label><button className="focus-ring min-h-11 rounded bg-navy-850 px-4 font-bold text-white">{tr("sc.show")}</button></form>
    {/* One provenance line per dataset, labelled — merged when both come from
        the same provider at the same minute (the page used to print the same
        "SportScore · آخر تحديث …" line twice with nothing telling them apart). */}
    {matches.ok && scorers.ok && sameProvenance(matches, scorers.source) ? (
      <DataSourceNote subject={tr("sc.subjectBoth")} provider={matches.provider} fromCache={matches.fromCache && scorers.source.fromCache} stale={matches.stale || scorers.source.stale} fetchedAt={matches.fetchedAt} />
    ) : (
      <>
        {matches.ok ? <DataSourceNote subject={tr("sc.subjectMatches")} provider={matches.provider} fromCache={matches.fromCache} stale={matches.stale} fetchedAt={matches.fetchedAt} /> : <p role="status" className="card p-4">{tr("sc.matchesFailed")}</p>}
        {scorers.ok && <DataSourceNote subject={tr("sc.subjectScorers")} provider={scorers.source.provider} fromCache={scorers.source.fromCache} stale={scorers.source.stale} fetchedAt={scorers.source.fetchedAt} />}
      </>
    )}
    <p className="text-sm"><Link href="/learn" className="underline">{tr("sc.learnLink")}</Link></p>
    <ScoutWorkspace key={competition.code} fixtures={data} scorers={scorers.ok && scorers.source.provider !== "demo" ? scorers.data : []} />
  </div>;
}
import { fixtureBelongsToCompetition } from "@/lib/competition-catalog";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";

export type ViewProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };


/** Same provider, same cache origin and the same minute → one provenance line is enough. */
function sameProvenance(a: { provider: string; fromCache: boolean; fetchedAt: string }, b: { provider: string; fromCache: boolean; fetchedAt: string }): boolean {
  return a.provider === b.provider && a.fromCache === b.fromCache && a.fetchedAt.slice(0, 16) === b.fetchedAt.slice(0, 16);
}
