import Link from "next/link";

/**
 * Honest "no data" state (§Instruction 12).
 *
 * Shown wherever the demo dataset is switched off (production without real
 * provider data) and there is nothing real to render. It never invents
 * matches, scores, news or links — it explains the state instead.
 */
export default function DataUnavailable({
  title = "البيانات غير متوفرة حاليًا",
  message = "نحن نربط المنصة بمصادر البيانات الرياضية الرسمية. لن نعرض أي نتائج أو أخبار غير مؤكدة — ستعود هذه القسم للعمل فور توفر البيانات الحقيقية.",
  hint,
  /** the fixed English wording every failed data surface carries */
  english = "Data temporarily unavailable",
}: {
  title?: string;
  message?: string;
  hint?: string;
  english?: string;
}) {
  return (
    <div className="card my-6 flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span
        className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-gold-500/15 text-xl"
        aria-hidden
      >
        📡
      </span>
      <h2 className="text-[15px] font-extrabold">{title}</h2>
      {/* Fixed message shown on every failed feed — no fabricated data behind it. */}
      <p className="text-[12px] font-bold tracking-wide text-live-red/90">{english}</p>
      <p className="max-w-md text-[12.5px] leading-6 text-muted">{message}</p>
      {hint ? <p className="max-w-md text-[11px] leading-5 text-muted">{hint}</p> : null}
      <p className="mt-2 text-[11px] text-muted">
        هل أنت من مالك البيانات؟{" "}
        <Link href="/contact" className="font-bold text-gold-600 dark:text-gold-400">
          تواصل معنا
        </Link>
      </p>
    </div>
  );
}
