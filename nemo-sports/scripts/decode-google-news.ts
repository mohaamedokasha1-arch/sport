/**
 * NEMO Sports · decode one or more Google News wrapper links (operator CLI).
 * ─────────────────────────────────────────────────────────────────────────
 *   npm run news:decode -- "https://news.google.com/rss/articles/<id>?oc=5" [more urls…]
 *
 * Prints, per link: the decode method (local protobuf / remote exchange), the
 * resolved publisher URL or the kept wrapper, and the error note on failure.
 * Network access goes ONLY to the pinned Google host (or the configured
 * NEMO_NEWS_GOOGLE_BASE_URL mock/proxy) — same security posture as ingestion.
 */
import { decodeGoogleNewsUrl, clearGoogleNewsDecodeCache, googleNewsBaseUrl } from "../lib/news/google-news";
import { isGoogleNewsWrapper } from "../lib/news/normalize";

async function main() {
  const urls = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (urls.length === 0) {
    console.error("usage: npm run news:decode -- <google-news-wrapper-url> [more urls]");
    process.exit(2);
  }
  clearGoogleNewsDecodeCache();
  console.log(`decode target host: ${googleNewsBaseUrl()}\n`);
  let failures = 0;
  for (const url of urls) {
    if (!isGoogleNewsWrapper(url)) {
      console.log(`✗ not a Google News wrapper link: ${url}`);
      failures++;
      continue;
    }
    const outcome = await decodeGoogleNewsUrl(url);
    if (outcome.decoded) {
      console.log(`✓ ${url}\n  → ${outcome.url}   [${outcome.method}]`);
    } else {
      console.log(`✗ could not decode (wrapper kept): ${url}${outcome.error ? `\n  reason: ${outcome.error}` : ""}`);
      failures++;
    }
  }
  process.exit(failures === 0 ? 0 : 1);
}

main();
