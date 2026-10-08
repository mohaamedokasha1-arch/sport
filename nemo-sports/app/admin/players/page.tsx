import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminHead, Btn, Panel, Pill, Table, Field, inputCls, NotConnected } from "@/components/admin/ui";
import ConfirmForm from "@/components/admin/ConfirmSubmit";
import { requirePermission } from "@/lib/admin-session";
import { logActivity } from "@/lib/activity";
import { listAdminTeams } from "@/lib/admin-teams";
import {
  createAdminPlayer,
  deleteAdminPlayer,
  getAdminPlayerById,
  listAdminPlayers,
  parseStatsInput,
  setAdminPlayerPublished,
  updateAdminPlayer,
  type AdminPlayerInput,
} from "@/lib/admin-players";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function refresh(slug?: string): void {
  revalidatePath("/admin/players");
  revalidatePath("/admin/activity");
  revalidatePath("/admin");
  revalidatePath("/players");
  if (slug) revalidatePath(`/players/${slug}`);
  revalidatePath("/sitemap.xml");
}

function readInput(form: FormData): AdminPlayerInput {
  const num = (k: string) => {
    const v = String(form.get(k) ?? "").trim();
    return v ? Number(v) : null;
  };
  return {
    fullNameAr: String(form.get("fullNameAr") ?? ""),
    fullNameEn: String(form.get("fullNameEn") ?? ""),
    teamSlug: String(form.get("teamSlug") ?? ""),
    teamName: String(form.get("teamName") ?? ""),
    position: String(form.get("position") ?? ""),
    nationality: String(form.get("nationality") ?? ""),
    jerseyNumber: num("jerseyNumber"),
    photoUrl: String(form.get("photoUrl") ?? ""),
    dateOfBirth: String(form.get("dateOfBirth") ?? ""),
    heightCm: num("heightCm"),
    weightKg: num("weightKg"),
    stats: parseStatsInput(String(form.get("stats") ?? "")),
    isPublished: form.get("isPublished") === "on",
    slug: String(form.get("slug") ?? ""),
  };
}

async function createPlayerAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("players");
  const result = await createAdminPlayer(readInput(form), actor.username);
  if (!result.ok) redirect(`/admin/players?err=${encodeURIComponent(result.error)}`);
  await logActivity({ action: "player.create", entityType: "player", entityId: result.player.slug, actor: actor.username, role: actor.role, after: { name: result.player.fullNameAr } });
  refresh(result.player.slug);
  redirect(`/admin/players?ok=${encodeURIComponent("تم إضافة اللاعب")}`);
}

async function updatePlayerAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("players");
  const id = String(form.get("id") ?? "");
  const result = await updateAdminPlayer(id, readInput(form));
  if (!result.ok) redirect(`/admin/players?edit=${encodeURIComponent(id)}&err=${encodeURIComponent(result.error)}`);
  await logActivity({ action: "player.update", entityType: "player", entityId: result.player.slug, actor: actor.username, role: actor.role });
  refresh(result.player.slug);
  redirect(`/admin/players?ok=${encodeURIComponent("تم حفظ بيانات اللاعب")}`);
}

async function togglePlayerAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("players");
  const id = String(form.get("id") ?? "");
  const publish = form.get("publish") === "1";
  const player = await getAdminPlayerById(id);
  await setAdminPlayerPublished(id, publish);
  await logActivity({ action: "player.publish", entityType: "player", entityId: player?.slug ?? id, actor: actor.username, role: actor.role, after: { isPublished: publish } });
  refresh(player?.slug);
  redirect(`/admin/players?ok=${encodeURIComponent(publish ? "تم نشر اللاعب" : "تم إخفاء اللاعب")}`);
}

async function deletePlayerAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("players");
  const id = String(form.get("id") ?? "");
  const player = await getAdminPlayerById(id);
  await deleteAdminPlayer(id);
  await logActivity({ action: "player.delete", entityType: "player", entityId: player?.slug ?? id, actor: actor.username, role: actor.role });
  refresh(player?.slug);
  redirect(`/admin/players?ok=${encodeURIComponent("تم حذف اللاعب")}`);
}

