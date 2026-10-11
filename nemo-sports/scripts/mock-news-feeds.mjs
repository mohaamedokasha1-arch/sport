#!/usr/bin/env node
/**
 * Google-News-shaped RSS mock — end-to-end harness for authorized ingestion.
 * ─────────────────────────────────────────────────────────────────────────
 * The sandbox/CI cannot reach news.google.com. Point the app at this server
 * with NEMO_NEWS_FEED_BASE_URL=http://127.0.0.1:<port>/rss/search and run the
 * real cron route (Bearer token) against a real Postgres to verify:
 * authorization, durable persistence, success vs failure timestamps, the
 * relevance gate on NEW items and quarantine of ALREADY-published ones.
 *
 *   node scripts/mock-news-feeds.mjs [port]          (default 7799)
 *   GET /__control?fail=Boxing     the "Boxing" source answers HTTP 500
 *   GET /__control?fail=           no failures
 *
 * Items reproduce the production false positives of 2026-10-11 (a property
 * developer and a university investment sharing the Al Ahly name) next to
 * genuine sports stories.
 */
import { createServer } from "node:http";

const failing = new Set();
let hits = 0;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toUTCString();

/** Stories per query; links are unique per story so dedup is deterministic. */
const STORIES = {
  "Al Ahly": [
    ["Al Ahly Sabbour Launches Zaha Residence in Sultan Haitham City, Oman - IndexBox", "Al Ahly Sabbour unveils a residential project", "IndexBox", "https://www.indexbox.io/blog/al-ahly-sabbour-zaha-residence/"],
    ["El Sewedy sells 40% of CIRA's Damietta university venture - Billionaires.Africa", "Al Ahly Sabbour and El Sewedy Education", "Billionaires.Africa", "https://billionaires.africa/el-sewedy-cira-damietta-university/"],
    ["Al Ahly beat Zamalek 2-1 in the Egyptian Premier League derby - Goal.com", "Al Ahly won the Cairo derby in the Egyptian Premier League", "Goal.com", "https://www.goal.com/en/news/al-ahly-zamalek-derby-egyptian-premier-league/abc"],
    ["Veszprém dominate Al Ahly once again with final in sight - IHF", "Handball: Veszprém beat Al Ahly at the IHF Super Globe", "IHF", "https://www.ihf.info/media-center/news/veszprem-al-ahly"],
  ],
  "Egyptian Premier League": [
    ["Pyramids FC go top of the Egyptian Premier League after win over Ismaily - KingFut", "Egyptian Premier League roundup", "KingFut", "https://www.kingfut.com/2026/10/10/pyramids-top-egyptian-premier-league/"],
  ],
  Zamalek: [
    ["Zamalek coach confirms squad for CAF Confederation Cup trip - Ahram Online", "Zamalek football squad news", "Ahram Online", "https://english.ahram.org.eg/News/zamalek-squad-caf.aspx"],
  ],
  Boxing: [["Boxing: Usyk confirms next title defence date - BBC Sport", "Boxing news", "BBC Sport", "https://www.bbc.com/sport/boxing/usyk-next-defence"]],
};

function rss(query) {
  const items = (STORIES[query] ?? []).map(([title, description, source, link], i) => `
    <item>
      <title>${esc(title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">${esc(link)}</guid>
      <pubDate>${hoursAgo(2 + i)}</pubDate>
      <description>${esc(description)}</description>
      <source url="${esc(new URL(link).origin)}">${esc(source)}</source>
    </item>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>"${esc(query)}" - Google News</title><link>https://news.google.com</link><description>mock</description>${items}</channel></rss>`;
}

const server = createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname === "/__control") {
    failing.clear();
    for (const q of (u.searchParams.get("fail") ?? "").split(",").map((s) => s.trim()).filter(Boolean)) failing.add(q);
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true, failing: [...failing], hits }));
  }
  if (u.pathname !== "/rss/search") {
    res.writeHead(404);
    return res.end("not found");
  }
  hits++;
  const q = u.searchParams.get("q") ?? "";
  if (failing.has(q)) {
    res.writeHead(500, { "content-type": "text/plain" });
    return res.end("simulated upstream failure");
  }
  res.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" });
  res.end(rss(q));
});

const port = Number(process.argv[2] ?? 7799);
server.listen(port, "127.0.0.1", () => console.log(`[mock-news] http://127.0.0.1:${port}/rss/search (control: /__control?fail=Boxing)`));
