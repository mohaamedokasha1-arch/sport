"use client";

/**
 * NEMO Sports · Adsterra 300×250 banner, one per placement.
 *
 * Renders a fixed 300×250 box (so the page never shifts when the ad lands) and
 * mounts the `/ad-frame` document — the Adsterra snippet's own window, see
 * lib/ads.ts — only once the reader is close to it. Nothing is requested while
 * the placement is off-screen, which is what keeps two banners on the match
 * page from costing anything on first paint.
 *
 * If the frame cannot load (offline, blocked, network error) the box stays a
 * neutral placeholder: the layout is identical either way.
 */

import { useEffect, useRef, useState } from "react";
import { ADSTERRA_BANNER, BANNER_SLOT_LABEL_AR, adFrameSrc, adsEnabled, type BannerSlot } from "@/lib/ads";
import { useT, useDir, useLocale } from "@/lib/i18n/context";

export default function AdsterraBanner({ slot, className = "" }: { slot: BannerSlot; className?: string }) {
  const tr = useT();
  const holder = useRef<HTMLDivElement | null>(null);
  const [load, setLoad] = useState(false);
  const enabled = adsEnabled();

  useEffect(() => {
    if (!enabled) return;
    const node = holder.current;
    if (!node) return;
    // Browsers without IntersectionObserver (and no-JS readers) simply get the
    // ad: correctness first, the optimisation is only an optimisation.
    if (typeof IntersectionObserver === "undefined") {
      setLoad(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setLoad(true);
          observer.disconnect();
        }
      },
      // Start a screen early, so the ad is usually painted by the time it is
      // actually looked at.
      { rootMargin: "400px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);

  if (!enabled) return null;

  const { width, height } = ADSTERRA_BANNER;

  return (
    <aside
      className={`my-5 flex flex-col items-center ${className}`}
      aria-label={BANNER_SLOT_LABEL_AR[slot]}
      data-ad-slot={slot}
    >
      {/* Disclosure: the repository's own ad rules (/admin/ads) require every
          placement to be visibly marked, never blended into editorial. */}
      <span className="mb-1 text-[10px] font-bold tracking-wider text-muted">{tr("ads.label")}</span>
      <div
        ref={holder}
        // Full-bleed only on phones: a 320px viewport minus the page gutter is
        // narrower than 300px + border, and cropping an ad is not an option.
        className="-mx-4 max-h-[251px] overflow-hidden rounded-[4px] border border-line bg-navy-850/[0.03] dark:bg-white/[0.04] sm:mx-0"
        style={{ width, height }}
      >
        {load ? (
          <iframe
            src={adFrameSrc(slot)}
            title={tr("ads.title", { slot: BANNER_SLOT_LABEL_AR[slot] })}
            width={width}
            height={height}
            frameBorder={0}
            scrolling="no"
            className="block border-0"
            // allow-scripts + allow-same-origin keep the network's tag working;
            // withholding allow-top-navigation is what stops a bad creative from
            // navigating the reader's tab.
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <p className="grid h-full w-full place-items-center text-[11px] text-muted">{tr("ads.placeholder")}</p>
        )}
      </div>
    </aside>
  );
}
