/**
 * Regression tests — broadcast/stream link policy (priority 4).
 * New links are judged strictly at save time; links already stored keep
 * displaying (no record is hidden or deleted) and are flagged for review.
 * Offline, in-memory only. Run: npm run stream-policy:test
 */
import test from "node:test";
import assert from "node:assert/strict";

if (process.env.DATABASE_URL) throw new Error("Offline regression tests refuse a configured database");
process.env.NEMO_TEST_MEMORY_ONLY = "1";
process.env.NEMO_STREAM_DOMAIN_POLICY = "open";

import {
  validateEmbedUrl,
  isDisplayableEmbedUrl,
  needsReview,
  isPubliclyVisible,
  createLiveStream,
  type MatchStreamSource,
} from "@/lib/match-streams";
import { validateBroadcastLink } from "@/lib/broadcasts";
import { isIpLiteral } from "@/lib/stream-policy";

const STRICT_REJECTS = [
  "https://203.0.113.10/embed/match-1", // public IP literal
  "https://[2001:db8::1]/embed/match-1", // IPv6 literal
  "https://tv/embed/match-1", // single-label host
  "https://bit.ly/3abcdef", // shortener hides the destination
  "https://t.co/xyz",
  "https://sub.tinyurl.com/x",
];

const STILL_ACCEPTED = [
  "https://www.youtube.com/embed/dQw4w9WgXcQ",
  "https://www.onsport.tv/live/match-1",
  "https://cdn.my-rights-holder.example/embed/match-7",
];

test("new links: IP literals, single-label hosts and shorteners are refused at save time", () => {
  for (const url of STRICT_REJECTS) {
    const check = validateEmbedUrl(url);
    assert.equal(check.ok, false, `save must refuse ${url}`);
    assert.ok(check.reason.length > 0, "the refusal has an Arabic reason");
  }
});

test("new links: ordinary https domains are still accepted (open policy unchanged)", () => {
  for (const url of STILL_ACCEPTED) assert.equal(validateEmbedUrl(url).ok, true, url);
});

test("the strict rules are not applied to the public display path", () => {
  assert.equal(isDisplayableEmbedUrl("https://bit.ly/3abcdef"), true, "stored shortener link keeps displaying");
  assert.equal(isDisplayableEmbedUrl("https://203.0.113.10/embed/1"), true, "stored IP link keeps displaying");
  assert.equal(isDisplayableEmbedUrl("https://tv/embed/1"), true, "stored single-label link keeps displaying");
  assert.equal(needsReview("https://bit.ly/3abcdef"), true, "…and is flagged for admin review");
  assert.equal(needsReview("https://www.youtube.com/embed/dQw4w9WgXcQ"), false);
});

test("unsafe links stay refused everywhere, including display", () => {
  for (const url of ["http://www.youtube.com/embed/1", "https://127.0.0.1/embed/1", "https://stream.internal/e", "javascript:alert(1)", "https://user:pass@youtube.com/e"]) {
    assert.equal(isDisplayableEmbedUrl(url), false, `display must refuse ${url}`);
    assert.equal(validateEmbedUrl(url).ok, false, `save must refuse ${url}`);
  }
});

test("a stored record with a legacy URL is still publicly visible", () => {
  const base = { enabled: true, status: "live", embedUrl: "https://bit.ly/3abcdef" } as unknown as MatchStreamSource;
  assert.equal(isPubliclyVisible(base), true, "display path keeps the record");
  assert.equal(isPubliclyVisible({ ...base, enabled: false } as MatchStreamSource), false, "disabled stays hidden");
  assert.equal(isPubliclyVisible({ ...base, status: "draft" } as unknown as MatchStreamSource), false, "draft stays hidden");
});

test("the save path refuses a new shortener link (nothing is written)", async () => {
  const r = await createLiveStream({ matchSlug: "stream-policy-test-match", homeName: "A", awayName: "B", embedUrl: "https://bit.ly/3abcdef" });
  assert.equal(r.ok, false);
});

test("broadcaster list filter keeps approved entries that were saved before the rule", () => {
  assert.equal(validateBroadcastLink("https://bit.ly/x", { strict: false }).ok, true);
  assert.equal(validateBroadcastLink("https://bit.ly/x").ok, false);
});

test("isIpLiteral recognises IPv4 and IPv6 literals only", () => {
  assert.equal(isIpLiteral("203.0.113.10"), true);
  assert.equal(isIpLiteral("[2001:db8::1]"), true);
  assert.equal(isIpLiteral("example.com"), false);
});
