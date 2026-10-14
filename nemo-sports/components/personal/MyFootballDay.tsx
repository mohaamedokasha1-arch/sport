"use client";
import { useEffect, useState } from "react";
import Link from "@/components/i18n/Link";
import ProviderMatchList from "@/components/data/ProviderMatchList";
import type { NormalizedFixture } from "@/packages/sdl/src";
import type { NewsArticle } from "@/lib/news/types";
import { emptyPreferences, parsePreferences, favoriteMatch, PREFERENCES_KEY, type Preferences, type Favorite } from "@/lib/preferences";
import { matchesSearchText } from "@/lib/search-text";
import { siteDateKey } from "@/lib/tz";
import { useT } from "@/lib/i18n/context";

export default function MyFootballDay({ fixtures, provider, players, news, today }: {
  fixtures: NormalizedFixture[]; provider: string; players: Favorite[]; news: NewsArticle[]; today: string;
}) {
  const tr = useT();
  const [prefs, setPrefs] = useState<Preferences>(emptyPreferences);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const load = () => {
      try { setPrefs(parsePreferences(localStorage.getItem(PREFERENCES_KEY))); }
      catch { setMessage(tr("mfd.storageUnavailable")); }
      setReady(true);
    };
    load();
    const sync = (event: StorageEvent) => { if (event.key === PREFERENCES_KEY || event.key === null) load(); };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const options: Record<"teams" | "competitions" | "players", Favorite[]> = {
    teams: fixtures.flatMap((f) => [
      ...(f.homeProviderId && f.homeName ? [{ id: `${provider}:${f.homeProviderId}`, name: f.homeName }] : []),
      ...(f.awayProviderId && f.awayName ? [{ id: `${provider}:${f.awayProviderId}`, name: f.awayName }] : []),
    ]),
    competitions: fixtures.filter((f) => f.competitionName).map((f) => ({ id: `${provider}:${f.competitionProviderId}`, name: f.competitionName! })),
    players,
  };
  const save = (next: Preferences) => {
    setPrefs(next);
    try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next)); setMessage(tr("mfd.saved")); }
    catch { setMessage(tr("mfd.saveFailed")); }
  };
  const selected = fixtures.filter((f) => favoriteMatch(f, prefs, provider));
  const favoriteNames = [...prefs.teams, ...prefs.competitions, ...prefs.players].map((x) => x.name);
  const related = news.filter((n) => favoriteNames.some((name) => matchesSearchText(name, n.title, ...n.relatedEntities.map((e) => e.displayName))));
  const groups = [
    { title: tr("mfd.groupToday"), data: selected.filter((f) => siteDateKey(f.scheduledAt) === today) },
    { title: tr("mfd.groupUpcoming"), data: selected.filter((f) => f.status === "scheduled" && siteDateKey(f.scheduledAt) > today) },
    { title: tr("mfd.groupRecent"), data: selected.filter((f) => f.status === "finished").sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)).slice(0, 12) },
  ];
  return <div className="space-y-6">
    <section className="card p-4">
      <h2 className="text-lg font-bold">{tr("mfd.chooseHeading")}</h2>
      <p className="my-2 text-sm text-muted">{tr("mfd.chooseNote")}</p>
      {!ready ? <p role="status">{tr("mfd.reading")}</p> : <div className="grid gap-4 md:grid-cols-3">
        {(["teams", "competitions", "players"] as const).map((kind) => {
          const choices = [...new Map([...prefs[kind], ...options[kind]].map((x) => [x.id, x])).values()];
          return <fieldset key={kind} className="rounded border border-line p-3"><legend className="px-2 font-bold">{{ teams: tr("mfd.kindTeams"), competitions: tr("mfd.kindCompetitions"), players: tr("mfd.kindPlayers") }[kind]}</legend>
            <div className="max-h-60 overflow-y-auto">{choices.length === 0 ? <p className="text-sm text-muted">{tr("mfd.noChoices")}</p> : choices.map((x) => <label className="flex min-h-11 items-center gap-2 text-sm" key={x.id}>
              <input type="checkbox" checked={prefs[kind].some((p) => p.id === x.id)} onChange={(e) => save({ ...prefs, [kind]: e.target.checked ? [...prefs[kind], x].slice(0, 50) : prefs[kind].filter((p) => p.id !== x.id) })} />{x.name}
            </label>)}</div>
          </fieldset>;
        })}
      </div>}
      <p role="status" className="mt-3 text-sm text-muted">{message}</p>
      <button type="button" disabled={!ready} className="focus-ring mt-3 min-h-11 rounded border border-line px-3 text-sm" onClick={() => {
        setPrefs(emptyPreferences());
        try { localStorage.removeItem(PREFERENCES_KEY); setMessage(tr("mfd.cleared")); }
        catch { setMessage(tr("mfd.clearFailed")); }
      }}>{tr("mfd.clearAll")}</button>
    </section>
    {groups.map((group) => <section key={group.title}><h2 className="mb-3 text-lg font-bold">{group.title}</h2>{group.data.length ? <ProviderMatchList fixtures={group.data} /> : <p className="card p-4 text-sm text-muted">{tr("mfd.noMatches")}</p>}</section>)}
    <section><h2 className="mb-3 text-lg font-bold">{tr("mfd.relatedNews")}</h2>{related.length ? <ul className="card divide-y divide-line">{related.slice(0, 12).map((n) => <li className="p-4" key={n.id}><a href={n.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-bold">{n.title}</a><p className="mt-1 text-xs text-muted">{n.sourceName} · <time dateTime={n.publicationDate}>{n.publicationDate.slice(0, 10)}</time> · {tr("mfd.syndicated")}</p></li>)}</ul> : <p className="card p-4 text-sm text-muted">{tr("mfd.noRelatedNews")}</p>}</section>
    <p className="text-sm text-muted">{tr("mfd.footerLead")}<Link href="/standings" className="underline">{tr("mfd.footerStandings")}</Link>{tr("mfd.footerMiddle")}<Link href="/matches" className="underline">{tr("mfd.footerMatches")}</Link>{tr("mfd.footerTail")}</p>
  </div>;
}
