import type { Metadata } from "next";
import DataUnavailable from "@/components/ui/DataUnavailable";
import Link from "next/link";
import Crest from "@/components/ui/Crest";
import SectionHead from "@/components/ui/SectionHead";
import { allMatches, broadcastPartners } from "@/lib/data";
import { competitionBySlug, teamBySlug } from "@/lib/core-data";
import { dateAr, timeOf } from "@/lib/format";
import { listBroadcasters } from "@/lib/broadcasts";
import { listMatchStreams, streamPhase, type MatchStreamSource } from "@/lib/match-streams";
import { hasMatchIdentity, matchDetail as sdlMatchDetail } from "@/lib/sdl-gateway";
import { demoContentVisible } from "@/lib/site";

export const metadata: Metadata = {
  title: "البث المباشر — جدول النواقل الرسميين",
  description:
    "جدول المباريات المتاحة للبث عبر نواقل رسميين مرخّصين فقط، مع الإفصاح عن الجهة الناقلة والمناطق المسموح بها.",
  alternates: { canonical: "/watch" },
};

export const revalidate = 60;

/* ── live registry → schedule rows ────────────────────────────── */

type StreamRow = {
  key: string;
  slug: string | null;
  home: string;
  away: string;
  competition: string | null;
  kickoff: string | null;
  phase: "live" | "upcoming" | "inactive" | "unlinked";
};

/**
 * Join ONE admin-registered stream with its match (best-effort, never throws).
 * Streams are admin-curated so N is small; each lookup rides the SDL cache.
 * Unresolvable streams still render — with alias names and a link to the
 * match page when a slug exists — instead of silently disappearing.
 */
async function resolveStreamRow(s: MatchStreamSource): Promise<StreamRow> {
  const slug = s.slugs[0] ?? null;
  const aliasHome = s.homeAliases[0] ?? null;
  const aliasAway = s.awayAliases[0] ?? null;
  if (slug) {
    try {
      const res = await sdlMatchDetail("football", slug);
      if (res.ok && res.source === "provider" && hasMatchIdentity(res.data)) {
        const f = res.data;
        return {
          key: s.id,
          slug,
          home: f.homeName ?? aliasHome ?? "—",
          away: f.awayName ?? aliasAway ?? "—",
          competition: f.competitionName ?? null,
          kickoff: f.scheduledAt,
          phase: streamPhase(f.status),
        };
      }
    } catch {
      // fall through to the alias fallback below
    }
  }
  return {
    key: s.id,
    slug,
    home: aliasHome ?? slug ?? "—",
    away: aliasAway ?? "—",
    competition: null,
    kickoff: null,
    phase: "unlinked",
  };
}

/* ── page ─────────────────────────────────────────────────────── */

