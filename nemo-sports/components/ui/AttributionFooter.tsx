import { requiredAttributions } from "@/lib/providers";

/**
 * Provider attribution strip — REQUIRED by free-tier licences.
 * Rendered in the site footer and available to any data panel.
 * Arabic-first: "بيانات المباريات: SportScore" etc., each linked.
 */
export default function AttributionFooter({
  className = "",
  exclude = [],
}: {
  className?: string;
  exclude?: string[];
}) {
  const sources = requiredAttributions().filter((source) => !exclude.includes(source.name));
  return (
    <p className={`text-[11px] leading-relaxed text-white/45 ${className}`}>
      {sources.map((s, i) => (
        <span key={s.name}>
          {i > 0 ? <span aria-hidden> · </span> : null}
          {s.attributionTextAr}{" "}
          <a
            href={s.attributionUrl}
            target="_blank"
            rel="dofollow noopener"
            className="font-bold text-white/60 underline decoration-gold-500/50 underline-offset-2 transition hover:text-gold-400"
          >
            {s.name}
          </a>
        </span>
      ))}
    </p>
  );
}
