/**
 * NEMO Sports · Google News redirect resolution (network decoder)
 * ───────────────────────────────────────────────────────────────
 * Goal: every news card links to the ORIGINAL publisher article, not to a
 * news.google.com wrapper that bounces the reader through a redirect.
 *
 * Three-step resolution for `https://news.google.com/…/articles/<id>` URLs:
 *
 *   1. LOCAL  — the old payload format embeds the publisher URL in its
 *      protobuf (lib/news/google-news-decode.ts). Zero network; most URLs
 *      indexed before 2024 and many since resolve here.
 *   2. PARAMS — GET the article page ONCE on the pinned Google host and read
 *      the `data-n-a-sg` (signature) / `data-n-a-ts` (timestamp) attributes
 *      the page carries for exactly this RPC.
 *   3. RPC    — POST to the pinned `/_/DotsSplashUi/data/batchexecute`
 *      endpoint with the `Fbv4je` request; the response carries the real URL.
 *
 * Anti-SSRF posture (the reason the old code refused to chase redirects):
 *   · the only host ever contacted comes from ONE operator-controlled base
 *     URL (default https://news.google.com) — never from feed data;
 *   · cross-host redirects are refused, responses are size-capped, and every
 *     request has its own timeout;
 *   · the DECODED target is validated before it is stored (public host name,
 *     no credentials, no IP literals in private ranges);
 *   · every failure mode degrades to the original wrapper link, so a decode
 *     outage can never break ingestion.
 *
 * Results are memoized in-process (positive: 7d, negative: 10min), and the
 * batch resolver is bounded by concurrency, an items cap and a time budget,
 * so the once-a-day cron cannot stall on a slow upstream.
 */

import { googleArticleId, resolveGoogleWrapperLocally, isGoogleNewsWrapperUrl } from "./google-news-decode";

const DEFAULT_GOOGLE_BASE = "https://news.google.com";
const ARTICLE_TIMEOUT_MS = 4_000;
const RPC_TIMEOUT_MS = 4_000;
const MAX_ARTICLE_BYTES = 600_000;
const MAX_RPC_BYTES = 200_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Where the article pages and the batchexecute RPC live. */
export function googleNewsBaseUrl(env: Record<string, string | undefined> = process.env): string {
  // NEMO_NEWS_GOOGLE_BASE_URL exists for local mocks/proxies — the same
  // convention as NEMO_NEWS_FEED_BASE_URL / SPORTSCORE_BASE_URL. The fetch
  // target is never built from feed content, only from this value.
  const raw = String(env.NEMO_NEWS_GOOGLE_BASE_URL ?? "").trim().replace(/\/+$/, "");
  if (!raw) return DEFAULT_GOOGLE_BASE;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return DEFAULT_GOOGLE_BASE;
    if (u.username || u.password || u.search || u.hash) return DEFAULT_GOOGLE_BASE;
    return raw;
  } catch {
    return DEFAULT_GOOGLE_BASE;
  }
}

/** Remote decoding on/off (LOCAL protobuf decoding is always on). */
export function remoteDecodeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return String(env.NEMO_NEWS_GOOGLE_DECODE ?? "1") !== "0";
}

/* ── decoded-target validation ─────────────────────────────────────────── */

/** IPv4 in a private / loopback / link-local / CGNAT range. */
function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b, c, d] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (a > 255 || b > 255 || c > 255 || d > 255) return true; // not a real address
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/**
 * Is this string fit to store as the article's publisher URL? A decoded value
 * that points into a private network or carries credentials is corruption or
 * abuse, never a news page — such results are dropped (link stays a wrapper).
 */
export function isAcceptablePublisherUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (!host || host.length > 253) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return false;
  if (isPrivateIpv4(host)) return false;
  const bare = host.replace(/^\[|\]$/g, "");
  if (bare.includes(":")) {
    // IPv6 literal: loopback/unspecified/link-local/ULA are not publishers.
    if (bare === "::1" || bare === "::" || bare.startsWith("fe80:") || bare.startsWith("fc") || bare.startsWith("fd")) return false;
  }
  // A real publisher host has a public dot (www.bbc.com); intranet names do not.
  if (!host.includes(".") && !bare.includes(":")) return false;
  return true;
}

/* ── capped, host-pinned fetch ─────────────────────────────────────────── */

async function fetchTextLimited(url: string, init: RequestInit, timeoutMs: number, maxBytes: number): Promise<string> {
  const expectedHost = new URL(googleNewsBaseUrl()).hostname;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    // A cross-host redirect is treated as tampering, not as data.
    if (res.url) {
      let finalHost: string | null = null;
      try {
        finalHost = new URL(res.url).hostname;
      } catch {
        finalHost = null;
      }
      if (finalHost && finalHost !== expectedHost) {
        throw new Error(`cross-host redirect to ${finalHost}`);
      }
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes) throw new Error("response too large");
    const reader = res.body?.getReader();
    if (!reader) throw new Error("empty response");
    const decoder = new TextDecoder();
    let text = "";
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error("response too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    clearTimeout(t);
  }
}

