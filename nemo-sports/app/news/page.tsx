import type { Metadata } from "next";
import DataUnavailable from "@/components/ui/DataUnavailable";
import Link from "next/link";
import NewsCard from "@/components/news/NewsCard";
import { articles } from "@/lib/data";
import { competitions, sports } from "@/lib/core-data";

export const metadata: Metadata = {
  title: "الأخبار — كل الأخبار الرياضية",
  description: "أخبار وتحليلات وتقارير رياضية، مع ملخصات موثقة من مصادر خارجية وروابطها الأصلية.",
  alternates: { canonical: "/news" },
};

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const category = typeof sp.category === "string" ? sp.category : "";
  const sport = typeof sp.sport === "string" ? sp.sport : "";
  const competition = typeof sp.competition === "string" ? sp.competition : "";

  const list = articles.filter(
    (a) =>
      (!category || a.category === category) &&
      (!sport || a.sport === sport) &&
      (!competition || a.competition === competition),
  );

  const categories = Array.from(new Set(articles.map((a) => a.category)));

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">Newsroom</p>
          <h1 className="text-2xl font-extrabold tracking-tight">الأخبار</h1>
        </div>
        <p className="text-[12px] text-muted">
          <span className="num font-bold">{list.length}</span> خبرًا ·
          {" "}محتوى أصلي وملخصات موثقة من مصادر خارجية
        </p>
      </header>

      {articles.length === 0 ? (
        <DataUnavailable
          title="لا توجد أخبار منشورة حاليًا"
          message="الأخبار تُنشر من فريق التحرير أو بملخص موثق من مصدر خارجي. لا توجد أخبار وهمية على نيمو سبورتس."
        />
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        <Link
          href="/news"
          className={`rounded-[3px] px-3 py-1.5 text-[12px] font-bold transition ${
            !category && !sport && !competition
              ? "bg-navy-850 text-white"
              : "border border-line bg-surface text-muted hover:border-gold-500"
          }`}
        >
          الكل
        </Link>
        {categories.map((c) => (
          <Link
            key={c}
            href={`/news?category=${encodeURIComponent(c)}`}
            className={`rounded-[3px] px-3 py-1.5 text-[12px] font-bold transition ${
              category === c
                ? "bg-navy-850 text-white"
                : "border border-line bg-surface text-muted hover:border-gold-500"
            }`}
          >
            {c}
          </Link>
        ))}
        <span className="mx-1 h-6 w-px self-center bg-line" aria-hidden />
        {sports.map((s) => (
          <Link
            key={s.slug}
            href={`/news?sport=${s.slug}`}
            className={`rounded-[3px] px-3 py-1.5 text-[12px] font-bold transition ${
              sport === s.slug
                ? "bg-gold-500 text-navy-900"
                : "border border-line bg-surface text-muted hover:border-gold-500"
            }`}
          >
            {s.icon} {s.name}
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="card grid place-items-center gap-2 px-6 py-16 text-center">
          <p className="text-[15px] font-bold">لا توجد أخبار بهذا التصنيف</p>
          <Link href="/news" className="text-[13px] font-bold text-gold-600 dark:text-gold-400">
            عرض كل الأخبار
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="grid gap-4 sm:grid-cols-2">
            {list.map((a, i) => (
              <NewsCard key={a.slug} article={a} layout={i === 0 ? "lead" : "grid"} />
            ))}
          </div>

          <aside className="space-y-5">
            <div className="card overflow-hidden">
              <h2 className="border-b border-line bg-navy-850 px-3 py-2.5 text-[13px] font-extrabold text-white">
                حسب البطولة
              </h2>
              <ul className="divide-y divide-line">
                {competitions.slice(0, 8).map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/news?competition=${c.slug}`}
                      className="flex items-center justify-between gap-2 px-3 py-2.5 text-[12px] font-semibold transition hover:bg-navy-850/[0.03] dark:hover:bg-white/[0.04]"
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="num shrink-0 text-[11px] text-muted">
                        {articles.filter((a) => a.competition === c.slug).length}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card p-4 text-[11px] leading-relaxed text-muted">
              <p className="eyebrow mb-2">سياسة المحتوى</p>
              <p>
                الأخبار المكتوبة داخل نيمو سبورتس من إنتاج محررينا. أما الملخصات المأخوذة من
                مصادر خارجية فتُنشر بملخص أصلي ورابط واضح للمصدر، دون نسخ النص كاملًا —{" "}
                <Link href="/copyright" className="font-bold text-gold-600 dark:text-gold-400">
                  تفاصيل السياسة
                </Link>
                .
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
