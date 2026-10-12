/**
 * NEMO Sports · Pipeline · robots.txt
 * ───────────────────────────────────
 * §2 of the brief: automated collection is only ever allowed when it respects
 * robots.txt. This module answers one question — "may we fetch this path?" —
 * and answers "no" by default when anything is unclear (missing file, parse
 * problem, explicit Disallow).
 *
 * Implemented subset: group selection by user-agent token (exact prefix match,
 * then `*`), `Allow`/`Disallow` with `*` and `$` wildcards, longest-match wins
 * with Allow breaking ties, and `Crawl-delay`. Unknown directives are ignored;
 * unknown wildcards are treated literally rather than optimistically.
 */

export type RobotsGroup = {
  agents: string[];
  allow: string[];
  disallow: string[];
  crawlDelaySeconds: number | null;
};

export type RobotsFile = {
  groups: RobotsGroup[];
  sitemaps: string[];
  /** true when the file was fetched and parsed (404 = "no restrictions") */
  present: boolean;
};

export const EMPTY_ROBOTS: RobotsFile = { groups: [], sitemaps: [], present: false };

export function parseRobots(text: string): RobotsFile {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let expectingAgents = true;

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!current || !expectingAgents) {
        current = { agents: [], allow: [], disallow: [], crawlDelaySeconds: null };
        groups.push(current);
        expectingAgents = true;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (field === "sitemap") {
      sitemaps.push(value);
      continue;
    }
    if (!current) continue;
    expectingAgents = false;
    if (field === "disallow") {
      if (value !== "") current.disallow.push(value);
      continue;
    }
    if (field === "allow") {
      if (value !== "") current.allow.push(value);
      continue;
    }
    if (field === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) current.crawlDelaySeconds = n;
    }
  }

  return { groups, sitemaps, present: true };
}

/** Select the most specific group for a UA token (`*` only when nothing else matches). */
export function selectGroup(robots: RobotsFile, userAgentToken: string): RobotsGroup | null {
  const token = userAgentToken.toLowerCase();
  let best: RobotsGroup | null = null;
  let bestLength = -1;
  for (const group of robots.groups) {
    for (const agent of group.agents) {
      if (agent === "*") continue;
      if (token.startsWith(agent) && agent.length > bestLength) {
        best = group;
        bestLength = agent.length;
      }
    }
  }
  if (best) return best;
  return robots.groups.find((g) => g.agents.includes("*")) ?? null;
}

/** Turn a robots path pattern (wildcards and an optional trailing $) into a matcher. */
function matches(pattern: string, path: string): number | null {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[\\s\\S]*");
  const anchored = pattern.endsWith("$");
  const body = anchored ? escaped.replace(/\\\$$/, "") : escaped;
  const re = new RegExp(`^${body}${anchored ? "$" : ""}`);
  const found = re.exec(path);
  return found ? found[0].length : null;
}

export type RobotsDecision = {
  allowed: boolean;
  rule: "allow" | "disallow" | "no-rule" | "no-file";
  crawlDelaySeconds: number | null;
};

/**
 * Decide whether a path may be fetched.
 * `no-file` = robots.txt is missing/unreadable for this host, which is NOT a
 * permission slip: callers treat it as "allowed" only because the operator
 * enabled the source explicitly; the audit trail records the distinction.
 */
export function robotsDecision(robots: RobotsFile, path: string, userAgentToken: string): RobotsDecision {
  if (!robots.present) return { allowed: true, rule: "no-file", crawlDelaySeconds: null };
  const group = selectGroup(robots, userAgentToken);
  if (!group) return { allowed: true, rule: "no-rule", crawlDelaySeconds: null };

  let chosen: { allow: boolean; length: number } | null = null;
  for (const rule of group.allow) {
    const length = matches(rule, path);
    if (length !== null && (!chosen || length > chosen.length || (length === chosen.length && !chosen.allow))) {
      chosen = { allow: true, length };
    }
  }
  for (const rule of group.disallow) {
    const length = matches(rule, path);
    if (length !== null && (!chosen || length > chosen.length)) chosen = { allow: false, length };
  }

  if (!chosen) return { allowed: true, rule: "no-rule", crawlDelaySeconds: group.crawlDelaySeconds };
  return { allowed: chosen.allow, rule: chosen.allow ? "allow" : "disallow", crawlDelaySeconds: group.crawlDelaySeconds };
}
