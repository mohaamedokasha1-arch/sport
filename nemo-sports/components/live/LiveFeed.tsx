import Link from "@/components/i18n/Link";
import { liveMatches } from "@/lib/sdl-gateway";
import { getCanonicalStore } from "@/lib/db/pg";
import { demoContentVisible } from "@/lib/site";
import { SITE_TZ } from "@/lib/tz";
import type { Locale } from "@/lib/i18n/locales";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";
import { formatClock } from "@/lib/i18n/dates";
import type { UUID } from "@/packages/sdl/src";

/**
 * The provider board — the first surface on the site fed by the data layer.
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads live matches from the SDL (not from a hand-written data file) and
 * resolves team names from the canonical store. When there is no real provider
 * or database it says so explicitly instead of inventing matches — no fake data
 * on an indexed page.
 *
 * `locale` defaults to Arabic; this component is not currently mounted on any
 * route, and the default keeps its published wording if it is wired up again.
 */

/** Machine statuses from the SDL; only the rendered label is translated. */
const STATUS_KEY = new Set([
  "live", "halftime", "scheduled", "finished", "postponed", "cancelled", "suspended", "abandoned",
]);

export default async function LiveFeed({ sport = "football", locale = DEFAULT_LOCALE }: { sport?: string; locale?: Locale }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const result = await liveMatches(sport);

  if (!result.ok) {
    return (
      <section className="mb-6 rounded-[6px] border border-line bg-white p-4 dark:border-navy-800 dark:bg-navy-900">
        <h2 className="mb-2 text-[15px] font-extrabold">{tr("lf.title")}</h2>
        <p className="text-[13px] leading-6 text-ink-soft dark:text-white/60">
          {tr("lf.unavailable", { kind: result.error.kind })}
        </p>
      </section>
    );
  }

  const store = await getCanonicalStore();

  /**
   * §Instruction 12 — the SDL's offline demo adapter also returns `ok: true`
   * rows. In production (demo content hidden) those rows are NOT real data,
   * so they must never be presented as live scores. Show the honest state
   * instead; with real provider keys configured, `source` is "provider" and
   * the rows render normally.
   */
  if (!demoContentVisible() && result.source === "demo") {
    return (
      <section className="mb-6 rounded-[6px] border border-line bg-white p-4 dark:border-navy-800 dark:bg-navy-900">
        <h2 className="mb-2 text-[15px] font-extrabold">{tr("lf.title")}</h2>
        <p className="text-[13px] leading-6 text-ink-soft dark:text-white/60">
          {tr("lf.demoHidden")}
        </p>
      </section>
    );
  }

  // Resolve display names from the canonical store; an unmapped team keeps its
  // provider reference visible rather than being silently invented.
  const names = new Map<string, string>();
  if (store) {
    for (const t of await store.teams.list()) {
      for (const m of await store.mappings.forEntity("team", t.id as UUID)) {
        names.set(`${m.provider}:${m.providerId}`, t.name.ar || t.name.en);
      }
    }
  }

  const rows = result.data;

  return (
    <section className="mb-6 overflow-hidden rounded-[6px] border border-line bg-white dark:border-navy-800 dark:bg-navy-900">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 dark:border-navy-800">
        <h2 className="text-[15px] font-extrabold">{tr("lf.title")}</h2>
        <p className="num text-[11px] text-ink-soft dark:text-white/50">
          {tr("lf.provenance", {
            provider: result.provider,
            origin: result.fromCache ? tr("ds.fetch.cache") : tr("ds.fetch.live"),
            stale: result.stale ? tr("lf.staleSuffix") : "",
            time: new Date(result.fetchedAt).toLocaleTimeString(locale === "ar" ? "ar-EG" : "en-GB", { timeZone: SITE_TZ }),
          })}
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-[13px] text-ink-soft dark:text-white/60">{tr("lf.noLive")}</p>
      ) : (
        <ul className="divide-y divide-line dark:divide-navy-800">
          {rows.slice(0, 12).map((f) => (
            <li key={`${f.providerId}`} className="flex items-center gap-3 px-4 py-3">
              <span className="num w-[52px] shrink-0 text-[12px] text-ink-soft dark:text-white/50">
                {formatClock(locale, f.scheduledAt)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-bold">
                {f.homeProviderId ? names.get(`${result.provider}:${f.homeProviderId}`) ?? tr("lf.teamFallback", { id: f.homeProviderId }) : "—"}
                <span className="mx-2 text-ink-soft dark:text-white/40">{tr("lf.versus")}</span>
                {f.awayProviderId ? names.get(`${result.provider}:${f.awayProviderId}`) ?? tr("lf.teamFallback", { id: f.awayProviderId }) : "—"}
              </span>
              <span className="num shrink-0 text-[15px] font-extrabold tabular-nums">
                {f.homeScore ?? "–"} : {f.awayScore ?? "–"}
              </span>
              <span className="w-[64px] shrink-0 text-end text-[11px] text-live-red">
                {STATUS_KEY.has(f.status) ? tr(`lf.status.${f.status}`) : f.status}
              </span>
            </li>
          ))}
        </ul>
      )}

      <footer className="border-t border-line px-4 py-2 text-[11px] text-ink-soft dark:border-navy-800 dark:text-white/40">
        {tr("lf.footer")}{" "}
        <Link href="/admin/providers" className="underline underline-offset-2">
          {tr("lf.providersLink")}
        </Link>
      </footer>
    </section>
  );
}
