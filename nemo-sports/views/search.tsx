import type { Metadata } from "next";
import Link from "next/link";
import SearchBox from "@/components/layout/SearchBox";
import Crest from "@/components/ui/Crest";
import { canonicalCompetitions } from "@/lib/competition-catalog";
import { searchEntities, type SearchHit, type SearchResponse } from "@/lib/search-service";
import { teams } from "@/lib/core-data";
import { demoContentVisible } from "@/lib/site";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";

export type ViewProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };


export function generateMetadata(locale: Locale, _props: ViewProps = {} as ViewProps): Metadata {
  return {
  title: t(locale, "sr.metaTitle"),
  description: t(locale, "sr.metaDescription"),
  alternates: { canonical: "/search" },
  robots: { index: false, follow: true },
};
}

/**
 * The stored `type` values are part of the /api/search contract and stay Arabic
 * in the payload; only the label rendered for the visitor is translated.
 */
const TYPE_ORDER: { value: SearchHit["type"]; labelKey: "sr.type.team" | "sr.type.player" | "sr.type.competition" | "sr.type.match" | "sr.type.news" }[] = [
  { value: "فريق", labelKey: "sr.type.team" },
  { value: "لاعب", labelKey: "sr.type.player" },
  { value: "بطولة", labelKey: "sr.type.competition" },
  { value: "مباراة", labelKey: "sr.type.match" },
  { value: "خبر", labelKey: "sr.type.news" },
];

export default async function SearchPage({ locale, searchParams, }: ViewProps & { locale: Locale }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const sp = await searchParams;
  const query = typeof sp.q === "string" ? sp.q.trim().slice(0, 120) : "";
  const response: SearchResponse = query.length >= 2
    ? await searchEntities(query)
    : { query, preview: demoContentVisible(), total: 0, counts: { فريق: 0, لاعب: 0, بطولة: 0, مباراة: 0, خبر: 0 }, results: [] };

  const groups = TYPE_ORDER
    .map(({ value, labelKey }) => ({ type: value, label: tr(labelKey), hits: response.results.filter((hit) => hit.type === value) }))
    .filter((group) => group.hits.length > 0);

  return (
    <div className="mx-auto max-w-[1080px] px-4 py-6">
      <header className="mb-6 border-b-2 border-line pb-4">
        <p className="eyebrow mb-1">{tr("sr.eyebrow")}</p>
        <h1 className="mb-4 text-2xl font-extrabold tracking-tight">{tr("sr.heading")}</h1>
        <div className="max-w-2xl">
          <SearchBox variant="page" />
        </div>
        <p className="mt-2 text-[12px] text-muted">{tr("sr.coverage")}</p>
      </header>

      {demoContentVisible() ? <p className="mb-5 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[11px] font-semibold text-muted">{tr("sr.demoNotice")}</p> : null}

      {query.length < 2 ? (
        <div className="space-y-6">
          <p className="text-[13px] text-muted">{tr("sr.placeholder")}</p>
          {demoContentVisible() && teams.length > 0 ? (
            <section>
              <h2 className="mb-3 text-[14px] font-extrabold">{tr("sr.popularTeams")}</h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {teams.slice(0, 9).map((team) => (
                  <li key={team.slug}>
                    <Link href={`/teams/${team.slug}`} className="card flex min-h-12 items-center gap-3 p-3 transition hover:border-gold-500/50 focus-ring">
                      <Crest slug={team.slug} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-bold">{team.name}</span>
                        <span className="block truncate text-[11px] text-muted">{team.nameEn}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section>
            <h2 className="mb-3 text-[14px] font-extrabold">{tr("sr.competitions")}</h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {canonicalCompetitions.map((competition) => (
                <li key={competition.code}>
                  <Link href={`/competitions/${competition.canonicalSlug}`} className="card flex min-h-12 items-center justify-between gap-3 p-3 text-[13px] font-bold transition hover:border-gold-500/50 focus-ring">
                    <span>{locale === "ar" ? competition.nameAr : competition.name}</span>
                    <span className="num text-[11px] text-muted">{competition.code}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : response.total === 0 ? (
        <div className="card grid place-items-center gap-2 px-6 py-12 text-center">
          <p className="text-[15px] font-bold">{tr("sr.noResults", { query })}</p>
          <p className="max-w-lg text-[13px] leading-relaxed text-muted">
            {tr("sr.noResultsBody")}
          </p>
          <Link href="/matches" className="mt-2 inline-flex min-h-11 items-center rounded-[3px] bg-navy-850 px-4 py-2 text-[12px] font-bold text-white transition hover:bg-navy-700 focus-ring">
            {tr("sr.browseMatches")}
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          <p className="text-[13px] text-muted">
            <span className="num font-bold text-ink">{response.results.length}</span> {tr("sr.resultCount")} <span className="num font-bold text-ink">{response.total}</span> {tr("sr.resultsFor", { query })}
          </p>
          {groups.map(({ type, label, hits }) => (
            <section key={type} aria-labelledby={`results-${type}`}>
              <h2 id={`results-${type}`} className="mb-3 flex items-center gap-2 border-b border-line pb-2 text-[14px] font-extrabold">
                <span>{label}</span>
                <span className="num rounded-[3px] bg-navy-850/5 px-1.5 py-0.5 text-[11px] text-muted dark:bg-white/10">{response.counts[type]}</span>
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {hits.map((hit) => (
                  <li key={`${hit.type}:${hit.id}`}>
                    {hit.external ? (
                      <a href={hit.url} target="_blank" rel="noopener noreferrer nofollow" className="card flex min-h-[72px] flex-col justify-center gap-1 p-3 transition hover:border-gold-500/50 focus-ring">
                        <span className="line-clamp-2 text-[13px] font-bold">{hit.title}</span>
                        <span className="truncate text-[11px] text-muted">{hit.sub} · {tr("sr.openSource")}</span>
                      </a>
                    ) : (
                      <Link href={hit.url} className="card flex min-h-[72px] flex-col justify-center gap-1 p-3 transition hover:border-gold-500/50 focus-ring">
                        <span className="line-clamp-2 text-[13px] font-bold">{hit.title}</span>
                        <span className="truncate text-[11px] text-muted">{hit.sub}</span>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
