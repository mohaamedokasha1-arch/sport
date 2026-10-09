"use client";

import { useRef, useState } from "react";
import MatchPicker, { type MatchOption } from "@/components/admin/MatchPicker";
import EmbedPreviewDialog from "@/components/admin/EmbedPreviewDialog";
import { Field, inputCls } from "@/components/admin/ui";
import {
  LIVE_STREAM_TYPES,
  LIVE_STREAM_TYPE_AR,
  type LiveStreamType,
} from "@/lib/live-stream-consts";
import type { MatchStreamSource } from "@/lib/match-streams";

type Prefill = { match?: string; home?: string; away?: string; competition?: string; kickoff?: string };

/**
 * The "add / edit live stream" form (requirement §6 + §20 workflow):
 * pick a match (searchable) → choose stream type → paste the embed URL →
 * preview (server-validated, sandboxed iframe) → save draft or publish.
 * All state is local; the server action does validation + storage.
 *
 * `policyLabel` describes the ACTIVE domain policy (server-provided, because a
 * client component must not read env): the hint under the URL field follows it
 * instead of always claiming an official-domain gate.
 */
/** Sets the save intent on the form's hidden `intent` field before submit. */
function setIntent(form: HTMLFormElement | null, intent: "draft" | "publish"): void {
  const field = form?.elements.namedItem("intent");
  if (field instanceof HTMLInputElement) field.value = intent;
}

export default function LiveStreamForm({
  action,
  editing,
  prefill,
  defaultLabel,
  publishingEnabled,
  policyLabel = "الوضع الحر — أي رابط https يُقبل",
}: {
  action: (formData: FormData) => void | Promise<void>;
  editing: MatchStreamSource | null;
  prefill: Prefill;
  defaultLabel: string;
  publishingEnabled: boolean;
  /** Human-readable name of the active embed-domain policy. */
  policyLabel?: string;
}) {
  const initialSlug = editing?.matchSlug ?? prefill.match ?? "";
  const [match, setMatch] = useState<MatchOption | null>(null);
  const [manualSlug, setManualSlug] = useState(initialSlug);
  const embedRef = useRef<HTMLTextAreaElement>(null);

  const boundSlug = match?.slug ?? manualSlug;
  const homeName = match?.home ?? editing?.homeName ?? prefill.home ?? "";
  const awayName = match?.away ?? editing?.awayName ?? prefill.away ?? "";
  const competitionName = match?.competition ?? editing?.competitionName ?? prefill.competition ?? "";
  const kickoffAt = match?.kickoff ?? editing?.kickoffAt ?? prefill.kickoff ?? "";

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2" id="stream-form-inner">
      <input type="hidden" name="id" value={editing?.id ?? ""} />
      <input type="hidden" name="matchSlug" value={boundSlug} />
      <input type="hidden" name="homeName" value={homeName} />
      <input type="hidden" name="awayName" value={awayName} />
      <input type="hidden" name="competitionName" value={competitionName} />
      <input type="hidden" name="kickoffAt" value={kickoffAt} />

      <div className="sm:col-span-2">
        <Field label="اختيار المباراة">
          <MatchPicker
            value={boundSlug}
            onChange={(m) => {
              setMatch(m);
              if (m) setManualSlug(m.slug);
            }}
          />
        </Field>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={manualSlug}
            onChange={(e) => {
              setManualSlug(e.target.value);
              setMatch(null);
            }}
            placeholder="أو أدخل slug المباراة يدويًا"
            className={`${inputCls} num`}
            dir="ltr"
            maxLength={160}
          />
          <span className="text-[10px] text-white/40">إذا لم تجد المباراة في القائمة</span>
        </div>
        {boundSlug ? (
          <p className="mt-2 rounded-[3px] border border-gold-500/30 bg-gold-500/5 px-3 py-2 text-[11px] leading-relaxed text-gold-300">
            المباراة المختارة: <span className="num font-bold" dir="ltr">{boundSlug}</span>
            {homeName || awayName ? (
              <>
                {" "}— {homeName} × {awayName}
              </>
            ) : null}
            <br />
            تأكد من امتلاك حق بث/تضمين هذه المباراة قبل النشر.
          </p>
        ) : null}
      </div>

      <Field label="نوع البث">
        <select name="streamType" defaultValue={editing?.streamType ?? "embed"} className={inputCls}>
          {LIVE_STREAM_TYPES.map((t: LiveStreamType) => (
            <option key={t} value={t}>{LIVE_STREAM_TYPE_AR[t]}</option>
          ))}
        </select>
      </Field>

      <Field label="حالة البث">
        <select name="status" defaultValue={editing?.status ?? "draft"} className={inputCls}>
          <option value="draft">مسودة (Draft)</option>
          <option value="scheduled">مجدول (Scheduled)</option>
          <option value="live">مباشر (Live)</option>
          <option value="ended">منتهٍ (Ended)</option>
          <option value="disabled">موقوف / معطل (Disabled)</option>
        </select>
      </Field>

      <Field label="اسم وصفي للبث (يظهر للزوار)">
        <input name="label" defaultValue={editing?.label ?? defaultLabel} maxLength={160} className={inputCls} placeholder="مثال: البث المباشر — القناة الرسمية" />
      </Field>

      <div className="sm:col-span-2">
        <Field label="رابط الـEmbed (https فقط)">
          <textarea
            ref={embedRef}
            name="embedUrl"
            defaultValue={editing?.embedUrl ?? ""}
            required
            rows={3}
            maxLength={1000}
            dir="ltr"
            placeholder="https://official-broadcaster.example/embed/…"
            className={`${inputCls} num font-mono text-[11px] leading-5`}
          />
        </Field>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <EmbedPreviewDialog
            getUrl={() => embedRef.current?.value ?? ""}
            title={editing?.label ?? defaultLabel}
          />
          <span className="text-[10px] leading-relaxed text-white/40">
            {policyLabel} · المعاينة تفحص الرابط على الخادم قبل عرض المشغّل.
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        {/* React 19 does not include a clicked submit button's name/value in the
            action's FormData, so the intent travels in a hidden input that each
            button sets right before the form submits. */}
        <input type="hidden" name="intent" defaultValue="draft" />
        <button
          type="submit"
          onClick={(e) => setIntent(e.currentTarget.form, "draft")}
          className="rounded-[3px] border border-navy-700 px-4 py-2 text-[12px] font-extrabold text-white/80 transition hover:border-gold-500 hover:text-gold-400"
        >
          حفظ كمسودة
        </button>
        <button
          type="submit"
          onClick={(e) => setIntent(e.currentTarget.form, "publish")}
          disabled={!publishingEnabled}
          className="rounded-[3px] bg-gold-500 px-4 py-2 text-[12px] font-extrabold text-navy-900 transition hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {editing ? "حفظ ونشر" : "نشر البث"}
        </button>
        {!publishingEnabled ? (
          <span className="text-[10px] text-live">نشر البث موقوف مؤقتًا من إعدادات الموقع</span>
        ) : null}
        {editing ? (
          <a href="/admin/live" className="text-[11px] font-bold text-white/50 hover:text-gold-400">
            إلغاء التعديل
          </a>
        ) : null}
      </div>
    </form>
  );
}
