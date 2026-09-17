import Link from "next/link";
import PoweredBy from "@/components/ui/PoweredBy";
import type { NormalizedFixture } from "@/packages/sdl/src";

/**
 * Renders REAL matches coming from the Sports Data Layer (SportScore) in the
 * NEMO visual language. Everything shown comes from the provider payload —
 * when a field is missing it renders "—" rather than an invented value.
 */

const STATUS_AR: Record<string, string> = {
  live: "مباشر",
  halftime: "استراحة",
  extra_time: "وقت إضافي",
  penalty_shootout: "ركلات الترجيح",
  finished: "انتهت",
  scheduled: "لم تبدأ",
  postponed: "مؤجَّلة",
  cancelled: "ملغاة",
  suspended: "موقوفة",
  abandoned: "متوقفة",
  walkover: "انسحاب",
};

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });

export function MatchStatePill({ fixture }: { fixture: NormalizedFixture }) {
  const live = ["live", "halftime", "extra_time", "penalty_shootout"].includes(fixture.status);
  if (live) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-[3px] bg-live-red/10 px-1.5 py-0.5 text-[11px] font-extrabold text-live-red">
        <span className="live-dot" aria-hidden />
        {fixture.status === "halftime" ? "استراحة" : fixture.minute !== null ? `${fixture.minute}'` : "مباشر"}
      </span>
    );
  }
  if (fixture.status === "scheduled") {
    return <span className="num shrink-0 text-[12px] font-bold text-muted">{timeOf(fixture.scheduledAt)}</span>;
  }
  if (fixture.status === "finished") {
    return <span className="shrink-0 text-[11px] font-bold text-muted">انتهت</span>;
  }
  return (
    <span className="shrink-0 text-[11px] font-bold text-muted">
      {STATUS_AR[fixture.status] ?? fixture.status}
    </span>
  );
}

export default function ProviderMatchList({
  fixtures,
  showCompetition = true,
  footer = true,
}: {
  fixtures: NormalizedFixture[];
  showCompetition?: boolean;
  footer?: boolean;
}) {
  return (
    <div className="space-y-2">
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {fixtures.map((f) => {
          const live = ["live", "halftime", "extra_time", "penalty_shootout"].includes(f.status);
          const played = f.homeScore !== null && f.awayScore !== null;
          return (
            <li key={f.providerId}>
              <Link
                href={`/matches/${f.providerId}`}
                className={`card flex items-center gap-3 px-3 py-2.5 transition hover:border-gold-500/50 ${live ? "border-live-red/40" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  {showCompetition && f.competitionName ? (
                    <p className="mb-1 truncate text-[10.5px] text-muted">{f.competitionName}</p>
                  ) : null}
                  <p className="flex items-center gap-1.5 truncate text-[13px] font-bold">
                    {f.homeLogoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.homeLogoUrl} alt="" width={16} height={16} loading="lazy" className="h-4 w-4 shrink-0 object-contain" />
                    ) : null}
                    <span className="truncate">{f.homeName ?? f.homeProviderId ?? "—"}</span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] font-bold">
                    {f.awayLogoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={f.awayLogoUrl} alt="" width={16} height={16} loading="lazy" className="h-4 w-4 shrink-0 object-contain" />
                    ) : null}
                    <span className="truncate">{f.awayName ?? f.awayProviderId ?? "—"}</span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-center gap-1">
                  {played ? (
                    <span className="num text-[16px] font-extrabold tabular-nums">
                      {f.homeScore} : {f.awayScore}
                    </span>
                  ) : (
                    <span className="text-[13px] font-extrabold text-muted">— : —</span>
                  )}
                  <MatchStatePill fixture={f} />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {footer ? (
        <div className="flex items-center justify-between text-[10.5px] text-muted">
          <span>البيانات من مصدر حي عبر طبقة البيانات · تُحدَّث تلقائيًا</span>
          <PoweredBy />
        </div>
      ) : null}
    </div>
  );
}
