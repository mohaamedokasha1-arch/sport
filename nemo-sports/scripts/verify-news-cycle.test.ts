/**
 * NEMO Sports · news ingestion end-to-end cycle.
 * ──────────────────────────────────────────────────────────────────────
 * FETCH → PARSE → NORMALIZE → VALIDATE → RELEVANCE → DEDUPLICATE →
 * CATEGORIZE → ENTITY-MATCH → STORE → PUBLISH → PUBLIC READ, then a RE-RUN.
 *
 * Why this exists: the scheduled job cannot be observed from a checkout (no
 * Postgres, no ingest secret), and news.google.com is not reachable from here.
 * So the cycle runs the PRODUCTION modules — same fetch, parsers, gates,
 * dedupe, store and read path — against a local Google-News-shaped feed whose
 * items are SYNTHETIC TEST DATA. Nothing here certifies the live publisher; it
 * certifies that the pipeline works end to end and that re-running it does not
 * duplicate. The same flow against durable Postgres (plus restart persistence)
 * is scripts/verify-news-ingestion.mjs, which needs a disposable database and a
 * started build, and is BLOCKED without one.
 *
 * Run: npm run news:cycle:test
 */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, test } from "node:test";
import { createSource, findByCanonicalUrl, listArticles, listSources } from "@/lib/news/store";
import { runSource } from "@/lib/news/pipeline";
import { getNewsFeed } from "@/lib/news/service";
import type { RSSSource } from "@/lib/news/types";

const HOUR = 3_600_000;
/** Feed timestamps are relative, so the date checks below never expire. */
const FEED_TIME = new Date(Date.now() - 2 * HOUR);
const PUBLISHER = "Goal.com";
const DEVELOPER = "IndexBox";

type FeedItem = { title: string; description: string; publisher: string; path: string };

const FEEDS: Record<string, FeedItem[]> = {
  "Al Ahly": [
    // A real story whose <description> is the aggregator's own anchor markup,
    // i.e. nothing but the headline again (production shape, captured 2026-10-12).
    {
      title: `Al Ahly beat Zamalek 2-1 in the Cairo derby - ${PUBLISHER}`,
      description: `<a href="https://www.goal.com/en/news/al-ahly-zamalek-derby?oc=5" target="_blank">Al Ahly beat Zamalek 2-1 in the Cairo derby&nbsp;&nbsp;<font color="#6f6f6f">${PUBLISHER}</font></a>`,
      publisher: PUBLISHER,
      path: "/derby",
    },
    // A real story with a real snippet.
    {
      title: `Zamalek confirm squad for the Confederation Cup trip - ${PUBLISHER}`,
      description: "Zamalek named their travelling squad for the CAF Confederation Cup group stage match in Alexandria on Friday.",
      publisher: PUBLISHER,
      path: "/squad",
    },
    // A namesake company: Al Ahly Sabbour is a property developer, not the club.
    {
      title: `Al Ahly Sabbour launches a residence in Oman - ${DEVELOPER}`,
      description: "The property developer announced a residential project overseas with two towers and a mall.",
      publisher: DEVELOPER,
      path: "/property",
    },
    // A feed item whose snippet is one character (seen in production).
    { title: `Breaking: Al Ahly signing - ${PUBLISHER}`, description: "N", publisher: PUBLISHER, path: "/noise" },
  ],
  // The same derby story, reached through a different query and a different
  // wrapper URL — the case URL-level dedup alone cannot catch.
  "Egyptian Premier League": [
    {
      title: `Al Ahly beat Zamalek 2-1 in the Cairo derby - ${PUBLISHER}`,
      description: "Al Ahly beat Zamalek 2-1 in the Cairo derby at the International Stadium with goals in each half.",
      publisher: PUBLISHER,
      path: "/derby-alt",
    },
  ],
};

/** Sources are created once; each test drives one stage of the cycle. */
let sources: Record<string, RSSSource> = {};
let server: Server | null = null;
let base = "";
let brokenIsDown = true;

