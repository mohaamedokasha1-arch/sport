import Link from "next/link";
import PoweredBy from "@/components/ui/PoweredBy";
import ProviderCrest from "@/components/ui/ProviderCrest";
import { SITE_TZ } from "@/lib/tz";
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
  extra_time_halftime: "استراحة الوقت الإضافي",
  penalty_shootout: "ركلات الترجيح",
  finished: "انتهت",
  scheduled: "لم تبدأ",
  postponed: "مؤجَّلة",
  cancelled: "ملغاة",
  suspended: "موقوفة",
  abandoned: "متوقفة",
  walkover: "انسحاب",
  awarded: "حُسمت بقرار",
};

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", timeZone: SITE_TZ });

export function MatchStatePill({ fixture }: { fixture: NormalizedFixture }) {
  const live = ["live", "halftime", "extra_time", "extra_time_halftime", "penalty_shootout"].includes(fixture.status);
  if (live) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-[3px] bg-live-red/10 px-1.5 py-0.5 text-[11px] font-extrabold text-live-red">
        <span className="live-dot" aria-hidden />
        {["halftime", "extra_time_halftime"].includes(fixture.status) ? "استراحة" : fixture.minute !== null ? `${fixture.minute}'` : "مباشر"}
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
      {STATUS_AR[fixture.status] ?? "حالة غير معروفة"}
    </span>
  );
}

export default function ProviderMatchList({
  fixtures,
  showCompetition = true,
  footer = false,
  view = "grid",
}: {
  fixtures: NormalizedFixture[];
  showCompetition?: boolean;
  footer?: boolean;
  view?: "grid" | "list";
}) {
  return (
    <div className="space-y-2">
      <ul className={view === "list" ? "space-y-2" : "grid gap-2 sm:grid-cols-2 lg:grid-cols-3"}>
        {fixtures.map((f) => {
          const live = ["live", "halftime", "extra_time", "extra_time_halftime", "penalty_shootout"].includes(f.status);
          const played = f.homeScore !== null && f.awayScore !== null;
          return (
            <li key={f.providerId}>
              <Link
                href={`/matches/${encodeURIComponent(f.providerId)}`}
                className={`card focus-ring flex items-center gap-3 px-3 py-2.5 transition hover:border-gold-500/50 ${live ? "border-live-red/40" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  {showCompetition && f.competitionName ? (
                    <p className="mb-1 truncate text-[10.5px] text-muted">{f.competitionName}</p>
                  ) : null}
                  <p className="flex items-center gap-1.5 truncate text-[13px] font-bold">
                    <ProviderCrest name={f.homeName ?? f.homeProviderId ?? "الفريق المستضيف"} logoUrl={f.homeLogoUrl} size={22} />
                    <span className="truncate">{f.homeName ?? f.homeProviderId ?? "—"}</span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] font-bold">
                    <ProviderCrest name={f.awayName ?? f.awayProviderId ?? "الفريق الضيف"} logoUrl={f.awayLogoUrl} size={22} />
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
        <div className="flex items-center justify-end text-[11px] text-muted">
          <PoweredBy />
        </div>
      ) : null}
    </div>
  );
}
