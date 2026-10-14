/**
 * NEMO Sports · news ingestion WITH Google-News redirect resolution — E2E cycle.
 * ─────────────────────────────────────────────────────────────────────────────
 * The production chain (fetch → parse → RESOLVE REDIRECTS → normalize → gate →
 * dedup → store → public read) against a local server that is BOTH the RSS
 * endpoint and a Google News mock (article pages + batchexecute). All feed
 * items are SYNTHETIC TEST DATA; the wire shapes mirror production.
 *
 * What this certifies:
 *   1. a wrapper link is stored as the ORIGINAL publisher URL — title, source
 *      attribution and excerpt rules unchanged;
 *   2. the SAME story reaching us under a DIFFERENT wrapper id (another query)
 *      deduplicates on the publisher canonical URL — the exact production win
 *      ("different queries duplicated one story" is gone);
 *   3. when decoding is unavailable the wrapper link is kept and ingestion
 *      continues — no failure mode drops news or crashes the job.
 *
 * Run: npm run news:google-cycle:test
 */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, test } from "node:test";

if (process.env.DATABASE_URL) throw new Error("Offline cycle tests refuse a configured database");
process.env.NEMO_TEST_MEMORY_ONLY = "1";

import { createSource, findByCanonicalUrl, listArticles } from "@/lib/news/store";
import { ingestAllSources, runSource } from "@/lib/news/pipeline";
import { getNewsFeed } from "@/lib/news/service";
import { clearGoogleNewsDecodeCache } from "@/lib/news/google-news";
import type { RSSSource } from "@/lib/news/types";

const HOUR = 3_600_000;
const FEED_TIME = new Date(Date.now() - 2 * HOUR);
const PUBLISHER = "Goal.com";

/* Old-format protobuf payload id embedding a publisher URL (local decode). */
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
function embedPublisherUrl(publisherUrl: string): string {
  const bytes = Buffer.from(publisherUrl, "ascii");
  return Buffer.concat([Buffer.from([0x08, 0x13, 0x22]), varint(bytes.length), bytes, Buffer.from([0xd2, 0x01, 0x00])]).toString("base64url");
}

/** The derby story, embedded locally (old format), with tracking noise. */
const DERBY_URL = "https://www.publisher-a.example/football/al-ahly-beat-zamalek-derby-report?utm_campaign=rss";
const DERBY_WRAPPER_ID = embedPublisherUrl(DERBY_URL);
/** The SAME story from another query — remote-format id, decodes to the clean URL. */
const DERBY_CLEAN_URL = "https://publisher-a.example/football/al-ahly-beat-zamalek-derby-report";
const DERBY_REMOTE_ID = "AUYqLderbyStory01";
/** A second real story that only remote decoding can reach. */
const SQUAD_URL = "https://sports.publisher-d.example/zamalek-name-caf-squad";
const SQUAD_REMOTE_ID = "AUYqLsquadStory022";

const REMOTE_MAP: Record<string, string> = {
  [DERBY_REMOTE_ID]: DERBY_CLEAN_URL,
  [SQUAD_REMOTE_ID]: SQUAD_URL,
};

function wrapper(id: string): string {
  return `https://news.google.com/rss/articles/${id}?oc=5`;
}

let googleArticlePagesDown = false;