/* ── step 2: signature + timestamp from the article page ───────────────── */

const SIGNATURE_RE = /data-n-a-sg="([^"]{1,300})"/;
const TIMESTAMP_RE = /data-n-a-ts="(\d{1,20})"/;

export function parseDecodingParams(html: string): { signature: string; timestamp: string } | null {
  const sig = SIGNATURE_RE.exec(html)?.[1]?.trim();
  const ts = TIMESTAMP_RE.exec(html)?.[1]?.trim();
  if (!sig || !ts) return null;
  return { signature: sig, timestamp: ts };
}

/* ── step 3: the Fbv4je batchexecute call ──────────────────────────────── */

export function buildBatchExecuteBody(articleId: string, signature: string, timestamp: string): string {
  const args = [
    "garturlreq",
    [
      ["en-US", "US", ["FINANCE_TOP_INDICES", "WEB_TEST_1_0_0"], null, null, 1, 1, "US:en", null, 180, null, null, null, null, null, 0, null, null, [1608992183, 723341000]],
      "en-US",
      "US",
      1,
      [2, 3, 4, 8],
      1,
      0,
      "655000234",
      0,
      0,
      null,
      0,
    ],
    articleId,
    Number(timestamp),
    signature,
  ];
  const envelope = [[["Fbv4je", JSON.stringify(args), null, "generic"]]];
  return `f.req=${encodeURIComponent(JSON.stringify(envelope))}`;
}

/** Find the first http(s) string anywhere inside a parsed JSON tree. */
function findUrlInJson(node: unknown, depth = 0): string | null {
  if (depth > 12 || node === null || node === undefined) return null;
  if (typeof node === "string") return /^https?:\/\/\S+$/.test(node) ? node : null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findUrlInJson(item, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Parse the `)]}'`-prefixed batchexecute response into the publisher URL. */
export function parseBatchExecuteResponse(body: string): string | null {
  const json = body.replace(/^\)\]\}'[,]?\s*/, "");
  let rows: unknown;
  try {
    rows = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(rows)) return null;
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    // ["wrb.fr", "Fbv4je", "<json payload string>", null, "generic"]
    if (row[0] !== "wrb.fr" || typeof row[2] !== "string") continue;
    let payload: unknown;
    try {
      payload = JSON.parse(row[2]);
    } catch {
      continue;
    }
    const url = findUrlInJson(payload);
    if (url) return url;
  }
  return null;
}

/* ── resolution (single + batch) ───────────────────────────────────────── */

export type DecodeMethod = "local" | "remote";
export interface DecodeOutcome {
  /** The URL to store — publisher URL on success, the original wrapper otherwise. */
  url: string;
  decoded: boolean;
  method?: DecodeMethod;
  /** short machine-readable failure note (never thrown) */
  error?: string;
}

type CacheValue = { ok: true; url: string; method: DecodeMethod } | { ok: false };
type CacheEntry = CacheValue & { at: number };
const POSITIVE_TTL_MS = 7 * 86_400_000;
const NEGATIVE_TTL_MS = 10 * 60_000;
const CACHE_MAX = 1_000;
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  const ttl = entry.ok ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
  if (Date.now() - entry.at > ttl) {
    cache.delete(key);
    return null;
  }
  return entry;
}

function cachePut(key: string, entry: CacheValue): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { ...entry, at: Date.now() });
}

/**
 * Test seam + a way for an operator to trim a poisoned entry. Ingestion code
 * never calls this: caches are positive for a week because wrapper payloads
 * are immutable.
 */
export function clearGoogleNewsDecodeCache(): void {
  cache.clear();
}

async function fetchDecodingParams(articlePath: string): Promise<{ signature: string; timestamp: string }> {
  const base = googleNewsBaseUrl();
  const html = await fetchTextLimited(
    `${base}${articlePath}`,
    {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    },
    ARTICLE_TIMEOUT_MS,
    MAX_ARTICLE_BYTES,
  );
  const params = parseDecodingParams(html);
  if (!params) throw new Error("no decoding params on article page");
  return params;
}

async function executeDecode(id: string, articlePath: string): Promise<string> {
  const base = googleNewsBaseUrl();
  const { signature, timestamp } = await fetchDecodingParams(articlePath);
  const body = await fetchTextLimited(
    `${base}/_/DotsSplashUi/data/batchexecute?rpcids=Fbv4je`,
    {
      method: "POST",
      headers: {
        "user-agent": USER_AGENT,
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        referer: `${base}${articlePath}`,
      },
      body: buildBatchExecuteBody(id, signature, timestamp),
      redirect: "follow",
    },
    RPC_TIMEOUT_MS,
    MAX_RPC_BYTES,
  );
  const decoded = parseBatchExecuteResponse(body);
  if (!decoded) throw new Error("batchexecute response carried no article URL");
  if (!isAcceptablePublisherUrl(decoded)) throw new Error("decoded URL failed publisher validation");
  return decoded;
}

