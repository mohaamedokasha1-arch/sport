import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { storeErrorMessage } from "@/lib/db/store-policy";
import { AdminHead, Btn, Panel, Pill, Stat, Table, Field, inputCls } from "@/components/admin/ui";
import ConfirmForm from "@/components/admin/ConfirmSubmit";
import StreamPreviewModal from "@/components/admin/StreamPreviewModal";
import LiveStreamForm from "@/components/admin/LiveStreamForm";
import { requirePermission } from "@/lib/admin-session";
import {
  createLiveStream,
  deleteLiveStream,
  getLiveStream,
  listLiveStreams,
  liveStreamStats,
  setLiveStreamStatus,
  updateLiveStream,
  validateEmbedUrl,
} from "@/lib/match-streams";
import {
  LIVE_STREAM_STATUSES,
  LIVE_STREAM_STATUS_AR,
  LIVE_STREAM_TYPE_AR,
  type LiveStreamStatus,
  type LiveStreamType,
} from "@/lib/live-stream-consts";
import { getSiteSettings } from "@/lib/site-settings";
import { logActivity } from "@/lib/activity";
import { dateAr, timeOf } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ── helpers ────────────────────────────────────────────────── */

function refreshStreamSurfaces(matchSlug?: string): void {
  revalidatePath("/admin/live");
  revalidatePath("/admin/activity");
  revalidatePath("/admin");
  revalidatePath("/live");
  revalidatePath("/watch");
  revalidatePath("/matches");
  revalidatePath("/sitemap.xml");
  if (matchSlug) revalidatePath(`/matches/${encodeURIComponent(matchSlug)}`);
}

const statusTone: Record<LiveStreamStatus, "ok" | "warn" | "bad" | "idle"> = {
  draft: "idle",
  published: "ok",
  live: "bad",
  ended: "warn",
  disabled: "warn",
};

const btnGhost =
  "rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400";

/* ── server actions ─────────────────────────────────────────── */

async function saveStreamAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("streams");
  const settings = await getSiteSettings();
  const id = String(form.get("id") ?? "").trim();
  const intent = String(form.get("intent") ?? "draft") === "publish" ? "publish" : "draft";

  const input = {
    matchSlug: String(form.get("matchSlug") ?? "").trim(),
    homeName: String(form.get("homeName") ?? "").trim(),
    awayName: String(form.get("awayName") ?? "").trim(),
    competitionName: String(form.get("competitionName") ?? "").trim(),
    kickoffAt: String(form.get("kickoffAt") ?? "").trim() || null,
    streamType: (String(form.get("streamType") ?? "embed") as LiveStreamType) || "embed",
    embedUrl: String(form.get("embedUrl") ?? "").trim(),
    label: String(form.get("label") ?? "").trim(),
  };

  if (intent === "publish" && !settings.live.publishingEnabled) {
    redirect(`/admin/live?err=${encodeURIComponent("نشر البث موقوف مؤقتًا من إعدادات الموقع")}`);
  }

  const status: LiveStreamStatus = intent === "publish" ? "published" : "draft";

  const result = id
    ? await updateLiveStream(id, { ...input, status })
    : await createLiveStream({ ...input, status });

  if (!result.ok) {
    redirect(`/admin/live?err=${encodeURIComponent(result.error)}${id ? `&edit=${encodeURIComponent(id)}` : ""}`);
  }

  await logActivity({
    action: id ? "stream.update" : intent === "publish" ? "stream.publish" : "stream.create",
    entityType: "match_stream",
    entityId: result.entry.id,
    actor: actor.username,
    role: actor.role,
    after: { matchSlug: result.entry.matchSlug, status: result.entry.status, streamType: result.entry.streamType },
  });
  refreshStreamSurfaces(result.entry.matchSlug);
  redirect(`/admin/live?ok=${encodeURIComponent(id ? "تم حفظ التعديلات" : intent === "publish" ? "تم نشر البث — يظهر الآن في صفحة المباراة و/live" : "حُفظ البث كمسودة")}`);
}

