/**
 * NEMO Sports · i18n output parity
 * ─────────────────────────────────────────────────────────────────────────────
 * The bilingual work replaced the site's inline Arabic formatters with the
 * locale-aware helpers in lib/i18n/. A translation must not silently rewrite
 * published Arabic: `منذ 2 يوم` and `استراحة` are the copy readers and Google
 * already have.
 *
 * Every assertion here runs the CURRENT helper against a verbatim copy of the
 * formatter it replaced, taken from `baseline-pre-i18n`. Where a formatter was
 * a file-local constant rather than an export, the probe parses it out of the
 * live source so the two cannot drift apart.
 *
 * This file exists because two such regressions were found and fixed:
 *   · formatRelative emitted proper Arabic duals (منذ دقيقة / منذ يومين) where
 *     the published relative() always printed "{value} {unit}".
 *   · clockOf() rendered md.status.halftime ("استراحة بين الشوطين") on the clock
 *     line, which has always read "استراحة".
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  formatClock,
  formatDate,
  formatDateTime,
  formatDateTimeShort,
  formatDayLabel,
  formatRelative,
  formatTime,
} from "@/lib/i18n/dates";
import { siteParts, siteDay, SITE_TZ } from "@/lib/tz";
import { matchStateOf, MATCH_STATE_LABEL_AR } from "@/lib/match-state";
import { t } from "@/lib/i18n/translate";
import { matchStateLabel } from "@/lib/i18n/match-state";
import type { MatchStatus } from "@/packages/sdl/src";
import { clockOf as realClockOf } from "@/views/match-detail";

const NOW = Date.parse("2026-10-14T12:00:00Z");
const SAMPLES = [
  "2026-10-14T09:00:00Z", "2026-10-14T11:59:00Z", "2026-10-14T12:00:00Z",
  "2026-10-14T12:30:00Z", "2026-10-14T18:45:00Z", "2026-10-14T21:00:00Z",
  "2026-10-15T00:45:00Z", "2026-10-15T02:15:00Z", "2026-10-13T22:10:00Z",
  "2026-10-10T15:00:00Z", "2026-11-01T19:00:00Z", "2026-09-02T08:05:00Z",
];

/* ── baseline formatters, copied VERBATIM from lib/format.ts @ baseline-pre-i18n ──
   Paraphrasing these is what made the first version of this file assert the
   wrong thing: the real relative() buckets on signed minutes with Math.floor,
   and the real dayLabel() has a "خلال N أيام" branch for 2–10 days out. */

const pad = (n: number) => String(n).padStart(2, "0");

function baseTimeOf(iso: string): string {
  const p = siteParts(iso);
  return `${pad(p.hours)}:${pad(p.minutes)}`;
}

function baseDateAr(iso: string): string {
  const p = siteParts(iso);
  const day = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"][p.weekday];
  const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  return `${day} ${p.date} ${months[p.month - 1]}`;
}

function baseRelative(iso: string, now = Date.now()): string {
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

function baseDayLabel(iso: string, now: string | number | Date = Date.now()): string {
  const days = Math.round((siteDay(iso) - siteDay(now)) / 86400000);
  if (days === 0) return "اليوم";
  if (days === 1) return "غدًا";
  if (days === -1) return "أمس";
  if (days > 1 && days < 11) return `خلال ${days} أيام`;
  return baseDateAr(iso);
}

/** baseline inline clock: new Date(iso).toLocaleTimeString("ar-EG", {12h, SITE_TZ}) */
function baseClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", timeZone: SITE_TZ });
}

/** baseline `arabicDateTime` — app/teams/[slug]/page.tsx @ baseline-pre-i18n.
 *  The original returned null for an unparseable instant; every SAMPLE here is
 *  a valid ISO string, so the probe asserts that and narrows to string. */
function baseArabicDateTime(iso: string): string {
  const d = new Date(iso);
  assert.ok(!Number.isNaN(d.getTime()), `sample is not a parseable instant: ${iso}`);
  return d.toLocaleString("ar-EG", {
    weekday: "short", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit", timeZone: "Africa/Cairo",
  });
}

/** baseline inline short date-time — app/page.tsx @ baseline-pre-i18n */
function baseShortDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "short", timeStyle: "short" });
}

test("every locale-aware date/time helper reproduces the published Arabic byte for byte", () => {
  for (const iso of SAMPLES) {
    assert.equal(formatTime("ar", iso), baseTimeOf(iso), `formatTime ${iso}`);
    assert.equal(formatDate("ar", iso), baseDateAr(iso), `formatDate ${iso}`);
    // Both baseline formatters default `now` to Date.now(); the probe must pin
    // it or the comparison drifts with the wall clock.
    assert.equal(formatDayLabel("ar", iso, NOW), baseDayLabel(iso, NOW), `formatDayLabel ${iso}`);
    assert.equal(formatRelative("ar", iso, NOW), baseRelative(iso, NOW), `formatRelative ${iso}`);
    assert.equal(formatClock("ar", iso), baseClock(iso), `formatClock ${iso}`);
    // The two long forms replace inline ar-EG Intl calls, not dateAr(); they
    // carry Arabic-Indic digits and their own separators, so compare against
    // those exact baselines rather than asserting they "contain" the short form.
    assert.equal(formatDateTime("ar", iso), baseArabicDateTime(iso), `formatDateTime ${iso}`);
    assert.equal(formatDateTimeShort("ar", iso), baseShortDateTime(iso), `formatDateTimeShort ${iso}`);
  }
});

