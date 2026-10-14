"use client";

/**
 * NEMO Sports · locale-aware internal link
 * ─────────────────────────────────────────────────────────────────────────────
 * A drop-in replacement for `next/link` that spells every internal href in the
 * locale of the tree rendering it. In Arabic it returns the href untouched, so
 * the existing site emits exactly the links — and therefore exactly the
 * internal-link graph — it emits today. In English it adds the `/en` prefix and
 * carries the query string over unchanged, so date filters, pagination and
 * search terms survive a language switch.
 *
 * External URLs and `{ pathname, query }` objects are passed through untouched.
 */

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { useLocale } from "@/lib/i18n/context";
import { localizePath } from "@/lib/i18n/paths";

type LinkProps = ComponentProps<typeof NextLink>;

export default function Link({ href, ...rest }: LinkProps) {
  const locale = useLocale();
  const localized = typeof href === "string" ? localizePath(href, locale) : href;
  return <NextLink href={localized} {...rest} />;
}
