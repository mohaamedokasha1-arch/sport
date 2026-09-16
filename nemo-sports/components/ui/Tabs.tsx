"use client";

import { useState, type ReactNode } from "react";

export default function Tabs({
  items,
  initial,
}: {
  items: { id: string; label: string; content: ReactNode; disabled?: boolean }[];
  initial?: string;
}) {
  const [active, setActive] = useState(initial ?? items.find((i) => !i.disabled)?.id ?? items[0].id);

  return (
    <div>
      <div className="no-bar flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {items.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            disabled={t.disabled}
            onClick={() => setActive(t.id)}
            className={`relative shrink-0 px-4 py-2.5 text-[13px] font-bold transition focus-ring ${
              active === t.id ? "text-navy-850 dark:text-gold-400" : "text-muted hover:text-ink"
            } ${t.disabled ? "cursor-not-allowed opacity-40" : ""}`}
          >
            {t.label}
            {active === t.id ? <span className="absolute inset-x-0 -bottom-px h-0.5 bg-gold-500" aria-hidden /> : null}
          </button>
        ))}
      </div>
      <div className="pt-5">{items.find((i) => i.id === active)?.content}</div>
    </div>
  );
}
