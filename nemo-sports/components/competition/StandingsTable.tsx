import Link from "next/link";
import Crest from "@/components/ui/Crest";
import { teamBySlug } from "@/lib/core-data";
import type { StandingRow } from "@/lib/data";

const zoneStyle: Record<string, string> = {
  ucl: "bg-gold-500",
  uel: "bg-win",
  rel: "bg-live",
};

const zoneLabel: Record<string, string> = {
  ucl: "تأهل قاري",
  uel: "بطولة ثانوية",
  rel: "منطقة الهبوط",
};

export default function StandingsTable({ rows }: { rows: StandingRow[] }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[12px]">
          <thead>
            <tr className="border-b border-line bg-navy-850/[0.04] text-[11px] text-muted dark:bg-white/[0.04]">
              <th className="px-3 py-2.5 text-start font-semibold">#</th>
              <th className="px-3 py-2.5 text-start font-semibold">الفريق</th>
              <th className="num px-2 py-2.5 font-semibold" title="لعب">لعب</th>
              <th className="num px-2 py-2.5 font-semibold" title="فاز">ف</th>
              <th className="num px-2 py-2.5 font-semibold" title="تعادل">ت</th>
              <th className="num px-2 py-2.5 font-semibold" title="خسر">خ</th>
              <th className="num px-2 py-2.5 font-semibold" title="له">له</th>
              <th className="num px-2 py-2.5 font-semibold" title="عليه">عليه</th>
              <th className="num px-2 py-2.5 font-semibold" title="الفارق">±</th>
              <th className="num px-2 py-2.5 font-semibold">الحالة</th>
              <th className="num px-3 py-2.5 font-semibold">نقاط</th>
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
                      {r.zone ? <span className={`h-4 w-1 rounded-full ${zoneStyle[r.zone]}`} title={zoneLabel[r.zone]} aria-hidden /> : null}
                      <span className="num font-extrabold">{r.pos}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {team ? (
                      <Link href={`/teams/${team.slug}`} className="flex items-center gap-2 font-bold transition hover:text-gold-600 dark:hover:text-gold-400">
                        <Crest slug={team.slug} size={22} />
                        {team.name}
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
                    <span className="flex gap-0.5" dir="ltr" aria-label={`آخر 5 مباريات: ${r.form.join(" ")}`}>
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
        {Object.entries(zoneLabel).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`h-3 w-1 rounded-full ${zoneStyle[k]}`} aria-hidden /> {v}
          </span>
        ))}
        <span className="ms-auto">ف = فاز · ت = تعادل · خ = خسر · ± = فارق الأهداف</span>
      </div>
    </div>
  );
}
