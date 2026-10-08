import type { Metadata } from "next";
import Link from "next/link";
import SearchBox from "@/components/layout/SearchBox";
import Crest from "@/components/ui/Crest";
import { canonicalCompetitions } from "@/lib/competition-catalog";
import { searchEntities, type SearchHit, type SearchResponse } from "@/lib/search-service";
import { teams } from "@/lib/core-data";
import { demoContentVisible } from "@/lib/site";

export const metadata: Metadata = {
  title: "البحث",
  description: "ابحث في الفرق واللاعبين والبطولات والمباريات والأخبار باللغة العربية أو الإنجليزية.",
  alternates: { canonical: "/search" },
  robots: { index: false, follow: true },
};

const TYPE_ORDER: SearchHit["type"][] = ["فريق", "لاعب", "بطولة", "مباراة", "خبر"];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const query = typeof sp.q === "string" ? sp.q.trim().slice(0, 120) : "";
  const response: SearchResponse = query.length >= 2
    ? await searchEntities(query)
    : { query, preview: demoContentVisible(), total: 0, counts: { فريق: 0, لاعب: 0, بطولة: 0, مباراة: 0, خبر: 0 }, results: [] };

  const groups = TYPE_ORDER
    .map((type) => ({ type, hits: response.results.filter((hit) => hit.type === type) }))
    .filter((group) => group.hits.length > 0);

  return (
    <div className="mx-auto max-w-[1080px] px-4 py-6">
      <header className="mb-6 border-b-2 border-line pb-4">
        <p className="eyebrow mb-1">البحث الموحد</p>
        <h1 className="mb-4 text-2xl font-extrabold tracking-tight">ابحث في نيمو سبورتس</h1>
        <div className="max-w-2xl">
          <SearchBox variant="page" />
        </div>
        <p className="mt-2 text-[12px] text-muted">الفرق · اللاعبون · البطولات · المباريات · الأخبار</p>
      </header>

      {demoContentVisible() ? <p className="mb-5 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[11px] font-semibold text-muted">قد تشمل نتائج البحث في هذه البيئة بيانات معاينة للتطوير فقط.</p> : null}

      {query.length < 2 ? (
        <div className="space-y-6">
          <p className="text-[13px] text-muted">اكتب حرفين على الأقل للبحث بالعربية أو الإنجليزية.</p>
          {demoContentVisible() && teams.length > 0 ? (
            <section>
              <h2 className="mb-3 text-[14px] font-extrabold">فرق شائعة</h2>
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
            <h2 className="mb-3 text-[14px] font-extrabold">البطولات</h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {canonicalCompetitions.map((competition) => (
                <li key={competition.code}>
                  <Link href={`/competitions/${competition.canonicalSlug}`} className="card flex min-h-12 items-center justify-between gap-3 p-3 text-[13px] font-bold transition hover:border-gold-500/50 focus-ring">
                    <span>{competition.nameAr}</span>
                    <span className="num text-[11px] text-muted">{competition.code}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : response.total === 0 ? (
        <div className="card grid place-items-center gap-2 px-6 py-12 text-center">
          <p className="text-[15px] font-bold">لا توجد نتائج لـ «{query}»</p>
          <p className="max-w-lg text-[13px] leading-relaxed text-muted">
            جرّب كتابة الاسم بالعربية أو الإنجليزية، أو استخدم جزءًا أقصر من الاسم. تُوحَّد الهمزات والتشكيل والشرطات والمسافات تلقائيًا.
          </p>
          <Link href="/matches" className="mt-2 inline-flex min-h-11 items-center rounded-[3px] bg-navy-850 px-4 py-2 text-[12px] font-bold text-white transition hover:bg-navy-700 focus-ring">
            تصفّح قائمة المباريات
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          <p className="text-[13px] text-muted">
            <span className="num font-bold text-ink">{response.results.length}</span> من أصل <span className="num font-bold text-ink">{response.total}</span> نتيجة لـ «{query}»
          </p>
          {groups.map(({ type, hits }) => (
            <section key={type} aria-labelledby={`results-${type}`}>
              <h2 id={`results-${type}`} className="mb-3 flex items-center gap-2 border-b border-line pb-2 text-[14px] font-extrabold">
                <span>{type}</span>
                <span className="num rounded-[3px] bg-navy-850/5 px-1.5 py-0.5 text-[11px] text-muted dark:bg-white/10">{response.counts[type]}</span>
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {hits.map((hit) => (
                  <li key={`${hit.type}:${hit.id}`}>
                    {hit.external ? (
                      <a href={hit.url} target="_blank" rel="noopener noreferrer nofollow" className="card flex min-h-[72px] flex-col justify-center gap-1 p-3 transition hover:border-gold-500/50 focus-ring">
                        <span className="line-clamp-2 text-[13px] font-bold">{hit.title}</span>
                        <span className="truncate text-[11px] text-muted">{hit.sub} · فتح المصدر الأصلي</span>
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
