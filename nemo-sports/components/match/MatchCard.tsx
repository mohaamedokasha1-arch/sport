"use client";

import Link from "next/link";
import Crest from "@/components/ui/Crest";
import StatusBadge from "@/components/ui/StatusBadge";
import { useLive } from "@/components/live/LiveProvider";
import { awayTeam, compact, compOf, homeTeam, number, timeOf } from "@/lib/format";
import { teamBySlug } from "@/lib/core-data";
import type { Match } from "@/lib/data";

const url = (m: Match) => `/matches/${m.slug}`;

export default function MatchCard({
  match,
  variant = "card",
}: {
  match: Match;
  variant?: "card" | "row" | "feature";
}) {
  if (variant === "row") return <RowCard match={match} />;
  if (variant === "feature") return <FeatureCard match={match} />;
  return <GridCard match={match} />;
}

/* ── grid card ─────────────────────────────────────────────── */

function GridCard({ match: m }: { match: Match }) {
  const { live, justScored } = useLive();
  const s = live[m.id];
  const status = s?.status ?? m.status;
  const clock = s?.clock ?? m.clock;
  const isLive = status === "LIVE" || status === "HT";
  const isDone = status === "FINISHED";
  const hs = s?.homeScore ?? m.homeScore;
  const as = s?.awayScore ?? m.awayScore;
  const home = homeTeam(m);
  const away = awayTeam(m);
  const comp = compOf(m);
  const scored = justScored.includes(m.id);

  return (
    <article
      className={`group card relative flex flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:border-gold-500/50 hover:shadow-[0_10px_30px_-12px_rgba(15,27,46,0.35)] ${
        scored ? "flash ring-1 ring-gold-500/60" : ""
      }`}
    >
      <span className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-l from-gold-500/0 via-gold-500/70 to-gold-500/0 opacity-0 transition-opacity group-hover:opacity-100" />

      <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="truncate text-[11px] font-semibold text-muted">
          {comp.name}
        </span>
        <StatusBadge status={status} clock={isLive ? clock : undefined} size="sm" />
      </header>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-4">
        <TeamCell slug={m.home} align="start" />
        <div className="flex min-w-[74px] flex-col items-center">
          {isDone || isLive ? (
            <span
              className={`num text-2xl font-extrabold leading-none ${
                isLive ? "text-ink" : "text-ink"
              }`}
              dir="ltr"
            >
              {hs} – {as}
            </span>
          ) : (
            <span className="num text-xl font-bold leading-none text-ink" dir="ltr">
              {timeOf(m.kickoff)}
            </span>
          )}
          <span className="mt-1 text-[10px] font-semibold text-muted">
            {isDone ? "النتيجة النهائية" : isLive ? "النتيجة الآن" : "التوقيت المحلي"}
          </span>
        </div>
        <TeamCell slug={m.away} align="end" />
      </div>

      <footer className="mt-auto flex items-center justify-between gap-2 border-t border-line px-3 py-2">
        <div className="flex items-center gap-2 text-[11px] text-muted">
          {isLive ? (
            <span className="font-semibold text-live">{number(m.viewers ?? 0)} مشاهد</span>
          ) : (
            <span className="num">{m.round}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {m.broadcast ? (
            <Link
              href={`${url(m)}#broadcast`}
              className="rounded-[3px] bg-live/10 px-2 py-1 text-[11px] font-bold text-live transition hover:bg-live hover:text-white focus-ring"
            >
              بث
            </Link>
          ) : null}
          <Link
            href={url(m)}
            className="rounded-[3px] bg-navy-850 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-navy-700 focus-ring"
          >
            التفاصيل
          </Link>
        </div>
      </footer>
    </article>
  );
}

/* ── list row ──────────────────────────────────────────────── */

function RowCard({ match: m }: { match: Match }) {
  const { live } = useLive();
  const s = live[m.id];
  const status = s?.status ?? m.status;
  const clock = s?.clock ?? m.clock;
  const isLive = status === "LIVE" || status === "HT";
  const isDone = status === "FINISHED";
  const hs = s?.homeScore ?? m.homeScore;
  const as = s?.awayScore ?? m.awayScore;
  const home = homeTeam(m);
  const away = awayTeam(m);
  const comp = compOf(m);

  return (
    <Link
      href={url(m)}
      className="group grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line px-3 py-3 transition hover:bg-navy-850/[0.03] dark:hover:bg-white/[0.04] focus-ring sm:grid-cols-[1fr_120px_1fr_auto]"
    >
      <span className="flex items-center gap-2.5 overflow-hidden">
        <Crest slug={m.home} size={28} />
        <span className="truncate text-sm font-bold">{home.name}</span>
      </span>

      <span className="order-last flex items-center justify-center gap-2 sm:order-none">
        {isDone || isLive ? (
          <span className="num text-lg font-extrabold" dir="ltr">
            {hs} – {as}
          </span>
        ) : (
          <span className="num text-base font-bold text-muted" dir="ltr">
            {timeOf(m.kickoff)}
          </span>
        )}
      </span>

      <span className="flex items-center justify-end gap-2.5 overflow-hidden">
        <span className="truncate text-sm font-bold">{away.name}</span>
        <Crest slug={m.away} size={28} />
      </span>

      <span className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
        <span className="truncate text-[11px] text-muted">{comp.name}</span>
        <StatusBadge status={status} clock={isLive ? clock : undefined} size="sm" />
      </span>
    </Link>
  );
}

/* ── feature / hero card ───────────────────────────────────── */

function FeatureCard({ match: m }: { match: Match }) {
  const { live } = useLive();
  const s = live[m.id];
  const status = s?.status ?? m.status;
  const clock = s?.clock ?? m.clock;
  const isLive = status === "LIVE" || status === "HT";
  const isDone = status === "FINISHED";
  const hs = s?.homeScore ?? m.homeScore;
  const as = s?.awayScore ?? m.awayScore;
  const home = homeTeam(m);
  const away = awayTeam(m);
  const comp = compOf(m);

  return (
    <article className="stripes relative overflow-hidden rounded-[8px] border border-navy-700/60 bg-navy-850 text-white">
      <span className="absolute -end-16 -top-16 h-52 w-52 rounded-full bg-gold-500/10 blur-2xl" aria-hidden />
      <header className="relative flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
        <span className="flex items-center gap-2 text-[11px] font-semibold text-white/70">
          <span className="rounded-[3px] bg-gold-500 px-1.5 py-0.5 font-display text-[10px] font-bold tracking-widest text-navy-900">
            {comp.code}
          </span>
          {comp.name}
        </span>
        {isLive ? (
          <span className="flex items-center gap-1.5 rounded-[3px] bg-live px-2 py-1 text-[10px] font-extrabold tracking-wide">
            <span className="live-dot !bg-white" aria-hidden /> LIVE {clock}
          </span>
        ) : (
          <span className="num text-[11px] font-bold text-gold-400">{timeOf(m.kickoff)}</span>
        )}
      </header>

      <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Crest slug={m.home} size={56} />
          <span className="text-sm font-bold leading-tight">{home.name}</span>
        </div>

        <div className="flex flex-col items-center px-2">
          {isDone || isLive ? (
            <span className="num text-4xl font-extrabold leading-none" dir="ltr">
              {hs}<span className="mx-1.5 text-gold-500">–</span>{as}
            </span>
          ) : (
            <span className="font-display text-3xl font-bold tracking-wide text-gold-400">VS</span>
          )}
          <span className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-white/50">
            {isLive ? "مباشر الآن" : isDone ? "انتهت" : m.round}
          </span>
        </div>

        <div className="flex flex-col items-center gap-2 text-center">
          <Crest slug={m.away} size={56} />
          <span className="text-sm font-bold leading-tight">{away.name}</span>
        </div>
      </div>

      <footer className="relative flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
        <span className="text-[11px] text-white/60">
          {m.venue ? `${m.venue} · ` : ""}
          {isLive ? `${compact(m.viewers ?? 0)} مشاهد` : timeOf(m.kickoff)}
        </span>
        <span className="flex items-center gap-2">
          {m.broadcast ? (
            <Link
              href={`${url(m)}#broadcast`}
              className="rounded-[3px] bg-live px-3 py-1.5 text-[11px] font-bold transition hover:bg-live/85 focus-ring"
            >
              مشاهدة البث
            </Link>
          ) : null}
          <Link
            href={url(m)}
            className="rounded-[3px] bg-white/10 px-3 py-1.5 text-[11px] font-bold transition hover:bg-gold-500 hover:text-navy-900 focus-ring"
          >
            تفاصيل المباراة
          </Link>
        </span>
      </footer>
    </article>
  );
}

/* ── shared bits ───────────────────────────────────────────── */

function TeamCell({ slug, align }: { slug: string; align: "start" | "end" }) {
  const team = teamBySlug(slug);
  return (
    <span
      className={`flex items-center gap-2.5 overflow-hidden ${
        align === "end" ? "flex-row-reverse text-end" : ""
      }`}
    >
      <Crest slug={slug} size={34} />
      <span className="truncate text-[13px] font-bold leading-tight">{team?.name}</span>
    </span>
  );
}
