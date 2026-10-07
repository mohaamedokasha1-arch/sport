import Link from "next/link";
import { AdminHead, Btn, NotConnected, Panel, Stat, Table, Pill } from "@/components/admin/ui";
import { articles, allMatches, liveMatches } from "@/lib/data";
import { teamBySlug } from "@/lib/core-data";
import { compact, dateAr, timeOf } from "@/lib/format";
import { listArticles } from "@/lib/news/store";
import { listMatchStreams } from "@/lib/match-streams";
import { listBroadcasters } from "@/lib/broadcasts";
import { demoContentVisible } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [{ items: storedArticles, total: storedArticleCount }, streams, broadcasters] = await Promise.all([
    listArticles({ status: "published", limit: 5 }),
    listMatchStreams(true),
    listBroadcasters(true),
  ]);
  const demo = demoContentVisible();
  const dashboardArticles = storedArticles.length > 0 ? storedArticles : demo ? articles : [];
  const articleCount = storedArticleCount > 0 ? storedArticleCount : demo ? articles.length : 0;
  const needsUpdate = allMatches.filter((m) => m.status === "LIVE" || m.status === "UPCOMING").slice(0, 6);
  const pendingPartners = broadcasters.filter((broadcaster) => broadcaster.status === "pending");
  const activeStreams = streams.filter((stream) => stream.enabled).length;

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
        <Stat label="مقالات منشورة" value={String(articleCount)} hint="من مخزن الأخبار الموصّل" />
        <Stat label="مباريات مجدولة" value={String(allMatches.length)} hint={`${liveMatches.length} جارية الآن`} />
        <Stat label="مصادر بث مفعّلة" value={String(activeStreams)} hint="ربط رسمي لكل مباراة" />
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

          <Panel title="آخر الأخبار المنشورة">
            {dashboardArticles.length === 0 ? (
              <NotConnected
                title="لا توجد أخبار منشورة"
                message="لا توجد مقالات حقيقية في مخزن الأخبار حاليًا. لن نعرض أرقام قراءة أو عناوين مُختلَقة في لوحة التحكم."
                requires="خط أنابيب الأخبار + قاعدة بيانات اختيارية"
              />
            ) : storedArticles.length > 0 ? (
              <ol className="space-y-2 text-[12px]">
                {storedArticles.map((article, i) => (
                  <li key={article.id} className="flex items-start gap-2">
                    <span className="num w-4 shrink-0 font-extrabold text-gold-400">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate">{article.title}</span>
                      <span className="block truncate text-[10px] text-white/40">{article.sourceName} · {dateAr(article.publicationDate)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <ol className="space-y-2 text-[12px]">
                {articles.slice(0, 5).map((article, i) => (
                  <li key={article.slug} className="flex items-start gap-2">
                    <span className="num w-4 shrink-0 font-extrabold text-gold-400">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate">{article.title}</span>
                      <span className="num block text-[10px] text-white/40">{compact(article.views)} مشاهدة · وضع العرض</span>
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
