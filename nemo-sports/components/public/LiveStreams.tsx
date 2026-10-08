import MatchStreamPlayer from "@/components/match/MatchStreamPlayer";
import { publicStreamCards } from "@/lib/public-streams";
import { inactiveStreamNote } from "@/lib/match-streams";
import { dateAr, timeOf } from "@/lib/format";
import { STATUS_LABEL_AR } from "@/lib/match-status-labels";

/**
 * Server section for /live: every PUBLISHED stream with its match details and
 * an official player. Drafts, ended and disabled streams never reach this list
 * (see listMatchStreams(false)).
 */
export default async function LiveStreams() {
  const cards = await publicStreamCards();
  // No published stream → render nothing (never an empty player or a fake link).
  if (cards.length === 0) return null;
  return (
    <section aria-label="البث المباشر المنشور" className="mb-10 space-y-6">
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
                {STATUS_LABEL_AR[card.status] ?? card.status}
              </span>
            </span>
          </header>
          <MatchStreamPlayer
            stream={{ embedUrl: card.stream.embedUrl, label: card.stream.label }}
            phase={card.phase}
            home={card.home}
            away={card.away}
            inactiveNote={inactiveStreamNote(card.status)}
            sectionId={`live-stream-${card.stream.id}`}
            headingLevel="h3"
          />
        </article>
      ))}
    </section>
  );
}