export default async function AdminPlayers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("players");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const q = str("q");
  const err = str("err");
  const okMsg = str("ok");
  const editId = str("edit");

  const [players, teams, editing] = await Promise.all([
    listAdminPlayers({ q, limit: 300 }),
    listAdminTeams({ limit: 300 }),
    editId ? getAdminPlayerById(editId) : Promise.resolve(null),
  ]);
  const statsText = editing ? Object.entries(editing.stats).map(([k, v]) => `${k}: ${v}`).join("\n") : "";

  return (
    <div>
      <AdminHead title="اللاعبون" subtitle={`${players.length} لاعب · لا تُضاف أي معلومة غير مُدخلة من المشغّل`} />

      {err ? <p role="alert" className="mb-4 rounded-[6px] border border-live/50 bg-live/10 px-4 py-3 text-[13px] font-bold text-live">{err}</p> : null}
      {okMsg ? <p role="status" className="mb-4 rounded-[6px] border border-win/50 bg-win/10 px-4 py-3 text-[13px] font-bold text-win">{okMsg}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="قائمة اللاعبين" aside={<Pill tone="idle">{players.length}</Pill>}>
          <form method="get" className="mb-4 flex gap-2">
            <input name="q" defaultValue={q} placeholder="بحث بالاسم أو الفريق…" className={inputCls} />
            <button type="submit" className="shrink-0 rounded-[3px] border border-navy-700 px-3 py-2 text-[12px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400">بحث</button>
          </form>
          {players.length === 0 ? (
            <NotConnected title="لا يوجد لاعبون مضافون" message="أضف لاعبًا من النموذج المجاور. الحقول غير المُدخلة لن تُعرض." requires="إدخال اللاعب من لوحة التحكم" />
          ) : (
            <Table
              head={["اللاعب", "الفريق", "المركز", "الرقم", "الحالة", "إجراءات"]}
              rows={players.map((p) => [
                <span key="n" className="block min-w-0">
                  <span className="block truncate font-bold">{p.fullNameAr}</span>
                  <span className="num block truncate text-[10px] text-white/40" dir="ltr">{p.fullNameEn || p.slug}</span>
                </span>,
                <span key="t" className="text-white/60">{p.teamName || p.teamSlug || "—"}</span>,
                <span key="p" className="text-white/60">{p.position || "—"}</span>,
                <span key="j" className="num">{p.jerseyNumber ?? "—"}</span>,
                <Pill key="s" tone={p.isPublished ? "ok" : "idle"}>{p.isPublished ? "منشور" : "مخفي"}</Pill>,
                <span key="a" className="flex flex-wrap gap-1.5">
                  <Link href={`/admin/players?edit=${encodeURIComponent(p.id)}#player-form`} className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 hover:border-gold-500 hover:text-gold-400">تعديل</Link>
                  <form action={togglePlayerAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="publish" value={p.isPublished ? "0" : "1"} />
                    <button type="submit" className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 hover:border-gold-500 hover:text-gold-400">{p.isPublished ? "إخفاء" : "نشر"}</button>
                  </form>
                  <ConfirmForm message={`حذف اللاعب ${p.fullNameAr}؟ لا يمكن التراجع.`} action={deletePlayerAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className="rounded-[3px] border border-live/50 px-2 py-1 text-[11px] font-bold text-live hover:bg-live hover:text-white">حذف</button>
                  </ConfirmForm>
                </span>,
              ])}
            />
          )}
        </Panel>

        <div id="player-form" className="h-fit scroll-mt-20 xl:sticky xl:top-[73px]">
          <Panel title={editing ? `تعديل: ${editing.fullNameAr}` : "إضافة لاعب"}>
            <form action={editing ? updatePlayerAction : createPlayerAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
              <Field label="الاسم (عربي) *"><input name="fullNameAr" required maxLength={160} defaultValue={editing?.fullNameAr ?? ""} className={inputCls} /></Field>
              <Field label="الاسم (إنجليزي)"><input name="fullNameEn" dir="ltr" maxLength={160} defaultValue={editing?.fullNameEn ?? ""} className={inputCls} /></Field>
              <Field label="الفريق">
                <select name="teamSlug" defaultValue={editing?.teamSlug ?? ""} className={inputCls}>
                  <option value="">— بدون فريق —</option>
                  {teams.map((t) => <option key={t.slug} value={t.slug}>{t.nameAr}</option>)}
                </select>
              </Field>
              <Field label="اسم الفريق (يدوي، إن لم يكن في القائمة)"><input name="teamName" maxLength={160} defaultValue={editing?.teamName ?? ""} className={inputCls} /></Field>
              <Field label="المركز"><input name="position" maxLength={80} defaultValue={editing?.position ?? ""} className={inputCls} /></Field>
              <Field label="الجنسية (إن كانت موثّقة)"><input name="nationality" maxLength={120} defaultValue={editing?.nationality ?? ""} className={inputCls} /></Field>
              <Field label="الرقم"><input name="jerseyNumber" type="number" min={0} max={999} defaultValue={editing?.jerseyNumber ?? ""} className={`${inputCls} num`} /></Field>
              <Field label="تاريخ الميلاد"><input name="dateOfBirth" type="date" defaultValue={editing?.dateOfBirth?.slice(0, 10) ?? ""} className={inputCls} /></Field>
              <Field label="الطول (سم)"><input name="heightCm" type="number" min={0} max={999} defaultValue={editing?.heightCm ?? ""} className={`${inputCls} num`} /></Field>
              <Field label="الوزن (كجم)"><input name="weightKg" type="number" min={0} max={999} defaultValue={editing?.weightKg ?? ""} className={`${inputCls} num`} /></Field>
              <Field label="الصورة (رابط https)"><input name="photoUrl" dir="ltr" maxLength={1000} defaultValue={editing?.photoUrl ?? ""} className={inputCls} placeholder="https://…" /></Field>
              <div className="sm:col-span-2 xl:col-span-1">
                <Field label="إحصائيات (سطر لكل إحصائية: الاسم: القيمة)">
                  <textarea name="stats" rows={4} defaultValue={statsText} className={inputCls} placeholder={"الأهداف: 12\nالتمريرات الحاسمة: 5"} />
                </Field>
              </div>
              <Field label="معرّف مختصر (اختياري)"><input name="slug" dir="ltr" maxLength={100} defaultValue={editing?.slug ?? ""} className={`${inputCls} num`} /></Field>
              <label className="flex items-center gap-2 text-[12px] text-white/70">
                <input type="checkbox" name="isPublished" defaultChecked={editing ? editing.isPublished : true} className="h-4 w-4 accent-[#D4AF37]" />
                نشر اللاعب على الموقع
              </label>
              <div className="sm:col-span-2 xl:col-span-1"><Btn type="submit">{editing ? "حفظ التعديلات" : "إضافة اللاعب"}</Btn></div>
              {editing ? <Link href="/admin/players" className="text-center text-[11px] font-bold text-white/50 hover:text-gold-400 sm:col-span-2 xl:col-span-1">إلغاء التعديل</Link> : null}
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
