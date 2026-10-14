"use client";

/**
 * NEMO Sports · page-level Adsterra tags (Social Bar + Popunder).
 *
 * Mounted once from the root layout (the site's main template), so it renders
 * on every public page and survives client-side navigation. Three rules keep it
 * from costing anything:
 *
 *   1. never on operator surfaces — `isAdFreePath` skips /admin and /api;
 *   2. never before the page itself is done — the tags are injected on the
 *      window `load` event and then on an idle callback, so they cannot delay
 *      first paint, hydration or the match page's own data;
 *   3. exactly once per document — `injectAdScriptOnce` is a module-level
 *      guard, so React StrictMode's double effect and re-renders cannot buy a
 *      second impression.
 *
 * Before the tags load, `guardAgainstDocumentWriteWipe` disarms the one failure
 * mode that would blank the whole site (a network tag calling document.write()
 * after load) — see lib/ads.ts.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  ADSTERRA_POPUNDER_URL,
  ADSTERRA_SOCIAL_BAR_URL,
  guardAgainstDocumentWriteWipe,
  injectAdScriptOnce,
  isAdFreePath,
  popunderEnabled,
  socialBarEnabled,
  whenIdle,
} from "@/lib/ads";

const SOCIAL_BAR_ID = "nemo-adsterra-social-bar";
const POPUNDER_ID = "nemo-adsterra-popunder";

export default function AdScripts() {
  const pathname = usePathname();

  useEffect(() => {
    if (isAdFreePath(pathname)) return;
    if (!socialBarEnabled() && !popunderEnabled()) return;

    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      guardAgainstDocumentWriteWipe();
      whenIdle(() => {
        if (cancelled) return;
        if (socialBarEnabled()) injectAdScriptOnce(SOCIAL_BAR_ID, ADSTERRA_SOCIAL_BAR_URL);
        if (popunderEnabled()) injectAdScriptOnce(POPUNDER_ID, ADSTERRA_POPUNDER_URL);
      });
    };

    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", start);
    };
  }, [pathname]);

  return null;
}