export default async function WatchPage() {
  const [broadcasters, streams] = await Promise.all([listBroadcasters(false), listMatchStreams(false)]);

  // Dev/preview only: the legacy static schedule renders when the live
  // registry is empty. Production never takes this branch with real data.
  if (demoContentVisible() && broadcasters.length === 0 && streams.length === 0) {
    return <LegacyDemoWatch />;
  }

  const rows = await Promise.all(streams.map(resolveStreamRow));
  const live = rows.filter((r) => r.phase === "live");
  const soon = rows.filter((r) => r.phase === "upcoming");
  const done = rows.filter((r) => r.phase === "inactive");
  const unlinked = rows.filter((r) => r.phase === "unlinked");

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b-2 border-line pb-3">
        <div>
          <p className="eyebrow mb-1">البث المرخّص</p>
          <h1 className="text-2xl font-extrabold tracking-tight">البث المباشر</h1>
        </div>
        <p className="text-[12px] text-muted">
          <span className="num font-bold">{rows.length}</span> مباراة مربوطة ببث رسمي ·{" "}
          <span className="num font-bold">{broadcasters.length}</span> ناقل موثّق
        </p>
      </header>

      {rows.length === 0 ? (
        <DataUnavailable
          title="لا توجد مباريات مربوطة ببث الآن"
          message="نعرض هنا فقط المباريات التي سجّلت لها الإدارة مصدر بث رسميًا موثّقًا. جدول النواقل المعتمدين أدناه."
        />
      ) : null}

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

      {live.length > 0 ? <StreamSchedule title="يبث الآن" list={live} tone="live" /> : null}
      {soon.length > 0 ? <StreamSchedule title="يبدأ قريبًا" list={soon} tone="soon" /> : null}
      {unlinked.length > 0 ? <StreamSchedule title="بث مسجّل" list={unlinked} tone="unlinked" /> : null}
      {done.length > 0 ? <StreamSchedule title="انتهى بثها" list={done} tone="done" /> : null}

      <section className="mt-10">
        <SectionHead eyebrow="النواقل المرخّصون" title="النواقل المسجّلون" href="/broadcast-rights" linkLabel="سياسة الحقوق" />
        {broadcasters.length === 0 ? (
          <DataUnavailable
            title="لا نواقل موثّقين بعد"
            message="يُدار سجل النواقل الرسميين من لوحة التحرير، ولا يظهر أي ناقل قبل توثيق حقوقه ومناطقه."
          />
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-line bg-navy-850/[0.04] text-muted dark:bg-white/[0.04]">
                  <th className="px-3 py-2.5 text-start font-semibold">الناقل</th>
                  <th className="px-3 py-2.5 text-start font-semibold">المنصة</th>
                  <th className="px-3 py-2.5 text-start font-semibold">البطولة</th>
                  <th className="px-3 py-2.5 text-start font-semibold">المناطق</th>
                  <th className="px-3 py-2.5 text-start font-semibold">الوصول</th>
                  <th className="num px-3 py-2.5 font-semibold">آخر تحديث</th>
                </tr>
              </thead>
              <tbody>
                {broadcasters.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0 hover:bg-navy-850/[0.03] dark:hover:bg-white/[0.04]">
                    <td className="px-3 py-2.5 font-bold">{p.broadcasterName}</td>
                    <td className="px-3 py-2.5 text-muted">{p.platform}</td>
                    <td className="px-3 py-2.5 text-muted">{p.competitionName}</td>
                    <td className="px-3 py-2.5 text-muted">{p.regions.length > 0 ? p.regions.join("، ") : "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-[3px] px-2 py-0.5 text-[10px] font-extrabold ${p.freeAccess ? "bg-win/15 text-win" : "bg-gold-500/15 text-gold-600 dark:text-gold-400"}`}>
                        {p.freeAccess ? "مجاني" : p.requiresSubscription ? "اشتراك" : "—"}
                      </span>
                    </td>
                    <td className="num px-3 py-2.5 text-center text-muted">{dateAr(p.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          لا يُنشر أي رابط بث قبل توثيق الترخيص في لوحة التحكم (اسم المصدر، نوع الترخيص،
          المناطق، مصدر التحقق، حالة الموافقة). الناقلون قيد المراجعة لا يظهرون للزوار.
        </p>
      </section>
    </div>
  );
}

function StreamSchedule({
  title,
  list,
  tone,
}: {
  title: string;
  list: StreamRow[];
  tone: "live" | "soon" | "done" | "unlinked";
}) {
  const badge =
    tone === "live"
      ? "bg-live text-white"
      : tone === "soon"
        ? "bg-gold-500 text-navy-900"
        : "bg-navy-850/10 text-muted";

  return (
    <section className="mb-8">
      <SectionHead
        eyebrow={tone === "live" ? "مباشر" : tone === "soon" ? "قادمة" : tone === "unlinked" ? "مسجّلة" : "إعادة البث"}
        title={title}
      />
      <ul className="space-y-2">
        {list.map((r) => {
          const inner = (
            <>
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="truncate text-[13px] font-bold">{r.home}</span>
                <span className="text-[11px] text-muted">×</span>
                <span className="truncate text-[13px] font-bold">{r.away}</span>
              </span>

              <span className="hidden text-[11px] text-muted sm:block">
                {r.competition ?? "—"}
                {r.kickoff ? ` · ${dateAr(r.kickoff)}` : ""}
              </span>

              <span className="flex items-center justify-end gap-2">
                {r.kickoff ? <span className="num text-[12px] font-extrabold">{timeOf(r.kickoff)}</span> : null}
                <span className={`rounded-[3px] px-2 py-1 text-[10px] font-extrabold ${badge}`}>
                  {tone === "live" ? "مباشر" : tone === "soon" ? "قريبًا" : tone === "unlinked" ? "مسجّل" : "انتهى"}
                </span>
              </span>
            </>
          );
          const cls =
            "card grid grid-cols-[1fr_auto] items-center gap-3 p-3 transition hover:border-gold-500/50 sm:grid-cols-[1fr_220px_auto]";
          return (
            <li key={r.key}>
              {r.slug ? (
                <Link href={`/matches/${r.slug}#live-stream`} className={cls}>
                  {inner}
                </Link>
              ) : (
                <div className={cls}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── legacy static schedule: dev/preview design QA only ───────────── */

function LegacyDemoWatch() {
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
          <p className="eyebrow mb-1">البث المرخّص</p>
          <h1 className="text-2xl font-extrabold tracking-tight">البث المباشر</h1>
        </div>
        <p className="text-[12px] text-muted">
          <span className="num font-bold">{broadcastable.length}</span> سجلًا في بيانات المعاينة
        </p>
      </header>
      <p className="mb-6 rounded-[3px] border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-[11px] font-semibold text-muted">سجل البث أدناه توضيحي للتطوير فقط؛ لم يتم التحقق من النواقل أو الحقوق ولا يُعدّ مصدر بث معتمدًا.</p>

      {broadcastable.length === 0 ? (
        <DataUnavailable
          title="لا توجد مباريات متاحة للبث الآن"
          message="نعرض فقط روابط بث رسمية مرخّصة مرتبطة بمباريات حقيقية مؤكدة."
        />
      ) : null}

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
        <SectionHead eyebrow="النواقل المرخّصون" title="النواقل المسجّلون" href="/broadcast-rights" linkLabel="سياسة الحقوق" />
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
      <SectionHead eyebrow={tone === "live" ? "مباشر" : tone === "soon" ? "قادمة" : "إعادة البث"} title={title} />
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
                  {tone === "live" ? "مباشر" : tone === "soon" ? "قريبًا" : "انتهى"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
