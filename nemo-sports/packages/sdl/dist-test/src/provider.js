"use strict";
/**
 * SDL · Provider Abstraction (§3.3)
 * ─────────────────────────────────
 * Every external provider is an adapter behind this interface.
 * Nothing outside `adapters/` may know a provider's URL, auth scheme or
 * payload shape (Instruction 2: no direct provider coupling).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DATA_TYPES = exports.notSupported = void 0;
const notSupported = (provider, dataType, requestKey) => ({
    ok: false,
    provider,
    requestKey,
    fromCache: false,
    error: {
        code: "not_supported",
        message: `${provider} does not provide ${dataType}`,
    },
});
exports.notSupported = notSupported;
/** Every data type an adapter may declare support for. */
exports.DATA_TYPES = [
    "fixtures",
    "live_matches",
    "match_detail",
    "match_events",
    "match_stats",
    "match_lineups",
    "team",
    "team_squad",
    "team_stats",
    "player",
    "player_stats",
    "competition",
    "competition_seasons",
    "standings",
    "top_scorers",
    "fixture_list",
    "results",
    "venue",
    "images",
    "health",
];
