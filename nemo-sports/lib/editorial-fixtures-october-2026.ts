/**
 * NEMO Sports · editorial fixtures — 15–16 October 2026
 * ─────────────────────────────────────────────────────────────────────────
 * Operator-entered fixtures for the two matchdays the desk covers by hand:
 * الخميس 15 أكتوبر 2026 (اليوم) and الجمعة 16 أكتوبر 2026 (غدًا).
 *
 * Why this file exists as data rather than code:
 *   · The editorial records live in `admin_matches` (lib/admin-matches.ts) and
 *     are merged into every public surface as first-class fixtures. This module
 *     is their SEED — the same objects the admin panel would create by hand —
 *     so a fresh install (or a reset database) starts with the matchdays the
 *     desk already published, instead of an empty schedule.
 *   · `db/admin-matches.json` mirrors this list exactly. The disk store wins
 *     once it exists (lib/admin-matches.ts `loadDiskMatches`), so edits made in
 *     the admin panel are never overwritten by the seed on the next boot.
 *
 * Ground rules the rest of the platform relies on:
 *   · `scheduledAt` is the UTC INSTANT. The wall-clock kickoff the desk works
 *     with is Africa/Cairo (the site display timezone, lib/tz.ts) and is
 *     written in the comment above each line. Egypt was on UTC+3 on both days
 *     (DST ran until 29 October 2026), so Cairo time = UTC + 3h.
 *   · Status is `upcoming` and there are NO scores: an editorial fixture is a
 *     schedule entry until an operator records the result. Nothing here claims
 *     a result that was never played.
 *   · `channels` and `round` are editorial metadata (see AdminMatch): the TV
 *     list comes from the desk, not from a provider, so it is labelled as
 *     editorial wherever it is rendered.
 *   · Logos are only set where the crest URL is certain, and every URL comes
 *     from a CDN the platform already trusts — see the `fd` / `api` / `tsd`
 *     helpers below. Football-Data's club ids and API-Football's media CDN
 *     cover the European clubs; the Arabic clubs (Egypt, Saudi, the Gulf) are
 *     not in the Football-Data catalogue at all, so their badge comes from
 *     TheSportsDB — the platform's approved metadata/image source — copied
 *     verbatim from the provider's own team record.
 *     Clubs the desk's sheet lists below the top divisions (second-division
 *     sides with no provider record) keep an EMPTY logo on purpose: the UI
 *     then draws its own monogram (components/ui/ProviderCrest.tsx) instead of
 *     a wrong club badge. `docs/EDITORIAL_FIXTURES_2026-10-15.md` lists them,
 *     and an editor can paste a verified URL per match in the admin panel
 *     (/admin/matches → «شعار المضيف/الضيف (رابط)»).
 *
 * Data notes for the desk (three entries are inconsistent internally and are
 * flagged in docs/EDITORIAL_FIXTURES_2026-10-15.md for confirmation, but none
 * are silently altered here — the operator owns the truth of their own list).
 */

import type { AdminMatch } from "@/lib/admin-matches";

/** The moment the desk entered these matchdays (displayed as editorial provenance). */
const ENTERED_AT = "2026-10-14T20:00:00.000Z";

type CompetitionKey =
  | "egy"
  | "egy2"
  | "sau"
  | "ucl"
  | "epl"
  | "laliga"
  | "seriea"
  | "bundesliga"
  | "ligue1"
  | "eredivisie"
  | "uae"
  | "qatar";

/**
 * Competition identifier + Arabic name per family.
 *
 * The long-established leagues use the EXACT slug and Arabic name of the
 * canonical catalogue (lib/competition-catalog.ts / lib/core-data.ts) so the
 * fixture belongs to that competition on every filter, page and search result
 * — e.g. the Saudi league is stored as «دوري روشن السعودي», the catalogue's
 * name, even though the desk's sheet says «الدوري السعودي للمحترفين».
 * Competitions the catalogue does not carry yet (second division, UAE, Qatar,
 * Eredivisie) keep the desk's own name; they render on /matches and on their
 * match pages, and gain a competition page only after a provider covers them.
 */