function rssXml(query: string): string {
  const items: string[] = [];
  if (query === "Wrapped Derby Feed") {
    items.push(
      // locally decodable wrapper; description is the aggregator's own anchor
      `<item><title>Al Ahly beat Zamalek 2-1 in the football Cairo derby - ${PUBLISHER}</title>` +
        `<link>${wrapper(DERBY_WRAPPER_ID)}</link>` +
        `<guid isPermaLink="false">${DERBY_WRAPPER_ID}</guid>` +
        `<pubDate>${FEED_TIME.toUTCString()}</pubDate>` +
        `<description>&lt;a href="${wrapper(DERBY_WRAPPER_ID)}"&gt;Al Ahly beat Zamalek 2-1 in the football Cairo derby&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font&gt;${PUBLISHER}&lt;/font&gt;</description>` +
        `<source url="https://www.goal.com">${PUBLISHER}</source></item>`,
    );
  }
  if (query === "Wrapped Second Query") {
    items.push(
      // SAME derby story, remote-format wrapper id — the cross-query duplicate
      `<item><title>Al Ahly beat Zamalek 2-1 in the football Cairo derby - ${PUBLISHER}</title>` +
        `<link>${wrapper(DERBY_REMOTE_ID)}</link>` +
        `<guid isPermaLink="false">${DERBY_REMOTE_ID}</guid>` +
        `<pubDate>${FEED_TIME.toUTCString()}</pubDate>` +
        `<description>Derby report duplicate under a different wrapper.</description>` +
        `<source url="https://www.goal.com">${PUBLISHER}</source></item>`,
      // A genuinely new squad story (remote decode), with a real snippet
      `<item><title>Zamalek name squad for the football Confederation Cup tie - ${PUBLISHER}</title>` +
        `<link>${wrapper(SQUAD_REMOTE_ID)}</link>` +
        `<guid isPermaLink="false">${SQUAD_REMOTE_ID}</guid>` +
        `<pubDate>${FEED_TIME.toUTCString()}</pubDate>` +
        `<description>Zamalek announced a 23-man squad on Thursday evening for the Confederation Cup group trip to Alexandria this week.</description>` +
        `<source url="https://www.goal.com">${PUBLISHER}</source></item>`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>nemo wrapped mock</title>${items.join("")}</channel></rss>`;
}

let server: Server | null = null;
let base = "";
const googleHits: string[] = [];

async function harness(): Promise<string> {
  if (base) return base;
  const listening = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/rss/search") {
      res.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" });
      res.end(rssXml(url.searchParams.get("q") ?? ""));
      return;
    }
    const article = /^\/rss\/articles\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
    if (article) {
      googleHits.push(`article:${article[1]}`);
      if (googleArticlePagesDown || !REMOTE_MAP[article[1]!]) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end("google exploded");
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<html><body><c-wiz><div jscontroller="R" data-n-a-sg="SIG-${article[1]}" data-n-a-ts="1760000100"></div></c-wiz></body></html>`);
      return;
    }
    if (url.pathname === "/_/DotsSplashUi/data/batchexecute" && req.method === "POST") {
      googleHits.push("rpc");
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        let rows: string | null = null;
        try {
          const envelope = JSON.parse(new URLSearchParams(body).get("f.req") ?? "");
          const args = JSON.parse(envelope[0][0][1]);
          const target = REMOTE_MAP[args[2] as string];
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
    res.end("unknown");
  });
  server = listening;
  await new Promise<void>((resolve) => listening.listen(0, "127.0.0.1", resolve));
  const address = listening.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  process.env.NEMO_NEWS_FEED_BASE_URL = `${base}/rss/search`;
  process.env.NEMO_NEWS_GOOGLE_BASE_URL = base;
  listening.unref();
  return base;
}

let sources: Record<string, RSSSource> = {};

test("① the derby wrapper is stored as the ORIGINAL publisher article", async () => {
  await harness();
  clearGoogleNewsDecodeCache();
  sources.derby = await createSource({ query: "Wrapped Derby Feed", language: "en", country: "EG", priority: 1, refreshInterval: 5 });
  const run = await runSource(sources.derby, { force: true });
  assert.equal(run.ok, true, run.error);
  assert.equal(run.inserted, 1);
  assert.equal(run.decodedUrls, 1, "the wrapper was resolved locally before storage");

  const { items } = await listArticles({ limit: 20, includeNonPublished: true });
  assert.equal(items.length, 1);
  const derby = items[0]!;
  assert.equal(derby.sourceUrl, DERBY_URL, "the card links straight to the publisher — no redirect chain");
  assert.equal(derby.sourceDomain, "publisher-a.example", "the attribution domain is the publisher, not news.google.com");
  assert.ok(!derby.sourceUrl.includes("news.google.com"));
  assert.equal(derby.sourceName, PUBLISHER);
  assert.equal(derby.status, "published", "real football news is published, not parked");
  assert.equal(derby.canonicalUrl, "publisher-a.example/football/al-ahly-beat-zamalek-derby-report", "tracking params stripped from the dedup key");
  assert.equal(googleHits.length, 0, "LOCAL decode cost zero Google requests");
});

