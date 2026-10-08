import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { cache } from "react";
import DataUnavailable from "@/components/ui/DataUnavailable";
import DataSourceNote from "@/components/data/DataSourceNote";
import Link from "next/link";
import SectionHead from "@/components/ui/SectionHead";
import { players, teamBySlug } from "@/lib/core-data";
import { demoContentVisible, hasProviderKeys } from "@/lib/site";
import { age } from "@/lib/format";
import { footballDataCompetitions, footballTopScorers, type FootballDataSource } from "@/lib/football-data";
import { supportsPlayerStats } from "@/lib/sdl-gateway";
import type { NormalizedTopScorer } from "@/packages/sdl/src";

export const revalidate = 1800;

export async function generateMetadata(): Promise<Metadata> {
  if (demoContentVisible()) {
    return {
      title: "اللاعبون — معاينة التطوير",
      description: "قائمة توضيحية للاعبين في بيئة التطوير فقط.",
      alternates: { canonical: "/players" },
      robots: { index: false, follow: true },
    };
  }
  const groups = await realPlayerGroups();
  const available = groups.some((group) => group.players.length > 0);
  return {
    title: "اللاعبون — قائمة اللاعبين المتاحة من المصدر",
    description: "قائمة لاعبين مشتقة من إحصاءات الهدافين الموثوقة في البطولات المدعومة، مع روابط ملفات اللاعب عند توفرها.",
    alternates: { canonical: "/players" },
    robots: available ? { index: true, follow: true } : { index: false, follow: true },
  };
}

type RealPlayerGroup = {
  code: string;
  name: string;
  players: NormalizedTopScorer[];
  source: FootballDataSource;
};

/**
 * No provider offers a complete all-player directory. This page therefore
 * lists only named players present in verified scorer feeds, and links a
 * profile only if that provider declares player-stats support and returned a
 * resolvable profile id. Calls are sequential to respect provider quotas.
 */
const realPlayerGroups = cache(async (): Promise<RealPlayerGroup[]> => {
  if (demoContentVisible() || !hasProviderKeys()) return [];
  const groups: RealPlayerGroup[] = [];
  for (const competition of footballDataCompetitions(true)) {
    const result = await footballTopScorers(competition.slug ?? competition.code);
    if (!result.ok || result.source.provider === "demo") continue;
    const namedPlayers = result.data.filter((player) => player.playerProviderId.trim() && player.playerName?.trim());
    if (namedPlayers.length > 0) {
      groups.push({ code: competition.code, name: competition.nameAr, players: namedPlayers, source: result.source });
    }
  }
  return groups;
});

