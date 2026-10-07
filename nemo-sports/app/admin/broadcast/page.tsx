import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
import {
  deleteMatchStream,
  listMatchStreams,
  setMatchStreamEnabled,
  upsertMatchStream,
  validateEmbedUrl,
} from "@/lib/match-streams";
import StreamPreviewModal from "@/components/admin/StreamPreviewModal";
import { logActivity } from "@/lib/activity";
import { competitions } from "@/lib/core-data";

export const dynamic = "force-dynamic";

/* ── server actions ─────────────────────────────────────────── */

async function addBroadcasterAction(form: FormData): Promise<void> {
  "use server";
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
  if (created.ok) {
    await logActivity({
      action: "broadcaster.create",
      entityType: "broadcaster",
      entityId: created.entry.id,
      after: { competitionId, broadcasterName },
    });
  }
  revalidatePath("/admin/broadcast");
  revalidatePath("/admin/activity");
}

async function setStatusAction(form: FormData): Promise<void> {
  "use server";
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "pending") as BroadcastStatus;
  await setBroadcasterStatus(id, status);
  await logActivity({ action: "broadcaster.status", entityType: "broadcaster", entityId: id, after: { status } });
  revalidatePath("/admin/broadcast");
  revalidatePath("/admin/activity");
}

async function removeAction(form: FormData): Promise<void> {
  "use server";
  const id = String(form.get("id") ?? "");
  await deleteBroadcaster(id);
  await logActivity({ action: "broadcaster.delete", entityType: "broadcaster", entityId: id });
  revalidatePath("/admin/broadcast");
  revalidatePath("/admin/activity");
}

async function saveMatchStreamAction(form: FormData): Promise<void> {
  "use server";
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
  revalidatePath("/admin/broadcast");
  revalidatePath("/admin/activity");
  revalidatePath("/watch");
}

async function toggleMatchStreamAction(form: FormData): Promise<void> {
  "use server";
  const id = String(form.get("id") ?? "");
  const enabled = form.get("enabled") === "true";
  await setMatchStreamEnabled(id, enabled);
  await logActivity({ action: "stream.toggle", entityType: "match_stream", entityId: id, after: { enabled } });
  revalidatePath("/admin/broadcast");
  revalidatePath("/admin/activity");
  revalidatePath("/watch");
}

async function deleteMatchStreamAction(form: FormData): Promise<void> {
  "use server";
  const id = String(form.get("id") ?? "");
  await deleteMatchStream(id);
  await logActivity({ action: "stream.delete", entityType: "match_stream", entityId: id });
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
  const sp = await searchParams;
  const testUrl = typeof sp.test === "string" ? sp.test : "";
  const testResult = testUrl ? validateBroadcastLink(testUrl) : null;
  const streamError = typeof sp.streamError === "string" ? sp.streamError : "";
  // Upcoming-match actions can prefill the exact provider match identity and
  // both team aliases. The operator must still supply an authorized HTTPS
  // embed URL; the public stream registry validates its official domain.
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

      <Panel title="مصادر بث المباريات (ربط لكل مباراة)" aside={<Pill tone={streams.length ? "warn" : "idle"}>{streams.length} مصدر</Pill>}>
        <p className="mb-4 text-[11px] leading-relaxed text-white/50">
          يُربط كل مشغّل بمعرّف مباراة أو slug محدد ولا يمكن أن يظهر على مباراة أخرى. لا يُقبل
          إلا نطاق رسمي موثّق عبر قائمة النواقل المعتمدة؛ لا روابط IPTV أو مصادر مجهولة.
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
          <Field label="رابط المشغّل الرسمي (https فقط)">
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
