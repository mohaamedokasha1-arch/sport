/**
 * A home–away score that sits on the right sides of an RTL scoreboard.
 *
 * Every three-column scoreboard on the site places the HOME team in the first
 * column, which an RTL page renders on the RIGHT. Several of them wrapped the
 * score in `dir="ltr"` ("2 : 1"), which put the home score on the LEFT — under
 * the away team — so a 0–1 away win read as a home win on /live cards
 * (production 2026-10-11: Universitario 0–1 Melgar showed the 1 next to
 * Universitario). The match page already rendered it correctly; this keeps
 * every surface identical: the first child (home) follows the document
 * direction, each number is bidi-isolated.
 */
export default function ScorePair({
  home,
  away,
  className = "",
  separator = ":",
  separatorClassName = "text-muted",
}: {
  home: number | string | null | undefined;
  away: number | string | null | undefined;
  className?: string;
  separator?: string;
  separatorClassName?: string;
}) {
  const h = home === null || home === undefined || home === "" ? "—" : String(home);
  const a = away === null || away === undefined || away === "" ? "—" : String(away);
  return (
    <span className={`num inline-flex items-baseline gap-1.5 tabular-nums ${className}`} aria-label={`النتيجة: صاحب الأرض ${h}، الضيف ${a}`}>
      <bdi aria-hidden>{h}</bdi>
      <span aria-hidden className={separatorClassName}>{separator}</span>
      <bdi aria-hidden>{a}</bdi>
    </span>
  );
}
