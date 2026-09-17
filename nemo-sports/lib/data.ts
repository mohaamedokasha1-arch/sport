/* ─────────────────────────────────────────────────────────────
   NEMO Sports · Fixtures, live state, news, standings, broadcast
   All times are computed relative to "now" so the demo always has
   live matches, today's games and tomorrow's fixtures.
   ───────────────────────────────────────────────────────────── */

import { competitions, TEAMS_ALL, type Competition, type Team } from "./core-data";
import { demoContentVisible } from "./site";

/**
 * Demo-content gate (§Instruction 10).
 *
 * Everything below this line is an offline demo dataset whose times are
 * computed relative to "now" so the product can be developed and demoed with
 * zero provider keys. It is ONLY exposed when `demoContentVisible()` allows
 * it (development/preview, or an explicit demo deployment). In production
 * every export resolves to an empty dataset, so pages render honest
 * "data unavailable" states instead of fabricated matches, scores, news and
 * statistics — and nothing fake can be indexed or listed in the sitemap.
 */
const SHOW_DEMO = demoContentVisible();
const EMPTY_MATCHES: Match[] = [];

export { competitions, teams, players, sports } from "./core-data";
export type { Competition, Team, Player, Sport } from "./core-data";

export type MatchStatus =
  | "UPCOMING"
  | "LIVE"
  | "HT"
  | "FINISHED"
  | "POSTPONED"
  | "CANCELLED"
  | "SUSPENDED";

export type MatchEvent = {
  id: string;
  minute: number;
  period?: string;
  type:
    | "goal"
    | "own-goal"
    | "penalty"
    | "missed-penalty"
    | "yellow"
    | "red"
    | "second-yellow"
    | "sub-in"
    | "sub-out"
    | "injury"
    | "var"
    | "period";
  side: "home" | "away" | "neutral";
  player: string;
  detail?: string;
};

export type StatRow = {
  key: string;
  label: string;
  home: number | string;
  away: number | string;
  /** higher value wins the bar (null = neutral) */
  better?: "high" | "low" | null;
  max?: number;
};

export type LineupPlayer = { n?: number; name: string; pos: string };

export type Lineup = {
  side: "home" | "away";
  formation?: string;
  coach: string;
  groups: { title: string; players: LineupPlayer[] }[];
};

export type Broadcast = {
  provider: string;
  license: "embed" | "external" | "multiple";
  regions: string[];
  status: "LIVE_NOW" | "COMING_SOON" | "FINISHED";
  url: string;
  geoBlocked: boolean;
  note?: string;
};

export type Match = {
  id: string;
  slug: string;
  sport: string;
  competition: string;
  round?: string;
  home: string;
  away: string;
  /** ISO kickoff */
  kickoff: string;
  status: MatchStatus;
  homeScore: number;
  awayScore: number;
  /** live minute / period marker, used by the live engine */
  clock: string;
  minute: number;
  venue?: string;
  referee?: string;
  attendance?: number;
  featured?: boolean;
  viewers?: number;
  events: MatchEvent[];
  stats: StatRow[];
  lineups: Lineup[];
  /** football sets/quarters/sets breakdown per period */
  periods?: { label: string; home: number; away: number }[];
  broadcast?: Broadcast;
};

/* ── helpers ──────────────────────────────────────────────── */

/** now rounded down to the minute */
export const nowRef = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  return d;
};

