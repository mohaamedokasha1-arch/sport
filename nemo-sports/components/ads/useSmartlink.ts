"use client";

/**
 * NEMO Sports · Smartlink on the "watch" CTAs.
 *
 * The operator asked for the Smartlink (and the Popunder) to ride on the watch
 * intents — "شاهد البث الآن" / "مشاهدة على {الناقل}" — because those are the
 * clicks with commercial value. The rules this hook enforces:
 *
 *   · the reader's own action always wins: the handler never calls
 *     preventDefault, so the stream link opens exactly as it did before;
 *   · one monetised click per session by default
 *     (NEXT_PUBLIC_ADS_SMARTLINK_PER_SESSION, 0 disables it), so the site never
 *     turns into a tab farm;
 *   · keyboard activation (Enter/Space, `event.detail === 0`) is left alone —
 *     an ad tab the reader did not aim at is not a "conversion";
 *   · /admin and /api never monetise, and neither does a build with
 *     NEXT_PUBLIC_ADS_ENABLED=0.
 *
 * The allowance lives in sessionStorage; the key is deliberately namespaced and
 * the fallback is an in-memory counter for browsers that refuse storage.
 */

import { useCallback } from "react";
import { usePathname } from "next/navigation";
import {
  ADSTERRA_SMARTLINK_URL,
  isAdFreePath,
  smartlinkEnabled,
  smartlinkMaxPerSession,
} from "@/lib/ads";

export const SMARTLINK_SESSION_KEY = "nemo-ads:smartlink-opens";

export type SessionStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** Counts toward the per-session cap when sessionStorage is unavailable. */
let fallbackUsed = 0;

/**
 * Returns true when the click may open the Smartlink, and books the click.
 * Pure enough to unit-test without a DOM (scripts/verify-ads.test.ts).
 */
export function consumeSmartlinkAllowance(store: SessionStore | null, limit: number): boolean {
  if (limit <= 0) return false;
  if (!store) {
    if (fallbackUsed >= limit) return false;
    fallbackUsed += 1;
    return true;
  }
  let used = Number.parseInt(store.getItem(SMARTLINK_SESSION_KEY) ?? "0", 10);
  if (!Number.isFinite(used) || used < 0) used = 0;
  if (used >= limit) return false;
  try {
    store.setItem(SMARTLINK_SESSION_KEY, String(used + 1));
  } catch {
    // Private mode / quota: keep the in-page count so the cap still holds.
    fallbackUsed += 1;
  }
  return true;
}

function sessionStore(): SessionStore | null {
  try {
    return window.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Attach to any anchor that is a genuine watch action:
 *   `<a href={stream} target="_blank" onClick={useWatchSmartlink()}>`
 */
export function useWatchSmartlink() {
  const pathname = usePathname();
  return useCallback(
    (event?: { detail?: number }) => {
      // Keyboard activation and programmatic clicks carry detail === 0.
      if (event && typeof event.detail === "number" && event.detail === 0) return;
      if (!smartlinkEnabled() || isAdFreePath(pathname)) return;
      if (typeof window === "undefined") return;
      if (!consumeSmartlinkAllowance(sessionStore(), smartlinkMaxPerSession())) return;
      window.open(ADSTERRA_SMARTLINK_URL, "_blank", "noopener,noreferrer");
    },
    [pathname],
  );
}
