"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { LiveState } from "@/lib/live";

type Ctx = {
  live: Record<string, LiveState>;
  lastUpdate: number;
  /** ids whose score changed on the most recent tick */
  justScored: string[];
};

const LiveContext = createContext<Ctx>({ live: {}, lastUpdate: 0, justScored: [] });

export const useLive = () => useContext(LiveContext);

export default function LiveProvider({
  initial,
  interval = 5000,
  children,
}: {
  initial: Record<string, LiveState>;
  interval?: number;
  children: React.ReactNode;
}) {
  const [live, setLive] = useState<Record<string, LiveState>>(initial);
  const [lastUpdate, setLastUpdate] = useState(() => Date.now());
  const [justScored, setJustScored] = useState<string[]>([]);
  const mounted = useRef(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/live", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Record<string, LiveState>;
      const scored = Object.values(data).filter((s) => s.changed).map((s) => s.id);
      setLive(data);
      setJustScored(scored);
      setLastUpdate(Date.now());
    } catch {
      /* keep the last known state on screen — never blank the scoreboard */
    }
  }, []);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    const id = setInterval(poll, interval);
    return () => clearInterval(id);
  }, [poll, interval]);

  const value = useMemo(() => ({ live, lastUpdate, justScored }), [live, lastUpdate, justScored]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}
