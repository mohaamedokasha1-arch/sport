"use client";
import { useState } from "react";
import ProviderMatchList from "@/components/data/ProviderMatchList";
import type { NormalizedFixture, NormalizedTopScorer } from "@/packages/sdl/src";
import { headToHead, playerComparison, scoutTeams, teamSample, teamSelectionIssue, type TeamSelectionIssue } from "@/lib/scout";
import { useT } from "@/lib/i18n/context";

/**
 * The validation RULES live in lib/scout.ts and are covered by
 * scripts/verify-consistency.test.ts. Only the wording of an already-made
 * verdict is localized here, so a rule change cannot silently drop a label.
 */
const SELECTION_KEY: Record<Exclude<TeamSelectionIssue, null>, "scw.selection.noTeams" | "scw.selection.oneTeam" | "scw.selection.missing" | "scw.selection.same"> = {
  "no-teams": "scw.selection.noTeams",
  "one-team": "scw.selection.oneTeam",
  missing: "scw.selection.missing",
  same: "scw.selection.same",
};

const PLAYER_METRIC_KEY = {
  goals: "scw.pmGoals",
  appearances: "scw.pmAppearances",
  assists: "scw.pmAssists",
  penalties: "scw.pmPenalties",
} as const;

const METRIC_KEY = {
  played: "scw.metricPlayed",
  won: "scw.metricWon",
  drawn: "scw.metricDrawn",
  lost: "scw.metricLost",
  goalsFor: "scw.metricGoalsFor",
  goalsAgainst: "scw.metricGoalsAgainst",
} as const;

