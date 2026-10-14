"use client";

import { useEffect } from "react";
import Link from "@/components/i18n/Link";
import type { Locale } from "@/lib/i18n/locales";
import { useT } from "@/lib/i18n/context";

/**
 * Shared route-level error panel for both language trees.
 *
 * `error.tsx` files must be client components, so the copy is resolved through
 * the locale context (set by each language's root layout) rather than a prop
 * the boundary would have to know about.
 */
export default function ErrorPanel({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const tr = useT();

  useEffect(() => {
    // In production the error goes to the monitoring service (Sentry/Datadog)
    // together with its digest.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto grid max-w-2xl place-items-center px-4 py-20 text-center">
      <p className="num text-6xl font-extrabold tracking-tight text-live">500</p>
      <h1 className="mt-3 text-xl font-extrabold">{tr("error.unexpectedTitle")}</h1>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-muted">
        {tr("error.unexpectedBody")}
      </p>
      {error.digest ? <p className="num mt-2 text-[11px] text-muted">{tr("error.digest", { digest: error.digest })}</p> : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-[3px] bg-gold-500 px-4 py-2.5 text-[12px] font-extrabold text-navy-900 transition hover:bg-gold-400"
        >
          {tr("common.retry")}
        </button>
        <Link href="/" className="rounded-[3px] border border-line px-4 py-2.5 text-[12px] font-bold transition hover:border-gold-500">
          {tr("common.home")}
        </Link>
      </div>
    </div>
  );
}
