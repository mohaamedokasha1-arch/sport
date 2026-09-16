"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Hit = { id: string; type: string; title: string; sub: string; url: string };

export default function SearchBox({ variant = "header" }: { variant?: "header" | "page" }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
        if (res.ok) setHits((await res.json()) as Hit[]);
      } catch {
        /* ignore */
      } finally {
        setBusy(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const go = (url: string) => {
    setOpen(false);
    setQ("");
    router.push(url);
  };

  const wide = variant === "page";

  return (
    <div ref={box} className={`relative ${wide ? "w-full" : "w-full max-w-xs"}`}>
      <form onSubmit={submit} role="search">
        <label className="sr-only" htmlFor={wide ? "search-page" : "search-header"}>
          ابحث عن فريق أو لاعب أو بطولة أو خبر
        </label>
        <div
          className={`flex items-center gap-2 rounded-[3px] border transition focus-within:border-gold-500 ${
            wide
              ? "border-line bg-surface px-3 py-3"
              : "border-white/15 bg-white/10 px-3 py-2 text-white"
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.6-3.6" strokeLinecap="round" />
          </svg>
          <input
            id={wide ? "search-page" : "search-header"}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="ابحث عن فريق، لاعب، بطولة…"
            autoComplete="off"
            className={`w-full bg-transparent text-[13px] outline-none placeholder:text-current/45 ${
              wide ? "text-ink placeholder:text-muted" : "text-white"
            }`}
          />
          {busy ? <span className="text-[10px] opacity-60">…</span> : null}
        </div>
      </form>

      {open && hits.length > 0 ? (
        <div
          className={`absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-[4px] border shadow-2xl ${
            wide ? "border-line bg-surface" : "border-navy-700 bg-navy-900 text-white"
          }`}
        >
          <ul>
            {hits.map((h) => (
              <li key={`${h.type}-${h.id}`}>
                <button
                  type="button"
                  onClick={() => go(h.url)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-start transition ${
                    wide ? "hover:bg-navy-850/5" : "hover:bg-white/10"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-bold">{h.title}</span>
                    <span className={`block truncate text-[11px] ${wide ? "text-muted" : "text-white/55"}`}>
                      {h.sub}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold ${
                      wide ? "bg-navy-850/5 text-muted" : "bg-white/10 text-white/70"
                    }`}
                  >
                    {h.type}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => go(`/search?q=${encodeURIComponent(q.trim())}`)}
            className={`w-full border-t px-3 py-2 text-[11px] font-bold transition ${
              wide
                ? "border-line text-navy-850 hover:bg-gold-500/15"
                : "border-white/10 text-gold-400 hover:bg-white/10"
            }`}
          >
            عرض كل النتائج لـ «{q.trim()}»
          </button>
        </div>
      ) : null}
    </div>
  );
}
