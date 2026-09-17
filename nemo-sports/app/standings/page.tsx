import type { Metadata } from "next";
import Link from "next/link";
import SectionHead from "@/components/ui/SectionHead";
import DataUnavailable from "@/components/ui/DataUnavailable";
import DataSourceNote from "@/components/data/DataSourceNote";
import { footballDataCompetitions, footballStandings, footballTopScorers, type FootballDataResult } from "@/lib/football-data";
import { demoContentVisible } from "@/lib/site";
import type { NormalizedStandingRow, NormalizedTopScorer } from "@/packages/sdl/src";
import { standings as demoStandings, topScorers as demoTopScorers } from "@/lib/data";
import { competitionBySlug, playerBySlug, teamBySlug } from "@/lib/core-data";
import StandingsTable from "@/components/competition/StandingsTable";

export const metadata: Metadata = {
  title: "الترتيب والإحصائيات — جداول الدوري والهدافون",
  description: "جداول ترتيب الدوريات الكبرى وقوائم الهدافين من Football-Data.org عبر طبقة البيانات مع كاش خلفي — بأسماء الفرق واللاعبين الحقيقية.",
  alternates: { canonical: "/standings" },
};

export const revalidate = 300;

/**
 * Football-Data.org majors — the five big leagues + the Champions League.
 * The slug is passed down (both football-data.org and the keyless fallback
 * resolve it), so nothing here is provider-specific.
 */
const MAJORS = footballDataCompetitions(true);

type CompetitionResult = {
  code: string;
  slug: string | null;
  nameAr: string;
  table: NormalizedStandingRow[] | null;
  tableError: { message: string; detail: string } | null;
  source: Extract<FootballDataResult<NormalizedStandingRow[]>, { ok: true }>["source"] | null;
  scorers: NormalizedTopScorer[] | null;
  scorersError: string | null;
};

