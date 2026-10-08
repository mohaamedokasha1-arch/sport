import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminHead, Btn, Panel, Pill, Table, Field, inputCls, NotConnected } from "@/components/admin/ui";
import ConfirmForm from "@/components/admin/ConfirmSubmit";
import { requirePermission } from "@/lib/admin-session";
import { logActivity } from "@/lib/activity";
import { dateAr, timeOf } from "@/lib/format";
import {
  MANUAL_NEWS_STATUSES,
  MANUAL_NEWS_STATUS_AR,
  createManualNews,
  deleteManualNews,
  getManualNewsById,
  listManualNews,
  manualNewsCounts,
  setManualNewsStatus,
  updateManualNews,
  type ManualNewsInput,
  type ManualNewsStatus,
} from "@/lib/manual-news";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function refresh(slug?: string): void {
  revalidatePath("/admin/news/manual");
  revalidatePath("/admin/news");
  revalidatePath("/admin/activity");
  revalidatePath("/admin");
  revalidatePath("/news");
  if (slug) revalidatePath(`/news/${slug}`);
  revalidatePath("/sitemap.xml");
}

function readInput(form: FormData): ManualNewsInput {
  const status = String(form.get("status") ?? "draft") as ManualNewsStatus;
  return {
    title: String(form.get("title") ?? ""),
    titleEn: String(form.get("titleEn") ?? ""),
    imageUrl: String(form.get("imageUrl") ?? ""),
    description: String(form.get("description") ?? ""),
    content: String(form.get("content") ?? ""),
    sourceName: String(form.get("sourceName") ?? ""),
    sourceUrl: String(form.get("sourceUrl") ?? ""),
    publishedAt: String(form.get("publishedAt") ?? ""),
    category: String(form.get("category") ?? ""),
    relatedTeam: String(form.get("relatedTeam") ?? ""),
    relatedCompetition: String(form.get("relatedCompetition") ?? ""),
    status: MANUAL_NEWS_STATUSES.includes(status) ? status : "draft",
    slug: String(form.get("slug") ?? ""),
  };
}

async function createNewsAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("news");
  const result = await createManualNews(readInput(form), actor.username);
  if (!result.ok) redirect(`/admin/news/manual?err=${encodeURIComponent(result.error)}`);
  await logActivity({ action: "news.manual.create", entityType: "news", entityId: result.article.slug, actor: actor.username, role: actor.role, after: { status: result.article.status, source: result.article.sourceName } });
  refresh(result.article.slug);
  redirect(`/admin/news/manual?ok=${encodeURIComponent("تم حفظ الخبر")}`);
}

async function updateNewsAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("news");
  const id = String(form.get("id") ?? "");
  const result = await updateManualNews(id, readInput(form));
  if (!result.ok) redirect(`/admin/news/manual?edit=${encodeURIComponent(id)}&err=${encodeURIComponent(result.error)}`);
  await logActivity({ action: "news.manual.update", entityType: "news", entityId: result.article.slug, actor: actor.username, role: actor.role, after: { status: result.article.status } });
  refresh(result.article.slug);
  redirect(`/admin/news/manual?ok=${encodeURIComponent("تم تحديث الخبر")}`);
}

async function setNewsStatusAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("news");
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "") as ManualNewsStatus;
  if (!MANUAL_NEWS_STATUSES.includes(status)) redirect(`/admin/news/manual?err=${encodeURIComponent("حالة غير صالحة")}`);
  const article = await getManualNewsById(id);
  if (status === "published" && (!article || !article.sourceName || !article.sourceUrl)) {
    redirect(`/admin/news/manual?err=${encodeURIComponent("لا يمكن نشر خبر بدون مصدر حقيقي")}`);
  }
  await setManualNewsStatus(id, status);
  await logActivity({ action: "news.manual.status", entityType: "news", entityId: article?.slug ?? id, actor: actor.username, role: actor.role, after: { status } });
  refresh(article?.slug);
  redirect(`/admin/news/manual?ok=${encodeURIComponent(`حالة الخبر: ${MANUAL_NEWS_STATUS_AR[status]}`)}`);
}

