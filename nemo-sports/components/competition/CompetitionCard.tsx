import Link from "next/link";
import { competitionBySlug, type Competition } from "@/lib/core-data";
import { standings } from "@/lib/data";
import { teamBySlug } from "@/lib/core-data";

export default function CompetitionCard({ slug }: { slug: string }) {
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
          <span className="block truncate text-[13px] font-bold">{c.name}</span>
          <span className="block text-[10px] text-white/55">
            {c.country} · موسم {c.season}
          </span>
        </span>
      </div>

      <div className="flex-1 px-3 py-2.5">
        {table ? (
          <ol className="space-y-1.5">
            {table.map((r) => (
              <li key={r.team} className="flex items-center gap-2 text-[12px]">
                <span className="num w-4 shrink-0 text-[11px] font-bold text-muted">{r.pos}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{teamBySlug(r.team)?.name ?? r.team}</span>
                <span className="num shrink-0 font-extrabold">{r.points}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="py-2 text-[12px] text-muted">
            {c.teamsCount} مشارك · {c.rounds} {c.format === "بطولة فردية" ? "أدوار" : "جولة"}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[11px]">
        <span className="text-muted">{c.teamsCount} فريق</span>
        <span className="font-bold text-navy-850 transition group-hover:text-gold-600 dark:text-gold-400">
          صفحة البطولة ←
        </span>
      </div>
    </Link>
  );
}
