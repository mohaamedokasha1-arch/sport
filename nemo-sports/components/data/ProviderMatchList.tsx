"use client";

import Link from "@/components/i18n/Link";
import { useT, useLocale } from "@/lib/i18n/context";
import PoweredBy from "@/components/ui/PoweredBy";
import ProviderCrest from "@/components/ui/ProviderCrest";
import ScorePair from "@/components/ui/ScorePair";
import { matchStateOf } from "@/lib/match-state";
import { matchStateLabel, unconfirmedNote } from "@/lib/i18n/match-state";
import type { NormalizedFixture } from "@/packages/sdl/src";
import { isLiveNow } from "@/lib/match-state";
import { formatClock } from "@/lib/i18n/dates";
import type { Locale } from "@/lib/i18n/locales";
import { competitionLabelFromRecord, fixtureTeamName } from "@/lib/i18n/names";

/**
 * Renders REAL matches coming from the Sports Data Layer (SportScore) in the
 * NEMO visual language. Everything shown comes from the provider payload —
 * when a field is missing it renders "—" rather than an invented value.
 */

/* Locale-aware clock: a hardcoded "ar-EG" printed Arabic-Indic digits (٠٢:٠٠ م)
   as soon as this list had a fixture to render on /en. The shared formatter
   (lib/i18n/dates.ts) is the same one every other surface uses. */
const timeOf = (locale: Locale, iso: string) => formatClock(locale, iso);

export function MatchStatePill({ fixture, now = Date.now() }: { fixture: NormalizedFixture; now?: number }) {
  const tr = useT();
  const locale = useLocale();
  const state = matchStateOf(fixture.status, fixture.scheduledAt, now);
  if (state === "live") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-[3px] bg-live-red/10 px-1.5 py-0.5 text-[11px] font-extrabold text-live-red">
        <span className="live-dot" aria-hidden />
        {["halftime", "extra_time_halftime"].includes(fixture.status) ? tr("ui.break") : fixture.minute !== null ? <span dir="ltr">{`${fixture.minute}'`}</span> : tr("state.live")}
      </span>
    );
  }
  if (state === "upcoming") {
    return <span className="num shrink-0 text-[12px] font-bold text-muted">{timeOf(locale, fixture.scheduledAt)}</span>;
  }
  if (state === "finished") {
    return <span className="shrink-0 text-[11px] font-bold text-muted">{tr("state.finished")}</span>;
  }
  if (state === "unconfirmed") {
    // The stored status still says "not started" but the kickoff day is over.
    // Show the kickoff (it is the only thing the source gave us) flagged as
    // unverified, instead of presenting it as a match still to come.
    return (
      <span className="shrink-0 text-center text-[11px] font-bold text-warn-600 dark:text-warn-400" title={unconfirmedNote(locale, fixture.status)}>
        <span className="num">{timeOf(locale, fixture.scheduledAt)}</span>
        <span className="mt-0.5 block text-[10px] font-extrabold">{tr("ui.unconfirmed")}</span>
      </span>
    );
  }
  return (
    <span className="shrink-0 text-[11px] font-bold text-muted">
      {matchStateLabel(locale, state)}
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
  const tr = useT();
  const locale = useLocale();
  return (
    <div className="space-y-2">
      <ul className={view === "list" ? "space-y-2" : "grid gap-2 sm:grid-cols-2 lg:grid-cols-3"}>
        {fixtures.map((f) => {
          const live = isLiveNow(f.status, f.scheduledAt);
          const played = f.homeScore !== null && f.awayScore !== null;
          return (
            <li key={f.providerId}>
              <Link
                href={`/matches/${encodeURIComponent(f.providerId)}`}
                className={`card focus-ring flex items-center gap-3 px-3 py-2.5 transition hover:border-gold-500/50 ${live ? "border-live-red/40" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  {f.editorialUpdatedAt && <p className="mb-1 text-[10px] text-muted">{tr("ui.editorialEntry")}</p>}
                  {showCompetition && (f.competitionName || f.competitionNameEn) ? (
                    <p dir="auto" className="mb-1 truncate text-right text-[10.5px] text-muted">{competitionLabelFromRecord(locale, f)}</p>
                  ) : null}
                  <p className="flex min-w-0 items-center gap-2 text-[13px] font-bold">
                    <ProviderCrest name={fixtureTeamName(locale, f, "home", tr("ui.homeTeamFallback"))} logoUrl={f.homeLogoUrl} size={22} />
                    <span dir="auto" className="min-w-0 truncate" title={fixtureTeamName(locale, f, "home", undefined)}>{fixtureTeamName(locale, f, "home")}</span>
                  </p>
                  <p className="mt-1 flex min-w-0 items-center gap-2 text-[13px] font-bold">
                    <ProviderCrest name={fixtureTeamName(locale, f, "away", tr("ui.awayTeamFallback"))} logoUrl={f.awayLogoUrl} size={22} />
                    <span dir="auto" className="min-w-0 truncate" title={fixtureTeamName(locale, f, "away", undefined)}>{fixtureTeamName(locale, f, "away")}</span>
                  </p>
                  {/* Declared TV channels for this match only (editorial). No
                      list → no line, instead of a guess or a site-wide answer. */}
                  {f.channels && f.channels.length > 0 ? (
                    <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[10.5px] text-muted" title={f.channels.join(" · ")}>
                      <span aria-hidden>📺</span>
                      <span dir="auto" className="min-w-0 truncate">{f.channels.join(" · ")}</span>
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-center gap-1">
                  {played ? (
                    <ScorePair home={f.homeScore} away={f.awayScore} className="text-[16px] font-extrabold" />
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
