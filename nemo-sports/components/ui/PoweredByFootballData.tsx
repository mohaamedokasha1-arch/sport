/**
 * Attribution required by the Football-Data.org terms of use: a visible,
 * dofollow link to their site wherever their data is rendered.
 *
 * It is a plain anchor — no data access, no key, no server import — so it can
 * be rendered on the server or in a client component without pulling any part
 * of the integration into the browser bundle. Styled to the NEMO identity
 * (navy pill, gold hover) while keeping the exact "Powered by Football-Data.org"
 * anchor text and the followable link.
 */
export default function PoweredByFootballData({ className = "" }: { className?: string }) {
  return (
    <a
      href="https://www.football-data.org/"
      rel="dofollow"
      title="Football data by Football-Data.org"
      target="_blank"
      className={`inline-flex items-center gap-1.5 rounded-[3px] border border-navy-800 bg-navy-900 px-2.5 py-1 text-[10.5px] font-bold text-white/85 transition hover:border-gold-500/60 hover:text-gold-400 dark:border-navy-800 dark:bg-navy-900 ${className}`}
    >
      <span aria-hidden>⚽</span>
      Powered by Football-Data.org
    </a>
  );
}