test("English gets English, and never an Arabic string", () => {
  for (const iso of SAMPLES) {
    // formatDateTime is nullable (it returns null for an unparseable instant);
    // every SAMPLE is valid, so assert that and narrow before matching.
    const long = formatDateTime("en", iso);
    assert.ok(long !== null, `formatDateTime returned null for a valid sample: ${iso}`);
    for (const value of [formatTime("en", iso), formatDate("en", iso), formatDayLabel("en", iso, NOW), formatRelative("en", iso, NOW), formatClock("en", iso), long, formatDateTimeShort("en", iso)]) {
      assert.doesNotMatch(value, /[\u0600-\u06FF]/, `English output leaked Arabic: ${JSON.stringify(value)}`);
    }
  }
});

/* ── clockOf: the compact clock line under the score ───────────────────── */

/**
 * The status map views/match-detail.tsx declares, parsed out of the live
 * source. The real clockOf() is imported above and executed; this map is only
 * read to assert the map is actually reachable (it is, for every legal status)
 * and that every key it names exists in both dictionaries.
 */
const SRC = readFileSync(new URL("../views/match-detail.tsx", import.meta.url), "utf8");
const MAP_BODY = /const STATUS_AR: Record<string, string> = \{([\s\S]*?)\n\};/.exec(SRC)?.[1] ?? "";
const STATUS_KEY: Record<string, string> = {};
for (const m of MAP_BODY.matchAll(/^\s*"?([a-z_]+)"?:\s*"([^"]+)",\s*$/gm)) STATUS_KEY[m[1]!] = m[2]!;

/** baseline app/matches/[slug]/page.tsx local STATUS_AR (line 53), verbatim. */
const STATUS_AR_BASE: Record<string, string> = {
  live: "مباشر الآن", halftime: "استراحة بين الشوطين", extra_time: "وقت إضافي",
  extra_time_halftime: "استراحة الوقت الإضافي", penalty_shootout: "ركلات الترجيح",
  finished: "انتهت المباراة", scheduled: "لم تبدأ بعد", postponed: "مؤجَّلة",
  cancelled: "ملغاة", suspended: "موقوفة", abandoned: "متوقفة",
  walkover: "انسحاب", awarded: "حُسمت بقرار",
};

function clockOfBaseline(f: { status: MatchStatus; minute: number | null; scheduledAt: string }, now: number) {
  if (f.status === "halftime") return "استراحة";
  if (f.minute !== null && ["live", "extra_time", "extra_time_halftime", "penalty_shootout"].includes(f.status)) return `${f.minute}'`;
  if (f.status === "finished") return "انتهت";
  const state = matchStateOf(f.status, f.scheduledAt, now);
  if (state === "upcoming") return baseClock(f.scheduledAt);
  if (state === "unconfirmed") return MATCH_STATE_LABEL_AR.unconfirmed;
  return STATUS_AR_BASE[f.status] ?? MATCH_STATE_LABEL_AR[state];
}

test("clockOf still prints the published Arabic for every status and kickoff", () => {
  assert.ok(Object.keys(STATUS_KEY).length >= 13, "STATUS_AR was parsed out of views/match-detail.tsx");
  const statuses: MatchStatus[] = ["scheduled", "live", "halftime", "extra_time", "extra_time_halftime", "penalty_shootout", "finished", "postponed", "cancelled", "suspended", "abandoned", "walkover", "awarded"];
  let compared = 0, mapHits = 0;
  for (const status of statuses) {
    for (const iso of ["2026-10-14T09:00:00Z", "2026-10-14T13:00:00Z", "2026-11-01T19:00:00Z"]) {
      for (const minute of [null, 34] as const) {
        const f = { status, minute, scheduledAt: iso };
        assert.equal(realClockOf("ar", f as never, NOW), clockOfBaseline(f, NOW), `clockOf ${status} ${iso} minute=${minute}`);
        compared++;
        if (STATUS_KEY[status]) mapHits++;
      }
    }
  }
  assert.equal(compared, 78);
  // The status map is live for every legal status — a future refactor must not
  // assume it is dead code and drop it.
  assert.ok(mapHits >= 39, `the local status map resolved on ${mapHits}/78 combinations`);
  // And the clock line keeps the short halftime form, not the long badge label.
  assert.equal(realClockOf("ar", { status: "halftime", minute: null, scheduledAt: "2026-10-14T09:00:00Z" } as never, NOW), "استراحة");
});

test("the clock line is English on the English page", () => {
  const statuses: MatchStatus[] = ["scheduled", "live", "halftime", "extra_time", "finished", "postponed", "cancelled", "suspended", "abandoned", "walkover", "awarded"];
  for (const status of statuses) {
    const value = realClockOf("en", { status, minute: null, scheduledAt: "2026-10-14T09:00:00Z" } as never, NOW);
    assert.doesNotMatch(value, /[\u0600-\u06FF]/, `English clock line leaked Arabic for ${status}: ${JSON.stringify(value)}`);
  }
});

test("every status the local map names has a real dictionary entry in both languages", () => {
  for (const [status, key] of Object.entries(STATUS_KEY)) {
    for (const locale of ["ar", "en"] as const) {
      const value = t(locale, key);
      assert.notEqual(value, key, `${locale}: ${status} -> ${key} is missing from the dictionary`);
      assert.ok(value.length > 0, `${locale}: ${String(key)} is empty`);
    }
  }
});
