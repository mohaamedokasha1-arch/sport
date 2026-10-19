#!/usr/bin/env node
/**
 * Run from a trusted scheduler (GitHub Actions / VPS cron), never from a
 * browser. No dependencies and no secrets or provider payloads in logs.
 * The jobs are sequential: sports-sync holds one distributed DB lease.
 */
import { pathToFileURL } from "node:url";

export function siteOrigin(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("NEMO_SITE_URL must be an https origin"); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("NEMO_SITE_URL must be an https origin (no path, credentials, query or fragment)");
  }
  return url;
}

/** The scheduler checks the RESPONSE BODY, not just HTTP 200/207/409. */
export async function refreshLeagues({ siteUrl, secret, fetchImpl = fetch, log = console.log }) {
  const origin = siteOrigin(siteUrl);
  if (!secret) throw new Error("NEMO_CRON_SECRET is not configured in the scheduler");
  const results = [];
  const failures = [];
  for (const job of ["matchday", "tick"]) {
    try {
      const response = await fetchImpl(new URL(`/api/cron/sports-sync/${job}`, origin), {
        headers: { authorization: `Bearer ${secret}` },
        redirect: "error", // never forward a bearer token to a redirected host
        signal: AbortSignal.timeout(55_000),
      });
      const body = await response.json().catch(() => null);
      // A 409 can mean a harmless cadence/lease skip OR no usable provider.
      // The latter is a deployment error, not a successful refresh.
      const run = body?.run;
      const empty = Array.isArray(run?.failures) && run.failures.some(f => String(f).includes("no_supported_work"));
      if (response.status === 401 || response.status === 503 || !run && !body?.skipped) {
        throw new Error(`${job}: refresh refused (HTTP ${response.status}); check server DB/Redis, provider and cron-secret configuration`);
      }
      if (job === "matchday" && empty) throw new Error("matchday: no provider can fetch complete football days");
      if (!response.ok && !(response.status === 409 && run?.status === "skipped")) {
        throw new Error(`${job}: sync ${run?.status ?? "failed"} (HTTP ${response.status}, ${run?.failures?.length ?? 0} failures)`);
      }
      if (run && !["success", "skipped"].includes(run.status)) {
        throw new Error(`${job}: sync ${run.status} (${run.failures?.length ?? 0} failures)`);
      }
      const status = run?.status ?? (body?.skipped ? "nothing_due" : "unknown");
      log(`${job}: ${status} · tasks ${run?.tasks ?? 0} · fixtures ${run?.entities?.fixture?.fetched ?? 0} · changes ${(run?.inserted ?? 0) + (run?.updated ?? 0)}`);
      results.push({ job, status });
    } catch (error) {
      // A broken day feed must not starve background catalog/season jobs; run
      // both, then fail the workflow visibly instead of reporting success.
      failures.push((error instanceof Error ? error.message : `${job}: unknown error`).replaceAll(secret, "[redacted]"));
    }
  }
  if (failures.length) throw new Error(failures.join("; "));
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  refreshLeagues({ siteUrl: process.env.NEMO_SITE_URL, secret: process.env.NEMO_CRON_SECRET })
    .catch(error => { console.error(error instanceof Error ? error.message : "League refresh failed"); process.exitCode = 1; });
}
