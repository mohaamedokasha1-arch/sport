import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MatchLive from "@/components/match/MatchLive";
import { allMatches, articles, matchBySlug } from "@/lib/data";
import { getLiveStates } from "@/lib/live";
import { awayTeam, compOf, dateAr, homeTeam, timeOf } from "@/lib/format";
import { teamBySlug } from "@/lib/core-data";

export function generateStaticParams() {
  return allMatches.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const m = matchBySlug(slug);
  if (!m) return { title: "المباراة غير موجودة" };
  const home = homeTeam(m);
  const away = awayTeam(m);
  const comp = compOf(m);
  const title = `${home.name} ضد ${away.name} | ${comp.name} | ${dateAr(m.kickoff)}`;
  const description = `نتيجة وتفاصيل مباراة ${home.name} و${away.name} في ${comp.name}: الأهداف، الإحصائيات، التشكيلات، ورابط البث الرسمي.`;
  return {
    title,
    description,
    alternates: { canonical: `/matches/${m.slug}` },
    openGraph: { title, description, type: "article" },
  };
}

export default async function MatchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const match = matchBySlug(slug);
  if (!match) notFound();

  const home = homeTeam(match);
  const away = awayTeam(match);
  const comp = compOf(match);
  const states = getLiveStates();
  const state = states[match.id];

  const related = articles
    .filter(
      (a) =>
        a.competition === match.competition ||
        a.teams?.includes(match.home) ||
        a.teams?.includes(match.away),
    )
    .slice(0, 4);

  const ld = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${home.nameEn} vs ${away.nameEn}`,
    startDate: match.kickoff,
    eventStatus:
      state.status === "FINISHED"
        ? "https://schema.org/EventCompleted"
        : state.status === "LIVE"
          ? "https://schema.org/EventRescheduled"
          : "https://schema.org/EventScheduled",
    sport: comp.nameEn,
    location: match.venue
      ? { "@type": "Place", name: match.venue, address: { "@type": "PostalAddress", addressCountry: home.country } }
      : undefined,
    homeTeam: { "@type": "SportsTeam", name: home.nameEn },
    awayTeam: { "@type": "SportsTeam", name: away.nameEn },
    organizer: { "@type": "Organization", name: comp.nameEn },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <nav aria-label="مسار التنقل" className="mb-4 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          <Link href="/" className="hover:text-gold-600 dark:hover:text-gold-400">الرئيسية</Link>
          <span aria-hidden>/</span>
          <Link href={`/competitions/${comp.slug}`} className="hover:text-gold-600 dark:hover:text-gold-400">
            {comp.name}
          </Link>
          <span aria-hidden>/</span>
          <span className="font-semibold text-ink">
            {home.short} × {away.short}
          </span>
        </nav>

        <MatchLive
          match={match}
          initial={state}
          relatedNews={related.map((a) => ({
            slug: a.slug,
            title: a.title,
            excerpt: a.excerpt,
            author: a.author,
            publishedAgoMin: a.publishedAgoMin,
          }))}
        />

        <section className="mt-8">
          <h2 className="mb-3 border-b-2 border-line pb-2 text-[15px] font-extrabold">مباريات أخرى في {comp.name}</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {allMatches
              .filter((x) => x.competition === match.competition && x.id !== match.id)
              .slice(0, 6)
              .map((x) => (
                <li key={x.id}>
                  <Link
                    href={`/matches/${x.slug}`}
                    className="card flex items-center justify-between gap-2 px-3 py-2.5 text-[12px] transition hover:border-gold-500/50"
                  >
                    <span className="truncate font-bold">
                      {teamBySlug(x.home)?.short} × {teamBySlug(x.away)?.short}
                    </span>
                    <span className="num shrink-0 text-muted">{timeOf(x.kickoff)}</span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      </div>
    </>
  );
}
