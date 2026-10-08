import Link from "next/link";
import { useId } from "react";

/** A single, localized empty/error state with a useful next step. */
export default function DataUnavailable({
  title = "البيانات غير متوفرة حاليًا",
  message = "لا تتوفر بيانات مؤكدة لهذا القسم الآن. سنعيد المحاولة عند التحديث القادم.",
  hint,
  actionHref = "/matches",
  actionLabel = "تصفّح المباريات",
}: {
  title?: string;
  message?: string;
  hint?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  const titleId = useId();
  return (
    <section className="card my-6 flex flex-col items-center gap-2 px-6 py-9 text-center" aria-labelledby={titleId}>
      <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-gold-500/15 text-xl" aria-hidden>
        📡
      </span>
      <h2 id={titleId} className="text-[15px] font-extrabold">{title}</h2>
      <p className="max-w-xl text-[13px] leading-6 text-muted">{message}</p>
      {hint ? <p className="max-w-xl text-[12px] leading-5 text-muted">{hint}</p> : null}
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="mt-2 inline-flex min-h-11 items-center justify-center rounded-[3px] border border-line bg-surface px-4 py-2 text-[12px] font-bold transition hover:border-gold-500 hover:text-gold-600 dark:hover:text-gold-400 focus-ring">
          {actionLabel}
        </Link>
      ) : null}
    </section>
  );
}