export default async function PlayersPage() {
  const showDemo = demoContentVisible();
  if (!showDemo) {
    const groups = await realPlayerGroups();
    if (groups.length > 0) {
      return (
        <div className="mx-auto max-w-[1280px] px-4 py-6">
          <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
            <div>
              <p className="eyebrow mb-1">اللاعبون من بيانات الهدافين</p>
              <h1 className="text-2xl font-extrabold tracking-tight">اللاعبون</h1>
            </div>
            <Link href="/search" className="min-h-11 inline-flex items-center font-bold text-gold-600 dark:text-gold-400 focus-ring">ابحث عن لاعب</Link>
          </header>
          <p className="mb-6 text-[12px] leading-6 text-muted">
            القائمة مشتقة من لوائح الهدافين التي أعادها المصدر، وليست سجلًا شاملًا لكل اللاعبين. يظهر رابط الملف فقط عندما يدعم المصدر إحصاءات اللاعب.
          </p>

          <div className="space-y-9">
            {groups.map((group) => (
              <section key={group.code}>
                <SectionHead eyebrow="بيانات من المصدر" title={group.name} href={`/competitions/${group.code}`} linkLabel="صفحة البطولة" />
                <div className="card overflow-x-auto">
                  <table className="w-full min-w-[560px] text-[12px]">
                    <thead>
                      <tr className="border-b border-line bg-navy-850/[0.04] text-muted dark:bg-white/[0.04]">
                        <th scope="col" className="px-3 py-2.5 text-start font-semibold">اللاعب</th>
                        <th scope="col" className="px-3 py-2.5 text-start font-semibold">الفريق</th>
                        <th scope="col" className="num px-3 py-2.5 text-center font-semibold">مباريات</th>
                        <th scope="col" className="num px-3 py-2.5 text-center font-semibold">أهداف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.players.slice(0, 20).map((player) => {
                        const canOpenProfile = player.profileAvailable === true && supportsPlayerStats(group.source.provider);
                        return (
                          <tr key={player.playerProviderId} className="border-b border-line last:border-0">
                            <td className="px-3 py-2.5 font-bold">
                              {canOpenProfile ? (
                                <Link href={`/players/${encodeURIComponent(player.playerProviderId)}`} className="hover:text-gold-600 dark:hover:text-gold-400 focus-ring">
                                  {player.playerName}
                                </Link>
                              ) : player.playerName}
                            </td>
                            <td className="px-3 py-2.5 text-muted">{player.teamName ?? "—"}</td>
                            <td className="num px-3 py-2.5 text-center">{player.appearances ?? "—"}</td>
                            <td className="num px-3 py-2.5 text-center font-extrabold">{player.goals}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="border-t border-line px-3 py-2">
                    <DataSourceNote provider={group.source.provider} fromCache={group.source.fromCache} stale={group.source.stale} fetchedAt={group.source.fetchedAt} ttlSeconds={group.source.ttlSeconds} />
                  </div>
                </div>
              </section>
            ))}
          </div>
        </div>
      );
    }

    // An unavailable provider response is transient. Do not let ISR turn it
    // into a long-lived empty directory or expose it as indexable content.
    noStore();
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
          <div>
            <p className="eyebrow mb-1">دليل اللاعبين</p>
            <h1 className="text-2xl font-extrabold tracking-tight">اللاعبون</h1>
          </div>
          <Link href="/search" className="min-h-11 inline-flex items-center font-bold text-gold-600 dark:text-gold-400 focus-ring">ابحث عن لاعب</Link>
        </header>
        <DataUnavailable
          title="قائمة اللاعبين غير متوفرة حاليًا"
          message="لم تُرجع مصادر البيانات قائمة هدافين قابلة للتحقق. لا نعرض أسماء أو إحصاءات تجريبية على الموقع العام."
          actionHref="/standings"
          actionLabel="عرض الترتيب والإحصائيات"
        />
      </div>
    );
  }

  const byGroup = players.reduce<Record<string, typeof players>>((acc, player) => {
    (acc[player.positionGroup] ||= []).push(player);
    return acc;
  }, {});
  const order = ["الهجوم", "الوسط", "الدفاع", "حراسة المرمى", "أساسي", "فردي"];

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">معاينة التطوير</p>
          <h1 className="text-2xl font-extrabold tracking-tight">اللاعبون</h1>
        </div>
        <p className="text-[12px] text-muted"><span className="num font-bold">{players.length}</span> لاعبًا في بيانات المعاينة</p>
      </header>
      <p className="mb-6 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[11px] font-semibold text-muted">بيانات اللاعبين الظاهرة هنا للتطوير فقط — ليست إحصاءات حقيقية.</p>

      <div className="space-y-9">
        {order.map((group) => byGroup[group]?.length ? (
          <section key={group}>
            <SectionHead eyebrow={group} title={group} accent />
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[560px] text-[12px]">
                <thead>
                  <tr className="border-b border-line bg-navy-850/[0.04] text-muted dark:bg-white/[0.04]">
                    <th scope="col" className="px-3 py-2.5 text-start font-semibold">اللاعب</th>
                    <th scope="col" className="px-3 py-2.5 text-start font-semibold">الفريق</th>
                    <th scope="col" className="px-3 py-2.5 text-start font-semibold">المركز</th>
                    <th scope="col" className="num px-3 py-2.5 font-semibold">العمر</th>
                    <th scope="col" className="num px-3 py-2.5 font-semibold">مباريات</th>
                    <th scope="col" className="num px-3 py-2.5 font-semibold">أهداف</th>
                    <th scope="col" className="num px-3 py-2.5 font-semibold">صناعة</th>
                  </tr>
                </thead>
                <tbody>
                  {byGroup[group].map((player) => {
                    const team = teamBySlug(player.team);
                    return (
                      <tr key={player.slug} className="border-b border-line last:border-0 transition hover:bg-navy-850/[0.03] dark:hover:bg-white/[0.04]">
                        <td className="px-3 py-2.5">
                          <Link href={`/players/${player.slug}`} className="flex min-h-11 items-center gap-2 font-bold transition hover:text-gold-600 dark:hover:text-gold-400 focus-ring">
                            <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-[3px] bg-navy-850 text-[10px] font-extrabold text-gold-400">{player.number ?? "—"}</span>
                            {player.flag} {player.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5">
                          {team ? <Link href={`/teams/${team.slug}`} className="hover:text-gold-600 dark:hover:text-gold-400 focus-ring">{team.short}</Link> : player.team}
                        </td>
                        <td className="px-3 py-2.5 text-muted">{player.position}</td>
                        <td className="num px-3 py-2.5 text-center">{age(player.birth)}</td>
                        <td className="num px-3 py-2.5 text-center">{player.seasonApps}</td>
                        <td className="num px-3 py-2.5 text-center font-extrabold">{player.seasonGoals}</td>
                        <td className="num px-3 py-2.5 text-center">{player.seasonAssists}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null)}
      </div>
    </div>
  );
}
