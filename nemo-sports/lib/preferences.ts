import type { NormalizedFixture } from "@/packages/sdl/src";
export const PREFERENCES_KEY = "nemo-football-day-v1";
export type Favorite = { id: string; name: string };
export type Preferences = { version: 1; teams: Favorite[]; competitions: Favorite[]; players: Favorite[] };
export const emptyPreferences = (): Preferences => ({ version: 1, teams: [], competitions: [], players: [] });

/** Treat local storage as untrusted, cap size and deduplicate before rendering. */
export function parsePreferences(raw: string | null): Preferences {
  if (!raw || raw.length > 50000) return emptyPreferences();
  try {
    const value = JSON.parse(raw);
    if (!value || value.version !== 1) return emptyPreferences();
    const list = (input: unknown): Favorite[] => !Array.isArray(input) ? [] : [...new Map(input
      .filter((x) => x && typeof x.id === "string" && typeof x.name === "string" && x.id.length > 0 && x.id.length <= 240 && x.name.length > 0 && x.name.length <= 160)
      .slice(0, 50).map((x: Favorite) => [x.id, { id: x.id, name: x.name }])).values()];
    return { version: 1, teams: list(value.teams), competitions: list(value.competitions), players: list(value.players) };
  } catch { return emptyPreferences(); }
}

export function favoriteMatch(f: NormalizedFixture, preferences: Preferences, provider: string): boolean {
  return preferences.teams.some((t) => t.id === `${provider}:${f.homeProviderId}` || t.id === `${provider}:${f.awayProviderId}`) ||
    preferences.competitions.some((c) => c.id === `${provider}:${f.competitionProviderId}`);
}
