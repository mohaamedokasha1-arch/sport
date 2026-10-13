import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { syncedRecords } from "@/lib/sports-sync/read";
import { classification, type Kind } from "@/lib/sports-sync/model";
import { SyncedFixtureList, SyncNotice, syncedPath } from "@/components/data/SyncedSports";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "دليل البيانات الرياضية المتزامنة", alternates: { canonical: "/sports" }, robots: { index: false, follow: true } };
async function SportsPageBody({ searchParams }: { searchParams: Promise<{ state?: string; sport?: string; kind?: string }> }) {
  const filters = await searchParams;
  const result = await syncedRecords();
  const kind: Kind = filters.kind === "teams" ? "team" : filters.kind === "players" ? "player" : "fixture";
  const records = result.data.filter(r => r.kind === kind && (!filters.sport || r.sport === filters.sport) && (kind !== "fixture" || !filters.state || classification(String(r.data.status)) === filters.state));
  return <main className="mx-auto max-w-[1280px] space-y-5 px-4 py-6"><h1 className="text-2xl font-bold">دليل البيانات الرياضية المتزامنة</h1><SyncNotice error={result.error} /><nav className="flex flex-wrap gap-4 text-gold-500"><Link href="/competitions">البطولات والبلدان والمواسم</Link><Link href="/sports?state=upcoming">القادمة</Link><Link href="/sports?state=live">المباشرة</Link><Link href="/sports?state=completed">النتائج</Link><Link href="/sports?kind=teams">الفرق</Link><Link href="/sports?kind=players">اللاعبون</Link></nav><form className="flex flex-wrap gap-3" method="get"><input type="hidden" name="kind" value={filters.kind ?? "matches"} /><input type="hidden" name="state" value={filters.state ?? ""} /><label>الرياضة <select name="sport" defaultValue={filters.sport ?? ""} className="border border-line bg-transparent p-2"><option value="">الكل</option>{[...new Set(result.data.map(r => r.sport))].map(s => <option key={s}>{s}</option>)}</select></label><button className="border border-line px-3" type="submit">عرض</button></form>{kind === "fixture" ? <SyncedFixtureList fixtures={records.slice(0, 300)} /> : <ul className="grid gap-3 sm:grid-cols-3">{records.slice(0, 300).map(r => <li key={r.id}><Link href={syncedPath(r)} className="card block p-4">{String(r.data.name ?? r.data.fullName)}</Link></li>)}</ul>}{!records.length && <p className="text-sm text-muted">لم تتوفر بيانات متزامنة لهذا العرض بعد؛ ليس تأكيدًا لعدم وجود أحداث لدى المصدر.</p>}{records.length > 300 && <p className="text-sm text-muted">يعرض الدليل أول ٣٠٠ سجل؛ راجع صفحة البطولة لجدولها.</p>}</main>;
}

export default function Page(props: { searchParams: Promise<{ state?: string; sport?: string; kind?: string }> }) { return <Suspense fallback={<p role="status" className="p-6 text-muted">جارٍ قراءة البيانات المتزامنة…</p>}><SportsPageBody {...props} /></Suspense>; }
