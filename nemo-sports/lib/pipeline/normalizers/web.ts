/**
 * NEMO Sports · Pipeline · HTML extraction helpers
 * ────────────────────────────────────────────────
 * The priority-1 sources (EPL, EFA, FIFA) are websites. Until an official
 * documented API exists for them, a licensed reading of their published pages
 * is the only path — so this module implements the *standard, boring* parts of
 * that: table extraction, anchor extraction, and schema.org JSON-LD extraction.
 *
 * Why JSON-LD first: most league sites embed `SportsEvent` / `SportsTeam`
 * objects for search engines. Reading those is both more stable than scraping
 * CSS classes and closer to "use the structured data the site publishes".
 *
 * No dependency is added for this: the repository ships zero HTML parsers by
 * design, and the extractors below are covered by offline tests.
 *
 * Nothing here fetches anything; it only reads a string that the caller already
 * obtained through the robots-aware HTTP client.
 */

import { rec, text } from "./util";

export type HtmlTable = { caption: string | null; headers: string[]; rows: string[][]; index: number };

const TABLE_RE = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
const ROW_RE = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const CELL_RE = /<(t[hd])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const CAPTION_RE = /<caption\b[^>]*>([\s\S]*?)<\/caption>/i;

/** All `<table>`s with their header row inferred from `<th>` cells. */
export function extractTables(html: string): HtmlTable[] {
  const tables: HtmlTable[] = [];
  let tableIndex = 0;
  for (const tableMatch of html.matchAll(TABLE_RE)) {
    const body = tableMatch[1] ?? "";
    const caption = text(body.match(CAPTION_RE)?.[1] ?? null);
    const rows: string[][] = [];
    let headerRowIndex = -1;

    for (const rowMatch of body.matchAll(ROW_RE)) {
      const rowHtml = rowMatch[1] ?? "";
      const cells: string[] = [];
      let sawHeader = false;
      for (const cellMatch of rowHtml.matchAll(CELL_RE)) {
        const isHeader = (cellMatch[1] ?? "").toLowerCase() === "th";
        if (isHeader) sawHeader = true;
        cells.push(text(cellMatch[3]) ?? "");
      }
      if (cells.length === 0) continue;
      if (sawHeader && headerRowIndex < 0) headerRowIndex = rows.length;
      rows.push(cells);
    }

    const headers = headerRowIndex >= 0 ? rows[headerRowIndex]! : [];
    const dataRows = headerRowIndex >= 0 ? rows.slice(headerRowIndex + 1) : rows;
    tables.push({ caption, headers, rows: dataRows, index: tableIndex });
    tableIndex += 1;
  }
  return tables;
}

export type Anchor = { href: string; label: string };

export function extractAnchors(html: string, baseUrl: string): Anchor[] {
  const out: Anchor[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1] ?? "";
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
    let absolute: string;
    try {
      absolute = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    out.push({ href: absolute, label: text(match[2]) ?? "" });
  }
  return out;
}

/** Every `application/ld+json` block, parsed; malformed blocks are dropped. */
export function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = (match[1] ?? "").trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      /* a broken JSON-LD block is ignored, not fatal */
    }
  }
  return out;
}

export type JsonLdSportsEvent = {
  name: string | null;
  startDate: string | null;
  homeName: string | null;
  awayName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
  status: string | null;
};

const typeOf = (node: unknown): string => {
  const t = rec(node)?.["@type"];
  if (Array.isArray(t)) return t.map(String).join(",");
  return typeof t === "string" ? t : "";
};

const nameOf = (node: unknown): string | null => {
  const r = rec(node);
  if (!r) return null;
  const name = r.name;
  return typeof name === "string" && name.trim() !== "" ? name.trim() : null;
};

/** `SportsEvent` entries, including those nested inside an `ItemList`. */
export function findJsonLdSportsEvents(html: string): JsonLdSportsEvent[] {
  const out: JsonLdSportsEvent[] = [];
  const visit = (node: unknown, depth = 0): void => {
    if (depth > 4) return;
    if (Array.isArray(node)) {
      node.forEach((n) => visit(n, depth + 1));
      return;
    }
    const r = rec(node);
    if (!r) return;
    if (/sportsevent/i.test(typeOf(r))) {
      const competitors = Array.isArray(r.competitor) ? r.competitor : [];
      const home = r.homeTeam ?? competitors[0];
      const away = r.awayTeam ?? competitors[1];
      out.push({
        name: nameOf(r),
        startDate: typeof r.startDate === "string" ? r.startDate : null,
        homeName: nameOf(home),
        awayName: nameOf(away),
        homeScore: scoreOf(home),
        awayScore: scoreOf(away),
        venue: nameOf(r.location),
        status: typeof r.eventStatus === "string" ? r.eventStatus : null,
      });
    }
    for (const value of Object.values(r)) visit(value, depth + 1);
  };
  for (const block of extractJsonLd(html)) visit(block);
  return out;
}

function scoreOf(node: unknown): number | null {
  const r = rec(node);
  if (!r) return null;
  const raw = r.score ?? r.result ?? null;
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const n = Number(String(raw).replace(/[^0-9-]/g, ""));
  return Number.isFinite(n) && String(raw).replace(/[^0-9-]/g, "") !== "" ? n : null;
}

/** `12/09/2025`, `2025-09-12`, `12-09-2025` → ISO date (UTC midnight) or null. */
export function parseDateCell(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`;
  const dmy = value.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (dmy) {
    const day = dmy[1]!.padStart(2, "0");
    const month = dmy[2]!.padStart(2, "0");
    const year = dmy[3]!.length === 2 ? `20${dmy[3]}` : dmy[3]!;
    return `${year}-${month}-${day}T00:00:00Z`;
  }
  const long = value.match(/(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{4})/);
  if (long) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const month = months.indexOf(long[2]!.slice(0, 3).toLowerCase());
    if (month >= 0) return `${long[3]}-${String(month + 1).padStart(2, "0")}-${long[1]!.padStart(2, "0")}T00:00:00Z`;
  }
  return null;
}

/** `2 - 1`, `2–1`, `2:1` → [2, 1] */
export function parseScoreCell(raw: string | null): [number, number] | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})\s*[-–:xX]\s*(\d{1,2})/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}
