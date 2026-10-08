import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { storeErrorMessage } from "@/lib/db/store-policy";
import { AdminHead, Btn, Panel, Pill, Table, Field, inputCls, NotConnected } from "@/components/admin/ui";
import ConfirmForm from "@/components/admin/ConfirmSubmit";
import { requirePermission } from "@/lib/admin-session";
import { logActivity } from "@/lib/activity";
import { competitions as builtInCompetitions, sports } from "@/lib/core-data";
import {
  COMPETITION_TYPES,
  createAdminCompetition,
  deleteAdminCompetition,
  getAdminCompetitionById,
  listAdminCompetitions,
  setAdminCompetitionPublished,
  updateAdminCompetition,
  type AdminCompetitionInput,
} from "@/lib/admin-competitions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function refresh(slug?: string): void {
  revalidatePath("/admin/competitions");
  revalidatePath("/admin/activity");
  revalidatePath("/admin");
  revalidatePath("/competitions");
  if (slug) revalidatePath(`/competitions/${encodeURIComponent(slug)}`);
  revalidatePath("/sitemap.xml");
}

function readInput(form: FormData): AdminCompetitionInput {
  return {
    nameAr: String(form.get("nameAr") ?? ""),
    nameEn: String(form.get("nameEn") ?? ""),
    sport: String(form.get("sport") ?? "football"),
    country: String(form.get("country") ?? ""),
    season: String(form.get("season") ?? ""),
    logoUrl: String(form.get("logoUrl") ?? ""),
    type: String(form.get("type") ?? "دوري"),
    isPublished: form.get("isPublished") === "on",
    slug: String(form.get("slug") ?? ""),
  };
}

async function createCompetitionAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("competitions");
  const result = await createAdminCompetition(readInput(form), actor.username);
  if (!result.ok) redirect(`/admin/competitions?err=${encodeURIComponent(result.error)}`);
  await logActivity({ action: "competition.create", entityType: "competition", entityId: result.competition.slug, actor: actor.username, role: actor.role, after: { name: result.competition.nameAr } });
  refresh(result.competition.slug);
  redirect(`/admin/competitions?ok=${encodeURIComponent("تمت إضافة البطولة")}`);
}

async function updateCompetitionAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("competitions");
  const id = String(form.get("id") ?? "");
  const result = await updateAdminCompetition(id, readInput(form));
  if (!result.ok) redirect(`/admin/competitions?edit=${encodeURIComponent(id)}&err=${encodeURIComponent(result.error)}`);
  await logActivity({ action: "competition.update", entityType: "competition", entityId: result.competition.slug, actor: actor.username, role: actor.role });
  refresh(result.competition.slug);
  redirect(`/admin/competitions?ok=${encodeURIComponent("تم حفظ البطولة")}`);
}

async function toggleCompetitionAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("competitions");
  const id = String(form.get("id") ?? "");
  const publish = form.get("publish") === "1";
  const comp = await getAdminCompetitionById(id);
  try {
    await setAdminCompetitionPublished(id, publish);
  } catch (e) {
    redirect(`/admin/competitions?err=${encodeURIComponent(storeErrorMessage(e))}`);
  }
  await logActivity({ action: "competition.publish", entityType: "competition", entityId: comp?.slug ?? id, actor: actor.username, role: actor.role, after: { isPublished: publish } });
  refresh(comp?.slug);
  redirect(`/admin/competitions?ok=${encodeURIComponent(publish ? "تم نشر البطولة" : "تم إخفاء البطولة")}`);
}

async function deleteCompetitionAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("competitions");
  const id = String(form.get("id") ?? "");
  const comp = await getAdminCompetitionById(id);
  try {
    await deleteAdminCompetition(id);
  } catch (e) {
    redirect(`/admin/competitions?err=${encodeURIComponent(storeErrorMessage(e))}`);
  }
  await logActivity({ action: "competition.delete", entityType: "competition", entityId: comp?.slug ?? id, actor: actor.username, role: actor.role });
  refresh(comp?.slug);
  redirect(`/admin/competitions?ok=${encodeURIComponent("تم حذف البطولة")}`);
}

