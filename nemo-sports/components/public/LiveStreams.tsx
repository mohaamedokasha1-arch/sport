import MatchStreamPlayer from "@/components/match/MatchStreamPlayer";
import type { PublicStreamCard } from "@/lib/public-streams";
import { dateAr, timeOf } from "@/lib/format";
import { MATCH_STATE_LABEL_AR, matchStateOf } from "@/lib/match-state";

/**
 * Server section for /live: every PLAYABLE broadcast (approved, with rights
 * evidence, match in play or inside its window) with its match details and the
 * official player. Ended, expired, unapproved and draft streams never reach
 * this list — /live is about what can be watched now.
 */
export default function LiveStreams({ cards }: { cards: PublicStreamCard[] }) {
  // No playable stream → render nothing (never an empty player or a fake link).
  if (cards.length === 0) return null;
  return (
    <section aria-label="البث المباشر المتاح" className="mb-10 space-y-6">
      {cards.map((card) => (
        <article key={card.stream.id} className="card overflow-hidden p-4">
          <header className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[12px]">
            <span className="font-extrabold">
              {card.home} <span className="text-muted">×</span> {card.away}
            </span>
            <span className="flex flex-wrap items-center gap-2 text-muted">
              {card.competition ? <span>{card.competition}</span> : null}
              {card.kickoff && Number.isFinite(+new Date(card.kickoff)) ? (
                <span className="num">{dateAr(card.kickoff)} · {timeOf(card.kickoff)}</span>
              ) : null}
              <span className="rounded-[3px] bg-navy-850 px-1.5 py-0.5 text-[10px] font-bold text-gold-400">
                {MATCH_STATE_LABEL_AR[matchStateOf(card.status, card.kickoff)]}
              </span>
            </span>
          </header>
          <MatchStreamPlayer
            stream={{ embedUrl: card.stream.embedUrl, label: card.stream.label }}
            phase={card.phase}
            home={card.home}
            away={card.away}
            inactiveNote={card.verdict.noticeAr}
            sectionId={`live-stream-${card.stream.id}`}
            headingLevel="h3"
          />
          <p className="mt-2 text-[10.5px] text-muted">
            صاحب الحقوق المسجّل: <span className="font-bold">{card.stream.rightsHolder}</span> · الموافقة والتوثيق من سجل الإدارة، وليست ضمانًا لتوفر البث في بلدك.
          </p>
        </article>
      ))}
    </section>
  );
}
