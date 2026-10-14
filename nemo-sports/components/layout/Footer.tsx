import { dataServable } from "@/lib/sdl-gateway";
import Link from "@/components/i18n/Link";
import Logo from "@/components/brand/Logo";
import PoweredBy from "@/components/ui/PoweredBy";
import PoweredByFootballData from "@/components/ui/PoweredByFootballData";
import AttributionFooter from "@/components/ui/AttributionFooter";
import { PUBLIC_SPORTS, sports, competitions } from "@/lib/core-data";
import { canonicalCompetitions } from "@/lib/competition-catalog";
import { demoContentVisible } from "@/lib/site";
import { t } from "@/lib/i18n/translate";
import { sportName } from "@/lib/i18n/names";
import type { Locale } from "@/lib/i18n/locales";

const preview = demoContentVisible();
const sportScoreAttributionEnabled = !preview && process.env.NEMO_SDL_MODE !== "demo" && process.env.NEMO_SPORTSCORE_ENABLED !== "0";
const footballDataAttributionEnabled = !preview && process.env.NEMO_SDL_MODE !== "demo" && Boolean(process.env.FOOTBALL_DATA_API_KEY);
const footerSports = preview ? sports : PUBLIC_SPORTS;
/**
 * Canonical competitions carry both names (`name` English, `nameAr` Arabic), so
 * each language shows its own. The demo dataset carries `name`/`nameEn`.
 */
const footerCompetitions = preview
  ? competitions.slice(0, 8).map((competition) => ({ slug: competition.slug, name: competition.name, nameEn: competition.nameEn }))
  : canonicalCompetitions.map((competition) => ({ slug: competition.canonicalSlug, name: competition.nameAr, nameEn: competition.name }));

/**
 * Link groups are built per locale. The news category links keep the value the
 * pipeline canonicalises (`lib/news/categorize.ts` accepts both the Arabic and
 * the English spelling), so filtering behaves identically in both languages.
 */
function groups(locale: Locale) {
  const tr = (key: string) => t(locale, key);
  const newsCategory = locale === "ar" ? "تحليلات" : "Analysis";
  const transfersCategory = locale === "ar" ? "انتقالات" : "Transfers";
  return [
    {
      title: tr("footer.groupSections"),
      links: [
        { href: "/today", label: tr("nav.today") },
        { href: "/matches", label: tr("nav.matches") },
        { href: "/live", label: tr("footer.live") },
        { href: "/results", label: tr("nav.results") },
        { href: "/competitions", label: tr("nav.competitions") },
        { href: "/teams", label: tr("nav.teams") },
        { href: "/players", label: tr("nav.players") },
        { href: "/watch", label: tr("footer.watchSchedule") },
      ],
    },
    {
      title: tr("footer.groupContent"),
      links: [
        { href: "/news", label: tr("footer.allNews") },
        { href: `/news?category=${encodeURIComponent(newsCategory)}`, label: tr("footer.analysis") },
        { href: `/news?category=${encodeURIComponent(transfersCategory)}`, label: tr("footer.transfers") },
        { href: "/standings", label: tr("footer.standingsStats") },
        { href: "/search", label: tr("footer.search") },
        { href: "/learn", label: tr("footer.learn") },
      ],
    },
    {
      title: tr("footer.groupAbout"),
      links: [
        { href: "/about", label: tr("footer.aboutUs") },
        { href: "/contact", label: tr("footer.contact") },
        { href: "/faq", label: tr("footer.faq") },
        { href: "/broadcast-rights", label: tr("footer.broadcastDisclosure") },
        { href: "/privacy", label: tr("footer.privacy") },
        { href: "/terms", label: tr("footer.terms") },
        { href: "/copyright", label: tr("footer.copyright") },
      ],
    },
  ];
}

export default async function Footer({ locale }: { locale: Locale }) {
  const servable = await dataServable();
  const tr = (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);

  return (
    <footer className="mt-16 border-t-2 border-gold-500/40 bg-navy-900 text-white">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-12 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo size={40} tone="light" />
          <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-white/60">{tr("footer.about")}</p>
          {preview ? (
            <p className="mt-4 text-[11px] leading-relaxed text-white/45">{tr("footer.previewNote")}</p>
          ) : null}
        </div>

        {groups(locale).map((g) => (
          <nav key={g.title} aria-label={g.title}>
            <p className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.18em] text-gold-500">
              {g.title}
            </p>
            <ul className="space-y-2">
              {g.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link href={l.href} className="inline-flex min-h-11 items-center text-[13px] text-white/65 transition hover:text-gold-400 focus-ring">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-4 px-4 py-4 text-[11px] text-white/45">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-white/60">{tr("footer.availableSports")}</span>
            {footerSports.map((sport) => (
              <Link key={sport.slug} href={`/matches?sport=${sport.slug}`} className="inline-flex min-h-11 items-center transition hover:text-gold-400 focus-ring">
                {sportName(locale, sport.slug)}
              </Link>
            ))}
          </span>
        </div>
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-4 px-4 pb-6 text-[11px] text-white/45">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-white/60">{tr("footer.competitions")}</span>
            {footerCompetitions.map((competition) => (
              <Link key={competition.slug} href={`/competitions/${competition.slug}`} className="inline-flex min-h-11 items-center transition hover:text-gold-400 focus-ring">
                {locale === "ar" ? competition.name : competition.nameEn || competition.name}
              </Link>
            ))}
          </span>
        </div>
      </div>

      <div className="border-t border-white/10 bg-navy-950">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] text-white/65">
          <span>{tr("footer.rights", { year: new Date().getFullYear() })}</span>
          <span>{tr("footer.crestsNote")}</span>
          <span className="flex flex-wrap items-center gap-2">
            {servable && footballDataAttributionEnabled ? <PoweredByFootballData /> : null}
            {servable && sportScoreAttributionEnabled ? <PoweredBy /> : null}
          </span>
          <AttributionFooter exclude={["SportScore", "Football-Data.org"]} className="w-full border-t border-white/10 pt-3" locale={locale} />
        </div>
      </div>
    </footer>
  );
}
