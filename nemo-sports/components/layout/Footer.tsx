import { dataServable } from "@/lib/sdl-gateway";
import Link from "next/link";
import Logo from "@/components/brand/Logo";
import PoweredBy from "@/components/ui/PoweredBy";
import PoweredByFootballData from "@/components/ui/PoweredByFootballData";
import AttributionFooter from "@/components/ui/AttributionFooter";
import { PUBLIC_SPORTS, sports, competitions } from "@/lib/core-data";
import { canonicalCompetitions } from "@/lib/competition-catalog";
import { demoContentVisible } from "@/lib/site";

const preview = demoContentVisible();
const sportScoreAttributionEnabled = !preview && process.env.NEMO_SDL_MODE !== "demo" && process.env.NEMO_SPORTSCORE_ENABLED !== "0";
const footballDataAttributionEnabled = !preview && process.env.NEMO_SDL_MODE !== "demo" && Boolean(process.env.FOOTBALL_DATA_API_KEY);
const footerSports = preview ? sports : PUBLIC_SPORTS;
const footerCompetitions = preview
  ? competitions.slice(0, 8).map((competition) => ({ slug: competition.slug, name: competition.name }))
  : canonicalCompetitions.map((competition) => ({ slug: competition.canonicalSlug, name: competition.nameAr }));

const groups = [
  {
    title: "الأقسام",
    links: [
      { href: "/today", label: "مباريات اليوم" },
      { href: "/matches", label: "المباريات" },
      { href: "/live", label: "المباشر" },
      { href: "/results", label: "النتائج" },
      { href: "/competitions", label: "البطولات" },
      { href: "/teams", label: "الفرق" },
      { href: "/players", label: "اللاعبون" },
      { href: "/watch", label: "جدول البث" },
    ],
  },
  {
    title: "المحتوى",
    links: [
      { href: "/news", label: "كل الأخبار" },
      { href: "/news?category=تحليل", label: "تحليلات" },
      { href: "/news?category=انتقالات", label: "الانتقالات" },
      { href: "/standings", label: "الترتيب والإحصائيات" },
      { href: "/search", label: "البحث" },
      { href: "/learn", label: "دليل فهم الإحصاءات" },
    ],
  },
  {
    title: "عن المنصة",
    links: [
      { href: "/about", label: "من نحن" },
      { href: "/contact", label: "اتصل بنا" },
      { href: "/faq", label: "الأسئلة الشائعة" },
      { href: "/broadcast-rights", label: "إفصاح حقوق البث" },
      { href: "/privacy", label: "سياسة الخصوصية" },
      { href: "/terms", label: "شروط الاستخدام" },
      { href: "/copyright", label: "حقوق النشر" },
    ],
  },
];

export default async function Footer() {
  const servable = await dataServable();
  return (
    <footer className="mt-16 border-t-2 border-gold-500/40 bg-navy-900 text-white">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-12 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo size={40} tone="light" />
          <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-white/60">
            نعرض مواعيد ونتائج المباريات من مصادر البيانات المتاحة، ونوضح حالة التحديث عند توفرها. روابط البث الرسمية الموثّقة فقط، من دون إعادة بث أي محتوى.
          </p>
          {preview ? (
            <p className="mt-4 text-[11px] leading-relaxed text-white/45">
              قد تعرض بيئة المعاينة بيانات توضيحية للتطوير، وتُوسم بوضوح؛ لا تمثل نتائج أو إحصاءات فعلية.
            </p>
          ) : null}
        </div>

        {groups.map((g) => (
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
            <span className="font-bold text-white/60">الرياضات المتاحة:</span>
            {footerSports.map((sport) => (
              <Link key={sport.slug} href={`/matches?sport=${sport.slug}`} className="inline-flex min-h-11 items-center transition hover:text-gold-400 focus-ring">
                {sport.name}
              </Link>
            ))}
          </span>
        </div>
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-4 px-4 pb-6 text-[11px] text-white/45">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-white/60">البطولات:</span>
            {footerCompetitions.map((competition) => (
              <Link key={competition.slug} href={`/competitions/${competition.slug}`} className="inline-flex min-h-11 items-center transition hover:text-gold-400 focus-ring">
                {competition.name}
              </Link>
            ))}
          </span>
        </div>
      </div>

      <div className="border-t border-white/10 bg-navy-950">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] text-white/65">
          <span>© {new Date().getFullYear()} نيمو سبورتس · NEMO Sports. جميع الحقوق محفوظة.</span>
          <span>
            تُعرض شعارات الجهات الرياضية عند توفرها من مصدر البيانات، وتبقى مملوكة لأصحابها؛ لا نستضيف بثًا غير مرخّص.
          </span>
          <span className="flex flex-wrap items-center gap-2">
            {servable && footballDataAttributionEnabled ? <PoweredByFootballData /> : null}
            {servable && sportScoreAttributionEnabled ? <PoweredBy /> : null}
          </span>
          <AttributionFooter exclude={["SportScore", "Football-Data.org"]} className="w-full border-t border-white/10 pt-3" />
        </div>
      </div>
    </footer>
  );
}
