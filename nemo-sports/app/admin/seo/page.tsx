import { AdminHead, Btn, Panel, Table, Pill, Field, inputCls } from "@/components/admin/ui";
import { allMatches, articles, competitions, players, teams } from "@/lib/data";
import { SITE_URL, demoContentVisible } from "@/lib/site";

/** Mirrors app/robots.ts — the URLs are derived, never hardcoded. */
const robotsTxt = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /account
Disallow: /api/

Sitemap: ${SITE_URL}/sitemap.xml`;

export default function AdminSeo() {
  const showDemo = demoContentVisible();
  // Only pages that actually exist and carry indexable content are counted —
  // matching what app/sitemap.ts emits for the current content mode.
  const urlCount =
    8 /* static informational pages */ +
    (showDemo ? 10 + allMatches.length + competitions.length + teams.length + players.length + articles.length : 0);

  return (
    <div>
      <AdminHead
        title="SEO ومصادر البيانات"
        subtitle="Meta tags · Structured Data · Sitemap · Robots · المراقبة"
        action={<Btn>إعادة بناء Sitemap</Btn>}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { k: "روابط في Sitemap", v: urlCount },
          { k: "صفحات مباريات", v: allMatches.length },
          { k: "صفحات فرق", v: teams.length },
          { k: "مقالات", v: articles.length },
        ].map((x) => (
          <div key={x.k} className="rounded-[6px] border border-navy-800 bg-navy-900 p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">{x.k}</p>
            <p className="num mt-1 text-2xl font-extrabold">{x.v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Meta tags العامة">
          <div className="space-y-3">
            <Field label="Site Title">
              <input className={inputCls} defaultValue="نيمو سبورتس | نتائج مباشرة، أخبار وإحصائيات لـ 8 رياضات" />
            </Field>
            <Field label="Site Description">
              <textarea
                rows={3}
                className={inputCls}
                defaultValue="منصة رياضية شاملة: نتائج ومباريات مباشرة، أخبار موثوقة، ترتيب البطولات، إحصائيات الفرق واللاعبين، وروابط بث رسمية مرخّصة فقط."
              />
            </Field>
            <Field label="OG Image">
              <div className="grid h-20 place-items-center rounded-[3px] border border-dashed border-navy-700 text-[11px] text-white/40">
                1200×630 — اسحب صورة أو اضغط للرفع
              </div>
            </Field>
            <Btn>حفظ</Btn>
          </div>
        </Panel>

        <Panel title="Structured Data">
          <ul className="space-y-2 text-[12px]">
            {[
              { t: "Organization + WebSite", d: "في layout العام مع SearchAction", on: true },
              { t: "SportsEvent", d: "في كل صفحة مباراة (الفريقان، الموعد، الملعب، الحالة)", on: true },
              { t: "NewsArticle", d: "في كل صفحة خبر (الكاتب، التاريخ، القسم)", on: true },
              { t: "BreadcrumbList", d: "مسار التنقل في صفحات الفرق والبطولات", on: false },
              { t: "ItemList (Standings)", d: "جداول الترتيب", on: false },
            ].map((x) => (
              <li key={x.t} className="flex items-start justify-between gap-3 rounded-[3px] border border-navy-800 p-3">
                <span>
                  <span className="block text-[12px] font-bold">{x.t}</span>
                  <span className="block text-[11px] text-white/50">{x.d}</span>
                </span>
                <Pill tone={x.on ? "ok" : "idle"}>{x.on ? "مفعّل" : "مخطط"}</Pill>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="robots.txt">
          <pre dir="ltr" className="num overflow-x-auto rounded-[3px] border border-navy-800 bg-navy-950 p-3 text-[11px] leading-relaxed text-white/70">
{robotsTxt}
          </pre>
          <div className="mt-3 flex gap-2">
            <Btn tone="ghost">تعديل</Btn>
            <Btn tone="ghost">تنزيل sitemap.xml</Btn>
          </div>
        </Panel>

        <Panel title="Core Web Vitals — الأهداف">
          <Table
            head={["المقياس", "الهدف", "الحالي (تقديري)", "الحالة"]}
            rows={[
              ["LCP", "< 2.5s", "1.9s", <Pill key="1" tone="ok">جيد</Pill>],
              ["CLS", "< 0.1", "0.04", <Pill key="2" tone="ok">جيد</Pill>],
              ["INP", "< 200ms", "140ms", <Pill key="3" tone="ok">جيد</Pill>],
              ["TTI", "< 3.8s", "3.1s", <Pill key="4" tone="ok">جيد</Pill>],
              ["حجم CSS", "< 60KB", "54KB", <Pill key="5" tone="ok">جيد</Pill>],
            ]}
          />
          <p className="mt-3 text-[11px] leading-relaxed text-white/45">
            الأرقام تقديرية من نسخة التطوير. القياس الحقيقي يتم عبر Lighthouse على نسخة
            الإنتاج بعد تفعيل CDN وضغط الصور WebP.
          </p>
        </Panel>
      </div>

      <div className="mt-5">
        <Panel title="المراقبة والنسخ الاحتياطية">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { k: "Uptime (30 يوم)", v: "99.97%", tone: "ok" as const },
              { k: "آخر نسخة احتياطية", v: "اليوم 03:00", tone: "ok" as const },
              { k: "أخطاء 5xx (24 ساعة)", v: "3", tone: "warn" as const },
              { k: "متوسط استجابة API", v: "18ms", tone: "ok" as const },
            ].map((x) => (
              <div key={x.k} className="rounded-[3px] border border-navy-800 p-3">
                <p className="text-[10px] text-white/40">{x.k}</p>
                <p className="num mt-1 text-lg font-extrabold">{x.v}</p>
                <Pill tone={x.tone}>{x.tone === "ok" ? "سليم" : "متابعة"}</Pill>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-white/45">
            نسخ يومية تُخزَّن في موقع منفصل، مع اختبار استعادة شهري والاحتفاظ بـ 30 يومًا.
          </p>
        </Panel>
      </div>
    </div>
  );
}
