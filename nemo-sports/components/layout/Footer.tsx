import Link from "next/link";
import Logo from "@/components/brand/Logo";
import PoweredBy from "@/components/ui/PoweredBy";
import { sports } from "@/lib/core-data";
import { competitions } from "@/lib/core-data";

const groups = [
  {
    title: "الأقسام",
    links: [
      { href: "/matches", label: "المباريات" },
      { href: "/live", label: "النتائج المباشرة" },
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

export default function Footer() {
  return (
    <footer className="mt-16 border-t-2 border-gold-500/40 bg-navy-900 text-white">
      <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-12 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo size={40} tone="light" />
          <p className="mt-4 max-w-sm text-[13px] leading-relaxed text-white/60">
            منصة رياضية شاملة تغطي 8 رياضات: نتائج مباشرة، أخبار موثوقة، إحصائيات تفصيلية،
            وروابط بث رسمية مرخّصة فقط. لا نعيد بث أي محتوى، ولا ننقل ما لا نملك حقّه.
          </p>
          <p className="mt-4 text-[11px] leading-relaxed text-white/40">
            البيانات الرياضية في هذه النسخة التجريبية بيانات توضيحية مُولّدة محليًا.
            في بيئة الإنتاج تُجلب من مزوّدين مرخّصين (المصدر الأساسي ثم البديل ثم الإدخال
            اليدوي) مع عرض اسم المصدر وتوقيت آخر تحديث.
          </p>
          <div className="mt-5 flex gap-2">
            {["فيسبوك", "إكس", "يوتيوب", "إنستغرام"].map((s) => (
              <span
                key={s}
                className="grid h-9 w-9 place-items-center rounded-[3px] border border-white/15 text-[10px] font-bold text-white/60"
                title={s}
              >
                {s.slice(0, 1)}
              </span>
            ))}
          </div>
        </div>

        {groups.map((g) => (
          <nav key={g.title} aria-label={g.title}>
            <h3 className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.18em] text-gold-500">
              {g.title}
            </h3>
            <ul className="space-y-2">
              {g.links.map((l) => (
                <li key={l.href + l.label}>
                  <Link href={l.href} className="text-[13px] text-white/65 transition hover:text-gold-400">
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
            <span className="font-bold text-white/60">الرياضات:</span>
            {sports.map((s) => (
              <Link key={s.slug} href={`/matches?sport=${s.slug}`} className="transition hover:text-gold-400">
                {s.name}
              </Link>
            ))}
          </span>
        </div>
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-4 px-4 pb-6 text-[11px] text-white/45">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-white/60">بطولات:</span>
            {competitions.slice(0, 8).map((c) => (
              <Link key={c.slug} href={`/competitions/${c.slug}`} className="transition hover:text-gold-400">
                {c.name}
              </Link>
            ))}
          </span>
        </div>
      </div>

      <div className="border-t border-white/10 bg-navy-950">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] text-white/40">
          <span>© {new Date().getFullYear()} نيمو سبورتس · NEMO Sports. جميع الحقوق محفوظة.</span>
          <span>
            شعارات الفرق المعروضة رسوم توضيحية من تصميمنا، ولا نُضمّن أي شعارات أو بثّات مملوكة للغير.
          </span>
          {/* SportScore attribution (license requirement: visible dofollow link) */}
          <PoweredBy />
        </div>
      </div>
    </footer>
  );
}
