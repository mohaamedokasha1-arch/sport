/**
 * SDL · Provider rate limit management (§3.8)
 * Counters live in the shared KvStore so horizontally-scaled SDL instances
 * share one budget instead of each thinking it owns the whole quota.
 */

import type { KvStore } from "./cache";
import type { ProviderName } from "./types";

export type RateLimitConfig = {
  provider: ProviderName;
  perSecond: number | null;
  perMinute: number | null;
  perHour: number | null;
  perDay: number | null;
  perMonth: number | null;
  concurrency: number | null;
  /** start throttling at this fraction of a window budget (default 0.85) */
  throttleAt: number;
};

export type WindowUsage = { window: "second" | "minute" | "hour" | "day" | "month"; used: number; limit: number; ratio: number };

export type RateLimitVerdict =
  | { allowed: true; reason: "ok"; usage: WindowUsage[] }
  | { allowed: false; reason: "exhausted" | "concurrency"; usage: WindowUsage[]; retryAfterSeconds: number };

const WINDOWS: { key: WindowUsage["window"]; seconds: number }[] = [
  { key: "second", seconds: 1 },
  { key: "minute", seconds: 60 },
  { key: "hour", seconds: 3600 },
  { key: "day", seconds: 86_400 },
  { key: "month", seconds: 2_592_000 },
];

export class RateLimiter {
  private inflight = new Map<ProviderName, number>();

  constructor(
    private store: KvStore,
    private configs: Map<ProviderName, RateLimitConfig>,
  ) {}

  setConfig(cfg: RateLimitConfig): void {
    this.configs.set(cfg.provider, cfg);
  }

  config(provider: ProviderName): RateLimitConfig | undefined {
    return this.configs.get(provider);
  }

  private key(provider: ProviderName, window: string, bucket: number) {
    return `sdl:rl:${provider}:${window}:${bucket}`;
  }

  private async read(provider: ProviderName): Promise<WindowUsage[]> {
    const cfg = this.configs.get(provider);
    if (!cfg) return [];
    const now = Math.floor(Date.now() / 1000);
    const out: WindowUsage[] = [];
    for (const w of WINDOWS) {
      const limit = cfg[w.key === "second" ? "perSecond" : w.key === "minute" ? "perMinute" : w.key === "hour" ? "perHour" : w.key === "day" ? "perDay" : "perMonth"];
      if (!limit) continue;
      const bucket = Math.floor(now / w.seconds);
      const used = Number((await this.store.get<number>(this.key(provider, w.key, bucket)))?.value ?? 0);
      out.push({ window: w.key, used, limit, ratio: used / limit });
    }
    return out;
  }

  /** Call before every provider request. Never throws. */
  async check(provider: ProviderName): Promise<RateLimitVerdict> {
    const cfg = this.configs.get(provider);
    const usage = await this.read(provider);
    if (!cfg) return { allowed: true, reason: "ok", usage };

    if (cfg.concurrency) {
      const live = this.inflight.get(provider) ?? 0;
      if (live >= cfg.concurrency) {
        return { allowed: false, reason: "concurrency", usage, retryAfterSeconds: 1 };
      }
    }

    for (const u of usage) {
      if (u.used >= u.limit) {
        const w = WINDOWS.find((x) => x.key === u.window)!;
        const now = Math.floor(Date.now() / 1000);
        const bucket = Math.floor(now / w.seconds);
        return {
          allowed: false,
          reason: "exhausted",
          usage,
          retryAfterSeconds: Math.max(1, (bucket + 1) * w.seconds - now),
        };
      }
    }
    return { allowed: true, reason: "ok", usage };
  }

  /** True when usage passed the throttle threshold — polling frequency drops. */
  async shouldThrottle(provider: ProviderName): Promise<boolean> {
    const cfg = this.configs.get(provider);
    if (!cfg) return false;
    const usage = await this.read(provider);
    return usage.some((u) => u.ratio >= cfg.throttleAt);
  }

  /** Record one completed request against every configured window. */
  async record(provider: ProviderName): Promise<void> {
    const cfg = this.configs.get(provider);
    if (!cfg) return;
    const now = Math.floor(Date.now() / 1000);
    for (const w of WINDOWS) {
      const limit = cfg[w.key === "second" ? "perSecond" : w.key === "minute" ? "perMinute" : w.key === "hour" ? "perHour" : w.key === "day" ? "perDay" : "perMonth"];
      if (!limit) continue;
      const bucket = Math.floor(now / w.seconds);
      const k = this.key(provider, w.key, bucket);
      const cur = Number((await this.store.get<number>(k))?.value ?? 0);
      await this.store.set(k, cur + 1, w.seconds + 5);
    }
  }

  begin(provider: ProviderName): void {
    this.inflight.set(provider, (this.inflight.get(provider) ?? 0) + 1);
  }

  end(provider: ProviderName): void {
    this.inflight.set(provider, Math.max(0, (this.inflight.get(provider) ?? 0) - 1));
  }

  /**
   * Wait for a request slot up to `timeoutMs`. Bursts (e.g. an ISR
   * revalidation storm rendering many pages at once) queue here instead of
   * failing — only transient pressure queues: concurrency saturation or a
   * per-second window about to roll over. Longer-window exhaustion must
   * fail fast so requests don't pile up behind a genuinely spent quota.
   * Returns false when no slot opened in time (caller skips the provider).
   */
  async waitSlot(provider: ProviderName, timeoutMs = 8000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const verdict = await this.check(provider);
      if (verdict.allowed) return true;
      const minute = verdict.usage.find((u) => u.window === "minute");
      const transient =
        verdict.reason === "concurrency" ||
        (verdict.reason === "exhausted" && (!minute || minute.used < minute.limit));
      if (!transient || Date.now() >= deadline) return false;
      const waitMs = Math.min(250, Math.max(50, verdict.retryAfterSeconds * 1000));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  usage(provider: ProviderName): Promise<WindowUsage[]> {
    return this.read(provider);
  }
}

/** In-flight dedup: identical requests share one network call (§3.8). */
export class RequestCoalescer {
  private pending = new Map<string, Promise<unknown>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;
    const p = fn().finally(() => this.pending.delete(key));
    this.pending.set(key, p);
    return p;
  }

  get size(): number {
    return this.pending.size;
  }
}
