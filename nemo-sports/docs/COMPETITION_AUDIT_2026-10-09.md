# Competition audit and integration — 2026-10-09

Scope: football competitions served through the SDL (SportScore keyless, Football-Data free tier).
Evidence: live `GET` requests to `https://sportscore.com/api/widget/*` and `https://www.football-data.org/coverage`
made on 2026-10-09 via read-only fetch. Nothing was inferred from names, docs or config alone.
Other sports (basketball, tennis, cricket) were not audited in this pass.

## Classification

- **A — integrated:** catalogue page, provider standings verified.
- **B — supported but missing:** provider verified, no catalogue page (added in this change).
- **C — configured but broken:** configured id does not resolve on the provider (fixed in this change).
- **D — plan-limited:** provider data only on a paid tier (not added).
- **E — unverifiable / not found:** no valid provider id found from this environment (not added).

## Inventory

| Competition | Code | Provider id verified | Class | Status after this change |
|---|---|---|---|---|
| Premier League | PL | SportScore `english-premier-league` (standings ✔) | A | Unchanged |
| La Liga | PD | SportScore `spanish-la-liga` (standings ✔) | A | Unchanged |
| Serie A | SA | SportScore `italian-serie-a` (standings ✔) | A | Unchanged |
| Bundesliga | BL1 | SportScore `bundesliga` (standings ✔) | A | Unchanged |
| Ligue 1 | FL1 | SportScore `french-ligue-1` (standings ✔) | A | Unchanged |
| UEFA Champions League | CL | SportScore `uefa-champions-league` (standings ✔) | A | Unchanged |
| Saudi Pro League | SPL | SportScore `saudi-professional-league` (standings ✔) | C → A | `providerId` corrected from `saudi-pro-league` (returns "Competition not found"); top scorers now resolve |
| Brazilian Serie A | BSA | SportScore `brazilian-serie-a` (standings ✔; matches seen in feed) | B | Catalogue page added (already a Football-Data free-tier code) |
| Egyptian Premier League | EGY | SportScore `egyptian-premier-league` (standings ✔, top scorers ✔) | B | Added; public path `/competitions/egyptian-league` (existing slug) |
| CAF Champions League | CAF | SportScore `caf-champions-league` (standings ✔) | B | Added; public path `/competitions/caf-champions-league` (existing slug) |
| CAF Confederation Cup | CAFC | SportScore `caf-confederation-cup` (standings ✔) | B | Added |
| UEFA Europa League | UEL | SportScore `uefa-europa-league` (standings ✔) | B | Added |
| CONCACAF League Champions Cup | CCL | SportScore `concacaf-league-champions-cup` (standings ✔; match seen in feed) | B | Added |
| USL Championship (2nd tier, USA) | USL | SportScore `usl-championship` (standings ✔; match seen in feed) | B | Added |
| Japanese J1 League | J1 | SportScore `japanese-j1-league` (standings ✔) | B | Added |
| Eredivisie | DED | SportScore `eredivisie` → not found | E (FD-only) | Not added; Football-Data code exists but has no page |
| Primeira Liga | PPL | SportScore `portuguese-primeira-liga` → not found | E (FD-only) | Not added |
| Championship (England) | ELC | SportScore `english-championship` and `english-league-championship` → not found | E (FD-only) | Not added |
| FIFA World Cup / UEFA Euro | WC / EC | Not probed on SportScore (`fifa-world-cup`, `uefa-euro` configured) | E | Not added |
| Egyptian Cup | — | SportScore `egyptian-cup` standings and bracket → not found | E | Not added |
| UEFA Conference League | — | SportScore `uefa-conference-league` → not found | E | Not added |
| Copa Sudamericana | — | SportScore `copa-sudamericana` → not found | E | Not added |
| Copa Libertadores | — | SportScore `copa-libertadores` → not found | E | Not added |
| MLS | — | SportScore `major-league-soccer` → not found | D/E | Not added (Football-Data lists MLS only on a paid tier) |
| Liga MX | — | SportScore `liga-mx` → not found; Football-Data lists it only on a paid tier | D/E | Not added |
| Chinese Super League | — | SportScore `chinese-super-league` → not found | E | Not added |

## Football-Data free tier

The live coverage page at `football-data.org/coverage` lists the free tier as: Champions League, Primeira Liga, Premier League, Eredivisie, Bundesliga, Ligue 1, Serie A, La Liga, Championship, Brazil Serie A, World Cup, European Championship. This matches the 12 codes already hardcoded in `packages/sdl/src/adapters/football-data.ts`. Egypt, CAF, Europa League, CONCACAF, USL and J1 are not on the free tier, so none of them can be sourced from Football-Data without a paid plan. No paid service was added.

## Known gaps

- SportScore's `matches/` feed is a rolling sample of about 50 recent matches with no competition filter. Standings are verified for every addition, but fixtures for a competition appear only when that competition is in the sample. In the 2026-10-09 snapshot, matches were seen for the CONCACAF, USL and Brazilian competitions, but not for Egypt, CAF, Europa League or J1.
- The Football-Data adapter's SportScore aliases for `DED`, `PPL` and `ELC` are invalid on SportScore. They only matter for the SportScore fallback path, and those codes have no pages.
- Pages for competitions with no provider data show an honest "unavailable" state (verified locally: `/competitions/egyptian-league`).
