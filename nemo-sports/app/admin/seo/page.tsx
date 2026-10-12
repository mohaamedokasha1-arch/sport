import Link from "next/link";
import { AdminHead, NotConnected, Panel, Pill, Table } from "@/components/admin/ui";
import { SITE_URL } from "@/lib/site";
import { requirePermission } from "@/lib/admin-session";

/** Mirrors the rules and same-origin URLs emitted by app/robots.ts. */
const robotsTxt = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /account
Disallow: /api/

Host: ${SITE_URL}
Sitemap: ${SITE_URL}/sitemap.xml`;

export default async function AdminSeo() {
  await requirePermission("settings");

  return (
    <div>
      <AdminHead
        title="SEO ومصادر البيانات"
        subtitle="Meta tags · Structured Data · Sitemap · Robots · المراقبة"
        action={
          <Link
            href="/sitemap.xml"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-[3px] bg-gold-500 px-3.5 py-2 text-[12px] font-extrabold text-navy-900 transition hover:bg-gold-400"
          >
            عرض Sitemap
          </Link>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Sitemap" aside={<Pill tone="idle">يُولّد عند الطلب</Pill>}>
          <p className="text-[12px] leading-relaxed text-white/60">
            يُبنى الملف من المسارات الثابتة والمحتوى المنشور ومباريات المصادر المتاحة. لا تحسب هذه اللوحة المجموعة نفسها، لذلك لا تعرض رقمًا تقريبيًا قد يختلف عن الملف الفعلي.
          </p>
          <Link
            href="/sitemap.xml"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-[11px] font-bold text-gold-400 hover:underline"
          >
            فتح sitemap.xml ←
          </Link>
        </Panel>

        <Panel title="Meta tags العامة">
          <NotConnected
            title="التحرير غير متاح من هذه الصفحة"
            message="الحقول التي كانت تظهر هنا لم تكن تحفظ التغييرات. تُعرّف Metadata العامة حاليًا في app/layout.tsx؛ لن نعرض نموذجًا يوحي بأن التعديلات ستُطبّق."
            requires="ربط إعدادات SEO بتوليد Metadata قبل إتاحة التحرير"
          />
        </Panel>

        <Panel title="Structured Data">
          <ul className="space-y-2 text-[12px]">
            {[
              { t: "Organization + WebSite", d: "في layout العام مع SearchAction", on: true },
              { t: "SportsEvent", d: "في صفحة المباراة (بيانات الحدث المتاحة)", on: true },
              { t: "NewsArticle", d: "في صفحة الخبر (المصدر والتاريخ والقسم)", on: true },
              { t: "BreadcrumbList", d: "مسار التنقل في صفحات الفرق والبطولات", on: false },
              { t: "ItemList (Standings)", d: "جداول الترتيب", on: false },
            ].map((x) => (
              <li key={x.t} className="flex items-start justify-between gap-3 rounded-[3px] border border-navy-800 p-3">
                <span>
                  <span className="block text-[12px] font-bold">{x.t}</span>
                  <span className="block text-[11px] text-white/50">{x.d}</span>
                </span>
                <Pill tone={x.on ? "ok" : "idle"}>{x.on ? "مفعّل" : "غير موجود"}</Pill>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="robots.txt">
          <pre dir="ltr" className="num overflow-x-auto rounded-[3px] border border-navy-800 bg-navy-950 p-3 text-[11px] leading-relaxed text-white/70">
{robotsTxt}
          </pre>
          <Link
            href="/robots.txt"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-[11px] font-bold text-gold-400 hover:underline"
          >
            عرض robots.txt ←
          </Link>
        </Panel>

        <Panel title="أهداف الأداء (لا توجد قياسات فعلية)">
          <Table
            head={["المقياس", "الهدف", "القياس الحالي", "الحالة"]}
            rows={[
              ["LCP", "< 2.5s", "غير مقاس", <Pill key="lcp" tone="idle">غير متاح</Pill>],
              ["CLS", "< 0.1", "غير مقاس", <Pill key="cls" tone="idle">غير متاح</Pill>],
              ["INP", "< 200ms", "غير مقاس", <Pill key="inp" tone="idle">غير متاح</Pill>],
              ["TTI", "< 3.8s", "غير مقاس", <Pill key="tti" tone="idle">غير متاح</Pill>],
              ["حجم CSS", "< 60KB", "غير مقاس", <Pill key="css" tone="idle">غير متاح</Pill>],
            ]}
          />
          <p className="mt-3 text-[11px] leading-relaxed text-white/45">
            الأهداف ليست نتائج قياس. لا توجد حاليًا أداة RUM أو تقرير Lighthouse متصل بهذه اللوحة؛ لا تُعرض قيم أداء فعلية.
          </p>
        </Panel>

        <Panel title="المراقبة والنسخ الاحتياطية">
          <NotConnected
            title="لا يوجد مصدر قياس موصول"
            message="لا تتوفر قراءة فعلية لـ uptime أو أخطاء 5xx أو زمن استجابة API أو سجل النسخ الاحتياطية؛ لا يمكن تأكيد حالتها من هذه اللوحة."
            requires="مصدر مراقبة وسجل نسخ احتياطي قابل للتحقق"
          />
        </Panel>
      </div>
    </div>
  );
}
