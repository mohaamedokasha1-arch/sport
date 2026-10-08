import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { storeErrorMessage } from "@/lib/db/store-policy";
import { AdminHead, Btn, Panel, Pill, Table, Field, inputCls, NotConnected } from "@/components/admin/ui";
import ConfirmForm from "@/components/admin/ConfirmSubmit";
import { requirePermission } from "@/lib/admin-session";
import { logActivity } from "@/lib/activity";
import { competitions } from "@/lib/core-data";
import { listAdminCompetitions } from "@/lib/admin-competitions";
import {
  createAdminTeam,
  deleteAdminTeam,
  getAdminTeamById,
  listAdminTeams,
  setAdminTeamPublished,
  updateAdminTeam,
  type AdminTeamInput,
} from "@/lib/admin-teams";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function refresh(slug?: string): void {
  revalidatePath("/admin/teams");
  revalidatePath("/admin/activity");
  revalidatePath("/admin");
  revalidatePath("/teams");
  if (slug) revalidatePath(`/teams/${encodeURIComponent(slug)}`);
  revalidatePath("/sitemap.xml");
}

function readInput(form: FormData): AdminTeamInput {
  const year = String(form.get("foundedYear") ?? "").trim();
  return {
    nameAr: String(form.get("nameAr") ?? ""),
    nameEn: String(form.get("nameEn") ?? ""),
    shortName: String(form.get("shortName") ?? ""),
    sport: String(form.get("sport") ?? "football"),
    country: String(form.get("country") ?? ""),
    logoUrl: String(form.get("logoUrl") ?? ""),
    competitionSlug: String(form.get("competitionSlug") ?? ""),
    stadium: String(form.get("stadium") ?? ""),
    coach: String(form.get("coach") ?? ""),
    foundedYear: year ? Number(year) : null,
    primaryColor: String(form.get("primaryColor") ?? ""),
    secondaryColor: String(form.get("secondaryColor") ?? ""),
    isPublished: form.get("isPublished") === "on",
    slug: String(form.get("slug") ?? ""),
  };
}

async function createTeamAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("teams");
  const result = await createAdminTeam(readInput(form), actor.username);
  if (!result.ok) redirect(`/admin/teams?err=${encodeURIComponent(result.error)}`);
  await logActivity({ action: "team.create", entityType: "team", entityId: result.team.slug, actor: actor.username, role: actor.role, after: { name: result.team.nameAr } });
  refresh(result.team.slug);
  redirect(`/admin/teams?ok=${encodeURIComponent("تم إضافة الفريق")}`);
}

async function updateTeamAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("teams");
  const id = String(form.get("id") ?? "");
  const result = await updateAdminTeam(id, readInput(form));
  if (!result.ok) redirect(`/admin/teams?edit=${encodeURIComponent(id)}&err=${encodeURIComponent(result.error)}`);
  await logActivity({ action: "team.update", entityType: "team", entityId: result.team.slug, actor: actor.username, role: actor.role });
  refresh(result.team.slug);
  redirect(`/admin/teams?ok=${encodeURIComponent("تم حفظ بيانات الفريق")}`);
}

async function toggleTeamAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("teams");
  const id = String(form.get("id") ?? "");
  const publish = form.get("publish") === "1";
  const team = await getAdminTeamById(id);
  try {
    await setAdminTeamPublished(id, publish);
  } catch (e) {
    redirect(`/admin/teams?err=${encodeURIComponent(storeErrorMessage(e))}`);
  }
  await logActivity({ action: "team.publish", entityType: "team", entityId: team?.slug ?? id, actor: actor.username, role: actor.role, after: { isPublished: publish } });
  refresh(team?.slug);
  redirect(`/admin/teams?ok=${encodeURIComponent(publish ? "تم نشر الفريق" : "تم إخفاء الفريق")}`);
}