export default function ScoutWorkspace({ fixtures, scorers }: { fixtures: NormalizedFixture[]; scorers: NormalizedTopScorer[] }) {
  const tr = useT();
  // Teams are keyed by the provider id and named by the provider label; teams
  // with completed matches come first so the default comparison has numbers.
  const teams = scoutTeams(fixtures);
  const [a, setA] = useState(teams[0]?.id ?? "");
  const [b, setB] = useState(teams[1]?.id ?? "");
  const [season, setSeason] = useState("");
  const [venue, setVenue] = useState<"all" | "home" | "away">("all");
  const [p1, setP1] = useState(scorers[0]?.playerProviderId ?? "");
  const [p2, setP2] = useState(scorers[1]?.playerProviderId ?? "");
  const sample = fixtures.filter((f) => !season || f.seasonProviderId === season);
  const first = teamSample(sample, a, venue), second = teamSample(sample, b, venue);
  const meetings = headToHead(sample, a, b);
  const cls = "focus-ring min-h-11 max-w-full rounded border border-line bg-surface p-2 text-sm disabled:opacity-50";
  const issue = teamSelectionIssue(teams, a, b);
  const nameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? "—";
  const players = playerComparison(scorers, p1, p2);
  const seasons = [...new Set(fixtures.map((f) => f.seasonProviderId).filter(Boolean))];
  const resultLabel: Record<string, string> = { W: tr("scw.resultW"), D: tr("scw.resultD"), L: tr("scw.resultL") };
  return <div className="space-y-8">
    <section className="card space-y-4 p-4" aria-labelledby="scout-teams">
      <h2 id="scout-teams" className="text-xl font-bold">{tr("scw.teamsHeading")}</h2>
      <div className="flex flex-wrap gap-3">
        {([a, b] as string[]).map((value, i) => <label key={i} className="grid gap-1 text-sm">{tr("scw.teamLabel", { n: i + 1 })}<select className={cls} value={value} disabled={teams.length === 0} onChange={(e) => (i === 0 ? setA : setB)(e.target.value)}><option value="">{tr("scw.chooseTeam")}</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}{team.completed ? "" : tr("scw.noCompletedSuffix")}</option>)}</select></label>)}
        <label className="grid gap-1 text-sm">{tr("scw.seasonLabel")}<select className={cls} value={season} onChange={(e) => setSeason(e.target.value)} disabled={seasons.length === 0}><option value="">{tr("scw.allSample")}</option>{seasons.map((s) => <option key={s} value={s!}>{s}</option>)}</select></label>
        <label className="grid gap-1 text-sm">{tr("scw.venueLabel")}<select className={cls} value={venue} onChange={(e) => setVenue(e.target.value as typeof venue)}><option value="all">{tr("common.all")}</option><option value="home">{tr("scw.venueHome")}</option><option value="away">{tr("scw.venueAway")}</option></select></label>
      </div>
      <p className="text-sm text-muted">{tr("scw.sampleNote")}</p>
      <div aria-live="polite">
      {issue ? <p role="status" className="text-sm font-semibold">{tr(SELECTION_KEY[issue])}</p> : <>
        <div className="overflow-x-auto"><table className="w-full text-start text-sm"><caption className="pb-2 text-start">{tr("scw.caption", { a: nameOf(a), b: nameOf(b) })}</caption><thead><tr><th className="p-2 text-start">{tr("scw.metric")}</th><th scope="col">{nameOf(a)}</th><th scope="col">{nameOf(b)}</th></tr></thead><tbody>
          {(Object.keys(METRIC_KEY) as (keyof typeof METRIC_KEY)[]).map((key) => <tr key={key} className="border-t border-line"><th scope="row" className="p-2 text-start">{tr(METRIC_KEY[key])}</th><td className="num text-center">{first.played ? first[key] : tr("scw.unavailable")}</td><td className="num text-center">{second.played ? second[key] : tr("scw.unavailable")}</td></tr>)}
        </tbody></table></div>
        {!first.played || !second.played ? <p className="text-xs text-muted">{tr("scw.unavailableNote")}</p> : null}
        <div className="mt-3 grid gap-4 md:grid-cols-2">{[first, second].map((summary, i) => <section key={i} className="border-t border-line pt-3"><h3 className="font-bold">{tr("scw.recentHeading", { name: nameOf(i === 0 ? a : b) })}</h3><p className="my-2 text-xs text-muted">{tr("scw.samplePeriod", { from: summary.from?.slice(0, 10) ?? tr("scw.periodUnavailable"), to: summary.to?.slice(0, 10) ?? tr("scw.periodUnavailable") })}</p>
          {summary.recent.length ? <ol className="space-y-2">{summary.recent.map((r) => <li key={r.fixture.providerId} className="flex flex-wrap items-center gap-2 text-sm"><time dateTime={r.fixture.scheduledAt}>{r.fixture.scheduledAt.slice(0, 10)}</time><span>{resultLabel[r.result]}</span><span dir="ltr">{r.scored} – {r.conceded}</span><meter min={0} max={Math.max(1, ...summary.recent.map((x) => x.scored))} value={r.scored} aria-label={tr("scw.goalsAria", { n: r.scored })} /></li>)}</ol> : <p className="text-sm text-muted">{tr("scw.noCompleted")}</p>}
        </section>)}</div>
        <h3 className="mt-3 font-bold">{tr("scw.h2hHeading")}</h3>{meetings.length ? <ProviderMatchList fixtures={meetings} /> : <p className="text-sm text-muted">{tr("scw.h2hEmpty")}</p>}
      </>}
      </div>
    </section>
    <section className="card space-y-4 p-4" aria-labelledby="scout-players"><h2 id="scout-players" className="text-xl font-bold">{tr("scw.playersHeading")}</h2><p className="text-sm text-muted">{tr("scw.playersNote")}</p>
      {!scorers.length ? <p role="status">{tr("scw.scorersUnavailable")}</p> : <>
        <div className="flex flex-wrap gap-3">{[p1, p2].map((value, i) => <label className="grid gap-1 text-sm" key={i}>{tr("scw.playerLabel", { n: i + 1 })}<select className={cls} value={value} onChange={(e) => (i === 0 ? setP1 : setP2)(e.target.value)}>{scorers.map((p) => <option key={p.playerProviderId} value={p.playerProviderId}>{p.playerName ?? p.playerProviderId}{p.teamName ? ` — ${p.teamName}` : ""}</option>)}</select></label>)}</div>
        <div aria-live="polite">{players.ok ? <div className="overflow-x-auto"><table className="w-full text-sm"><caption>{tr("scw.playersCaption")}</caption><thead><tr><th className="p-2 text-start">{tr("scw.metric")}</th><th scope="col">{players.one.playerName ?? players.one.playerProviderId}</th><th scope="col">{players.two.playerName ?? players.two.playerProviderId}</th></tr></thead><tbody>{players.rows.map((row) => <tr className="border-t border-line" key={row.key}><th scope="row" className="p-2 text-start">{tr(PLAYER_METRIC_KEY[row.key])}</th><td className="num text-center">{row.one ?? tr("scw.unavailable")}</td><td className="num text-center">{row.two ?? tr("scw.unavailable")}</td></tr>)}</tbody></table></div> : <p role="status">{players.reason === "same" ? tr("scw.chooseDifferentPlayers") : tr("scw.chooseFromList")}</p>}</div>
      </>}
    </section>
  </div>;
}
