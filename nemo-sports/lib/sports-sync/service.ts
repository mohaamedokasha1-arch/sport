/** Server-only composition; durable writes require an applied migration and DB. */
import { getDb, sanitizeDbMessage } from "@/lib/db/pg";
import { sdlContext } from "@/lib/sdl-gateway";
import { runSync, type SyncTransport } from "./engine";
import { PgSyncStore } from "./store";
import { CADENCE, type Job, type Run } from "./model";

export async function synchronize(job: Job, force = false): Promise<Run> {
  const db = await getDb();
  if (!db) throw new Error("no_database: DATABASE_URL required; sync is never written to process memory");
  // No runtime DDL or automatic production migration. Fail clearly until approval/setup.
  const store = new PgSyncStore(db);
  await db.run(`UPDATE sports_sync_runs SET payload = payload || jsonb_build_object('status','failed','finishedAt',now(),'failures',jsonb_build_array('worker terminated before finish; resume persisted checkpoint'))
    WHERE payload->>'status'='running' AND started_at < now()-interval '5 minutes'`, []);
  const { sdl, mode, infra } = await sdlContext();
  if (process.env.NODE_ENV === "production" && !infra.redis.ok) throw new Error("distributed_quota_unavailable: configure healthy existing/self-hosted Redis before production sync; memory budgets cannot protect Vercel replicas");
  if (mode === "demo") throw new Error("demo_mode: real provider required");
  const transport: SyncTransport = {
    providers: sdl.registeredProviders().filter(p => p.name !== "demo").map(p => sdl.provider(p.name)!),
    async call(provider, sport, type, params, call) {
      const result = await sdl.fetch({ provider: provider.name, sport, dataType: type, endpoint: `sync:${type}`, params, call });
      if (!result.ok) throw new Error(result.error.message);
      if (result.value.stale || result.value.degraded) throw new Error("provider unavailable: stale cache not a successful synchronization");
      return { data: result.value.data, at: result.value.fetchedAt };
    },
  };
  try { return await runSync(job, store, transport, { force }); }
  catch (e) { throw new Error(sanitizeDbMessage(e instanceof Error ? e.message : String(e))); }
}

/** External/VPS caller can drain resumable jobs. No deployment schedule changed. */
export async function nextDueJob(): Promise<Job | null> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL required");
  const store = new PgSyncStore(db);
  const due: { job: Job; last: number }[] = [];
  for (const job of ["catalog", "seasons", "live", "results", "upcoming", "statistics", "metadata", "backfill", "quality"] as Job[]) {
    const state = await store.state(job);
    const last = state.lastAttemptAt ? Date.parse(state.lastAttemptAt) : 0;
    if (state.cursor || !last || Date.now() - last >= CADENCE[job] * 1000) due.push({ job, last });
  }
  // Oldest due job first: a frequently due live job must not starve discovery/backfill.
  // For strict live freshness use a dedicated live caller; tick cadence is not a guarantee.
  return due.sort((a, b) => a.last - b.last)[0]?.job ?? null;
}
