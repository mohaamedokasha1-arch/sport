import { revalidatePath } from "next/cache";
import { AdminHead, Panel, Table, Pill, Field, inputCls } from "@/components/admin/ui";
import {
  coverageStats,
  createBroadcaster,
  deleteBroadcaster,
  listBroadcasters,
  setBroadcasterStatus,
  validateBroadcastLink,
  type BroadcastStatus,
} from "@/lib/broadcasts";
import { competitions } from "@/lib/core-data";

export const dynamic = "force-dynamic";

/* ── server actions ─────────────────────────────────────────── */

async function addBroadcasterAction(form: FormData): Promise<void> {
  "use server";
  const competitionId = String(form.get("competitionId") ?? "").trim();
  const comp = competitions.find((c) => c.slug === competitionId);
  await createBroadcaster({
    competitionId,
    competitionName: comp?.name ?? competitionId,
    broadcasterName: String(form.get("broadcasterName") ?? "").trim(),
    platform: (String(form.get("platform") ?? "TV") as "TV" | "Website" | "Mobile App" | "Streaming" | "Other"),
    regions: String(form.get("regions") ?? "")
      .split(/[،,]/)
      .map((r) => r.trim())
      .filter(Boolean),
    broadcastWebsite: String(form.get("broadcastWebsite") ?? "").trim(),
    verificationSource: String(form.get("verificationSource") ?? "").trim(),
    requiresSubscription: form.get("requiresSubscription") === "on",
    freeAccess: form.get("freeAccess") === "on",
    notes: String(form.get("notes") ?? "").trim() || undefined,
  });
  revalidatePath("/admin/broadcast");
}

async function setStatusAction(form: FormData): Promise<void> {
  "use server";
  await setBroadcasterStatus(String(form.get("id") ?? ""), String(form.get("status") ?? "pending") as BroadcastStatus);
  revalidatePath("/admin/broadcast");
}

async function removeAction(form: FormData): Promise<void> {
  "use server";
  await deleteBroadcaster(String(form.get("id") ?? ""));
  revalidatePath("/admin/broadcast");
}

const tone = { approved: "ok", pending: "warn", rejected: "bad" } as const;
const label = { approved: "موثّق", pending: "قيد المراجعة", rejected: "مرفوض" };

const btnGhost =
  "rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400";

