/**
 * NEMO Sports · Pipeline · source priority & field conflicts
 * ─────────────────────────────────────────────────────────
 * §6 of the brief, implemented as pure functions so both the runners and the
 * test suite can reason about it without a database:
 *
 *   1. EgyptianProLeague (EPL)
 *   2. EFA
 *   3. FIFA
 *   4. Football-Data.org
 *   5. TheSportsDB
 *
 * The order lives in `config/pipeline/endpoints.yml` (`priority:`), not in this
 * file: re-ordering sources is a config change, not a code change.
 *
 * A field is only ever overwritten by a source of EQUAL OR HIGHER priority.
 * When a lower-priority source disagrees, its value is not applied, the
 * disagreement is recorded (raw payload + `data_conflicts` row), and the run
 * summary counts it.
 */

import type { PipelineConfig, SourceName } from "./types";

export const UNRANKED = Number.MAX_SAFE_INTEGER;

export function rankOf(cfg: PipelineConfig, source: SourceName): number {
  const index = cfg.priority.indexOf(source);
  return index >= 0 ? index : UNRANKED;
}

/** Human label used in logs and in the admin UI: "2/5". */
export function priorityLabel(cfg: PipelineConfig, source: SourceName): string {
  const rank = rankOf(cfg, source);
  return rank === UNRANKED ? `-/${cfg.priority.length}` : `${rank + 1}/${cfg.priority.length}`;
}

/** True when `a` outranks `b` (strictly). */
export function outranks(cfg: PipelineConfig, a: SourceName, b: SourceName): boolean {
  return rankOf(cfg, a) < rankOf(cfg, b);
}

/** Sources sorted highest priority first, unknown sources last. */
export function sortByPriority(cfg: PipelineConfig, sources: SourceName[]): SourceName[] {
  return [...sources].sort((a, b) => rankOf(cfg, a) - rankOf(cfg, b));
}

export type FieldDecision<T> = {
  /** the value that must be persisted */
  value: T;
  /** true when the incoming value was applied */
  applied: boolean;
  /** true when the two sources disagreed (recorded either way) */
  conflict: boolean;
  /** the source that owns the persisted value after this call */
  owner: SourceName;
  reason: "no-existing-value" | "equal" | "incoming-wins" | "existing-wins" | "same-source";
};

export type DecideFieldInput<T> = {
  field: string;
  /** value already stored, if any */
  stored: T | null | undefined;
  /** value from the source that is being ingested now */
  incoming: T | null | undefined;
  /** source that produced `stored` (null when the row was created by another path) */
  storedSource: SourceName | null;
  incomingSource: SourceName;
  /** custom equality (defaults to `===`, with null/undefined treated as one) */
  equal?: (a: T, b: T) => boolean;
  /** when true, an incoming value may refine a stored one from the same source */
  refine?: boolean;
};

const looseEqual = <T,>(a: T, b: T): boolean => a === b;

/**
 * Decide one field.
 *
 * `incoming` wins when it outranks the stored owner, when nobody owns the
 * stored value, or when it comes from the same source (a provider correcting
 * its own earlier value — that is new information, not a conflict).
 */
export function decideField<T>(cfg: PipelineConfig, input: DecideFieldInput<T>): FieldDecision<T> {
  const equal = input.equal ?? looseEqual;
  const stored = input.stored;
  const incoming = input.incoming;
  const storedSource = input.storedSource;

  if (stored === null || stored === undefined) {
    return { value: (incoming ?? stored) as T, applied: incoming !== null && incoming !== undefined, conflict: false, owner: incoming !== null && incoming !== undefined ? input.incomingSource : (storedSource ?? input.incomingSource), reason: "no-existing-value" };
  }
  if (incoming === null || incoming === undefined) {
    return { value: stored, applied: false, conflict: false, owner: storedSource ?? input.incomingSource, reason: "existing-wins" };
  }
  if (equal(stored, incoming)) {
    return { value: stored, applied: true, conflict: false, owner: storedSource ?? input.incomingSource, reason: "equal" };
  }
  if (!storedSource) {
    // an unowned value (created by another path, or by an operator) is never
    // clobbered silently — the higher-priority source must actively outrank it
    return { value: incoming, applied: true, conflict: true, owner: input.incomingSource, reason: "incoming-wins" };
  }
  if (storedSource === input.incomingSource) {
    return { value: incoming, applied: true, conflict: false, owner: input.incomingSource, reason: "same-source" };
  }
  if (outranks(cfg, input.incomingSource, storedSource)) {
    return { value: incoming, applied: true, conflict: true, owner: input.incomingSource, reason: "incoming-wins" };
  }
  return { value: stored, applied: false, conflict: true, owner: storedSource, reason: "existing-wins" };
}

/** Severity mapping used when a disagreement is written to `data_conflicts`. */
export function severityForField(field: string): "critical" | "high" | "medium" | "low" {
  switch (field) {
    case "homeScore":
    case "awayScore":
    case "status":
    case "winner":
      return "critical";
    case "scheduledAt":
    case "kickoff":
      return "high";
    case "venue":
    case "round":
    case "season":
      return "medium";
    default:
      return "low";
  }
}
