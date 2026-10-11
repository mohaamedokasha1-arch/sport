/**
 * NEMO Sports · relevance moderation of already-published news
 * ─────────────────────────────────────────────────────────────
 * The ingestion gate (lib/news/relevance.ts) only protects NEW articles.
 * Records ingested before it existed stayed published — production showed a
 * property-developer launch and a university investment under «الكرة المصرية».
 *
 * This pass re-reads published articles with the current rules and:
 *   · QUARANTINES only clear non-sports content (commercial vocabulary or a
 *     namesake company with no sports signal at all) — status → hidden, with
 *     reason, moderator, time and previous status recorded; nothing is deleted
 *     and an editor can restore it from /admin/news;
 *   · REPORTS (never changes) weaker cases — score pages, profile pages, items
 *     with only weak sports context — for an editor to decide.
 *
 * Runs at the end of every authorized ingestion job (cron/admin), and on
 * demand with `npm run news:moderate` (dry run unless `--apply`).
 * Disable the automatic pass with NEMO_NEWS_AUTO_MODERATION=0.
 */
import { listArticles, quarantineArticle } from "./store";
import { shouldAutoQuarantine, sportsRelevanceDetail, type RelevanceReason, type RelevanceVerdict } from "./relevance";
import type { NewsArticle } from "./types";

/** Version tag written as the moderator of automatic decisions. */
export const AUTO_MODERATOR = "auto:relevance-2026-10-11";

export interface ModerationItem {
  id: string;
  title: string;
  category: string;
  verdict: RelevanceVerdict;
  reason: RelevanceReason;
}

export interface ModerationPlan {
  scanned: number;
  /** clear non-sports content: will be quarantined */
  quarantine: ModerationItem[];
  /** weaker signals: reported for an editor, never changed automatically */
  review: ModerationItem[];
}

/** Pure: decide, without writing anything. Only published articles are considered. */
export function planModeration(articles: NewsArticle[]): ModerationPlan {
  const plan: ModerationPlan = { scanned: 0, quarantine: [], review: [] };
  for (const a of articles) {
    if (a.status !== "published") continue;
    plan.scanned++;
    const detail = sportsRelevanceDetail(a.title, a.description);
    const item: ModerationItem = { id: a.id, title: a.title, category: a.category, verdict: detail.verdict, reason: detail.reason };
    if (shouldAutoQuarantine(detail)) plan.quarantine.push(item);
    else if (detail.verdict !== "publish") plan.review.push(item);
  }
  return plan;
}

async function loadPublished(limit: number): Promise<NewsArticle[]> {
  const all: NewsArticle[] = [];
  for (let offset = 0; all.length < limit; offset += 100) {
    const page = await listArticles({ limit: Math.min(100, limit - all.length), offset });
    all.push(...page.items);
    if (page.items.length === 0 || all.length >= page.total) break;
  }
  return all;
}

/** Plan (and optionally apply) moderation over the most recent published articles. */
export async function moderatePublished(opts: { apply: boolean; by?: string; limit?: number }): Promise<ModerationPlan & { applied: number }> {
  const plan = planModeration(await loadPublished(Math.max(1, opts.limit ?? 500)));
  let applied = 0;
  if (opts.apply) {
    for (const item of plan.quarantine) {
      const ok = await quarantineArticle(item.id, { reason: `auto:relevance:${item.reason}`, by: opts.by ?? AUTO_MODERATOR });
      if (ok) applied++;
    }
  }
  return { ...plan, applied };
}

export function autoModerationEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NEMO_NEWS_AUTO_MODERATION !== "0";
}
