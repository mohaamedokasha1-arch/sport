/**
 * NEMO Sports · one gate for every `/api/cron/*` surface
 * ─────────────────────────────────────────────────────
 * The cron routes carried byte-identical copies of this gate. They must never
 * disagree about who may spend provider quota — and a fifth copy is how the
 * disagreement starts — so the rule lives here exactly once:
 *
 *   · secrets come from `NEMO_INGEST_TOKEN`, `CRON_SECRET` and
 *     `VERCEL_CRON_SECRET` (Vercel Cron sends the last one itself);
 *   · a caller is authorized by `Authorization: Bearer <secret>` or `?token=`
 *     (some schedulers — cron-job.org, a bare curl in a runbook — cannot set
 *     headers). Both forms are compared with the same equality check and are
 *     never logged; `scrub()` keeps them out of the run history;
 *   · with NO secret configured the surface refuses with **503 not_configured**
 *     and does no work: fail closed, never run anonymously;
 *   · with a secret configured and no match, the answer is **401 unauthorized**.
 *
 * `/api/v1/ingest` keeps its own gate on purpose: its secret set is smaller
 * (`NEMO_INGEST_TOKEN` / `CRON_SECRET`, no Vercel-managed secret) and its 503
 * message says so. Nothing else should need a third variant.
 */

const SECRET_ENVS = ["NEMO_INGEST_TOKEN", "CRON_SECRET", "VERCEL_CRON_SECRET"] as const;

export function cronSecrets(): string[] {
  return SECRET_ENVS.map((key) => process.env[key]).filter((s): s is string => Boolean(s));
}

export function authorizeCron(request: Request): boolean {
  const secrets = cronSecrets();
  if (secrets.length === 0) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const query = new URL(request.url).searchParams.get("token") ?? "";
  return secrets.some((s) => s.length > 0 && (bearer === s || query === s));
}

export type CronRefusal = {
  http: 401 | 503;
  body: {
    ok: false;
    error: { code: "unauthorized" | "not_configured"; message: string };
  };
};

/**
 * The honest refusal, in the one shape every cron surface answers with.
 * `disabledReason` names what is disabled and which variables the operator must
 * set — it is the only part that differs between surfaces.
 */
export function cronRefusal(disabledReason: string): CronRefusal {
  const configured = cronSecrets().length > 0;
  return {
    http: configured ? 401 : 503,
    body: {
      ok: false,
      error: {
        code: configured ? "unauthorized" : "not_configured",
        message: configured ? "a valid bearer token (or ?token=) is required" : disabledReason,
      },
    },
  };
}
