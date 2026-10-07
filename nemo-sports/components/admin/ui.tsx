import type { ReactNode } from "react";

export function AdminHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-navy-800 pb-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-[12px] text-white/50">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function Btn({
  children,
  tone = "gold",
  type = "button",
}: {
  children: ReactNode;
  tone?: "gold" | "ghost" | "danger";
  type?: "button" | "submit";
}) {
  const styles =
    tone === "gold"
      ? "bg-gold-500 text-navy-900 hover:bg-gold-400"
      : tone === "danger"
        ? "border border-live/50 text-live hover:bg-live hover:text-white"
        : "border border-navy-700 text-white/75 hover:border-gold-500 hover:text-gold-400";
  return (
    <button
      type={type}
      className={`rounded-[3px] px-3.5 py-2 text-[12px] font-extrabold transition ${styles}`}
    >
      {children}
    </button>
  );
}

export function Panel({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[6px] border border-navy-800 bg-navy-900">
      <header className="flex items-center justify-between gap-3 border-b border-navy-800 bg-navy-950/60 px-4 py-2.5">
        <h2 className="text-[13px] font-extrabold">{title}</h2>
        {aside}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: string;
  delta?: string;
  hint?: string;
}) {
  const up = delta?.startsWith("+");
  return (
    <div className="rounded-[6px] border border-navy-800 bg-navy-900 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">{label}</p>
      <p className="num mt-2 text-2xl font-extrabold">{value}</p>
      <p className={`mt-1 text-[11px] ${up ? "text-win" : delta ? "text-live" : "text-white/40"}`}>
        {delta ?? hint ?? ""}
      </p>
    </div>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[12px]">
        <thead>
          <tr className="border-b border-navy-800 text-white/45">
            {head.map((h) => (
              <th key={h} className="px-3 py-2.5 text-start font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-navy-800/60 last:border-0 hover:bg-white/[0.03]">
              {r.map((cell, j) => (
                <td key={j} className="px-3 py-2.5 align-middle">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pill({ tone, children }: { tone: "ok" | "warn" | "bad" | "idle"; children: ReactNode }) {
  const map = {
    ok: "bg-win/15 text-win",
    warn: "bg-warn/15 text-warn",
    bad: "bg-live/15 text-live",
    idle: "bg-white/10 text-white/60",
  } as const;
  return <span className={`rounded-[3px] px-2 py-0.5 text-[10px] font-extrabold ${map[tone]}`}>{children}</span>;
}

/**
 * Honest placeholder for a panel whose backing integration does not exist yet.
 *
 * The admin UI used to fill these slots with invented numbers (a hardcoded
 * 184,320 daily visits, a fabricated 12-bar traffic chart, a made-up user
 * roster). That contradicted the rule the public pages already follow — show
 * an honest empty state rather than fabricated data — and it did so on a
 * publicly reachable URL. Anything not yet wired renders this instead.
 */
export function NotConnected({
  title,
  message,
  requires,
}: {
  title: string;
  message: string;
  requires?: string;
}) {
  return (
    <div className="rounded-[3px] border border-dashed border-navy-700 px-4 py-6 text-center">
      <p className="text-[12.5px] font-extrabold text-white/70">{title}</p>
      <p className="mx-auto mt-1.5 max-w-md text-[11.5px] leading-relaxed text-white/45">{message}</p>
      {requires ? (
        <p className="num mt-3 inline-block rounded-[3px] border border-navy-700 px-2.5 py-1 text-[10.5px] text-white/40">
          يتطلب: {requires}
        </p>
      ) : null}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold text-white/60">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-[3px] border border-navy-700 bg-navy-950 px-3 py-2 text-[12px] text-white outline-none transition focus:border-gold-500";