async function deleteTeamAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("teams");
  const id = String(form.get("id") ?? "");
  const team = await getAdminTeamById(id);
  try {
    await deleteAdminTeam(id);
  } catch (e) {
    redirect(`/admin/teams?err=${encodeURIComponent(storeErrorMessage(e))}`);
  }
  await logActivity({ action: "team.delete", entityType: "team", entityId: team?.slug ?? id, actor: actor.username, role: actor.role });
  refresh(team?.slug);
  redirect(`/admin/teams?ok=${encodeURIComponent("تم حذف الفريق")}`);
}

export default async function AdminTeams({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("teams");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = str("q");
  const err = str("err");
  const okMsg = str("ok");
  const editId = str("edit");

  const [teams, adminComps, editing] = await Promise.all([
    listAdminTeams({ q, limit: 300 }),
    listAdminCompetitions({ limit: 200 }),
    editId ? getAdminTeamById(editId) : Promise.resolve(null),
  ]);
  const compOptions = [
    ...competitions.map((c) => ({ slug: c.slug, name: c.name })),
    ...adminComps.map((c) => ({ slug: c.slug, name: c.nameAr })),
  ];
  const compName = (slug: string) => compOptions.find((c) => c.slug === slug)?.name ?? slug;

  return (
    <div>
      <AdminHead
        title="الفرق"
        subtitle={`${teams.length} فريق · الفرق المنشورة تظهر في /teams وصفحة الفريق`}
      />

      {err ? <p role="alert" className="mb-4 rounded-[6px] border border-live/50 bg-live/10 px-4 py-3 text-[13px] font-bold text-live">{err}</p> : null}
      {okMsg ? <p role="status" className="mb-4 rounded-[6px] border border-win/50 bg-win/10 px-4 py-3 text-[13px] font-bold text-win">{okMsg}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="قائمة الفرق" aside={<Pill tone="idle">{teams.length}</Pill>}>
          <form method="get" className="mb-4 flex gap-2">
            <input name="q" defaultValue={q} placeholder="بحث باسم الفريق أو البلد…" className={inputCls} />
            <button type="submit" className="shrink-0 rounded-[3px] border border-navy-700 px-3 py-2 text-[12px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400">بحث</button>
          </form>
          {teams.length === 0 ? (
            <NotConnected title="لا توجد فرق مضافة" message="أضف فريقًا من النموذج المجاور. لن نعرض فرقًا مخترعة." requires="إدخال الفريق من لوحة التحكم" />
          ) : (
            <Table
              head={["الفريق", "البطولة", "البلد", "التأسيس", "الحالة", "إجراءات"]}
              rows={teams.map((t) => [
                <span key="n" className="block min-w-0">
                  <span className="block truncate font-bold">{t.nameAr}</span>
                  <span className="num block truncate text-[10px] text-white/40" dir="ltr">{t.nameEn || t.slug}</span>
                </span>,
                <span key="c" className="text-white/60">{t.competitionSlug ? compName(t.competitionSlug) : "—"}</span>,
                <span key="k" className="text-white/60">{t.country || "—"}</span>,
                <span key="y" className="num">{t.foundedYear ?? "—"}</span>,
                <Pill key="s" tone={t.isPublished ? "ok" : "idle"}>{t.isPublished ? "منشور" : "مخفي"}</Pill>,
                <span key="a" className="flex flex-wrap gap-1.5">
                  <Link href={`/admin/teams?edit=${encodeURIComponent(t.id)}#team-form`} className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 hover:border-gold-500 hover:text-gold-400">تعديل</Link>
                  <form action={toggleTeamAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="publish" value={t.isPublished ? "0" : "1"} />
                    <button type="submit" className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 hover:border-gold-500 hover:text-gold-400">{t.isPublished ? "إخفاء" : "نشر"}</button>
                  </form>
                  <ConfirmForm message={`حذف الفريق ${t.nameAr}؟ لا يمكن التراجع.`} action={deleteTeamAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <button type="submit" className="rounded-[3px] border border-live/50 px-2 py-1 text-[11px] font-bold text-live hover:bg-live hover:text-white">حذف</button>
                  </ConfirmForm>
                </span>,
              ])}
            />
          )}
        </Panel>

        <div id="team-form" className="h-fit scroll-mt-20 xl:sticky xl:top-[73px]">
          <Panel title={editing ? `تعديل: ${editing.nameAr}` : "إضافة فريق"}>
            <form action={editing ? updateTeamAction : createTeamAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
              <Field label="اسم الفريق (عربي) *"><input name="nameAr" required maxLength={160} defaultValue={editing?.nameAr ?? ""} className={inputCls} /></Field>
              <Field label="اسم الفريق (إنجليزي)"><input name="nameEn" maxLength={160} dir="ltr" defaultValue={editing?.nameEn ?? ""} className={inputCls} /></Field>
              <Field label="الاختصار"><input name="shortName" maxLength={40} dir="ltr" defaultValue={editing?.shortName ?? ""} className={inputCls} /></Field>
              <Field label="البلد"><input name="country" maxLength={120} defaultValue={editing?.country ?? ""} className={inputCls} /></Field>
              <Field label="البطولة الرئيسية">
                <select name="competitionSlug" defaultValue={editing?.competitionSlug ?? ""} className={inputCls}>
                  <option value="">—</option>
                  {compOptions.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="الرياضة">
                <select name="sport" defaultValue={editing?.sport ?? "football"} className={inputCls}>
                  <option value="football">كرة القدم</option>
                  <option value="basketball">كرة السلة</option>
                  <option value="tennis">التنس</option>
                  <option value="handball">كرة اليد</option>
                  <option value="volleyball">الكرة الطائرة</option>
                </select>
              </Field>
              <Field label="الشعار (رابط https)"><input name="logoUrl" dir="ltr" maxLength={1000} defaultValue={editing?.logoUrl ?? ""} className={inputCls} placeholder="https://…" /></Field>
              <Field label="الملعب"><input name="stadium" maxLength={200} defaultValue={editing?.stadium ?? ""} className={inputCls} /></Field>
              <Field label="المدرب"><input name="coach" maxLength={160} defaultValue={editing?.coach ?? ""} className={inputCls} /></Field>
              <Field label="سنة التأسيس"><input name="foundedYear" type="number" min={1850} max={2100} defaultValue={editing?.foundedYear ?? ""} className={`${inputCls} num`} /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="اللون الأساسي"><input name="primaryColor" type="color" defaultValue={editing?.primaryColor || "#0f1b2e"} className="h-9 w-full rounded-[3px] border border-navy-700 bg-navy-950" /></Field>
                <Field label="اللون الثانوي"><input name="secondaryColor" type="color" defaultValue={editing?.secondaryColor || "#d4af37"} className="h-9 w-full rounded-[3px] border border-navy-700 bg-navy-950" /></Field>
              </div>
              <Field label="معرّف مختصر (اختياري)"><input name="slug" dir="ltr" maxLength={100} defaultValue={editing?.slug ?? ""} className={`${inputCls} num`} /></Field>
              <label className="flex items-center gap-2 text-[12px] text-white/70 sm:col-span-2 xl:col-span-1">
                <input type="checkbox" name="isPublished" defaultChecked={editing ? editing.isPublished : true} className="h-4 w-4 accent-[#D4AF37]" />
                نشر الفريق على الموقع
              </label>
              <div className="sm:col-span-2 xl:col-span-1"><Btn type="submit">{editing ? "حفظ التعديلات" : "إضافة الفريق"}</Btn></div>
              {editing ? <Link href="/admin/teams" className="text-center text-[11px] font-bold text-white/50 hover:text-gold-400 sm:col-span-2 xl:col-span-1">إلغاء التعديل</Link> : null}
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
