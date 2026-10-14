import type { Metadata } from "next";
import { demoContentVisible } from "@/lib/site";
import type { Locale } from "@/lib/i18n/locales";
import { t } from "@/lib/i18n/translate";

export type ViewProps = Record<string, never>;


export function generateMetadata(locale: Locale, _props: ViewProps = {} as ViewProps): Metadata {
  return {
  title: t(locale, "br.metaTitle"),
  description: t(locale, "br.metaDescription"),
  alternates: { canonical: "/broadcast-rights" },
  // Static, always-listed page in app/sitemap.ts: do not inherit the data-dependent root robots.
  robots: { index: true, follow: true },
};
}

const ALLOWED = ["br.do1", "br.do2", "br.do3", "br.do4"] as const;
const FORBIDDEN = ["br.dont1", "br.dont2", "br.dont3", "br.dont4"] as const;

export default function BroadcastRightsPage({ locale }: { locale: Locale }) {
  const tr = (k: Parameters<typeof t>[1], v?: Parameters<typeof t>[2]) => t(locale, k, v);
  const preview = demoContentVisible();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="eyebrow mb-2">{tr("br.eyebrow")}</p>
      <h1 className="text-3xl font-extrabold tracking-tight">{tr("br.heading")}</h1>

      <div className="mt-6 space-y-4 text-[15px] leading-[1.9]">
        <p>
          {tr("br.intro1")}{" "}
          <strong>{tr("br.introStrong")}</strong>
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-extrabold text-win">
            <span aria-hidden>✅</span> {tr("br.doHeading")}
          </h2>
          <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted">
            {ALLOWED.map((k) => (
              <li key={k}>• {tr(k)}</li>
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="flex items-center gap-2 text-[14px] font-extrabold text-live">
            <span aria-hidden>⛔</span> {tr("br.dontHeading")}
          </h2>
          <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted">
            {FORBIDDEN.map((k) => (
              <li key={k}>• {tr(k)}</li>
            ))}
          </ul>
        </div>
      </div>

      <h2 className="mt-8 text-[17px] font-extrabold">{tr("br.acceptanceHeading")}</h2>
      <ol className="mt-3 space-y-2 text-[14px] leading-relaxed text-muted">
        <li><span className="num font-bold text-ink">1.</span> {tr("br.step1")}</li>
        <li><span className="num font-bold text-ink">2.</span> {tr("br.step2")}</li>
        <li><span className="num font-bold text-ink">3.</span> {tr("br.step3")}</li>
        <li><span className="num font-bold text-ink">4.</span> {tr("br.step4")}</li>
        <li><span className="num font-bold text-ink">5.</span> {tr("br.step5")}</li>
      </ol>

      <div className="mt-8 card p-5">
        <h2 className="text-[15px] font-extrabold">{tr("br.newBroadcasterHeading")}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          {tr("br.newBroadcasterBody")}
        </p>
      </div>

      {preview ? (
        <p className="mt-6 text-[12px] leading-relaxed text-muted">
          {tr("br.demoNotice")}
        </p>
      ) : (
        <p className="mt-6 text-[12px] leading-relaxed text-muted">
          {tr("br.closingNote")}
        </p>
      )}
    </div>
  );
}