const COMPETITIONS: Record<CompetitionKey, { slug: string; name: string; nameEn: string }> = {
  egy: { slug: "egyptian-league", name: "الدوري المصري الممتاز", nameEn: "Egyptian Premier League" },
  egy2: { slug: "egyptian-second-division", name: "دوري القسم الثاني", nameEn: "Egyptian Second Division" },
  sau: { slug: "saudi-pro-league", name: "دوري روشن السعودي", nameEn: "Saudi Pro League" },
  ucl: { slug: "champions-league", name: "دوري أبطال أوروبا", nameEn: "UEFA Champions League" },
  epl: { slug: "premier-league", name: "الدوري الإنجليزي الممتاز", nameEn: "Premier League" },
  laliga: { slug: "la-liga", name: "الدوري الإسباني", nameEn: "LaLiga" },
  seriea: { slug: "serie-a", name: "الدوري الإيطالي", nameEn: "Serie A" },
  bundesliga: { slug: "bundesliga", name: "الدوري الألماني", nameEn: "Bundesliga" },
  ligue1: { slug: "ligue-1", name: "الدوري الفرنسي", nameEn: "Ligue 1" },
  eredivisie: { slug: "eredivisie", name: "الدوري الهولندي", nameEn: "Eredivisie" },
  uae: { slug: "uae-pro-league", name: "دوري الإمارات", nameEn: "UAE Pro League" },
  qatar: { slug: "qatar-stars-league", name: "دوري نجوم QNB", nameEn: "QNB Stars League" },
};

type Side = {
  /** Arabic display name (what the desk publishes). */
  name: string;
  /** Latin display name for the English locale. */
  nameEn: string;
  /** Verified crest URL, or "" to let NEMO draw its own monogram. */
  logo?: string;
};

type Row = {
  slug: string;
  competition: CompetitionKey;
  /** UTC kickoff instant — Cairo wall clock is in the comment above the row. */
  kickoff: string;
  round?: string;
  home: Side;
  away: Side;
  venue?: string;
  /** Declared TV channels for this match only (editorial, may be empty). */
  channels: string[];
};

const fd = (id: number) => `https://crests.football-data.org/${id}.png`;

/**
 * Crest from API-Football's media CDN. These are the club ids the platform
 * already ships in the 9 October rows (`LEGACY_ADMIN_MATCHES`), reused here so
 * one club never renders two different badges across matchdays.
 */
const api = (id: number) => `https://media.api-sports.io/football/teams/${id}.png`;

/**
 * TheSportsDB badge off its r2 CDN — the URL is copied VERBATIM from the
 * provider's own team record (TheSportsDB is the platform's approved
 * metadata/image source, see COMPLIANCE.md). Used for the clubs the
 * Football-Data crest set does not cover (Egypt, Saudi, the Gulf), so an
 * Arabic-club fixture shows the real badge instead of a monogram.
 */
const tsd = (hash: string) => `https://r2.thesportsdb.com/images/media/team/badge/${hash}.png`;