export default async function AdminBroadcast({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const testUrl = typeof sp.test === "string" ? sp.test : "";
  const testResult = testUrl ? validateBroadcastLink(testUrl) : null;

  const [entries, stats] = await Promise.all([listBroadcasters(true), coverageStats()]);

  return (
    <div>
      <AdminHead
        title="البث والترخيص"
        subtitle="لا يُنشر أي رابط بث قبل توثيق الترخيص — النواقل الرسميون فقط، بلا استثناء"
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          { k: "بطولات مغطاة", v: stats.competitions },
          { k: "نواقل موثّقة", v: stats.entries },
          { k: "قيد المراجعة", v: stats.pending },
        ].map((x) => (
          <div key={x.k} className="rounded-[6px] border border-navy-800 bg-navy-900 p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">{x.k}</p>
            <p className="num mt-1 text-2xl font-extrabold">{x.v}</p>
          </div>
        ))}
      </div>

      <p className="mb-5 rounded-[6px] border border-live/40 bg-live/10 px-4 py-3 text-[13px] leading-6 text-white/85">
        ⛔ سياسة صارمة: روابط البث الرسمية الموثّقة فقط. أي رابط خارج نطاقات النواقل الرسميين
        يُرفض تلقائيًا ولا يمكن نشره — لا بث مقرصن، لا IPTV، لا إضافات غير مرخّصة.
      </p>

      <Panel title="سجل النواقل">
        {entries.length === 0 ? (
          <p className="text-[12px] text-white/50">لا توجد إدخالات بعد.</p>
        ) : (
          <Table
            head={["الناقل", "البطولة", "المنصة", "المناطق", "الرابط الرسمي", "الحالة", "إجراءات"]}
            rows={entries.map((p) => [
              <span key="n" className="font-bold">{p.broadcasterName}</span>,
              <span key="c" className="text-white/60">{p.competitionName}</span>,
              <span key="t" className="text-white/60">{p.platform}</span>,
              <span key="r" className="max-w-[220px] text-white/60">{p.regions.join("، ")}</span>,
              <a key="u" href={p.broadcastWebsite} target="_blank" rel="noopener noreferrer nofollow" className="num block max-w-[200px] truncate text-gold-400 hover:underline" dir="ltr">
                {p.broadcastWebsite}
              </a>,
              <span key="s">
                <Pill tone={tone[p.status]}>{label[p.status]}</Pill>
                <span className="mt-1 block text-[10px] text-white/40">
                  {p.freeAccess ? "مجاني" : p.requiresSubscription ? "اشتراك" : "—"}
                </span>
              </span>,
              <span key="a" className="flex flex-wrap gap-1.5">
                {p.status !== "approved" ? (
                  <form action={setStatusAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="status" value="approved" />
                    <button type="submit" className={btnGhost}>توثيق</button>
                  </form>
                ) : null}
                {p.status !== "rejected" ? (
                  <form action={setStatusAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="status" value="rejected" />
                    <button type="submit" className={btnGhost}>رفض</button>
                  </form>
                ) : null}
                <form action={removeAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="rounded-[3px] border border-live/50 px-2 py-1 text-[11px] font-bold text-live transition hover:bg-live hover:text-white">
                    حذف
                  </button>
                </form>
              </span>,
            ])}
          />
        )}
      </Panel>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="إضافة ناقل بث (يُحفظ قيد المراجعة)">
          <form action={addBroadcasterAction} className="grid gap-3 sm:grid-cols-2">
            <Field label="البطولة">
              <select name="competitionId" className={inputCls} required defaultValue="egyptian-league">
                {competitions.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="اسم الناقل الرسمي">
              <input name="broadcasterName" className={inputCls} placeholder="مثال: أون سبورت" required maxLength={120} />
            </Field>
            <Field label="الرابط الرسمي (https فقط)">
              <input name="broadcastWebsite" className={inputCls} placeholder="https://…" required dir="ltr" />
            </Field>
            <Field label="المنصة">
              <select name="platform" className={inputCls} defaultValue="TV">
                {["TV", "Website", "Mobile App", "Streaming", "Other"].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>
            <Field label="المناطق (افصل بفاصلة)">
              <input name="regions" className={inputCls} placeholder="مصر، الشرق الأوسط" />
            </Field>
            <Field label="مصدر التوثيق">
              <input name="verificationSource" className={inputCls} placeholder="epl.eg — صفحة الحقوق الرسمية" required maxLength={300} />
            </Field>
            <Field label="ملاحظات">
              <input name="notes" className={inputCls} placeholder="اختياري" maxLength={500} />
            </Field>
            <div className="flex items-center gap-4 text-[12px] text-white/70">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="requiresSubscription" defaultChecked className="h-4 w-4 accent-[#D4AF37]" />
                يتطلب اشتراكًا
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="freeAccess" className="h-4 w-4 accent-[#D4AF37]" />
                وصول مجاني
              </label>
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="rounded-[3px] bg-gold-500 px-4 py-2 text-[12px] font-extrabold text-navy-900 transition hover:bg-gold-400"
              >
                حفظ للمراجعة
              </button>
            </div>
          </form>
          <p className="mt-3 text-[11px] leading-relaxed text-white/45">
            checklist إلزامي قبل التوثيق: التحقق من ملكية الحقوق في المنطقة · قراءة شروط
            الاستخدام · التأكد من سماحها بالربط/التضمين · حفظ مصدر التوثيق. الروابط من
            نطاقات غير معتمدة تُرفض تلقائيًا.
          </p>
        </Panel>

        <Panel title="اختبار رابط">
          <form method="get" className="grid gap-2">
            <input
              name="test"
              defaultValue={testUrl}
              className={inputCls}
              placeholder="https://…"
              dir="ltr"
            />
            <button type="submit" className="rounded-[3px] border border-navy-700 px-3 py-2 text-[12px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400">
              فحص النطاق
            </button>
          </form>
          {testResult ? (
            <p className={`mt-3 rounded-[3px] border px-3 py-2 text-[12px] font-bold ${testResult.ok ? "border-win/40 bg-win/10 text-win" : "border-live/40 bg-live/10 text-live"}`}>
              {testResult.ok ? "✓ نطاق رسمي معتمد" : `✗ مرفوض: ${testResult.reason}`}
            </p>
          ) : (
            <p className="mt-3 text-[11px] leading-relaxed text-white/45">
              يتحقق من أن الرابط https ومن نطاق رسمي معتمد قبل إضافته للسجل.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
