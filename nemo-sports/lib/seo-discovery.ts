/**
 * NEMO Sports · Google Discover eligibility + rich-preview directives
 * ─────────────────────────────────────────────────────────────────────
 * Google Discover does not take a submission: a page becomes eligible when
 * Google decides the site is a good fit — large, high-quality preview images,
 * fresh content, an indexable URL and a complete news page (image + headline +
 * date). Three of those four are editorial; the fourth one is a meta tag, and
 * it was missing:
 *
 *   · `max-image-preview:large` — WITHOUT it Google may only show a thumbnail
 *     and the page is effectively excluded from Discover, whatever the quality
 *     of the photograph is. The default is `standard`.
 *   · `max-snippet:-1` / `max-video-preview:-1` — no artificial truncation of
 *     the text snippet or the video preview Google may show.
 *
 * The directives are attached to `googleBot` so they travel WITH the index
 * decision the data pipeline makes (lib/sdl-gateway.ts → robotsForDataSource):
 * a page that is `noindex` stays `noindex`, and nothing here can flip an
 * intentionally hidden page into the index — `index`/`follow` are passed
 * through unchanged. This module is pure so the policy can be asserted without
 * rendering a page (scripts/verify-discover-seo.test.ts).
 *
 * The second half of the file is the editorial measuring stick: the length
 * windows the newsroom writes to (50–60 characters for a title, 120–160 for a
 * meta description). They live here — next to the crawl policy they serve —
 * and are consumed by the admin form hints and the tests, so the guidance the
 * editor sees and the rule the test enforces can never drift apart.
 */

import { SITE_URL } from "@/lib/site";

/** Value Google needs before it will consider a page for Discover. */
export const DISCOVER_MAX_IMAGE_PREVIEW = "large" as const;
/** No snippet truncation (`-1` is Google's "unlimited"). */
export const RICH_MAX_SNIPPET = -1;
/** No video-preview truncation. */
export const RICH_MAX_VIDEO_PREVIEW = -1;

export type RobotsPolicy = {
  index: boolean;
  follow: boolean;
  googleBot: {
    index: boolean;
    follow: boolean;
    "max-image-preview": typeof DISCOVER_MAX_IMAGE_PREVIEW;
    "max-snippet": number;
    "max-video-preview": number;
  };
};

/**
 * Robots metadata for a page whose indexability was already decided elsewhere.
 * The `index`/`follow` pair is copied verbatim (`false` is never upgraded).
 */
export function robotsWithDiscovery(index: boolean, follow: boolean): RobotsPolicy {
  return {
    index,
    follow,
    googleBot: {
      index,
      follow,
      "max-image-preview": DISCOVER_MAX_IMAGE_PREVIEW,
      "max-snippet": RICH_MAX_SNIPPET,
      "max-video-preview": RICH_MAX_VIDEO_PREVIEW,
    },
  };
}

/**
 * An image URL a crawler can fetch, or null.
 *
 * Social and Discover parsers do NOT resolve relative paths: an `<img src>` that
 * works in the browser (`/photo.jpg`) is dropped from the preview card unless it
 * is absolute. Site-relative values are therefore resolved against the canonical
 * origin — the same one every canonical/sitemap URL is built from — while
 * anything that is not plain http(s) (a `data:` URI, a `javascript:` string, an
 * empty field) yields null so a bad field can never emit a broken preview card.
 */
export function absoluteMediaUrl(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return null; // protocol-relative: not an origin we verified
  if (value.startsWith("/")) return `${SITE_URL}${value}`;
  return null;
}

/* ── editorial measuring stick ─────────────────────────────────── */

export type LengthWindow = { min: number; max: number };

/** Recommended title length, in characters, for Arabic headlines. */
export const TITLE_WINDOW: LengthWindow = { min: 50, max: 60 };
/** Recommended meta-description length, in characters. */
export const DESCRIPTION_WINDOW: LengthWindow = { min: 120, max: 160 };

export type LengthVerdict = "empty" | "short" | "ok" | "long";

export function titleVerdict(value: string): LengthVerdict {
  return lengthVerdict(value, TITLE_WINDOW);
}

export function descriptionVerdict(value: string): LengthVerdict {
  return lengthVerdict(value, DESCRIPTION_WINDOW);
}

export function lengthVerdict(value: string, window: LengthWindow): LengthVerdict {
  const length = liveLength(value);
  if (length === 0) return "empty";
  if (length < window.min) return "short";
  if (length > window.max) return "long";
  return "ok";
}

/**
 * Length as Google counts it: trailing/leading whitespace is not part of the
 * headline, and a run of spaces renders as one in the SERP.
 */
export function liveLength(value: string): number {
  return String(value ?? "").replace(/\s+/g, " ").trim().length;
}

/** Arabic guidance shown next to the field in /admin/news/manual. */
export function lengthHintAr(kind: "title" | "description", value: string): string {
  const win = kind === "title" ? TITLE_WINDOW : DESCRIPTION_WINDOW;
  const verdict = lengthVerdict(value, win);
  const range = `${win.min}–${win.max} حرفًا`;
  if (verdict === "empty") {
    return kind === "title" ? "ابدأ بالكلمة المفتاحية الأساسية" : "اكتب ملخصًا يبدأ بالكلمة المفتاحية";
  }
  if (verdict === "short") {
    return kind === "title"
      ? `أقصر من الموصى به (${range}) — أضف عامل جذب: الآن، ملخص، نتيجة، موعد`
      : `أقصر من الموصى به (${range}) — أضف تفصيلًا ملموسًا ونداءً للعمل`;
  }
  if (verdict === "long") {
    return `أطول من الموصى به (${range}) — قد يُقطع في نتائج البحث`;
  }
  return `طول مثالي (${range})`;
}