async function setStreamStatusAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("streams");
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "") as LiveStreamStatus;
  if (!(LIVE_STREAM_STATUSES as string[]).includes(status)) {
    redirect(`/admin/live?err=${encodeURIComponent("حالة غير صالحة")}`);
  }
  const settings = await getSiteSettings();
  if ((status === "published" || status === "live") && !settings.live.publishingEnabled) {
    redirect(`/admin/live?err=${encodeURIComponent("نشر البث موقوف مؤقتًا من إعدادات الموقع")}`);
  }
  const result = await setLiveStreamStatus(id, status);
  if (!result.ok) {
    redirect(`/admin/live?err=${encodeURIComponent(result.error)}`);
  }
  const actionName: Record<LiveStreamStatus, string> = {
    draft: "stream.status",
    published: "stream.publish",
    live: "stream.live",
    ended: "stream.end",
    disabled: "stream.stop",
  };
  await logActivity({
    action: actionName[status],
    entityType: "match_stream",
    entityId: id,
    actor: actor.username,
    role: actor.role,
    after: { status, matchSlug: result.entry.matchSlug },
  });
  refreshStreamSurfaces(result.entry.matchSlug);
  redirect(`/admin/live?ok=${encodeURIComponent(`حالة البث: ${LIVE_STREAM_STATUS_AR[status]}`)}`);
}

async function deleteStreamAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("streams");
  const id = String(form.get("id") ?? "");
  const stream = await getLiveStream(id);
  try {
    await deleteLiveStream(id);
  } catch (e) {
    redirect(`/admin/live?err=${encodeURIComponent(storeErrorMessage(e))}`);
  }
  await logActivity({ action: "stream.delete", entityType: "match_stream", entityId: id, actor: actor.username, role: actor.role });
  refreshStreamSurfaces(stream?.matchSlug);
  redirect(`/admin/live?ok=${encodeURIComponent("تم حذف البث — المباراة نفسها لم تُمسّ")}`);
}

/* ── page ───────────────────────────────────────────────────── */

