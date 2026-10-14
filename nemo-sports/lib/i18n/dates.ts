/**
 * NEMO Sports · locale-aware date, time and status formatting
 * ─────────────────────────────────────────────────────────────────────────────
 * Display only. Nothing here touches a stored timestamp: every function reads
 * the original instant and renders it through `lib/tz.ts`, which is anchored to
 * the site timezone (Africa/Cairo). Switching language therefore never moves a
 * kickoff time, changes a score or re-buckets a match into a different day —
 * SSR and client hydration keep producing the identical string they did before.
 *
 * Arabic output is byte-for-byte what `lib/format.ts` already produced; the
 * English branch is the new one.
 */

import { t } from "./translate";
import { LOCALE_INTL, type Locale } from "./locales";
import { siteDay, siteParts } from "@/lib/tz";

const pad = (n: number) => String(n).padStart(2, "0");

/** "14:05" — 24-hour in both languages, tabular so score rows stay aligned. */
export function formatTime(locale: Locale, iso: string): string {
  const p = siteParts(iso);
  return `${pad(p.hours)}:${pad(p.minutes)}`;
}

const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "السبت 20 سبتمبر" / "Sat 20 Sep" — the compact form used in lists and rails. */
export function formatDate(locale: Locale, iso: string): string {
  const p = siteParts(iso);
  if (locale === "ar") {
    return `${t("ar", `date.weekday.${p.weekday}`)} ${p.date} ${MONTHS_AR[p.month - 1]}`;
  }
  return `${t("en", `date.weekdayShort.${p.weekday}`)} ${p.date} ${MONTHS_EN[p.month - 1]!.slice(0, 3)}`;
}

/** "السبت 20 سبتمبر" / "Saturday, 20 September" — headings and article pages. */
export function formatDateLong(locale: Locale, iso: string): string {
  const p = siteParts(iso);
  if (locale === "ar") {
    return `${t("ar", `date.weekday.${p.weekday}`)} ${p.date} ${MONTHS_AR[p.month - 1]}`;
  }
  return `${t("en", `date.weekday.${p.weekday}`)}, ${p.date} ${MONTHS_EN[p.month - 1]}`;
}

/** "20/09" — date filter chips. */
export function formatShortDate(locale: Locale, iso: string): string {
  const p = siteParts(iso);
  return `${pad(p.date)}/${pad(p.month)}`;
}

/** Wall-clock string in the site timezone, spelled for the locale. */
export function formatClock(locale: Locale, iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE_INTL[locale], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Cairo",
  });
}

/** "منذ 12 دقيقة" / "12 minutes ago" — and the future tense. */
export function formatRelative(locale: Locale, iso: string, now = Date.now()): string {
  const diff = Math.round((+new Date(iso) - now) / 60000);
  const abs = Math.abs(diff);
  if (abs < 1) return t(locale, "time.now");
  const unitKey =
    abs < 60 ? "time.minutes" : abs < 60 * 24 ? "time.hours" : abs < 60 * 24 * 7 ? "time.days" : "time.weeks";
  const value = abs < 60 ? abs : abs < 60 * 24 ? Math.floor(abs / 60) : abs < 60 * 24 * 7 ? Math.floor(abs / 1440) : Math.floor(abs / 10080);
  return t(locale, diff < 0 ? "time.ago" : "time.in", {
    value,
    unit: t(locale, `${unitKey}.${value === 1 ? "one" : value === 2 ? "two" : "many"}`, { value }),
  });
}

/** "اليوم" / "غدًا" / "Today" / "Tomorrow" — falls back to a formatted date. */
export function formatDayLabel(locale: Locale, iso: string, now: string | number | Date = Date.now()): string {
  const days = Math.round((siteDay(iso) - siteDay(now)) / 86400000);
  if (days === 0) return t(locale, "date.today");
  if (days === 1) return t(locale, "date.tomorrow");
  if (days === -1) return t(locale, "date.yesterday");
  if (days > 1 && days < 11) return t(locale, "date.inDays", { value: days });
  return formatDate(locale, iso);
}

/** Human label for a provider match status. Machine values are never shown. */
export function formatStatusLabel(locale: Locale, status: string): string {
  const key = `status.${String(status ?? "").toUpperCase()}`;
  return t(locale, key);
}

/** "توقيت القاهرة" / "Cairo time". */
export function timeZoneLabel(locale: Locale): string {
  return t(locale, "time.zone");
}
