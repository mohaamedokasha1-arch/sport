import Link from "next/link";
import type { Metadata } from "next";
import ScoutWorkspace from "@/components/scout/ScoutWorkspace";
import DataSourceNote from "@/components/data/DataSourceNote";
import { fixtures, hasMatchIdentity } from "@/lib/sdl-gateway";
import { footballDataCompetitions, footballTopScorers } from "@/lib/football-data";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "NEMO Scout — مقارنة من البيانات المتاحة", alternates: { canonical: "/scout" }, robots: { index: false, follow: true } };
export default async function ScoutPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const choices = footballDataCompetitions();
  const competition = choices.find((c) => c.code === sp.competition) ?? choices[0];
  const [matches, scorers] = await Promise.all([fixtures({ sport: "football", competitionProviderId: competition.slug ?? competition.code }), footballTopScorers(competition.code)]);
  // Manual matches may be merged by the gateway; require an actual competition match.
  const data = matches.ok && matches.source === "provider" ? matches.data.filter(hasMatchIdentity).filter((f) => fixtureBelongsToCompetition(f, competition.slug ?? competition.code)) : [];
  return <div className="mx-auto max-w-[1280px] space-y-6 px-4 py-6"><header className="border-b-2 border-line pb-4"><p className="eyebrow">NEMO Scout</p><h1 className="mt-2 text-3xl font-extrabold">مساحة المقارنة</h1><p className="mt-2 text-sm text-muted">سياق إحصائي محايد، لا نصائح مراهنة ولا توقعات مضمونة.</p></header>
    <form className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">البطولة<select name="competition" defaultValue={competition.code} className="min-h-11 rounded border border-line bg-surface p-2">{choices.map((c) => <option key={c.code} value={c.code}>{c.nameAr}</option>)}</select></label><button className="focus-ring min-h-11 rounded bg-navy-850 px-4 font-bold text-white">عرض البيانات</button></form>
    {matches.ok ? <DataSourceNote provider={matches.provider} fromCache={matches.fromCache} stale={matches.stale} fetchedAt={matches.fetchedAt} /> : <p role="status" className="card p-4">تعذّر تحميل مباريات البطولة. لا نستبدلها بنتائج مصطنعة.</p>}
    {scorers.ok && <DataSourceNote provider={scorers.source.provider} fromCache={scorers.source.fromCache} stale={scorers.source.stale} fetchedAt={scorers.source.fetchedAt} />}
    <p className="text-sm"><Link href="/learn" className="underline">كيف تقرأ الأرقام وحدود العينة؟</Link></p>
    <ScoutWorkspace key={competition.code} fixtures={data} scorers={scorers.ok && scorers.source.provider !== "demo" ? scorers.data : []} />
  </div>;
}
import { fixtureBelongsToCompetition } from "@/lib/competition-catalog";
