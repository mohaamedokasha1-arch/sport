import type { Metadata } from "next";
import { NemoMark } from "@/components/brand/Logo";
import styles from "./today.module.css";

export const metadata: Metadata = {
  title: "مباريات اليوم — لوحات النتائج المباشرة",
  description:
    "تابع مباريات اليوم والنتائج من ScoreAxis وLivescore.in عبر لوحتي نتائج مدمجتين ومتوافقتين مع الهاتف.",
  alternates: { canonical: "/today" },
};

const providers = [
  {
    id: "scoreaxis",
    name: "ScoreAxis",
    label: "لوحة النتائج العالمية",
    initials: "SA",
    href: "https://scoreaxis.com",
    frameTitle: "لوحة نتائج المباريات من ScoreAxis",
    height: "500px",
    frameClass: styles.scoreaxisFrame,
  },
  {
    id: "livescore",
    name: "لايف سكور",
    label: "النتائج باللغة العربية",
    initials: "LS",
    href: "https://livescore.in",
    frameTitle: "لوحة نتائج المباريات باللغة العربية من Livescore.in",
    height: "600",
    frameClass: styles.livescoreFrame,
  },
] as const;

export default function TodayPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="today-heading">
        <NemoMark size={172} tone="light" className={styles.heroMark} />
        <div className={styles.heroContent}>
          <p className={styles.kicker}>
            <span className={styles.liveDot} aria-hidden="true" />
            مركز النتائج · NEMO SPORTS
          </p>
          <h1 id="today-heading" className={styles.heroTitle}>
            مباريات اليوم،<br />
            <span>في مكان واحد.</span>
          </h1>
          <p className={styles.heroDescription}>
            استكشف لوحتي النتائج من ScoreAxis وLivescore.in، واختر طريقة العرض التي تناسبك.
            المحتوى يُعرض مباشرةً من المصدر.
          </p>
          <a className={styles.heroButton} href="#score-boards">
            استعرض لوحات النتائج
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M4 10h11M10 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
        <div className={styles.heroStamp} aria-hidden="true">
          <span>LIVE</span>
          <strong>02</strong>
          <span>مصادر للنتائج</span>
        </div>
      </section>

      <section id="score-boards" className={styles.boards} aria-labelledby="boards-heading">
        <header className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionEyebrow}>نتائج مباشرة · LIVE SCORES</p>
            <h2 id="boards-heading" className={styles.sectionTitle}>اختر لوحة النتائج</h2>
          </div>
          <p className={styles.sectionDescription}>
            مصدر عالمي وآخر باللغة العربية — يعرض كل إطار محتواه من موقعه الأصلي.
          </p>
        </header>

        <div className={styles.widgetGrid}>
          {providers.map((provider) => (
            <article key={provider.id} id={provider.id} className={styles.widgetCard}>
              <header className={styles.widgetHeader}>
                <span className={styles.providerMark} aria-hidden="true">{provider.initials}</span>
                <div className={styles.providerInfo}>
                  <p className={styles.providerLabel}>{provider.label}</p>
                  <h3 className={styles.providerName}>{provider.name}</h3>
                </div>
                <a
                  className={styles.sourceLink}
                  href={provider.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`فتح ${provider.name} في نافذة جديدة`}
                >
                  <span>زيارة المصدر</span>
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M9 2h5v5M14 2 7 9M12 9v4H3V4h4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
              </header>

              <div className={styles.frameWrap}>
                <iframe
                  src={provider.href}
                  title={provider.frameTitle}
                  width="100%"
                  height={provider.height}
                  style={{ border: "none" }}
                  frameBorder="0"
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  className={`${styles.frame} ${provider.frameClass}`}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className={styles.disclosure} aria-label="ملاحظة حول المصادر الخارجية">
        <span className={styles.infoIcon} aria-hidden="true">i</span>
        <p>
          تُحمّل النتائج مباشرةً من مواقع خارجية، لذلك قد يختلف المحتوى أو يتعذر عرضه بحسب
          إعدادات المصدر أو المتصفح. إذا لم تظهر إحدى اللوحتين، استخدم رابط «زيارة المصدر».
        </p>
      </aside>
    </div>
  );
}
