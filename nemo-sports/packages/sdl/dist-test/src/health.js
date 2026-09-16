"use strict";
/**
 * SDL · Provider health monitoring & automatic failover (§3.10)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthMonitor = void 0;
const emptyRecord = (provider) => ({
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
class HealthMonitor {
    records = new Map();
    events = [];
    latency = [];
    failureThreshold;
    recoveryThreshold;
    maxEvents;
    constructor(opts = {}) {
        this.failureThreshold = opts.failureThreshold ?? 3;
        this.recoveryThreshold = opts.recoveryThreshold ?? 5;
        this.maxEvents = opts.maxEvents ?? 500;
    }
    record(provider) {
        if (!this.records.has(provider))
            this.records.set(provider, emptyRecord(provider));
        return this.records.get(provider);
    }
    log(provider, kind, detail) {
        this.events.unshift({ at: new Date().toISOString(), provider, kind, detail });
        if (this.events.length > this.maxEvents)
            this.events.length = this.maxEvents;
    }
    noteSuccess(provider, latencyMs, freshnessScore = 1) {
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
        if (r.status !== "disabled")
            r.status = "healthy";
        if (r.failoverActive && r.consecutiveSuccesses >= this.recoveryThreshold) {
            r.failoverActive = false;
            r.failoverSince = null;
            this.log(provider, "failover_off", `recovered after ${r.consecutiveSuccesses} consecutive successes`);
        }
        this.log(provider, "success", `${latencyMs}ms`);
        r.updatedAt = new Date().toISOString();
    }
    noteFailure(provider, detail, rateLimited = false) {
        const r = this.record(provider);
        r.lastFailureAt = new Date().toISOString();
        r.consecutiveSuccesses = 0;
        r.consecutiveFailures++;
        r.reachable = !rateLimited;
        r.errorRate = this.recomputeErrorRate(r);
        if (rateLimited) {
            r.status = "rate_limited";
            this.log(provider, "rate_limited", detail);
        }
        else if (r.consecutiveFailures >= this.failureThreshold) {
            r.status = "down";
            r.reachable = false;
            if (!r.failoverActive) {
                r.failoverActive = true;
                r.failoverSince = new Date().toISOString();
                this.log(provider, "failover_on", `${r.consecutiveFailures} consecutive failures — traffic moved to next provider`);
            }
        }
        else {
            r.status = "degraded";
        }
        this.log(provider, "failure", detail);
        r.updatedAt = new Date().toISOString();
    }
    noteConflict(provider, detail) {
        const r = this.record(provider);
        r.conflicts24h++;
        this.log(provider, "conflict", detail);
        r.updatedAt = new Date().toISOString();
    }
    setEnabled(provider, enabled) {
        const r = this.record(provider);
        r.enabled = enabled;
        r.status = enabled ? "healthy" : "disabled";
        this.log(provider, enabled ? "failover_off" : "disabled", enabled ? "re-enabled by admin" : "disabled by admin");
        r.updatedAt = new Date().toISOString();
    }
    /** Providers that may currently serve traffic, best first. */
    available(provider) {
        const r = this.record(provider);
        return r.enabled && r.status !== "down" && r.status !== "rate_limited" && r.status !== "disabled";
    }
    isDegraded(provider) {
        const r = this.record(provider);
        return r.status === "degraded" || r.failoverActive;
    }
    avgLatency(provider, windowMs) {
        const cutoff = Date.now() - windowMs;
        const samples = this.latency.filter((s) => s.provider === provider && s.at >= cutoff);
        if (!samples.length)
            return null;
        return Math.round(samples.reduce((a, s) => a + s.ms, 0) / samples.length);
    }
    recomputeErrorRate(r) {
        const total = r.consecutiveFailures + r.consecutiveSuccesses;
        if (!total)
            return 0;
        return r.consecutiveFailures / total;
    }
    snapshot() {
        return [...this.records.values()];
    }
    log_(provider) {
        return provider ? this.events.filter((e) => e.provider === provider) : this.events;
    }
}
exports.HealthMonitor = HealthMonitor;
