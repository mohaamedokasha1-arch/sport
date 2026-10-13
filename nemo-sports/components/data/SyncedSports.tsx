import Link from "next/link";
import { syncedRecords } from "@/lib/sports-sync/read";
import { classification, freshness, indexWorthy, keyOf, type RecordData } from "@/lib/sports-sync/model";
import { SITE_TZ, siteDateKey } from "@/lib/tz";

export { syncedPath } from "@/lib/sports-sync/public";
import { syncedPath } from "@/lib/sports-sync/public";

const sportName = (sport: string) => ({ football: "كرة القدم", basketball: "كرة السلة", cricket: "الكريكيت", tennis: "التنس", volleyball: "الكرة الطائرة", handball: "كرة اليد", hockey: "الهوكي", baseball: "البيسبول", boxing: "الملاكمة", nfl: "كرة القدم الأمريكية" } as Record<string, string>)[sport] ?? sport;
const providerName = (provider: string) => ({ football_data: "Football-Data.org", sportscore: "SportScore", thesportsdb: "TheSportsDB", api_football: "API-Football", sportmonks: "Sportmonks", sportradar: "Sportradar" } as Record<string, string>)[provider] ?? "مزود البيانات";
const statusName = (status: unknown) => ({ scheduled: "قادمة", live: "مباشر", halftime: "استراحة", extra_time: "وقت إضافي", extra_time_halftime: "استراحة الوقت الإضافي", penalty_shootout: "ركلات الترجيح", finished: "انتهت", postponed: "مؤجلة", cancelled: "ملغاة", abandoned: "متوقفة", suspended: "موقوفة", walkover: "انسحاب", awarded: "حُسمت بقرار" } as Record<string, string>)[String(status)] ?? "حالة غير مؤكدة";
const name = (r: RecordData) => String(r.data.name ?? r.data.fullName ?? "بيانات من المصدر");
const kickoff = (r: RecordData) => new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short", timeZone: SITE_TZ }).format(new Date(String(r.data.scheduledAt)));
export function SyncNotice({ record, error }: { record?: RecordData; error?: string | null }) {
  return <p role={error ? "status" : undefined} className="my-3 rounded border border-line p-3 text-xs leading-6 text-muted">
    {error ?? (record ? `${freshness(record) === "stale" ? "بيانات قديمة — قد تتأخر التحديثات. " : ""}آخر تحديث ناجح: ${record.lastSuccessAt ? new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short", timeZone: SITE_TZ }).format(new Date(record.lastSuccessAt)) : "غير متاح"} · المصدر: ${providerName(record.provider)}` : "التغطية بحسب البيانات التي يتيحها المصدر؛ ليست ضمانًا لتغطية عالمية كاملة.")}
  </p>;
}
export async function SyncedCompetitionDirectory({ sport = "", country = "" }: { sport?: string; country?: string }) {
  const result = await syncedRecords();
  const fixtures = result.data.filter(r => r.kind === "fixture");
  const all = result.data.filter(r => r.kind === "competition");
  const visible = all.filter(c => indexWorthy(c, fixtures));
  const filtered = visible.filter(c => (!sport || c.sport === sport) && (!country || c.data.countryName === country));
  // Existing curated routes remain in their old listing; dynamic additions need no code edits.
  const additions = filtered.filter(c => syncedPath(c).endsWith(c.slug));
  return <section className="mx-auto max-w-[1280px] px-4 py-6" aria-labelledby="sync-catalog-title">
    <h2 id="sync-catalog-title" className="text-xl font-extrabold">بطولات اكتُشفت وتزامنت تلقائيًا</h2>
    <SyncNotice error={result.error} />
    <form method="get" className="my-4 flex flex-wrap gap-3 text-sm">
      <label>الرياضة <select name="sport" defaultValue={sport} className="rounded border border-line bg-transparent p-2"><option value="">الكل</option>{[...new Set(visible.map(r => r.sport))].map(s => <option key={s} value={s}>{sportName(s)}</option>)}</select></label>
      <label>البلد / المنطقة <select name="country" defaultValue={country} className="rounded border border-line bg-transparent p-2"><option value="">الكل</option>{[...new Set(visible.map(r => String(r.data.countryName ?? "")))].filter(Boolean).sort().map(c => <option key={c}>{c}</option>)}</select></label>
      <button className="rounded border border-line px-4 py-2" type="submit">عرض</button>
      <Link href="/sports" className="p-2 text-gold-500">المباريات والفرق واللاعبون</Link>
    </form>
    {additions.length ? <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{additions.map(c => <li key={keyOf(c.kind, c.provider, c.sourceKey)}><Link className="card block p-4 focus-ring" href={syncedPath(c)}><strong>{name(c)}</strong><span className="mt-1 block text-xs text-muted">{String(c.data.countryName ?? "")} · {sportName(c.sport)} · {String(c.data.type ?? "بطولة")}</span></Link></li>)}</ul>
      : <p className="text-sm text-muted">لا توجد بطولات إضافية ذات محتوى متزامن ضمن هذا العرض بعد. قد يُحفظ الفهرس قبل توفر المباريات؛ هذا لا يعني أن المصدر لا يغطيها.</p>}
  </section>;
}
export function SyncedFixtureList({ fixtures }: { fixtures: RecordData[] }) {
  const sorted = fixtures.filter(f => Number.isFinite(Date.parse(String(f.data.scheduledAt)))).sort((a, b) => String(a.data.scheduledAt).localeCompare(String(b.data.scheduledAt)));
  const days = new Map<string, RecordData[]>();
  for (const f of sorted) { const key = siteDateKey(new Date(String(f.data.scheduledAt))); days.set(key, [...(days.get(key) ?? []), f]); }
  return <div className="space-y-4">{[...days].map(([day, rows]) => <section key={day}><h3 className="mb-2 font-bold">{day} — القاهرة</h3><ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rows.map(f => <li key={keyOf(f.kind, f.provider, f.sourceKey)}><Link href={syncedPath(f)} className="card block p-4 focus-ring"><strong>{String(f.data.homeName)} × {String(f.data.awayName)}</strong><span className="mt-2 block text-xs text-muted">{kickoff(f)} · {classification(String(f.data.status)) === "live" ? "مباشر" : classification(String(f.data.status)) === "completed" ? "انتهت" : f.data.status === "scheduled" ? "قادمة" : statusName(f.data.status)}</span><span dir="ltr" className="num block">{String(f.data.homeScore ?? "—")} : {String(f.data.awayScore ?? "—")}</span>{freshness(f) === "stale" && <span className="text-xs text-muted">تحديث قديم</span>}</Link></li>)}</ul></section>)}</div>;
}
export async function SyncedCompetitionDetail({ record }: { record: RecordData }) {
  const result = await syncedRecords();
  const related = result.data.filter(r => r.provider === record.provider && r.competitionKey === record.sourceKey);
  const fixtures = related.filter(r => r.kind === "fixture");
  const seasons = related.filter(r => r.kind === "season");
  const current = seasons.find(s => s.data.isCurrent);
  const table = related.find(r => r.kind === "standings" && current && r.data.seasonProviderId === current.data.providerId);
  const scorers = related.find(r => r.kind === "scorers" && current && r.data.seasonProviderId === current.data.providerId);
  const teams = result.data.filter(r => r.kind === "team" && r.provider === record.provider && fixtures.some(f => [f.data.homeProviderId, f.data.awayProviderId].includes(r.sourceKey)));
  return <main className="mx-auto max-w-[1280px] space-y-6 px-4 py-6">
    <nav><Link href="/competitions" className="text-sm text-gold-500">البطولات</Link></nav><h1 className="text-2xl font-extrabold">{name(record)}</h1>
    <p className="text-sm text-muted">{String(record.data.countryName ?? "")} · {sportName(record.sport)} {record.availability === "unconfirmed" ? "· توفر المصدر غير مؤكد حاليًا" : ""}</p>
    <SyncNotice record={record} error={result.error} />
    <section><h2 className="mb-3 font-bold">المواسم المكتشفة</h2>{seasons.length ? <ul className="flex flex-wrap gap-3">{seasons.map(s => <li key={s.sourceKey}><a href={`#season-${s.id}`} className="text-gold-500">{String(s.data.name)}{s.data.isCurrent ? " (الحالي)" : ""}</a></li>)}</ul> : <p className="text-sm text-muted">المصدر لم يؤكد المواسم بعد.</p>}</section>
    {seasons.map(s => <section id={`season-${s.id}`} key={s.id}><h2 className="mb-3 font-bold">مباريات {String(s.data.name)}</h2><SyncedFixtureList fixtures={fixtures.filter(f => f.data.seasonProviderId === s.data.providerId)} /></section>)}
    <section><h2 className="mb-3 font-bold">{seasons.length ? "مباريات غير مرتبطة بموسم مؤكد" : "المباريات المتزامنة"}</h2><SyncedFixtureList fixtures={fixtures.filter(f => !seasons.some(s => s.data.providerId === f.data.seasonProviderId))} />{!fixtures.length && <p className="text-sm text-muted">لم تتوفر مباريات موثوقة في المزامنة بعد. قد تكون البيانات قيد الاسترجاع أو المصدر غير متاح؛ لا نؤكد أن البطولة بلا مباريات.</p>}</section>
    <section><h2 className="mb-3 font-bold">الفرق</h2><ul className="flex flex-wrap gap-4">{teams.map(t => <li key={t.id}><Link href={syncedPath(t)} className="text-gold-500">{name(t)}</Link></li>)}</ul></section>
    <section><h2 className="mb-3 font-bold">الترتيب — الموسم المؤكد</h2>{table ? <><SyncNotice record={table} /><div className="overflow-x-auto"><table className="w-full text-start text-sm"><thead><tr><th>المركز</th><th>الفريق</th><th>لعب</th><th>النقاط</th></tr></thead><tbody>{(table.data.rows as Record<string, unknown>[]).map((r, i) => <tr key={i} className="border-b border-line"><td className="p-2">{String(r.position)}</td><td>{String(r.teamName ?? "اسم غير متاح")}</td><td>{String(r.played)}</td><td>{String(r.points)}</td></tr>)}</tbody></table></div></> : <p className="text-sm text-muted">لم يتوفر جدول موثوق مرتبط بالموسم الحالي بعد.</p>}</section>
    <section><h2 className="mb-3 font-bold">الهدافون</h2>{scorers ? <><SyncNotice record={scorers} /><ul>{(scorers.data.rows as Record<string, unknown>[]).map((r, i) => { const player = result.data.find(p => p.kind === "player" && p.provider === record.provider && p.sourceKey === String(r.playerProviderId)); return <li key={i} className="py-2">{player ? <Link className="text-gold-500" href={syncedPath(player)}>{String(r.playerName)}</Link> : String(r.playerName ?? "اسم غير متاح")} — {String(r.goals)} هدفًا</li>; })}</ul></> : <p className="text-sm text-muted">إحصاءات الهدافين غير متاحة من آخر مزامنة مؤكدة.</p>}</section>
  </main>;
}
export async function SyncedEntityDetail({ record }: { record: RecordData }) {
  const result = await syncedRecords();
  if (record.kind === "fixture") {
    const competition = result.data.find(r => r.kind === "competition" && r.provider === record.provider && r.sourceKey === record.competitionKey);
    const teams = [record.data.homeProviderId, record.data.awayProviderId].map(id => result.data.find(r => r.kind === "team" && r.provider === record.provider && r.sourceKey === id));
    return <main className="mx-auto max-w-[1280px] space-y-4 px-4 py-6"><h1 className="text-2xl font-bold">{String(record.data.homeName)} × {String(record.data.awayName)}</h1><SyncNotice record={record} error={result.error} /><p>{kickoff(record)} — توقيت القاهرة</p><p>{statusName(record.data.status)}</p><p dir="ltr" className="num text-3xl">{String(record.data.homeScore ?? "—")} : {String(record.data.awayScore ?? "—")}</p>{competition && <Link href={syncedPath(competition)} className="block text-gold-500">{name(competition)}</Link>}<ul className="flex gap-4">{teams.map((t, i) => t && <li key={i}><Link href={syncedPath(t)} className="text-gold-500">{name(t)}</Link></li>)}</ul><p className="text-sm text-muted">صفحة بيانات متزامنة؛ ليست صفحة بث. بيانات الأحداث والتشكيلات متاحة فقط حيث يؤكدها المصدر.</p></main>;
  }
  const fixtures = result.data.filter(f => f.kind === "fixture" && f.provider === record.provider && [f.data.homeProviderId, f.data.awayProviderId].includes(record.sourceKey));
  return <main className="mx-auto max-w-[1280px] space-y-4 px-4 py-6"><h1 className="text-2xl font-bold">{name(record)}</h1><SyncNotice record={record} error={result.error} /><p>{String(record.data.countryName ?? "")} {String(record.data.position ?? "")}</p>{record.kind === "team" && <SyncedFixtureList fixtures={fixtures} />}{record.kind === "player" && <p className="text-sm text-muted">الملف بحسب حقول المصدر المتاحة. لا تتوفر إحصاءات مؤكدة لكل لاعب.</p>}</main>;
}

