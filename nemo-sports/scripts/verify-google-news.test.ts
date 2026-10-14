/**
 * NEMO Sports · Google News redirect resolution — unit verification (offline).
 * ───────────────────────────────────────────────────────────────────────────
 * Covers the two decode paths an RSS wrapper can take:
 *
 *   · LOCAL  — old-format protobuf payloads embed the publisher URL;
 *   · REMOTE — new-format payloads resolve through the pinned article-page +
 *     batchexecute exchange, reproduced here by a local mock Google (same
 *     endpoints, same data-n-a-sg / data-n-a-ts attributes, same `)]}'` XSSI
 *     prefix, same nested wrb.fr envelope).
 *
 * Also pins the security posture: a decoded target that is private/credentialed
 * is dropped, a cross-host redirect is refused, remote decode can be disabled,
 * and every failure degrades to the original wrapper link.
 *
 * Run: npm run news:google:test
 */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, beforeEach, test } from "node:test";

if (process.env.DATABASE_URL) throw new Error("Offline decoder tests refuse a configured database");
process.env.NEMO_TEST_MEMORY_ONLY = "1";

import {
  decodeEmbeddedPublisherUrl,
  googleArticleId,
  isGoogleNewsWrapperUrl,
  resolveGoogleWrapperLocally,
} from "@/lib/news/google-news-decode";
import {
  buildBatchExecuteBody,
  clearGoogleNewsDecodeCache,
  decodeGoogleNewsUrl,
  isAcceptablePublisherUrl,
  parseBatchExecuteResponse,
  parseDecodingParams,
  resolveGoogleWrapperUrls,
} from "@/lib/news/google-news";
import { resolvePublisherUrl } from "@/lib/news/normalize";

/* ── helpers: build a well-formed old-format payload ───────────────────── */

function varint(n: number): Buffer {
  const out: number[] = [];
  let x = n;
  while (x > 127) {
    out.push((x & 127) | 128);
    x >>= 7;
  }
  out.push(x);
  return Buffer.from(out);
}

/** Old-format article payload: field1 varint 19, field2 = URL, field26 = 0. */
export function embedPublisherUrl(publisherUrl: string): string {
  const bytes = Buffer.from(publisherUrl, "ascii");
  const payload = Buffer.concat([Buffer.from([0x08, 0x13, 0x22]), varint(bytes.length), bytes, Buffer.from([0xd2, 0x01, 0x00])]);
  return payload.toString("base64url");
}

const EMBEDDED_ID = embedPublisherUrl("https://www.publisher-a.example/sport/story-1?rss=1");
const EMBEDDED_WRAPPER = `https://news.google.com/rss/articles/${EMBEDDED_ID}?oc=5`;

/* ── 1 · wrapper recognition + payload id ──────────────────────────────── */

test("wrapper recognition is exact: host, scheme, no credentials, no port", () => {
  assert.equal(isGoogleNewsWrapperUrl("https://news.google.com/rss/articles/ABC?oc=5"), true);
  assert.equal(isGoogleNewsWrapperUrl("https://news.google.com/articles/ABC"), true);
  for (const bad of [
    "http://news.google.com/rss/articles/ABC", // scheme must be https
    "https://news.google.com.attacker.example/rss/articles/ABC",
    "https://user:pass@news.google.com/rss/articles/ABC",
    "https://news.google.com:444/rss/articles/ABC",
    "https://www.news.google.com/rss/articles/ABC",
    "not a url",
  ]) {
    assert.equal(isGoogleNewsWrapperUrl(bad), false, bad);
  }
});

test("googleArticleId extracts the id from every article path shape", () => {
  assert.equal(googleArticleId(EMBEDDED_WRAPPER), EMBEDDED_ID);
  assert.equal(googleArticleId(`https://news.google.com/articles/${EMBEDDED_ID}`), EMBEDDED_ID);
  assert.equal(googleArticleId(`https://news.google.com/read/${EMBEDDED_ID}?hl=ar`), EMBEDDED_ID);
  assert.equal(googleArticleId("https://news.google.com/rss/search?q=football"), null, "a search feed is not an article");
  assert.equal(googleArticleId("https://example.com/rss/articles/ABC"), null);
});

/* ── 2 · local protobuf decode ─────────────────────────────────────────── */

test("old-format payloads decode locally, byte-exact", () => {
  assert.equal(decodeEmbeddedPublisherUrl(EMBEDDED_ID), "https://www.publisher-a.example/sport/story-1?rss=1");
  assert.equal(resolveGoogleWrapperLocally(EMBEDDED_WRAPPER), "https://www.publisher-a.example/sport/story-1?rss=1");
  // field order does not matter (URL first, varint later)
  const bytes = Buffer.from("https://publisher-b.example/x", "ascii");
  const payload = Buffer.concat([Buffer.from([0x22]), varint(bytes.length), bytes, Buffer.from([0x08, 0x13])]);
  assert.equal(decodeEmbeddedPublisherUrl(payload.toString("base64url")), "https://publisher-b.example/x");
});