function rssXml(query: string): string {
  const items = (FEEDS[query] ?? [])
    .map(
      (item, i) =>
        `<item><title>${item.title.replace(/&/g, "&amp;")}</title>` +
        `<link>${base}${item.path}</link>` +
        `<guid isPermaLink="false">${base}${item.path}#${i}</guid>` +
        `<pubDate>${FEED_TIME.toUTCString()}</pubDate>` +
        `<description>${item.description.replace(/&/g, "&amp;")}</description>` +
        `<source url="https://publisher.example">${item.publisher}</source></item>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>nemo mock</title>${items}</channel></rss>`;
}

async function feedServer(): Promise<string> {
  if (base) return base;
  const listening = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/__break") {
      brokenIsDown = url.searchParams.get("on") !== "0";
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }
    const query = url.searchParams.get("q") ?? "";
    if (query.includes("Broken") && brokenIsDown) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("upstream exploded");
      return;
    }
    res.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" });
    res.end(rssXml(query));
  });
  server = listening;
  await new Promise<void>((resolve) => listening.listen(0, "127.0.0.1", resolve));
  const address = listening.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  // The pipeline reads this per call, so setting it here still governs fetches.
  process.env.NEMO_NEWS_FEED_BASE_URL = `${base}/rss/search`;
  // Never keep the test process alive once the assertions are done.
  listening.unref();
  return base;
}

test("① sources: two working feeds and one that will fail", async () => {
  await feedServer();
  sources.ahly = await createSource({ query: "Al Ahly", language: "en", country: "EG", priority: 1, refreshInterval: 5 });
  sources.league = await createSource({
    query: "Egyptian Premier League",
    language: "en",
    country: "EG",
    priority: 2,
    refreshInterval: 5,
  });
  sources.broken = await createSource({ query: "Broken Feed", language: "en", country: "US", priority: 3, refreshInterval: 5 });
  // The store seeds the 15 authorized production sources; this test only owns
  // the three above, so every registry assertion below is per-id, not absolute.
  const registry = await listSources();
  for (const [key, source] of Object.entries(sources)) {
    const row = registry.find((s) => s.id === source.id);
    assert.ok(row, `${key} is registered`);
    assert.equal(row!.lastSuccessfulFetch, null, "a new source has never run — no invented history");
    assert.equal(row!.failureCount, 0, "and it has no failures either");
  }
});

test("② fetch → parse → validate → gate → store", async () => {
  const run = await runSource(sources.ahly, { force: true });
  assert.equal(run.ok, true, "the run itself succeeded");
  assert.equal(run.processed, 4, "every feed item was parsed, including the junk ones");
  assert.equal(run.inserted, 2, "one headline-only story + one story with a snippet");
  assert.equal(run.validationFailures, 2, "the property developer and the one-letter item never reach storage");
  assert.equal(run.parseErrors, 0);
  assert.ok(run.entityMatches >= 2, "clubs named in the stories were matched to canonical entities");

  const stored = await listArticles({ limit: 50, includeNonPublished: true });
  assert.equal(stored.total, 2);
  const titles = stored.items.map((a) => a.title).join(" | ");
  assert.ok(!/Sabbour|residence/i.test(titles), "the namesake company article was not stored");
});

