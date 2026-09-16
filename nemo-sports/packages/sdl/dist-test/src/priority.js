"use strict";
/**
 * SDL · Provider priority configuration (§3.5)
 * Rows live in the database and are editable from the admin dashboard;
 * changes take effect on the next request without a restart.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PRIORITY_RULES = exports.PriorityConfig = void 0;
const WILDCARD = "*";
class PriorityConfig {
    rules = [];
    constructor(rules = []) {
        this.rules = [...rules];
    }
    all() {
        return [...this.rules];
    }
    upsert(rule) {
        const existing = this.rules.find((r) => r.sport === rule.sport && r.competition === rule.competition && r.dataType === rule.dataType && r.provider === rule.provider);
        const next = { ...rule, updatedAt: new Date().toISOString() };
        if (existing)
            Object.assign(existing, next);
        else
            this.rules.push(next);
        return next;
    }
    remove(id) {
        const before = this.rules.length;
        this.rules = this.rules.filter((r) => r.id !== id);
        return this.rules.length < before;
    }
    /**
     * Specificity order (most → least specific):
     * sport+competition+dataType → sport+dataType → dataType-only.
     * The first tier that yields any enabled rule wins entirely, so a
     * competition-specific override is never half-applied.
     */
    resolve(sport, competition, dataType) {
        const tiers = [
            { sport, competition: competition ?? WILDCARD },
            { sport, competition: WILDCARD },
            { sport: WILDCARD, competition: competition ?? WILDCARD },
            { sport: WILDCARD, competition: WILDCARD },
        ];
        for (const tier of tiers) {
            if (tier.competition !== WILDCARD && !competition)
                continue;
            const matched = this.rules.filter((r) => r.enabled &&
                r.sport === tier.sport &&
                r.competition === tier.competition &&
                r.dataType === dataType &&
                r.role !== "disabled");
            if (matched.length) {
                const order = { primary: 0, secondary: 1, fallback: 2, disabled: 3 };
                return matched
                    .slice()
                    .sort((a, b) => order[a.role] - order[b.role] || a.provider.localeCompare(b.provider))
                    .map((r) => ({ provider: r.provider, role: r.role }));
            }
        }
        return [];
    }
}
exports.PriorityConfig = PriorityConfig;
/** Default wiring shipped with the platform — overridable per competition in the DB. */
exports.DEFAULT_PRIORITY_RULES = [
    // Football · live events: premium provider first, cheap wide-coverage backup last
    rule("pr-1", "football", WILDCARD, "live_matches", "sportradar", "primary"),
    rule("pr-2", "football", WILDCARD, "live_matches", "sportmonks", "secondary"),
    rule("pr-3", "football", WILDCARD, "live_matches", "api_football", "fallback"),
    rule("pr-4", "football", WILDCARD, "match_events", "sportradar", "primary"),
    rule("pr-5", "football", WILDCARD, "match_events", "sportmonks", "secondary"),
    rule("pr-6", "football", WILDCARD, "match_events", "api_football", "fallback"),
    rule("pr-7", "football", WILDCARD, "fixtures", "sportmonks", "primary"),
    rule("pr-8", "football", WILDCARD, "fixtures", "api_football", "secondary"),
    rule("pr-9", "football", WILDCARD, "standings", "sportmonks", "primary"),
    rule("pr-10", "football", WILDCARD, "standings", "api_football", "secondary"),
    rule("pr-11", "football", WILDCARD, "top_scorers", "sportmonks", "primary"),
    rule("pr-12", "football", WILDCARD, "top_scorers", "api_football", "secondary"),
    // Images/metadata: TheSportsDB first (rich artwork), never for live scores
    rule("pr-13", WILDCARD, WILDCARD, "images", "thesportsdb", "primary"),
    rule("pr-14", WILDCARD, WILDCARD, "images", "sportmonks", "secondary"),
    rule("pr-15", WILDCARD, WILDCARD, "team", "sportmonks", "primary"),
    rule("pr-16", WILDCARD, WILDCARD, "team", "thesportsdb", "secondary"),
    // Competition-specific override example: Premier League live from Sportradar only chain
    rule("pr-20", "football", "premier-league", "live_matches", "sportradar", "primary"),
    rule("pr-21", "football", "premier-league", "live_matches", "sportmonks", "fallback"),
];
function rule(id, sport, competition, dataType, provider, role) {
    return { id, sport, competition, dataType, provider, role, enabled: true, updatedAt: new Date("2026-01-01").toISOString() };
}