export default async function AdminLive({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("streams");
  const sp = await searchParams;
  const err = typeof sp.err === "string" ? sp.err : "";
  const okMsg = typeof sp.ok === "string" ? sp.ok : "";
  const statusFilter = typeof sp.status === "string" && (LIVE_STREAM_STATUSES as string[]).includes(sp.status) ? (sp.status as LiveStreamStatus) : "";
  const q = typeof sp.q === "string" ? sp.q : "";
  const showForm = sp.new === "1" || typeof sp.edit === "string";
  const editId = typeof sp.edit === "string" ? sp.edit : "";

  const prefill = {
    match: typeof sp.match === "string" ? sp.match : "",
    home: typeof sp.home === "string" ? sp.home : "",
    away: typeof sp.away === "string" ? sp.away : "",
  };

  const [streams, stats, settings, editing] = await Promise.all([
    listLiveStreams(true),
    liveStreamStats(),
    getSiteSettings(),
    editId ? getLiveStream(editId) : Promise.resolve(null),
  ]);

  const filtered = streams.filter((s) => {
    if (statusFilter && s.status !== statusFilter) return false;
    if (q) {
      const hay = `${s.matchSlug} ${s.homeName} ${s.awayName} ${s.competitionName} ${s.label} ${s.id}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const kickoffLabel = (iso: string | null) => (iso ? `${dateAr(iso)} · ${timeOf(iso)}` : "—");

  return (
    <div>
      <AdminHead
        title="البث المباشر"
        subtitle="سير العمل: اختيار المباراة → رابط Embed رسمي → معاينة → حفظ/نشر"
        action={
          <Link href="/admin/live?new=1#stream-form">
            <Btn>+ إضافة بث</Btn>
          </Link>
        }
      />

      {/* stats */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="مسودات" value={String(stats.draft)} hint="غير منشورة" />
        <Stat label="منشور" value={String(stats.published)} hint="ظاهر للزوار" />
        <Stat label="بث حي" value={String(stats.live)} hint="مباشر الآن" />
        <Stat label="منتهٍ" value={String(stats.ended)} hint="محفوظ للسجل" />
        <Stat label="موقوف" value={String(stats.disabled)} hint="إخفاء مؤقت" />
      </div>

      <p className="mb-5 rounded-[6px] border border-live/40 bg-live/10 px-4 py-3 text-[13px] leading-6 text-white/85">
        ⛔ سياسة صارمة: يُقبل فقط رابط Embed/bث تملك حق استخدامه أو تضمينه قانونًا، ومن نطاق ناقل رسمي
        موثّق. أي رابط آخر — IPTV أو مصادر مجهولة — يُرفض تلقائيًا ولا يمكن نشره.
      </p>

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

      {/* streams table */}
      <Panel
        title="البثوث المسجّلة"
        aside={<Pill tone={streams.length ? "warn" : "idle"}>{streams.length} بث</Pill>}
      >
        {/* filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="تصفية حسب الحالة">
            <Link
              href="/admin/live"
              className={`rounded-[3px] px-3 py-1.5 text-[11px] font-bold transition ${!statusFilter ? "bg-gold-500 text-navy-900" : "border border-navy-700 text-white/70 hover:border-gold-500 hover:text-gold-400"}`}
            >
              الكل ({streams.length})
            </Link>
            {LIVE_STREAM_STATUSES.map((s) => (
              <Link
                key={s}
                href={`/admin/live?status=${s}`}
                className={`rounded-[3px] px-3 py-1.5 text-[11px] font-bold transition ${statusFilter === s ? "bg-gold-500 text-navy-900" : "border border-navy-700 text-white/70 hover:border-gold-500 hover:text-gold-400"}`}
              >
                {LIVE_STREAM_STATUS_AR[s]} ({stats[s]})
              </Link>
            ))}
          </div>
          <form method="get" className="ms-auto flex gap-2">
            {statusFilter ? <input type="hidden" name="status" value={statusFilter} /> : null}
            <input name="q" defaultValue={q} placeholder="بحث…" className={`${inputCls} !py-1.5`} />
            <button type="submit" className="rounded-[3px] border border-navy-700 px-3 py-1.5 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400">
              بحث
            </button>
          </form>
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-[3px] border border-dashed border-navy-700 px-3 py-5 text-center text-[12px] text-white/45">
            {streams.length === 0
              ? "لا توجد بثوث مسجّلة. هذا هو الوضع الآمن الافتراضي — استخدم «+ إضافة بث» لربط بث رسمي بمباراة."
              : "لا توجد بثوث مطابقة للبحث/التصفية."}
          </p>
        ) : (
          <Table
            head={["المباراة", "النوع", "المصدر", "الرابط", "الحالة", "آخر تحديث", "إجراءات"]}
            rows={filtered.map((s) => [
              <span key="m" className="block min-w-0">
                <span className="block max-w-[200px] truncate font-bold">
                  {s.homeName || s.homeAliases[0] || "—"} × {s.awayName || s.awayAliases[0] || "—"}
                </span>
                <span className="block max-w-[200px] truncate text-[10px] text-white/45">
                  {s.competitionName || "—"} · {kickoffLabel(s.kickoffAt)}
                </span>
                <span className="num block max-w-[200px] truncate text-[10px] text-white/35" dir="ltr">{s.matchSlug || s.slugs.join(", ") || "—"}</span>
              </span>,
              <span key="t" className="whitespace-nowrap text-[11px] text-white/60">{LIVE_STREAM_TYPE_AR[s.streamType] ?? s.streamType}</span>,
              <span key="l" className="max-w-[120px] truncate text-[11px] text-white/60">{s.label}</span>,
              <a
                key="u"
                href={s.embedUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="num block max-w-[180px] truncate text-gold-400 hover:underline"
                dir="ltr"
              >
                {s.embedUrl}
              </a>,
              <Pill key="s" tone={statusTone[s.status]}>{LIVE_STREAM_STATUS_AR[s.status]}</Pill>,
              <span key="d" className="num whitespace-nowrap text-[10px] text-white/40">
                {dateAr(s.updatedAt)} · {timeOf(s.updatedAt)}
              </span>,
              <span key="a" className="flex flex-wrap gap-1.5">
                {validateEmbedUrl(s.embedUrl).ok ? <StreamPreviewModal title={s.label} url={s.embedUrl} /> : null}
                {s.status !== "published" && s.status !== "live" ? (
                  <form action={setStreamStatusAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="status" value="published" />
                    <button type="submit" className={btnGhost} disabled={!settings.live.publishingEnabled}>
                      نشر
                    </button>
                  </form>
                ) : null}
                {s.status === "published" ? (
                  <form action={setStreamStatusAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="status" value="live" />
                    <button type="submit" className={btnGhost}>
                      بث حي
                    </button>
                  </form>
                ) : null}
                {s.status === "published" || s.status === "live" ? (
                  <form action={setStreamStatusAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="status" value="disabled" />
                    <button type="submit" className="rounded-[3px] border border-warn/50 px-2 py-1 text-[11px] font-bold text-warn transition hover:bg-warn hover:text-white">
                      إيقاف
                    </button>
                  </form>
                ) : null}
                {s.status !== "ended" && s.status !== "draft" ? (
                  <form action={setStreamStatusAction}>
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="status" value="ended" />
                    <button type="submit" className={btnGhost}>
                      إنهاء
                    </button>
                  </form>
                ) : null}
                <Link href={`/admin/live?edit=${encodeURIComponent(s.id)}#stream-form`} className={btnGhost}>
                  تعديل
                </Link>
                {s.matchSlug || s.slugs[0] ? (
                  <Link
                    href={`/matches/${encodeURIComponent(s.matchSlug || s.slugs[0]!)}`}
                    className={btnGhost}
                    target="_blank"
                  >
                    المباراة
                  </Link>
                ) : null}
                <ConfirmForm
                  message={`هل أنت متأكد من حذف هذا البث؟ الاختفاء فوري من الموقع، والمباراة نفسها لا تُحذف.`}
                  action={deleteStreamAction}
                >
                  <input type="hidden" name="id" value={s.id} />
                  <button
                    type="submit"
                    className="rounded-[3px] border border-live/50 px-2 py-1 text-[11px] font-bold text-live transition hover:bg-live hover:text-white"
                  >
                    حذف
                  </button>
                </ConfirmForm>
              </span>,
            ])}
          />
        )}
      </Panel>

      {/* add / edit form */}
      {showForm ? (
        <div className="mt-5" id="stream-form">
          <Panel
            title={editing ? `تعديل البث: ${editing.label}` : "إضافة بث مباشر"}
            aside={<Pill tone="warn">{editing ? "تعديل" : "جديد"}</Pill>}
          >
            <LiveStreamForm
              action={saveStreamAction}
              editing={editing}
              prefill={prefill}
              defaultLabel={settings.live.defaultStreamLabel}
              publishingEnabled={settings.live.publishingEnabled}
            />
            <p className="mt-4 text-[11px] leading-relaxed text-white/45">
              سير العمل: Dashboard ← <Link href="/admin/live" className="text-gold-400">Live Streams</Link> ←
              إضافة بث ← اختيار المباراة ← رابط الـEmbed ← معاينة ← حفظ/نشر ← يظهر البث في صفحة المباراة
              و/live. المسودة لا تظهر للزوار أبدًا.
            </p>
          </Panel>
        </div>
      ) : (
        <p className="mt-5 text-center text-[12px] text-white/45">
          <Link href="/admin/live?new=1#stream-form" className="font-bold text-gold-400 hover:underline">
            + إضافة بث مباشر جديد
          </Link>
        </p>
      )}
    </div>
  );
}
