import Link from "@/components/i18n/Link";
import Crest from "@/components/ui/Crest";
import { teamBySlug } from "@/lib/core-data";
import type { StandingRow } from "@/lib/data";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";
import { entityName } from "@/lib/i18n/names";

const zoneStyle: Record<string, string> = {
  ucl: "bg-gold-500",
  uel: "bg-win",
  rel: "bg-live",
};

/** Zone ids are data values; only their rendered label is translated. */
const ZONE_KEY = {
  ucl: "standings.zone.ucl",
  uel: "standings.zone.uel",
  rel: "standings.zone.rel",
} as const;

export default function StandingsTable({ rows, locale }: { rows: StandingRow[]; locale: Locale }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[12px]">
          <thead>
            <tr className="border-b border-line bg-navy-850/[0.04] text-[11px] text-muted dark:bg-white/[0.04]">
              <th className="px-3 py-2.5 text-start font-semibold">#</th>
              <th className="px-3 py-2.5 text-start font-semibold">{tr("standings.team")}</th>
              <th className="num px-2 py-2.5 font-semibold" title={tr("standings.tip.played")}>{tr("standings.played")}</th>
              <th className="num px-2 py-2.5 font-semibold" title={tr("standings.tip.won")}>{tr("standings.won")}</th>
              <th className="num px-2 py-2.5 font-semibold" title={tr("standings.tip.drawn")}>{tr("standings.drawn")}</th>
              <th className="num px-2 py-2.5 font-semibold" title={tr("standings.tip.lost")}>{tr("standings.lost")}</th>
              <th className="num px-2 py-2.5 font-semibold" title={tr("standings.tip.goalsFor")}>{tr("standings.goalsFor")}</th>
              <th className="num px-2 py-2.5 font-semibold" title={tr("standings.tip.goalsAgainst")}>{tr("standings.goalsAgainst")}</th>
              <th className="num px-2 py-2.5 font-semibold" title={tr("standings.tip.goalDifference")}>±</th>
              <th className="num px-2 py-2.5 font-semibold">{tr("standings.form")}</th>
              <th className="num px-3 py-2.5 font-semibold">{tr("standings.points")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const team = teamBySlug(r.team);
              const gd = r.gf - r.ga;
              return (
                <tr key={r.team} className="border-b border-line transition last:border-0 hover:bg-navy-850/[0.03] dark:hover:bg-white/[0.04]">
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1.5">
                      {r.zone ? <span className={`h-4 w-1 rounded-full ${zoneStyle[r.zone]}`} title={tr(ZONE_KEY[r.zone as keyof typeof ZONE_KEY])} aria-hidden /> : null}
                      <span className="num font-extrabold">{r.pos}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {team ? (
                      <Link href={`/teams/${team.slug}`} className="flex items-center gap-2 font-bold transition hover:text-gold-600 dark:hover:text-gold-400">
                        <Crest slug={team.slug} size={22} />
                        {entityName(locale, team)}
                      </Link>
                    ) : (
                      <span className="font-semibold text-muted">{r.team}</span>
                    )}
                  </td>
                  <td className="num px-2 py-2.5 text-center">{r.played}</td>
                  <td className="num px-2 py-2.5 text-center">{r.won}</td>
                  <td className="num px-2 py-2.5 text-center">{r.drawn}</td>
                  <td className="num px-2 py-2.5 text-center">{r.lost}</td>
                  <td className="num px-2 py-2.5 text-center">{r.gf}</td>
                  <td className="num px-2 py-2.5 text-center">{r.ga}</td>
                  <td className="num px-2 py-2.5 text-center font-semibold">
                    {gd > 0 ? `+${gd}` : gd}
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="flex gap-0.5" dir="ltr" aria-label={tr("standings.formAria", { form: r.form.join(" ") })}>
                      {r.form.map((f, i) => (
                        <span
                          key={i}
                          className={`grid h-4 w-4 place-items-center rounded-[2px] text-[9px] font-extrabold text-white ${
                            f === "W" ? "bg-win" : f === "D" ? "bg-muted" : "bg-live"
                          }`}
                        >
                          {f}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="num px-3 py-2.5 text-center text-[13px] font-extrabold">{r.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-line px-3 py-2 text-[10px] text-muted">
        {Object.entries(ZONE_KEY).map(([k, key]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`h-3 w-1 rounded-full ${zoneStyle[k]}`} aria-hidden /> {tr(key)}
          </span>
        ))}
        <span className="ms-auto">{tr("standings.legend")}</span>
      </div>
    </div>
  );
}
