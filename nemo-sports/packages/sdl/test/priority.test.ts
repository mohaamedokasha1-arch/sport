/**
 * Priority chain coverage — regression test for the non-football match 404s.
 * ─────────────────────────────────────────────────────────────────────────
 * `/matches/[slug]` links every sport the list pages render, but the default
 * chain only had per-match rules (match_detail / match_events / match_stats /
 * match_lineups) for `sport = "football"`. For any other sport `resolve()`
 * returned an empty chain, the orchestrator answered `no_provider_configured`,
 * and the page 404'd — a basketball, tennis or cricket match the site had just
 * linked to. This asserts every public sport has a chain for every data type
 * the public surfaces actually request.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PRIORITY_RULES, PriorityConfig } from "../src/priority";
import type { DataType } from "../src/provider";

/**
 * Mirrors PUBLIC_SPORTS in the app layer (lib/core-data.ts). The SDL package is
 * standalone and cannot import the app catalogue, so the list is restated here;
 * if a sport is added there, add it here too — the test then guards it as well.
 */
const PUBLIC_SPORTS = ["football", "basketball", "tennis", "cricket"];

/** Every data type a public page can ask for. */
const PUBLIC_DATA_TYPES: DataType[] = [
  "live_matches",
  "fixtures",
  "standings",
  "top_scorers",
  "match_detail",
  "match_events",
  "match_stats",
  "match_lineups",
  "player_stats",
];

const config = new PriorityConfig(DEFAULT_PRIORITY_RULES);

test("every public sport resolves a provider chain for every public data type", () => {
  const missing: string[] = [];
  for (const sport of PUBLIC_SPORTS) {
    for (const dataType of PUBLIC_DATA_TYPES) {
      if (config.resolve(sport, null, dataType).length === 0) missing.push(`${sport}/${dataType}`);
    }
  }
  assert.deepEqual(missing, [], `no chain for: ${missing.join(", ")}`);
});

test("the wildcard per-match rules do not re-route football", () => {
  // ss-3..ss-6 are the football-specific per-match rules; ss-15..ss-18 are the
  // wildcard ones added for the other sports. `resolve()` stops at the first
  // tier that yields any rule, so a football request should resolve exactly as
  // it did before the wildcard rules existed. Prove it by comparing against a
  // config that has the football-scoped rules only.
  const footballOnly = new PriorityConfig(DEFAULT_PRIORITY_RULES.filter((r) => r.sport === "football"));
  for (const dataType of PUBLIC_DATA_TYPES) {
    assert.deepEqual(
      config.resolve("football", null, dataType),
      footballOnly.resolve("football", null, dataType),
      `${dataType} chain changed for football`,
    );
  }
  // …and the football per-match chains still lead with the keyless provider.
  assert.equal(config.resolve("football", null, "match_detail")[0].provider, "sportscore");
});

test("non-football per-match chains resolve to the keyless provider", () => {
  for (const sport of ["basketball", "tennis", "cricket"]) {
    for (const dataType of ["match_detail", "match_events", "match_stats", "match_lineups"] as DataType[]) {
      const chain = config.resolve(sport, null, dataType);
      assert.equal(chain.length, 1, `${sport}/${dataType} should resolve to one provider`);
      assert.equal(chain[0].provider, "sportscore");
    }
  }
});

test("a competition-scoped override still wins over every default rule", () => {
  const scoped = new PriorityConfig(DEFAULT_PRIORITY_RULES);
  scoped.upsert({
    id: "test-override",
    sport: "football",
    competition: "premier-league",
    dataType: "match_detail",
    provider: "sportradar",
    role: "primary",
    enabled: true,
  });
  const chain = scoped.resolve("football", "premier-league", "match_detail");
  assert.equal(chain.length, 1);
  assert.equal(chain[0].provider, "sportradar");
  // …and the wildcard match still uses the default chain.
  assert.equal(scoped.resolve("football", null, "match_detail")[0].provider, "sportscore");
});