test("non-embedding payloads and truncated payloads decode to NOTHING (never a half-URL)", () => {
  // New format (the AU_yqL family) carries no URL inside.
  assert.equal(resolveGoogleWrapperLocally("https://news.google.com/rss/articles/AU_yqLwhateverABC123"), null);
  // The truncated synthetic payload from scripts/verify-news.ts: a half-URL
  // must not leak out as a corrupt publisher link.
  assert.equal(
    resolveGoogleWrapperLocally("https://news.google.com/rss/articles/CBMiXWh0dHBzOi8vZXhhbXBsZS5jb20vYWxLWFsaXkvYWgueG1s0gEA"),
    null,
  );
  assert.equal(decodeEmbeddedPublisherUrl("!!!not-base64!!!"), null);
  assert.equal(decodeEmbeddedPublisherUrl(""), null);
});

test("resolvePublisherUrl decodes locally and NEVER performs a network request", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    throw new Error("No request permitted from resolvePublisherUrl");
  }) as typeof fetch;
  try {
    assert.equal(await resolvePublisherUrl(EMBEDDED_WRAPPER), "https://www.publisher-a.example/sport/story-1?rss=1");
    // A newer-format wrapper (no local payload) comes back unchanged — remote
    // decoding is the pipeline batch resolver's job, not this function's.
    assert.equal(
      await resolvePublisherUrl("https://news.google.com/rss/articles/AU_yqLwhateverABC123?oc=5"),
      "https://news.google.com/rss/articles/AU_yqLwhateverABC123?oc=5",
    );
    assert.equal(await resolvePublisherUrl("https://example.com/direct-story"), "https://example.com/direct-story");
    assert.equal(calls, 0, "zero fetch calls — the pinned anti-SSRF guarantee");
  } finally {
    globalThis.fetch = original;
  }
});

/* ── 3 · batchexecute protocol pieces ──────────────────────────────────── */

test("parseDecodingParams reads the signature and timestamp from the article page", () => {
  const html = `<html><body><c-wiz><div jscontroller="abc" data-n-a-sg=" SIG-abc123 " data-n-a-ts="1760000012"></div></c-wiz></body></html>`;
  assert.deepEqual(parseDecodingParams(html), { signature: "SIG-abc123", timestamp: "1760000012" });
  assert.equal(parseDecodingParams("<html><body>nothing here</body></html>"), null);
  assert.equal(parseDecodingParams(`<div data-n-a-ts="1760000012"></div>`), null, "timestamp alone is not enough");
});

test("buildBatchExecuteBody carries the Fbv4je envelope with id, timestamp and signature", () => {
  const body = buildBatchExecuteBody("ARTICLE-ID-1", "SIG-xyz", "1760000099");
  assert.ok(body.startsWith("f.req="));
  const envelope = JSON.parse(decodeURIComponent(body.slice("f.req=".length)));
  const [rpcId, payloadJson] = envelope[0][0];
  assert.equal(rpcId, "Fbv4je");
  const args = JSON.parse(payloadJson);
  assert.equal(args[0], "garturlreq");
  assert.equal(args[2], "ARTICLE-ID-1");
  assert.equal(args[3], 1760000099);
  assert.equal(args[4], "SIG-xyz");
});

test("parseBatchExecuteResponse extracts the URL and shrugs off junk", () => {
  const real =
    `)]}'\n\n` +
    JSON.stringify([
      ["wrb.fr", "Fbv4je", JSON.stringify(["garturlres", "https://www.kooora.example/match-report-9", null, null, null, 0]), null, "generic"],
      ["wrb.fr", "other", null, null, "generic"],
    ]);
  assert.equal(parseBatchExecuteResponse(real), "https://www.kooora.example/match-report-9");
  assert.equal(parseBatchExecuteResponse(")]}'\n\nnot json"), null);
  assert.equal(parseBatchExecuteResponse(JSON.stringify([["wrb.fr", "Fbv4je", JSON.stringify(["garturlres"])]])), null);
  assert.equal(parseBatchExecuteResponse(JSON.stringify([["other", "Fbv4je", JSON.stringify(["x", "https://a.example/b"])]])) , null);
});

/* ── 4 · decoded-target validation ─────────────────────────────────────── */

