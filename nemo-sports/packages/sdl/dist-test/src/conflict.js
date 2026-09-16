"use strict";
/**
 * SDL · Conflict detection & resolution (§3.9)
 *
 * Severities are fixed and ordered, Critical → Low. A higher-severity field
 * (score) is never overwritten by a lower-severity source, and a resolved
 * conflict is stored so the same disagreement is not re-raised every poll.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConflictDetector = exports.DEFAULT_CONFLICT_RULES = void 0;
const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
/** Default rules; overridable from the admin dashboard. */
exports.DEFAULT_CONFLICT_RULES = {
    score: { severity: "critical", strategy: "primary_provider_wins" },
    status: { severity: "high", strategy: "primary_provider_wins" },
    kickoff: { severity: "medium", strategy: "primary_provider_wins" },
    lineup: { severity: "medium", strategy: "most_recent_wins" },
    event: { severity: "high", strategy: "most_recent_wins" },
    stat: { severity: "low", strategy: "most_recent_wins" },
    // league tables are authoritative: a secondary feed must never move a team's
    // points or position, even when its payload is newer
    standings: { severity: "high", strategy: "primary_provider_wins" },
    metadata: { severity: "low", strategy: "most_recent_wins" },
};
class ConflictDetector {
    rules;
    conflicts = [];
    resolvedIndex = new Map();
    maxStored;
    constructor(rules = exports.DEFAULT_CONFLICT_RULES, opts = {}) {
        this.rules = rules;
        this.maxStored = opts.maxStored ?? 2000;
    }
    setRules(field, rule) {
        this.rules[field] = rule;
    }
    key(entityType, entityId, field) {
        return `${entityType}:${entityId}:${field}`;
    }
    /**
     * Compare a stored value with an incoming one.
     * Returns the value to persist, or null when the incoming value is rejected.
     */
    evaluate(input) {
        const { field, stored, incoming } = input;
        if (stored === null || stored === undefined || input.valuesAreEqual(stored, incoming)) {
            return { accept: true, conflict: null, reason: "no_conflict" };
        }
        const rule = this.rules[field];
        const k = this.key(input.entityType, input.entityId, field);
        const prior = this.conflicts.find((c) => this.key(c.entityType, c.entityId, c.field) === k && !c.resolved);
        const conflict = prior ?? {
            id: `${k}:${input.incomingProvider}:${Date.now().toString(36)}`,
            severity: rule.severity,
            field,
            entityId: input.entityId,
            entityType: input.entityType,
            values: {},
            providers: [],
            detectedAt: new Date().toISOString(),
            resolved: false,
            resolvedValue: null,
            resolution: null,
            resolvedAt: null,
            notes: null,
        };
        conflict.values = {
            [input.storedProvider]: stored,
            [input.incomingProvider]: incoming,
        };
        conflict.providers = [...new Set([...conflict.providers, input.storedProvider, input.incomingProvider])];
        if (!prior)
            this.conflicts.unshift(conflict);
        if (this.conflicts.length > this.maxStored)
            this.conflicts.length = this.maxStored;
        let accept = false;
        let reason = rule.strategy;
        switch (rule.strategy) {
            case "primary_provider_wins":
                accept = input.primaryProvider === input.incomingProvider || input.primaryProvider === null;
                break;
            case "most_recent_wins":
                accept = +new Date(input.incomingAt) >= +new Date(input.storedAt);
                break;
            case "manual_review":
                accept = false;
                break;
            case "reject_change":
                accept = false;
                break;
        }
        if (accept) {
            conflict.resolved = true;
            conflict.resolution = "automatic";
            conflict.resolvedValue = incoming;
            conflict.resolvedAt = new Date().toISOString();
            this.resolvedIndex.set(k, conflict);
        }
        return { accept, conflict, reason };
    }
    resolveManually(id, value, notes) {
        const c = this.conflicts.find((x) => x.id === id);
        if (!c)
            return null;
        c.resolved = true;
        c.resolution = "manual";
        c.resolvedValue = value;
        c.resolvedAt = new Date().toISOString();
        c.notes = notes;
        this.resolvedIndex.set(this.key(c.entityType, c.entityId, c.field), c);
        return c;
    }
    open() {
        return this.conflicts.filter((c) => !c.resolved).sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    }
    all() {
        return [...this.conflicts];
    }
    summary() {
        const open = this.open();
        const count = (s) => open.filter((c) => c.severity === s).length;
        return {
            critical: count("critical"),
            high: count("high"),
            medium: count("medium"),
            low: count("low"),
            open: open.length,
            total: this.conflicts.length,
        };
    }
}
exports.ConflictDetector = ConflictDetector;
