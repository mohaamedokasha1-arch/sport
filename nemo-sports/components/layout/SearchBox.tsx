"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchHit, SearchResponse } from "@/lib/search-service";

type Result = Omit<SearchHit, "weight">;
const TYPE_ORDER: Result["type"][] = ["فريق", "لاعب", "بطولة", "مباراة", "خبر"];

const emptyResponse = (query = ""): SearchResponse => ({
  query,
  preview: false,
  total: 0,
  counts: { فريق: 0, لاعب: 0, بطولة: 0, مباراة: 0, خبر: 0 },
  results: [],
});

export default function SearchBox({ variant = "header" }: { variant?: "header" | "mobile" | "page" }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [response, setResponse] = useState<SearchResponse>(() => emptyResponse());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const inputId = variant === "page" ? "search-page" : variant === "mobile" ? "search-mobile" : "search-header";
  const wide = variant === "page";
  const flatResults = response.results;

  const grouped = useMemo(
    () => TYPE_ORDER.map((type) => ({ type, items: flatResults.filter((hit) => hit.type === type) })).filter((group) => group.items.length > 0),
    [flatResults],
  );

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResponse(emptyResponse(query));
      setBusy(false);
      setActiveIndex(-1);
      return;
    }

    setResponse(emptyResponse(query));
    setBusy(true);
    setActiveIndex(-1);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (res.ok) {
          const next = (await res.json()) as SearchResponse;
          setResponse(next);
          setActiveIndex(-1);
        } else {
          setResponse(emptyResponse(query));
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setResponse(emptyResponse(query));
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const query = q.trim();
    if (!query) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  const go = (hit: Result) => {
    setOpen(false);
    if (hit.external) {
      window.open(hit.url, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(hit.url);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === "ArrowDown" && flatResults.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current + 1) % flatResults.length);
    } else if (event.key === "ArrowUp" && flatResults.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => (current <= 0 ? flatResults.length - 1 : current - 1));
    } else if (event.key === "Enter" && activeIndex >= 0 && flatResults[activeIndex]) {
      event.preventDefault();
      go(flatResults[activeIndex]);
    }
  };

  const isDropdownOpen = open && q.trim().length >= 2;

  return (
    <div ref={box} className={`relative ${wide ? "w-full" : "w-full max-w-xs"}`}>
      <form onSubmit={submit} role="search">
        <label className="sr-only" htmlFor={inputId}>
          ابحث عن فريق أو لاعب أو بطولة أو مباراة أو خبر
        </label>
        <div
          className={`flex min-h-11 items-center gap-2 rounded-[3px] border transition focus-within:border-gold-500 ${
            wide ? "border-line bg-surface px-3 py-2.5" : "border-white/15 bg-white/10 px-3 py-2 text-white"
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.6-3.6" strokeLinecap="round" />
          </svg>
          <input
            id={inputId}
            role="combobox"
            aria-autocomplete="list"
            aria-controls={isDropdownOpen && flatResults.length > 0 ? `${inputId}-suggestions` : undefined}
            aria-expanded={isDropdownOpen}
            aria-activedescendant={isDropdownOpen && activeIndex >= 0 ? `${inputId}-option-${activeIndex}` : undefined}
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setOpen(true);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setOpen(true)}
            placeholder="ابحث عن فريق، لاعب، بطولة…"
            autoComplete="off"
            className={`w-full bg-transparent text-[13px] outline-none placeholder:text-current/45 ${wide ? "text-ink placeholder:text-muted" : "text-white"}`}
          />
          {busy ? <span className="text-[10px] opacity-70" aria-label="جارٍ البحث">…</span> : null}
        </div>
      </form>

      {isDropdownOpen ? (
        <div
          className={`absolute inset-x-0 top-full z-50 mt-1 max-h-[min(70vh,440px)] overflow-y-auto rounded-[4px] border shadow-2xl ${
            wide ? "border-line bg-surface" : "border-navy-700 bg-navy-900 text-white"
          }`}
        >
          {response.preview ? <p className={`border-b px-3 py-2 text-[10px] font-bold ${wide ? "border-line bg-gold-500/10 text-muted" : "border-white/10 bg-gold-500/10 text-white/70"}`}>نتائج معاينة للتطوير</p> : null}
          {flatResults.length > 0 ? (
            <div id={`${inputId}-suggestions`} role="listbox" aria-label="اقتراحات البحث" className="py-1">
              {grouped.map(({ type, items }) => (
                <section key={type} role="group" aria-label={`${type}، ${response.counts[type]} نتيجة`}>
                  <h2 className={`flex items-center justify-between px-3 py-1.5 text-[10px] font-extrabold ${wide ? "text-muted" : "text-white/55"}`}>
                    <span>{type}</span>
                    <span className="num">{response.counts[type]}</span>
                  </h2>
                  {items.map((hit) => {
                    const index = flatResults.indexOf(hit);
                    return (
                      <button
                        key={`${hit.type}:${hit.id}`}
                        id={`${inputId}-option-${index}`}
                        type="button"
                        role="option"
                        aria-selected={activeIndex === index}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => go(hit)}
                        className={`focus-ring flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-start transition ${
                          wide ? (activeIndex === index ? "bg-navy-850/10" : "hover:bg-navy-850/5") : activeIndex === index ? "bg-white/15" : "hover:bg-white/10"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-bold">{hit.title}</span>
                          <span className={`block truncate text-[11px] ${wide ? "text-muted" : "text-white/55"}`}>{hit.sub}</span>
                        </span>
                        <span className={`shrink-0 rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold ${wide ? "bg-navy-850/5 text-muted" : "bg-white/10 text-white/70"}`}>
                          {type}
                        </span>
                      </button>
                    );
                  })}
                </section>
              ))}
            </div>
          ) : busy ? (
            <p className={`px-3 py-4 text-[12px] ${wide ? "text-muted" : "text-white/60"}`} role="status">جارٍ البحث في الفرق واللاعبين والبطولات والمباريات والأخبار…</p>
          ) : (
            <div className="px-3 py-4">
              <p className={`text-[13px] font-bold ${wide ? "text-ink" : "text-white"}`} role="status">لا نتائج لـ «{q.trim()}»</p>
              <p className={`mt-1 text-[11px] leading-relaxed ${wide ? "text-muted" : "text-white/55"}`}>
                جرّب جزءًا أقصر من الاسم، أو اكتبه بالعربية أو الإنجليزية، أو احذف الشرطة والمسافة الزائدة.
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push(`/search?q=${encodeURIComponent(q.trim())}`);
            }}
            className={`focus-ring min-h-11 w-full border-t px-3 py-2 text-start text-[11px] font-bold transition ${
              wide ? "border-line text-navy-850 hover:bg-gold-500/15" : "border-white/10 text-gold-400 hover:bg-white/10"
            }`}
          >
            عرض صفحة النتائج لـ «{q.trim()}» · {response.total}
          </button>
        </div>
      ) : null}
    </div>
  );
}