test("isAcceptablePublisherUrl: public hosts pass, private/credentialed targets are dropped", () => {
  for (const good of [
    "https://www.yallakora.com/story/1",
    "https://goal.com/en/news/x",
    "http://sports.example.co.uk/article",
  ]) assert.equal(isAcceptablePublisherUrl(good), true, good);
  for (const bad of [
    "ftp://publisher.example/x",
    "https://user:pass@www.publisher.example/x",
    "http://127.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.4/internal",
    "http://192.168.1.1/router",
    "http://172.16.0.5/intranet",
    "http://[::1]/x",
    "http://localhost/x",
    "http://intranet/x", // no public dot
    "http://secret.internal/x",
    "not a url at all",
  ]) assert.equal(isAcceptablePublisherUrl(bad), false, bad);
});

/* ── 5 · remote decode against a mock Google ───────────────────────────── */

let server: Server | null = null;
let googleBase = "";
const requestLog: { method: string; url: string; referer?: string }[] = [];
/** New-format ids the mock will honor, and the story each one decodes to. */
const REMOTE_MAP: Record<string, string> = {
  AUYqLremote0001: "https://www.publisher-c.example/football/ahly-wins-the-league",
  AUYqLremote0002: "https://sports.publisher-d.example/zamalek-squad-news",
};
let articlePagesDown = false;

async function mockGoogle(): Promise<string> {
  if (googleBase) return googleBase;
  const listening = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    requestLog.push({ method: req.method ?? "?", url: url.pathname + url.search, referer: req.headers.referer });
    const article = /^\/(?:rss\/)?articles\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    if (article) {
      const id = article[1]!;
      if (articlePagesDown || !REMOTE_MAP[id]) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("google exploded");
        return;
      }
      res.writeHead(302, { location: `/redirected/articles/${id}` });
      res.end();
      return;
    }
    const redirected = /^\/redirected\/articles\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    if (redirected) {
      // Same-host redirect: allowed; answers the page with decoding params.
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(
        `<html><head><title>Google News</title></head><body>` +
          `<c-wiz><div jscontroller="R" data-n-a-sg="SIG-${redirected[1]}" data-n-a-ts="1760000100"></div></c-wiz>` +
          `</body></html>`,
      );
      return;
    }
    if (url.pathname === "/_/DotsSplashUi/data/batchexecute" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const freq = new URLSearchParams(body).get("f.req") ?? "";
        let rows: string | null = null;
        try {
          const envelope = JSON.parse(freq);
          const [, payloadJson] = envelope[0][0];
          const args = JSON.parse(payloadJson);
          const id = args[2] as string;
          const target = REMOTE_MAP[id];
          rows = target ? JSON.stringify(["garturlres", target, null, null, null, 0]) : null;
        } catch {
          rows = null;
        }
        res.writeHead(rows ? 200 : 500, { "content-type": "text/plain" });
        res.end(rows ? `)]}'\n\n${JSON.stringify([["wrb.fr", "Fbv4je", rows, null, "generic"]])}` : "bad request");
      });
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("unknown endpoint");
  });
  server = listening;
  await new Promise<void>((resolve) => listening.listen(0, "127.0.0.1", resolve));
  const address = listening.address();
  const port = typeof address === "object" && address ? address.port : 0;
  googleBase = `http://127.0.0.1:${port}`;
  process.env.NEMO_NEWS_GOOGLE_BASE_URL = googleBase;
  listening.unref();
  return googleBase;
}

beforeEach(() => {
  clearGoogleNewsDecodeCache();
  requestLog.length = 0;
  articlePagesDown = false;
});

test("remote decode: new-format wrapper resolves via pinned host + same-host redirect only", async () => {
  await mockGoogle();
  const wrapper = "https://news.google.com/rss/articles/AUYqLremote0001?oc=5";
  const outcome = await decodeGoogleNewsUrl(wrapper);
  assert.equal(outcome.decoded, true);
  assert.equal(outcome.method, "remote");
  assert.equal(outcome.url, "https://www.publisher-c.example/football/ahly-wins-the-league");
  // article-page GET (302) → same-host GET (200) → one RPC POST, nothing else
  assert.equal(requestLog.length, 3);
  assert.equal(requestLog[0].method, "GET");
  assert.match(requestLog[0].url, /^\/rss\/articles\/AUYqLremote0001/);
  assert.match(requestLog[1].url, /^\/redirected\/articles\/AUYqLremote0001$/, "the in-host redirect is followed");
  assert.equal(requestLog[2].method, "POST");
  assert.match(requestLog[2].url, /^\/_\/DotsSplashUi\/data\/batchexecute\?rpcids=Fbv4je/);
  assert.ok((requestLog[2].referer ?? "").startsWith(googleBase), "the RPC referer stays on the pinned host");
});

