#!/usr/bin/env node
/** Jobs formerly scheduled directly in vercel.json. Vercel Hobby permits two
 * daily crons; ingestion and news keep those slots, while the other protected
 * routes run here on GitHub's daily/weekly schedule. */
import { pathToFileURL } from "node:url";
import { siteOrigin } from "./refresh-leagues.mjs";

export const MAINTENANCE_PATHS = {
  daily: [
    "/api/cron/pipeline/matches",
    "/api/cron/pipeline/standings",
    "/api/cron/discover-fixtures",
  ],
  weekly: [
    "/api/cron/sync-competitions",
    "/api/cron/pipeline/competitions",
    "/api/cron/sports-sync/catalog",
  ],
};

/** Continue after an error so one provider cannot prevent the other jobs. */
export async function refreshMaintenance({ siteUrl, secret, mode, fetchImpl = fetch, log = console.log }) {
  const origin = siteOrigin(siteUrl);
  if (!secret) throw new Error("NEMO_CRON_SECRET is not configured in the scheduler");
  if (!Object.hasOwn(MAINTENANCE_PATHS, mode)) throw new Error("maintenance mode must be daily or weekly");
  const failures = [];
  for (const path of MAINTENANCE_PATHS[mode]) {
    try {
      const response = await fetchImpl(new URL(path, origin), {
        headers: { authorization: `Bearer ${secret}` },
        redirect: "error",
        signal: AbortSignal.timeout(55_000),
      });
      const result = await response.json().catch(() => null);
      // SportScore has no catalog endpoint: an absent catalog provider is an
      // expected *unsupported* optional job, never evidence of a completed one.
      const skippedCatalog = mode === "weekly" && path.endsWith("/catalog") &&
        response.status === 409 && result?.run?.status === "skipped";
      const unsupportedIndex = mode === "weekly" && path.endsWith("/sync-competitions") &&
        response.status === 409 && result?.reason === "no_provider";
      if (skippedCatalog || unsupportedIndex) {
        log(`${path}: ${unsupportedIndex || result.run.failures?.includes("no_supported_work") ? "unsupported (no catalog-capable provider)" : "not due or busy"}`);
      } else if (!response.ok || response.status === 207 || result?.ok !== true || result?.run?.status === "partial") {
        throw new Error(`${path}: job not successful (HTTP ${response.status})`);
      } else {
        log(`${path}: ${result?.skipped ? "not due" : "completed"}`);
      }
    } catch (error) {
      failures.push((error instanceof Error ? error.message : `${path}: unknown error`).replaceAll(secret, "[redacted]"));
    }
  }
  if (failures.length) throw new Error(failures.join("; "));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  refreshMaintenance({ siteUrl: process.env.NEMO_SITE_URL, secret: process.env.NEMO_CRON_SECRET, mode: process.env.NEMO_MAINTENANCE_MODE })
    .catch(error => { console.error(error instanceof Error ? error.message : "Maintenance failed"); process.exitCode = 1; });
}
