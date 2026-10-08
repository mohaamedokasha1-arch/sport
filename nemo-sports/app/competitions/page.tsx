import type { Metadata } from "next";
import Link from "next/link";
import CompetitionCard from "@/components/competition/CompetitionCard";
import SectionHead from "@/components/ui/SectionHead";
import { competitions, sports } from "@/lib/core-data";
import { footballDataCompetitions } from "@/lib/football-data";
import { demoContentVisible } from "@/lib/site";
import { AdminCompetitionsSection } from "@/components/public/AdminPublished";

export const metadata: Metadata = {
  title: "البطولات — المسابقات ضمن نطاق التغطية",
  description: "تصفّح البطولات المتاحة ضمن نطاق تكامل البيانات، وافتح صفحات الترتيب والمباريات عند توفر استجابة من المصدر.",
  alternates: { canonical: "/competitions" },
};

function CompetitionsPageBody() {
  if (!demoContentVisible()) {
    const supported = footballDataCompetitions(true);
    return (
      <div className="mx-auto max-w-[1280px] px-4 py-6">
        <header className="mb-6 border-b-2 border-line pb-3">
          <p className="eyebrow mb-1">نطاق تغطية البيانات</p>
          <h1 className="text-2xl font-extrabold tracking-tight">بطولات كرة القدم المتاحة</h1>
          <p className="mt-2 text-[12px] leading-5 text-muted">هذه قائمة البطولات المعرّفة في تكامل البيانات، وليست تأكيدًا على توفر تحديث فوري لكل بطولة.</p>
        </header>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {supported.map((competition) => (
            <li key={competition.code}>
              <Link href={`/competitions/${encodeURIComponent(competition.slug ?? competition.code)}`} className="card flex min-h-20 items-center gap-3 p-4 transition hover:border-gold-500/50 focus-ring">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[4px] bg-navy-850 text-[11px] font-extrabold text-gold-400">{competition.code}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-bold">{competition.nameAr}</span>
                  <span className="block text-[11px] text-muted">{competition.countryAr}</span>
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
          <p className="eyebrow mb-1">معاينة دليل البطولات</p>
          <h1 className="text-2xl font-extrabold tracking-tight">البطولات</h1>
        </div>
        <p className="text-[12px] text-muted"><span className="num font-bold">{competitions.length}</span> عنصرًا في بيانات المعاينة</p>
      </header>
      <p className="mb-6 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[12px] font-semibold leading-5 text-muted">بيانات البطولات التجريبية هنا لا تثبت وجود تغطية أو جداول حقيقية.</p>
      <div className="space-y-9">
        {sports.map((sport) => bySport[sport.slug]?.length ? (
          <section key={sport.slug}>
            <SectionHead eyebrow={sport.nameEn} title={`${sport.icon} ${sport.name}`} href={`/matches?sport=${sport.slug}`} linkLabel="مباريات المعاينة" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {bySport[sport.slug].map((competition) => <CompetitionCard key={competition.slug} slug={competition.slug} />)}
            </div>
          </section>
        ) : null)}
      </div>
    </div>
  );
}

export default async function CompetitionsPage() {
  return (
    <>
      <AdminCompetitionsSection />
      <CompetitionsPageBody />
    </>
  );
}
