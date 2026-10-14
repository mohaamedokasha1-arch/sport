import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminHead, Btn, Panel, Table, Pill, Field, inputCls } from "@/components/admin/ui";
import { allMatches, articles, competitions, players, teams } from "@/lib/data";
import { demoContentVisible } from "@/lib/site";
import { requirePermission } from "@/lib/admin-session";
import { logActivity } from "@/lib/activity";
import { getSiteSettings, updateSiteSettings } from "@/lib/site-settings";
import { newsHealthSummary } from "@/lib/news/service";
import { canonicalCompetitions } from "@/lib/competition-catalog";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Renders the SAME object `app/robots.ts` serves, so this panel can never drift
 * from the real robots.txt. It used to paste a hand-copied string here, which
 * kept saying "this is what crawlers get" long after the file changed.
 */
function robotsText(): string {
  const r = robots();
  const rule = Array.isArray(r.rules) ? r.rules[0]! : r.rules;
  const sitemaps = Array.isArray(r.sitemap) ? r.sitemap : r.sitemap ? [r.sitemap] : [];
  return [
    `User-agent: ${rule.userAgent}`,
    `Allow: ${rule.allow ?? "/"}`,
    ...(Array.isArray(rule.disallow) ? rule.disallow : rule.disallow ? [rule.disallow] : []).map(
      (entry) => `Disallow: ${entry}`,
    ),
    ...(r.host ? [`Host: ${r.host}`] : []),
    ...sitemaps.map((s) => `Sitemap: ${s}`),
  ].join("\n");
}

/**
 * The one control on this page that changes public output. It writes through
 * the SAME store /admin/settings uses (lib/site-settings.ts) — there is no
 * second SEO configuration, so the two panels can never disagree.
 */
async function saveSeoAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("settings");
  const text = (key: string) => String(form.get(key) ?? "");
  const result = await updateSiteSettings(
    {
      siteNameAr: text("siteNameAr"),
      seo: { metaDescription: text("metaDescription"), keywords: text("keywords") },
    },
    actor.username,
  );
  if (!result.ok) redirect(`/admin/seo?err=${encodeURIComponent(result.error)}`);
  await logActivity({
    action: "seo.update",
    entityType: "settings",
    entityId: "site",
    actor: actor.username,
    role: actor.role,
    after: { metaDescriptionLength: result.settings.seo.metaDescription.length },
  });
  revalidatePath("/admin/seo");
  // The title template, description and keywords live in the ROOT layout's
  // metadata, so every cached page under it must be revalidated for the change
  // to reach a crawler. This is rare, deliberate, and cheaper than serving an
  // index that describes the site with yesterday's sentence.
  revalidatePath("/", "layout");
  redirect(`/admin/seo?ok=${encodeURIComponent("تم حفظ الإعدادات — الصفحات العامة تستخدمها الآن")}`);
}

