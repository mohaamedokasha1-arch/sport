/**
 * NEMO Sports · primary navigation
 * ─────────────────────────────────────────────────────────────────────────────
 * Labels are message keys, not literal text, so the same navigation renders in
 * Arabic or English from one definition. `href` stays the unprefixed Arabic
 * path: `components/i18n/Link` spells it for the active locale, which is what
 * keeps the Arabic link graph byte-for-byte what it was.
 */

import type { MessageKey } from "@/lib/i18n/translate";

export type NavItem = { href: string; labelKey: MessageKey };

export const NAV: NavItem[] = [
  { href: "/today", labelKey: "nav.today" },
  { href: "/matches", labelKey: "nav.matches" },
  { href: "/live", labelKey: "nav.live" },
  { href: "/results", labelKey: "nav.results" },
  { href: "/competitions", labelKey: "nav.competitions" },
  { href: "/teams", labelKey: "nav.teams" },
  { href: "/players", labelKey: "nav.players" },
  { href: "/my-day", labelKey: "nav.myDay" },
  { href: "/scout", labelKey: "nav.scout" },
  { href: "/news", labelKey: "nav.news" },
  { href: "/watch", labelKey: "nav.watch" },
];
