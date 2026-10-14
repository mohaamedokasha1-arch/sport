import Link from "next/link";
import { competitionBySlug, type Competition } from "@/lib/core-data";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";
import { countryName, entityName } from "@/lib/i18n/names";
import { standings } from "@/lib/data";
import { teamBySlug } from "@/lib/core-data";

export default function CompetitionCard({ slug, locale }: { slug: string; locale: Locale }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const c = competitionBySlug(slug) as Competition;
  const table = standings[c.slug]?.slice(0, 3);

  return (
    <Link
      href={`/competitions/${c.slug}`}
      className="group card flex flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:border-gold-500/50 hover:shadow-[0_12px_28px_-16px_rgba(15,27,46,0.45)] focus-ring"
    >
      <div className="flex items-center gap-3 border-b border-line bg-navy-850 px-3 py-2.5 text-white">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[3px] bg-gold-500 font-display text-[11px] font-extrabold tracking-wider text-navy-900">
          {c.code}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-bold">{entityName(locale, c)}</span>
          <span className="block text-[10px] text-white/55">
            {tr("compCard.season", { country: countryName(locale, c.country), season: c.season })}
          </span>
        </span>
      </div>

      <div className="flex-1 px-3 py-2.5">
        {table ? (
          <ol className="space-y-1.5">
            {table.map((r) => (
              <li key={r.team} className="flex items-center gap-2 text-[12px]">
                <span className="num w-4 shrink-0 text-[11px] font-bold text-muted">{r.pos}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{entityName(locale, teamBySlug(r.team)) || r.team}</span>
                <span className="num shrink-0 font-extrabold">{r.points}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="py-2 text-[12px] text-muted">
            {tr("compCard.teamsRounds", { teams: c.teamsCount, rounds: c.rounds, unit: c.format === "بطولة فردية" ? tr("compCard.knockoutUnit") : tr("compCard.roundsUnit") })}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[11px]">
        <span className="text-muted">{tr("compCard.teamsCount", { count: c.teamsCount })}</span>
        <span className="font-bold text-navy-850 transition group-hover:text-gold-600 dark:text-gold-400">
          {tr("compCard.openPage")}
        </span>
      </div>
    </Link>
  );
}
