import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import DataUnavailable from "@/components/ui/DataUnavailable";
import Link from "next/link";
import Crest from "@/components/ui/Crest";
import SectionHead from "@/components/ui/SectionHead";
import DataSourceNote from "@/components/data/DataSourceNote";
import { competitions, sports, teams } from "@/lib/core-data";
import { footballDataCompetitions } from "@/lib/football-data";
import { teamsDirectory, type DirectoryTeam } from "@/lib/sdl-gateway";
import { demoContentVisible } from "@/lib/site";

export const metadata: Metadata = {
  title: "الفرق — دليل الفرق حسب الرياضة",
  description: "دليل شامل للفرق: المعلومات، اللاعبون، المباريات والإحصائيات.",
  alternates: { canonical: "/teams" },
};

export const revalidate = 900;

/**
 * Group the directory by the competition each team was found in, so the page
 * stays organized without inventing a league a team does not play in.
 */
function groupByCompetition(rows: DirectoryTeam[]) {
  const groups = new Map<string, DirectoryTeam[]>();
  for (const t of rows) {
    const key = t.competition || "other";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }
  for (const list of groups.values()) list.sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
  return groups;
}

export default async function TeamsPage() {
  /* ══ 1) real directory, derived from the league tables we already fetch ══
   * No provider in the chain exposes "list every team", and inventing a roster
   * is exactly what this platform refuses to do. A standings row already
   * carries a real team identity (provider id, name, short name, crest), so
   * the tables are a legitimate directory of the teams that actually exist in
   * the competitions we cover. See teamsDirectory() in lib/sdl-gateway.ts. */
  const majors = footballDataCompetitions(true);
  const real = await teamsDirectory(
    "football",
    majors.map((c) => c.slug ?? c.code),
  );

  if (real.ok && real.source === "provider" && real.data.length > 0) {
    const groups = groupByCompetition(real.data);
    const nameOf = (id: string) => majors.find((c) => (c.slug ?? c.code) === id)?.nameAr ?? id;

    return (
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
          <div>
            <p className="eyebrow mb-1">دليل الفرق</p>
            <h1 className="text-2xl font-extrabold tracking-tight">الفرق</h1>
          </div>
          <p className="text-[12px] text-muted">
            <span className="num font-bold">{real.data.length}</span> فريقًا من جداول ترتيب حقيقية
          </p>
        </header>

        <DataSourceNote
          provider={real.provider}
          fromCache={real.fromCache}
          stale={real.stale}
          fetchedAt={real.fetchedAt}
          className="mb-6"
        />

        <div className="space-y-9">
          {[...groups.entries()].map(([compId, list]) => (
            <section key={compId}>
              <SectionHead
                eyebrow="بيانات حقيقية"
                title={nameOf(compId)}
                href={`/competitions/${compId}`}
                linkLabel="صفحة البطولة"
              />
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {list.map((t) => (
                  <li key={t.providerId}>
                    <Link
                      href={`/teams/${t.providerId}`}
                      className="card flex items-center gap-3 p-3 transition hover:-translate-y-0.5 hover:border-gold-500/50"
                    >
                      {t.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.logoUrl} alt="" width={42} height={42} loading="lazy" className="h-[42px] w-[42px] shrink-0 object-contain" />
                      ) : (
                        <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[4px] bg-navy-850 text-[13px] font-extrabold text-white/70">
                          {(t.shortName ?? t.name).slice(0, 3).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-bold">{t.name}</span>
                        <span className="block truncate text-[11px] text-muted">{nameOf(t.competition)}</span>
                        {t.position !== null ? (
                          <span className="num mt-1 block text-[10px] text-muted">
                            المركز {t.position}{t.points !== null ? ` · ${t.points} نقطة` : ""}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    );
  }

  /* ══ 2) development/demo directory (never in production) ══ */
  const bySport = teams.reduce<Record<string, typeof teams>>((acc, t) => {
    (acc[t.sport] ||= []).push(t);
    return acc;
  }, {});

  if (demoContentVisible() && teams.length > 0) {
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
          <div>
            <p className="eyebrow mb-1">دليل الفرق</p>
            <h1 className="text-2xl font-extrabold tracking-tight">الفرق</h1>
          </div>
          <p className="text-[12px] text-muted">
            <span className="num font-bold">{teams.length}</span> فريقًا في بيانات المعاينة
          </p>
        </header>
        <p className="mb-6 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[11px] font-semibold text-muted">دليل الفرق هذا بيانات توضيحية للتطوير فقط — لا يعكس ترتيبًا أو قائمة فرق حقيقية.</p>

        <div className="space-y-9">
          {sports.map((s) =>
            bySport[s.slug]?.length ? (
              <section key={s.slug}>
                <SectionHead eyebrow={s.nameEn} title={`${s.icon} ${s.name}`} href={`/matches?sport=${s.slug}`} linkLabel="المباريات" />
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {bySport[s.slug].map((t) => {
                    const comp = competitions.find((c) => c.slug === t.competition);
                    return (
                      <li key={t.slug}>
                        <Link
                          href={`/teams/${t.slug}`}
                          className="card flex items-center gap-3 p-3 transition hover:-translate-y-0.5 hover:border-gold-500/50"
                        >
                          <Crest slug={t.slug} size={42} />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-bold">{t.name}</span>
                            <span className="block truncate text-[11px] text-muted">{comp?.name ?? t.country}</span>
                            <span className="mt-1 flex items-center gap-1.5">
                              <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: t.primary }} aria-hidden />
                              <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: t.secondary }} aria-hidden />
                              <span className="num text-[10px] text-muted">تأسس {t.founded}</span>
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null,
          )}
        </div>
      </div>
    );
  }

  /* ══ 3) honest empty state ══════════════════════════════════════════
   * Opt this render out of the cache. Without it, a build that ran before the
   * provider env vars were set (Vercel builds with env, a local build without)
   * prerenders the empty state and ISR keeps serving it for the whole
   * `revalidate` window — so `/standings` could be showing a real table while
   * `/teams`, derived from those same standings, still advertised "0 فريق".
   * The empty state is a *transient* answer, and transient answers must never
   * be the thing that gets cached. When real data is available this branch is
   * not reached, so the page still prerenders and revalidates normally. */
  noStore();
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">دليل الفرق</p>
          <h1 className="text-2xl font-extrabold tracking-tight">الفرق</h1>
        </div>
        <p className="num text-[12px] font-bold text-muted">0 فريق</p>
      </header>
      <DataUnavailable
        title="دليل الفرق غير متوفر حاليًا"
        message="صفحات الفرق تُبنى من بيانات رسمية (الفرق، اللاعبون، المباريات). لن ننشئ صفحات لفرق ببيانات غير مؤكدة."
        hint="يُشتق الدليل من جداول الترتيب الحقيقية — سيتوفر تلقائيًا بمجرد استجابة مصدر البيانات."
      />
    </div>
  );
}
