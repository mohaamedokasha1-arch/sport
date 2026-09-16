import { allMatches, type Match } from "./data";
import { getLiveStates } from "./live";
import { teamBySlug } from "./core-data";

export type MatchQuery = {
  sport?: string;
  competition?: string;
  date?: string;
  status?: string;
  team?: string;
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u0652]/g, "");

const dayDiff = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      86400000,
  );
};

export function filterMatches(q: MatchQuery, now = Date.now()) {
  const states = getLiveStates(undefined, now);

  return allMatches.filter((m) => {
    if (q.sport && m.sport !== q.sport) return false;
    if (q.competition && m.competition !== q.competition) return false;

    const s = states[m.id]?.status ?? m.status;
    if (q.status && q.status !== "all") {
      if (q.status === "live" && s !== "LIVE" && s !== "HT") return false;
      if (q.status === "upcoming" && s !== "UPCOMING") return false;
      if (q.status === "finished" && s !== "FINISHED") return false;
    }

    const d = dayDiff(m.kickoff);
    switch (q.date) {
      case "yesterday":
        if (d !== -1) return false;
        break;
      case "tomorrow":
        if (d !== 1) return false;
        break;
      case "week":
        if (d < 0 || d > 6) return false;
        break;
      case "today":
      default:
        if (d !== 0) return false;
    }

    if (q.team) {
      const needle = norm(q.team);
      const home = teamBySlug(m.home);
      const away = teamBySlug(m.away);
      const hay = [home?.name, home?.nameEn, home?.short, away?.name, away?.nameEn, away?.short]
        .filter(Boolean)
        .map((x) => norm(String(x)));
      if (!hay.some((h) => h.includes(needle))) return false;
    }

    return true;
  });
}

export function matchCounts(now = Date.now()) {
  const states = getLiveStates(undefined, now);
  const today = allMatches.filter((m) => dayDiff(m.kickoff) === 0);
  const counts: Record<string, number> = {
    "date:yesterday": allMatches.filter((m) => dayDiff(m.kickoff) === -1).length,
    "date:today": today.length,
    "date:tomorrow": allMatches.filter((m) => dayDiff(m.kickoff) === 1).length,
    "date:week": allMatches.filter((m) => dayDiff(m.kickoff) >= 0 && dayDiff(m.kickoff) <= 6).length,
    "status:all": today.length,
    "status:live": today.filter((m) => {
      const s = states[m.id]?.status;
      return s === "LIVE" || s === "HT";
    }).length,
    "status:upcoming": today.filter((m) => states[m.id]?.status === "UPCOMING").length,
    "status:finished": today.filter((m) => states[m.id]?.status === "FINISHED").length,
  };
  return counts;
}

export function sortMatches(list: Match[], mode: "time" | "importance" = "time") {
  const copy = [...list];
  if (mode === "importance") {
    return copy.sort(
      (a, b) =>
        Number(!!b.featured) - Number(!!a.featured) ||
        (b.viewers ?? 0) - (a.viewers ?? 0) ||
        +new Date(a.kickoff) - +new Date(b.kickoff),
    );
  }
  return copy.sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff));
}