export default async function StandingsPage() {
  /* Request order matters more than parallelism here.
   *
   * The free football-data.org plan allows 10 calls/minute and the SDL shares
   * one budget across the whole process, so the page asks for the six league
   * TABLES first (6 calls) and only then for the scorer lists. Under pressure
   * the SDL skips the excess instead of failing hard, which means a cold render
   * always completes every table, and a scorer list that had to wait simply
   * arrives on the next ISR cycle (tables are cached 15 min, scorers 60 min —
   * a warm cycle costs zero upstream calls). Never a fabricated row in between. */
  const results: CompetitionResult[] = [];
  for (const c of MAJORS) {
    const table = await footballStandings(c.slug ?? c.code);
    results.push({
      code: c.code,
      slug: c.slug,
      nameAr: c.nameAr,
      table: table.ok ? table.data : null,
      tableError: table.ok ? null : { message: table.error.message, detail: table.error.detail },
      source: table.ok ? table.source : null,
      scorers: null,
      scorersError: null,
    });
  }

  for (const r of results) {
    if (!r.table || r.table.length === 0) continue; // never spend a scorer call on a league whose table failed
    const scorers = await footballTopScorers(r.slug ?? r.code);
    r.scorers = scorers.ok ? scorers.data : null;
    r.scorersError = scorers.ok ? null : scorers.error.detail;
  }

  const okCompetitions = results.filter((r) => r.table && r.table.length > 0);

  /* ── real data → render it (never mixed with demo rows) ── */
  if (okCompetitions.length > 0) {
    const primary = okCompetitions[0].source!;
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
          <div>
            <p className="eyebrow mb-1">Standings &amp; Stats</p>
            <h1 className="text-2xl font-extrabold tracking-tight">الترتيب والإحصائيات</h1>
          </div>
          <p className="text-[12px] text-muted">
            <span className="num font-bold">{okCompetitions.length}</span> بطولة بجداول حقيقية من المصدر
          </p>
        </header>

        <DataSourceNote
          provider={primary.provider}
          fromCache={primary.fromCache}
          stale={primary.stale}
          fetchedAt={primary.fetchedAt}
          ttlSeconds={primary.ttlSeconds}
          className="mb-6"
        />

        <div className="space-y-10">
          {results.map((r) => (
            <section key={r.code} id={r.code}>
              <SectionHead eyebrow="بيانات حية" title={r.nameAr} href={`/matches?competition=${r.code}`} linkLabel="مباريات البطولة" />

              {r.table && r.table.length > 0 ? (
                <ProviderTable rows={r.table} />
              ) : (
                <div className="card px-4 py-4 text-[12px] text-muted">
                  <p className="font-bold text-ink dark:text-white/80">Data temporarily unavailable</p>
                  <p className="mt-1">
                    جدول {r.nameAr} غير متاح من المصدر الآن{r.tableError?.detail ? ` (${r.tableError.detail})` : ""} — لن نعرض
                    جدولًا تجريبيًا بديلًا.
                  </p>
                </div>
              )}

              {r.scorers && r.scorers.length > 0 ? (
                <div className="mt-4 card overflow-hidden">
                  <header className="border-b border-line bg-navy-850 px-3 py-2.5 text-white dark:bg-navy-850">
                    <h3 className="text-[13px] font-extrabold">الهدافون — {r.nameAr}</h3>
                  </header>
                  <ol className="divide-y divide-line">
                    {r.scorers.slice(0, 8).map((s) => {
                      // Link only when the local catalogue actually has the player:
                      // provider ids that resolve nowhere must not produce dead links.
                      const local = playerBySlug(s.playerProviderId);
                      const name = s.playerName ?? s.playerProviderId.replaceAll("-", " ");
                      const team = s.teamName ?? (s.teamProviderId ? s.teamProviderId.replaceAll("-", " ") : "");
                      return (
                        <li key={s.playerProviderId} className="flex items-center gap-3 px-3 py-2.5">
                          <span className="num w-5 shrink-0 text-[12px] font-extrabold text-gold-600 dark:text-gold-400">{s.goals}</span>
                          {local ? (
                            <Link href={`/players/${s.playerProviderId}`} className="min-w-0 flex-1 truncate text-[12.5px] font-bold hover:text-gold-600 dark:hover:text-gold-400">
                              {name}
                            </Link>
                          ) : (
                            <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold">{name}</span>
                          )}
                          <span className="shrink-0 text-[11px] text-muted">
                            {team} · {s.appearances ?? "—"} مباراة{s.assists !== null && s.assists !== undefined ? ` · ${s.assists} صناعة` : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ) : r.table && r.table.length > 0 ? (
                <div className="mt-4 card px-4 py-3 text-[11.5px] text-muted">
                  <span className="font-bold text-ink dark:text-white/80">Data temporarily unavailable</span> — قائمة الهدافين
                  لهذه البطولة غير متاحة من المصدر الآن{r.scorersError ? ` (${r.scorersError})` : ""}؛ ستُعاد المحاولة
                  تلقائيًا في التحديث القادم دون أي أسماء مُخترعة.
                </div>
              ) : null}
            </section>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[11px] text-muted">
            <span>الجداول تُجلب مباشرة من طبقة البيانات · كاش خلفي يقلّل الطلبات على المصدر</span>
            <DataSourceNote provider={primary.provider} fromCache={primary.fromCache} ttlSeconds={primary.ttlSeconds} />
          </div>
        </div>
      </div>
    );
  }

  /* ── development/demo fallback (never in production, never instead of a real answer) ── */
  if (demoContentVisible() && Object.keys(demoStandings).length > 0) {
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
          <div>
            <p className="eyebrow mb-1">Standings &amp; Stats</p>
            <h1 className="text-2xl font-extrabold tracking-tight">الترتيب والإحصائيات</h1>
          </div>
          <Link href="/competitions" className="text-[12px] font-bold text-navy-850 hover:text-gold-600 dark:text-gold-400">
            كل البطولات ←
          </Link>
        </header>

        <div className="space-y-10">
          {Object.entries(demoStandings).map(([comp, rows]) => {
            const c = competitionBySlug(comp);
            const scorers = demoTopScorers[comp];
            return (
              <section key={comp}>
                <SectionHead eyebrow={`${c?.country} · ${c?.season}`} title={c?.name ?? comp} href={`/competitions/${comp}`} />
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <StandingsTable rows={rows} />
                  {scorers ? (
                    <div className="card overflow-hidden">
                      <header className="border-b border-line bg-navy-850 px-3 py-2.5 text-white dark:bg-navy-850">
                        <h3 className="text-[13px] font-extrabold">الهدافون</h3>
                      </header>
                      <ol className="divide-y divide-line">
                        {scorers.map((s) => {
                          const player = playerBySlug(s.player);
                          const team = teamBySlug(s.team);
                          return (
                            <li key={s.player} className="flex items-center gap-3 px-3 py-2.5">
                              <span className="num w-4 shrink-0 text-[12px] font-extrabold text-gold-600 dark:text-gold-400">{s.pos}</span>
                              <div className="min-w-0 flex-1">
                                <Link href={`/players/${s.player}`} className="block truncate text-[12.5px] font-bold hover:text-gold-600 dark:hover:text-gold-400">
                                  {player?.name ?? s.player}
                                </Link>
                                <p className="truncate text-[10.5px] text-muted">{team?.name ?? s.team}</p>
                              </div>
                              <span className="num shrink-0 text-[13px] font-extrabold">{s.goals}</span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── honest empty state: no provider data, no demo, therefore no table ── */
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">Standings &amp; Stats</p>
          <h1 className="text-2xl font-extrabold tracking-tight">الترتيب والإحصائيات</h1>
        </div>
      </header>
      <DataUnavailable
        title="جداول الترتيب غير متوفرة حاليًا"
        message="تعذر جلب جداول الترتيب من مصدر البيانات الآن. لا نستخدم جداول تجريبية في الإنتاج — ستعود للعمل تلقائيًا عند توفر المصدر."
        hint="Football-Data.org: يتم الطلب تلقائيًا كل عدة دقائق، والبيانات تُخزَّن مؤقتًا لتقليل الضغط على المصدر."
      />
    </div>
  );
}

/** Real standings table (provider rows) in the NEMO visual language. */
function ProviderTable({
  rows,
}: {
  rows: {
    teamProviderId: string;
    teamName?: string | null;
    teamShortName?: string | null;
    teamLogoUrl?: string | null;
    position: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    points: number;
    status: string | null;
    form: ("W" | "D" | "L")[];
    group: string | null;
  }[];
}) {
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const g = r.group ?? "";
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(r);
  }
  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([group, gRows]) => (
        <div key={group || "main"} className="card overflow-x-auto">
          {group ? <p className="border-b border-line px-3 py-2 text-[12px] font-extrabold">{group.replaceAll("_", " ")}</p> : null}
          <table className="w-full min-w-[560px] text-[12px]">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="w-8 px-2 py-2 text-start font-bold">#</th>
                <th className="px-2 py-2 text-start font-bold">الفريق</th>
                <th className="w-10 px-2 py-2 text-center font-bold">لعب</th>
                <th className="w-10 px-2 py-2 text-center font-bold">ف</th>
                <th className="w-10 px-2 py-2 text-center font-bold">ت</th>
                <th className="w-10 px-2 py-2 text-center font-bold">خ</th>
                <th className="w-14 px-2 py-2 text-center font-bold">له/عليه</th>
                <th className="w-12 px-2 py-2 text-center font-bold">نقاط</th>
                <th className="w-16 px-2 py-2 text-center font-bold">آخر 5</th>
              </tr>
            </thead>
            <tbody>
              {gRows.map((r) => (
                <tr key={`${r.position}-${r.teamProviderId}`} className="border-b border-line/60 last:border-0">
                  <td className="num px-2 py-2 font-extrabold text-muted">{r.position}</td>
                  <td className="px-2 py-2 font-bold">
                    <span className="flex items-center gap-2">
                      {r.teamLogoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.teamLogoUrl} alt="" width={16} height={16} loading="lazy" className="h-4 w-4 shrink-0 object-contain" />
                      ) : null}
                      <span className="truncate">{r.teamName ?? r.teamShortName ?? r.teamProviderId}</span>
                    </span>
                  </td>
                  <td className="num px-2 py-2 text-center">{r.played}</td>
                  <td className="num px-2 py-2 text-center">{r.won}</td>
                  <td className="num px-2 py-2 text-center">{r.drawn}</td>
                  <td className="num px-2 py-2 text-center">{r.lost}</td>
                  <td className="num px-2 py-2 text-center text-muted">
                    {r.goalsFor}:{r.goalsAgainst}
                  </td>
                  <td className="num px-2 py-2 text-center font-extrabold">{r.points}</td>
                  <td className="px-2 py-2 text-center">
                    {r.form.length ? (
                      <span className="flex items-center justify-center gap-0.5">
                        {r.form.slice(-5).map((f, i) => (
                          <span
                            key={`${f}-${i}`}
                            className={`num inline-block h-4 w-4 rounded-[2px] text-[9.5px] font-extrabold leading-4 ${
                              f === "W" ? "bg-win-green/20 text-win-green" : f === "D" ? "bg-line text-muted" : "bg-live-red/15 text-live-red"
                            }`}
                          >
                            {f}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-[10.5px] text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
