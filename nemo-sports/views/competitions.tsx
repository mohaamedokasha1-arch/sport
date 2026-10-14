import { SyncedCompetitionDirectory } from "@/components/data/SyncedSports";
import type { Metadata } from "next";
import Link from "next/link";
import CompetitionCard from "@/components/competition/CompetitionCard";
import SectionHead from "@/components/ui/SectionHead";
import { competitions, sports } from "@/lib/core-data";
import { canonicalCompetitions } from "@/lib/competition-catalog";
import { demoContentVisible } from "@/lib/site";
import { AdminCompetitionsSection } from "@/components/public/AdminPublished";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";
import { sportName } from "@/lib/i18n/names";

export type ViewProps = { searchParams: Promise<{ sport?: string; country?: string }> };


export function generateMetadata(locale: Locale, _props: ViewProps = {} as ViewProps): Metadata {
  return {
  title: t(locale, "ci.metaTitle"),
  description: t(locale, "ci.metaDescription"),
  alternates: { canonical: "/competitions" },
};
}

function CompetitionsPageBody({ locale }: { locale: Locale }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  if (!demoContentVisible()) {
    // Every catalogue entry is a competition whose provider slug was verified.
    const supported = canonicalCompetitions;
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <header className="mb-6 border-b-2 border-line pb-3">
          <p className="eyebrow mb-1">{tr("ci.eyebrow")}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{tr("ci.heading")}</h1>
          <p className="mt-2 text-[12px] leading-5 text-muted">{tr("ci.scopeNote")}</p>
        </header>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {supported.map((competition) => (
            <li key={competition.canonicalSlug}>
              <Link href={`/competitions/${encodeURIComponent(competition.canonicalSlug)}`} className="card flex min-h-20 items-center gap-3 p-4 transition hover:border-gold-500/50 focus-ring">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[4px] bg-navy-850 text-[11px] font-extrabold text-gold-400">{competition.code}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-bold">{locale === "ar" ? competition.nameAr : competition.name}</span>
                  <span className="block text-[11px] text-muted">{locale === "ar" ? competition.countryAr : competition.country}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const bySport = competitions.reduce<Record<string, typeof competitions>>((acc, competition) => {
    (acc[competition.sport] ||= []).push(competition);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">{tr("ci.demoEyebrow")}</p>
          <h1 className="text-2xl font-extrabold tracking-tight">{tr("ci.demoHeading")}</h1>
        </div>
        <p className="text-[12px] text-muted"><span className="num font-bold">{competitions.length}</span> {tr("ci.demoCount")}</p>
      </header>
      <p className="mb-6 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[12px] font-semibold leading-5 text-muted">{tr("ci.demoNotice")}</p>
      <div className="space-y-9">
        {sports.map((sport) => bySport[sport.slug]?.length ? (
          <section key={sport.slug}>
            <SectionHead eyebrow={sport.nameEn} title={`${sport.icon} ${sportName(locale, sport.slug)}`} href={`/matches?sport=${sport.slug}`} linkLabel={tr("ci.previewMatches")} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {bySport[sport.slug].map((competition) => <CompetitionCard key={competition.slug} slug={competition.slug} locale={locale} />)}
            </div>
          </section>
        ) : null)}
      </div>
    </div>
  );
}

export const dynamic = "force-dynamic";

export default async function CompetitionsPage({ locale, searchParams }: ViewProps & { locale: Locale }) {
  const filters = await searchParams;
  return (
    <>
      <AdminCompetitionsSection />
      <SyncedCompetitionDirectory sport={filters.sport} country={filters.country} locale={locale} />
      <CompetitionsPageBody locale={locale} />
    </>
  );
}
