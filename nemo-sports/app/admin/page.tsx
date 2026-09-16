import Link from "next/link";
import { AdminHead, Btn, Panel, Stat, Table, Pill } from "@/components/admin/ui";
import { articles, allMatches, broadcastPartners, liveMatches } from "@/lib/data";
import { teamBySlug } from "@/lib/core-data";
import { compact, dateAr, timeOf } from "@/lib/format";

const traffic = [42, 55, 48, 61, 73, 68, 88, 96, 84, 100, 92, 78];

export default function AdminDashboard() {
  const needsUpdate = allMatches.filter((m) => m.status === "LIVE" || m.status === "UPCOMING").slice(0, 6);
  const pendingPartners = broadcastPartners.filter((p) => p.status === "pending");

  return (
    <div>
      <AdminHead
        title="لوحة البيانات"
        subtitle={`نظرة عامة · ${dateAr(new Date().toISOString())}`}
        action={
          <span className="flex flex-wrap gap-2">
            <Link href="/admin/articles">
              <Btn tone="ghost">خبر عاجل</Btn>
            </Link>
            <Link href="/admin/matches">
              <Btn>إضافة مباراة</Btn>
            </Link>
          </span>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="زيارات اليوم" value="184,320" delta="+12.4% عن أمس" />
        <Stat label="مستخدمون جدد" value="2,431" delta="+6.1%" />
        <Stat label="مقالات منشورة" value={String(articles.length)} hint={`${articles.filter((a) => a.breaking).length} خبر عاجل نشط`} />
        <Stat label="مباريات مجدولة" value={String(allMatches.length)} hint={`${liveMatches.length} جارية الآن`} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel
          title="الزيارات — آخر 12 ساعة"
          aside={<span className="num text-[11px] text-white/40">ذروة: 96K · 21:00</span>}
        >
          <div className="flex h-40 items-end gap-2" dir="ltr">
            {traffic.map((v, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span
                  className={`w-full rounded-t-[2px] ${i === 9 ? "bg-gold-500" : "bg-navy-600"}`}
                  style={{ height: `${v}%` }}
                  title={`${v}K`}
                />
                <span className="num text-[9px] text-white/35">{i + 10}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {[
              { k: "أفضل الصفحات", v: "/matches · 38%" },
              { k: "مصادر الزيارات", v: "بحث عضوي 54%" },
              { k: "الأجهزة", v: "موبايل 71%" },
            ].map((x) => (
              <div key={x.k} className="rounded-[3px] border border-navy-800 bg-navy-950/60 px-3 py-2">
                <p className="text-[10px] text-white/40">{x.k}</p>
                <p className="mt-0.5 text-[12px] font-bold">{x.v}</p>
              </div>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="مهام سريعة" aside={<Pill tone="warn">{pendingPartners.length} بانتظار المراجعة</Pill>}>
            <ul className="space-y-2 text-[12px]">
              <li className="flex items-center justify-between gap-2 rounded-[3px] border border-navy-800 px-3 py-2">
                <span>مراجعة ناقل بث جديد</span>
                <Link href="/admin/broadcast" className="font-bold text-gold-400">مراجعة ←</Link>
              </li>
              <li className="flex items-center justify-between gap-2 rounded-[3px] border border-navy-800 px-3 py-2">
                <span>تحديث نتائج المباريات الجارية</span>
                <Link href="/admin/matches" className="font-bold text-gold-400">تحديث ←</Link>
              </li>
              <li className="flex items-center justify-between gap-2 rounded-[3px] border border-navy-800 px-3 py-2">
                <span>نشر خبر عاجل</span>
                <Link href="/admin/articles" className="font-bold text-gold-400">كتابة ←</Link>
              </li>
            </ul>
          </Panel>

          <Panel title="أكثر الأخبار قراءة">
            <ol className="space-y-2 text-[12px]">
              {[...articles]
                .sort((a, b) => b.views - a.views)
                .slice(0, 5)
                .map((a, i) => (
                  <li key={a.slug} className="flex items-start gap-2">
                    <span className="num w-4 shrink-0 font-extrabold text-gold-400">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate">{a.title}</span>
                      <span className="num block text-[10px] text-white/40">{compact(a.views)} مشاهدة</span>
                    </span>
                  </li>
                ))}
            </ol>
          </Panel>
        </div>
      </div>

      <div className="mt-5">
        <Panel title="مباريات تحتاج متابعة" aside={<Link href="/admin/matches" className="text-[11px] font-bold text-gold-400">كل المباريات ←</Link>}>
          <Table
            head={["المباراة", "البطولة", "الموعد", "الحالة", "إجراء"]}
            rows={needsUpdate.map((m) => [
              <span key="t" className="font-bold">
                {teamBySlug(m.home)?.short} × {teamBySlug(m.away)?.short}
              </span>,
              <span key="c" className="text-white/60">{m.competition}</span>,
              <span key="d" className="num">{timeOf(m.kickoff)}</span>,
              <Pill key="s" tone={m.status === "LIVE" ? "bad" : "idle"}>
                {m.status === "LIVE" ? "جارية" : "قادمة"}
              </Pill>,
              <button key="a" type="button" className="rounded-[3px] border border-navy-700 px-2.5 py-1 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400">
                تحديث النتيجة
              </button>,
            ])}
          />
        </Panel>
      </div>
    </div>
  );
}
