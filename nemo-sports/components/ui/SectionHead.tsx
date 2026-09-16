import Link from "next/link";

export default function SectionHead({
  eyebrow,
  title,
  href,
  linkLabel = "عرض الكل",
  accent = true,
}: {
  eyebrow?: string;
  title: string;
  href?: string;
  linkLabel?: string;
  accent?: boolean;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 border-b-2 border-line pb-2.5">
      <div className="flex items-center gap-3">
        {accent ? <span className="h-5 w-1 rounded-full bg-gold-500" aria-hidden /> : null}
        <div>
          {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
          <h2 className="section-title">{title}</h2>
        </div>
      </div>
      {href ? (
        <Link
          href={href}
          className="shrink-0 text-[12px] font-bold text-navy-850 transition hover:text-gold-600 dark:text-gold-400 dark:hover:text-gold-300"
        >
          {linkLabel} ←
        </Link>
      ) : null}
    </div>
  );
}
