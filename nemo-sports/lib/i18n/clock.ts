/**
 * NEMO Sports · localised live clock
 * ──────────────────────────────────
 * `lib/live.ts` computes a match clock and has always exposed it as an Arabic
 * string on `LiveState.clock`, which is part of the /api/live payload. That
 * string cannot simply be translated: the endpoint is a public API contract and
 * client components poll it, so changing it would change the API.
 *
 * So `lib/live.ts` also exposes `clockParts` — the same information with no
 * language attached — and this module renders it for the visitor's language.
 * `clock` is left exactly as it was.
 *
 * Arabic output is byte-identical to what `clockFor()` produced before, which
 * `scripts/verify-i18n.test.ts` asserts across every sport.
 *
 * Server + client safe (no "use client", no env reads).
 */

import type { ClockParts } from "@/lib/live";
import type { Locale } from "./locales";
import { t } from "./translate";

/**
 * Render a clock in `locale`.
 *
 * The separator between a period and its countdown is the Arabic comma-dot
 * "·" in both languages because that is what the Arabic clock has always
 * shown; only the words around it change.
 */
export function clockLabel(locale: Locale, parts: ClockParts | null | undefined): string {
  if (!parts) return "";
  switch (parts.kind) {
    case "status":
      return t(locale, `clock.${parts.key}`);
    case "minute":
      return t(locale, "clock.minute", { value: parts.minute });
    case "stoppage":
      return t(locale, "clock.stoppage", { value: parts.minute });
    case "period": {
      const period = t(locale, `clock.period.${parts.unit}`, { index: parts.index });
      return parts.remaining
        ? t(locale, "clock.periodWithTime", { period, time: parts.remaining })
        : period;
    }
    case "raw":
      // An operator-entered clock string. There is no structure to translate
      // and guessing would fabricate meaning, so it is shown as entered.
      return parts.value;
  }
}
