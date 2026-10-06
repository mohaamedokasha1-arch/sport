/**
 * NEMO Sports · zero-dependency RSS/Atom parser
 * ─────────────────────────────────────────────
 * Deliberately no `rss-parser` dependency: one less supply-chain/licence
 * surface, and Google News RSS is a small, stable subset of RSS 2.0.
 * Handles malformed feeds gracefully — a bad item never kills the batch.
 */

import type { RawRssItem } from "./types";
import { cleanText } from "./normalize";

function firstTag(xml: string, names: string[]): string | null {
  for (const name of names) {
    // CDATA first
    const cdata = new RegExp(`<${name}(?:\\s[^>]*)?>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${name}>`, "i");
    const cm = xml.match(cdata);
    if (cm?.[1] != null) return cm[1].trim();
    // plain
    const plain = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
    const pm = xml.match(plain);
    if (pm?.[1] != null) return pm[1].trim();
  }
  return null;
}

function allTags(xml: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const v = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
    if (v) out.push(v);
  }
  return out;
}

/** Atom <link href="…"/> or <link>…</link> */
function atomLink(entry: string): string | null {
  const href = entry.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (href?.[1]) return href[1].trim();
  return firstTag(entry, ["link"]);
}

/** Google News <source url="…">Name</source> */
function rssSource(item: string): { name: string | null; url: string | null } {
  const m = item.match(/<source[^>]*url=["']([^"']+)["'][^>]*>([\s\S]*?)<\/source>/i);
  if (m) return { name: m[2].trim() || null, url: m[1].trim() || null };
  const plain = firstTag(item, ["source"]);
  return { name: plain, url: null };
}

export interface ParseReport {
  items: RawRssItem[];
  /** items skipped for missing title/link */
  skipped: number;
  errors: string[];
}

export function parseRss(xml: string, feedTitle = ""): ParseReport {
  const errors: string[] = [];
  const items: RawRssItem[] = [];
  let skipped = 0;

  if (!xml || xml.length < 50) {
    return { items, skipped: 0, errors: ["empty response body"] };
  }

  // RSS 2.0 <item> or Atom <entry>
  const blocks: { body: string; atom: boolean }[] = [];
  const itemRe = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) blocks.push({ body: m[1], atom: false });
  if (blocks.length === 0) {
    const entryRe = /<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi;
    while ((m = entryRe.exec(xml)) !== null) blocks.push({ body: m[1], atom: true });
  }
  if (blocks.length === 0) {
    return { items, skipped: 0, errors: ["no <item> or <entry> elements found"] };
  }

  for (const { body, atom } of blocks) {
    try {
      const title = firstTag(body, ["title"]);
      const link = atom ? atomLink(body) : firstTag(body, ["link", "guid"]);
      if (!title || !link) {
        skipped++;
        continue;
      }
      const description =
        firstTag(body, ["description", "summary", "content", "content:encoded"]) ?? "";
      const pubDate = firstTag(body, ["pubDate", "published", "updated", "dc:date"]);
      const guid = firstTag(body, ["guid", "id"]);
      const { name: sourceName } = rssSource(body);
      const categories = allTags(body, "category").slice(0, 8);

      items.push({
        title: cleanText(title).slice(0, 300),
        link: link.trim().slice(0, 2000),
        pubDate: pubDate?.trim() ?? null,
        description: cleanText(description).slice(0, 600),
        sourceName: sourceName ? cleanText(sourceName).slice(0, 120) : feedTitle || null,
        guid: guid?.trim().slice(0, 500) ?? null,
        categories: categories.map((c) => cleanText(c).slice(0, 80)),
      });
    } catch (e) {
      skipped++;
      if (errors.length < 5) errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return { items, skipped, errors };
}