const ROWS: Row[] = [
  /* ═══ الخميس 15 أكتوبر 2026 ══════════════════════════════════════════ */

  // 14:00 القاهرة — الدوري الإنجليزي الممتاز
  {
    slug: "manchester-city-vs-arsenal",
    competition: "epl",
    kickoff: "2026-10-15T11:00:00.000Z",
    round: "الجولة 7",
    home: { name: "مانشستر سيتي", nameEn: "Manchester City", logo: fd(65) },
    away: { name: "آرسنال", nameEn: "Arsenal", logo: fd(57) },
    venue: "ملعب الاتحاد - مانشستر",
    channels: ["beIN SPORTS", "Sky Sports"],
  },
  // 15:30 القاهرة — دوري القسم الثاني
  {
    slug: "ain-shams-vs-minya",
    competition: "egy2",
    kickoff: "2026-10-15T12:30:00.000Z",
    round: "الجولة 5",
    home: { name: "عين شمس", nameEn: "Ain Shams" },
    away: { name: "المنيا", nameEn: "Minya" },
    channels: ["Koora Live"],
  },
  // 16:00 القاهرة — دوري روشن السعودي
  {
    slug: "al-faisaly-vs-al-khaleej",
    competition: "sau",
    kickoff: "2026-10-15T13:00:00.000Z",
    round: "الجولة 6",
    home: { name: "الفيصلي", nameEn: "Al Faisaly", logo: tsd("a81pz21646835057") },
    away: { name: "الخليج", nameEn: "Al Khaleej", logo: tsd("mvf6ga1755192630") },
    venue: "ملعب الفيصلي - الرياض",
    channels: ["SSC Sports"],
  },
  // 16:30 القاهرة — الدوري الإنجليزي الممتاز
  {
    slug: "chelsea-vs-everton",
    competition: "epl",
    kickoff: "2026-10-15T13:30:00.000Z",
    round: "الجولة 7",
    home: { name: "تشيلسي", nameEn: "Chelsea", logo: fd(61) },
    away: { name: "إيفرتون", nameEn: "Everton", logo: fd(62) },
    venue: "ستامفورد بريدج - لندن",
    channels: ["beIN SPORTS"],
  },
  // 17:00 القاهرة — الدوري المصري الممتاز
  {
    slug: "pyramids-vs-haras-el-hodoud",
    competition: "egy",
    kickoff: "2026-10-15T14:00:00.000Z",
    round: "الجولة 5",
    home: { name: "بيراميدز", nameEn: "Pyramids FC", logo: tsd("8liy611607352549") },
    away: { name: "حرس الحدود", nameEn: "Haras El Hodoud" },
    venue: "استاد بيراميدز - الجيزة",
    channels: ["Koora Live"],
  },
  // 17:30 القاهرة — الدوري الألماني
  {
    slug: "bayern-munich-vs-borussia-dortmund",
    competition: "bundesliga",
    kickoff: "2026-10-15T14:30:00.000Z",
    round: "الجولة 7",
    home: { name: "بايرن ميونخ", nameEn: "Bayern München", logo: fd(5) },
    away: { name: "بوروسيا دورتموند", nameEn: "Borussia Dortmund", logo: fd(4) },
    venue: "أليانز أرينا - ميونخ",
    channels: ["beIN SPORTS"],
  },
  // 18:00 القاهرة — دوري الإمارات
  {
    slug: "sharjah-vs-al-wahda",
    competition: "uae",
    kickoff: "2026-10-15T15:00:00.000Z",
    round: "الجولة 5",
    home: { name: "الشارقة", nameEn: "Sharjah", logo: tsd("kccfg11753982654") },
    away: { name: "الوحدة", nameEn: "Al Wahda" },
    venue: "ملعب الشارقة",
    channels: ["ADTV"],
  },
  // 18:30 القاهرة — الدوري المصري الممتاز
  {
    slug: "mansoura-vs-al-nasr-egypt",
    competition: "egy",
    kickoff: "2026-10-15T15:30:00.000Z",
    round: "الجولة 5",
    home: { name: "المنصورة", nameEn: "Mansoura" },
    away: { name: "النصر", nameEn: "Al Nasr (Egypt)" },
    venue: "استاد المنصورة",
    channels: ["ON Time Sports 3"],
  },
  // 18:30 القاهرة — دوري روشن السعودي
  {
    slug: "al-hazem-vs-al-fateh",
    competition: "sau",
    kickoff: "2026-10-15T15:30:00.000Z",
    round: "الجولة 6",
    home: { name: "الحزم", nameEn: "Al Hazem", logo: tsd("3uy27p1635871755") },
    away: { name: "الفتح", nameEn: "Al Fateh", logo: api(2939) },
    venue: "ملعب الحزم - الرياض",
    channels: ["SSC Sports"],
  },
  // 18:45 القاهرة — دوري أبطال أوروبا
  {
    slug: "juventus-vs-lyon",
    competition: "ucl",
    kickoff: "2026-10-15T15:45:00.000Z",
    round: "الجولة 2",
    home: { name: "يوفنتوس", nameEn: "Juventus", logo: fd(109) },
    away: { name: "ليون", nameEn: "Olympique Lyonnais", logo: fd(523) },
    venue: "أليانز ستاديوم - تورينو",
    channels: ["beIN SPORTS"],
  },
  // 19:00 القاهرة — الدوري المصري الممتاز
  {
    slug: "al-ahly-vs-ismaily",
    competition: "egy",
    kickoff: "2026-10-15T16:00:00.000Z",
    round: "الجولة 5",
    home: { name: "الأهلي", nameEn: "Al Ahly", logo: tsd("x8753q1751421890") },
    away: { name: "الإسماعيلي", nameEn: "Ismaily", logo: tsd("1g46qo1589807617") },
    venue: "استاد الدفاع الجوي - القاهرة",
    channels: ["ON Time Sports 1", "Koora Live"],
  },
  // 19:00 القاهرة — دوري أبطال أوروبا
  {
    slug: "liverpool-vs-ac-milan",
    competition: "ucl",
    kickoff: "2026-10-15T16:00:00.000Z",
    round: "الجولة 2",
    home: { name: "ليفربول", nameEn: "Liverpool", logo: fd(64) },
    away: { name: "ميلان", nameEn: "AC Milan", logo: fd(98) },
    venue: "أنفيلد - ليفربول",
    channels: ["beIN SPORTS", "SSC Sports"],
  },
  // 19:00 القاهرة — الدوري الإسباني
  {
    slug: "valencia-vs-real-betis",
    competition: "laliga",
    kickoff: "2026-10-15T16:00:00.000Z",
    round: "الجولة 8",
    home: { name: "فالنسيا", nameEn: "Valencia", logo: fd(95) },
    away: { name: "ريال بيتيس", nameEn: "Real Betis", logo: fd(90) },
    venue: "ملعب ميستايا - فالنسيا",
    channels: ["beIN SPORTS"],
  },
  // 19:30 القاهرة — الدوري المصري الممتاز
  {
    slug: "el-mokawloon-vs-ghazl-el-mahalla",
    competition: "egy",
    kickoff: "2026-10-15T16:30:00.000Z",
    round: "الجولة 5",
    home: { name: "المقاولون العرب", nameEn: "El Mokawloon", logo: tsd("gi170k1589807275") },
    away: { name: "غزل المحلة", nameEn: "Ghazl El Mahalla" },
    venue: "استاد المقاولون العرب",
    channels: ["ON Time Sports 4"],
  },
  // 20:00 القاهرة — الدوري المصري الممتاز
  {
    slug: "el-dakhleya-vs-la-viena",
    competition: "egy",
    kickoff: "2026-10-15T17:00:00.000Z",
    round: "الجولة 5",
    home: { name: "الداخلية", nameEn: "El Dakhleya" },
    away: { name: "لافيينا", nameEn: "La Viena" },
    venue: "استاد الداخلية",
    channels: ["Koora Live"],
  },
  // 20:00 القاهرة — دوري روشن السعودي
  {
    slug: "al-ittihad-vs-al-taawoun",
    competition: "sau",
    kickoff: "2026-10-15T17:00:00.000Z",
    round: "الجولة 6",
    home: { name: "الاتحاد", nameEn: "Al Ittihad", logo: tsd("8n1t1j1755192418") },
    away: { name: "التعاون", nameEn: "Al Taawoun", logo: tsd("rlsmp91646835052") },
    venue: "ملعب الاتحاد - جدة",
    channels: ["SSC Sports"],
  },
  // 20:00 القاهرة — الدوري الفرنسي
  {
    slug: "paris-saint-germain-vs-marseille",
    competition: "ligue1",
    kickoff: "2026-10-15T17:00:00.000Z",
    round: "الجولة 7",
    home: { name: "باريس سان جيرمان", nameEn: "Paris Saint-Germain", logo: fd(524) },
    away: { name: "أولمبيك مارسيليا", nameEn: "Olympique de Marseille", logo: fd(516) },
    venue: "بارك دي برانس - باريس",
    channels: ["beIN SPORTS"],
  },
  // 20:45 القاهرة — الدوري الإيطالي
  {
    slug: "inter-milan-vs-roma",
    competition: "seriea",
    kickoff: "2026-10-15T17:45:00.000Z",
    round: "الجولة 7",
    home: { name: "إنتر ميلان", nameEn: "Inter", logo: fd(108) },
    away: { name: "روما", nameEn: "AS Roma", logo: fd(100) },
    venue: "سان سيرو - ميلان",
    channels: ["beIN SPORTS"],
  },
  // 21:00 القاهرة — دوري أبطال أوروبا
  {
    slug: "real-madrid-vs-bayer-leverkusen",
    competition: "ucl",
    kickoff: "2026-10-15T18:00:00.000Z",
    round: "الجولة 2",
    home: { name: "ريال مدريد", nameEn: "Real Madrid", logo: fd(86) },
    away: { name: "باير ليفركوزن", nameEn: "Bayer Leverkusen", logo: fd(3) },
    venue: "سانتياغو برنابيو - مدريد",
    channels: ["beIN SPORTS"],
  },
  // 21:00 القاهرة — الدوري الإسباني
  {
    slug: "barcelona-vs-atletico-madrid",
    competition: "laliga",
    kickoff: "2026-10-15T18:00:00.000Z",
    round: "الجولة 8",
    home: { name: "برشلونة", nameEn: "FC Barcelona", logo: fd(81) },
    away: { name: "أتلتيكو مدريد", nameEn: "Atlético de Madrid", logo: fd(78) },
    venue: "كامب نو - برشلونة",
    channels: ["beIN SPORTS"],
  },
  // 21:30 القاهرة — الدوري المصري الممتاز
  {
    slug: "zamalek-vs-tanta",
    competition: "egy",
    kickoff: "2026-10-15T18:30:00.000Z",
    round: "الجولة 5",
    home: { name: "الزمالك", nameEn: "Zamalek", logo: tsd("tgekj81580930027") },
    away: { name: "طنطا", nameEn: "Tanta" },
    venue: "استاد الدفاع الجوي - القاهرة",
    channels: ["ON Time Sports 2"],
  },

  /* ═══ الجمعة 16 أكتوبر 2026 ═════════════════════════════════════════ */

  // 12:30 القاهرة — الدوري الإنجليزي الممتاز
  {
    slug: "liverpool-vs-tottenham",
    competition: "epl",
    kickoff: "2026-10-16T09:30:00.000Z",
    round: "الجولة 7",
    home: { name: "ليفربول", nameEn: "Liverpool", logo: fd(64) },
    away: { name: "توتنهام", nameEn: "Tottenham Hotspur", logo: fd(73) },
    venue: "أنفيلد - ليفربول",
    channels: ["beIN SPORTS"],
  },
  // 15:00 القاهرة — الدوري الإنجليزي الممتاز
  {
    slug: "manchester-united-vs-newcastle",
    competition: "epl",
    kickoff: "2026-10-16T12:00:00.000Z",
    round: "الجولة 7",
    home: { name: "مانشستر يونايتد", nameEn: "Manchester United", logo: fd(66) },
    away: { name: "نيوكاسل يونايتد", nameEn: "Newcastle United", logo: fd(67) },
    venue: "أولد ترافورد - مانشستر",
    channels: ["beIN SPORTS", "Sky Sports"],
  },
  // 16:00 القاهرة — دوري القسم الثاني
  {
    slug: "sharkia-vs-al-arish",
    competition: "egy2",
    kickoff: "2026-10-16T13:00:00.000Z",
    round: "الجولة 5",
    home: { name: "شرقية", nameEn: "Sharkia" },
    away: { name: "العريش", nameEn: "Al Arish" },
    channels: ["Koora Live"],
  },
  // 17:00 القاهرة — الدوري الإسباني
  {
    slug: "espanyol-vs-malaga",
    competition: "laliga",
    kickoff: "2026-10-16T14:00:00.000Z",
    round: "الجولة 8",
    home: { name: "إسبانيول", nameEn: "RCD Espanyol", logo: fd(80) },
    away: { name: "ملقا", nameEn: "Málaga CF", logo: fd(84) },
    venue: "ملعب كورنيا إل برات - برشلونة",
    channels: ["beIN SPORTS"],
  },
  // 17:30 القاهرة — دوري روشن السعودي
  {
    slug: "al-hilal-vs-al-shabab",
    competition: "sau",
    kickoff: "2026-10-16T14:30:00.000Z",
    round: "الجولة 6",
    home: { name: "الهلال", nameEn: "Al Hilal", logo: tsd("w0b80d1661656916") },
    away: { name: "الشباب", nameEn: "Al Shabab" },
    venue: "ملعب المملكة أرينا - الرياض",
    channels: ["SSC Sports"],
  },
  // 18:00 القاهرة — الدوري المصري الممتاز
  {
    slug: "el-entag-el-harby-vs-misr-club",
    competition: "egy",
    kickoff: "2026-10-16T15:00:00.000Z",
    round: "الجولة 5",
    home: { name: "الإنتاج الحربي", nameEn: "El Entag El Harby" },
    away: { name: "نادي مصر", nameEn: "Misr Club" },
    venue: "ملعب الإنتاج الحربي",
    channels: ["Koora Live"],
  },
  // 18:00 القاهرة — الدوري الإيطالي
  {
    slug: "fiorentina-vs-bologna",
    competition: "seriea",
    kickoff: "2026-10-16T15:00:00.000Z",
    round: "الجولة 7",
    home: { name: "فيورنتينا", nameEn: "Fiorentina", logo: fd(99) },
    away: { name: "بولونيا", nameEn: "Bologna", logo: fd(103) },
    venue: "ستاديو أرتيميو فرانكي - فلورنسا",
    channels: ["beIN SPORTS"],
  },
  // 18:30 القاهرة — الدوري الألماني
  {
    slug: "werder-bremen-vs-eintracht-frankfurt",
    competition: "bundesliga",
    kickoff: "2026-10-16T15:30:00.000Z",
    round: "الجولة 7",
    home: { name: "فيردر بريمن", nameEn: "Werder Bremen", logo: fd(12) },
    away: { name: "فرانكفورت", nameEn: "Eintracht Frankfurt", logo: fd(19) },
    venue: "فيسر شتاديون - بريمن",
    channels: ["beIN SPORTS"],
  },
  // 18:30 القاهرة — دوري نجوم QNB
  {
    slug: "al-sadd-vs-al-rayyan",
    competition: "qatar",
    kickoff: "2026-10-16T15:30:00.000Z",
    round: "الجولة 4",
    home: { name: "السد", nameEn: "Al Sadd", logo: tsd("908a011774579337") },
    away: { name: "الريان", nameEn: "Al Rayyan", logo: tsd("hvb3r41653090047") },
    venue: "ملعب جاسم بن حمد - الدوحة",
    channels: ["beIN SPORTS"],
  },
  // 19:00 القاهرة — الدوري المصري الممتاز
  {
    slug: "smouha-vs-misr-lel-makkasa",
    competition: "egy",
    kickoff: "2026-10-16T16:00:00.000Z",
    round: "الجولة 5",
    home: { name: "سموحة", nameEn: "Smouha", logo: tsd("qq4pkd1589807413") },
    away: { name: "المقاصة", nameEn: "Misr Lel Makkasa" },
    venue: "ملعب سموحة - الإسكندرية",
    channels: ["ON Time Sports 1"],
  },
  // 19:00 القاهرة — دوري أبطال أوروبا
  {
    slug: "manchester-city-vs-istanbul-basaksehir",
    competition: "ucl",
    kickoff: "2026-10-16T16:00:00.000Z",
    round: "الجولة 2",
    home: { name: "مانشستر سيتي", nameEn: "Manchester City", logo: fd(65) },
    away: { name: "اسطنبول باشاك شهير", nameEn: "İstanbul Başakşehir" },
    venue: "ملعب الاتحاد - مانشستر",
    channels: ["beIN SPORTS"],
  },
  // 19:00 القاهرة — الدوري الإسباني
  {
    slug: "real-madrid-vs-sevilla",
    competition: "laliga",
    kickoff: "2026-10-16T16:00:00.000Z",
    round: "الجولة 8",
    home: { name: "ريال مدريد", nameEn: "Real Madrid", logo: fd(86) },
    away: { name: "إشبيلية", nameEn: "Sevilla FC", logo: fd(559) },
    venue: "سانتياغو برنابيو - مدريد",
    channels: ["beIN SPORTS"],
  },
  // 19:00 القاهرة — الدوري الفرنسي
  {
    slug: "monaco-vs-rennes",
    competition: "ligue1",
    kickoff: "2026-10-16T16:00:00.000Z",
    round: "الجولة 7",
    home: { name: "موناكو", nameEn: "AS Monaco", logo: fd(548) },
    away: { name: "رين", nameEn: "Stade Rennais", logo: fd(529) },
    venue: "ملعب لويس الثاني - موناكو",
    channels: ["beIN SPORTS"],
  },
  // 19:30 القاهرة — الدوري المصري الممتاز
  {
    slug: "future-vs-zamalek",
    competition: "egy",
    kickoff: "2026-10-16T16:30:00.000Z",
    round: "الجولة 5",
    home: { name: "فيوتشر", nameEn: "Modern Future", logo: tsd("larnky1729784569") },
    away: { name: "الزمالك", nameEn: "Zamalek", logo: tsd("tgekj81580930027") },
    venue: "ملعب نجيب ساويرس",
    channels: ["ON Time Sports 4"],
  },
  // 19:30 القاهرة — دوري الإمارات
  {
    slug: "al-ain-vs-al-jazira",
    competition: "uae",
    kickoff: "2026-10-16T16:30:00.000Z",
    round: "الجولة 5",
    home: { name: "العين", nameEn: "Al Ain", logo: tsd("0w2bk51747334688") },
    away: { name: "الجزيرة", nameEn: "Al Jazira", logo: tsd("uknsoq1642708421") },
    venue: "استاد هزاع بن زايد - العين",
    channels: ["ADTV"],
  },
  // 20:00 القاهرة — دوري أبطال أوروبا
  {
    slug: "arsenal-vs-inter-milan",
    competition: "ucl",
    kickoff: "2026-10-16T17:00:00.000Z",
    round: "الجولة 2",
    home: { name: "آرسنال", nameEn: "Arsenal", logo: fd(57) },
    away: { name: "إنتر ميلان", nameEn: "Inter", logo: fd(108) },
    venue: "ملعب الإمارات - لندن",
    channels: ["beIN SPORTS", "SSC Sports"],
  },
  // 20:00 القاهرة — دوري روشن السعودي
  {
    slug: "al-nassr-vs-al-ahli-saudi",
    competition: "sau",
    kickoff: "2026-10-16T17:00:00.000Z",
    round: "الجولة 6",
    home: { name: "النصر", nameEn: "Al Nassr", logo: api(2934) },
    away: { name: "الأهلي السعودي", nameEn: "Al Ahli (Saudi)", logo: api(2932) },
    venue: "الأول بارك - الرياض",
    channels: ["SSC Sports"],
  },
  // 20:00 القاهرة — الدوري الهولندي
  {
    slug: "ajax-vs-vitesse",
    competition: "eredivisie",
    kickoff: "2026-10-16T17:00:00.000Z",
    round: "الجولة 7",
    home: { name: "أياكس أمستردام", nameEn: "AFC Ajax", logo: fd(678) },
    away: { name: "فيتسه أرنهيم", nameEn: "Vitesse" },
    venue: "يوهان كرويف أرينا - أمستردام",
    channels: ["beIN SPORTS"],
  },
  // 20:45 القاهرة — الدوري الإيطالي
  {
    slug: "napoli-vs-lazio",
    competition: "seriea",
    kickoff: "2026-10-16T17:45:00.000Z",
    round: "الجولة 7",
    home: { name: "نابولي", nameEn: "Napoli", logo: fd(113) },
    away: { name: "لاتسيو", nameEn: "Lazio", logo: fd(110) },
    venue: "ملعب دييغو مارادونا - نابولي",
    channels: ["beIN SPORTS"],
  },
  // 21:00 القاهرة — دوري أبطال أوروبا
  {
    slug: "barcelona-vs-bayern-munich",
    competition: "ucl",
    kickoff: "2026-10-16T18:00:00.000Z",
    round: "الجولة 2",
    home: { name: "برشلونة", nameEn: "FC Barcelona", logo: fd(81) },
    away: { name: "بايرن ميونخ", nameEn: "Bayern München", logo: fd(5) },
    venue: "كامب نو - برشلونة",
    channels: ["beIN SPORTS"],
  },
  // 21:00 القاهرة — الدوري المصري الممتاز
  {
    slug: "el-gouna-vs-pyramids",
    competition: "egy",
    kickoff: "2026-10-16T18:00:00.000Z",
    round: "الجولة 5",
    home: { name: "الجونة", nameEn: "El Gouna", logo: tsd("6vdj631589807310") },
    away: { name: "بيراميدز", nameEn: "Pyramids FC", logo: tsd("8liy611607352549") },
    venue: "ملعب الجونة - الغردقة",
    channels: ["ON Time Sports 3"],
  },
  // 21:00 القاهرة — دوري الإمارات
  {
    slug: "al-ittihad-kalba-vs-al-raqqa",
    competition: "uae",
    kickoff: "2026-10-16T18:00:00.000Z",
    round: "الجولة 5",
    home: { name: "الاتحاد", nameEn: "Al Ittihad Kalba" },
    away: { name: "الرقة", nameEn: "Al Raqqa" },
    venue: "ملعب محمد بن زايد - أبوظبي",
    channels: ["ADTV"],
  },
];