test("② a new query repeating the story under a NEW wrapper dedups on the publisher URL", async () => {
  sources.second = await createSource({ query: "Wrapped Second Query", language: "en", country: "EG", priority: 2, refreshInterval: 5 });
  const run = await runSource(sources.second, { force: true });
  assert.equal(run.ok, true, run.error);
  assert.equal(run.processed, 2);
  assert.equal(run.inserted, 1, "only the genuinely new squad story is added");
  assert.equal(run.duplicates, 1, "the SAME derby story is one record, whichever wrapper carried it");
  assert.equal(run.decodedUrls, 2, "both remote wrappers were resolved");

  const { items } = await listArticles({ limit: 20, includeNonPublished: true });
  assert.equal(items.length, 2, "two stories total, not three");
  const squad = items.find((a) => a.title.includes("Confederation Cup"))!;
  assert.equal(squad.sourceUrl, SQUAD_URL);
  assert.equal(squad.sourceDomain, "sports.publisher-d.example");
  assert.equal(squad.status, "published");
  assert.ok(squad.description.length > 40, "the real snippet survives normalization");

  // The derby record kept its first-seen identity; a lookup under EITHER the
  // publisher canonical or the second wrapper was already answered as a dup.
  assert.ok(await findByCanonicalUrl("publisher-a.example/football/al-ahly-beat-zamalek-derby-report"));
  assert.ok(googleHits.includes("rpc"), "the remote exchange really happened for the new-format ids");
});

test("③ a decode outage keeps the wrapper link and ingestion completes", async () => {
  clearGoogleNewsDecodeCache();
  googleArticlePagesDown = true;
  try {
    const run = await runSource(sources.second, { force: true });
    assert.equal(run.ok, true, run.error);
    // The squad story is already known under its publisher URL; the outage run
    // re-derives the wrapper identity for both items and dedups CROSS-IDENTITY:
    // the title-similarity window now spans news.google.com + the publisher domain.
    assert.equal(run.inserted, 0, "an outage must not duplicate already-stored stories");
    assert.equal(run.duplicates, 2);
    assert.equal(run.decodedUrls, 0, "nothing decoded while Google is down");
  } finally {
    googleArticlePagesDown = false;
  }

  const { items } = await listArticles({ limit: 20, includeNonPublished: true });
  assert.equal(items.length, 2, "the archive is unchanged by the failed run");
});

test("④ the aggregate job reports wrapper resolutions and the public card links to publishers", async () => {
  clearGoogleNewsDecodeCache();
  const stats = await ingestAllSources({ force: true, sourceIds: [sources.derby.id, sources.second.id] });
  assert.equal(stats.inserted, 0, "re-running the whole job adds nothing");
  assert.ok(stats.duplicatesRemoved >= 3, "every item was recognised as known");
  assert.ok(stats.decodedPublisherUrls >= 3, `reported resolutions: ${stats.decodedPublisherUrls}`);

  const feed = await getNewsFeed({ limit: 10 });
  assert.equal(feed.items.length, 2, "both stories are published");
  for (const item of feed.items) {
    assert.ok(!item.sourceUrl.includes("news.google.com"), `readers never see a redirect chain: ${item.sourceUrl}`);
    assert.ok(item.title.length > 10);
    assert.ok(item.sourceName === PUBLISHER);
  }
});

after(() => {
  server?.close();
  delete process.env.NEMO_NEWS_FEED_BASE_URL;
  delete process.env.NEMO_NEWS_GOOGLE_BASE_URL;
});
