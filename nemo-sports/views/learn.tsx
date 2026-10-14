import type { Metadata } from "next";
import Link from "@/components/i18n/Link";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";

export type ViewProps = Record<string, never>;

export function generateMetadata(locale: Locale, _props: ViewProps = {} as ViewProps): Metadata {
  return { title: t(locale, "ln.metaTitle"), description: t(locale, "ln.metaDescription"), alternates: { canonical: "/learn" }, robots: { index: true, follow: true } };
}

/** The lesson bodies are dictionary entries; the numbers identify them. */
const LESSONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export default function LearnPage({ locale }: { locale: Locale }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      <p className="eyebrow">NEMO Sports · {tr("ln.eyebrow")}</p>
      <h1 className="mt-2 text-3xl font-extrabold">{tr("ln.heading")}</h1>
      <p className="mt-3 text-muted">{tr("ln.lead")}</p>
      <div className="mt-6 space-y-5">
        {LESSONS.map((n) => (
          <section className="card p-5" key={n}>
            <h2 className="text-lg font-bold">{tr(`ln.q${n}` as Parameters<typeof t>[1])}</h2>
            <p className="mt-2 text-sm leading-7 text-muted">{tr(`ln.a${n}` as Parameters<typeof t>[1])}</p>
          </section>
        ))}
      </div>
      <p className="mt-6 text-sm">
        {tr("ln.applyNote")} <Link href="/scout" className="underline">NEMO Scout</Link>{" "}
        {tr("ln.applyNoteTail")} <Link href="/matches" className="underline">{tr("ln.availableMatches")}</Link>
        {tr("ln.regulationsNote")}
      </p>
    </article>
  );
}
