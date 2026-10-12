/**
 * News text quality: snippet sanitation, excerpt minimums and headlines.
 * ─────────────────────────────────────────────────────────────────────
 * Regression cover for what production /news and /api/v1/news were showing on
 * 2026-10-12:
 *
 *   · an article excerpt rendered as `<a href="https://news.google.com/rss/
 *     articles/CBMi3wF…?oc=5" t` — the feed's own anchor markup, because
 *     `cleanText` stripped tags BEFORE decoding entities and truncation cut the
 *     tag in half;
 *   · excerpts of «N», «A» and «Al Ahly - Aigle Noir 1-0  A» (attribute
 *     debris from a truncated `<font>`/`alt=`), i.e. items stored with no real
 *     snippet at all;
 *   · every headline carrying Google News' ` - Publisher` suffix, which repeats
 *     the source already shown on the same card.
 *
 * Run: npm run news:quality:test
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanText, publicExcerpt, displayHeadline, validateArticle, MIN_EXCERPT_CHARS } from "@/lib/news/normalize";
import { parseRss } from "@/lib/news/parse";

/** The truncated anchor Google News emits when the snippet is cut mid-tag. */
const PROD_TRUNCATED_ANCHOR =
  '<a href="https://news.google.com/rss/articles/CBMi3wFBVV95cUxNLW5pc0NmNlp4dGluaVZINy14U2NIbl95X3JNZ05OZ0V4Zlc5NUxham8tVXdteVVzMm5yRmIwWENvVGx1aVkxQkY0ZXhXQ1RGbk9wVFBJZTNVM2VQemdRZHNPcnl2N3JNMDFQZ1hxelRBOEVDTHhIYWdveGFxVE8tS05NSmZPdUsySVRWcWU1YVZrYzlqb0k0WkF4VHJaRWdpYkF5TzVXcmJNY2lUZklaWHV5WWVZSUp3OF8wZXhKZXdHeDBGWHgyZkM3SjZPVG01UXNKMWdKU1BnSnk5NEhz?oc=5" t';

test("cleanText: markup is gone whichever order it arrives in", () => {
  assert.equal(cleanText("<b>A</b> &amp; B"), "A & B");
  // escaped first, then literal — the order that used to leave the anchor behind
  assert.equal(cleanText("&lt;p&gt;Zizo scores&lt;/p&gt;"), "Zizo scores");
  assert.equal(cleanText("&amp;lt;script&amp;gt;x&amp;lt;/script&amp;gt;"), "x");
  assert.equal(cleanText("<a href=\"https://example.com/x\">Headline</a>"), "Headline");
  assert.equal(cleanText("<!-- comment --> after"), "after");
  assert.equal(cleanText("Line\u00a0\u00a0break"), "Line break");
});

test("cleanText: an unterminated tag from a length cut cannot survive", () => {
  const cleaned = cleanText(PROD_TRUNCATED_ANCHOR);
  assert.ok(!cleaned.includes("<"), "no markup brackets in a stored/displayed snippet");
  assert.ok(!cleaned.includes("news.google.com/rss/articles"), "the wrapper URL is not content");
  // Real text after the debris is kept.
  assert.equal(cleanText(`${PROD_TRUNCATED_ANCHOR}>Afsha suffers minor calf pain</a>`), "Afsha suffers minor calf pain");
});

test("cleanText: a comparison sign in ordinary copy is not markup", () => {
  assert.equal(cleanText("الأهلي يتفوق 5 < 7 في الأهداف"), "الأهلي يتفوق 5 < 7 في الأهداف");
  assert.equal(cleanText("x < y > z"), "x < y > z");
});

test("publicExcerpt: attribute debris is dropped, a real snippet is kept", () => {
  assert.equal(publicExcerpt("N"), "");
  assert.equal(publicExcerpt("A"), "");
  assert.equal(publicExcerpt("قصير جدا", { title: "عنوان خبر طويل بما يكفي للظهور" }), "");
  // the stored snippet was the headline echoed with one stray attribute char
  assert.equal(publicExcerpt("Al Ahly - Aigle Noir 1-0  A", { title: "Al Ahly - Aigle Noir 1-0 - Flashscore.com", sourceName: "Flashscore.com" }), "");
  assert.equal(publicExcerpt(null), "");
  assert.equal(publicExcerpt(PROD_TRUNCATED_ANCHOR), "");
  const sentence = "Mostafa Ibrahim Awad scored the opener before half time at the Cairo International Stadium";
  assert.equal(publicExcerpt(sentence), sentence);
  assert.ok(MIN_EXCERPT_CHARS >= 12, "an excerpt must carry a sentence, not a word");
});

