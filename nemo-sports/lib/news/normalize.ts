/**
 * NEMO Sports · news normalization
 * ─────────────────────────────────
 * HTML-entity decoding, whitespace trimming, URL canonicalization (tracking
 * params stripped), ISO-8601 timestamps and content validation.
 */

import { createHash } from "node:crypto";

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&rdquo;": "”",
  "&ldquo;": "“",
  "&ndash;": "–",
  "&mdash;": "—",
  "&hellip;": "…",
};

/** Decode entities, strip tags, collapse whitespace. */
export function cleanText(raw: string): string {
  let s = raw.replace(/<[^>]*>/g, " ");
  s = s.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|([a-zA-Z]+));/g, (m, dec, hex, named) => {
    if (dec) {
      const n = Number(dec);
      return Number.isFinite(n) ? String.fromCodePoint(Math.min(n, 0x10ffff)) : m;
    }
    if (hex) {
      const n = Number.parseInt(hex, 16);
      return Number.isFinite(n) ? String.fromCodePoint(Math.min(n, 0x10ffff)) : m;
    }
    return ENTITY_MAP[`&${named};`] ?? m;
  });
  return s.replace(/\s+/g, " ").trim();
}

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "fbclid", "gclid", "mc_cid", "mc_eid", "igshid", "si", "spm", "scid",
  "yclid", "msclkid", "dclid", "wbraid", "gbraid",
]);

/**
 * Canonical URL for dedup: lowercase host, strip www, drop tracking params,
 * sort remaining params, drop trailing slash (except root) and fragment.
 */
export function canonicalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    let host = u.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    const params = new URLSearchParams();
    const keys = [...u.searchParams.keys()].filter((k) => !TRACKING_PARAMS.has(k.toLowerCase())).sort();
    for (const k of keys) {
      const v = u.searchParams.get(k);
      if (v !== null) params.append(k, v);
    }
    let path = u.pathname.replace(/\/+$/, "");
    if (!path) path = "/";
    const qs = params.toString();
    return `${host}${path}${qs ? `?${qs}` : ""}`;
  } catch {
    return null;
  }
}

export function extractDomain(raw: string): string {
  try {
    let host = new URL(raw.trim()).hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    return host.slice(0, 120);
  } catch {
    return "unknown";
  }
}

export function sourceBadge(sourceName: string): string {
  const clean = sourceName.replace(/[^A-Za-z\u0600-\u06FF0-9 ]/g, " ").trim();
  if (!clean) return "📰";
  const words = clean.split(/\s+/).slice(0, 2);
  return words.map((w) => w[0]).join("").toUpperCase();
}

/** Parse any RSS date flavor → ISO 8601, or null when unparseable. */
export function toIsoDate(raw: string | null): string | null {
  if (!raw) return null;
  const t = Date.parse(raw.trim());
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

export function fingerprint(canonicalUrl: string, title: string): string {
  return createHash("sha256").update(`${canonicalUrl}::${title.toLowerCase().trim()}`).digest("hex");
}

/** Google News wraps publisher URLs in news.google.com/articles/… links. */
export function isGoogleNewsWrapper(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes("news.google.com");
  } catch {
    return false;
  }
}

/** Best-effort publisher URL resolution (follows one redirect, 5s budget). */
export async function resolvePublisherUrl(googleUrl: string): Promise<string> {
  if (!isGoogleNewsWrapper(googleUrl)) return googleUrl;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(googleUrl, {
        method: "HEAD",
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "user-agent": "Mozilla/5.0 (compatible; NEMO-Sports/1.0; +https://nemo-sports.vercel.app)" },
      });
      const finalUrl = res.url;
      if (finalUrl && !isGoogleNewsWrapper(finalUrl)) return finalUrl;
    } finally {
      clearTimeout(t);
    }
  } catch {
    // fall through — keep the Google News link (still a valid source link)
  }
  return googleUrl;
}

export interface ValidationResult {
  valid: boolean;
  reasons: string[];
}

/**
 * Validate a normalized article. Retention default 30 days; future-dated
 * items (clock skew > 1h) are rejected as untrustworthy.
 */
export function validateArticle(input: {
  title: string;
  sourceUrl: string;
  publicationDate: string | null;
  maxAgeDays?: number;
}): ValidationResult {
  const reasons: string[] = [];
  const maxAgeDays = input.maxAgeDays ?? 30;

  if (!input.title || input.title.length < 8) reasons.push("title too short");
  if (input.title.length > 300) reasons.push("title too long");
  try {
    const u = new URL(input.sourceUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") reasons.push("non-http url");
  } catch {
    reasons.push("invalid url");
  }
  if (!input.publicationDate) {
    reasons.push("missing publication date");
  } else {
    const t = Date.parse(input.publicationDate);
    if (!Number.isFinite(t)) {
      reasons.push("unparseable publication date");
    } else {
      const now = Date.now();
      if (t > now + 3600_000) reasons.push("publication date in the future");
      if (t < now - maxAgeDays * 86400_000) reasons.push(`older than retention (${maxAgeDays}d)`);
    }
  }
  return { valid: reasons.length === 0, reasons };
}
