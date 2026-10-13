import type { SqlClient } from "@/packages/sdl/src";
import { keyOf, emptyState, type Job, type Kind, type RecordData, type Run, type State } from "./model";

export interface SyncStore {
  list(kind?: Kind): Promise<RecordData[]>;
  get(kind: Kind, provider: string, key: string): Promise<RecordData | undefined>;
  put(record: RecordData): Promise<void>;
  state(job: Job): Promise<State>;
  checkpoint(job: Job, state: State): Promise<void>;
  run(run: Run): Promise<void>;
  issue(code: string, detail: string): Promise<void>;
  acquire(owner: string): Promise<boolean>;
  release(owner: string): Promise<void>;
  atomic<T>(fn: (store: SyncStore) => Promise<T>): Promise<T>;
}

/** SQL errors propagate: a configured but broken DB must never fall back to memory. */
export class PgSyncStore implements SyncStore {
  private leaseOwner: string | null = null;
  constructor(private db: SqlClient) {}
  async list(kind?: Kind): Promise<RecordData[]> {
    const rows = await this.db.select<{ payload: RecordData }>(`SELECT payload FROM sports_sync_records ${kind ? "WHERE kind=$1" : ""} ORDER BY provider, source_key LIMIT 50001`, kind ? [kind] : []);
    if (rows.length > 50000) throw new Error("read model exceeds 50000 rows: partition/paginate before increasing coverage; no silent truncation");
    return rows.map(r => r.payload);
  }
  async get(kind: Kind, provider: string, key: string) {
    const rows = await this.db.select<{ payload: RecordData }>("SELECT payload FROM sports_sync_records WHERE kind=$1 AND provider=$2 AND source_key=$3", [kind, provider, key]);
    return rows[0]?.payload;
  }
  async put(record: RecordData) {
    // Reuse only verified legacy canonical mappings; no fuzzy/name-based merge.
    const table = await this.db.select<{ exists: boolean }>("SELECT to_regclass('public.provider_entity_map') IS NOT NULL AS exists", []);
    if (table[0]?.exists && !["standings", "scorers"].includes(record.kind)) {
      const entity = record.kind === "fixture" ? "match" : record.kind;
      const providerId = record.kind === "season" ? String(record.data.providerId) : record.sourceKey;
      const map = await this.db.select<{ canonical_id: string }>("SELECT canonical_id FROM provider_entity_map WHERE entity_type=$1 AND provider=$2 AND provider_id=$3 AND verified=true LIMIT 1", [entity, record.provider, providerId]);
      if (map[0]) record.canonicalId = map[0].canonical_id;
    }
    await this.db.run("INSERT INTO sports_sync_records(kind,provider,source_key,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(kind,provider,source_key) DO UPDATE SET payload=EXCLUDED.payload", [record.kind, record.provider, record.sourceKey, JSON.stringify(record)]);
  }
  async state(job: Job) {
    const rows = await this.db.select<{ payload: State }>("SELECT payload FROM sports_sync_state WHERE job=$1", [job]);
    return rows[0]?.payload ?? emptyState();
  }
  async checkpoint(job: Job, state: State) {
    await this.db.run("INSERT INTO sports_sync_state(job,payload) VALUES($1,$2::jsonb) ON CONFLICT(job) DO UPDATE SET payload=EXCLUDED.payload", [job, JSON.stringify(state)]);
  }
  async run(run: Run) {
    await this.db.run("INSERT INTO sports_sync_runs(id,started_at,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload", [run.id, run.startedAt, JSON.stringify(run)]);
  }
  async issue(code: string, detail: string) { await this.db.run("INSERT INTO sports_sync_issues(code,detail) VALUES($1,$2)", [code, detail.slice(0, 2000)]); }
  async acquire(owner: string) {
    const rows = await this.db.select<{ owner: string }>(`INSERT INTO sports_sync_lease(id,owner,expires_at) VALUES('global',$1,now()+interval '5 minutes')
      ON CONFLICT(id) DO UPDATE SET owner=EXCLUDED.owner,expires_at=EXCLUDED.expires_at WHERE sports_sync_lease.expires_at < now() RETURNING owner`, [owner]);
    if (rows[0]?.owner === owner) { this.leaseOwner = owner; return true; }
    return false;
  }
  async release(owner: string) { await this.db.run("DELETE FROM sports_sync_lease WHERE id='global' AND owner=$1", [owner]); }
  async atomic<T>(fn: (store: SyncStore) => Promise<T>): Promise<T> { return this.db.transaction(async tx => {
      if (this.leaseOwner) {
        const rows = await tx.select<{ owner: string }>("SELECT owner FROM sports_sync_lease WHERE id='global' AND owner=$1 AND expires_at>now() FOR UPDATE", [this.leaseOwner]);
        if (!rows.length) throw new Error("synchronization lease lost; task not committed");
      }
      return fn(new PgSyncStore(tx));
    }); }
}

/** Injected test store ONLY. Never selected by production composition. */
export class MemorySyncStore implements SyncStore {
  records = new Map<string, RecordData>(); states = new Map<Job, State>(); runs = new Map<string, Run>(); issues: { code: string; detail: string }[] = []; owner: string | null = null;
  async list(kind?: Kind) { return [...this.records.values()].filter(r => !kind || r.kind === kind).map(r => structuredClone(r)); }
  async get(kind: Kind, provider: string, key: string) { const r = this.records.get(keyOf(kind, provider, key)); return r ? structuredClone(r) : undefined; }
  async put(r: RecordData) { this.records.set(keyOf(r.kind, r.provider, r.sourceKey), structuredClone(r)); }
  async state(job: Job) { return structuredClone(this.states.get(job) ?? emptyState()); }
  async checkpoint(job: Job, state: State) { this.states.set(job, structuredClone(state)); }
  async run(run: Run) { this.runs.set(run.id, structuredClone(run)); }
  async issue(code: string, detail: string) { this.issues.push({ code, detail }); }
  async acquire(owner: string) { if (this.owner) return false; this.owner = owner; return true; }
  async release(owner: string) { if (this.owner === owner) this.owner = null; }
  async atomic<T>(fn: (store: SyncStore) => Promise<T>): Promise<T> {
    const records = structuredClone(this.records), states = structuredClone(this.states), issues = structuredClone(this.issues);
    try { return await fn(this); } catch (e) { this.records = records; this.states = states; this.issues = issues; throw e; }
  }
}
