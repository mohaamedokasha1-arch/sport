"use client";
import { useState } from "react";
import ProviderMatchList from "@/components/data/ProviderMatchList";
import type { NormalizedFixture, NormalizedTopScorer } from "@/packages/sdl/src";
import { headToHead, teamSample } from "@/lib/scout";
export default function ScoutWorkspace({ fixtures, scorers }: { fixtures: NormalizedFixture[]; scorers: NormalizedTopScorer[] }) {
  const teams = [...new Map(fixtures.flatMap((f) => [[f.homeProviderId, f.homeName], [f.awayProviderId, f.awayName]] as const).filter(([id, name]) => id && name)).entries()];
  const [a, setA] = useState(teams[0]?.[0] ?? "");
  const [b, setB] = useState(teams[1]?.[0] ?? "");
  const [season, setSeason] = useState("");
  const [venue, setVenue] = useState<"all" | "home" | "away">("all");
  const [p1, setP1] = useState(scorers[0]?.playerProviderId ?? "");
  const [p2, setP2] = useState(scorers[1]?.playerProviderId ?? "");
  const sample = fixtures.filter((f) => !season || f.seasonProviderId === season);
  const first = teamSample(sample, a, venue), second = teamSample(sample, b, venue);
  const meetings = headToHead(sample, a, b);
  const cls = "focus-ring min-h-11 max-w-full rounded border border-line bg-surface p-2 text-sm";
  const comparable = Boolean(a && b && a !== b);
  const one = scorers.find((p) => p.playerProviderId === p1), two = scorers.find((p) => p.playerProviderId === p2);
  return <div className="space-y-8">
    <section className="card space-y-4 p-4">
      <h2 className="text-xl font-bold">مقارنة الفرق · عينة النتائج المتاحة</h2>
      <div className="flex flex-wrap gap-3">
        {([a, b] as string[]).map((value, i) => <label key={i} className="grid gap-1 text-sm">الفريق {i + 1}<select className={cls} value={value} onChange={(e) => (i === 0 ? setA : setB)(e.target.value)}><option value="">اختر فريقًا</option>{teams.map(([id, name]) => <option key={id} value={id!}>{name}</option>)}</select></label>)}
        <label className="grid gap-1 text-sm">الموسم المورّد<select className={cls} value={season} onChange={(e) => setSeason(e.target.value)}><option value="">كل العينة (ليست إجمالي موسم)</option>{[...new Set(fixtures.map((f) => f.seasonProviderId).filter(Boolean))].map((s) => <option key={s} value={s!}>{s}</option>)}</select></label>
        <label className="grid gap-1 text-sm">الملعب<select className={cls} value={venue} onChange={(e) => setVenue(e.target.value as typeof venue)}><option value="all">الكل</option><option value="home">على أرضه</option><option value="away">خارج أرضه</option></select></label>
      </div>
      <p className="text-sm text-muted">هذه عينة المصدر المحمّلة، وليست أرشيفًا كاملًا أو ترتيب الدوري. عدد المباريات ومدتها قد يختلفان؛ لا نستنتج تفوقًا أو توقعًا مضمونًا. النتائج التي لا تحمل موسمًا لا تدخل فلتر موسم محدد.</p>
      {!comparable ? <p role="status">اختر فريقين مختلفين من البيانات المتاحة.</p> : <>
        <div className="overflow-x-auto"><table className="w-full text-start text-sm"><caption className="pb-2 text-start">الأرقام محسوبة من مباريات مكتملة ذات نتائج صالحة فقط</caption><thead><tr><th className="p-2 text-start">المقياس</th><th>{teams.find(([id]) => id === a)?.[1]}</th><th>{teams.find(([id]) => id === b)?.[1]}</th></tr></thead><tbody>
          {([["played", "مباريات العينة"], ["won", "فوز"], ["drawn", "تعادل"], ["lost", "خسارة"], ["goalsFor", "أهداف مسجلة"], ["goalsAgainst", "أهداف مستقبلة"]] as const).map(([key, label]) => <tr key={key} className="border-t border-line"><th className="p-2 text-start">{label}</th><td className="text-center">{first.played ? first[key] : "غير متاح"}</td><td className="text-center">{second.played ? second[key] : "غير متاح"}</td></tr>)}
        </tbody></table></div>
        <div className="grid gap-4 md:grid-cols-2">{[first, second].map((summary, i) => <section key={i} className="border-t border-line pt-3"><h3 className="font-bold">آخر 5 نتائج · {teams.find(([id]) => id === (i === 0 ? a : b))?.[1]}</h3><p className="my-2 text-xs text-muted">فترة العينة: {summary.from?.slice(0, 10) ?? "غير متاحة"} — {summary.to?.slice(0, 10) ?? "غير متاحة"} (UTC)</p>
          <ol className="space-y-2">{summary.recent.map((r) => <li key={r.fixture.providerId} className="flex flex-wrap items-center gap-2 text-sm"><time dateTime={r.fixture.scheduledAt}>{r.fixture.scheduledAt.slice(0, 10)}</time><span>{{ W: "فوز", D: "تعادل", L: "خسارة" }[r.result]}</span><span dir="ltr">{r.scored} – {r.conceded}</span><meter min={0} max={Math.max(1, ...summary.recent.map((x) => x.scored))} value={r.scored} aria-label={`أهداف الفريق: ${r.scored}`} /></li>)}</ol>
        </section>)}</div>
        <h3 className="font-bold">المواجهات المباشرة ضمن العينة المحددة</h3>{meetings.length ? <ProviderMatchList fixtures={meetings} /> : <p className="text-sm text-muted">لم يُرجع المصدر مواجهات مكتملة بين الفريقين في هذه العينة.</p>}
      </>}
    </section>
    <section className="card space-y-4 p-4"><h2 className="text-xl font-bold">مقارنة اللاعبين · قائمة الهدافين المتاحة</h2><p className="text-sm text-muted">من استجابة واحدة للبطولة المحددة. الموسم والمراكز والدقائق ليست مضمونة في هذا المصدر؛ لذلك لا نعرض مقارنة تاريخية أو حسب المركز أو لكل 90 دقيقة. الأهداف وحدها لا تثبت أن لاعبًا أفضل.</p>
      {!scorers.length ? <p role="status">قائمة الهدافين غير متاحة. قد يتطلبها اشتراك لدى المصدر؛ لم نضف خدمة مدفوعة.</p> : <>
        <div className="flex flex-wrap gap-3">{[p1, p2].map((value, i) => <label className="grid gap-1 text-sm" key={i}>اللاعب {i + 1}<select className={cls} value={value} onChange={(e) => (i === 0 ? setP1 : setP2)(e.target.value)}>{scorers.map((p) => <option key={p.playerProviderId} value={p.playerProviderId}>{p.playerName ?? p.playerProviderId}</option>)}</select></label>)}</div>
        {one && two && p1 !== p2 ? <div className="overflow-x-auto"><table className="w-full text-sm"><caption>نفس قائمة المصدر، وليست تقييمًا شاملًا للاعبين</caption><thead><tr><th className="p-2 text-start">المقياس</th><th>{one.playerName}</th><th>{two.playerName}</th></tr></thead><tbody>{([["goals", "الأهداف"], ["appearances", "المشاركات"], ["assists", "التمريرات الحاسمة"], ["penalties", "أهداف الجزاء"]] as const).map(([key, label]) => <tr className="border-t border-line" key={key}><th className="p-2 text-start">{label}</th><td className="text-center">{one[key] ?? "غير متاح"}</td><td className="text-center">{two[key] ?? "غير متاح"}</td></tr>)}</tbody></table></div> : <p>اختر لاعبين مختلفين.</p>}
      </>}
    </section>
  </div>;
}