/** ISO string for `day` days from today at `hour:minute` local time. */
export function at(day: number, hour: number, minute = 0): string {
  const d = nowRef();
  d.setDate(d.getDate() + day);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** ISO string for `mins` minutes before/after right now. */
export function rel(mins: number): string {
  const d = nowRef();
  d.setMinutes(d.getMinutes() + mins);
  return d.toISOString();
}

let idSeq = 100;
type MatchInput = Partial<Match> & {
  sport: string;
  competition: string;
  home: string;
  away: string;
  kickoff: string;
  status: MatchStatus;
  homeScore?: number;
  awayScore?: number;
  clock?: string;
  minute?: number;
};

export function m(i: MatchInput): Match {
  // Uses the RAW demo teams (TEAMS_ALL) — the public `teams` export is gated
  // and empty in production, but the factory must still be able to build the
  // demo dataset for development/preview.
  const home = TEAMS_ALL.find((x) => x.slug === i.home)!;
  const away = TEAMS_ALL.find((x) => x.slug === i.away)!;
  const comp = competitions.find((x) => x.slug === i.competition)!;
  const d = new Date(i.kickoff);
  const datePart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const id = `M${++idSeq}`;
  return {
    id,
    slug: `${home.slug}-vs-${away.slug}-${datePart}`,
    sport: i.sport,
    competition: i.competition,
    round: i.round ?? "الجولة 24",
    home: i.home,
    away: i.away,
    kickoff: i.kickoff,
    status: i.status,
    homeScore: i.homeScore ?? 0,
    awayScore: i.awayScore ?? 0,
    clock: i.clock ?? "",
    minute: i.minute ?? 0,
    venue: i.venue ?? home.stadium,
    referee: i.referee,
    attendance: i.attendance,
    featured: i.featured,
    viewers: i.viewers,
    events: i.events ?? [],
    stats: i.stats ?? defaultStats(i.sport, i.homeScore ?? 0, i.awayScore ?? 0),
    lineups: i.lineups ?? defaultLineups(home, away, comp.sport),
    periods: i.periods,
    broadcast: i.broadcast,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

function defaultStats(sport: string, hs: number, as: number): StatRow[] {
  const seed = (hs + 1) * 3 + (as + 1) * 5;
  const n = (base: number) => base + (seed % 7);
  switch (sport) {
    case "basketball":
      return [
        { key: "fg2", label: "تسديدات ناجحة من نقطتين", home: n(24), away: n(22), better: "high" },
        { key: "fg3", label: "ثلاثيات ناجحة", home: n(9), away: n(8), better: "high" },
        { key: "ft", label: "رميات حرة", home: n(15), away: n(14), better: "high" },
        { key: "reb", label: "متابعات", home: n(41), away: n(39), better: "high" },
        { key: "ast", label: "تمريرات حاسمة", home: n(24), away: n(21), better: "high" },
        { key: "stl", label: "استخلاصات", home: n(7), away: n(6), better: "high" },
        { key: "tov", label: "كرات ضائعة", home: n(11), away: n(13), better: "low" },
        { key: "foul", label: "أخطاء شخصية", home: n(18), away: n(20), better: "low" },
      ];
    case "tennis":
      return [
        { key: "ace", label: "إرسالات ساحقة", home: n(7), away: n(5), better: "high" },
        { key: "df", label: "أخطاء مزدوجة", home: 2 + (seed % 3), away: 3 + (seed % 2), better: "low" },
        { key: "first", label: "نسبة الإرسال الأول", home: `${62 + (seed % 8)}%`, away: `${58 + (seed % 9)}%`, better: "high" },
        { key: "bp", label: "نقاط كسر الإرسال", home: 3 + (seed % 4), away: 2 + (seed % 3), better: "high" },
        { key: "ue", label: "أخطاء غير مقصودة", home: 12 + (seed % 6), away: 15 + (seed % 5), better: "low" },
      ];
    case "volleyball":
      return [
        { key: "atk", label: "هجمات ناجحة", home: n(38), away: n(35), better: "high" },
        { key: "blk", label: "حوائط صد", home: n(9), away: n(7), better: "high" },
        { key: "srv", label: "إرسالات ساحقة", home: n(5), away: n(4), better: "high" },
        { key: "rec", label: "استقبال ناجح", home: `${58 + (seed % 9)}%`, away: `${54 + (seed % 10)}%`, better: "high" },
      ];
    case "handball":
      return [
        { key: "shots", label: "تسديدات على المرمى", home: n(44), away: n(41), better: "high" },
        { key: "saves", label: "تصديات الحارس", home: n(11), away: n(9), better: "high" },
        { key: "seven", label: "رميات 7 أمتار", home: n(4), away: n(3), better: "high" },
        { key: "two", label: "إيقافات دقيقتين", home: 2 + (seed % 3), away: 3 + (seed % 2), better: "low" },
      ];
    case "baseball":
      return [
        { key: "hits", label: "ضربات ناجحة", home: n(9), away: n(7), better: "high" },
        { key: "runs", label: "الأشواط", home: hs, away: as, better: "high" },
        { key: "hr", label: "هوم ران", home: 1 + (seed % 2), away: seed % 2, better: "high" },
        { key: "err", label: "أخطاء", home: seed % 2, away: 1 + (seed % 2), better: "low" },
      ];
    case "hockey":
      return [
        { key: "sog", label: "تسديدات على المرمى", home: n(32), away: n(28), better: "high" },
        { key: "pim", label: "دقائق عقوبات", home: n(6), away: n(8), better: "low" },
        { key: "pp", label: "أهداف الزيادة العددية", home: 1 + (seed % 2), away: seed % 2, better: "high" },
        { key: "fo", label: "نسبة الفوز بالوجه", home: `${52 + (seed % 6)}%`, away: `${48 + (seed % 5)}%`, better: "high" },
      ];
    case "boxing":
      return [
        { key: "punches", label: "لكمات مسددة", home: n(320), away: n(298), better: "high" },
        { key: "landed", label: "لكمات مؤثرة", home: n(112), away: n(98), better: "high" },
        { key: "jab", label: "لكمات أمامية", home: n(64), away: n(58), better: "high" },
        { key: "power", label: "لكمات قوية", home: n(48), away: n(40), better: "high" },
      ];
    default:
      return [
        { key: "possession", label: "الاستحواذ", home: `${50 + (seed % 12)}%`, away: `${50 - (seed % 12)}%`, better: "high" },
        { key: "shots", label: "التسديدات", home: n(12), away: n(10), better: "high" },
        { key: "onTarget", label: "على المرمى", home: n(5), away: n(4), better: "high" },
        { key: "corners", label: "الركنيات", home: n(6), away: n(4), better: "high" },
        { key: "fouls", label: "الأخطاء", home: n(9), away: n(11), better: "low" },
        { key: "yellow", label: "بطاقات صفراء", home: 1 + (seed % 2), away: 2 + (seed % 2), better: "low" },
        { key: "passes", label: "دقة التمرير", home: `${82 + (seed % 8)}%`, away: `${78 + (seed % 9)}%`, better: "high" },
      ];
  }
}

function defaultLineups(home: Team, away: Team, sport: string): Lineup[] {
  if (sport === "tennis" || sport === "boxing") return [];
  const footballShape = sport === "football";
  const build = (side: Team, formation: string, names: string[]): Lineup => ({
    side: side === home ? "home" : "away",
    formation: footballShape ? formation : undefined,
    coach: side.coach ?? "—",
    groups: footballShape
      ? [
          { title: "حراسة المرمى", players: [{ n: 1, name: names[0], pos: "حارس" }] },
          {
            title: "الدفاع",
            players: names.slice(1, 5).map((name, i) => ({ n: 2 + i, name, pos: ["ظهير أيمن", "قلب دفاع", "قلب دفاع", "ظهير أيسر"][i] })),
          },
          {
            title: "الوسط",
            players: names.slice(5, 8).map((name, i) => ({ n: 6 + i, name, pos: ["محور", "وسط", "وسط مهاجم"][i] })),
          },
          {
            title: "الهجوم",
            players: names.slice(8, 11).map((name, i) => ({ n: 9 + i, name, pos: ["جناح أيمن", "مهاجم", "جناح أيسر"][i] })),
          },
        ]
      : [{ title: "التشكيلة الأساسية", players: names.slice(0, 5).map((name, i) => ({ n: i + 1, name, pos: "أساسي" })) }],
  });

  const starters = (side: Team) =>
    footballShape
      ? [
          `حارس ${side.short}`, `مدافع ${side.short} ١`, `مدافع ${side.short} ٢`, `مدافع ${side.short} ٣`,
          `مدافع ${side.short} ٤`, `وسط ${side.short} ١`, `وسط ${side.short} ٢`, `وسط ${side.short} ٣`,
          `جناح ${side.short} ١`, `مهاجم ${side.short}`, `جناح ${side.short} ٢`,
        ]
      : [`لاعب ${side.short} ١`, `لاعب ${side.short} ٢`, `لاعب ${side.short} ٣`, `لاعب ${side.short} ٤`, `لاعب ${side.short} ٥`];

  return [build(home, "4-3-3", starters(home)), build(away, "4-2-3-1", starters(away))];
}

/* ── live matches ─────────────────────────────────────────── */

const liveMatches_RAW: Match[] = [
  m({
    sport: "football", competition: "premier-league", home: "manchester-city", away: "liverpool",
    kickoff: rel(-63), status: "LIVE", homeScore: 1, awayScore: 2, clock: "63'", minute: 63,
    featured: true, viewers: 1_284_902, referee: "مايكل أوليفر", attendance: 61_474, round: "الجولة 24",
    broadcast: { provider: "beIN SPORTS", license: "external", regions: ["الشرق الأوسط", "شمال أفريقيا"], status: "LIVE_NOW", url: "https://www.beinsports.com", geoBlocked: true, note: "بث رسمي مرخّص عبر الناقل الحصري للمنطقة." },
    events: [
      { id: "e1", minute: 12, type: "goal", side: "away", player: "محمد صلاح", detail: "تمريرة حاسمة: سوبوسلاي" },
      { id: "e2", minute: 28, type: "goal", side: "home", player: "إيرلينغ هالاند", detail: "من ركلة جزاء" },
      { id: "e3", minute: 31, type: "yellow", side: "home", player: "رودري" },
      { id: "e4", minute: 44, type: "goal", side: "away", player: "كودي غاكبو", detail: "تسديدة من داخل المنطقة" },
      { id: "e5", minute: 45, type: "period", side: "neutral", player: "نهاية الشوط الأول" },
      { id: "e6", minute: 57, type: "sub-in", side: "home", player: "فيل فودين", detail: "بدلًا من جيريمي دوكو" },
      { id: "e7", minute: 61, type: "var", side: "neutral", player: "مراجعة تقنية الفيديو", detail: "لا توجد ركلة جزاء" },
      { id: "e8", minute: 74, type: "goal", side: "home", player: "فيل فودين", detail: "تسديدة من خارج المنطقة" },
      { id: "e9", minute: 81, type: "yellow", side: "away", player: "فيرجيل فان دايك" },
      { id: "e10", minute: 88, type: "goal", side: "away", player: "محمد صلاح", detail: "هجمة مرتدة سريعة" },
    ],
    periods: [{ label: "الشوط الأول", home: 1, away: 2 }],
  }),
  m({
    sport: "football", competition: "egyptian-league", home: "al-ahly", away: "zamalek",
    kickoff: rel(-29), status: "LIVE", homeScore: 1, awayScore: 0, clock: "29'", minute: 29,
    featured: true, viewers: 842_115, referee: "محمد معروف", attendance: 60_000, round: "الجولة 18",
    venue: "استاد القاهرة الدولي",
    broadcast: { provider: "أون سبورت", license: "external", regions: ["مصر", "الشرق الأوسط"], status: "LIVE_NOW", url: "https://www.onsport.tv", geoBlocked: false, note: "الناقل الرسمي للدوري المصري." },
    events: [
      { id: "e1", minute: 8, type: "yellow", side: "away", player: "محمود حمدي الونش" },
      { id: "e2", minute: 17, type: "goal", side: "home", player: "إمام عاشور", detail: "تمريرة حاسمة: محمد شريف" },
      { id: "e3", minute: 24, type: "injury", side: "away", player: "ناصر ماهر", detail: "خروج للعلاج ثم العودة" },
      { id: "e4", minute: 34, type: "goal", side: "home", player: "محمد شريف", detail: "رأسية من ركنية" },
      { id: "e5", minute: 41, type: "yellow", side: "home", player: "إمام عاشور" },
      { id: "e6", minute: 66, type: "goal", side: "away", player: "ناصر ماهر", detail: "تسديدة من حدود المنطقة" },
      { id: "e7", minute: 78, type: "missed-penalty", side: "home", player: "محمد شريف", detail: "تصدى لها الحارس" },
    ],
  }),
  m({
    sport: "basketball", competition: "nba", home: "boston-celtics", away: "la-lakers",
    kickoff: rel(-78), status: "LIVE", homeScore: 78, awayScore: 71, clock: "Q3 04:12", minute: 78,
    featured: true, viewers: 611_440, round: "الموسم المنتظم", venue: "تي دي غاردن",
    broadcast: { provider: "NBA League Pass", license: "embed", regions: ["العالم (باستثناء الولايات المتحدة)"], status: "LIVE_NOW", url: "https://www.nba.com/watch", geoBlocked: true },
    events: [
      { id: "e1", minute: 12, type: "period", side: "neutral", player: "نهاية الربع الأول", detail: "28 – 24" },
      { id: "e2", minute: 24, type: "period", side: "neutral", player: "نهاية الربع الثاني", detail: "52 – 47" },
      { id: "e3", minute: 33, type: "goal", side: "home", player: "جايسون تيتوم", detail: "ثلاثية" },
      { id: "e4", minute: 36, type: "injury", side: "away", player: "أنتوني ديفيس", detail: "كدمة في الركبة" },
    ],
    periods: [
      { label: "الربع 1", home: 28, away: 24 },
      { label: "الربع 2", home: 24, away: 23 },
      { label: "الربع 3", home: 26, away: 24 },
    ],
  }),
  m({
    sport: "tennis", competition: "atp-tour", home: "alcaraz", away: "sinner",
    kickoff: rel(-96), status: "LIVE", homeScore: 1, awayScore: 1, clock: "المجموعة 3", minute: 96,
    round: "نصف النهائي", viewers: 388_201,
    broadcast: { provider: "Tennis TV", license: "external", regions: ["العالم"], status: "LIVE_NOW", url: "https://www.tennistv.com", geoBlocked: false },
    events: [
      { id: "e1", minute: 41, type: "period", side: "home", player: "كارلوس ألكاراز يحسم المجموعة الأولى", detail: "6-4" },
      { id: "e2", minute: 82, type: "period", side: "away", player: "يانيك سينر يحسم المجموعة الثانية", detail: "7-6 (7-4)" },
    ],
    periods: [
      { label: "المجموعة 1", home: 6, away: 4 },
      { label: "المجموعة 2", home: 6, away: 7 },
    ],
  }),
  m({
    sport: "handball", competition: "egypt-handball", home: "ahly-handball", away: "zamalek-handball",
    kickoff: rel(-42), status: "LIVE", homeScore: 14, awayScore: 12, clock: "الشوط 2 · 12:40", minute: 42,
    round: "الجولة 14",
    events: [
      { id: "e1", minute: 30, type: "period", side: "neutral", player: "نهاية الشوط الأول", detail: "14 – 12" },
    ],
    periods: [{ label: "الشوط الأول", home: 14, away: 12 }],
  }),
];


export const liveMatches: Match[] = SHOW_DEMO ? liveMatches_RAW : EMPTY_MATCHES;
/* ── today · finished ─────────────────────────────────────── */

const finishedToday_RAW: Match[] = [
  m({ sport: "football", competition: "premier-league", home: "arsenal", away: "chelsea", kickoff: at(0, 14, 0), status: "FINISHED", homeScore: 2, awayScore: 1, clock: "انتهت", minute: 90, featured: true, viewers: 902_330, referee: "أنتوني تايلور", attendance: 60_704,
    events: [
      { id: "e1", minute: 19, type: "goal", side: "home", player: "بوكايو ساكا" },
      { id: "e2", minute: 52, type: "goal", side: "away", player: "كول بالمر", detail: "من ركلة جزاء" },
      { id: "e3", minute: 71, type: "goal", side: "home", player: "مارتن أوديغارد" },
      { id: "e4", minute: 84, type: "red", side: "away", player: "مويسيس كايسيدو" },
    ],
    broadcast: { provider: "Sky Sports", license: "external", regions: ["المملكة المتحدة"], status: "FINISHED", url: "https://www.skysports.com", geoBlocked: true },
  }),
  m({ sport: "football", competition: "egyptian-league", home: "pyramids", away: "al-masry", kickoff: at(0, 16, 30), status: "FINISHED", homeScore: 3, awayScore: 0, clock: "انتهت", minute: 90, attendance: 18_400,
    events: [
      { id: "e1", minute: 11, type: "goal", side: "home", player: "فيستون مايلي" },
      { id: "e2", minute: 47, type: "goal", side: "home", player: "إبراهيم عادل" },
      { id: "e3", minute: 79, type: "goal", side: "home", player: "رمضان صبحي" },
    ] }),
  m({ sport: "football", competition: "la-liga", home: "real-madrid", away: "athletic-bilbao", kickoff: at(0, 17, 0), status: "FINISHED", homeScore: 2, awayScore: 2, clock: "انتهت", minute: 90, attendance: 74_100,
    events: [
      { id: "e1", minute: 6, type: "goal", side: "away", player: "إيناكي ويليامز" },
      { id: "e2", minute: 33, type: "goal", side: "home", player: "كيليان مبابي" },
      { id: "e3", minute: 58, type: "goal", side: "home", player: "فينيسيوس جونيور" },
      { id: "e4", minute: 90, type: "goal", side: "away", player: "أويهان سانسيت", detail: "الوقت بدل الضائع" },
    ] }),
  m({ sport: "football", competition: "serie-a", home: "inter-milan", away: "juventus", kickoff: at(0, 19, 45), status: "FINISHED", homeScore: 1, awayScore: 1, clock: "انتهت", minute: 90, attendance: 71_200,
    events: [
      { id: "e1", minute: 26, type: "goal", side: "home", player: "لاوتارو مارتينيز" },
      { id: "e2", minute: 68, type: "penalty", side: "away", player: "دوسان فلاهوفيتش" },
    ] }),
  m({ sport: "basketball", competition: "nba", home: "denver-nuggets", away: "miami-heat", kickoff: at(0, 3, 0), status: "FINISHED", homeScore: 118, awayScore: 109, clock: "نهائي", minute: 48, attendance: 19_520,
    periods: [{ label: "الربع 1", home: 31, away: 27 }, { label: "الربع 2", home: 29, away: 25 }, { label: "الربع 3", home: 30, away: 28 }, { label: "الربع 4", home: 28, away: 29 }] }),
  m({ sport: "volleyball", competition: "volley-nations", home: "egypt-volley", away: "japan-volley", kickoff: at(0, 18, 0), status: "FINISHED", homeScore: 3, awayScore: 1, clock: "انتهت", minute: 0,
    periods: [{ label: "الشوط 1", home: 25, away: 21 }, { label: "الشوط 2", home: 22, away: 25 }, { label: "الشوط 3", home: 25, away: 19 }, { label: "الشوط 4", home: 25, away: 23 }] }),
  m({ sport: "baseball", competition: "mlb", home: "ny-yankees", away: "boston-redsox", kickoff: at(0, 2, 5), status: "FINISHED", homeScore: 5, awayScore: 3, clock: "نهائي", minute: 9, attendance: 44_120 }),
  m({ sport: "hockey", competition: "nhl", home: "boston-bruins", away: "toronto-maple", kickoff: at(0, 2, 0), status: "FINISHED", homeScore: 4, awayScore: 2, clock: "نهائي", minute: 3, attendance: 17_850 }),
];


export const finishedToday: Match[] = SHOW_DEMO ? finishedToday_RAW : EMPTY_MATCHES;
/* ── today · upcoming ─────────────────────────────────────── */

const upcomingToday_RAW: Match[] = [
  m({ sport: "football", competition: "premier-league", home: "manchester-united", away: "tottenham", kickoff: at(0, 21, 0), status: "UPCOMING", clock: "21:00", featured: true, viewers: 410_000, round: "الجولة 24",
    broadcast: { provider: "beIN SPORTS", license: "external", regions: ["الشرق الأوسط", "شمال أفريقيا"], status: "COMING_SOON", url: "https://www.beinsports.com", geoBlocked: true } }),
  m({ sport: "football", competition: "la-liga", home: "barcelona", away: "atletico-madrid", kickoff: at(0, 22, 0), status: "UPCOMING", clock: "22:00", featured: true, viewers: 512_000, round: "الجولة 24",
    broadcast: { provider: "DAZN", license: "external", regions: ["إسبانيا", "ألمانيا"], status: "COMING_SOON", url: "https://www.dazn.com", geoBlocked: true } }),
  m({ sport: "football", competition: "egyptian-league", home: "ismaily", away: "pharco", kickoff: at(0, 20, 0), status: "UPCOMING", clock: "20:00", round: "الجولة 18" }),
  m({ sport: "football", competition: "egyptian-league", home: "ceramica", away: "al-ittihad-alex", kickoff: at(0, 20, 0), status: "UPCOMING", clock: "20:00", round: "الجولة 18" }),
  m({ sport: "basketball", competition: "nba", home: "golden-state", away: "okc-thunder", kickoff: at(0, 23, 30), status: "UPCOMING", clock: "23:30", featured: true, round: "الموسم المنتظم",
    broadcast: { provider: "NBA League Pass", license: "embed", regions: ["العالم"], status: "COMING_SOON", url: "https://www.nba.com/watch", geoBlocked: false } }),
  m({ sport: "handball", competition: "handball-champions", home: "barcelona-handball", away: "kiel", kickoff: at(0, 21, 45), status: "UPCOMING", clock: "21:45", round: "الجولة 11" }),
  m({ sport: "hockey", competition: "nhl", home: "edmonton-oilers", away: "colorado-avalanche", kickoff: at(0, 23, 0), status: "UPCOMING", clock: "23:00", round: "الموسم المنتظم" }),
  m({ sport: "boxing", competition: "world-title-fights", home: "usyk", away: "dubois", kickoff: at(0, 23, 0), status: "UPCOMING", clock: "23:00", featured: true, round: "نزال بطولة العالم للوزن الثقيل",
    broadcast: { provider: "DAZN", license: "external", regions: ["العالم"], status: "COMING_SOON", url: "https://www.dazn.com", geoBlocked: false, note: "نزال موحّد على ألقاب الوزن الثقيل." } }),
];


export const upcomingToday: Match[] = SHOW_DEMO ? upcomingToday_RAW : EMPTY_MATCHES;
/* ── yesterday ────────────────────────────────────────────── */

const finishedYesterday_RAW: Match[] = [
  m({ sport: "football", competition: "premier-league", home: "newcastle", away: "aston-villa", kickoff: at(-1, 20, 0), status: "FINISHED", homeScore: 3, awayScore: 1, clock: "انتهت", minute: 90,
    events: [
      { id: "e1", minute: 14, type: "goal", side: "home", player: "ألكسندر إيزاك" },
      { id: "e2", minute: 38, type: "goal", side: "away", player: "أولي واتكينز" },
      { id: "e3", minute: 63, type: "goal", side: "home", player: "أنتوني جوردون" },
      { id: "e4", minute: 88, type: "goal", side: "home", player: "ألكسندر إيزاك" },
    ] }),
  m({ sport: "football", competition: "champions-league", home: "bayern-munich", away: "psg", kickoff: at(-1, 22, 0), status: "FINISHED", homeScore: 2, awayScore: 0, clock: "انتهت", minute: 90, featured: true,
    events: [
      { id: "e1", minute: 21, type: "goal", side: "home", player: "هاري كين" },
      { id: "e2", minute: 74, type: "goal", side: "home", player: "جمال موسيالا" },
    ],
    broadcast: { provider: "beIN SPORTS", license: "external", regions: ["الشرق الأوسط", "شمال أفريقيا"], status: "FINISHED", url: "https://www.beinsports.com", geoBlocked: true } }),
  m({ sport: "football", competition: "egyptian-league", home: "al-masry", away: "ceramica", kickoff: at(-1, 18, 0), status: "FINISHED", homeScore: 1, awayScore: 1, clock: "انتهت", minute: 90 }),
  m({ sport: "football", competition: "la-liga", home: "villarreal", away: "real-sociedad", kickoff: at(-1, 21, 0), status: "FINISHED", homeScore: 2, awayScore: 2, clock: "انتهت", minute: 90 }),
  m({ sport: "basketball", competition: "nba", home: "milwaukee-bucks", away: "new-york-knicks", kickoff: at(-1, 2, 0), status: "FINISHED", homeScore: 121, awayScore: 117, clock: "نهائي", minute: 48 }),
  m({ sport: "basketball", competition: "euroleague", home: "boston-celtics", away: "golden-state", kickoff: at(-1, 21, 0), status: "FINISHED", homeScore: 88, awayScore: 84, clock: "نهائي", minute: 40 }),
  m({ sport: "tennis", competition: "atp-tour", home: "zverev", away: "medvedev", kickoff: at(-1, 19, 0), status: "FINISHED", homeScore: 2, awayScore: 1, clock: "انتهت", minute: 0,
    periods: [{ label: "المجموعة 1", home: 6, away: 4 }, { label: "المجموعة 2", home: 3, away: 6 }, { label: "المجموعة 3", home: 7, away: 5 }] }),
  m({ sport: "volleyball", competition: "volley-nations", home: "brazil-volley", away: "poland-volley", kickoff: at(-1, 17, 0), status: "FINISHED", homeScore: 2, awayScore: 3, clock: "انتهت", minute: 0 }),
];


export const finishedYesterday: Match[] = SHOW_DEMO ? finishedYesterday_RAW : EMPTY_MATCHES;
/* ── tomorrow & later ─────────────────────────────────────── */

const upcomingNext_RAW: Match[] = [
  m({ sport: "football", competition: "champions-league", home: "real-madrid", away: "bayern-munich", kickoff: at(1, 22, 0), status: "UPCOMING", clock: "22:00", featured: true, round: "الجولة 7 · مرحلة الدوري",
    broadcast: { provider: "beIN SPORTS", license: "external", regions: ["الشرق الأوسط", "شمال أفريقيا"], status: "COMING_SOON", url: "https://www.beinsports.com", geoBlocked: true } }),
  m({ sport: "football", competition: "champions-league", home: "psg", away: "barcelona", kickoff: at(1, 22, 0), status: "UPCOMING", clock: "22:00", featured: true, round: "الجولة 7 · مرحلة الدوري" }),
  m({ sport: "football", competition: "premier-league", home: "liverpool", away: "manchester-city", kickoff: at(2, 18, 30), status: "UPCOMING", clock: "18:30", featured: true, round: "الجولة 25" }),
  m({ sport: "football", competition: "egyptian-league", home: "zamalek", away: "pyramids", kickoff: at(1, 20, 0), status: "UPCOMING", clock: "20:00", featured: true, round: "الجولة 19" }),
  m({ sport: "football", competition: "caf-champions-league", home: "al-ahly", away: "ismaily", kickoff: at(3, 21, 0), status: "UPCOMING", clock: "21:00", round: "الجولة 4 · دور المجموعات" }),
  m({ sport: "football", competition: "serie-a", home: "ac-milan", away: "inter-milan", kickoff: at(2, 21, 45), status: "UPCOMING", clock: "21:45", featured: true, round: "الجولة 24" }),
  m({ sport: "basketball", competition: "nba", home: "phoenix-suns", away: "dallas-mavericks", kickoff: at(1, 23, 0), status: "UPCOMING", clock: "23:00", round: "الموسم المنتظم" }),
  m({ sport: "tennis", competition: "atp-tour", home: "ritz", away: "djokovic", kickoff: at(1, 19, 0), status: "UPCOMING", clock: "19:00", round: "النهائي" }),
  m({ sport: "handball", competition: "egypt-handball", home: "zamalek-handball", away: "ahly-handball", kickoff: at(2, 20, 0), status: "UPCOMING", clock: "20:00", round: "الجولة 15" }),
  m({ sport: "volleyball", competition: "volley-nations", home: "usa-volley", away: "italy-volley", kickoff: at(2, 18, 0), status: "UPCOMING", clock: "18:00", round: "الجولة 9" }),
  m({ sport: "baseball", competition: "mlb", home: "la-dodgers", away: "sf-giants", kickoff: at(1, 4, 10), status: "UPCOMING", clock: "04:10", round: "الموسم المنتظم" }),
  m({ sport: "hockey", competition: "nhl", home: "ny-rangers", away: "vegas-golden", kickoff: at(1, 22, 0), status: "UPCOMING", clock: "22:00", round: "الموسم المنتظم" }),
];


export const upcomingNext: Match[] = SHOW_DEMO ? upcomingNext_RAW : EMPTY_MATCHES;
const postponed_RAW: Match[] = [
  m({ sport: "football", competition: "premier-league", home: "everton", away: "fulham", kickoff: at(0, 21, 30), status: "POSTPONED", clock: "مؤجلة", round: "الجولة 24" }),
  m({ sport: "football", competition: "egyptian-league", home: "west-ham", away: "brighton", kickoff: at(1, 19, 0), status: "CANCELLED", clock: "ملغاة", round: "الجولة 24" }),
];


export const postponed: Match[] = SHOW_DEMO ? postponed_RAW : EMPTY_MATCHES;
const allMatches_RAW: Match[] = [
  ...liveMatches,
  ...finishedToday,
  ...upcomingToday,
  ...finishedYesterday,
  ...upcomingNext,
  ...postponed,
];


export const allMatches: Match[] = SHOW_DEMO ? allMatches_RAW : EMPTY_MATCHES;
export const matchById = (id: string) => allMatches.find((x) => x.id === id);
export const matchBySlug = (slug: string) => allMatches.find((x) => x.slug === slug);
export const teamMatches = (slug: string) =>
  allMatches.filter((x) => x.home === slug || x.away === slug).sort((a, b) => +new Date(b.kickoff) - +new Date(a.kickoff));
export const competitionMatches = (slug: string) =>
  allMatches.filter((x) => x.competition === slug).sort((a, b) => +new Date(b.kickoff) - +new Date(a.kickoff));

/* ─────────────────────────────────────────────────────────────
   News
   ───────────────────────────────────────────────────────────── */

export type Article = {
  slug: string;
  title: string;
  excerpt: string;
  body: string[];
  category: "تحليل" | "تقرير" | "مقابلة" | "انتقالات" | "عاجل" | "ملخص";
  kind: "original" | "external";
  breaking: boolean;
  sport: string;
  competition?: string;
  teams?: string[];
  players?: string[];
  matches?: string[];
  author: string;
  publishedAgoMin: number;
  readMinutes: number;
  views: number;
  /** external sources only */
  source?: { name: string; url: string };
};

const articles_RAW: Article[] = [
  {
    slug: "ahly-zamalek-cairo-derby-preview",
    title: "ديربي القاهرة: كيف يخطط الأهلي والزمالك لمعركة الوسط؟",
    excerpt: "قراءة فنية في أوراق الفريقين قبل صافرة البداية، وأين يمكن أن تُحسم المباراة فعليًا.",
    body: [
      "يدخل الأهلي مواجهة الديربي وهو يبحث عن تثبيت أقدامه في صدارة الترتيب، بينما يحتاج الزمالك إلى نتيجة تعيد له الثقة بعد جولتين متعثرتين. الفارق بين الفريقين هذا الموسم لا يظهر في الأسماء بقدر ما يظهر في طريقة إدارة وسط الملعب.",
      "الأهلي يعتمد على محورين يميلان إلى التأمين ثم الصعود المتأخر، ما يمنح الأجنحة مساحة الانطلاق خلف الظهيرين. في المقابل يراهن الزمالك على التحول السريع بتمريرة واحدة تكسر خط الوسط، وهو ما يجعل مباراة اليوم سباقًا على الكرة الثانية أكثر منها سباقًا على الاستحواذ.",
      "الأرقام تدعم هذا القراءة: الأهلي يسجل 61% من أهدافه من لعب مفتوح، بينما تأتي 44% من أهداف الزمالك من هجمات لا تتجاوز ثلاث تمريرات. من يسيطر على المسافة بين الخطوط يسيطر على النتيجة.",
    ],
    category: "تحليل", kind: "original", breaking: true, sport: "football", competition: "egyptian-league",
    teams: ["al-ahly", "zamalek"], players: ["imam-ashour", "nasser-maher"],
    author: "كريم عبد الله", publishedAgoMin: 34, readMinutes: 4, views: 18_420,
  },
  {
    slug: "haaland-century-record",
    title: "هالاند يصل إلى الهدف رقم 100 في الدوري الإنجليزي بأسرع معدل تهديفي",
    excerpt: "المهاجم النرويجي يكسر رقمًا صمد لسنوات، ويضع معيارًا جديدًا للفاعلية أمام المرمى.",
    body: [
      "لم يحتج إيرلينغ هالاند سوى إلى 111 مباراة ليصل إلى مئة هدف في الدوري الإنجليزي الممتاز، وهو معدل لم يحققه أي مهاجم في تاريخ المسابقة.",
      "خلف الرقم تتغير طريقة لعب المنافسين: ثلاثة أندية غيرت خطة مراقبته إلى رجلين هذا الموسم، ومع ذلك ظل معدل تحويله للفرص فوق 27%، وهو الأعلى بين مهاجمي الدوريات الخمسة الكبرى.",
    ],
    category: "تقرير", kind: "original", breaking: true, sport: "football", competition: "premier-league",
    teams: ["manchester-city"], players: ["erling-haaland"],
    author: "سارة منير", publishedAgoMin: 72, readMinutes: 3, views: 26_913,
  },
  {
    slug: "salah-liverpool-contract-situation",
    title: "ملف تجديد عقد محمد صلاح: ما الذي تؤخره الأرقام؟",
    excerpt: "ملخص تحريري لأحدث ما نشرته الصحافة الإنجليزية حول مفاوضات ليفربول.",
    body: [
      "تشير تقارير صحفية إنجليزية إلى أن مفاوضات تمديد عقد محمد صلاح وصلت إلى مرحلة التفاصيل المالية الأخيرة، دون إعلان رسمي حتى الآن.",
      "وبحسب الملخص الذي أعدّه محررو نيمو سبورتس، فإن النقاش يدور حول مدة العقد أكثر من قيمته، إذ يفضل اللاعب عقدًا لا يتجاوز عامين إضافيين.",
      "هذا الخبر ملخص تحريري من مصدر خارجي، والرابط الأصلي متاح في نهاية المقال احترامًا لحقوق النشر.",
    ],
    category: "انتقالات", kind: "external", breaking: false, sport: "football", competition: "premier-league",
    teams: ["liverpool"], players: ["mohamed-salah"],
    author: "محررو نيمو سبورتس", publishedAgoMin: 145, readMinutes: 2, views: 41_208,
    source: { name: "BBC Sport", url: "https://www.bbc.com/sport/football" },
  },
  {
    slug: "egypt-handball-league-form",
    title: "دوري اليد المصري: صراع الصدارة يشتعل بين الأهلي والزمالك",
    excerpt: "فارق نقطة واحدة يفصل القطبين قبل ثلاث جولات من نهاية المرحلة الأولى.",
    body: [
      "بعد 14 جولة، يتصدر الأهلي جدول دوري المحترفين لكرة اليد بفارق نقطة واحدة عن الزمالك، وهو أصغر فارق بين الفريقين منذ خمس سنوات.",
      "معدل تصديات حارسي الفريقين ارتفع هذا الموسم بنسبة 6%، بينما انخفض معدل رميات سبعة أمتار المحولة إلى 74%.",
    ],
    category: "تقرير", kind: "original", breaking: false, sport: "handball", competition: "egypt-handball",
    teams: ["ahly-handball", "zamalek-handball"], players: ["ahmed-elahmar"],
    author: "أحمد فؤاد", publishedAgoMin: 220, readMinutes: 3, views: 9_140,
  },
  {
    slug: "nba-midseason-power-rankings",
    title: "ترتيب القوة في منتصف موسم السلة: من يملك أعمق قائمة؟",
    excerpt: "تحليل للأرقام الدفاعية والهجومية لأبرز ثمانية فرق في الدوري.",
    body: [
      "منتصف الموسم يكشف ما لا تكشفه النتائج: عمق القائمة. أربعة فرق فقط تحافظ على معدل هجومي فوق 118 نقطة لكل مئة حيازة مع إراحة نجومها.",
      "اللافت أن ثلاثة من هذه الفرق تملك أفضل خمسة بدلاء من حيث نسبة التسديد من الثلاثيات، وهو ما يفسر قدرتها على الحفاظ على الفارق في الربع الأخير.",
    ],
    category: "تحليل", kind: "original", breaking: false, sport: "basketball", competition: "nba",
    teams: ["okc-thunder", "boston-celtics", "denver-nuggets"], players: ["shai", "nikola-jokic"],
    author: "ليلى حسن", publishedAgoMin: 300, readMinutes: 5, views: 15_777,
  },
  {
    slug: "champions-league-round-seven",
    title: "الجولة السابعة من دوري الأبطال: حسابات التأهل المباشر",
    excerpt: "ست فرق تحسم مقاعدها في دور الـ16 هذه الجولة، وأربعة تنتظر الجولة الأخيرة.",
    body: [
      "تدخل الجولة السابعة من مرحلة الدوري في دوري أبطال أوروبا بحسابات معقدة، إذ يكفي فوزان لستة أندية لضمان التأهل المباشر دون المرور بالدور الفاصل.",
      "أبرز المواجهات تجمع ريال مدريد ببايرن ميونخ في لقاء يحدد صاحب المركز الأول في الجدول المجمع.",
    ],
    category: "تقرير", kind: "original", breaking: false, sport: "football", competition: "champions-league",
    teams: ["real-madrid", "bayern-munich", "psg", "barcelona"], players: ["harry-kane", "kylian-mbappe"],
    author: "كريم عبد الله", publishedAgoMin: 410, readMinutes: 4, views: 22_450,
  },
  {
    slug: "egypt-volleyball-nations-league",
    title: "منتخب الطائرة يواصل نتائجه الإيجابية في دوري الأمم",
    excerpt: "فوز بثلاثة أشواط لشوط واحد يرفع رصيد المنتخب في الترتيب العام.",
    body: [
      "حقق منتخب مصر للكرة الطائرة فوزًا مهمًا بثلاثة أشواط مقابل شوط، ليرفع رصيده في جدول دوري الأمم ويتقدم مركزين.",
      "تميز اللقاء بأداء حائط الصد الذي حسم 9 نقاط مباشرة، وهو أعلى رقم للمنتخب هذا الموسم.",
    ],
    category: "ملخص", kind: "original", breaking: false, sport: "volleyball", competition: "volley-nations",
    teams: ["egypt-volley"], author: "أحمد فؤاد", publishedAgoMin: 520, readMinutes: 2, views: 6_310,
  },
  {
    slug: "var-explained-offside-technology",
    title: "كيف تعمل تقنية التسلل شبه الآلي؟ شرح مبسّط بالخطوات",
    excerpt: "من الكاميرا إلى القرار في أقل من 25 ثانية — ما الذي يحدث فعلًا داخل غرفة الفيديو؟",
    body: [
      "تعتمد تقنية التسلل شبه الآلي على تتبع 29 نقطة من جسم اللاعب بمعدل 50 إطارًا في الثانية، مع كاميرات مخصصة لكرة المباراة ترصد لحظة التمرير بدقة زمنية عالية.",
      "عند الاشتباه في تسلل، يبني النظام نموذجًا ثلاثي الأبعاد ويعرض الخط على الشاشة خلال ثوانٍ، لكن القرار النهائي يبقى للحكم بعد مراجعة الصورة.",
    ],
    category: "تقرير", kind: "original", breaking: false, sport: "football",
    author: "سارة منير", publishedAgoMin: 700, readMinutes: 6, views: 33_902,
  },
  {
    slug: "atp-semifinal-alcaraz-sinner",
    title: "نصف نهائي التنس: مواجهة جديدة بين ألكاراز وسينر",
    excerpt: "الفوز الخامس على التوالي بينهما يحدد المتأهل إلى النهائي.",
    body: [
      "يتجدد اللقاء بين المصنفين الأول والثاني عالميًا في نصف نهائي البطولة، بعد أربع مواجهات هذا الموسم حُسمت ثلاث منها بثلاث مجموعات.",
      "تفوق ألكاراز يظهر بوضوح على الكرات القصيرة خلف الشبكة، بينما يبقى إرسال سينر سلاحه الأهم في الأشواط الفاصلة.",
    ],
    category: "تقرير", kind: "original", breaking: false, sport: "tennis", competition: "atp-tour",
    teams: ["alcaraz", "sinner"], players: ["carlos-alcaraz", "jannik-sinner"],
    author: "ليلى حسن", publishedAgoMin: 860, readMinutes: 3, views: 11_240,
  },
  {
    slug: "broadcast-rights-explained",
    title: "كيف نعرض روابط البث في نيمو سبورتس؟ سياسة واضحة",
    excerpt: "لا نعيد بث أي مباراة. نعرض فقط روابط النواقل الرسميين مع الإفصاح الكامل.",
    body: [
      "جميع روابط البث المعروضة في نيمو سبورتس تشير إلى نواقل رسميين يملكون حقوق المسابقة في منطقتك، ولا نقوم بتضمين أو إعادة بث أي إشارة.",
      "عندما يكون البث محصورًا جغرافيًا نوضح ذلك صراحة، ونذكر اسم الناقل وحالة البث قبل انطلاق المباراة.",
      "إن كنت ناقلًا رسميًا وترغب في إضافة منصتك، يمكنك التواصل معنا عبر صفحة اتصل بنا مع إرفاق ما يثبت الترخيص.",
    ],
    category: "تقرير", kind: "original", breaking: false, sport: "football",
    author: "فريق نيمو سبورتس", publishedAgoMin: 1_400, readMinutes: 3, views: 8_401,
  },
];


export const articles: Article[] = SHOW_DEMO ? articles_RAW : [];
export const breakingNews = articles.filter((a) => a.breaking);
export const articleBySlug = (s: string) => articles.find((a) => a.slug === s);
export const relatedArticles = (a: Article) =>
  articles.filter((x) => x.slug !== a.slug && (x.sport === a.sport || x.competition === a.competition)).slice(0, 3);

/* ─────────────────────────────────────────────────────────────
   Standings (football demo tables)
   ───────────────────────────────────────────────────────────── */

export type StandingRow = {
  pos: number; team: string; played: number; won: number; drawn: number; lost: number;
  gf: number; ga: number; points: number; form: ("W" | "D" | "L")[]; zone?: "ucl" | "uel" | "rel";
};

const row = (pos: number, team: string, p: number, w: number, d: number, l: number, gf: number, ga: number, form: StandingRow["form"], zone?: StandingRow["zone"]): StandingRow =>
  ({ pos, team, played: p, won: w, drawn: d, lost: l, gf, ga, points: w * 3 + d, form, zone });

const standings_RAW: Record<string, StandingRow[]> = {
  "premier-league": [
    row(1, "arsenal", 24, 17, 5, 2, 52, 18, ["W", "W", "D", "W", "W"], "ucl"),
    row(2, "manchester-city", 24, 16, 5, 3, 55, 24, ["W", "L", "W", "W", "D"], "ucl"),
    row(3, "liverpool", 24, 15, 6, 3, 49, 22, ["W", "D", "W", "W", "W"], "ucl"),
    row(4, "chelsea", 24, 13, 6, 5, 44, 28, ["L", "W", "D", "W", "W"], "ucl"),
    row(5, "newcastle", 24, 13, 4, 7, 41, 30, ["W", "W", "W", "L", "W"], "uel"),
    row(6, "manchester-united", 24, 12, 5, 7, 38, 31, ["D", "W", "L", "W", "D"], "uel"),
    row(7, "aston-villa", 24, 11, 6, 7, 36, 33, ["L", "D", "W", "W", "L"]),
    row(8, "tottenham", 24, 11, 4, 9, 42, 36, ["W", "L", "W", "D", "L"]),
    row(9, "brighton", 24, 9, 8, 7, 34, 32, ["D", "D", "W", "L", "D"]),
    row(10, "west-ham", 24, 9, 5, 10, 30, 37, ["L", "W", "L", "D", "W"]),
    row(11, "fulham", 24, 8, 7, 9, 29, 33, ["D", "L", "D", "W", "L"]),
    row(12, "everton", 24, 7, 6, 11, 25, 34, ["L", "D", "L", "L", "W"]),
    row(13, "burnley-demo", 24, 6, 7, 11, 24, 38, ["L", "L", "D", "L", "D"], undefined),
    row(18, "ipswich-demo", 24, 4, 6, 14, 20, 45, ["L", "L", "L", "D", "L"], "rel"),
    row(19, "leicester-demo", 24, 4, 4, 16, 21, 51, ["L", "L", "L", "L", "L"], "rel"),
    row(20, "southampton-demo", 24, 3, 4, 17, 18, 54, ["L", "L", "D", "L", "L"], "rel"),
  ].map((r) => ({ ...r })),
  "egyptian-league": [
    row(1, "al-ahly", 18, 13, 3, 2, 38, 12, ["W", "W", "D", "W", "W"], "ucl"),
    row(2, "pyramids", 18, 12, 4, 2, 33, 14, ["W", "D", "W", "W", "W"], "ucl"),
    row(3, "zamalek", 18, 11, 4, 3, 30, 16, ["W", "L", "W", "D", "W"], "uel"),
    row(4, "al-masry", 18, 9, 5, 4, 24, 18, ["D", "W", "D", "W", "L"]),
    row(5, "ceramica", 18, 8, 5, 5, 22, 19, ["W", "D", "W", "L", "D"]),
    row(6, "pharco", 18, 7, 5, 6, 19, 20, ["L", "W", "D", "D", "W"]),
    row(7, "al-ittihad-alex", 18, 6, 6, 6, 18, 21, ["D", "D", "L", "W", "L"]),
    row(8, "ismaily", 18, 5, 5, 8, 16, 23, ["L", "L", "D", "W", "L"]),
  ],
};


export const standings: Record<string, StandingRow[]> = SHOW_DEMO ? standings_RAW : {};
export type TopScorer = { pos: number; player: string; team: string; goals: number; apps: number; penalties: number };

const topScorers_RAW: Record<string, TopScorer[]> = {
  "premier-league": [
    { pos: 1, player: "erling-haaland", team: "manchester-city", goals: 24, apps: 26, penalties: 3 },
    { pos: 2, player: "mohamed-salah", team: "liverpool", goals: 19, apps: 26, penalties: 4 },
    { pos: 3, player: "alexander-isak", team: "newcastle", goals: 17, apps: 24, penalties: 1 },
    { pos: 4, player: "cole-palmer", team: "chelsea", goals: 12, apps: 22, penalties: 5 },
    { pos: 5, player: "bukayo-saka", team: "arsenal", goals: 10, apps: 24, penalties: 0 },
  ],
  "egyptian-league": [
    { pos: 1, player: "mohamed-sherif", team: "al-ahly", goals: 14, apps: 24, penalties: 2 },
    { pos: 2, player: "imam-ashour", team: "al-ahly", goals: 9, apps: 23, penalties: 0 },
    { pos: 3, player: "nasser-maher", team: "zamalek", goals: 6, apps: 22, penalties: 1 },
    { pos: 4, player: "mahmoud-hamdy", team: "zamalek", goals: 1, apps: 21, penalties: 0 },
  ],
};


export const topScorers: Record<string, TopScorer[]> = SHOW_DEMO ? topScorers_RAW : {};
/* ── broadcast partners directory (license registry) ──────── */
export type BroadcastPartner = {
  id: string; name: string; type: string; licenseType: "embed" | "external";
  regions: string[]; status: "approved" | "pending" | "rejected"; competitions: string[]; verifiedAt: string;
};

const broadcastPartners_RAW: BroadcastPartner[] = [
  { id: "bp1", name: "beIN SPORTS", type: "قناة رياضية مرخّصة", licenseType: "external", regions: ["الشرق الأوسط", "شمال أفريقيا"], status: "approved", competitions: ["premier-league", "champions-league", "la-liga"], verifiedAt: "2026-01-08" },
  { id: "bp2", name: "أون سبورت", type: "قناة رياضية مرخّصة", licenseType: "external", regions: ["مصر"], status: "approved", competitions: ["egyptian-league"], verifiedAt: "2026-01-02" },
  { id: "bp3", name: "NBA League Pass", type: "منصة بث رسمية", licenseType: "embed", regions: ["العالم (باستثناء الولايات المتحدة)"], status: "approved", competitions: ["nba"], verifiedAt: "2025-12-19" },
  { id: "bp4", name: "DAZN", type: "منصة بث رسمية", licenseType: "external", regions: ["إسبانيا", "ألمانيا", "العالم (الملاكمة)"], status: "approved", competitions: ["la-liga", "world-title-fights"], verifiedAt: "2025-12-11" },
  { id: "bp5", name: "Tennis TV", type: "منصة بث رسمية", licenseType: "external", regions: ["العالم"], status: "approved", competitions: ["atp-tour"], verifiedAt: "2025-11-27" },
  { id: "bp6", name: "Sky Sports", type: "قناة رياضية مرخّصة", licenseType: "external", regions: ["المملكة المتحدة", "أيرلندا"], status: "pending", competitions: ["premier-league"], verifiedAt: "2026-02-01" },
];


/** Directory shown on /broadcast-rights: in production this registry must be fed from the admin/DB, not from a hardcoded demo list. */
export const broadcastPartners: BroadcastPartner[] = SHOW_DEMO ? broadcastPartners_RAW : [];
/* ── data sources registry (Primary → Backup → Manual) ────── */
export type DataSource = {
  id: string; name: string; kind: "primary" | "backup" | "manual"; sports: string[];
  latency: string; status: "connected" | "degraded" | "offline"; errorRate: number; lastSync: string;
};

const dataSources_RAW: DataSource[] = [
  { id: "ds1", name: "SportRadar (Primary)", kind: "primary", sports: ["football", "basketball", "tennis", "handball", "volleyball", "baseball", "hockey"], latency: "≈ 4 ثوانٍ", status: "connected", errorRate: 0.2, lastSync: "قبل 4 ثوانٍ" },
  { id: "ds2", name: "Football-Data (Backup)", kind: "backup", sports: ["football"], latency: "≈ 12 ثانية", status: "connected", errorRate: 0.8, lastSync: "قبل دقيقة" },
  { id: "ds3", name: "إدخال يدوي (Last Resort)", kind: "manual", sports: ["boxing"], latency: "يدوي", status: "connected", errorRate: 0, lastSync: "قبل 9 دقائق" },
];


export const dataSources: DataSource[] = SHOW_DEMO ? dataSources_RAW : [];
