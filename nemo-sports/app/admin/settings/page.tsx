import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminHead, Btn, Panel, Pill, Field, inputCls } from "@/components/admin/ui";
import { requirePermission } from "@/lib/admin-session";
import { logActivity } from "@/lib/activity";
import { getSiteSettings, updateSiteSettings } from "@/lib/site-settings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Super Admin only. The middleware blocks /admin/settings for other roles,
 * and requirePermission("settings") re-checks against the live directory.
 */
async function saveSettingsAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("settings");
  const text = (k: string) => String(form.get(k) ?? "");
  const result = await updateSiteSettings(
    {
      siteName: text("siteName"),
      siteNameAr: text("siteNameAr"),
      logoUrl: text("logoUrl"),
      contactEmail: text("contactEmail"),
      defaultLanguage: text("defaultLanguage") === "en" ? "en" : "ar",
      timezone: text("timezone"),
      social: {
        twitter: text("twitter"),
        facebook: text("facebook"),
        instagram: text("instagram"),
        youtube: text("youtube"),
        telegram: text("telegram"),
      },
      live: {
        defaultStreamLabel: text("defaultStreamLabel"),
        publishingEnabled: form.get("publishingEnabled") === "on",
      },
      news: { autoPublish: form.get("autoPublish") === "on" },
      seo: { metaDescription: text("metaDescription"), keywords: text("keywords") },
    },
    actor.username,
  );
  if (!result.ok) redirect(`/admin/settings?err=${encodeURIComponent(result.error)}`);
  await logActivity({ action: "settings.update", entityType: "settings", entityId: "site", actor: actor.username, role: actor.role, after: { publishingEnabled: result.settings.live.publishingEnabled } });
  revalidatePath("/admin/settings");
  revalidatePath("/admin/live");
  revalidatePath("/admin/activity");
  redirect(`/admin/settings?ok=${encodeURIComponent("تم حفظ الإعدادات")}`);
}

export default async function AdminSettings({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("settings");
  const sp = await searchParams;
  const err = typeof sp.err === "string" ? sp.err : "";
  const okMsg = typeof sp.ok === "string" ? sp.ok : "";
  const s = await getSiteSettings();

  return (
    <div>
      <AdminHead
        title="إعدادات الموقع"
        subtitle="حساسة — متاحة لـ Super Admin فقط · لا تُخزَّن فيها أي أسرار أو مفاتيح API"
        action={<Pill tone="bad">Super Admin</Pill>}
      />

      {err ? <p role="alert" className="mb-4 rounded-[6px] border border-live/50 bg-live/10 px-4 py-3 text-[13px] font-bold text-live">{err}</p> : null}
      {okMsg ? <p role="status" className="mb-4 rounded-[6px] border border-win/50 bg-win/10 px-4 py-3 text-[13px] font-bold text-win">{okMsg}</p> : null}

      <form action={saveSettingsAction} className="grid gap-4 xl:grid-cols-2">
        <Panel title="الهوية والعامة">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="اسم الموقع (إنجليزي)"><input name="siteName" defaultValue={s.siteName} maxLength={120} className={inputCls} dir="ltr" /></Field>
            <Field label="اسم الموقع (عربي)"><input name="siteNameAr" defaultValue={s.siteNameAr} maxLength={120} className={inputCls} /></Field>
            <Field label="الشعار (رابط https)"><input name="logoUrl" defaultValue={s.logoUrl} maxLength={1000} className={inputCls} dir="ltr" placeholder="https://…" /></Field>
            <Field label="البريد العام للتواصل"><input name="contactEmail" type="email" defaultValue={s.contactEmail} maxLength={200} className={inputCls} dir="ltr" /></Field>
            <Field label="اللغة الافتراضية">
              <select name="defaultLanguage" defaultValue={s.defaultLanguage} className={inputCls}>
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </Field>
            <Field label="المنطقة الزمنية (IANA)"><input name="timezone" defaultValue={s.timezone} maxLength={64} className={inputCls} dir="ltr" /></Field>
          </div>
        </Panel>

        <Panel title="روابط التواصل الاجتماعي">
          <div className="grid gap-3 sm:grid-cols-2">
            {(["twitter", "facebook", "instagram", "youtube", "telegram"] as const).map((k) => (
              <Field key={k} label={k}><input name={k} defaultValue={s.social[k]} maxLength={1000} className={inputCls} dir="ltr" placeholder="https://…" /></Field>
            ))}
          </div>
        </Panel>

        <Panel title="إعدادات البث المباشر" aside={<Pill tone={s.live.publishingEnabled ? "ok" : "bad"}>{s.live.publishingEnabled ? "النشر مفعّل" : "النشر موقوف"}</Pill>}>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-[12px] text-white/75">
              <input type="checkbox" name="publishingEnabled" defaultChecked={s.live.publishingEnabled} className="h-4 w-4 accent-[#D4AF37]" />
              السماح بنشر البثوث (مفتاح إيقاف طارئ لكل البث)
            </label>
            <Field label="اسم البث الافتراضي للمصدر"><input name="defaultStreamLabel" defaultValue={s.live.defaultStreamLabel} maxLength={160} className={inputCls} /></Field>
          </div>
        </Panel>

        <Panel title="إعدادات الأخبار">
          <label className="flex items-center gap-2 text-[12px] text-white/75">
            <input type="checkbox" name="autoPublish" defaultChecked={s.news.autoPublish} className="h-4 w-4 accent-[#D4AF37]" />
            نشر الأخبار التلقائية (RSS) مباشرة دون مراجعة
          </label>
          <p className="mt-2 text-[11px] leading-relaxed text-white/40">يبقى المصدر و الرابط الأصلي ظاهرين لكل خبر في كل الحالات.</p>
        </Panel>

        <Panel title="SEO الأساسي">
          <div className="space-y-3">
            <Field label="الوصف الافتراضي (meta description)"><textarea name="metaDescription" rows={3} defaultValue={s.seo.metaDescription} maxLength={400} className={inputCls} /></Field>
            <Field label="الكلمات المفتاحية"><input name="keywords" defaultValue={s.seo.keywords} maxLength={400} className={inputCls} /></Field>
          </div>
        </Panel>

        <div className="xl:col-span-2 flex items-center justify-between gap-3">
          <p className="text-[11px] text-white/40">آخر تعديل بواسطة: {actor.username}</p>
          <Btn type="submit">حفظ الإعدادات</Btn>
        </div>
      </form>
    </div>
  );
}
