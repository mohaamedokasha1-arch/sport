import PoweredByFootballData from "@/components/ui/PoweredByFootballData";
import { SITE_TZ } from "@/lib/tz";

/**
 * Provenance line rendered directly under a data surface.
 *
 * It answers three questions a visitor (and a licence reviewer) is entitled to
 * ask: which source produced this, is it live or cached, and when was it
 * fetched. When the source is Football-Data.org the required dofollow
 * attribution travels with the data itself, not only with the page footer.
 *
 * Props are plain values so this stays a presentational server component and
 * can never pull the provider integration into a client bundle.
 */

/** Human label for a provider name coming back from the SDL. */
export function providerLabel(provider: string): string {
  const labels: Record<string, string> = {
    football_data: "Football-Data.org",
    sportscore: "SportScore",
    sportapi: "SportAPI",
    sportradar: "Sportradar",
    sportmonks: "SportMonks",
    api_football: "API-Football",
    thesportsdb: "TheSportsDB",
    demo: "بيانات توضيحية (وضع التطوير)",
    admin: "تحريري (إدارة نيمو سبورتس)",
  };
  return labels[provider] ?? provider;
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", timeZone: SITE_TZ });

export function originLabel(provider: string, fromCache: boolean): string {
  if (provider === "demo") return "بيانات المعاينة";
  if (provider === "admin") return "من سجل التحرير";
  if (fromCache) return "من الكاش";
  return "جلب مباشر";
}

export default function DataSourceNote({
  provider,
  fromCache = false,
  stale = false,
  fetchedAt,
  ttlSeconds,
  className = "",
}: {
  provider: string;
  fromCache?: boolean;
  stale?: boolean;
  fetchedAt?: string;
  ttlSeconds?: number;
  className?: string;
}) {
  const origin = originLabel(provider, fromCache);
  const cacheHint = fromCache && ttlSeconds ? ` (صلاحية ${Math.round(ttlSeconds / 60)} د)` : "";
  return (
    <div className={`flex flex-wrap items-center gap-2 text-[10.5px] text-muted ${className}`}>
      <span>
        المصدر: <span className="font-bold text-ink dark:text-white/80">{providerLabel(provider)}</span>
        {` · ${origin}${cacheHint}`}
        {fetchedAt ? ` · آخر تحديث ${timeOf(fetchedAt)}` : ""}
      </span>
      {stale ? (
        <span className="rounded-[3px] bg-warn-500/15 px-1.5 py-0.5 font-bold text-warn-600 dark:text-warn-400">
          المصدر متعطّل مؤقتًا — نعرض آخر قيمة صحيحة
        </span>
      ) : null}
      {provider === "football_data" ? <PoweredByFootballData /> : null}
    </div>
  );
}
