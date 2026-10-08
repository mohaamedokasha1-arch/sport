/**
 * NEMO Sports · live-stream vocabulary (client/Edge-safe)
 * ───────────────────────────────────────────────────────────────────
 * Pure types + constants shared by the client form components, the admin
 * pages and the server store (lib/match-streams.ts). This module MUST stay
 * free of server-only imports (no pg, no bcrypt) so it can be bundled for
 * the browser.
 */

/** How the player is delivered (admin spec §6). */
export type LiveStreamType = "embed" | "official_player" | "external_link";

export const LIVE_STREAM_TYPES: LiveStreamType[] = ["embed", "official_player", "external_link"];

export const LIVE_STREAM_TYPE_AR: Record<LiveStreamType, string> = {
  embed: "تضمين (Embed)",
  official_player: "مشغّل رسمي",
  external_link: "رابط رسمي خارجي",
};

/** Lifecycle statuses (admin spec §8). */
export type LiveStreamStatus = "draft" | "published" | "live" | "ended" | "disabled";

export const LIVE_STREAM_STATUSES: LiveStreamStatus[] = ["draft", "published", "live", "ended", "disabled"];

export const LIVE_STREAM_STATUS_AR: Record<LiveStreamStatus, string> = {
  draft: "مسودة",
  published: "منشور",
  live: "بث حي",
  ended: "منتهٍ",
  disabled: "موقوف",
};

/** Statuses that make a stream visible on public pages. */
export const PUBLIC_STREAM_STATUSES: ReadonlySet<LiveStreamStatus> = new Set(["published", "live"]);
