"use client";

/**
 * NEMO Sports · MatchStreamPlayer
 * ───────────────────────────────────────────────────────────────
 * The "البث المباشر" section of a match page. Renders the registered
 * per-match iframe source (resolved server-side by lib/match-streams.ts)
 * inside a fully responsive 16:9 shell that works on phones and desktops.
 *
 * Behaviour contract:
 *   · no source           → renders NOTHING (page keeps its current look).
 *   · phase "inactive"    → a static notice instead of an active live player
 *                           (worded by lib/broadcast-state.ts from what the
 *                           fixture data actually says — never "finished"
 *                           for a match whose state is unconfirmed).
 *   · phase "live"/"up…") → the player, with a LIVE badge while live.
 *   · source fails to load → a proper error panel (retry + open-in-new-tab)
 *                           instead of an empty box.
 *
 * The iframe keeps `allowfullscreen` (plus autoplay/pip permissions); sandboxing
 * blocks top navigation and unsolicited popups while allowing player scripts.
 */

import { useEffect, useState } from "react";
import { useWatchSmartlink } from "@/components/ads/useSmartlink";
import { useT } from "@/lib/i18n/context";

export type MatchStreamInfo = {
  embedUrl: string;
  label?: string;
};

export type MatchStreamPhase = "live" | "upcoming" | "inactive";

type LoadState = "loading" | "ready" | "error";

/** How long we wait for the iframe before showing the fallback panel. */
const LOAD_TIMEOUT_MS = 15_000;

export default function MatchStreamPlayer({
  stream,
  phase,
  home,
  away,
  inactiveNote,
  sectionId = "live-stream",
  headingLevel = "h2",
}: {
  stream: MatchStreamInfo | null | undefined;
  phase: MatchStreamPhase;
  home: string;
  away: string;
  inactiveNote?: string;
  /** unique id when several players share one page (e.g. /live) */
  sectionId?: string;
  headingLevel?: "h2" | "h3";
}) {
  const tr = useT();
  // Nothing registered for this match → no section at all.
  if (!stream) return null;
  const Heading = headingLevel;

  return (
    <section id={sectionId} className="mt-8">
      <Heading className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b-2 border-line pb-2 text-[15px] font-extrabold">
        <span>{tr("msp.heading")}</span>
        {phase === "live" ? (
          <span className="flex items-center gap-1.5 rounded-[3px] bg-live px-2 py-1 text-[10px] font-extrabold tracking-widest text-white">
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-white" />
            {tr("card.liveNow")}
          </span>
        ) : null}
      </Heading>

      {phase === "inactive" ? (
        <div className="card border-dashed px-4 py-6 text-center">
          <p aria-hidden className="text-xl">
            📺
          </p>
          <p className="mt-1.5 text-[13px] font-extrabold">{inactiveNote ?? tr("msp.inactiveFallback")}</p>
          <p className="mt-1 text-[11.5px] text-muted">{tr("msp.inactiveNote")}</p>
        </div>
      ) : (
        <PlayerCard stream={stream} phase={phase} home={home} away={away} />
      )}
    </section>
  );
}

function PlayerCard({
  stream,
  phase,
  home,
  away,
}: {
  stream: MatchStreamInfo;
  phase: "live" | "upcoming";
  home: string;
  away: string;
}) {
  const tr = useT();
  const [attempt, setAttempt] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  // Adsterra Smartlink rides on the watch intent (never on the primary action:
  // the handler does not preventDefault, so the stream still opens as before).
  // One monetised click per session by default — components/ads/useSmartlink.ts.
  const watchClick = useWatchSmartlink();

  // Every (re)mount gets a fresh loading window; if onLoad never fires the
  // source is broken/blocked → swap in the error panel instead of leaving a
  // silent empty rectangle.
  useEffect(() => {
    setLoadState("loading");
    const t = window.setTimeout(() => {
      setLoadState((s) => (s === "loading" ? "error" : s));
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [attempt]);

  const retry = () => setAttempt((n) => n + 1);

  return (
    <div className="card p-3 sm:p-4">
      <div className="relative aspect-video w-full overflow-hidden rounded-[4px] border border-navy-700 bg-navy-900">
        {loadState !== "error" ? (
          <iframe
            key={attempt}
            src={stream.embedUrl}
            title={tr("msp.iframeTitle", { home, away })}
            className="absolute inset-0 h-full w-full border-0 bg-navy-900"
            width={640}
            height={360}
            frameBorder={0}
            sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            scrolling="no"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => setLoadState("ready")}
          />
        ) : null}

        {loadState === "loading" ? (
          <div role="status" className="pointer-events-none absolute inset-0 grid place-items-center px-4 text-center">
            <div>
              <span
                aria-hidden
                className="mx-auto mb-2 block h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-gold-500"
              />
              <p className="text-[12px] font-bold text-white/80">{tr("msp.loading")}</p>
            </div>
          </div>
        ) : null}

        {loadState === "error" ? (
          <div className="absolute inset-0 grid place-items-center px-4 text-center">
            <div className="max-w-[26rem]">
              <p aria-hidden className="text-2xl">
                📡
              </p>
              <p className="mt-1 text-[13px] font-extrabold text-white">{tr("msp.loadFailed")}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-white/60">
                {tr("msp.loadFailedBody")}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={retry}
                  className="rounded-[3px] bg-gold-500 px-3.5 py-2 text-[12px] font-extrabold text-navy-900 transition hover:bg-gold-400 focus-ring"
                >
                  {tr("common.retry")}
                </button>
                <a
                  href={stream.embedUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  onClick={watchClick}
                  className="rounded-[3px] border border-white/25 px-3.5 py-2 text-[12px] font-extrabold text-white transition hover:border-gold-400 hover:text-gold-400 focus-ring"
                >
                  {tr("msp.openNew")}
                </a>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span className="truncate">
          {stream.label ? tr("msp.sourceLabel", { label: stream.label }) : tr("msp.sourceDefault")}
          {phase === "upcoming" ? tr("msp.startsWithKickoff") : ""}
        </span>
        <span className="flex shrink-0 items-center gap-3">
          {loadState !== "error" ? (
            <button
              type="button"
              onClick={() => setLoadState("error")}
              className="font-bold text-gold-600 transition hover:underline dark:text-gold-400"
            >
              {tr("msp.playerBroken")}
            </button>
          ) : null}
          <a
            href={stream.embedUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={watchClick}
            className="font-bold text-gold-600 transition hover:underline dark:text-gold-400"
          >
            {tr("msp.openNew")}
          </a>
        </span>
      </div>
    </div>
  );
}
