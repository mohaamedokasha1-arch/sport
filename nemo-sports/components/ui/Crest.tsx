import { teamBySlug } from "@/lib/core-data";

/**
 * Team crest: a shield-shaped monogram generated from the club colours.
 * We draw our own marks — no third-party logos are embedded.
 */
export default function Crest({
  slug,
  size = 40,
  className = "",
}: {
  slug: string;
  size?: number;
  className?: string;
}) {
  const team = teamBySlug(slug);
  const primary = team?.primary ?? "#0F1B2E";
  const secondary = team?.secondary ?? "#D4AF37";
  const id = `c-${slug}-${size}`;
  const label = team?.short ?? slug.slice(0, 3);
  const glyph = label.length > 3 ? label.slice(0, 3) : label;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={`shrink-0 ${className}`}
      role="img"
      aria-label={team ? `شعار ${team.name}` : glyph}
    >
      <defs>
        <clipPath id={id}>
          <path d="M24 2 44 8v18c0 10.5-8.3 17.6-20 20C12.3 43.6 4 36.5 4 26V8z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect width="48" height="48" fill={primary} />
        <rect x="0" y="30" width="48" height="18" fill={secondary} opacity="0.9" />
        <polygon points="0,0 22,0 0,26" fill={secondary} opacity="0.35" />
      </g>
      <path
        d="M24 2 44 8v18c0 10.5-8.3 17.6-20 20C12.3 43.6 4 36.5 4 26V8z"
        fill="none"
        stroke="rgba(15,27,46,0.35)"
        strokeWidth="1.5"
      />
      <text
        x="24"
        y={size >= 34 ? 29 : 30}
        textAnchor="middle"
        fontSize={glyph.length > 2 ? 13 : 16}
        fontWeight="800"
        fontFamily="Barlow Condensed, IBM Plex Sans Arabic, sans-serif"
        letterSpacing="0.02em"
        fill="#0F1B2E"
        style={{ paintOrder: "stroke" }}
        stroke="rgba(255,255,255,0.75)"
        strokeWidth="2.2"
      >
        {glyph}
      </text>
    </svg>
  );
}
