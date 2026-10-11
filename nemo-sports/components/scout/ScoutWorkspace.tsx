"use client";
import { useState } from "react";
import ProviderMatchList from "@/components/data/ProviderMatchList";
import type { NormalizedFixture, NormalizedTopScorer } from "@/packages/sdl/src";
import { headToHead, playerComparison, scoutTeams, teamSample, teamSelectionIssue, TEAM_SELECTION_MESSAGE_AR } from "@/lib/scout";

export default function ScoutWorkspace({ fixtures, scorers }: { fixtures: NormalizedFixture[]; scorers: NormalizedTopScorer[] }) {
  // Teams are keyed by the provider id and named by the provider label; teams
  // with completed matches come first so the default comparison has numbers.
  const teams = scoutTeams(fixtures);
  const [a, setA] = useState(teams[0]?.id ?? "");
  const [b, setB] = useState(teams[1]?.id ?? "");
  const [season, setSeason] = useState("");
  const [venue, setVenue] = useState<"all" | "home" | "away">("all");
  const [p1, setP1] = useState(scorers[0]?.playerProviderId ?? "");
  const [p2, setP2] = useState(scorers[1]?.playerProviderId ?? "");
  const sample = fixtures.filter((f) => !season || f.seasonProviderId === season);
  const first = teamSample(sample, a, venue), second = teamSample(sample, b, venue);
  const meetings = headToHead(sample, a, b);
  const cls = "focus-ring min-h-11 max-w-full rounded border border-line bg-surface p-2 text-sm disabled:opacity-50";
  const issue = teamSelectionIssue(teams, a, b);
  const nameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? "—";
  const players = playerComparison(scorers, p1, p2);
  const seasons = [...new Set(fixtures.map((f) => f.seasonProviderId).filter(Boolean))];
  return <div className="space-y-8">
    <section className="card space-y-4 p-4" aria-labelledby="scout-teams">
      <h2 id="scout-teams" className="text-xl font-bold">مقارنة الفرق · عينة النتائج المتاحة</h2>
      <div className="flex flex-wrap gap-3">
        {([a, b] as string[]).map((value, i) => <label key={i} className="grid gap-1 text-sm">الفريق {i + 1}<select className={cls} value={value} disabled={teams.length === 0} onChange={(e) => (i === 0 ? setA : setB)(e.target.value)}><option value="">اختر فريقًا</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.completed ? "" : " (بلا مباريات مكتملة في العينة)"}</option>)}</select></label>)}
        <label className="grid gap-1 text-sm">الموسم المورّد<select className={cls} value={season} onChange={(e) => setSeason(e.target.value)} disabled={seasons.length === 0}><option value="">كل العينة (ليست إجمالي موسم)</option>{seasons.map((s) => <option key={s} value={s!}>{s}</option>)}</select></label>
        <label className="grid gap-1 text-sm">الملعب<select className={cls} value={venue} onChange={(e) => setVenue(e.target.value as typeof venue)}><option value="all">الكل</option><option value="home">على أرضه</option><option value="away">خارج أرضه</option></select></label>
      </div>
      <p className="text-sm text-muted">هذه عينة المصدر المحمّلة، وليست أرشيفًا كاملًا أو ترتيب الدوري. عدد المباريات ومدتها قد يختلفان؛ لا نستنتج تفوقًا أو توقعًا مضمونًا. النتائج التي لا تحمل موسمًا لا تدخل فلتر موسم محدد.</p>
      <div aria-live="polite">
      {issue ? <p role="status" className="text-sm font-semibold">{TEAM_SELECTION_MESSAGE_AR[issue]}</p> : <>
        <div className="overflow-x-auto"><table className="w-full text-start text-sm"><caption className="pb-2 text-start">الأرقام محسوبة من مباريات مكتملة ذات نتائج صالحة فقط · {nameOf(a)} مقابل {nameOf(b)}</caption><thead><tr><th className="p-2 text-start">المقياس</th><th scope="col">{nameOf(a)}</th><th scope="col">{nameOf(b)}</th></tr></thead><tbody>
          {([["played", "مباريات العينة"], ["won", "فوز"], ["drawn", "تعادل"], ["lost", "خسارة"], ["goalsFor", "أهداف مسجلة"], ["goalsAgainst", "أهداف مستقبلة"]] as const).map(([key, label]) => <tr key={key} className="border-t border-line"><th scope="row" className="p-2 text-start">{label}</th><td className="num text-center">{first.played ? first[key] : "غير متاح"}</td><td className="num text-center">{second.played ? second[key] : "غير متاح"}</td></tr>)}
        </tbody></table></div>
        {!first.played || !second.played ? <p className="text-xs text-muted">«غير متاح» = لا توجد في العينة مباريات مكتملة لهذا الفريق ضمن الفلاتر المختارة؛ لا نعرض صفرًا بدلًا منها.</p> : null}
        <div className="mt-3 grid gap-4 md:grid-cols-2">{[first, second].map((summary, i) => <section key={i} className="border-t border-line pt-3"><h3 className="font-bold">آخر 5 نتائج · {nameOf(i === 0 ? a : b)}</h3><p className="my-2 text-xs text-muted">فترة العينة: {summary.from?.slice(0, 10) ?? "غير متاحة"} — {summary.to?.slice(0, 10) ?? "غير متاحة"} (UTC)</p>
          {summary.recent.length ? <ol className="space-y-2">{summary.recent.map((r) => <li key={r.fixture.providerId} className="flex flex-wrap items-center gap-2 text-sm"><time dateTime={r.fixture.scheduledAt}>{r.fixture.scheduledAt.slice(0, 10)}</time><span>{{ W: "فوز", D: "تعادل", L: "خسارة" }[r.result]}</span><span dir="ltr">{r.scored} – {r.conceded}</span><meter min={0} max={Math.max(1, ...summary.recent.map((x) => x.scored))} value={r.scored} aria-label={`أهداف الفريق: ${r.scored}`} /></li>)}</ol> : <p className="text-sm text-muted">لا توجد نتائج مكتملة في العينة.</p>}
        </section>)}</div>
        <h3 className="mt-3 font-bold">المواجهات المباشرة ضمن العينة المحددة</h3>{meetings.length ? <ProviderMatchList fixtures={meetings} /> : <p className="text-sm text-muted">لم يُرجع المصدر مواجهات مكتملة بين الفريقين في هذه العينة.</p>}
      </>}
      </div>
    </section>
    <section className="card space-y-4 p-4" aria-labelledby="scout-players"><h2 id="scout-players" className="text-xl font-bold">مقارنة اللاعبين · قائمة الهدافين المتاحة</h2><p className="text-sm text-muted">من استجابة واحدة للبطولة المحددة. الموسم والمراكز والدقائق ليست مضمونة في هذا المصدر؛ لذلك لا نعرض مقارنة تاريخية أو حسب المركز أو لكل 90 دقيقة. الأهداف وحدها لا تثبت أن لاعبًا أفضل.</p>
      {!scorers.length ? <p role="status">قائمة الهدافين غير متاحة. قد يتطلبها اشتراك لدى المصدر؛ لم نضف خدمة مدفوعة.</p> : <>
        <div className="flex flex-wrap gap-3">{[p1, p2].map((value, i) => <label className="grid gap-1 text-sm" key={i}>اللاعب {i + 1}<select className={cls} value={value} onChange={(e) => (i === 0 ? setP1 : setP2)(e.target.value)}>{scorers.map((p) => <option key={p.playerProviderId} value={p.playerProviderId}>{p.playerName ?? p.playerProviderId}{p.teamName ? ` — ${p.teamName}` : ""}</option>)}</select></label>)}</div>
        <div aria-live="polite">{players.ok ? <div className="overflow-x-auto"><table className="w-full text-sm"><caption>نفس قائمة المصدر، وليست تقييمًا شاملًا للاعبين</caption><thead><tr><th className="p-2 text-start">المقياس</th><th scope="col">{players.one.playerName ?? players.one.playerProviderId}</th><th scope="col">{players.two.playerName ?? players.two.playerProviderId}</th></tr></thead><tbody>{players.rows.map((row) => <tr className="border-t border-line" key={row.key}><th scope="row" className="p-2 text-start">{row.label}</th><td className="num text-center">{row.one ?? "غير متاح"}</td><td className="num text-center">{row.two ?? "غير متاح"}</td></tr>)}</tbody></table></div> : <p role="status">{players.reason === "same" ? "اختر لاعبين مختلفين." : "اختر لاعبين من القائمة."}</p>}</div>
      </>}
    </section>
  </div>;
}
