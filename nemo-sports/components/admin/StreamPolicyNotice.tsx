import { broadcastDomainPolicy, STREAM_POLICY_AR } from "@/lib/broadcasts";
import { envAllowedDomains } from "@/lib/stream-policy";

/**
 * Server-only notice describing the ACTIVE embed-link policy in the admin
 * panel. It replaces the old hardcoded "strict policy" banner: the text now
 * follows the configuration instead of promising a gate that may be off.
 *
 * The notice is informational — it never blocks saving. In `open` mode it
 * states plainly that any https embed the operator enters is accepted, and
 * records where the rights responsibility sits. In `allowlist` mode it tells
 * the operator how to loosen it.
 */
export default function StreamPolicyNotice({
  context = "live",
}: {
  /** Which panel is rendering the notice (tweaks the wording only). */
  context?: "live" | "broadcast";
}) {
  const policy = broadcastDomainPolicy();
  const extra = envAllowedDomains();
  const subject = context === "broadcast" ? "روابط النواقل" : "روابط الـEmbed";

  return (
    <div
      data-stream-policy={policy}
      className="mb-5 rounded-[6px] border border-gold-500/30 bg-gold-500/5 px-4 py-3 text-[13px] leading-6 text-white/85"
    >
      <p className="flex flex-wrap items-center gap-2 font-bold text-gold-300">
        <span aria-hidden>{policy === "open" ? "🔓" : "🔒"}</span>
        {STREAM_POLICY_AR[policy]}
      </p>

      {policy === "open" ? (
        <p className="mt-1.5 text-white/75">
          {subject} التي يدخلها المشغّل من لوحة التحكم تُقبل وتُحفظ بلا قيود على النطاق — لا رفض تلقائي لأي
          رابط. تبقى الفحوصات الأمنية فقط: <span className="num" dir="ltr">https</span>، بلا علامات
          HTML/سكربت، بلا بيانات اعتماد أو منفذ غير قياسي، بلا نطاق داخلي/محلي. التأكد من حق التضمين أو
          إعادة البث لكل رابط مسؤولية المشغّل.
        </p>
      ) : (
        <p className="mt-1.5 text-white/75">
          يُقبل فقط رابط <span className="num" dir="ltr">https</span> من نطاق ضمن القائمة المرجعية
          {extra.length ? (
            <>
              {" "}
              أو النطاقات المضافة (<span className="num" dir="ltr">{extra.join("، ")}</span>)
            </>
          ) : null}
          . لقبول أي رابط يدويًا بدون تقييد النطاق اضبط{" "}
          <span className="num font-bold text-gold-300" dir="ltr">
            NEMO_STREAM_DOMAIN_POLICY=open
          </span>
          .
        </p>
      )}
    </div>
  );
}