/** One seed row → the editorial record the admin panel would have produced. */
function toAdminMatch(row: Row): AdminMatch {
  const competition = COMPETITIONS[row.competition];
  return {
    id: `adm_match_${row.slug.replace(/-/g, "_")}`,
    slug: row.slug,
    sport: "football",
    competitionSlug: competition.slug,
    competitionName: competition.name,
    competitionNameEn: competition.nameEn,
    season: "2026/2027",
    homeName: row.home.name,
    homeNameEn: row.home.nameEn,
    homeLogo: row.home.logo ?? "",
    awayName: row.away.name,
    awayNameEn: row.away.nameEn,
    awayLogo: row.away.logo ?? "",
    scheduledAt: row.kickoff,
    status: "upcoming",
    homeScore: null,
    awayScore: null,
    venue: row.venue ?? "",
    referee: "",
    round: row.round ?? "",
    channels: [...row.channels],
    isPublished: true,
    createdBy: "editorial",
    createdAt: ENTERED_AT,
    updatedAt: ENTERED_AT,
  };
}

/**
 * The 15–16 October 2026 matchdays, ready to merge into the editorial store.
 *
 * NOTE: the Aswan × Al Ahli (Saudi) entry is intentionally NOT here — the desk
 * sheet lists a Saudi club inside the Egyptian Premier League. It is kept as an
 * UNPUBLISHED draft (see `UNPUBLISHED_EDITORIAL_FIXTURES`) so nothing wrong can
 * reach the public surfaces, and it is one publish click away from going live
 * once the desk confirms which match it means.
 */
export const EDITORIAL_FIXTURES_OCTOBER_2026: AdminMatch[] = ROWS.map(toAdminMatch);

/**
 * The one row from the desk's sheet that cannot be published as written:
 * «أسوان × الأهلي جدة» is filed under the Egyptian Premier League, which no
 * Saudi club can play in — so it stays a DRAFT (is_published = false) and is
 * invisible on every public surface. Publishing it is a single click in
 * /admin/matches once the desk confirms the pairing or the competition.
 */
export const UNPUBLISHED_EDITORIAL_FIXTURES: AdminMatch[] = [
  {
    ...toAdminMatch({
      slug: "aswan-vs-al-ahli-jeddah",
      competition: "egy",
      kickoff: "2026-10-16T17:30:00.000Z",
      round: "الجولة 5",
      home: { name: "أسوان", nameEn: "Aswan" },
      away: { name: "الأهلي جدة", nameEn: "Al Ahli Jeddah", logo: api(2932) },
      venue: "ملعب أسوان",
      channels: ["ON Time Sports 2"],
    }),
    isPublished: false,
  },
];
