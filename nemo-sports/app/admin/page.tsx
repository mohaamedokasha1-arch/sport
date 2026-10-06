import Link from "next/link";
import { AdminHead, Btn, NotConnected, Panel, Stat, Table, Pill } from "@/components/admin/ui";
import { articles, allMatches, broadcastPartners, liveMatches } from "@/lib/data";
import { teamBySlug } from "@/lib/core-data";
import { compact, dateAr, timeOf } from "@/lib/format";

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
        {/* Analytics is not wired to anything. These two used to read
            "184,320" and "2,431" — invented literals on a public URL. They now
            say plainly that no measurement is connected. */}
        <Stat label="زيارات اليوم" value="—" hint="غير موصول — لا توجد خدمة تحليلات" />
        <Stat label="مستخدمون جدد" value="—" hint="غير موصول — لا يوجد نظام حسابات بعد" />
        <Stat label="مقالات منشورة" value={String(articles.length)} hint={`${articles.filter((a) => a.breaking).length} خبر عاجل نشط`} />
        <Stat label="مباريات مجدولة" value={String(allMatches.length)} hint={`${liveMatches.length} جارية الآن`} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="الزيارات — آخر 12 ساعة">
          <NotConnected
            title="لا توجد بيانات زيارات"
            message="لم تُربط أي خدمة تحليلات بالمنصة بعد، لذلك لا يوجد مخطط زيارات ولا أرقام «أفضل الصفحات» أو «مصادر الزيارات» أو «الأجهزة». لن نعرض أرقامًا مُخترعة في لوحة التحكم."
            requires="ربط خدمة تحليلات (Plausible / GA4 / PostHog)"
          />
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
            {articles.length === 0 ? (
              <NotConnected
                title="لا توجد أخبار لقياسها"
                message="عدادات المشاهدات تحتاج نظام أخبار موصولًا بقاعدة البيانات. الأرقام المعروضة هنا ستكون من المقالات المنشورة فعلًا فقط."
                requires="خط أنابيب الأخبار + جدول articles"
              />
            ) : (
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
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-5">
        <Panel title="مباريات تحتاج متابعة" aside={<Link href="/admin/matches" className="text-[11px] font-bold text-gold-400">كل المباريات ←</Link>}>
          {needsUpdate.length === 0 ? (
            <NotConnected
              title="لا توجد مباريات تحتاج متابعة"
              message="إدارة النتائج تحتاج ربط صفحة المباريات بطبقة البيانات وبالمخزن الكنزي في Postgres. لا توجد مباريات مجدولة في المخزن حاليًا."
              requires="Postgres + ربط /matches بطبقة البيانات"
            />
          ) : (
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
          )}
        </Panel>
      </div>
    </div>
  );
}
