import Link from "next/link";

/**
 * Attribution badge required by the SportScore free API terms:
 * one visible dofollow "Powered by SportScore" link on every page that
 * renders their data (https://sportscore.com/developers/ — "We get" section).
 * Styled to the NEMO identity (navy pill, gold hover) instead of the default
 * snippet colors — the terms explicitly allow custom styling as long as the
 * dofollow link with "SportScore" in the anchor text stays visible.
 */
export default function PoweredBy({ className = "" }: { className?: string }) {
  return (
    <a
      href="https://sportscore.com/"
      rel="dofollow"
      title="Sports data by SportScore"
      target="_blank"
      className={`inline-flex items-center gap-1.5 rounded-[3px] border border-navy-800 bg-navy-900 px-2.5 py-1 text-[10.5px] font-bold text-white/85 transition hover:border-gold-500/60 hover:text-gold-400 dark:border-navy-800 dark:bg-navy-900 ${className}`}
    >
      <span aria-hidden>⚡</span>
      Powered by SportScore
    </a>
  );
}