export default async function AdminSeo({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("settings");
  const sp = await searchParams;
  const err = typeof sp.err === "string" ? sp.err : "";
  const okMsg = typeof sp.ok === "string" ? sp.ok : "";
  const showDemo = demoContentVisible();
  const settings = await getSiteSettings();
  const news = await newsHealthSummary();
  // Generated in-process by the very module that serves the route — no self
  // request over the network, and the number can never describe a different
  // build than the page the admin is reading.
  const entries = await sitemap();
  const matchUrls = entries.filter((e) => e.url.includes("/matches/")).length;
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
        action={
          <span className="flex gap-2">
            <a
              href="/sitemap.xml"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-[4px] border border-navy-700 px-3 py-1.5 text-[11px] font-bold text-white/80 transition hover:border-gold-500 hover:text-gold-400"
            >
              عرض sitemap.xml
            </a>
            <a
              href="/robots.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-[4px] border border-navy-700 px-3 py-1.5 text-[11px] font-bold text-white/80 transition hover:border-gold-500 hover:text-gold-400"
            >
              عرض robots.txt
            </a>
          </span>
        }
      />

      {err ? (
        <p role="alert" className="mb-4 rounded-[6px] border border-live/50 bg-live/10 px-4 py-3 text-[13px] font-bold text-live">
          {err}
        </p>
      ) : null}
      {okMsg ? (
        <p role="status" className="mb-4 rounded-[6px] border border-win/50 bg-win/10 px-4 py-3 text-[13px] font-bold text-win">
          {okMsg}
        </p>
      ) : null}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { k: "روابط في Sitemap المُولَّد الآن", v: entries.length || urlCount },
          { k: "روابط مباريات فيها", v: matchUrls },
          { k: "صفحات مباريات", v: allMatches.length },
          { k: "بطولات منشورة", v: canonicalCompetitions.length },
        ].map((x) => (
          <div key={x.k} className="rounded-[6px] border border-navy-800 bg-navy-900 p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">{x.k}</p>
            <p className="num mt-1 text-2xl font-extrabold">{x.v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Meta tags العامة">
          <form action={saveSeoAction} className="space-y-3">
            <Field label="اسم الموقع في العنوان (عربي)">
              <input name="siteNameAr" defaultValue={settings.siteNameAr} maxLength={120} className={inputCls} />
            </Field>
            <Field label="Site Description">
              <textarea name="metaDescription" rows={3} maxLength={400} defaultValue={settings.seo.metaDescription} className={inputCls} />
            </Field>
            <Field label="الكلمات المفتاحية (بفواصل)">
              <input name="keywords" maxLength={400} defaultValue={settings.seo.keywords} className={inputCls} dir="ltr" />
            </Field>
            <p className="text-[11px] leading-relaxed text-white/45">
              هذه القيم تُقرأ مباشرة في الـ metadata العامة (lib/site-settings.ts ← app/layout.tsx): العنوان
              والوصف والكلمات المفتاحية و Open Graph. لا تُخزَّن هنا أي صورة أو سر — الشعار وبقية الحقول في
              «إعدادات الموقع». لا يُعدِّل هذا القسم ترتيب الموقع في نتائج البحث ولا يعد به.
            </p>
            <Btn type="submit">حفظ</Btn>
          </form>
        </Panel>

        <Panel title="Structured Data">
          <ul className="space-y-2 text-[12px]">
            {[
              { t: "Organization + WebSite", d: "في layout العام مع SearchAction — الاسم والوصف من الإعدادات المحفوظة", on: true },
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
                <Pill tone={x.on ? "ok" : "idle"}>{x.on ? "مفعّل" : "غير مُطبَّق"}</Pill>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="robots.txt (المُولَّد فعليًا)">
          <pre dir="ltr" className="num overflow-x-auto rounded-[3px] border border-navy-800 bg-navy-950 p-3 text-[11px] leading-relaxed text-white/70">
            {robotsText()}
          </pre>
          <p className="mt-3 text-[11px] leading-relaxed text-white/45">
            الملف يُبنى من app/robots.ts عند كل طلب، ومسار الـ Sitemap فيه هو نفس المضيف الذي يخدم الموقع
            (وإلا رفضت Google Search Console كل رابط مُرسَل). لا تحرير يدوي هنا: التعديل في الكود، وهذا
            العرض هو الناتج نفسه.
          </p>
        </Panel>

        <Panel title="Core Web Vitals — الأهداف">
          <Table
            head={["المقياس", "الهدف", "الحالي", "الحالة"]}
            rows={[
              ["LCP", "< 2.5s", "غير مقاس", <Pill key="1" tone="idle">قياس مطلوب</Pill>],
              ["CLS", "< 0.1", "غير مقاس", <Pill key="2" tone="idle">قياس مطلوب</Pill>],
              ["INP", "< 200ms", "غير مقاس", <Pill key="3" tone="idle">قياس مطلوب</Pill>],
              ["TTI", "< 3.8s", "غير مقاس", <Pill key="4" tone="idle">قياس مطلوب</Pill>],
              ["حجم CSS", "< 60KB", "غير مقاس", <Pill key="5" tone="idle">قياس مطلوب</Pill>],
            ]}
          />
          <p className="mt-3 text-[11px] leading-relaxed text-white/45">
            لا يقيس هذا التطبيق أداء المتصفح بنفسه، لذلك لا تُعرض هنا أرقام غير مقياسة. القياس الحقيقي يتم عبر
            Lighthouse / CrUX على نسخة الإنتاج، وتُراجع النتائج قبل أي تغيير في الأداء.
          </p>
        </Panel>
      </div>

      <div className="mt-5">
        <Panel title="حالة مصادر البيانات (مقاسة من التطبيق)">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { k: "مصادر الأخبار المفعّلة", v: `${news.sourcesEnabled} / ${news.sourcesTotal}` },
              { k: "مصادر بلا فشل متتابع", v: `${news.sourcesHealthy} / ${news.sourcesEnabled || 0}` },
              { k: "آخر جلب ناجح", v: news.lastFetchAt ? new Date(news.lastFetchAt).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" }) : "لم يعمل بعد" },
              { k: "آخر محاولة فاشلة", v: news.lastFailureAt ? new Date(news.lastFailureAt).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" }) : "لا يوجد" },
            ].map((x) => (
              <div key={x.k} className="rounded-[3px] border border-navy-800 p-3">
                <p className="text-[10px] text-white/40">{x.k}</p>
                <p className="num mt-1 text-[13px] font-extrabold">{x.v}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-white/45">
            Uptime وأخطاء 5xx والنسخ الاحتياطية تُقاس في لوحة الاستضافة (Vercel) وليس داخل التطبيق، لذا لا تُعرض
            هنا كأرقام. جداول التحديث المجدولة في vercel.json، وكل مصدر أخبار يعرض آخر نجاح وآخر فشل في
            «أخبار → مصادر البيانات».
          </p>
        </Panel>
      </div>
    </div>
  );
}
