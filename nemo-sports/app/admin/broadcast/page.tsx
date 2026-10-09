import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { storeErrorMessage } from "@/lib/db/store-policy";
import { AdminHead, Panel, Table, Pill, Field, inputCls } from "@/components/admin/ui";
import {
  broadcastDomainPolicy,
  coverageStats,
  createBroadcaster,
  deleteBroadcaster,
  listBroadcasters,
  setBroadcasterStatus,
  STREAM_POLICY_AR,
  validateBroadcastLink,
  type BroadcastStatus,
} from "@/lib/broadcasts";
import {
  deleteMatchStream,
  listMatchStreams,
  setMatchStreamEnabled,
  upsertMatchStream,
  validateEmbedUrl,
} from "@/lib/match-streams";
import StreamPreviewModal from "@/components/admin/StreamPreviewModal";
import StreamPolicyNotice from "@/components/admin/StreamPolicyNotice";
import { logActivity } from "@/lib/activity";
import { competitions } from "@/lib/core-data";
import { requirePermission, requireUser } from "@/lib/admin-session";
import { can } from "@/lib/admin-roles";

export const dynamic = "force-dynamic";

/* ── server actions ─────────────────────────────────────────── */

async function addBroadcasterAction(form: FormData): Promise<void> {
  "use server";
  await requirePermission("broadcast");
  const competitionId = String(form.get("competitionId") ?? "").trim();
  const comp = competitions.find((c) => c.slug === competitionId);
  const broadcasterName = String(form.get("broadcasterName") ?? "").trim();
  const created = await createBroadcaster({
    competitionId,
    competitionName: comp?.name ?? competitionId,
    broadcasterName,
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
  if (!created.ok) redirect(`/admin/broadcast?err=${encodeURIComponent(created.error)}`);
  if (created.ok) {
    await logActivity({
      action: "broadcaster.create",
      entityType: "broadcaster",
      entityId: created.entry.id,
      after: { competitionId, broadcasterName },
    });
  }
  revalidatePath("/watch");
  revalidatePath("/admin/broadcast");
  revalidatePath("/admin/activity");
}

async function setStatusAction(form: FormData): Promise<void> {
  "use server";
  await requirePermission("broadcast");
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "pending") as BroadcastStatus;
  try {
    if (!await setBroadcasterStatus(id, status)) throw new Error("invalid status or missing broadcaster");
  } catch (e) { redirect(`/admin/broadcast?err=${encodeURIComponent(storeErrorMessage(e))}`); }
  await logActivity({ action: "broadcaster.status", entityType: "broadcaster", entityId: id, after: { status } });
  revalidatePath("/watch");
  revalidatePath("/admin/broadcast");
  revalidatePath("/admin/activity");
}

async function removeAction(form: FormData): Promise<void> {
  "use server";
  await requirePermission("broadcast");
  const id = String(form.get("id") ?? "");
  try { await deleteBroadcaster(id); } catch (e) { redirect(`/admin/broadcast?err=${encodeURIComponent(storeErrorMessage(e))}`); }
  await logActivity({ action: "broadcaster.delete", entityType: "broadcaster", entityId: id });
  revalidatePath("/watch");
  revalidatePath("/admin/broadcast");
  revalidatePath("/admin/activity");
}

async function saveMatchStreamAction(form: FormData): Promise<void> {
  "use server";
  await requirePermission("streams");
  const id = String(form.get("id") ?? "").trim();
  const result = await upsertMatchStream(id, {
    label: String(form.get("label") ?? "").trim(),
    embedUrl: String(form.get("embedUrl") ?? "").trim(),
    slugs: String(form.get("slugs") ?? "").split(/[|,،]/).map((v) => v.trim()).filter(Boolean),
    homeAliases: String(form.get("homeAliases") ?? "").split(/[|,،]/).map((v) => v.trim()).filter(Boolean),
    awayAliases: String(form.get("awayAliases") ?? "").split(/[|,،]/).map((v) => v.trim()).filter(Boolean),
    enabled: form.get("enabled") === "on",
  });
  if (!result.ok) {
    // Keep the response free from URL contents while making validation errors
    // actionable in the browser address bar.
    redirect(`/admin/broadcast?streamError=${encodeURIComponent(result.error.slice(0, 180))}`);
  }
  await logActivity({
    action: "stream.upsert",
    entityType: "match_stream",
    entityId: id,
    after: { slugs: result.entry.slugs, enabled: result.entry.enabled },
  });
  revalidatePath("/watch");
  revalidatePath("/admin/broadcast");
  revalidatePath("/admin/activity");
  revalidatePath("/watch");
}

async function toggleMatchStreamAction(form: FormData): Promise<void> {
  "use server";
  await requirePermission("streams");
  const id = String(form.get("id") ?? "");
  const enabled = form.get("enabled") === "true";
  try {
    await setMatchStreamEnabled(id, enabled);
  } catch (e) {
    redirect(`/admin/broadcast?err=${encodeURIComponent(storeErrorMessage(e))}`);
  }
  await logActivity({ action: "stream.toggle", entityType: "match_stream", entityId: id, after: { enabled } });
  revalidatePath("/watch");
  revalidatePath("/admin/broadcast");
  revalidatePath("/admin/activity");
  revalidatePath("/watch");
}

async function deleteMatchStreamAction(form: FormData): Promise<void> {
  "use server";
  await requirePermission("streams");
  const id = String(form.get("id") ?? "");
  try {
    await deleteMatchStream(id);
  } catch (e) {
    redirect(`/admin/broadcast?err=${encodeURIComponent(storeErrorMessage(e))}`);
  }
  await logActivity({ action: "stream.delete", entityType: "match_stream", entityId: id });
  revalidatePath("/watch");
  revalidatePath("/admin/broadcast");
  revalidatePath("/admin/activity");
  revalidatePath("/watch");
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
  const user = await requireUser();
  const canBroadcast = can(user.role, "broadcast");
  const canStreams = can(user.role, "streams");
  if (!canBroadcast && !canStreams) {
    redirect(`/admin?err=${encodeURIComponent("ليس لديك صلاحية للوصول إلى هذا القسم")}`);
  }
  const sp = await searchParams;
  const testUrl = typeof sp.test === "string" ? sp.test : "";
  const testResult = testUrl ? validateBroadcastLink(testUrl) : null;
  const policyAr = STREAM_POLICY_AR[broadcastDomainPolicy()];
  const streamError = typeof sp.streamError === "string" ? sp.streamError : "";
  // Upcoming-match actions can prefill the exact provider match identity and
  // both team aliases. The operator still supplies the HTTPS embed URL; the
  // public stream registry re-validates it under the active domain policy.
  const matchId = typeof sp.match === "string" ? sp.match.trim().slice(0, 160) : "";
  const homeName = typeof sp.home === "string" ? sp.home.trim().slice(0, 120) : "";
  const awayName = typeof sp.away === "string" ? sp.away.trim().slice(0, 120) : "";
  const streamIdPrefill = matchId ? `ms_${matchId}`.slice(0, 120) : "";

  const [entries, stats, streams] = await Promise.all([
    listBroadcasters(true),
    coverageStats(),
    listMatchStreams(true),
  ]);

  return (
    <div>
      <AdminHead
        title="البث والترخيص"
        subtitle="سجل النواقل ومصادر بث المباريات · قبول الروابط يتبع سياسة النطاقات المفعّلة أدناه"
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

      <StreamPolicyNotice context="broadcast" />

      {canStreams ? (
      <Panel title="مصادر بث المباريات (ربط لكل مباراة)" aside={<Pill tone={streams.length ? "warn" : "idle"}>{streams.length} مصدر</Pill>}>
        <p className="mb-4 text-[11px] leading-relaxed text-white/50">
          يُربط كل مشغّل بمعرّف مباراة أو slug محدد ولا يمكن أن يظهر على مباراة أخرى. أي رابط{" "}
          <span className="num" dir="ltr">https</span> يدخله المشغّل يُقبل وفق السياسة المفعّلة أعلاه.
        </p>
        {streamError ? (
          <p role="alert" className="mb-4 rounded-[3px] border border-live/40 bg-live/10 px-3 py-2 text-[12px] font-bold text-red-200">
            تعذر حفظ مصدر البث: {streamError}
          </p>
        ) : null}
        {streams.length ? (
          <Table
            head={["المعرّف/المباراة", "المصدر", "الـ slug", "الرابط", "الحالة", "إجراءات"]}
            rows={streams.map((stream) => [
              <span key="id" className="num max-w-[150px] truncate font-bold" dir="ltr">{stream.id}</span>,
              <span key="label" className="text-white/70">{stream.label}</span>,
              <span key="slugs" className="num max-w-[180px] truncate text-white/55" dir="ltr">{stream.slugs.join(", ") || "—"}</span>,
              <a key="url" href={stream.embedUrl} target="_blank" rel="noopener noreferrer nofollow" className="num block max-w-[180px] truncate text-gold-400 hover:underline" dir="ltr">{stream.embedUrl}</a>,
              <Pill key="status" tone={stream.enabled ? "ok" : "idle"}>{stream.enabled ? "مفعّل" : "موقوف"}</Pill>,
              <span key="actions" className="flex flex-wrap gap-1.5">
                {validateEmbedUrl(stream.embedUrl).ok ? (
                  <StreamPreviewModal title={stream.label} url={stream.embedUrl} />
                ) : null}
                <form action={toggleMatchStreamAction}>
                  <input type="hidden" name="id" value={stream.id} />
                  <input type="hidden" name="enabled" value={String(!stream.enabled)} />
                  <button type="submit" className={btnGhost}>{stream.enabled ? "إيقاف" : "تفعيل"}</button>
                </form>
                <form action={deleteMatchStreamAction}>
                  <input type="hidden" name="id" value={stream.id} />
                  <button type="submit" className="rounded-[3px] border border-live/50 px-2 py-1 text-[11px] font-bold text-live transition hover:bg-live hover:text-white">حذف</button>
                </form>
              </span>,
            ])}
          />
        ) : (
          <p className="rounded-[3px] border border-dashed border-navy-700 px-3 py-5 text-center text-[12px] text-white/45">
            لا توجد مصادر مباراة منشورة. هذا هو الوضع الآمن الافتراضي.
          </p>
        )}

        <form id="match-stream-form" action={saveMatchStreamAction} className="mt-5 grid gap-3 border-t border-navy-800 pt-4 sm:grid-cols-2">
          {matchId ? (
            <p className="rounded-[3px] border border-gold-500/30 bg-gold-500/5 px-3 py-2 text-[11px] leading-relaxed text-gold-300 sm:col-span-2">
              ربط مصدر المباراة <span className="num font-bold" dir="ltr">{matchId}</span> — تأكد من امتلاك حق التضمين لهذا اللقاء والمنطقة قبل الحفظ.
            </p>
          ) : null}
          <Field label="معرّف ثابت لمباراة واحدة">
            <input name="id" defaultValue={streamIdPrefill} className={inputCls} placeholder="ms_provider-match-id" required maxLength={120} dir="ltr" />
          </Field>
          <Field label="اسم المصدر">
            <input name="label" className={inputCls} placeholder="الناقل الرسمي" required maxLength={160} />
          </Field>
          <Field label="رابط المشغّل (https فقط)">
            <input name="embedUrl" className={inputCls} placeholder="https://official.example/player" required maxLength={1000} dir="ltr" />
          </Field>
          <Field label="Slugs المباراة (افصل بفاصلة)">
            <input name="slugs" defaultValue={matchId} className={inputCls} placeholder="provider-match-id" dir="ltr" />
          </Field>
          <Field label="أسماء الفريق المضيف (اختياري)">
            <input name="homeAliases" defaultValue={homeName} className={inputCls} placeholder="Home FC، Home" />
          </Field>
          <Field label="أسماء الفريق الضيف (اختياري)">
            <input name="awayAliases" defaultValue={awayName} className={inputCls} placeholder="Away FC، Away" />
          </Field>
          <label className="flex items-center gap-2 text-[12px] text-white/70 sm:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked className="h-4 w-4 accent-[#D4AF37]" />
            تفعيل المصدر بعد حفظه (لا يظهر إلا للمباراة المطابقة)
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="rounded-[3px] bg-gold-500 px-4 py-2 text-[12px] font-extrabold text-navy-900 transition hover:bg-gold-400">حفظ مصدر المباراة</button>
          </div>
        </form>
      </Panel>
      ) : null}

      {canBroadcast ? (
      <div className="mt-5">
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
      </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        {canBroadcast ? (
        <Panel title="إضافة ناقل بث (يُحفظ قيد المراجعة)">
          <form action={addBroadcasterAction} className="grid gap-3 sm:grid-cols-2">
            <Field label="البطولة">
              <select name="competitionId" className={inputCls} required defaultValue="egyptian-league">
                {competitions.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="اسم الناقل">
              <input name="broadcasterName" className={inputCls} placeholder="مثال: أون سبورت" required maxLength={120} />
            </Field>
            <Field label="رابط الناقل (https فقط)">
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
            checklist مقترح قبل النشر: التحقق من ملكية الحقوق في المنطقة · قراءة شروط
            الاستخدام · التأكد من سماحها بالربط/التضمين · حفظ مصدر التوثيق. الحفظ غير مقيّد
            بنطاق معيّن — المسؤولية عن حقوق كل رابط تقع على المشغّل.
          </p>
        </Panel>
        ) : null}

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
              {testResult.ok ? `✓ رابط مقبول — ${testResult.reason}` : `✗ مرفوض: ${testResult.reason}`}
            </p>
          ) : (
            <p className="mt-3 text-[11px] leading-relaxed text-white/45">
              يفحص الرابط قبل إضافته للسجل: <span className="num" dir="ltr">https</span> وصالح تقنيًا دائمًا،
              والنطاق حسب السياسة المفعّلة ({policyAr}).
            </p>
          )}
          {testResult?.warning ? (
            <p className="mt-2 rounded-[3px] border border-gold-500/25 bg-gold-500/5 px-3 py-2 text-[11px] leading-relaxed text-gold-200">
              ⚠️ {testResult.warning}
            </p>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
