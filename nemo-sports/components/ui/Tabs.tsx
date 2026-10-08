"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export default function Tabs({
  items,
  initial,
  label = "أقسام الصفحة",
}: {
  items: { id: string; label: string; content: ReactNode; disabled?: boolean }[];
  initial?: string;
  label?: string;
}) {
  const initialActive = initial && items.some((item) => item.id === initial && !item.disabled)
    ? initial
    : items.find((item) => !item.disabled)?.id ?? items[0]?.id ?? "";
  const [active, setActive] = useState(initialActive);
  const activeItem = items.find((item) => item.id === active);
  const idPrefix = useId();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentId: string) => {
    const available = items.filter((item) => !item.disabled);
    if (available.length === 0) return;
    const currentIndex = available.findIndex((item) => item.id === currentId);
    if (currentIndex < 0) return;

    let nextIndex: number;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = available.length - 1;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex + 1) % available.length;
    else if (event.key === "ArrowRight") nextIndex = (currentIndex - 1 + available.length) % available.length;
    else return;

    event.preventDefault();
    const next = available[nextIndex];
    setActive(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <div>
      <div className="no-bar flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label={label}>
        {items.map((t) => (
          <button
            key={t.id}
            ref={(node) => { tabRefs.current[t.id] = node; }}
            type="button"
            id={`${idPrefix}-tab-${t.id}`}
            role="tab"
            aria-selected={active === t.id}
            aria-controls={`${idPrefix}-panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            disabled={t.disabled}
            onClick={() => setActive(t.id)}
            onKeyDown={(event) => onTabKeyDown(event, t.id)}
            className={`relative inline-flex min-h-11 shrink-0 items-center px-4 py-2.5 text-[13px] font-bold transition focus-ring ${
              active === t.id ? "text-navy-850 dark:text-gold-400" : "text-muted hover:text-ink"
            } ${t.disabled ? "cursor-not-allowed opacity-40" : ""}`}
          >
            {t.label}
            {active === t.id ? <span className="absolute inset-x-0 -bottom-px h-0.5 bg-gold-500" aria-hidden /> : null}
          </button>
        ))}
      </div>
      <div
        id={`${idPrefix}-panel-${active}`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${active}`}
        tabIndex={0}
        className="pt-5 focus:outline-none"
      >
        {activeItem?.content}
      </div>
    </div>
  );
}
