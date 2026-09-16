"use client";

import { useEffect, useState } from "react";
import type { LiveState } from "@/lib/live";

/** Polls the live API for a single match (match detail pages). */
export default function useMatchState(id: string, fallback: LiveState, interval = 4000) {
  const [state, setState] = useState<LiveState>(fallback);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/live?ids=${id}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Record<string, LiveState>;
        if (alive && data[id]) setState(data[id]);
      } catch {
        /* offline: keep last known state */
      }
    };
    const timer = setInterval(tick, interval);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [id, interval]);

  return state;
}
