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

/** One decode pass over named, decimal and hex character references. */
function decodeEntities(value: string): string {
  return value.replace(/&(?:#(\d{1,7})|#x([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,10}));/g, (m, dec, hex, named) => {
    if (dec) {
      const n = Number(dec);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(Math.min(n, 0x10ffff)) : m;
    }
    if (hex) {
      const n = Number.parseInt(hex, 16);
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(Math.min(n, 0x10ffff)) : m;
    }
    return ENTITY_MAP[`&${named};`] ?? m;
  });
}

/** Complete elements, comments, CDATA wrappers and processing instructions. */
const MARKUP = /<!--[\s\S]*?-->|<!\[CDATA\[|\]\]>|<\?[\s\S]*?\?>|<\/?[a-zA-Z][^>]*>|<[^>]*\/>/g;

/**
 * An opening or closing tag that never terminates: a snippet cut at a length
 * limit ends exactly like this (`…articles/CBMi3w…?oc=5" t`), and a plain
 * `<tag>` scan leaves it in place. Only a `<` followed by a letter, `/` or `!`
 * counts, so real text such as «مباراة 5 < 7» survives untouched.
 */
const UNTERMINATED_MARKUP = /<\/?[a-zA-Z!][^>]*$/;

/**
 * Decode entities, strip markup, collapse whitespace.
 *
 * Order matters and must be repeated: feeds ship *escaped* markup
 * (`&lt;a href=…&gt;`), so decoding before stripping is what turns them into
 * text; a second strip then removes what the decode revealed. The old order
 * (strip → decode) left double-encoded anchors as visible text — production
 * rendered `<a href="https://news.google.com/rss/articles/…` as the article
 * excerpt on `/news` for exactly this reason.
 */
export function cleanText(raw: string): string {
  let s = String(raw ?? "");
  for (let pass = 0; pass < 3; pass += 1) {
    const before = s;
    s = decodeEntities(s);
    s = s.replace(MARKUP, " ");
    s = s.replace(UNTERMINATED_MARKUP, " ");
    if (s === before) break;
  }
  return s.replace(/\s+/g, " ").trim();
}

/**
 * A usable excerpt, or "" when the snippet carries no information.
 *
 * Google News wraps `<a href>headline</a> <font>publisher</font>` around the
 * real snippet; cutting that at a length limit used to store the wrapper's
 * debris — production snippets of «N», «A» and «Al Ahly - Aigle Noir 1-0  A»
 * are the tail of an `<img alt=…>`/`<font>` attribute, not a sentence. Three
 * things therefore have to go before an excerpt is worth storing:
 *
 *   · the publisher the feed appends after the headline (the card already shows
 *     the source, and the wrapper text is not part of the story);
 *   · anything too short to be a sentence;
 *   · a snippet that only echoes the headline — it adds no information.
 *
 * Returning "" is honest and safe: the headline and the original link stay,
 * and no fabricated or truncated sentence is presented as the article's text.
 */
export const MIN_EXCERPT_CHARS = 20;
export const MIN_EXCERPT_WORDS = 3;

/** Letters/digits only, so punctuation and spacing cannot hide an echo. */
function comparable(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function publicExcerpt(
  raw: string | null | undefined,
  opts: { sourceName?: string; title?: string } = {},
): string {
  let text = cleanText(String(raw ?? ""));
  const source = cleanText(opts.sourceName ?? "");
  if (source) {
    // «Headline  Publisher» (the feed's <font> block) and «Headline - Publisher».
    const suffix = new RegExp(`\\s*-?\\s*${source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
    text = text.replace(suffix, "").trim();
  }
  if (text.length < MIN_EXCERPT_CHARS) return "";
  if (text.split(/\s+/).filter(Boolean).length < MIN_EXCERPT_WORDS) return "";
  const head = comparable(displayHeadline(opts.title ?? "", source));
  const body = comparable(text);
  if (head.length > 0 && body.length > 0 && (head === body || head.startsWith(body) || body.startsWith(head))) return "";
  return text;
}

/**
 * Headline without the aggregator's suffix.
 *
 * Google News titles arrive as «Headline - Publisher». The publisher is already
 * shown as the card's source, so repeating it in the headline is noise (and it
 * pollutes the visible title, the link text and anything that reads it). The
 * suffix is removed only when it really is the source name — a headline that
 * legitimately ends in « - Something» keeps it.
 */
export function displayHeadline(title: string, sourceName = ""): string {
  const raw = String(title ?? "").trim();
  const index = raw.lastIndexOf(" - ");
  if (index <= 0) return raw;
  const head = raw.slice(0, index).trim();
  const tail = raw.slice(index + 3).trim();
  if (!head) return raw;
  const source = cleanText(sourceName);
  const matchesSource =
    source.length > 0 &&
    (tail.toLowerCase() === source.toLowerCase() ||
      tail.toLowerCase().replace(/^the\s+/, "") === source.toLowerCase().replace(/^the\s+/, ""));
  const looksLikeDomain = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(tail);
  return matchesSource || looksLikeDomain ? head : raw;
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
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "news.google.com" && !u.username && !u.password && !u.port;
  } catch {
    return false;
  }
}

/** Keep the public RSS link. Never chase publisher redirects server-side:
 * feeds can point to private addresses and a redirect is not an SSRF boundary.
 * Google wrappers remain visibly attributed discovery links, not verified URLs.
 */
export async function resolvePublisherUrl(url: string): Promise<string> {
  return url;
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
