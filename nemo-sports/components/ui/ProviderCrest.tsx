"use client";

import { useState } from "react";

/** Fixed-size provider logo with a consistent NEMO fallback on load failure. */
export default function ProviderCrest({
  name,
  shortName,
  logoUrl,
  size = 36,
  className = "",
}: {
  name: string;
  shortName?: string | null;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const label = (shortName || name).trim().slice(0, 3) || "N";

  if (logoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={`شعار ${name}`}
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
      role="img"
      aria-label={`شعار ${name} — بديل رمزي`}
      className={`grid shrink-0 place-items-center rounded-[4px] border border-gold-500/35 bg-navy-850 font-display font-extrabold text-gold-400 ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.28) }}
    >
      {label}
    </span>
  );
}