export async function SyncedFixtureHighlights({ state, sport }: { state?: "live" | "upcoming" | "completed"; sport?: string }) {
  const result = await syncedRecords("fixture");
  const fixtures = result.data.filter(f => (!state || classification(String(f.data.status)) === state) && (!sport || f.sport === sport))
    .sort((a, b) => state === "completed" ? String(b.data.scheduledAt).localeCompare(String(a.data.scheduledAt)) : String(a.data.scheduledAt).localeCompare(String(b.data.scheduledAt))).slice(0, 6);
  if (!fixtures.length) return null; // legacy empty/error surfaces remain unchanged
  return <section className="mx-auto max-w-[1280px] space-y-3 px-4 py-6"><h2 className="text-lg font-bold">من البطولات المتزامنة تلقائيًا</h2><SyncNotice /><SyncedFixtureList fixtures={fixtures} /><Link href={state ? `/sports?state=${state}` : "/sports"} className="text-sm text-gold-500">كل البيانات المتزامنة</Link></section>;
}
export async function SyncedEntityDirectory({ kind }: { kind: "team" | "player" }) {
  const result = await syncedRecords(kind);
  if (!result.data.length) return null;
  return <section className="mx-auto max-w-[1280px] px-4 py-6"><h2 className="mb-3 text-lg font-bold">{kind === "team" ? "فرق" : "لاعبون"} من البطولات المتزامنة</h2><ul className="grid gap-3 sm:grid-cols-3">{result.data.slice(0, 24).map(r => <li key={r.id}><Link href={syncedPath(r)} className="card block p-4">{name(r)}</Link></li>)}</ul><Link className="mt-3 block text-gold-500" href={`/sports?kind=${kind === "team" ? "teams" : "players"}`}>عرض المزيد</Link></section>;
}
