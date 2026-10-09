/**
 * NEMO Sports · news pipeline verification (offline, no network).
 * Exercises parse → normalize → dedup → categorize → entities → store
 * against a canned Google-News-style RSS fixture.
 *
 * Run: npx tsx scripts/verify-news.ts
 */
import { parseRss } from "../lib/news/parse";
import {
  canonicalizeUrl,
  cleanText,
  extractDomain,
  fingerprint,
  toIsoDate,
  validateArticle,
} from "../lib/news/normalize";
import { checkDuplicate, textSimilarity } from "../lib/news/dedup";
import { categorizeArticle } from "../lib/news/categorize";
import { matchEntities } from "../lib/news/entities";
import { newsEntityHref } from "../lib/news/entity-links";
import { requiredAttributions } from "../lib/providers";
import { buildFeedUrl } from "../lib/news/sources";
import { validateBroadcastLink } from "../lib/broadcasts";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  console.log(`  ${cond ? "✓" : "✗"} ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Al Ahly - Google News</title>
<item>
  <title><![CDATA[Al Ahly Win Historic CAF Champions League Victory]]></title>
  <link>https://news.google.com/articles/CBMiXWh0dHBzOi8vZXhhbXBsZS5jb20vYWxLWFsaXkvYWgueG1s0gEA?utm_source=news&amp;utm_medium=rss</link>
  <guid>https://news.google.com/articles/CBMiXWh0dHBzOi8vZXhhbXBsZS5jb20vYWxLWFsaXkvYWgueG1s0gEA</guid>
  <pubDate>Tue, 06 Oct 2026 18:30:00 GMT</pubDate>
  <description><![CDATA[Al Ahly secured a famous victory in the CAF Champions League final.]]></description>
  <source url="https://example.com">ESPN Arabia</source>
</item>
<item>
  <title>Mohamed Salah scores again for Liverpool in Premier League</title>
  <link>https://example.com/salah-scores?utm_source=rss&amp;fbclid=abc123</link>
  <pubDate>Tue, 06 Oct 2026 17:00:00 GMT</pubDate>
  <description>Liverpool winger Mohamed Salah scored the winner against Chelsea.</description>
  <source url="https://example.com">BBC Sport</source>
</item>
<item><title>Broken item without link</title></item>
</channel></rss>`;

async function main() {
  console.log("\nnews pipeline verification (offline)\n");

  // feed URL builder
  assert(
    "feed URL",
    buildFeedUrl("Al Ahly", "en", "EG") ===
      "https://news.google.com/rss/search?q=Al%20Ahly&hl=en&gl=EG&ceid=EG:en",
  );

  // parse
  const parsed = parseRss(FIXTURE, "Al Ahly");
  assert("parse: 2 items", parsed.items.length === 2, `${parsed.items.length} items`);
  assert("parse: 1 skipped (no link)", parsed.skipped === 1);
  assert("parse: source extracted", parsed.items[0]?.sourceName === "ESPN Arabia");

  // normalize
  assert("cleanText strips tags+entities", cleanText("<b>A</b> &amp; B") === "A & B");
  assert(
    "canonicalizeUrl strips tracking",
    canonicalizeUrl("https://WWW.Example.com/salah-scores/?utm_source=rss&fbclid=x&page=2") ===
      "example.com/salah-scores?page=2",
  );
  assert("canonicalizeUrl rejects non-http", canonicalizeUrl("ftp://x.com/a") === null);
  assert("extractDomain", extractDomain("https://www.BBC.com/sport") === "bbc.com");
  assert("toIsoDate", toIsoDate("Tue, 06 Oct 2026 18:30:00 GMT") === "2026-10-06T18:30:00.000Z");
  assert("fingerprint stable", fingerprint("a", "B") === fingerprint("a", "b"));
  const v = validateArticle({ title: "Al Ahly Win Historic CAF Champions League Victory", sourceUrl: "https://example.com/x", publicationDate: new Date().toISOString() });
  assert("validateArticle accepts fresh", v.valid);
  assert(
    "validateArticle rejects future",
    !validateArticle({ title: "A perfectly fine long headline here", sourceUrl: "https://example.com/x", publicationDate: "2999-01-01T00:00:00.000Z" }).valid,
  );

  // dedup
  assert("similarity identical = 100", textSimilarity("Al Ahly wins final", "Al Ahly wins final") === 100);
  assert("similarity near-dup high", textSimilarity("Al Ahly wins the final", "Al Ahly win final") > 60);
  assert("similarity unrelated low", textSimilarity("Al Ahly wins final", "Tennis results today") < 40);
  const base = {
    sourceUrl: "https://example.com/a",
    canonicalUrl: "example.com/a",
    title: "Al Ahly Win Historic CAF Champions League Victory",
    description: "Al Ahly secured a famous victory in the CAF Champions League final.",
    sourceDomain: "example.com",
    publicationDate: "2026-10-06T18:30:00.000Z",
  };
  assert("dedup: exact URL", checkDuplicate(base, { ...base }).isDuplicate);
  assert(
    "dedup: canonical URL (tracking differs)",
    checkDuplicate({ ...base, sourceUrl: "https://example.com/a?utm_source=x" }, base).isDuplicate,
  );
  assert(
    "dedup: title near-dup same source+date",
    checkDuplicate({ ...base, sourceUrl: "https://example.com/b", canonicalUrl: "example.com/b", title: "Al Ahly Wins Historic CAF Champions League Victory!" }, base).isDuplicate,
  );
  assert(
    "dedup: different story not dup",
    !checkDuplicate({ ...base, sourceUrl: "https://other.com/z", canonicalUrl: "other.com/z", title: "NBA midseason power rankings released", description: "Basketball analysts rank the deepest rosters at the halfway point.", sourceDomain: "other.com" }, base).isDuplicate,
  );

  // categorize
  const c1 = categorizeArticle("Al Ahly Win Historic CAF Champions League Victory", "Egyptian club achieves continental victory");
  assert("categorize: Egyptian/CAF article", c1.primary === "Egyptian Football" || c1.primary === "CAF Champions League", c1.primary);
  const c2 = categorizeArticle("NBA midseason power rankings released", "basketball court dunk hoop analysis");
  assert("categorize: NBA → Basketball", c2.primary === "Basketball", c2.primary);
  const c3 = categorizeArticle("Something entirely unrelated happened", "no sports keywords whatsoever xyzzy");
  assert("categorize: fallback Sports", c3.primary === "Sports", c3.primary);

  // entities
  const e1 = matchEntities("Al Ahly Win Historic CAF Champions League Victory", "Egyptian club");
  assert("entities: Al Ahly team", e1.some((e) => e.type === "team" && e.internalId === "al-ahly"), JSON.stringify(e1.map((e) => e.internalId)));
  assert("entities: CAF competition", e1.some((e) => e.type === "competition" && e.internalId === "caf-champions-league"));
  const e2 = matchEntities("Mohamed Salah scores again for Liverpool", "Premier League winger");
  assert("entities: Salah player", e2.some((e) => e.type === "player" && e.internalId === "mohamed-salah"));
  assert("entities: Liverpool team", e2.some((e) => e.type === "team" && e.internalId === "liverpool"));
  assert("entities: no false positives", matchEntities("Tennis results today", "atp wta serve").every((e) => e.confidence > 75));
  const eplEntities = matchEntities("EPL coverage begins today", "");
  assert("entities: EPL resolves to the English Premier League", eplEntities.some((e) => e.type === "competition" && e.internalId === "premier-league"));
  assert("entities: EPL is not mislabeled as the Egyptian League", !eplEntities.some((e) => e.type === "competition" && e.internalId === "egyptian-league"));

  // Only destinations with a real route or an explicitly marked preview page are clickable.
  const originalDemoFlag = process.env.NEXT_PUBLIC_DEMO_CONTENT;
  const originalSdlMode = process.env.NEMO_SDL_MODE;
  const originalSportScoreSetting = process.env.NEMO_SPORTSCORE_ENABLED;
  process.env.NEMO_SDL_MODE = "auto";
  process.env.NEMO_SPORTSCORE_ENABLED = "1";
  delete process.env.NEXT_PUBLIC_DEMO_CONTENT;
  assert("entity links: unverified real team/player ids stay labels", newsEntityHref({ type: "team", internalId: "al-ahly", displayName: "الأهلي", extractedName: "Al Ahly", confidence: 90, foundIn: "title" }) === null && newsEntityHref({ type: "player", internalId: "erling-haaland", displayName: "هالاند", extractedName: "Haaland", confidence: 90, foundIn: "title" }) === null);
  assert("entity links: supported real competition uses canonical route", newsEntityHref({ type: "competition", internalId: "premier-league", displayName: "الدوري الإنجليزي", extractedName: "Premier League", confidence: 90, foundIn: "title" }) === "/competitions/premier-league");
  assert("entity links: unsupported real competition stays a label", newsEntityHref({ type: "competition", internalId: "egyptian-cup", displayName: "كأس مصر", extractedName: "Egyptian Cup", confidence: 90, foundIn: "title" }) === null);
  assert("entity links: verified Egyptian Premier League uses its existing path", newsEntityHref({ type: "competition", internalId: "egyptian-league", displayName: "الدوري المصري", extractedName: "Egyptian League", confidence: 90, foundIn: "title" }) === "/competitions/egyptian-league");
  process.env.NEXT_PUBLIC_DEMO_CONTENT = "1";
  assert("entity links: demo entities use marked preview pages", newsEntityHref({ type: "team", internalId: "al-ahly", displayName: "الأهلي", extractedName: "Al Ahly", confidence: 90, foundIn: "title" }) === "/teams/al-ahly");
  assert("entity links: demo preview does not claim sports data providers", !requiredAttributions().some((provider) => provider.name === "SportScore" || provider.name === "Football-Data.org"));
  for (const [key, value] of [["NEXT_PUBLIC_DEMO_CONTENT", originalDemoFlag], ["NEMO_SDL_MODE", originalSdlMode], ["NEMO_SPORTSCORE_ENABLED", originalSportScoreSetting]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  // broadcasts
  assert("broadcast: official ok", validateBroadcastLink("https://www.onsport.tv/live").ok);
  // Default policy is `open`: any https host an operator enters is accepted.
  assert("broadcast: open policy accepts an unlisted host", validateBroadcastLink("https://buffstream.xyz/match").ok);
  // The curated mode is still available and still rejects it.
  assert("broadcast: allowlist policy rejects an unlisted host", !validateBroadcastLink("https://buffstream.xyz/match", { policy: "allowlist" }).ok);
  assert("broadcast: http rejected", !validateBroadcastLink("http://www.onsport.tv/live").ok);

  console.log(failures === 0 ? "\n✅ NEWS PIPELINE — ALL CHECKS PASSED\n" : `\n❌ ${failures} CHECK(S) FAILED\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