/**
 * Resolve ONE Google News wrapper URL to its publisher URL. Never throws:
 * any failure returns the wrapper unchanged with `decoded: false`.
 * Non-wrapper input is returned untouched.
 */
export async function decodeGoogleNewsUrl(raw: string, opts: { remote?: boolean } = {}): Promise<DecodeOutcome> {
  const id = googleArticleId(raw);
  if (!id) return { url: raw, decoded: false };

  const local = resolveGoogleWrapperLocally(raw);
  if (local && isAcceptablePublisherUrl(local)) {
    return { url: local, decoded: true, method: "local" };
  }

  const remote = opts.remote ?? remoteDecodeEnabled();
  if (!remote) return { url: raw, decoded: false };

  const cached = cacheGet(raw);
  if (cached) {
    return cached.ok
      ? { url: cached.url, decoded: true, method: cached.method }
      : { url: raw, decoded: false };
  }

  try {
    const path = new URL(raw).pathname; // keep /articles/… vs /rss/articles/…
    const url = await executeDecode(id, path.startsWith("/read/") ? `/articles/${id}` : path);
    cachePut(raw, { ok: true, url, method: "remote" });
    return { url, decoded: true, method: "remote" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cachePut(raw, { ok: false });
    return { url: raw, decoded: false, error: message.slice(0, 160) };
  }
}

export interface BatchResolveStats {
  wrappers: number;
  resolvedLocal: number;
  resolvedRemote: number;
  failed: number;
  /** left as wrapper links for this run (item cap, budget or decode outage) */
  deferred: number;
}

export interface BatchResolveResult {
  /** wrapper URL → URL to store (publisher URL or the wrapper itself) */
  urls: Map<string, string>;
  stats: BatchResolveStats;
}

/**
 * Resolve every Google wrapper in a list of feed links, bounded:
 *   · at most `maxItems` remote resolutions per call (rest are deferred);
 *   · at most `budgetMs` wall-clock for all remote work;
 *   · `concurrency` parallel decode pipelines.
 * Links that are not wrappers are not touched and not present in the map.
 */
export async function resolveGoogleWrapperUrls(
  links: readonly string[],
  opts: { budgetMs?: number; maxItems?: number; concurrency?: number; remote?: boolean } = {},
): Promise<BatchResolveResult> {
  const budgetMs = Math.max(500, Number(process.env.NEMO_NEWS_GOOGLE_DECODE_BUDGET_MS ?? opts.budgetMs ?? 8_000) || 8_000);
  const maxItems = Math.max(1, Number(process.env.NEMO_NEWS_GOOGLE_DECODE_MAX ?? opts.maxItems ?? 40) || 40);
  const concurrency = Math.max(1, Math.min(8, Number(process.env.NEMO_NEWS_GOOGLE_DECODE_CONCURRENCY ?? opts.concurrency ?? 4) || 4));
  const remote = opts.remote ?? remoteDecodeEnabled();

  const stats: BatchResolveStats = { wrappers: 0, resolvedLocal: 0, resolvedRemote: 0, failed: 0, deferred: 0 };
  const urls = new Map<string, string>();
  const started = Date.now();

  // Unique wrappers only: one story can be linked from several items.
  const wrappers = [...new Set(links.filter((l) => isGoogleNewsWrapperUrl(l)))];
  stats.wrappers = wrappers.length;
  if (wrappers.length === 0) return { urls, stats };

  // Local pass first — free and instant.
  const pending: string[] = [];
  for (const link of wrappers) {
    const local = resolveGoogleWrapperLocally(link);
    if (local && isAcceptablePublisherUrl(local)) {
      urls.set(link, local);
      stats.resolvedLocal++;
    } else {
      pending.push(link);
    }
  }

  // A cached earlier result (positive or negative) answers without network.
  const needsRemote: string[] = [];
  for (const link of pending) {
    const hit = remote ? cacheGet(link) : null;
    if (hit?.ok) {
      urls.set(link, hit.url);
      stats.resolvedRemote++;
    } else if (hit && !hit.ok) {
      urls.set(link, link); // recently failed: keep the wrapper, try again later
    } else {
      needsRemote.push(link);
    }
  }

  if (!remote || needsRemote.length === 0) {
    stats.deferred = needsRemote.length;
    for (const link of needsRemote) urls.set(link, link);
    return { urls, stats };
  }

  const queue = needsRemote.slice(0, maxItems);
  const capped = needsRemote.slice(maxItems);
  stats.deferred = capped.length;
  for (const link of capped) urls.set(link, link);

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length > 0) {
        if (Date.now() - started > budgetMs) {
          // Out of budget: the rest stay wrappers this run (retried next run,
          // negative cache expires after 10 minutes).
          const rest = queue.splice(0);
          stats.deferred += rest.length;
          for (const link of rest) urls.set(link, link);
          return;
        }
        const link = queue.shift()!;
        const outcome = await decodeGoogleNewsUrl(link, { remote: true });
        urls.set(link, outcome.url);
        if (outcome.decoded) stats.resolvedRemote++;
        else stats.failed++;
      }
    }),
  );

  return { urls, stats };
}
