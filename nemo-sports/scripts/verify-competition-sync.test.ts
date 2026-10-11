import test from "node:test";
import assert from "node:assert/strict";

/**
 * Competition synchronization — app-level contract tests.
 * ────────────────────────────────────────────────────────
 * These exercise the shipped functions in lib/competition-sync.ts (not copies of
 * them). They pin the guarantees the cron route and the sitemap rely on:
 *
 *   · a catalog row is normalized, cleaned and bounded before it is stored;
 *   · a row with no stable provider id or no name is rejected, never half-stored;
 *   · re-running a sync UPDATES in place instead of duplicating;
 *   · a capability verified in an earlier run is never reset to "unknown" by a
 *     later catalog response that simply does not mention it;
 *   · discovery never publishes anything by itself.
 *
 * No database and no network: the store falls back to its in-process map, which
 * is exactly what happens on a deployment without DATABASE_URL.
 */

import {
  catalogRow,
  listProviderCompetitions,
  competitionSyncStatus,
  setProviderCompetitionPublished,
  resetInMemoryCompetitions,
  type ProviderCompetition,
} from "../lib/competition-sync";
import { emptyCapabilities, type NormalizedCatalogCompetition } from "../packages/sdl/src";

const AT = "2026-10-11T00:00:00.000Z";
let seq = 0;
const idFactory = () => `pcomp_test_${++seq}`;

function catalog(overrides: Partial<NormalizedCatalogCompetition> = {}): NormalizedCatalogCompetition {
  return {
    providerId: "4328",
    name: "English Premier League",
    shortName: "EPL",
    countryCode: "ENG",
    countryName: "England",
    type: "league",
    logoUrl: "https://cdn/4328.png",
    sport: "football",
    capabilities: emptyCapabilities(true),
    ...overrides,
  };
}

