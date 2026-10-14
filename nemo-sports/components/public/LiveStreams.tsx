import MatchStreamPlayer from "@/components/match/MatchStreamPlayer";
import type { PublicStreamCard } from "@/lib/public-streams";
import { timeOf } from "@/lib/format";
import { matchStateOf } from "@/lib/match-state";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";
import { formatDate } from "@/lib/i18n/dates";
import { matchStateLabel } from "@/lib/i18n/match-state";
import { broadcastNoticeKey } from "@/lib/i18n/broadcast";

/**
 * Server section for /live: every PLAYABLE broadcast (approved, with rights
 * evidence, match in play or inside its window) with its match details and the
 * official player. Ended, expired, unapproved and draft streams never reach
 * this list — /live is about what can be watched now.
 */
export default function LiveStreams({ cards, locale }: { cards: PublicStreamCard[]; locale: Locale }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  // No playable stream → render nothing (never an empty player or a fake link).
  if (cards.length === 0) return null;
  return (
    <section aria-label={tr("streams.sectionAria")} className="mb-10 space-y-6">
      {cards.map((card) => (
        <article key={card.stream.id} className="card overflow-hidden p-4">
          <header className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12px]">
            <span className="font-extrabold">
              {card.home} <span className="text-muted">×</span> {card.away}
            </span>
            <span className="flex flex-wrap items-center gap-2 text-muted">
              {card.competition ? <span>{card.competition}</span> : null}
              {card.kickoff && Number.isFinite(+new Date(card.kickoff)) ? (
                <span className="num">{formatDate(locale, card.kickoff)} · {timeOf(card.kickoff)}</span>
              ) : null}
              <span className="rounded-[3px] bg-navy-850 px-1.5 py-0.5 text-[10px] font-bold text-gold-400">
                {matchStateLabel(locale, matchStateOf(card.status, card.kickoff))}
              </span>
            </span>
          </header>
          <MatchStreamPlayer
            stream={{ embedUrl: card.stream.embedUrl, label: card.stream.label }}
            phase={card.phase}
            home={card.home}
            away={card.away}
            // noticeAr is the verdict's Arabic wording, produced by
            // lib/broadcast-state.ts. Map it to a message key and render it in
            // the visitor's language, exactly as views/watch.tsx does — passing
            // it straight through put Arabic on the /en/live player.
            inactiveNote={tr(broadcastNoticeKey(card.verdict.noticeAr, card.verdict.matchState))}
            sectionId={`live-stream-${card.stream.id}`}
            headingLevel="h3"
          />
          <p className="mt-2 text-[10.5px] text-muted">
            {tr("streams.rightsHolder")}<span className="font-bold">{card.stream.rightsHolder}</span>{tr("streams.rightsNote")}
          </p>
        </article>
      ))}
    </section>
  );
}
