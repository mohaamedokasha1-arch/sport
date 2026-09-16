import type { SVGProps } from "react";

/**
 * NEMO Sports · Brand mark
 * ─────────────────────────────────────────────────────────────
 * Concept: a monogram "N" built from two pillars and one diagonal
 * strike that overshoots the frame. The strike is the moment of
 * motion — the pass, the break, the buzzer — while the pillars hold
 * the authority of a broadcaster.
 *
 * Rules: no gradients, no sports clichés, no outline strokes.
 * It must survive at 16px (favicon) and at billboard scale.
 */

type MarkProps = SVGProps<SVGSVGElement> & {
  size?: number;
  tone?: "brand" | "light" | "mono";
};

export function NemoMark({ size = 32, tone = "brand", ...rest }: MarkProps) {
  const bar = tone === "mono" ? "currentColor" : "#0F1B2E";
  const barDark = tone === "light" ? "#0F1B2E" : bar;
  const strike = tone === "brand" ? "#D4AF37" : "currentColor";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {tone !== "mono" && tone !== "light" ? null : null}
      <rect x="5" y="7" width="10" height="34" fill={tone === "light" ? "#FFFFFF" : barDark} />
      <rect x="33" y="7" width="10" height="34" fill={tone === "light" ? "#FFFFFF" : barDark} />
      <polygon points="7,41 15,41 41,7 33,7" fill={strike} />
    </svg>
  );
}

type LogoProps = {
  size?: number;
  tone?: "brand" | "light" | "mono";
  tagline?: boolean;
  className?: string;
};

export default function Logo({
  size = 34,
  tone = "light",
  tagline = false,
  className = "",
}: LogoProps) {
  const wordColor = tone === "brand" ? "text-navy-850" : "text-white";
  const subColor = tone === "brand" ? "text-muted" : "text-white/55";

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} dir="ltr">
      <NemoMark size={size} tone={tone} />
      <span className="flex flex-col leading-none">
        <span
          className={`font-display text-[1.35rem] font-bold tracking-[0.14em] uppercase ${wordColor}`}
          style={{ fontSize: Math.max(18, size * 0.62) }}
        >
          NEMO
        </span>
        <span
          className={`mt-0.5 font-display text-[0.62rem] font-semibold tracking-[0.34em] uppercase ${
            tone === "brand" ? "text-gold-600" : "text-gold-500"
          }`}
        >
          Sports
        </span>
      </span>
      {tagline ? (
        <span className={`hidden border-s border-current/15 ps-2.5 text-[10px] ${subColor} lg:block`}>
          Live Sports,
          <br />
          Every Moment
        </span>
      ) : null}
    </span>
  );
}
