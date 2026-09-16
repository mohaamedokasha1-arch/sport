"use client";

import Link from "next/link";
import { useState } from "react";
import Crest from "@/components/ui/Crest";
import StatusBadge from "@/components/ui/StatusBadge";
import useMatchState from "@/components/live/useMatchState";
import type { LiveState } from "@/lib/live";
import { EVENT_LABEL, awayTeam, compOf, dateAr, homeTeam, number, relative, timeOf } from "@/lib/format";
import type { Match } from "@/lib/data";
import { teamBySlug } from "@/lib/core-data";

const TABS = [
  { id: "summary", label: "الملخص" },
  { id: "events", label: "الأحداث" },
  { id: "stats", label: "الإحصائيات" },
  { id: "lineups", label: "التشكيلات" },
  { id: "news", label: "الأخبار" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function MatchLive({
  match,
  initial,
  relatedNews,
}: {
  match: Match;
  initial: LiveState;
  relatedNews: { slug: string; title: string; excerpt: string; author: string; publishedAgoMin: number }[];
}) {
  const state = useMatchState(match.id, initial);
  const [tab, setTab] = useState<TabId>("summary");
  const home = homeTeam(match);
  const away = awayTeam(match);
  const comp = compOf(match);
  const isLive = state.status === "LIVE" || state.status === "HT";
  const isDone = state.status === "FINISHED";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        {/* scoreboard */}
        <section className="stripes relative overflow-hidden rounded-[8px] border border-navy-700 bg-navy-850 text-white">
          <span className="absolute -start-20 -top-24 h-64 w-64 rounded-full bg-gold-500/10 blur-3xl" aria-hidden />
          <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5 text-[11px]">
            <span className="flex items-center gap-2 font-semibold text-white/70">
              <span className="rounded-[3px] bg-gold-500 px-1.5 py-0.5 font-display text-[10px] font-extrabold tracking-widest text-navy-900">
                {comp.code}
              </span>
              <Link href={`/competitions/${comp.slug}`} className="transition hover:text-gold-400">
                {comp.name}
              </Link>
              <span aria-hidden className="text-white/25">·</span>
              <span>{match.round}</span>
            </span>
            <span className="flex items-center gap-2">
              {isLive ? <span className="live-dot" aria-hidden /> : null}
              <span className="num font-bold">{state.clock}</span>
              <span className="text-white/45">
                {isLive ? "تحديث كل 4 ثوانٍ" : isDone ? dateAr(match.kickoff) : relative(match.kickoff)}
              </span>
            </span>
          </div>

          <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <Crest slug={match.home} size={72} />
              <div>
                <Link href={`/teams/${home.slug}`} className="block text-base font-extrabold transition hover:text-gold-400">
                  {home.name}
                </Link>
                <span className="text-[11px] text-white/50">{home.country}</span>
              </div>
            </div>

            <div className="flex flex-col items-center px-3">
              {isDone || isLive ? (
                <span className="num text-5xl font-extrabold leading-none" dir="ltr">
                  {state.homeScore}
                  <span className="mx-2 text-gold-500">–</span>
                  {state.awayScore}
                </span>
              ) : (
                <>
                  <span className="num text-4xl font-extrabold leading-none text-gold-400" dir="ltr">
                    {timeOf(match.kickoff)}
                  </span>
                  <span className="mt-1 text-[11px] text-white/60">{dateAr(match.kickoff)}</span>
                </>
              )}
              <span className="mt-3">
                <StatusBadge status={state.status} clock={isLive ? state.clock : undefined} />
              </span>
            </div>

            <div className="flex flex-col items-center gap-3 text-center">
              <Crest slug={match.away} size={72} />
              <div>
                <Link href={`/teams/${away.slug}`} className="block text-base font-extrabold transition hover:text-gold-400">
                  {away.name}
                </Link>
                <span className="text-[11px] text-white/50">{away.country}</span>
              </div>
            </div>
          </div>

          <div className="relative flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-[11px] text-white/60">
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {match.venue ? <span>🏟 {match.venue}</span> : null}
              {match.referee ? <span>🧑‍⚖️ الحكم: {match.referee}</span> : null}
              {match.attendance ? <span className="num">👥 {number(match.attendance)}</span> : null}
              <span>موسم {comp.season}</span>
            </span>
            {isLive ? <span className="num font-bold text-live">{number(match.viewers ?? 0)} مشاهد الآن</span> : null}
          </div>
        </section>

        {/* broadcast */}
        <BroadcastPanel match={match} isLive={isLive} isDone={isDone} />

        {/* tabs */}
        <div className="no-bar mt-5 flex gap-1 overflow-x-auto border-b border-line">
          {TABS.map((t) => {
            const disabled = t.id === "lineups" && match.lineups.length === 0;
            return (
              <button
                key={t.id}
                type="button"
                disabled={disabled}
                onClick={() => setTab(t.id)}
                aria-selected={tab === t.id}
                role="tab"
                className={`relative shrink-0 px-4 py-2.5 text-[13px] font-bold transition focus-ring ${
                  tab === t.id ? "text-navy-850 dark:text-gold-400" : "text-muted hover:text-ink"
                } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
              >
                {t.label}
                {tab === t.id ? <span className="absolute inset-x-0 -bottom-px h-0.5 bg-gold-500" aria-hidden /> : null}
              </button>
            );
          })}
        </div>

        <div className="pt-5">
          {tab === "summary" ? <Summary match={match} state={state} /> : null}
          {tab === "events" ? <Events match={match} state={state} /> : null}
          {tab === "stats" ? <Stats match={match} /> : null}
          {tab === "lineups" ? <Lineups match={match} /> : null}
          {tab === "news" ? <News tab={relatedNews} /> : null}
        </div>
      </div>

      {/* side rail */}
      <aside className="min-w-0 space-y-4">
        <TeamPanel slug={match.home} />
        <TeamPanel slug={match.away} />
        <div className="card p-4 text-[11px] leading-relaxed text-muted">
          <p className="eyebrow mb-2">مشاركة</p>
          <p>
            انسخ رابط الصفحة للمشاركة. نكتفي بالروابط ولا نضمّن أي محتوى مملوك للغير.
          </p>
        </div>
      </aside>
    </div>
  );
}

/* ── broadcast ─────────────────────────────────────────────── */

function BroadcastPanel({ match, isLive, isDone }: { match: Match; isLive: boolean; isDone: boolean }) {
  const b = match.broadcast;
  const stateLabel = isLive ? "LIVE NOW" : isDone ? "انتهى البث" : "يبدأ قريبًا";

  if (!b) {
    return (
      <section id="broadcast" className="mt-4 card border-dashed p-5">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[3px] bg-navy-850/5 text-lg dark:bg-white/10" aria-hidden>
            📺
          </span>
          <div>
            <h2 className="text-[14px] font-extrabold">البث غير متاح</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              لا يوجد ناقل رسمي مسجّل لهذه المباراة في قائمتنا. نعرض فقط المصادر التي تأكدنا
              من ترخيصها، ولا نلجأ أبدًا إلى روابط غير رسمية.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="broadcast" className="mt-4 card overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-navy-850 px-4 py-2.5 text-white">
        <h2 className="flex items-center gap-2 text-[13px] font-extrabold">
          <span aria-hidden>🎬</span> مشاهدة المباراة
        </h2>
        <span
          className={`rounded-[3px] px-2 py-1 text-[10px] font-extrabold tracking-wide ${
            isLive ? "bg-live" : isDone ? "bg-white/15" : "bg-gold-500 text-navy-900"
          }`}
        >
          {stateLabel}
        </span>
      </header>

      <div className="p-4">
        {b.license === "embed" ? (
          <div className="stripes grid aspect-video place-items-center rounded-[4px] border border-navy-700 bg-navy-900 text-center text-white">
            <div>
              <p className="text-[13px] font-bold">مشغّل البث المضمَّن من {b.provider}</p>
              <p className="mt-1 text-[11px] text-white/55">
                يُحمَّل المشغّل من نطاق الناقل الرسمي مباشرة، ولا يمر أي محتوى عبر خوادمنا.
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a
            href={b.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="rounded-[3px] bg-gold-500 px-4 py-2.5 text-[12px] font-extrabold text-navy-900 transition hover:bg-gold-400 focus-ring"
          >
            مشاهدة على {b.provider} ↗
          </a>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[11px]">
            <div>
              <dt className="text-muted">جهة النقل</dt>
              <dd className="font-bold">{b.provider}</dd>
            </div>
            <div>
              <dt className="text-muted">نوع الترخيص</dt>
              <dd className="font-bold">{b.license === "embed" ? "تضمين مسموح" : "رابط خارجي رسمي"}</dd>
            </div>
            <div>
              <dt className="text-muted">المناطق</dt>
              <dd className="font-bold">{b.regions.join("، ")}</dd>
            </div>
          </dl>
        </div>

        {b.geoBlocked ? (
          <p className="mt-3 flex items-start gap-2 rounded-[3px] bg-warn/10 px-3 py-2 text-[11px] font-semibold text-warn">
            <span aria-hidden>🌍</span>
            هذا البث متاح فقط في: {b.regions.join("، ")}. قد لا يعمل الرابط خارج هذه المناطق.
          </p>
        ) : null}

        {b.note ? <p className="mt-2 text-[11px] text-muted">{b.note}</p> : null}

        <p className="mt-3 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
          لا نعيد بث أو تخزين أي إشارة. جميع الروابط تخص نواقل رسميين مرخّصين —{" "}
          <Link href="/broadcast-rights" className="font-bold text-gold-600 dark:text-gold-400">
            اقرأ سياسة حقوق البث
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

/* ── tabs ──────────────────────────────────────────────────── */

function Summary({ match, state }: { match: Match; state: LiveState }) {
  const home = homeTeam(match);
  const away = awayTeam(match);
  const rows = [
    { k: "الحالة", v: state.status === "FINISHED" ? "انتهت المباراة" : state.status === "UPCOMING" ? "لم تبدأ بعد" : "جارية الآن" },
    { k: "البطولة", v: compOf(match).name },
    { k: "الجولة", v: match.round },
    { k: "الملعب", v: match.venue ?? "—" },
    { k: "الحكم", v: match.referee ?? "—" },
    { k: "الحضور", v: match.attendance ? number(match.attendance) : "—" },
    { k: "الموعد", v: `${dateAr(match.kickoff)} · ${timeOf(match.kickoff)}` },
  ];

  return (
    <div className="space-y-5">
      <div className="card overflow-hidden">
        <h3 className="border-b border-line bg-navy-850/[0.04] px-4 py-2.5 text-[13px] font-extrabold dark:bg-white/[0.04]">
          معلومات المباراة
        </h3>
        <dl className="divide-y divide-line">
          {rows.map((r) => (
            <div key={r.k} className="flex items-center justify-between gap-4 px-4 py-2.5 text-[12px]">
              <dt className="text-muted">{r.k}</dt>
              <dd className="font-bold">{r.v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {match.periods?.length ? (
        <div className="card overflow-hidden">
          <h3 className="border-b border-line bg-navy-850/[0.04] px-4 py-2.5 text-[13px] font-extrabold dark:bg-white/[0.04]">
            الفترات
          </h3>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="px-4 py-2 text-start font-semibold">الفترة</th>
                <th className="px-4 py-2 font-semibold">{home.short}</th>
                <th className="px-4 py-2 font-semibold">{away.short}</th>
              </tr>
            </thead>
            <tbody>
              {match.periods.map((p) => (
                <tr key={p.label} className="border-b border-line last:border-0">
                  <td className="px-4 py-2">{p.label}</td>
                  <td className="num px-4 py-2 text-center font-extrabold">{p.home}</td>
                  <td className="num px-4 py-2 text-center font-extrabold">{p.away}</td>
                </tr>
              ))}
              <tr className="bg-navy-850/[0.04] dark:bg-white/[0.04]">
                <td className="px-4 py-2 font-extrabold">المجموع</td>
                <td className="num px-4 py-2 text-center font-extrabold">{state.homeScore}</td>
                <td className="num px-4 py-2 text-center font-extrabold">{state.awayScore}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="text-[11px] leading-relaxed text-muted">
        البيانات المعروضة في هذه النسخة التجريبية مولّدة محليًا لأغراض العرض. في الإنتاج تُجلب
        النتائج من مزوّد بيانات مرخّص مع مصدر بديل، ويظهر اسم المصدر وتوقيت آخر تحديث أسفل كل جدول.
      </p>
    </div>
  );
}

function Events({ match, state }: { match: Match; state: LiveState }) {
  const home = homeTeam(match);
  const away = awayTeam(match);
  const events = [...state.events].sort((a, b) => b.minute - a.minute);

  if (events.length === 0) {
    return (
      <p className="card px-4 py-10 text-center text-[13px] text-muted">
        لا توجد أحداث مسجّلة بعد لهذه المباراة.
      </p>
    );
  }

  return (
    <ol className="card divide-y divide-line">
      {events.map((e) => {
        const meta = EVENT_LABEL[e.type];
        const isHome = e.side === "home";
        const team = isHome ? home : away;
        return (
          <li key={e.id} className="flex items-center gap-3 px-4 py-3">
            <span className="num w-10 shrink-0 text-center text-[12px] font-extrabold text-muted">
              {e.type === "period" ? "⏱" : `${e.minute}'`}
            </span>
            <span
              className={`flex min-w-0 flex-1 items-center gap-2.5 ${
                e.side === "away" ? "flex-row-reverse text-end" : ""
              } ${e.side === "neutral" ? "justify-center text-center" : ""}`}
            >
              {e.side !== "neutral" ? <Crest slug={isHome ? match.home : match.away} size={24} /> : null}
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[13px] font-bold">
                  <span className={meta.tone} aria-hidden>
                    {meta.glyph}
                  </span>
                  {e.player}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted">
                  {meta.label}
                  {e.detail ? ` · ${e.detail}` : ""}
                  {e.side !== "neutral" ? ` · ${team.short}` : ""}
                </span>
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Stats({ match }: { match: Match }) {
  const home = homeTeam(match);
  const away = awayTeam(match);

  return (
    <div className="card overflow-hidden">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-line bg-navy-850/[0.04] px-4 py-2.5 text-[12px] font-extrabold dark:bg-white/[0.04]">
        <span className="flex items-center gap-2">
          <Crest slug={match.home} size={22} /> {home.name}
        </span>
        <span className="text-muted">المقارنة</span>
        <span className="flex items-center justify-end gap-2">
          {away.name} <Crest slug={match.away} size={22} />
        </span>
      </header>

      <ul className="divide-y divide-line">
        {match.stats.map((s) => {
          const hNum = typeof s.home === "number" ? s.home : parseFloat(s.home);
          const aNum = typeof s.away === "number" ? s.away : parseFloat(s.away);
          const total = Math.max(hNum + aNum, 1);
          const hPct = Math.round((hNum / total) * 100);
          return (
            <li key={s.key} className="px-4 py-3">
              <div className="mb-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-[12px]">
                <span className="num font-extrabold">{s.home}</span>
                <span className="text-[11px] font-semibold text-muted">{s.label}</span>
                <span className="num text-end font-extrabold">{s.away}</span>
              </div>
              <div className="flex h-1.5 overflow-hidden rounded-full bg-navy-850/10 dark:bg-white/10" dir="ltr">
                <span className="bg-navy-850 transition-all dark:bg-gold-500" style={{ width: `${hPct}%` }} />
                <span className="bg-gold-500 transition-all dark:bg-navy-600" style={{ width: `${100 - hPct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Lineups({ match }: { match: Match }) {
  const home = homeTeam(match);
  const away = awayTeam(match);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {match.lineups.map((l) => {
        const team = l.side === "home" ? home : away;
        const slug = l.side === "home" ? match.home : match.away;
        return (
          <section key={l.side} className="card overflow-hidden">
            <header className="flex items-center justify-between gap-2 border-b border-line bg-navy-850 px-3 py-2.5 text-white">
              <span className="flex items-center gap-2 text-[12px] font-extrabold">
                <Crest slug={slug} size={22} /> {team.name}
              </span>
              <span className="num text-[11px] text-gold-400">{l.formation ?? "5 أساسي"}</span>
            </header>
            <div className="divide-y divide-line">
              {l.groups.map((g) => (
                <div key={g.title} className="px-3 py-2.5">
                  <p className="eyebrow mb-2">{g.title}</p>
                  <ul className="space-y-1.5">
                    {g.players.map((pl) => (
                      <li key={pl.name} className="flex items-center gap-2.5 text-[12px]">
                        <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-[3px] bg-navy-850/5 text-[10px] font-extrabold dark:bg-white/10">
                          {pl.n ?? "—"}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-semibold">{pl.name}</span>
                        <span className="shrink-0 text-[10px] text-muted">{pl.pos}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="px-3 py-2 text-[11px] text-muted">المدرب: {l.coach}</p>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function News({
  tab,
}: {
  tab: { slug: string; title: string; excerpt: string; author: string; publishedAgoMin: number }[];
}) {
  if (tab.length === 0) {
    return <p className="card px-4 py-10 text-center text-[13px] text-muted">لا توجد أخبار مرتبطة بهذه المباراة بعد.</p>;
  }
  return (
    <ul className="space-y-3">
      {tab.map((a) => (
        <li key={a.slug} className="card p-4 transition hover:border-gold-500/50">
          <Link href={`/news/${a.slug}`} className="block text-[14px] font-bold transition hover:text-gold-600 dark:hover:text-gold-400">
            {a.title}
          </Link>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{a.excerpt}</p>
          <p className="num mt-2 text-[11px] text-muted">
            {a.author} · منذ {Math.max(1, Math.round(a.publishedAgoMin / 60))} ساعة
          </p>
        </li>
      ))}
    </ul>
  );
}

function TeamPanel({ slug }: { slug: string }) {
  const team = teamBySlug(slug);
  if (!team) return null;
  return (
    <Link href={`/teams/${slug}`} className="card block p-4 transition hover:border-gold-500/50 focus-ring">
      <span className="flex items-center gap-3">
        <Crest slug={slug} size={40} />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-extrabold">{team.name}</span>
          <span className="block text-[11px] text-muted">
            {team.country} · تأسس <span className="num">{team.founded}</span>
          </span>
        </span>
      </span>
      <span className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <span className="rounded-[3px] bg-navy-850/[0.04] px-2.5 py-1.5 dark:bg-white/[0.05]">
          <span className="block text-muted">الملعب</span>
          <span className="block truncate font-bold">{team.stadium ?? "—"}</span>
        </span>
        <span className="rounded-[3px] bg-navy-850/[0.04] px-2.5 py-1.5 dark:bg-white/[0.05]">
          <span className="block text-muted">المدرب</span>
          <span className="block truncate font-bold">{team.coach ?? "—"}</span>
        </span>
      </span>
    </Link>
  );
}
