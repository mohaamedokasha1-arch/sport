import type { Metadata } from "next";
import Link from "next/link";
import Crest from "@/components/ui/Crest";
import SectionHead from "@/components/ui/SectionHead";
import { allMatches, broadcastPartners } from "@/lib/data";
import { competitionBySlug, teamBySlug } from "@/lib/core-data";
import { dateAr, timeOf } from "@/lib/format";

export const metadata: Metadata = {
  title: "البث المباشر — جدول النواقل الرسميين",
  description:
    "جدول المباريات المتاحة للبث عبر نواقل رسميين مرخّصين فقط، مع الإفصاح عن الجهة الناقلة والمناطق المسموح بها.",
  alternates: { canonical: "/watch" },
};

export default function WatchPage() {
  const broadcastable = allMatches
    .filter((m) => m.broadcast)
    .sort((a, b) => +new Date(a.kickoff) - +new Date(b.kickoff));

  const live = broadcastable.filter((m) => m.broadcast?.status === "LIVE_NOW");
  const soon = broadcastable.filter((m) => m.broadcast?.status === "COMING_SOON");
  const done = broadcastable.filter((m) => m.broadcast?.status === "FINISHED");

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">Legal Broadcasts</p>
          <h1 className="text-2xl font-extrabold tracking-tight">البث المباشر</h1>
        </div>
        <p className="text-[12px] text-muted">
          <span className="num font-bold">{broadcastable.length}</span> مباراة عبر نواقل رسميين
        </p>
      </header>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        {[
          { icon: "✅", title: "روابط رسمية فقط", text: "لا نعرض إلا مصادر تأكدنا من امتلاكها حقوق البث في منطقتها." },
          { icon: "🚫", title: "لا إعادة بث", text: "لا نخزّن ولا نعيد بث أي إشارة، ولا نستخدم روابط غير مرخّصة إطلاقًا." },
          { icon: "🌍", title: "إفصاح جغرافي", text: "نوضّح اسم الناقل والمناطق المسموح بها قبل الضغط على أي رابط." },
        ].map((c) => (
          <div key={c.title} className="card p-4">
            <p className="text-lg" aria-hidden>{c.icon}</p>
            <h2 className="mt-1 text-[13px] font-extrabold">{c.title}</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">{c.text}</p>
          </div>
        ))}
      </div>

      {live.length > 0 ? <Schedule title="يبث الآن" list={live} tone="live" /> : null}
      {soon.length > 0 ? <Schedule title="يبدأ قريبًا" list={soon} tone="soon" /> : null}
      {done.length > 0 ? <Schedule title="انتهى بثها" list={done} tone="done" /> : null}

      <section className="mt-10">
        <SectionHead eyebrow="Licensed partners" title="النواقل المسجّلون" href="/broadcast-rights" linkLabel="سياسة الحقوق" />
        <div className="card overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-line bg-navy-850/[0.04] text-muted dark:bg-white/[0.04]">
                <th className="px-3 py-2.5 text-start font-semibold">الناقل</th>
                <th className="px-3 py-2.5 text-start font-semibold">النوع</th>
                <th className="px-3 py-2.5 text-start font-semibold">الترخيص</th>
                <th className="px-3 py-2.5 text-start font-semibold">المناطق</th>
                <th className="px-3 py-2.5 text-start font-semibold">الحالة</th>
                <th className="num px-3 py-2.5 font-semibold">آخر تحقق</th>
              </tr>
            </thead>
            <tbody>
              {broadcastPartners.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-navy-850/[0.03] dark:hover:bg-white/[0.04]">
                  <td className="px-3 py-2.5 font-bold">{p.name}</td>
                  <td className="px-3 py-2.5 text-muted">{p.type}</td>
                  <td className="px-3 py-2.5">{p.licenseType === "embed" ? "تضمين مسموح" : "رابط خارجي"}</td>
                  <td className="px-3 py-2.5 text-muted">{p.regions.join("، ")}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-[3px] px-2 py-0.5 text-[10px] font-extrabold ${
                        p.status === "approved"
                          ? "bg-win/15 text-win"
                          : p.status === "pending"
                            ? "bg-warn/15 text-warn"
                            : "bg-live/15 text-live"
                      }`}
                    >
                      {p.status === "approved" ? "موثّق" : p.status === "pending" ? "قيد المراجعة" : "مرفوض"}
                    </span>
                  </td>
                  <td className="num px-3 py-2.5 text-center text-muted">{p.verifiedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          لا يُنشر أي رابط بث قبل توثيق الترخيص في لوحة التحكم (اسم المصدر، نوع الترخيص،
          المناطق، نسخة العقد، حالة الموافقة). الناقلون قيد المراجعة لا يظهرون للزوار.
        </p>
      </section>
    </div>
  );
}

function Schedule({
  title,
  list,
  tone,
}: {
  title: string;
  list: typeof allMatches;
  tone: "live" | "soon" | "done";
}) {
  const badge =
    tone === "live" ? "bg-live text-white" : tone === "soon" ? "bg-gold-500 text-navy-900" : "bg-navy-850/10 text-muted";

  return (
    <section className="mb-8">
      <SectionHead eyebrow={tone === "live" ? "On air" : tone === "soon" ? "Upcoming" : "Replay"} title={title} />
      <ul className="space-y-2">
        {list.map((m) => (
          <li key={m.id}>
            <Link
              href={`/matches/${m.slug}#broadcast`}
              className="card grid grid-cols-[1fr_auto] items-center gap-3 p-3 transition hover:border-gold-500/50 sm:grid-cols-[1fr_220px_auto]"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Crest slug={m.home} size={26} />
                <span className="truncate text-[13px] font-bold">{teamBySlug(m.home)?.name}</span>
                <span className="text-[11px] text-muted">×</span>
                <span className="truncate text-[13px] font-bold">{teamBySlug(m.away)?.name}</span>
                <Crest slug={m.away} size={26} />
              </span>

              <span className="hidden text-[11px] text-muted sm:block">
                {competitionBySlug(m.competition)?.name} · {dateAr(m.kickoff)}
              </span>

              <span className="flex items-center justify-end gap-2">
                <span className="text-[11px] font-bold text-muted">{m.broadcast?.provider}</span>
                <span className="num text-[12px] font-extrabold">{timeOf(m.kickoff)}</span>
                <span className={`rounded-[3px] px-2 py-1 text-[10px] font-extrabold ${badge}`}>
                  {tone === "live" ? "LIVE" : tone === "soon" ? "قريبًا" : "انتهى"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