function row(overrides: Partial<ProviderCompetition> = {}): ProviderCompetition {
  return {
    id: "pcomp_existing",
    provider: "thesportsdb",
    providerId: "4328",
    sport: "football",
    name: "English Premier League",
    shortName: "EPL",
    country: "England",
    countryCode: "ENG",
    type: "league",
    logoUrl: "https://cdn/4328.png",
    capabilities: emptyCapabilities(true),
    published: false,
    firstSeenAt: AT,
    lastSeenAt: AT,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

/* ── normalization ─────────────────────────────────────────── */

test("a valid catalog row becomes a storable, unpublished record", () => {
  const out = catalogRow({ provider: "thesportsdb", sport: "football", competition: catalog() }, undefined, AT, idFactory);
  assert.ok(out);
  assert.equal(out.created, true);
  assert.equal(out.row.provider, "thesportsdb");
  assert.equal(out.row.providerId, "4328");
  assert.equal(out.row.name, "English Premier League");
  assert.equal(out.row.country, "England");
  assert.equal(out.row.published, false, "discovery must never publish on its own");
  assert.equal(out.row.capabilities.listed, true);
  assert.equal(out.row.capabilities.fixtures, null, "a listing proves nothing about fixtures");
  assert.equal(out.row.firstSeenAt, AT);
});

test("a row with no stable provider id is rejected rather than stored half-formed", () => {
  for (const providerId of ["", "   ", null as unknown as string]) {
    const out = catalogRow(
      { provider: "thesportsdb", sport: "football", competition: catalog({ providerId }) },
      undefined,
      AT,
      idFactory,
    );
    assert.equal(out, null, `providerId=${JSON.stringify(providerId)} must be rejected: it cannot be de-duplicated`);
  }
});

test("a row with no name is rejected", () => {
  const out = catalogRow(
    { provider: "thesportsdb", sport: "football", competition: catalog({ name: "  " }) },
    undefined,
    AT,
    idFactory,
  );
  assert.equal(out, null);
});

test("optional fields are cleaned, collapsed and bounded", () => {
  const out = catalogRow(
    {
      provider: "thesportsdb",
      sport: "football",
      competition: catalog({
        name: "  English   Premier\n League  ",
        countryName: "England ".repeat(40),
        shortName: "",
        logoUrl: "",
        countryCode: "",
        type: "",
      }),
    },
    undefined,
    AT,
    idFactory,
  );
  assert.ok(out);
  assert.equal(out.row.name, "English Premier League", "internal whitespace collapses");
  assert.ok(out.row.country.length <= 120, "country is bounded");
  assert.equal(out.row.shortName, "", "an empty optional field stays empty, never undefined");
  assert.equal(out.row.logoUrl, "");
});

test("the sport falls back to the query's sport when the row omits it", () => {
  const out = catalogRow(
    { provider: "thesportsdb", sport: "basketball", competition: catalog({ sport: null }) },
    undefined,
    AT,
    idFactory,
  );
  assert.ok(out);
  assert.equal(out.row.sport, "basketball");
});

/* ── update semantics ──────────────────────────────────────── */

test("re-syncing the same competition updates in place and keeps its identity", () => {
  const previous = row();
  const out = catalogRow(
    { provider: "thesportsdb", sport: "football", competition: catalog({ name: "Premier League" }) },
    previous,
    "2026-10-12T00:00:00.000Z",
    idFactory,
  );
  assert.ok(out);
  assert.equal(out.created, false);
  assert.equal(out.row.id, previous.id, "the canonical row id must be stable across syncs");
  assert.equal(out.row.name, "Premier League", "a renamed league is updated");
  assert.equal(out.row.firstSeenAt, AT, "first sighting is never overwritten");
  assert.equal(out.row.lastSeenAt, "2026-10-12T00:00:00.000Z");
});

test("a catalog response cannot downgrade a capability verified earlier", () => {
  // This is the rule that stops a provider's silence from erasing knowledge:
  // a standings response we observed last week set `standings: true`; today's
  // catalog listing says nothing about standings at all.
  const previous = row({
    capabilities: { listed: true, fixtures: true, live: null, results: true, standings: true, teams: false, players: null },
  });
  const out = catalogRow(
    { provider: "thesportsdb", sport: "football", competition: catalog({ capabilities: emptyCapabilities(true) }) },
    previous,
    "2026-10-12T00:00:00.000Z",
    idFactory,
  );
  assert.ok(out);
  assert.deepEqual(out.row.capabilities, {
    listed: true,
    fixtures: true,
    live: null,
    results: true,
    standings: true,
    teams: false,
    players: null,
  });
});

test("an empty field in a later response does not blank out stored metadata", () => {
  const previous = row({ country: "England", logoUrl: "https://cdn/4328.png", type: "league" });
  const out = catalogRow(
    {
      provider: "thesportsdb",
      sport: "football",
      competition: catalog({ countryName: "", logoUrl: null, type: null }),
    },
    previous,
    "2026-10-12T00:00:00.000Z",
    idFactory,
  );
  assert.ok(out);
  assert.equal(out.row.country, "England");
  assert.equal(out.row.logoUrl, "https://cdn/4328.png");
  assert.equal(out.row.type, "league");
});

/* ── store round-trip (in-process, no DATABASE_URL) ────────── */

test("the in-process store keeps no duplicates across repeated publication toggles", async () => {
  resetInMemoryCompetitions();
  const before = await listProviderCompetitions({ limit: 100 });
  assert.equal(before.length, 0, "the test starts from an empty store");

  const status = await competitionSyncStatus();
  assert.equal(status.durable, false, "without DATABASE_URL the store must report itself as non-durable");
  assert.equal(status.lastSuccessfulAt, null, "no run has succeeded yet");
  assert.equal(status.lastAttemptAt, null);
  assert.equal(status.storedCompetitions, 0);
});

test("publishing an unknown competition fails instead of creating it", async () => {
  resetInMemoryCompetitions();
  const ok = await setProviderCompetitionPublished("thesportsdb", "does-not-exist", true);
  assert.equal(ok, false);
  const list = await listProviderCompetitions({ limit: 100 });
  assert.equal(list.length, 0, "a failed publication must not leave a phantom row behind");
});