test("③ stored text is reader-safe and dated by the publisher, not the fetch", async () => {
  const { items } = await listArticles({ limit: 50, includeNonPublished: true });
  const derby = items.find((a) => a.title.includes("Cairo derby"));
  const squad = items.find((a) => a.title.includes("Confederation Cup"));
  assert.ok(derby && squad, "both stories are in the archive");

  // The aggregator's markup and its publisher suffix must not survive.
  for (const article of [derby!, squad!]) {
    assert.ok(!article.description.includes("<"), `markup reached the card: ${article.description}`);
    assert.ok(!/&nbsp;|&amp;|&#\d+;/.test(article.description), `entities reached the card: ${article.description}`);
    assert.ok(!article.description.endsWith(PUBLISHER), "the publisher is on the badge, not glued to the text");
    assert.ok(!/^\p{L}$/u.test(article.description.trim()), "no single-letter snippet is published");
    assert.ok(article.title.length > 10, "a headline exists");
  }
  // A headline-only feed item stores NO invented snippet — an empty excerpt is
  // honest; the card then shows the headline alone.
  assert.equal(derby!.description, "");
  assert.ok(squad!.description.length > 80, "a real snippet is kept in full");

  // Original publication date vs ingestion time — two different fields.
  assert.ok(Math.abs(new Date(derby!.publicationDate).getTime() - FEED_TIME.getTime()) < 60_000, "publicationDate is the feed's pubDate");
  assert.ok(new Date(squad!.fetchedDate).getTime() - new Date(squad!.publicationDate).getTime() > HOUR, "fetchedDate is the run, ~2h later");
  assert.ok(derby!.category, "a category was assigned");
  assert.ok(derby!.sourceUrl.startsWith(base), "the card links to the publisher's own URL");
  assert.equal(derby!.sourceName, PUBLISHER, "attribution survives normalization");
  assert.equal(derby!.status, "hidden", "weak sports evidence parks the item for an editor instead of publishing it");
  assert.match(derby!.moderationReason ?? "", /^ingest:relevance:/, "the reason is recorded, not guessed");
  assert.equal(squad!.status, "published", "a story with real sports context is published automatically");
});

test("④ the same story from a second feed is not stored twice", async () => {
  const run = await runSource(sources.league, { force: true });
  assert.equal(run.processed, 1);
  assert.equal(run.inserted, 0, "a different URL for the same derby story must not create a record");
  assert.equal(run.duplicates, 1);
  assert.equal((await listArticles({ limit: 50, includeNonPublished: true })).total, 2);
});

test("⑤ a re-run of an unchanged feed adds nothing and removes nothing", async () => {
  const before = await listArticles({ limit: 50, includeNonPublished: true });
  const run = await runSource(sources.ahly, { force: true });
  assert.equal(run.inserted, 0, "re-running the job must not duplicate published news");
  assert.equal(run.duplicates, 2, "both stored items were recognised as already known");
  const after = await listArticles({ limit: 50, includeNonPublished: true });
  assert.equal(after.total, before.total);
  assert.ok(after.items.every((a) => before.items.some((b) => b.id === a.id)), "no record was replaced or dropped");
  const derby = before.items.find((a) => a.title.includes("Cairo derby"))!;
  // canonicalizeUrl() keeps host+path (no scheme, no port) as the dedup key.
  assert.match(derby.canonicalUrl, /127\.0\.0\.1\/derby$/, "the key is the publisher URL without its tracking noise");
  assert.ok(await findByCanonicalUrl(derby.canonicalUrl), "that key resolves back to the stored article");
});

test("⑥ a failing source fails alone, backs off, and recovers", async () => {
  const failed = await runSource(sources.broken, { force: true });
  assert.equal(failed.ok, false);
  assert.match(String(failed.error), /500/);
  const after = await listSources();
  const broken = after.find((s) => s.id === sources.broken.id)!;
  const healthy = after.find((s) => s.id === sources.ahly.id)!;
  assert.equal(broken.consecutiveFailures, 1, "the failure is counted on that source only");
  assert.ok(broken.nextEligibleFetch, "backoff is scheduled so the next run does not hammer it");
  assert.equal(healthy.consecutiveFailures, 0, "the working source is untouched");
  assert.equal((await listArticles({ limit: 50, includeNonPublished: true })).total, 2, "a failed fetch never wipes the archive");

  await fetch(`${base}/__break?on=0`);
  const recovered = await runSource(sources.broken, { force: true });
  assert.equal(recovered.ok, true, "the source resumes on its own once upstream answers");
  await fetch(`${base}/__break?on=1`);
});

test("⑦ the public read path reports the real cadence and only published items", async () => {
  const feed = await getNewsFeed({ limit: 24 });
  assert.equal(feed.items.length, 1, "the reader sees the published story, not the one held for review");
  assert.equal(feed.items[0].title.includes("Confederation Cup"), true);
  assert.ok(feed.lastUpdated, "lastUpdated is the newest successful source fetch");
  assert.ok(feed.freshness.sources.enabled >= 3, "every configured source is counted, enabled ones included");
  assert.notEqual(feed.freshness.state, "never", "a source that ran is not reported as never-fetched");
  assert.ok(feed.freshness.lastSuccessAt, "the newest success is a real timestamp");
  assert.ok(feed.categories.length >= 1, "categories are derived from the archive, not hardcoded");

  const editor = await getNewsFeed({ limit: 24, includeNonPublished: true });
  assert.equal(editor.total, 2, "the editor view reaches the held-back item as well");
});

test("⑧ the source registry shows the admin what actually happened", async () => {
  const ahly = (await listSources()).find((s) => s.id === sources.ahly.id)!;
  // articleCount is the PUBLISHED count per source: the item parked for editor
  // review is deliberately not counted as live news in the admin panel.
  assert.equal(ahly.articleCount, 1);
  assert.ok(ahly.lastSuccessfulFetch, "the last-success timestamp the admin panel shows exists");
  assert.notEqual(ahly.lastSuccessfulFetch, ahly.lastFailedFetch, "success and failure are separate fields");
  assert.equal(ahly.failureCount, 0);
  assert.equal(typeof ahly.etag, "object", "HTTP cache validators are stored for the next conditional fetch");
});

after(() => {
  server?.close();
});