test("publicExcerpt: a snippet that only repeats the publisher is no excerpt", () => {
  assert.equal(publicExcerpt("Goal.com", { sourceName: "Goal.com" }), "");
  assert.equal(publicExcerpt("  الهدف الأول للدقائق  \n 12  ", { sourceName: "Goal.com", title: "خبر آخر مختلف تمامًا تمامًا" }), "الهدف الأول للدقائق 12");
});

test("displayHeadline: strips the aggregator suffix only when it is the source", () => {
  assert.equal(
    displayHeadline("Al Ahly crushes Petrol Asyut 5-0, while Zamalek falls to Zed (video) - صوت الإمارات", "صوت الإمارات"),
    "Al Ahly crushes Petrol Asyut 5-0, while Zamalek falls to Zed (video)",
  );
  assert.equal(displayHeadline("Mahrez to sign for Al Ahly - Goal.com", "Goal.com"), "Mahrez to sign for Al Ahly");
  assert.equal(displayHeadline("Transfermarkt news - ESPN", "ESPN"), "Transfermarkt news");
  // A headline that legitimately ends in a dash keeps its own words.
  assert.equal(displayHeadline("Al Ahly - Zamalek: the derby preview", "Goal.com"), "Al Ahly - Zamalek: the derby preview");
  assert.equal(displayHeadline("No suffix here", ""), "No suffix here");
  assert.equal(displayHeadline("", ""), "");
});

test("parseRss: a Google News item yields clean fields, never markup", () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>f</title>
    <item>
      <title><![CDATA[Zamalek beat Al Ahly 2-1 - Goal.com]]></title>
      <link>https://news.google.com/rss/articles/ABC123?oc=5</link>
      <guid isPermaLink="false">ABC123</guid>
      <pubDate>Sun, 11 Oct 2026 21:56:56 GMT</pubDate>
      <source url="https://www.goal.com">Goal.com</source>
      <description><![CDATA[<a href="https://news.google.com/rss/articles/ABC123?oc=5" target="_blank">Zamalek beat Al Ahly 2-1</a>&nbsp;&nbsp;<font color="#6f6f6f">Goal.com</font>]]></description>
    </item></channel></rss>`;
  const report = parseRss(xml, "f");
  assert.equal(report.items.length, 1);
  const item = report.items[0];
  assert.ok(!item.description.includes("<"), "the snippet carries no tags");
  assert.ok(!item.description.includes("news.google.com"), "the wrapper link is not shown as text");
  assert.equal(item.title, "Zamalek beat Al Ahly 2-1 - Goal.com");
  assert.equal(item.sourceName, "Goal.com");
  // the feed's description is only the headline + publisher → no real excerpt
  assert.equal(publicExcerpt(item.description, { sourceName: item.sourceName ?? "", title: item.title }), "");
  // the parser keeps the cleaned feed text; the EXCERPT policy is applied by the
  // pipeline and by every read, so the card shows no wrapper debris at all.
  assert.equal(item.description, "Zamalek beat Al Ahly 2-1 Goal.com");
});

test("validateArticle: an item without a snippet is still publishable, a short title is not", () => {
  const fresh = new Date().toISOString();
  assert.equal(validateArticle({ title: "Zamalek beat Al Ahly 2-1 in the Cairo derby", sourceUrl: "https://goal.com/x", publicationDate: fresh }).valid, true);
  assert.equal(validateArticle({ title: "Hi", sourceUrl: "https://goal.com/x", publicationDate: fresh }).valid, false);
  assert.equal(validateArticle({ title: "Real headline about the derby", sourceUrl: "not a url", publicationDate: fresh }).valid, false);
  // Old news never returns as new.
  assert.equal(validateArticle({ title: "An older but honest headline", sourceUrl: "https://goal.com/y", publicationDate: "2020-01-01T00:00:00.000Z" }).valid, false);
});
