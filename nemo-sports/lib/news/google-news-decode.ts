/**
 * NEMO Sports · Google News wrapper payloads — PURE decoding (no network)
 * ───────────────────────────────────────────────────────────────────────
 * An RSS item link looks like
 *
 *   https://news.google.com/rss/articles/CBMiXWh0dHBzOi8v…?oc=5
 *
 * The trailing id is base64url-encoded protobuf. Articles indexed in the old
 * format embed the publisher URL inside that message (a length-delimited
 * field), so those decode locally, forever, with zero network traffic. The
 * newer "AU_yqL…" format does NOT embed the URL — that shape needs the RPC
 * exchange in lib/news/google-news.ts and yields null here.
 *
 * This module is imported by lib/news/normalize.ts, so it must stay pure:
 * no fetch, no environment reads, no mutable state.
 */

/** Strict wrapper check (same rule as normalize.isGoogleNewsWrapper). */
export function isGoogleNewsWrapperUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && u.hostname === "news.google.com" && !u.username && !u.password && !u.port;
  } catch {
    return false;
  }
}

/**
 * The base64url article id inside a wrapper URL, or null when the URL is not
 * a decodable article link. `?oc=5` and other tracking params are ignored.
 */
export function googleArticleId(raw: string): string | null {
  if (!isGoogleNewsWrapperUrl(raw)) return null;
  const m = /^\/(?:rss\/)?(?:articles|read)\/([A-Za-z0-9_-]{8,})/.exec(new URL(raw).pathname);
  return m?.[1] ?? null;
}

function fromBase64Url(id: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  try {
    const buf = Buffer.from(id, "base64url");
    return buf.length >= 4 && buf.length <= 4096 ? buf : null;
  } catch {
    return null;
  }
}

/** A byte range that is entirely printable URL ASCII. */
function asAsciiUrl(buf: Buffer, start: number, length: number): string | null {
  if (length < 10 || length > 2000 || start + length > buf.length) return null;
  const slice = buf.subarray(start, start + length);
  for (const byte of slice) {
    // space…~ (DEL and control bytes are never part of a URL)
    if (byte < 0x20 || byte > 0x7e) return null;
  }
  const text = slice.toString("ascii");
  return /^https?:\/\/\S+$/.test(text) ? text : null;
}

/**
 * Minimal protobuf wire-format scan: walk fields, and for wire type 2
 * (length-delimited) accept a value that is a whole printable http(s) URL.
 * Values that are not plain ASCII recurse one level — some shapes nest the
 * article message — but the search is bounded (depth ≤ 2, ≤ 200 fields).
 */
function scanForUrl(buf: Buffer, depth: number, budget: { fields: number }): string | null {
  let pos = 0;
  while (pos < buf.length && budget.fields > 0) {
    budget.fields -= 1;
    const key = readVarint(buf, pos);
    if (key === null) return null;
    pos = key.next;
    const wire = Number(key.value & 0x7n);
    if (wire === 0) {
      const v = readVarint(buf, pos);
      if (v === null) return null;
      pos = v.next;
    } else if (wire === 1) {
      pos += 8;
    } else if (wire === 5) {
      pos += 4;
    } else if (wire === 2) {
      const len = readVarint(buf, pos);
      if (len === null || len.value > 0x100000n) return null;
      pos = len.next;
      const byteLen = Number(len.value);
      const url = asAsciiUrl(buf, pos, byteLen);
      if (url) return url;
      if (depth < 2) {
        const nested = buf.subarray(pos, pos + byteLen);
        // A nested message only when the first byte looks like a field key.
        if (nested.length > 2) {
          const found = scanForUrl(nested, depth + 1, budget);
          if (found) return found;
        }
      }
      pos += byteLen;
    } else {
      return null; // groups (3/4) and unknown wires: not our payload
    }
  }
  return null;
}

function readVarint(buf: Buffer, start: number): { value: bigint; next: number } | null {
  let value = 0n;
  let shift = 0n;
  let pos = start;
  while (pos < buf.length && pos - start < 10) {
    const byte = buf[pos]!;
    value |= BigInt(byte & 0x7f) << shift;
    pos += 1;
    if (!(byte & 0x80)) return { value, next: pos };
    shift += 7n;
  }
  return null;
}

/**
 * Decode the publisher URL embedded in a Google News article id, or null when
 * the payload does not carry one locally (new format → use the network
 * decoder in lib/news/google-news.ts).
 *
 * Deliberately no "scan the bytes for something URL-shaped" fallback: a
 * truncated or corrupted payload must decode to NOTHING (the wrapper link is
 * kept) rather than to a mangled half-URL. Only a length-delimited field that
 * is a whole printable URL counts — that is exactly how well-formed old-format
 * payloads encode the publisher, so precision is total and recall is what the
 * format legitimately allows.
 */
export function decodeEmbeddedPublisherUrl(articleId: string): string | null {
  const buf = fromBase64Url(articleId);
  if (!buf) return null;
  const found = scanForUrl(buf, 0, { fields: 200 });
  if (!found) return null;
  try {
    const u = new URL(found);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * One call: wrapper URL → publisher URL, locally. Null means "either not a
 * wrapper or needs the remote exchange" — callers fall back to the wrapper.
 */
export function resolveGoogleWrapperLocally(raw: string): string | null {
  const id = googleArticleId(raw);
  if (!id) return null;
  return decodeEmbeddedPublisherUrl(id);
}