test("remote decode is cached: a repeat resolution costs zero requests", async () => {
  await mockGoogle();
  clearGoogleNewsDecodeCache();
  requestLog.length = 0;
  const wrapper = "https://news.google.com/rss/articles/AUYqLremote0002";
  const first = await decodeGoogleNewsUrl(wrapper);
  assert.equal(first.decoded, true);
  const callsAfterFirst = requestLog.length;
  const second = await decodeGoogleNewsUrl(wrapper);
  assert.equal(second.decoded, true);
  assert.equal(second.url, first.url);
  assert.equal(requestLog.length, callsAfterFirst, "cache hit — no network");
});

test("a decode outage degrades to the wrapper link and never throws", async () => {
  await mockGoogle();
  articlePagesDown = true;
  const wrapper = "https://news.google.com/rss/articles/AUYqLremote0001";
  const outcome = await decodeGoogleNewsUrl(wrapper);
  assert.equal(outcome.decoded, false);
  assert.equal(outcome.url, wrapper, "the card keeps its Google link — ingestion is never broken");
  assert.ok(outcome.error, "the failure is recorded for observability");
});

test("a decoded target that is private is refused and dropped", async () => {
  await mockGoogle();
  REMOTE_MAP.AUYqLremoteEvil1 = "http://169.254.169.254/latest/meta-data";
  const wrapper = "https://news.google.com/rss/articles/AUYqLremoteEvil1";
  const outcome = await decodeGoogleNewsUrl(wrapper);
  assert.equal(outcome.decoded, false);
  assert.equal(outcome.url, wrapper);
  delete REMOTE_MAP.AUYqLremoteEvil1;
});

test("remote decode honors the kill switch and the local path ignores it", async () => {
  await mockGoogle();
  const prev = process.env.NEMO_NEWS_GOOGLE_DECODE;
  process.env.NEMO_NEWS_GOOGLE_DECODE = "0";
  try {
    const remoteOnly = await decodeGoogleNewsUrl("https://news.google.com/rss/articles/AUYqLremote0001");
    assert.equal(remoteOnly.decoded, false);
    assert.equal(requestLog.length, 0, "disabled decode performs no requests");
    const localOnly = await decodeGoogleNewsUrl(EMBEDDED_WRAPPER);
    assert.equal(localOnly.decoded, true, "LOCAL protobuf decode always works, switch or not");
    assert.equal(localOnly.method, "local");
  } finally {
    if (prev === undefined) delete process.env.NEMO_NEWS_GOOGLE_DECODE;
    else process.env.NEMO_NEWS_GOOGLE_DECODE = prev;
  }
});

/* ── 6 · the batch resolver the pipeline uses ──────────────────────────── */

test("batch resolution: local + remote + deferred + plain links, all bounded", async () => {
  await mockGoogle();
  const direct = "https://publisher-e.example/direct";
  const result = await resolveGoogleWrapperUrls(
    [EMBEDDED_WRAPPER, "https://news.google.com/rss/articles/AUYqLremote0001", "https://news.google.com/rss/articles/AUYqLmissing9", direct, EMBEDDED_WRAPPER],
    { concurrency: 2, maxItems: 10, budgetMs: 10_000 },
  );
  assert.equal(result.urls.has(direct), false, "non-wrapper links are untouched");
  assert.equal(result.urls.get(EMBEDDED_WRAPPER), "https://www.publisher-a.example/sport/story-1?rss=1");
  assert.equal(result.urls.get("https://news.google.com/rss/articles/AUYqLremote0001"), "https://www.publisher-c.example/football/ahly-wins-the-league");
  assert.equal(result.urls.get("https://news.google.com/rss/articles/AUYqLmissing9"), "https://news.google.com/rss/articles/AUYqLmissing9");
  assert.equal(result.stats.wrappers, 3, "deduped: the repeated wrapper counts once");
  assert.equal(result.stats.resolvedLocal, 1);
  assert.equal(result.stats.resolvedRemote, 1);
  assert.equal(result.stats.failed, 1);
  assert.equal(result.stats.deferred, 0);

  // The item cap defers overflow wrappers for a later run.
  const many = Array.from({ length: 5 }, (_, i) => `https://news.google.com/rss/articles/AUYqLremoteBulk${i}`);
  const capped = await resolveGoogleWrapperUrls(many, { maxItems: 2, concurrency: 2, budgetMs: 10_000 });
  assert.equal(capped.stats.deferred, 3);
  assert.equal(capped.urls.get("https://news.google.com/rss/articles/AUYqLremoteBulk4"), "https://news.google.com/rss/articles/AUYqLremoteBulk4");
});

after(() => {
  server?.close();
  delete process.env.NEMO_NEWS_GOOGLE_BASE_URL;
});