export default async function AdminCompetitions({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("competitions");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const err = str("err");
  const okMsg = str("ok");
  const editId = str("edit");

  const [items, editing] = await Promise.all([
    listAdminCompetitions({ limit: 200 }),
    editId ? getAdminCompetitionById(editId) : Promise.resolve(null),
  ]);
  const sportName = (slug: string) => sports.find((s) => s.slug === slug)?.name ?? slug;

  return (
    <div>
      <AdminHead title="البطولات" subtitle={`${items.length} بطولة مُدارة من اللوحة · المنشورة تظهر في /competitions`} />

      {err ? <p role="alert" className="mb-4 rounded-[6px] border border-live/50 bg-live/10 px-4 py-3 text-[13px] font-bold text-live">{err}</p> : null}
      {okMsg ? <p role="status" className="mb-4 rounded-[6px] border border-win/50 bg-win/10 px-4 py-3 text-[13px] font-bold text-win">{okMsg}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Panel title="البطولات المُدارة" aside={<Pill tone="idle">{items.length}</Pill>}>
            {items.length === 0 ? (
              <NotConnected title="لا توجد بطولات مُدارة" message="أضف بطولة من النموذج. البطولات المدمجة في الكتالوج أدناه تبقى كما هي." requires="إدخال البطولة من لوحة التحكم" />
            ) : (
              <Table
                head={["البطولة", "الرياضة", "الدولة", "الموسم", "النوع", "الحالة", "إجراءات"]}
                rows={items.map((c) => [
                  <span key="n" className="block min-w-0">
                    <span className="block truncate font-bold">{c.nameAr}</span>
                    <span className="num block truncate text-[10px] text-white/40" dir="ltr">{c.nameEn || c.slug}</span>
                  </span>,
                  <span key="s" className="text-white/60">{sportName(c.sport)}</span>,
                  <span key="c" className="text-white/60">{c.country || "—"}</span>,
                  <span key="se" className="num">{c.season || "—"}</span>,
                  <span key="t" className="text-white/60">{c.type}</span>,
                  <Pill key="p" tone={c.isPublished ? "ok" : "idle"}>{c.isPublished ? "منشورة" : "مخفية"}</Pill>,
                  <span key="a" className="flex flex-wrap gap-1.5">
                    <Link href={`/admin/competitions?edit=${encodeURIComponent(c.id)}#comp-form`} className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 hover:border-gold-500 hover:text-gold-400">تعديل</Link>
                    <form action={toggleCompetitionAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="publish" value={c.isPublished ? "0" : "1"} />
                      <button type="submit" className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 hover:border-gold-500 hover:text-gold-400">{c.isPublished ? "إخفاء" : "نشر"}</button>
                    </form>
                    <ConfirmForm message={`حذف البطولة ${c.nameAr}؟`} action={deleteCompetitionAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="rounded-[3px] border border-live/50 px-2 py-1 text-[11px] font-bold text-live hover:bg-live hover:text-white">حذف</button>
                    </ConfirmForm>
                  </span>,
                ])}
              />
            )}
          </Panel>

          <Panel title="الكتالوج المدمج (للقراءة فقط)" aside={<Pill tone="idle">{builtInCompetitions.length}</Pill>}>
            <p className="mb-3 text-[11px] leading-relaxed text-white/45">
              بطولات مرجعية مدمجة في الكود تستخدمها صفحات الموقع الحالية. لا تُعدَّل من هنا.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {builtInCompetitions.map((c) => (
                <li key={c.slug} className="flex items-center justify-between gap-2 rounded-[3px] border border-navy-800 px-3 py-2 text-[12px]">
                  <span className="truncate">{c.name}</span>
                  <span className="num shrink-0 text-[10px] text-white/40">{c.season}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div id="comp-form" className="h-fit scroll-mt-20 xl:sticky xl:top-[73px]">
          <Panel title={editing ? `تعديل: ${editing.nameAr}` : "إضافة بطولة"}>
            <form action={editing ? updateCompetitionAction : createCompetitionAction} className="grid grid-cols-1 gap-3">
              {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
              <Field label="اسم البطولة (عربي) *"><input name="nameAr" required maxLength={160} defaultValue={editing?.nameAr ?? ""} className={inputCls} /></Field>
              <Field label="اسم البطولة (إنجليزي)"><input name="nameEn" dir="ltr" maxLength={160} defaultValue={editing?.nameEn ?? ""} className={inputCls} /></Field>
              <Field label="الرياضة">
                <select name="sport" defaultValue={editing?.sport ?? "football"} className={inputCls}>
                  {sports.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="الدولة / النطاق"><input name="country" maxLength={120} defaultValue={editing?.country ?? ""} className={inputCls} /></Field>
              <Field label="الموسم"><input name="season" maxLength={40} dir="ltr" defaultValue={editing?.season ?? ""} className={`${inputCls} num`} placeholder="2026/2027" /></Field>
              <Field label="النوع">
                <select name="type" defaultValue={editing?.type ?? "دوري"} className={inputCls}>
                  {COMPETITION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="الشعار (رابط https)"><input name="logoUrl" dir="ltr" maxLength={1000} defaultValue={editing?.logoUrl ?? ""} className={inputCls} placeholder="https://…" /></Field>
              <Field label="معرّف مختصر (اختياري)"><input name="slug" dir="ltr" maxLength={100} defaultValue={editing?.slug ?? ""} className={`${inputCls} num`} /></Field>
              <label className="flex items-center gap-2 text-[12px] text-white/70">
                <input type="checkbox" name="isPublished" defaultChecked={editing ? editing.isPublished : true} className="h-4 w-4 accent-[#D4AF37]" />
                نشر البطولة على الموقع
              </label>
              <Btn type="submit">{editing ? "حفظ التعديلات" : "إضافة البطولة"}</Btn>
              {editing ? <Link href="/admin/competitions" className="text-center text-[11px] font-bold text-white/50 hover:text-gold-400">إلغاء التعديل</Link> : null}
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