async function deleteNewsAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("news");
  const id = String(form.get("id") ?? "");
  const article = await getManualNewsById(id);
  await deleteManualNews(id);
  await logActivity({ action: "news.manual.delete", entityType: "news", entityId: article?.slug ?? id, actor: actor.username, role: actor.role });
  refresh(article?.slug);
  redirect(`/admin/news/manual?ok=${encodeURIComponent("تم حذف الخبر")}`);
}

const tone = { draft: "idle", published: "ok", hidden: "warn" } as const;

export default async function AdminManualNews({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("news");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const err = str("err");
  const okMsg = str("ok");
  const editId = str("edit");
  const statusFilter = (MANUAL_NEWS_STATUSES as string[]).includes(str("status")) ? (str("status") as ManualNewsStatus) : undefined;

  const [items, counts, editing] = await Promise.all([
    listManualNews({ status: statusFilter, limit: 100 }),
    manualNewsCounts(),
    editId ? getManualNewsById(editId) : Promise.resolve(null),
  ]);

  return (
    <div>
      <AdminHead
        title="الأخبار اليدوية"
        subtitle={`منشور ${counts.published} · مسودة ${counts.draft} · مخفي ${counts.hidden} · كل خبر يحمل مصدرًا ورابطًا أصليًا`}
        action={<Link href="/admin/news"><Btn tone="ghost">الأخبار التلقائية (RSS)</Btn></Link>}
      />

      {err ? <p role="alert" className="mb-4 rounded-[6px] border border-live/50 bg-live/10 px-4 py-3 text-[13px] font-bold text-live">{err}</p> : null}
      {okMsg ? <p role="status" className="mb-4 rounded-[6px] border border-win/50 bg-win/10 px-4 py-3 text-[13px] font-bold text-win">{okMsg}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel title="الأخبار" aside={<Pill tone="idle">{items.length}</Pill>}>
          <div className="mb-4 flex flex-wrap gap-1.5">
            <Link href="/admin/news/manual" className={`rounded-[3px] px-3 py-1.5 text-[11px] font-bold ${!statusFilter ? "bg-gold-500 text-navy-900" : "border border-navy-700 text-white/70 hover:border-gold-500 hover:text-gold-400"}`}>الكل</Link>
            {MANUAL_NEWS_STATUSES.map((s) => (
              <Link key={s} href={`/admin/news/manual?status=${s}`} className={`rounded-[3px] px-3 py-1.5 text-[11px] font-bold ${statusFilter === s ? "bg-gold-500 text-navy-900" : "border border-navy-700 text-white/70 hover:border-gold-500 hover:text-gold-400"}`}>
                {MANUAL_NEWS_STATUS_AR[s]} ({counts[s]})
              </Link>
            ))}
          </div>
          {items.length === 0 ? (
            <NotConnected title="لا توجد أخبار يدوية" message="أضف خبرًا من النموذج. لن نعرض أخبارًا تجريبية أو مخترعة." requires="مصدر ورابط أصلي لكل خبر" />
          ) : (
            <Table
              head={["العنوان", "المصدر", "التاريخ", "الحالة", "إجراءات"]}
              rows={items.map((n) => [
                <span key="t" className="block max-w-[260px] truncate font-bold">{n.title}</span>,
                <span key="s" className="block max-w-[160px] truncate text-white/60">{n.sourceName}</span>,
                <span key="d" className="num whitespace-nowrap text-[11px] text-white/60">{dateAr(n.publishedAt)} · {timeOf(n.publishedAt)}</span>,
                <Pill key="st" tone={tone[n.status]}>{MANUAL_NEWS_STATUS_AR[n.status]}</Pill>,
                <span key="a" className="flex flex-wrap gap-1.5">
                  <Link href={`/admin/news/manual?edit=${encodeURIComponent(n.id)}#news-form`} className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 hover:border-gold-500 hover:text-gold-400">تعديل</Link>
                  {n.status !== "published" ? (
                    <form action={setNewsStatusAction}>
                      <input type="hidden" name="id" value={n.id} />
                      <input type="hidden" name="status" value="published" />
                      <button type="submit" className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 hover:border-gold-500 hover:text-gold-400">نشر</button>
                    </form>
                  ) : null}
                  {n.status === "published" ? (
                    <form action={setNewsStatusAction}>
                      <input type="hidden" name="id" value={n.id} />
                      <input type="hidden" name="status" value="hidden" />
                      <button type="submit" className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 hover:border-gold-500 hover:text-gold-400">إخفاء</button>
                    </form>
                  ) : null}
                  <ConfirmForm message={`حذف الخبر «${n.title}»؟`} action={deleteNewsAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" className="rounded-[3px] border border-live/50 px-2 py-1 text-[11px] font-bold text-live hover:bg-live hover:text-white">حذف</button>
                  </ConfirmForm>
                </span>,
              ])}
            />
          )}
        </Panel>

        <div id="news-form" className="h-fit scroll-mt-20 xl:sticky xl:top-[73px]">
          <Panel title={editing ? "تعديل خبر" : "إضافة خبر"}>
            <form action={editing ? updateNewsAction : createNewsAction} className="grid gap-3">
              {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
              <Field label="العنوان (عربي) *"><input name="title" required maxLength={300} defaultValue={editing?.title ?? ""} className={inputCls} /></Field>
              <Field label="العنوان (إنجليزي)"><input name="titleEn" dir="ltr" maxLength={300} defaultValue={editing?.titleEn ?? ""} className={inputCls} /></Field>
              <Field label="ملخص قصير"><textarea name="description" rows={2} maxLength={600} defaultValue={editing?.description ?? ""} className={inputCls} /></Field>
              <Field label="نص الخبر (فقرات مفصولة بسطر فارغ — نص عادي فقط)">
                <textarea name="content" rows={6} maxLength={20000} defaultValue={editing?.content ?? ""} className={inputCls} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="اسم المصدر *"><input name="sourceName" required maxLength={160} defaultValue={editing?.sourceName ?? ""} className={inputCls} placeholder="اسم الجريدة أو الموقع" /></Field>
                <Field label="رابط المصدر الأصلي (https) *"><input name="sourceUrl" required maxLength={1000} dir="ltr" defaultValue={editing?.sourceUrl ?? ""} className={inputCls} placeholder="https://…" /></Field>
                <Field label="صورة (رابط https)"><input name="imageUrl" dir="ltr" maxLength={1000} defaultValue={editing?.imageUrl ?? ""} className={inputCls} /></Field>
                <Field label="تاريخ النشر"><input name="publishedAt" type="date" defaultValue={editing?.publishedAt?.slice(0, 10) ?? ""} className={inputCls} /></Field>
                <Field label="التصنيف"><input name="category" maxLength={80} defaultValue={editing?.category ?? "أخبار"} className={inputCls} /></Field>
                <Field label="الحالة">
                  <select name="status" defaultValue={editing?.status ?? "draft"} className={inputCls}>
                    {MANUAL_NEWS_STATUSES.map((s) => <option key={s} value={s}>{MANUAL_NEWS_STATUS_AR[s]}</option>)}
                  </select>
                </Field>
                <Field label="الفريق المرتبط"><input name="relatedTeam" maxLength={120} defaultValue={editing?.relatedTeam ?? ""} className={inputCls} /></Field>
                <Field label="البطولة المرتبطة"><input name="relatedCompetition" maxLength={120} defaultValue={editing?.relatedCompetition ?? ""} className={inputCls} /></Field>
              </div>
              <Field label="معرّف مختصر (اختياري)"><input name="slug" dir="ltr" maxLength={100} defaultValue={editing?.slug ?? ""} className={`${inputCls} num`} /></Field>
              <Btn type="submit">{editing ? "حفظ التعديلات" : "حفظ الخبر"}</Btn>
              {editing ? <Link href="/admin/news/manual" className="text-center text-[11px] font-bold text-white/50 hover:text-gold-400">إلغاء التعديل</Link> : null}
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
