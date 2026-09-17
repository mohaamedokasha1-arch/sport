/**
 * SDL · Provider health monitoring & automatic failover (§3.10)
 */

import type { ProviderName } from "./types";

export type HealthStatus = "healthy" | "degraded" | "rate_limited" | "down" | "disabled";

export type ProviderHealthRecord = {
  provider: ProviderName;
  status: HealthStatus;
  enabled: boolean;
  reachable: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  /** rolling windows in ms */
  latencyAvg1h: number | null;
  latencyAvg24h: number | null;
  errorRate: number;
  conflicts24h: number;
  freshnessScore: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  /** set when failover moved traffic away from this provider */
  failoverActive: boolean;
  failoverSince: string | null;
  updatedAt: string;
};

export type HealthEvent = {
  at: string;
  provider: ProviderName;
  kind: "success" | "failure" | "rate_limited" | "conflict" | "failover_on" | "failover_off" | "disabled";
  detail: string;
};

const emptyRecord = (provider: ProviderName): ProviderHealthRecord => ({
  provider,
  status: "healthy",
  enabled: true,
  reachable: true,
  lastSuccessAt: null,
  lastFailureAt: null,
  latencyAvg1h: null,
  latencyAvg24h: null,
  errorRate: 0,
  conflicts24h: 0,
  freshnessScore: 1,
  consecutiveFailures: 0,
  consecutiveSuccesses: 0,
  failoverActive: false,
  failoverSince: null,
  updatedAt: new Date().toISOString(),
});

/**
 * Thresholds are explicit so ops can reason about them:
 * 3 consecutive failures (or a 429) flips a provider to down/rate_limited and
 * triggers failover; 5 consecutive successes restores it.
 */
export class HealthMonitor {
  private records = new Map<ProviderName, ProviderHealthRecord>();
  private events: HealthEvent[] = [];
  private latency: { provider: ProviderName; at: number; ms: number }[] = [];

  private failureThreshold: number;
  private recoveryThreshold: number;
  private maxEvents: number;

  constructor(opts: { failureThreshold?: number; recoveryThreshold?: number; maxEvents?: number } = {}) {
    this.failureThreshold = opts.failureThreshold ?? 3;
    this.recoveryThreshold = opts.recoveryThreshold ?? 5;
    this.maxEvents = opts.maxEvents ?? 500;
  }

  record(provider: ProviderName): ProviderHealthRecord {
    if (!this.records.has(provider)) this.records.set(provider, emptyRecord(provider));
    return this.records.get(provider)!;
  }

  private log(provider: ProviderName, kind: HealthEvent["kind"], detail: string) {
    this.events.unshift({ at: new Date().toISOString(), provider, kind, detail });
    if (this.events.length > this.maxEvents) this.events.length = this.maxEvents;
  }

  noteSuccess(provider: ProviderName, latencyMs: number, freshnessScore = 1): void {
    const r = this.record(provider);
    r.reachable = true;
    r.lastSuccessAt = new Date().toISOString();
    r.consecutiveFailures = 0;
    r.consecutiveSuccesses++;
    r.freshnessScore = freshnessScore;
    this.latency.push({ provider, at: Date.now(), ms: latencyMs });
    r.latencyAvg1h = this.avgLatency(provider, 3_600_000);
    r.latencyAvg24h = this.avgLatency(provider, 86_400_000);
    r.errorRate = this.recomputeErrorRate(r);
    if (r.status !== "disabled") r.status = "healthy";
    if (r.failoverActive && r.consecutiveSuccesses >= this.recoveryThreshold) {
      r.failoverActive = false;
      r.failoverSince = null;
      this.log(provider, "failover_off", `recovered after ${r.consecutiveSuccesses} consecutive successes`);
    }
    this.log(provider, "success", `${latencyMs}ms`);
    r.updatedAt = new Date().toISOString();
  }

  noteFailure(provider: ProviderName, detail: string, rateLimited = false): void {
    const r = this.record(provider);
    r.lastFailureAt = new Date().toISOString();
    r.consecutiveSuccesses = 0;
    r.consecutiveFailures++;
    r.reachable = !rateLimited;
    r.errorRate = this.recomputeErrorRate(r);
    if (rateLimited) {
      r.status = "rate_limited";
      this.log(provider, "rate_limited", detail);
    } else if (r.consecutiveFailures >= this.failureThreshold) {
      r.status = "down";
      r.reachable = false;
      if (!r.failoverActive) {
        r.failoverActive = true;
        r.failoverSince = new Date().toISOString();
        this.log(provider, "failover_on", `${r.consecutiveFailures} consecutive failures — traffic moved to next provider`);
      }
    } else {
      r.status = "degraded";
    }
    this.log(provider, "failure", detail);
    r.updatedAt = new Date().toISOString();
  }

  noteConflict(provider: ProviderName, detail: string): void {
    const r = this.record(provider);
    r.conflicts24h++;
    this.log(provider, "conflict", detail);
    r.updatedAt = new Date().toISOString();
  }

  setEnabled(provider: ProviderName, enabled: boolean): void {
    const r = this.record(provider);
    r.enabled = enabled;
    r.status = enabled ? "healthy" : "disabled";
    this.log(provider, enabled ? "failover_off" : "disabled", enabled ? "re-enabled by admin" : "disabled by admin");
    r.updatedAt = new Date().toISOString();
  }

  /** Providers that may currently serve traffic, best first. */
  available(provider: ProviderName): boolean {
    const r = this.record(provider);
    if (!r.enabled || r.status === "disabled") return false;
    if (r.status !== "down" && r.status !== "rate_limited") return true;
    // Half-open circuit: re-admit after a cooldown so a recovered provider
    // can earn consecutive successes and close the breaker again. Without
    // this, a single-provider platform would lock out until restart.
    const sinceFailure = Date.now() - +new Date(r.lastFailureAt ?? 0);
    return Number.isFinite(sinceFailure) && sinceFailure > 30_000;
  }

  isDegraded(provider: ProviderName): boolean {
    const r = this.record(provider);
    return r.status === "degraded" || r.failoverActive;
  }

  private avgLatency(provider: ProviderName, windowMs: number): number | null {
    const cutoff = Date.now() - windowMs;
    const samples = this.latency.filter((s) => s.provider === provider && s.at >= cutoff);
    if (!samples.length) return null;
    return Math.round(samples.reduce((a, s) => a + s.ms, 0) / samples.length);
  }

  private recomputeErrorRate(r: ProviderHealthRecord): number {
    const total = r.consecutiveFailures + r.consecutiveSuccesses;
    if (!total) return 0;
    return r.consecutiveFailures / total;
  }

  snapshot(): ProviderHealthRecord[] {
    return [...this.records.values()];
  }

  log_(provider?: ProviderName): HealthEvent[] {
    return provider ? this.events.filter((e) => e.provider === provider) : this.events;
  }
}
