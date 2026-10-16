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
  | "qatar"
  | "cafcl"
  | "cafcc"
  | "elc"
  | "botola"
  | "tunisia"
  | "turkey"
  | "gulfu17";

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
  cafcl: { slug: "caf-champions-league", name: "دوري أبطال أفريقيا", nameEn: "CAF Champions League" },
  cafcc: { slug: "caf-confederation-cup", name: "كأس الكونفدرالية الأفريقية", nameEn: "CAF Confederation Cup" },
  elc: { slug: "english-championship", name: "دوري البطولة الإنجليزية", nameEn: "English Championship" },
  botola: { slug: "morocco-botola-pro", name: "الدوري المغربي الاحترافي", nameEn: "Botola Pro" },
  tunisia: { slug: "tunisian-ligue-1", name: "الدوري التونسي للمحترفين", nameEn: "Tunisian Ligue Professionnelle 1" },
  turkey: { slug: "turkish-super-lig", name: "الدوري التركي الممتاز", nameEn: "Turkish Super Lig" },
  gulfu17: { slug: "gff-u17-gulf-cup", name: "كأس الخليج تحت 17 سنة", nameEn: "GFF U-17 Gulf Cup" },
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

/**
 * SportScore / TheSports verified team crest CDN URL, copied verbatim from
 * SportScore's v1 fixtures API (`https://sportscore.com/api/v1/fixtures/`).
 */
