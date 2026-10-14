"use client";

import { useT } from "@/lib/i18n/context";

import { useEffect, useRef, useState } from "react";
import { teamMonogram } from "@/lib/team-monogram";

/**
 * Fixed-size provider logo with a consistent NEMO fallback on a missing or
 * broken logo.
 *
 * `decorative` (default true) is for the usual layout where the team's full
 * name is rendered right next to the crest: the crest is then hidden from
 * assistive technology (alt="" / aria-hidden) so the name is announced once,
 * not as "شعار X" + "X". The fallback monogram is CSS-drawn (see
 * .crest-monogram in globals.css) and built from initials, never a slice of
 * the name — the old `name.slice(0, 3)` produced "Vaq" beside "Vaqueros
 * Reynosa" and split Arabic names after the article.
 */
export default function ProviderCrest({
  name,
  shortName,
  logoUrl,
  size = 36,
  className = "",
  decorative = true,
}: {
  name: string;
  shortName?: string | null;
  logoUrl?: string | null;
  size?: number;
  className?: string;
  /** The full team name is visible next to the crest (default). */
  decorative?: boolean;
}) {
  const tr = useT();
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const monogram = teamMonogram(name, shortName);

  // A logo that fails BEFORE hydration never reaches React's onError, and the
  // browser keeps a broken-image icon next to the team name. Check once mounted.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [logoUrl]);

  if (logoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={imgRef}
        src={logoUrl}
        alt={decorative ? "" : tr("ui.crestAria", { name })}
        aria-hidden={decorative ? true : undefined}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`h-[var(--crest-size)] w-[var(--crest-size)] shrink-0 rounded-[3px] bg-white/80 object-contain dark:bg-white/5 ${className}`}
        style={{ "--crest-size": `${size}px` } as React.CSSProperties}
      />
    );
  }

  return (
    <span
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": tr("ui.crestFallbackAria", { name }) })}
      data-monogram={monogram}
      title={decorative ? undefined : name}
      className={`crest-monogram grid shrink-0 select-none place-items-center overflow-hidden rounded-[4px] border border-gold-500/35 bg-navy-850 font-display font-extrabold leading-none text-gold-400 ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * (monogram.length > 2 ? 0.3 : 0.36))) }}
    />
  );
}
