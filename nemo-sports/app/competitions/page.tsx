import type { Metadata } from "next";
import Link from "next/link";
import CompetitionCard from "@/components/competition/CompetitionCard";
import SectionHead from "@/components/ui/SectionHead";
import { competitions, sports } from "@/lib/core-data";

export const metadata: Metadata = {
  title: "البطولات — كل المسابقات حسب الرياضة",
  description: "دليل البطولات: الدوريات والكؤوس والبطولات الفردية عبر 8 رياضات.",
  alternates: { canonical: "/competitions" },
};

export default function CompetitionsPage() {
  const bySport = competitions.reduce<Record<string, typeof competitions>>((acc, c) => {
    (acc[c.sport] ||= []).push(c);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">Competitions</p>
          <h1 className="text-2xl font-extrabold tracking-tight">البطولات</h1>
        </div>
        <p className="text-[12px] text-muted">
          <span className="num font-bold">{competitions.length}</span> بطولة نشطة
        </p>
      </header>

      <div className="space-y-9">
        {sports.map((s) =>
          bySport[s.slug]?.length ? (
            <section key={s.slug}>
              <SectionHead eyebrow={s.nameEn} title={`${s.icon} ${s.name}`} href={`/matches?sport=${s.slug}`} linkLabel="مباريات الرياضة" />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {bySport[s.slug].map((c) => (
                  <CompetitionCard key={c.slug} slug={c.slug} />
                ))}
              </div>
            </section>
          ) : null,
        )}
      </div>

      <p className="mt-10 card p-4 text-[11px] leading-relaxed text-muted">
        ترتيب الجولات وأسماء الفرق في هذه النسخة التجريبية بيانات توضيحية. في الإنتاج تُبنى
        الجداول من مزوّد البيانات المرخّص، ويُذكر اسم المصدر وتاريخ آخر تحديث أسفل كل جدول —
        <Link href="/copyright" className="font-bold text-gold-600 dark:text-gold-400"> سياسة حقوق البيانات</Link>.
      </p>
    </div>
  );
}
