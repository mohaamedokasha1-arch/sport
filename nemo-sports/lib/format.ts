import type { Match, MatchEvent } from "./data";
import { teamBySlug, competitionBySlug, sportBySlug, type Team } from "./core-data";
import { siteParts, siteDay } from "./tz";

/* Every formatter below is anchored to the site timezone (Africa/Cairo,
   lib/tz.ts) so SSR and client render identical strings regardless of the
   server's or viewer's own timezone. Signatures and output formats are
   unchanged — only the time anchor is centralized. */

export const STATUS_AR: Record<string, string> = {
  LIVE: "مباشر",
  HT: "الاستراحة",
  UPCOMING: "لم تبدأ",
  FINISHED: "انتهت",
  POSTPONED: "مؤجلة",
  CANCELLED: "ملغاة",
  SUSPENDED: "متوقفة",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** 14:05 */
export function timeOf(iso: string): string {
  const p = siteParts(iso);
  return `${pad(p.hours)}:${pad(p.minutes)}`;
}

/** السبت ٢٠ سبتمبر */
export function dateAr(iso: string): string {
  const p = siteParts(iso);
  const day = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"][p.weekday];
  const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  return `${day} ${p.date} ${months[p.month - 1]}`;
}

export function shortDate(iso: string): string {
  const p = siteParts(iso);
  return `${pad(p.date)}/${pad(p.month)}`;
}

export function isSameDay(iso: string, ref: string | number | Date = new Date()): boolean {
  return siteDay(iso) === siteDay(ref);
}

/** "منذ 12 دقيقة" / "بعد 3 ساعات" */
export function relative(iso: string, now = Date.now()): string {
  const diff = Math.round((+new Date(iso) - now) / 60000);
  const abs = Math.abs(diff);
  const unit = (v: number) => {
    if (v < 1) return "الآن";
    if (v < 60) return `${v} دقيقة`;
    if (v < 60 * 24) return `${Math.floor(v / 60)} ساعة`;
    if (v < 60 * 24 * 7) return `${Math.floor(v / 1440)} يوم`;
    return `${Math.floor(v / 10080)} أسبوع`;
  };
  if (abs < 1) return "الآن";
  return diff < 0 ? `منذ ${unit(abs)}` : `بعد ${unit(abs)}`;
}

/** "خلال يومين" / "اليوم" / "غدًا" */
export function dayLabel(iso: string, now: string | number | Date = Date.now()): string {
  const days = Math.round((siteDay(iso) - siteDay(now)) / 86400000);
  if (days === 0) return "اليوم";
  if (days === 1) return "غدًا";
  if (days === -1) return "أمس";
  if (days > 1 && days < 11) return `خلال ${days} أيام`;
  return dateAr(iso);
}

export function daysUntil(iso: string, now: string | number | Date = Date.now()): number {
  return Math.round((siteDay(iso) - siteDay(now)) / 86400000);
}

export function age(birth: string): number {
  const b = siteParts(birth);
  const n = siteParts(new Date());
  let a = n.year - b.year;
  if (n.month < b.month || (n.month === b.month && n.date < b.date)) a--;
  return a;
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

/** 1,284,902 with Latin digits so tabular numerals stay aligned */
export function number(n: number): string {
  return n.toLocaleString("en-US");
}

/* ── entity helpers ───────────────────────────────────────── */

export const homeTeam = (m: Match): Team => teamBySlug(m.home)!;
export const awayTeam = (m: Match): Team => teamBySlug(m.away)!;
export const compOf = (m: Match) => competitionBySlug(m.competition)!;
export const sportOf = (m: Match) => sportBySlug(m.sport)!;

export function matchUrl(m: Match): string {
  return `/matches/${m.slug}`;
}

/** Deterministic 2-letter monogram used as the team crest. */
export function crest(text: string, size = 40, primary = "#0F1B2E", secondary = "#D4AF37") {
  const letters = text.replace(/[^\u0600-\u06FFA-Za-z]/g, "").slice(0, 2);
  return { letters, size, primary, secondary };
}

export const EVENT_LABEL: Record<MatchEvent["type"], { label: string; glyph: string; tone: string }> = {
  goal: { label: "هدف", glyph: "⚽", tone: "text-win" },
  "own-goal": { label: "هدف عكسي", glyph: "⚽", tone: "text-muted" },
  penalty: { label: "ركلة جزاء", glyph: "🅿", tone: "text-win" },
  "missed-penalty": { label: "ركلة جزاء مهدرة", glyph: "✕", tone: "text-live" },
  yellow: { label: "بطاقة صفراء", glyph: "▮", tone: "text-warn" },
  red: { label: "بطاقة حمراء", glyph: "▮", tone: "text-live" },
  "second-yellow": { label: "بطاقة حمراء (إنذار ثانٍ)", glyph: "▮", tone: "text-live" },
  "sub-in": { label: "تبديل (دخول)", glyph: "▲", tone: "text-win" },
  "sub-out": { label: "تبديل (خروج)", glyph: "▼", tone: "text-live" },
  injury: { label: "إصابة", glyph: "✚", tone: "text-warn" },
  var: { label: "تقنية الفيديو", glyph: "▭", tone: "text-muted" },
  period: { label: "نهاية الفترة", glyph: "⏱", tone: "text-muted" },
};
