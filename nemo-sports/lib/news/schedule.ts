/**
 * NEMO Sports · the news scheduler cadence (pure)
 * ───────────────────────────────────────────────
 * Production (2026-10-11): the per-source target intervals are 30–120 minutes
 * and the freshness rule flagged a source stale after 2 × its interval
 * (60–240 min), but the only scheduler this deployment runs is the Vercel cron
 * in vercel.json — ONCE A DAY (Vercel Hobby rejects anything more frequent).
 * Even with ingestion working, the public feed would be "possibly stale" for
 * ~22 hours of every day. The three numbers were incompatible.
 *
 * Rule now: a source's effective cadence is the SLOWER of its own target
 * interval and the cadence at which the scheduler actually runs. The stale
 * threshold derives from that (lib/news/freshness.ts), so it is always
 * reachable when the scheduler works and still trips after a missed run.
 *
 * An operator who adds an external scheduler (docs/NEWS_SCHEDULING.md — e.g.
 * every 15 minutes with the Bearer token) declares its cadence with
 * NEMO_NEWS_SCHEDULER_INTERVAL_MINUTES, and the thresholds tighten with it.
 * The value is a declaration, not a guarantee; the public freshness metadata
 * still reports the last SUCCESSFUL run, so a wrong declaration shows up as
 * "stale", never as a false "fresh".
 */
import { NEWS_CRON_DESCRIPTION_AR, NEWS_CRON_DESCRIPTION_EN, NEWS_CRON_SCHEDULE_UTC } from "./sources";

/**
 * Minutes between runs for the simple cron shapes this project ships.
 * Returns null for anything it cannot reason about (the caller then falls
 * back to a daily cadence, the most conservative assumption).
 */
export function cronIntervalMinutes(expr: string): number | null {
  const parts = String(expr ?? "").trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, mon, dow] = parts;
  const any = (v: string) => v === "*";
  const step = (v: string) => {
    const m = v.match(/^\*\/(\d+)$/);
    return m ? Number(m[1]) : null;
  };
  const fixed = (v: string) => /^\d+$/.test(v);
  if (!any(dom) || !any(mon) || !any(dow)) return null; // weekly/monthly shapes: not used here
  if (step(min) && any(hour)) return step(min);
  if (fixed(min) && any(hour)) return 60;
  if (fixed(min) && step(hour)) return step(hour)! * 60;
  if (fixed(min) && fixed(hour)) return 24 * 60;
  return null;
}

export interface SchedulerCadence {
  minutes: number;
  /** "vercel-cron": derived from vercel.json; "external": operator-declared. */
  source: "vercel-cron" | "external";
  descriptionAr: string;
  /** English wording for the same cadence (locale-selected at render time). */
  descriptionEn: string;
}

const MIN_EXTERNAL = 5;
const MAX_EXTERNAL = 24 * 60;

export function schedulerCadence(env: Record<string, string | undefined> = process.env): SchedulerCadence {
  const declared = Number(env.NEMO_NEWS_SCHEDULER_INTERVAL_MINUTES);
  if (Number.isInteger(declared) && declared >= MIN_EXTERNAL && declared <= MAX_EXTERNAL) {
    return {
      minutes: declared,
      source: "external",
      descriptionAr: `كل ${declared} دقيقة عبر مُجدول خارجي مُعلَن`,
      descriptionEn: `every ${declared} minutes via a declared external scheduler`,
    };
  }
  return {
    minutes: cronIntervalMinutes(NEWS_CRON_SCHEDULE_UTC) ?? 24 * 60,
    source: "vercel-cron",
    descriptionAr: NEWS_CRON_DESCRIPTION_AR,
    descriptionEn: NEWS_CRON_DESCRIPTION_EN,
  };
}

/** A source's effective cadence: never faster than the scheduler can deliver. */
export function effectiveIntervalMinutes(sourceInterval: number, cadence: Pick<SchedulerCadence, "minutes">): number {
  const own = Number.isFinite(sourceInterval) && sourceInterval > 0 ? sourceInterval : 0;
  return Math.max(own, cadence.minutes);
}