const ss = (file: string) => `https://img.thesports.com/football/team/${file}`;

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
    away: { name: "حرس الحدود", nameEn: "Haras El Hodoud", logo: ss("7dc80ef40b717d99f9aafeaf024f7e8c.png") },
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
    home: { name: "المنصورة", nameEn: "Mansoura", logo: ss("0ed04579b4f23aecafe02e0bd1e77df8.png") },
    away: { name: "النصر", nameEn: "Al Nasr (Egypt)", logo: ss("012e20b3629f32a2539127c692ca7802.png") },
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
    home: { name: "الداخلية", nameEn: "El Dakhleya", logo: ss("8d1f3d06d4bfea7344ea719069bfc19d.png") },
    away: { name: "لافيينا", nameEn: "La Viena", logo: ss("0c173e2f089171d2a466286dfbe1f4d4.png") },
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
    away: { name: "طنطا", nameEn: "Tanta", logo: ss("cd4ba6df7141f0017e0d08a38434df28.png") },
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
    venue: "استاد الزقازيق - الشرقية",
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
    home: { name: "الإنتاج الحربي", nameEn: "El Entag El Harby", logo: ss("350620126122b983966af8372622f32b.png") },
    away: { name: "نادي مصر", nameEn: "Misr Club", logo: ss("a08754ab96c283bacbf148154a50c7fc.png") },
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

  /* ═══ الجمعة 16 أكتوبر 2026 — مباريات مؤكدة مضافة (22 مباراة) ═══════════ */

  // 15:30 القاهرة — دوري القسم الثاني المصري (5 مباريات مؤكدة)
  {
    slug: "el-sekka-el-hadid-vs-ismaily",
    competition: "egy2",
    kickoff: "2026-10-16T12:30:00.000Z",
    round: "الجولة 5",
    home: { name: "السكة الحديد", nameEn: "El Sekka El Hadid", logo: ss("c67ee02a38b9fb06ae234a78372ab687.png") },
    away: { name: "الإسماعيلي", nameEn: "Ismaily", logo: tsd("1g46qo1589807617") },
    venue: "استاد السكة الحديد - القاهرة",
    channels: ["ON Time Sports 2"],
  },
  {
    slug: "tersana-vs-belqas",
    competition: "egy2",
    kickoff: "2026-10-16T12:30:00.000Z",
    round: "الجولة 5",
    home: { name: "الترسانة", nameEn: "Tersana SC", logo: ss("73f38ff51a6501f94e07cdbaf85a7bda.jpg") },
    away: { name: "بلقاس", nameEn: "Belqas", logo: ss("9a6ab6a789d6d6a51a231b81c9b98591.png") },
    venue: "استاد حسن الشاذلي - ميت عقبة",
    channels: ["ON Time Sports"],
  },
  {
    slug: "baladiyat-el-mahalla-vs-fc-masar",
    competition: "egy2",
    kickoff: "2026-10-16T12:30:00.000Z",
    round: "الجولة 5",
    home: { name: "بلدية المحلة", nameEn: "Baladiyat El Mahalla", logo: ss("aa4a2651bfdf597ebf8156490137e21c.png") },
    away: { name: "مسار", nameEn: "FC Masar", logo: ss("4865ed4b4aa59b33d33a8baeb8dd145f.png") },
    venue: "استاد بلدية المحلة - المحلة الكبرى",
    channels: ["ON Time Sports"],
  },
  {
    slug: "pharco-vs-maleyat-kafr-el-zayat",
    competition: "egy2",
    kickoff: "2026-10-16T12:30:00.000Z",
    round: "الجولة 5",
    home: { name: "فاركو", nameEn: "Pharco FC", logo: ss("abc7123841c5174901b57ace767891ca.png") },
    away: { name: "مالية كفر الزيات", nameEn: "Maleyat Kafr El Zayat", logo: ss("c604186d368ba789f2b896ff2a1a8baf.png") },
    venue: "استاد حرس الحدود - الإسكندرية",
    channels: ["ON Time Sports"],
  },
  {
    slug: "proxy-sc-vs-el-entag-al-harby",
    competition: "egy2",
    kickoff: "2026-10-16T12:30:00.000Z",
    round: "الجولة 5",
    home: { name: "بروكسي", nameEn: "Proxy SC", logo: ss("f12a5c16336477344a42a641736cbbbc.png") },
    away: { name: "الإنتاج الحربي", nameEn: "El Entag El Harby", logo: ss("350620126122b983966af8372622f32b.png") },
    venue: "ملعب بروكسي - البحيرة",
    channels: ["ON Time Sports"],
  },

  // 16:00 القاهرة — دوري أبطال أفريقيا
  {
    slug: "al-merrikh-vs-pyramids-fc",
    competition: "cafcl",
    kickoff: "2026-10-16T13:00:00.000Z",
    round: "الجولة 2",
    home: { name: "المريخ السوداني", nameEn: "Al-Merrikh SC", logo: ss("e84fd1abe55e97b12a0c24a2d69f1d21.jpg") },
    away: { name: "بيراميدز", nameEn: "Pyramids FC", logo: tsd("8liy611607352549") },
    venue: "استاد جوبا - جنوب السودان",
    channels: ["beIN SPORTS", "ON Time Sports"],
  },

  // 16:00 القاهرة — كأس الكونفدرالية الأفريقية
  {
    slug: "welwalo-adigrat-vs-al-ahli-tripoli",
    competition: "cafcc",
    kickoff: "2026-10-16T13:00:00.000Z",
    round: "الجولة 2",
    home: { name: "ويلوالو أديغرات", nameEn: "Welwalo Adigrat", logo: ss("52545530c9cf608ea4e94b14de5f637b.png") },
    away: { name: "الأهلي طرابلس", nameEn: "Al-Ahli Tripoli", logo: ss("c4be97d2fb17d6d1f93ecdc1652706a9.png") },
    venue: "ملعب أديغرات - إثيوبيا",
    channels: ["beIN SPORTS"],
  },

  // 16:05 القاهرة — دوري الإمارات
  {
    slug: "al-dhafra-vs-dubai-united",
    competition: "uae",
    kickoff: "2026-10-16T13:05:00.000Z",
    round: "الجولة 6",
    home: { name: "الظفرة", nameEn: "Al Dhafra FC", logo: ss("8872919405e0076fb753ae6492a0a2db.png") },
    away: { name: "دبي يونايتد", nameEn: "Dubai United", logo: ss("f1eb0a2465dd34309c64d113ce0c9b96.png") },
    venue: "استاد حمدان بن زايد - الظفرة",
    channels: ["ADTV", "Dubai Sports"],
  },

  // 16:15 القاهرة — دوري روشن السعودي
  {
    slug: "al-qadsiah-vs-abha",
    competition: "sau",
    kickoff: "2026-10-16T13:15:00.000Z",
    round: "الجولة 6",
    home: { name: "القادسية", nameEn: "Al Qadsiah", logo: ss("bc74439d19c8bbaa17c57406b120b86d.png") },
    away: { name: "أبها", nameEn: "Abha", logo: ss("a98a96581615b55fc4ea927d73036ae4.png") },
    venue: "استاد الأمير محمد بن فهد - الدمام",
    channels: ["SSC Sports", "Shahid VIP"],
  },

  // 17:30 القاهرة — دوري نجوم QNB
  {
    slug: "al-ahli-doha-vs-al-wakrah",
    competition: "qatar",
    kickoff: "2026-10-16T14:30:00.000Z",
    round: "الجولة 7",
    home: { name: "الأهلي القطري", nameEn: "Al-Ahli Doha", logo: ss("99b9e5475b90aa5b91fe68685bcd5e78.png") },
    away: { name: "الوكرة", nameEn: "Al-Wakrah SC", logo: ss("7dc879cf9017e0afa51a45de8aab7ec4.png") },
    venue: "استاد الثمامة - الدوحة",
    channels: ["beIN SPORTS", "Alkass"],
  },

  // 18:45 القاهرة — دوري الإمارات
  {
    slug: "baniyas-vs-al-wasl",
    competition: "uae",
    kickoff: "2026-10-16T15:45:00.000Z",
    round: "الجولة 6",
    home: { name: "بني ياس", nameEn: "Baniyas Club", logo: ss("0596d85aec8d39eb3343593869b886b0.png") },
    away: { name: "الوصل", nameEn: "Al-Wasl SC", logo: ss("17b767b98695df2fb512e992dd8a7af4.png") },
    venue: "استاد بني ياس - أبوظبي",
    channels: ["ADTV", "Dubai Sports"],
  },

  // 19:00 القاهرة — دوري أبطال أفريقيا
  {
    slug: "apr-fc-vs-zamalek-sc",
    competition: "cafcl",
    kickoff: "2026-10-16T16:00:00.000Z",
    round: "الجولة 2",
    home: { name: "الجيش الرواندي", nameEn: "APR FC", logo: ss("5c3095c0b6846235ed53eca20544d5c9.png") },
    away: { name: "الزمالك", nameEn: "Zamalek", logo: tsd("tgekj81580930027") },
    venue: "ملعب أماهورو - كيغالي",
    channels: ["beIN SPORTS", "ON Time Sports 1"],
  },
  {
    slug: "star-sport-academy-vs-rs-berkane",
    competition: "cafcl",
    kickoff: "2026-10-16T16:00:00.000Z",
    round: "الجولة 2",
    home: { name: "ستار سبورت أكاديمي", nameEn: "Star Sport Academy", logo: ss("971eddadae89533f7a711ce91ca2c689.png") },
    away: { name: "نهضة بركان", nameEn: "RS Berkane", logo: ss("643cec02806b6e82d15d0570d39febca.png") },
    venue: "ملعب صامويل كانيون دو - مونروفيا",
    channels: ["beIN SPORTS", "Arryadia"],
  },

  // 19:45 القاهرة — دوري نجوم QNB
  {
    slug: "al-shahaniya-vs-al-arabi-qatar",
    competition: "qatar",
    kickoff: "2026-10-16T16:45:00.000Z",
    round: "الجولة 7",
    home: { name: "الشحانية", nameEn: "Al-Shahaniya SC", logo: ss("d86556602af9974ced37e34b19f974fe.png") },
    away: { name: "العربي القطري", nameEn: "Al-Arabi SC", logo: ss("00bb4a98ec1224af879bd139519ce3b7.png") },
    venue: "استاد جاسم بن حمد - الدوحة",
    channels: ["beIN SPORTS", "Alkass"],
  },

  // 20:00 القاهرة — كأس الكونفدرالية الأفريقية
  {
    slug: "zed-fc-vs-azam-fc",
    competition: "cafcc",
    kickoff: "2026-10-16T17:00:00.000Z",
    round: "الجولة 2",
    home: { name: "نادي زد", nameEn: "ZED FC", logo: ss("a08754ab96c283bacbf148154a50c7fc.png") },
    away: { name: "عزام يونايتد", nameEn: "Azam FC", logo: ss("b39c4ae2f1c269f7c223ab3158a939f9.png") },
    venue: "استاد القاهرة الدولي - القاهرة",
    channels: ["ON Time Sports 1", "beIN SPORTS"],
  },

  // 20:00 القاهرة — الدوري التركي الممتاز
  {
    slug: "corum-fk-vs-caykur-rizespor",
    competition: "turkey",
    kickoff: "2026-10-16T17:00:00.000Z",
    round: "الجولة 9",
    home: { name: "تشوروم إف كيه", nameEn: "Corum FK", logo: ss("0f2a369af39d8b5f8de389cca2a217ad.png") },
    away: { name: "تشايكور ريزا سبور", nameEn: "Caykur Rizespor", logo: ss("be9dd7715b88e662d366df132c630f72.png") },
    venue: "ملعب تشوروم سيتي - تشوروم",
    channels: ["beIN SPORTS Turkey"],
  },

  // 21:00 القاهرة — الدوري الهولندي
  {
    slug: "sc-heerenveen-vs-excelsior",
    competition: "eredivisie",
    kickoff: "2026-10-16T18:00:00.000Z",
    round: "الجولة 9",
    home: { name: "هيرنفين", nameEn: "SC Heerenveen", logo: ss("c2cd1a6cdd056ae31e0712d5f4f97c9b.png") },
    away: { name: "إكسلسيور", nameEn: "Excelsior SBV", logo: ss("57b4c68789a8bedcb43174f5f4eb164a.png") },
    venue: "ملعب أبي لينسترا - هيرنفين",
    channels: ["ESPN"],
  },

  // 21:30 القاهرة — الدوري الألماني
  {
    slug: "eintracht-frankfurt-vs-fc-koln",
    competition: "bundesliga",
    kickoff: "2026-10-16T18:30:00.000Z",
    round: "الجولة 7",
    home: { name: "آينتراخت فرانكفورت", nameEn: "Eintracht Frankfurt", logo: fd(19) },
    away: { name: "كولن", nameEn: "FC Koln", logo: ss("887b7663a0d47031528921d9972ae3a6.png") },
    venue: "دويتشه بانك بارك - فرانكفورت",
    channels: ["beIN SPORTS", "Sky Sport"],
  },

  // 21:45 القاهرة — الدوري الإيطالي
  {
    slug: "frosinone-vs-sassuolo",
    competition: "seriea",
    kickoff: "2026-10-16T18:45:00.000Z",
    round: "الجولة 8",
    home: { name: "فروزينوني", nameEn: "Frosinone", logo: ss("93c278d5d8d1d5e2d390ff686359963d.png") },
    away: { name: "ساسولو", nameEn: "Sassuolo", logo: ss("616bf242a532f72e970648f2ead423cf.png") },
    venue: "ملعب بينيتو ستيربي - فروزينوني",
    channels: ["AD Sports Premium", "DAZN"],
  },

  // 21:45 القاهرة — الدوري الفرنسي
  {
    slug: "le-mans-vs-toulouse",
    competition: "ligue1",
    kickoff: "2026-10-16T18:45:00.000Z",
    round: "الجولة 8",
    home: { name: "لومان", nameEn: "Le Mans FC", logo: ss("5de17e3d35ef312559baf1f8c0b0b585.png") },
    away: { name: "تولوز", nameEn: "Toulouse FC", logo: ss("2947fe2f42551a5b7eccca7fc948f879.png") },
    venue: "ملعب ماري مارفينت - لومان",
    channels: ["beIN SPORTS"],
  },

  // 22:00 القاهرة — الدوري الإسباني
  {
    slug: "deportivo-la-coruna-vs-levante",
    competition: "laliga",
    kickoff: "2026-10-16T19:00:00.000Z",
    round: "الجولة 9",
    home: { name: "ديبورتيفو لاكورونيا", nameEn: "RC Deportivo", logo: ss("d7f9ac6cceee4a1d472eea59be7f8581.png") },
    away: { name: "ليفانتي", nameEn: "Levante UD", logo: ss("13e2038bd23a38ce32a3eb259c8bf7d8.png") },
    venue: "ملعب ريازور - لاكورونيا",
    channels: ["beIN SPORTS", "LaLiga TV"],
  },

  // 22:00 القاهرة — دوري البطولة الإنجليزية
  {
    slug: "burnley-vs-wolverhampton-wanderers",
    competition: "elc",
    kickoff: "2026-10-16T19:00:00.000Z",
    round: "الجولة 10",
    home: { name: "بيرنلي", nameEn: "Burnley", logo: ss("1091af5aa9fc4a30411785954edb9159.png") },
    away: { name: "وولفرهامبتون", nameEn: "Wolverhampton Wanderers", logo: ss("5759932ca2512c6701d86dfbd58380a7.png") },
    venue: "ملعب تيرف مور - بيرنلي",
    channels: ["beIN SPORTS", "Sky Sports"],
  },

  /* ═══ السبت 17 أكتوبر 2026 — الغد (54 مباراة مؤكدة مضافة) ═══════════════ */

  // 16:00 القاهرة — كأس الكونفدرالية الأفريقية (الأهلي المصري)
  {
    slug: "airtel-kitara-fc-vs-al-ahly-fc",
    competition: "cafcc",
    kickoff: "2026-10-17T13:00:00.000Z",
    round: "الجولة 2",
    home: { name: "كيتارا الأوغندي", nameEn: "Airtel Kitara FC", logo: ss("d439e7a9bf3355be5ac2e797f86031af.png") },
    away: { name: "الأهلي", nameEn: "Al Ahly", logo: tsd("x8753q1751421890") },
    venue: "ملعب مانديلا الوطني - كامبالا",
    channels: ["ON Time Sports 1", "beIN SPORTS"],
  },

  // 17:45 القاهرة — كأس الخليج تحت 17 سنة (منتخب مصر تحت 17)
  {
    slug: "saudi-arabia-u17-vs-egypt-u17",
    competition: "gulfu17",
    kickoff: "2026-10-17T14:45:00.000Z",
    round: "الجولة 3",
    home: { name: "السعودية تحت 17", nameEn: "Saudi Arabia U17", logo: ss("5c6a7914db793b21928365b45201a162.png") },
    away: { name: "مصر تحت 17", nameEn: "Egypt U17", logo: ss("9cefb7aa7a0fa3a6c0f77b7ffca99c10.png") },
    venue: "استاد الأمير سعود بن جلوي - الخبر",
    channels: ["ON Time Sports", "SSC Sports"],
  },

  // 14:30 القاهرة — الدوري الإنجليزي الممتاز
  {
    slug: "everton-vs-chelsea",
    competition: "epl",
    kickoff: "2026-10-17T11:30:00.000Z",
    round: "الجولة 8",
    home: { name: "إيفرتون", nameEn: "Everton", logo: fd(62) },
    away: { name: "تشيلسي", nameEn: "Chelsea", logo: fd(61) },
    venue: "غوديسون بارك - ليفربول",
    channels: ["beIN SPORTS 1", "TNT Sports"],
  },

  // 17:00 القاهرة — الدوري الإنجليزي الممتاز
  {
    slug: "brentford-vs-liverpool",
    competition: "epl",
    kickoff: "2026-10-17T14:00:00.000Z",
    round: "الجولة 8",
    home: { name: "برينتفورد", nameEn: "Brentford", logo: fd(402) },
    away: { name: "ليفربول", nameEn: "Liverpool", logo: fd(64) },
    venue: "ملعب غريفين بارك الجديد - لندن",
    channels: ["beIN SPORTS 1", "Sky Sports"],
  },
  {
    slug: "manchester-city-vs-ipswich-town",
    competition: "epl",
    kickoff: "2026-10-17T14:00:00.000Z",
    round: "الجولة 8",
    home: { name: "مانشستر سيتي", nameEn: "Manchester City", logo: fd(65) },
    away: { name: "إبسويتش تاون", nameEn: "Ipswich Town", logo: ss("cec3eaaa5271c1f2f036469593ecbcd8.png") },
    venue: "ملعب الاتحاد - مانشستر",
    channels: ["beIN SPORTS 2", "Sky Sports"],
  },
  {
    slug: "fulham-vs-hull-city",
    competition: "epl",
    kickoff: "2026-10-17T14:00:00.000Z",
    round: "الجولة 8",
    home: { name: "فولهام", nameEn: "Fulham", logo: fd(63) },
    away: { name: "هال سيتي", nameEn: "Hull City", logo: ss("262691204102d2200797f0ac34efb316.png") },
    venue: "كرافن كوتيج - لندن",
    channels: ["beIN SPORTS", "Sky Sports"],
  },

  // 19:30 القاهرة — الدوري الإنجليزي الممتاز
  {
    slug: "newcastle-united-vs-aston-villa",
    competition: "epl",
    kickoff: "2026-10-17T16:30:00.000Z",
    round: "الجولة 8",
    home: { name: "نيوكاسل يونايتد", nameEn: "Newcastle United", logo: fd(67) },
    away: { name: "أستون فيلا", nameEn: "Aston Villa", logo: fd(58) },
    venue: "سانت جيمس بارك - نيوكاسل",
    channels: ["beIN SPORTS 1", "Sky Sports"],
  },

  // 15:00 القاهرة — الدوري الإسباني
  {
    slug: "espanyol-vs-atletico-madrid",
    competition: "laliga",
    kickoff: "2026-10-17T12:00:00.000Z",
    round: "الجولة 9",
    home: { name: "إسبانيول", nameEn: "RCD Espanyol", logo: fd(80) },
    away: { name: "أتلتيكو مدريد", nameEn: "Atlético de Madrid", logo: fd(78) },
    venue: "ملعب كورنيا إل برات - برشلونة",
    channels: ["beIN SPORTS 3", "LaLiga TV"],
  },

  // 17:15 القاهرة — الدوري الإسباني
  {
    slug: "villarreal-vs-elche",
    competition: "laliga",
    kickoff: "2026-10-17T14:15:00.000Z",
    round: "الجولة 9",
    home: { name: "فياريال", nameEn: "Villarreal CF", logo: fd(94) },
    away: { name: "إلتشي", nameEn: "Elche CF", logo: ss("e5ecd0553885f1a3af731758dddce2ec.png") },
    venue: "ملعب لا سيراميكا - فياريال",
    channels: ["beIN SPORTS 3", "LaLiga TV"],
  },

  // 19:30 القاهرة — الدوري الإسباني
  {
    slug: "real-betis-vs-barcelona",
    competition: "laliga",
    kickoff: "2026-10-17T16:30:00.000Z",
    round: "الجولة 9",
    home: { name: "ريال بيتيس", nameEn: "Real Betis", logo: fd(90) },
    away: { name: "برشلونة", nameEn: "FC Barcelona", logo: fd(81) },
    venue: "ملعب بينيتو فيامارين - إشبيلية",
    channels: ["beIN SPORTS 1", "LaLiga TV"],
  },

  // 22:00 القاهرة — الدوري الإسباني
  {
    slug: "valencia-vs-athletic-club",
    competition: "laliga",
    kickoff: "2026-10-17T19:00:00.000Z",
    round: "الجولة 9",
    home: { name: "فالنسيا", nameEn: "Valencia", logo: fd(95) },
    away: { name: "أتلتيك بيلباو", nameEn: "Athletic Club", logo: fd(77) },
    venue: "ملعب ميستايا - فالنسيا",
    channels: ["beIN SPORTS 3", "LaLiga TV"],
  },

  // 16:00 القاهرة — الدوري الإيطالي
  {
    slug: "venezia-vs-napoli",
    competition: "seriea",
    kickoff: "2026-10-17T13:00:00.000Z",
    round: "الجولة 8",
    home: { name: "فينيزيا", nameEn: "Venezia", logo: ss("3e724dc0e6fffd01a630b65af348fab6.png") },
    away: { name: "نابولي", nameEn: "Napoli", logo: fd(113) },
    venue: "ملعب بيير لويجي بينزو - البندقية",
    channels: ["AD Sports Premium", "DAZN"],
  },

  // 19:00 القاهرة — الدوري الإيطالي
  {
    slug: "bologna-vs-inter-milan",
    competition: "seriea",
    kickoff: "2026-10-17T16:00:00.000Z",
    round: "الجولة 8",
    home: { name: "بولونيا", nameEn: "Bologna", logo: fd(103) },
    away: { name: "إنتر ميلان", nameEn: "Inter", logo: fd(108) },
    venue: "ملعب ريناتو دالارا - بولونيا",
    channels: ["AD Sports Premium 1", "DAZN"],
  },

  // 21:45 القاهرة — الدوري الإيطالي
  {
    slug: "roma-vs-genoa",
    competition: "seriea",
    kickoff: "2026-10-17T18:45:00.000Z",
    round: "الجولة 8",
    home: { name: "روما", nameEn: "AS Roma", logo: fd(100) },
    away: { name: "جنوى", nameEn: "Genoa", logo: ss("51474fb68c7da46b9c20ebddccec7766.png") },
    venue: "ملعب الأولمبيكو - روما",
    channels: ["AD Sports Premium 1", "DAZN"],
  },

  // 16:30 القاهرة — الدوري الألماني
  {
    slug: "union-berlin-vs-borussia-dortmund",
    competition: "bundesliga",
    kickoff: "2026-10-17T13:30:00.000Z",
    round: "الجولة 7",
    home: { name: "يونيون برلين", nameEn: "Union Berlin", logo: ss("45ab4c846b0d4df5b002c571b16112dc.png") },
    away: { name: "بوروسيا دورتموند", nameEn: "Borussia Dortmund", logo: fd(4) },
    venue: "ملعب أن دير ألتن فورشتراي - برلين",
    channels: ["beIN SPORTS", "Sky Sport"],
  },
  {
    slug: "hamburger-sv-vs-stuttgart",
    competition: "bundesliga",
    kickoff: "2026-10-17T13:30:00.000Z",
    round: "الجولة 7",
    home: { name: "هامبورغ", nameEn: "Hamburger SV", logo: ss("90f52b30fbdf2ac568ca1d48c07f2bc3.png") },
    away: { name: "شتوتغارت", nameEn: "VfB Stuttgart", logo: fd(10) },
    venue: "فولكس بارك شتاديون - هامبورغ",
    channels: ["beIN SPORTS", "Sky Sport"],
  },
  {
    slug: "schalke-04-vs-mainz-05",
    competition: "bundesliga",
    kickoff: "2026-10-17T13:30:00.000Z",
    round: "الجولة 7",
    home: { name: "شالكه", nameEn: "Schalke 04", logo: ss("4533ab7ef9ad5e53c981f7ea7bea7033.png") },
    away: { name: "ماينز", nameEn: "Mainz 05", logo: ss("25df2ab8d6c975b4218480a23ace9285.png") },
    venue: "فيلتينس أرينا - غيلسنكيرشن",
    channels: ["beIN SPORTS", "Sky Sport"],
  },
  {
    slug: "werder-bremen-vs-paderborn",
    competition: "bundesliga",
    kickoff: "2026-10-17T13:30:00.000Z",
    round: "الجولة 7",
    home: { name: "فيردر بريمن", nameEn: "Werder Bremen", logo: fd(12) },
    away: { name: "بادربورن", nameEn: "SC Paderborn 07", logo: ss("7c8c3c50966c793eba910e18659759a1.png") },
    venue: "فيسر شتاديون - بريمن",
    channels: ["beIN SPORTS", "Sky Sport"],
  },
  {
    slug: "elversberg-vs-augsburg",
    competition: "bundesliga",
    kickoff: "2026-10-17T13:30:00.000Z",
    round: "الجولة 7",
    home: { name: "إلفيرسبيرغ", nameEn: "SV 07 Elversberg", logo: ss("20f905fb0975e88482cf157ad9da4874.png") },
    away: { name: "أوغسبورغ", nameEn: "FC Augsburg", logo: ss("db4411a3c4ce1d0f092f5b9d1df08664.png") },
    venue: "أورسافارم أرينا - شبيسن إلفيرسبيرغ",
    channels: ["beIN SPORTS", "Sky Sport"],
  },

  // 19:30 القاهرة — الدوري الألماني
  {
    slug: "bayern-munich-vs-rb-leipzig",
    competition: "bundesliga",
    kickoff: "2026-10-17T16:30:00.000Z",
    round: "الجولة 7",
    home: { name: "بايرن ميونخ", nameEn: "Bayern München", logo: fd(5) },
    away: { name: "لايبزيغ", nameEn: "RB Leipzig", logo: ss("c166a220bf20977df2bd82fc067696f5.png") },
    venue: "أليانز أرينا - ميونخ",
    channels: ["beIN SPORTS 5", "Sky Sport"],
  },

  // 18:15 القاهرة — الدوري الفرنسي
  {
    slug: "strasbourg-vs-paris-saint-germain",
    competition: "ligue1",
    kickoff: "2026-10-17T15:15:00.000Z",
    round: "الجولة 8",
    home: { name: "ستراسبورغ", nameEn: "RC Strasbourg Alsace", logo: ss("998db478bf7c06d5817bf846987a0d0a.png") },
    away: { name: "باريس سان جيرمان", nameEn: "Paris Saint-Germain", logo: fd(524) },
    venue: "ملعب لا مينو - ستراسبورغ",
    channels: ["beIN SPORTS 4", "DAZN"],
  },

  // 21:45 القاهرة — الدوري الفرنسي
  {
    slug: "lille-vs-brest",
    competition: "ligue1",
    kickoff: "2026-10-17T18:45:00.000Z",
    round: "الجولة 8",
    home: { name: "ليل", nameEn: "LOSC Lille", logo: ss("28e94925fdcc848f86a544a1cedcceed.png") },
    away: { name: "بريست", nameEn: "Stade Brestois 29", logo: ss("bb7e6346a3860008e4ff266ba3b655e8.png") },
    venue: "ملعب بيير موروا - ليل",
    channels: ["beIN SPORTS 4", "DAZN"],
  },
  {
    slug: "troyes-vs-lens",
    competition: "ligue1",
    kickoff: "2026-10-17T18:45:00.000Z",
    round: "الجولة 8",
    home: { name: "تروا", nameEn: "Troyes", logo: ss("951a522c131e8d2a0a32185858ba6300.png") },
    away: { name: "لانس", nameEn: "RC Lens", logo: fd(546) },
    venue: "ملعب دي لوب - تروا",
    channels: ["beIN SPORTS", "DAZN"],
  },

  // 18:40 القاهرة — دوري روشن السعودي
  {
    slug: "neom-sc-vs-al-ettifaq",
    competition: "sau",
    kickoff: "2026-10-17T15:40:00.000Z",
    round: "الجولة 6",
    home: { name: "نيوم", nameEn: "NEOM Sports Club", logo: ss("e5516d35314acec9169f33834a199842.png") },
    away: { name: "الاتفاق", nameEn: "Al Ettifaq", logo: tsd("beunbx1697201725") },
    venue: "مدينة الملك خالد الرياضية - تبوك",
    channels: ["SSC Sports", "Shahid VIP"],
  },

  // 21:00 القاهرة — دوري روشن السعودي
  {
    slug: "al-diraiyah-vs-al-taawoun",
    competition: "sau",
    kickoff: "2026-10-17T18:00:00.000Z",
    round: "الجولة 6",
    home: { name: "الدرعية", nameEn: "Diraiyah", logo: ss("ecb7f0a3b58c3e6c3e6f42b8be226e20.png") },
    away: { name: "التعاون", nameEn: "Al Taawoun", logo: tsd("rlsmp91646835052") },
    venue: "ملعب الأمير تركي بن عبدالعزيز - الرياض",
    channels: ["SSC Sports", "Shahid VIP"],
  },

  // 16:05 القاهرة — دوري الإمارات
  {
    slug: "al-nasr-dubai-vs-hatta",
    competition: "uae",
    kickoff: "2026-10-17T13:05:00.000Z",
    round: "الجولة 6",
    home: { name: "النصر الإماراتي", nameEn: "Al-Nasr Dubai", logo: ss("5e5f56f16382d66ff8bcdb20bd309169.png") },
    away: { name: "حتا", nameEn: "Hatta", logo: ss("bb546c302434af47cf61e8ae3fd53102.png") },
    venue: "استاد آل مكتوم - دبي",
    channels: ["ADTV", "Dubai Sports"],
  },

  // 18:45 القاهرة — دوري الإمارات
  {
    slug: "shabab-al-ahli-vs-al-ain",
    competition: "uae",
    kickoff: "2026-10-17T15:45:00.000Z",
    round: "الجولة 6",
    home: { name: "شباب الأهلي", nameEn: "Shabab Al Ahli", logo: ss("05e87b1dbb904915a4a97fc095b73d20.png") },
    away: { name: "العين", nameEn: "Al Ain", logo: tsd("0w2bk51747334688") },
    venue: "استاد راشد - دبي",
    channels: ["ADTV", "Dubai Sports"],
  },

  // 17:30 القاهرة — دوري نجوم QNB
  {
    slug: "al-sailiya-vs-qatar-sc",
    competition: "qatar",
    kickoff: "2026-10-17T14:30:00.000Z",
    round: "الجولة 7",
    home: { name: "السيلية", nameEn: "Al-Sailiya SC", logo: ss("d1abf15eb401638c8bfd12c8b4606f66.png") },
    away: { name: "نادي قطر", nameEn: "Qatar SC", logo: ss("e17b91a2f24fb83448c42da816708785.png") },
    venue: "استاد حمد بن خليفة - الدوحة",
    channels: ["beIN SPORTS", "Alkass"],
  },

  // 19:45 القاهرة — دوري نجوم QNB
  {
    slug: "lusail-vs-al-shamal",
    competition: "qatar",
    kickoff: "2026-10-17T16:45:00.000Z",
    round: "الجولة 7",
    home: { name: "لوسيل", nameEn: "Lusail City FC", logo: ss("4ffc7d1c2110bf73bbb60224d33cb774.png") },
    away: { name: "الشمال", nameEn: "Al-Shamal SC", logo: ss("af47207f36a49c89502312138e54f6a7.png") },
    venue: "استاد الخور - الخور",
    channels: ["beIN SPORTS", "Alkass"],
  },

  // 19:00 القاهرة — الدوري المغربي الاحترافي
  {
    slug: "codm-meknes-vs-union-touarga",
    competition: "botola",
    kickoff: "2026-10-17T16:00:00.000Z",
    round: "الجولة 6",
    home: { name: "النادي المكناسي", nameEn: "CODM Meknes", logo: ss("6b992da9528f0bc780cb842e291ba313.png") },
    away: { name: "اتحاد تواركة", nameEn: "Union Touarga Rabat", logo: ss("01d255de45c5cd372b12b94025e7b770.png") },
    venue: "الملعب الشرفي - مكناس",
    channels: ["Arryadia"],
  },

  // 23:00 القاهرة — الدوري المغربي الاحترافي
  {
    slug: "difaa-el-jadidi-vs-moghreb-tetouan",
    competition: "botola",
    kickoff: "2026-10-17T20:00:00.000Z",
    round: "الجولة 6",
    home: { name: "الدفاع الحسني الجديدي", nameEn: "Difaa Hassani Jadidi", logo: ss("ff72f737712274ec5124e6da29814c45.png") },
    away: { name: "المغرب التطواني", nameEn: "Moghreb Tetouan", logo: ss("5574d954eb871121c52d7b9f52a0d2c6.png") },
    venue: "ملعب العبدي - الجديدة",
    channels: ["Arryadia"],
  },

  // 16:30 القاهرة — الدوري التونسي للمحترفين
  {
    slug: "es-hamam-sousse-vs-us-ben-guerdane",
    competition: "tunisia",
    kickoff: "2026-10-17T13:30:00.000Z",
    round: "الجولة 6",
    home: { name: "أمل حمام سوسة", nameEn: "ES Hamam-Sousse", logo: ss("1feb4cdda5aafe2a48cbe27544cd8e4b.jpg") },
    away: { name: "اتحاد بن قردان", nameEn: "US Ben Guerdane", logo: ss("d839e96405fbc203b0302ec5bb1401ed.png") },
    venue: "ملعب بوعلي لحوار - حمام سوسة",
    channels: ["Watania 1"],
  },

  // 15:00 القاهرة — دوري أبطال أفريقيا
  {
    slug: "cffa-vs-young-africans",
    competition: "cafcl",
    kickoff: "2026-10-17T12:00:00.000Z",
    round: "الجولة 2",
    home: { name: "سي إف إف إيه", nameEn: "CFFA", logo: ss("f329e557da9af06c7f8fb5a6fdb863dc.png") },
    away: { name: "يانغ أفريكانز", nameEn: "Young Africans", logo: ss("e1fa3847380e77168d3379e68f080128.png") },
    venue: "ملعب باريا - أنتاناناريفو",
    channels: ["beIN SPORTS"],
  },

  // 16:00 القاهرة — دوري أبطال أفريقيا
  {
    slug: "tp-mazembe-vs-club-africain",
    competition: "cafcl",
    kickoff: "2026-10-17T13:00:00.000Z",
    round: "الجولة 2",
    home: { name: "تي بي مازيمبي", nameEn: "TP Mazembe", logo: ss("99edabfb372f6ed13e1499ab2cfc21aa.jpg") },
    away: { name: "النادي الأفريقي", nameEn: "Club Africain", logo: ss("3b29380156a27af1898ec324a1b19634.png") },
    venue: "ملعب مازيمبي - لوبومباشي",
    channels: ["beIN SPORTS", "Watania 1"],
  },
  {
    slug: "african-stars-vs-orlando-pirates",
    competition: "cafcl",
    kickoff: "2026-10-17T13:00:00.000Z",
    round: "الجولة 2",
    home: { name: "أفريكان ستارز", nameEn: "African Stars Windhoek", logo: ss("8632f90cb9700a034bc52fed61313bf8.png") },
    away: { name: "أورلاندو بايرتس", nameEn: "Orlando Pirates", logo: ss("2e8e6c87d106649ed8f888a6da0422ba.png") },
    venue: "ملعب الاستقلال - ويندهوك",
    channels: ["beIN SPORTS", "SuperSport"],
  },

  // 18:00 القاهرة — دوري أبطال أفريقيا
  {
    slug: "15-de-agosto-vs-simba-sc",
    competition: "cafcl",
    kickoff: "2026-10-17T15:00:00.000Z",
    round: "الجولة 2",
    home: { name: "15 دي أغوستو", nameEn: "15 de Agosto", logo: ss("0b8dd06e0c265f063f7d651caae29761.png") },
    away: { name: "سيمبا التنزاني", nameEn: "Simba Sports Club", logo: ss("73e1362b951b013e2551d2e012041800.png") },
    venue: "ملعب مالابو الجديد - مالابو",
    channels: ["beIN SPORTS"],
  },

  // 19:00 القاهرة — دوري أبطال أفريقيا
  {
    slug: "san-pedro-vs-fc-nouadhibou",
    competition: "cafcl",
    kickoff: "2026-10-17T16:00:00.000Z",
    round: "الجولة 2",
    home: { name: "سان بيدرو", nameEn: "San Pedro FC", logo: ss("3d38d33a17cb453cbfb5381fb30979fb.png") },
    away: { name: "نواذيبو الموريتاني", nameEn: "FC Nouadhibou", logo: ss("67256285f216103ea32ac92ea66cc6e3.jfif") },
    venue: "ملعب لوران بوكو - سان بيدرو",
    channels: ["beIN SPORTS"],
  },

  // 16:00 القاهرة — كأس الكونفدرالية الأفريقية
  {
    slug: "red-arrows-vs-kaizer-chiefs",
    competition: "cafcc",
    kickoff: "2026-10-17T13:00:00.000Z",
    round: "الجولة 2",
    home: { name: "ريد أروز", nameEn: "Red Arrows", logo: ss("875bfa7c4baf2f5f10f318c28865a345.png") },
    away: { name: "كايزر تشيفز", nameEn: "Kaizer Chiefs", logo: ss("96ce3e75565bf1ed7689219e50b755cc.png") },
    venue: "ملعب الأبطال الوطني - لوساكا",
    channels: ["beIN SPORTS", "SuperSport"],
  },

  // 17:30 القاهرة — كأس الكونفدرالية الأفريقية
  {
    slug: "es-zarzis-vs-as-real-bamako",
    competition: "cafcc",
    kickoff: "2026-10-17T14:30:00.000Z",
    round: "الجولة 2",
    home: { name: "الترجي الجرجيسي", nameEn: "Esperance Sportive Zarzis", logo: ss("96dad66eddfa72ce11b1559b450388ac.png") },
    away: { name: "ريال باماكو", nameEn: "AS Real Bamako", logo: ss("df94cb238e2f7ac5bfeb0a3701a0271e.png") },
    venue: "ملعب الجليدي - جرجيس",
    channels: ["beIN SPORTS", "Watania 1"],
  },

  // 19:00 القاهرة — كأس الكونفدرالية الأفريقية
  {
    slug: "rayon-sports-vs-black-bulls",
    competition: "cafcc",
    kickoff: "2026-10-17T16:00:00.000Z",
    round: "الجولة 2",
    home: { name: "رايون سبورتس", nameEn: "Rayon Sports FC", logo: ss("7c860f3dc3dabf1f765e22b5925f840f.png") },
    away: { name: "بلاك بولز", nameEn: "Black Bulls", logo: ss("c950ccb343936edc255cdfd7a123320a.png") },
    venue: "ملعب أماهورو - كيغالي",
    channels: ["beIN SPORTS"],
  },
  {
    slug: "academie-de-fad-vs-cs-sfaxien",
    competition: "cafcc",
    kickoff: "2026-10-17T16:00:00.000Z",
    round: "الجولة 2",
    home: { name: "أكاديمية فاد", nameEn: "Academie de FAD", logo: ss("a908b981566fdc8c479986db8e3fee17.png") },
    away: { name: "النادي الصفاقسي", nameEn: "CS Sfaxien", logo: ss("419779fb131ca2e6f4db1e8cb81fbbbb.png") },
    venue: "ملعب فيليكس هوفويت بواني - أبيدجان",
    channels: ["beIN SPORTS", "Watania 1"],
  },
  {
    slug: "co-korhogo-vs-as-far-rabat",
    competition: "cafcc",
    kickoff: "2026-10-17T16:00:00.000Z",
    round: "الجولة 2",
    home: { name: "كورهوغو الإيفواري", nameEn: "CO Korhogo", logo: ss("03358137912e2bf6e69498b2f4667e3c.png") },
    away: { name: "الجيش الملكي المغربي", nameEn: "AS FAR Rabat", logo: ss("cded7b7cce01069ad7d13ebf14a03723.png") },
    venue: "ملعب أمادو غون كوليبالي - كورهوغو",
    channels: ["beIN SPORTS", "Arryadia"],
  },

  // 20:00 القاهرة — كأس الكونفدرالية الأفريقية
  {
    slug: "as-douanes-nouakchott-vs-cr-belouizdad",
    competition: "cafcc",
    kickoff: "2026-10-17T17:00:00.000Z",
    round: "الجولة 2",
    home: { name: "الجمارك الموريتاني", nameEn: "AS Douanes Nouakchott", logo: ss("5ece94af81d685e9ed0852e65f3c0731.png") },
    away: { name: "شباب بلوزداد", nameEn: "CR Belouizdad", logo: ss("005354bbbc335bf27e951685ad852b24.png") },
    venue: "ملعب شيخا ولد بيديا - نواكشوط",
    channels: ["beIN SPORTS"],
  },

  // 17:30 القاهرة — الدوري الهولندي
  {
    slug: "ado-den-haag-vs-psv-eindhoven",
    competition: "eredivisie",
    kickoff: "2026-10-17T14:30:00.000Z",
    round: "الجولة 9",
    home: { name: "أدو دين هاغ", nameEn: "ADO Den Haag", logo: ss("3dbce6bb7b1adc861642a7a1fc9b3796.png") },
    away: { name: "آيندهوفن", nameEn: "PSV Eindhoven", logo: fd(674) },
    venue: "ملعب كارس جينز - لاهاي",
    channels: ["ESPN"],
  },

  // 21:00 القاهرة — الدوري الهولندي
  {
    slug: "sc-telstar-vs-feyenoord",
    competition: "eredivisie",
    kickoff: "2026-10-17T18:00:00.000Z",
    round: "الجولة 9",
    home: { name: "تيلستار", nameEn: "SC Telstar", logo: ss("f2e98454cf2fc81dea92c1401521eac1.png") },
    away: { name: "فينورد", nameEn: "Feyenoord", logo: fd(675) },
    venue: "ملعب بوكوفامير - فيلسن",
    channels: ["ESPN"],
  },

  // 22:00 القاهرة — الدوري الهولندي
  {
    slug: "sparta-rotterdam-vs-willem-ii",
    competition: "eredivisie",
    kickoff: "2026-10-17T19:00:00.000Z",
    round: "الجولة 9",
    home: { name: "سبارتا روتردام", nameEn: "Sparta Rotterdam", logo: ss("73a60eae399442123eeb6f90b70cee8e.png") },
    away: { name: "فيلم الثاني", nameEn: "Willem II", logo: ss("7b10a020a3acd1ed95d783a1dfa3498e.png") },
    venue: "ملعب هيت كاستيل - روتردام",
    channels: ["ESPN"],
  },

  // 14:30 القاهرة — دوري البطولة الإنجليزية
  {
    slug: "watford-vs-charlton-athletic",
    competition: "elc",
    kickoff: "2026-10-17T11:30:00.000Z",
    round: "الجولة 10",
    home: { name: "واتفورد", nameEn: "Watford", logo: ss("31f7d5503f385d972d51ec447809a8a4.png") },
    away: { name: "تشارلتون أثليتيك", nameEn: "Charlton Athletic", logo: ss("c6a2a1ae9f05aeb030cd7578e4614386.png") },
    venue: "فيكاريج رود - واتفورد",
    channels: ["Sky Sports"],
  },
  {
    slug: "middlesbrough-vs-cardiff-city",
    competition: "elc",
    kickoff: "2026-10-17T11:30:00.000Z",
    round: "الجولة 10",
    home: { name: "ميدلزبره", nameEn: "Middlesbrough", logo: ss("3abf20ec43524ed39849567319ee666a.png") },
    away: { name: "كارديف سيتي", nameEn: "Cardiff City", logo: ss("96e93477bd9f240151e87ec723cdf945.png") },
    venue: "ملعب ريفرسايد - ميدلزبره",
    channels: ["Sky Sports"],
  },

  // 17:00 القاهرة — دوري البطولة الإنجليزية
  {
    slug: "bristol-city-vs-sheffield-united",
    competition: "elc",
    kickoff: "2026-10-17T14:00:00.000Z",
    round: "الجولة 10",
    home: { name: "بريستول سيتي", nameEn: "Bristol City", logo: ss("e76b7c07aa13158e4041c101a87578dc.png") },
    away: { name: "شيفيلد يونايتد", nameEn: "Sheffield United", logo: ss("008437c93501963e6ca1b2450994007a.png") },
    venue: "أشتون غيت - بريستول",
    channels: ["Sky Sports"],
  },
  {
    slug: "norwich-city-vs-portsmouth",
    competition: "elc",
    kickoff: "2026-10-17T14:00:00.000Z",
    round: "الجولة 10",
    home: { name: "نورويتش سيتي", nameEn: "Norwich City", logo: ss("86e6dba4cdc98b1dda1d25ea7d9eebfe.png") },
    away: { name: "بورتسموث", nameEn: "Portsmouth", logo: ss("2f360e96a024fd54255d0ed941e9075e.png") },
    venue: "كارو رود - نورويتش",
    channels: ["Sky Sports"],
  },
  {
    slug: "southampton-vs-bolton-wanderers",
    competition: "elc",
    kickoff: "2026-10-17T14:00:00.000Z",
    round: "الجولة 10",
    home: { name: "ساوثهامبتون", nameEn: "Southampton", logo: ss("4623d3fa1cda20d1f289dce9dc803527.png") },
    away: { name: "بولتون واندررز", nameEn: "Bolton Wanderers", logo: ss("2c3f4f15f3330c4ea9ea9638ae5fb9ce.png") },
    venue: "سانت ميريز - ساوثهامبتون",
    channels: ["Sky Sports"],
  },
  {
    slug: "swansea-city-vs-west-ham-united",
    competition: "elc",
    kickoff: "2026-10-17T14:00:00.000Z",
    round: "الجولة 10",
    home: { name: "سوانزي سيتي", nameEn: "Swansea City", logo: ss("54d8cca610fda7b60925116c3b2aacdb.png") },
    away: { name: "وست هام", nameEn: "West Ham United", logo: fd(563) },
    venue: "ملعب سوانزي دوت كوم - سوانزي",
    channels: ["beIN SPORTS", "Sky Sports"],
  },

  // 16:00 القاهرة — الدوري التركي الممتاز
  {
    slug: "genclerbirligi-vs-galatasaray",
    competition: "turkey",
    kickoff: "2026-10-17T13:00:00.000Z",
    round: "الجولة 9",
    home: { name: "غينتشلاربيرليغي", nameEn: "Genclerbirligi", logo: ss("ec111e88997dce5a5f76c26b8e85d7f3.png") },
    away: { name: "غلطة سراي", nameEn: "Galatasaray", logo: ss("fbcf002c8d6dd34813fa2b3a4cc9b04c.png") },
    venue: "ملعب إريامان - أنقرة",
    channels: ["beIN SPORTS Turkey"],
  },

  // 19:00 القاهرة — الدوري التركي الممتاز
  {
    slug: "fenerbahce-vs-alanyaspor",
    competition: "turkey",
    kickoff: "2026-10-17T16:00:00.000Z",
    round: "الجولة 9",
    home: { name: "فنربخشة", nameEn: "Fenerbahce", logo: ss("dff00f1fd4a7dd2feac000b462416867.png") },
    away: { name: "ألانيا سبور", nameEn: "Alanyaspor", logo: ss("0688ed133dadf5f09bb94c8414ec5565.png") },
    venue: "ملعب شوكرو سراج أوغلو - إسطنبول",
    channels: ["beIN SPORTS Turkey"],
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
