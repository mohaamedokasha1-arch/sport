"use client";

/**
 * A text field that measures itself against the newsroom's SERP windows.
 *
 * The master SEO plan fixes two numbers: a title of 50–60 characters and a meta
 * description of 120–160. Google truncates outside them, so the editor sees the
 * count and the verdict WHILE typing instead of discovering the cut in Search
 * Console a week later. The windows and the Arabic advice come from
 * lib/seo-discovery.ts — the same module the tests assert against, so the hint
 * and the rule cannot drift apart.
 *
 * Purely presentational: the value still submits with the form exactly as the
 * plain input did (same `name`, same `defaultValue`, same `maxLength`), so the
 * server actions and their validation are untouched.
 */

import { useState } from "react";
import { Field, inputCls } from "@/components/admin/ui";
import { DESCRIPTION_WINDOW, TITLE_WINDOW, lengthHintAr, lengthVerdict, liveLength } from "@/lib/seo-discovery";

const TONE: Record<string, string> = {
  ok: "text-win",
  short: "text-white/50",
  long: "text-live",
  empty: "text-white/40",
};

export default function SeoTextField({
  kind,
  name,
  label,
  maxLength,
  defaultValue = "",
  rows,
  placeholder,
  required,
}: {
  kind: "title" | "description";
  name: string;
  label: string;
  maxLength: number;
  defaultValue?: string;
  rows?: number;
  placeholder?: string;
  required?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const window = kind === "title" ? TITLE_WINDOW : DESCRIPTION_WINDOW;
  const verdict = lengthVerdict(value, window);
  const length = liveLength(value);

  return (
    <Field label={label}>
      {rows ? (
        <textarea
          name={name}
          rows={rows}
          maxLength={maxLength}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          onChange={(event) => setValue(event.target.value)}
          className={inputCls}
        />
      ) : (
        <input
          name={name}
          maxLength={maxLength}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          onChange={(event) => setValue(event.target.value)}
          className={inputCls}
        />
      )}
      <span className="mt-1 flex items-center justify-between gap-2 text-[10px]">
        <span className={TONE[verdict]}>{lengthHintAr(kind, value)}</span>
        <span className={`num ${TONE[verdict]}`} dir="ltr">
          {length}/{window.max}
        </span>
      </span>
    </Field>
  );
}
