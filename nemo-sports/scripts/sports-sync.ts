import { synchronize, nextDueJob } from "@/lib/sports-sync/service";
import { JOBS, type Job } from "@/lib/sports-sync/model";
import { closeRedis } from "@/lib/cache/redis";
import { getDb } from "@/lib/db/pg";
async function main() {
  const name = process.argv[2] ?? "tick";
  if (name !== "tick" && !JOBS.includes(name as Job)) throw new Error(`job must be tick or ${JOBS.join(", ")}`);
  const job = name === "tick" ? await nextDueJob() : name as Job;
  if (!job) { console.log("No job due"); return; }
  const run = await synchronize(job, process.argv.includes("--force"));
  console.log(JSON.stringify(run, null, 2));
  if (["failed", "partial"].includes(run.status)) process.exitCode = 1;
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(async () => { await (await getDb())?.end(); closeRedis(); });
