/* ─────────────────────────────────────────────────────────────
   NEMO Sports · Core reference data
   Sports → Competitions → Teams → Players
   Demo dataset: fictional-but-realistic, no third-party content.
   ───────────────────────────────────────────────────────────── */

export type Sport = {
  slug: string;
  name: string;
  nameEn: string;
  icon: string;
  order: number;
  active: boolean;
  /** scoring unit used across the UI (هدف / نقطة / شوط …) */
  scoreUnit: string;
  periodLabel: string;
};

export const sports: Sport[] = [
  { slug: "football", name: "كرة القدم", nameEn: "Football", icon: "⚽", order: 1, active: true, scoreUnit: "هدف", periodLabel: "دقيقة" },
  { slug: "basketball", name: "كرة السلة", nameEn: "Basketball", icon: "🏀", order: 2, active: true, scoreUnit: "نقطة", periodLabel: "فترة" },
  { slug: "tennis", name: "التنس", nameEn: "Tennis", icon: "🎾", order: 3, active: true, scoreUnit: "شوط", periodLabel: "مجموعة" },
  { slug: "handball", name: "كرة اليد", nameEn: "Handball", icon: "🤾", order: 4, active: true, scoreUnit: "هدف", periodLabel: "شوط" },
  { slug: "volleyball", name: "الكرة الطائرة", nameEn: "Volleyball", icon: "🏐", order: 5, active: true, scoreUnit: "شوط", periodLabel: "شوط" },
  { slug: "baseball", name: "البيسبول", nameEn: "Baseball", icon: "⚾", order: 6, active: true, scoreUnit: "ران", periodLabel: "إينينج" },
  { slug: "hockey", name: "الهوكي", nameEn: "Ice Hockey", icon: "🏒", order: 7, active: true, scoreUnit: "هدف", periodLabel: "شوط" },
  { slug: "boxing", name: "الملاكمة", nameEn: "Boxing", icon: "🥊", order: 8, active: true, scoreUnit: "جولة", periodLabel: "جولة" },
];

export type Competition = {
  slug: string;
  name: string;
  nameEn: string;
  sport: string;
  country: string;
  season: string;
  format: "دوري" | "كأس" | "دوري + كأس" | "بطولة فردية";
  rounds: number;
  teamsCount: number;
  /** two-letter badge code shown in compact rails */
  code: string;
  tier: "continental" | "domestic" | "international";
};

export const competitions: Competition[] = [
  // Football
  { slug: "premier-league", name: "الدوري الإنجليزي الممتاز", nameEn: "Premier League", sport: "football", country: "إنجلترا", season: "2026/2027", format: "دوري", rounds: 38, teamsCount: 20, code: "EPL", tier: "domestic" },
  { slug: "la-liga", name: "الدوري الإسباني", nameEn: "La Liga", sport: "football", country: "إسبانيا", season: "2026/2027", format: "دوري", rounds: 38, teamsCount: 20, code: "LL", tier: "domestic" },
  { slug: "champions-league", name: "دوري أبطال أوروبا", nameEn: "UEFA Champions League", sport: "football", country: "أوروبا", season: "2026/2027", format: "دوري + كأس", rounds: 17, teamsCount: 36, code: "UCL", tier: "continental" },
  { slug: "egyptian-league", name: "الدوري المصري الممتاز", nameEn: "Egyptian Premier League", sport: "football", country: "مصر", season: "2026/2027", format: "دوري", rounds: 34, teamsCount: 18, code: "EGY", tier: "domestic" },
  { slug: "caf-champions-league", name: "دوري أبطال أفريقيا", nameEn: "CAF Champions League", sport: "football", country: "أفريقيا", season: "2026/2027", format: "دوري + كأس", rounds: 13, teamsCount: 16, code: "CAF", tier: "continental" },
  { slug: "serie-a", name: "الدوري الإيطالي", nameEn: "Serie A", sport: "football", country: "إيطاليا", season: "2026/2027", format: "دوري", rounds: 38, teamsCount: 20, code: "SA", tier: "domestic" },
  // Basketball
  { slug: "nba", name: "دوري كرة السلة الأمريكي", nameEn: "NBA", sport: "basketball", country: "الولايات المتحدة", season: "2026/2027", format: "دوري", rounds: 82, teamsCount: 30, code: "NBA", tier: "domestic" },
  { slug: "euroleague", name: "اليوروليغ", nameEn: "EuroLeague", sport: "basketball", country: "أوروبا", season: "2026/2027", format: "دوري", rounds: 34, teamsCount: 18, code: "EL", tier: "continental" },
  // Tennis
  { slug: "atp-tour", name: "بطولات رابطة المحترفين", nameEn: "ATP Tour", sport: "tennis", country: "دولية", season: "2026", format: "بطولة فردية", rounds: 7, teamsCount: 64, code: "ATP", tier: "international" },
  // Handball
  { slug: "handball-champions", name: "دوري أبطال أوروبا لكرة اليد", nameEn: "EHF Champions League", sport: "handball", country: "أوروبا", season: "2026/2027", format: "دوري", rounds: 18, teamsCount: 16, code: "EHH", tier: "continental" },
  { slug: "egypt-handball", name: "دوري المحترفين المصري لكرة اليد", nameEn: "Egyptian Handball League", sport: "handball", country: "مصر", season: "2026/2027", format: "دوري", rounds: 26, teamsCount: 14, code: "EGH", tier: "domestic" },
  // Volleyball
  { slug: "volley-nations", name: "دوري الأمم للكرة الطائرة", nameEn: "Volleyball Nations League", sport: "volleyball", country: "دولية", season: "2026", format: "دوري", rounds: 15, teamsCount: 16, code: "VNL", tier: "international" },
  // Baseball
  { slug: "mlb", name: "دوري البيسبول الرئيسي", nameEn: "MLB", sport: "baseball", country: "الولايات المتحدة", season: "2026", format: "دوري", rounds: 162, teamsCount: 30, code: "MLB", tier: "domestic" },
  // Hockey
  { slug: "nhl", name: "دوري الهوكي الوطني", nameEn: "NHL", sport: "hockey", country: "أمريكا الشمالية", season: "2026/2027", format: "دوري", rounds: 82, teamsCount: 32, code: "NHL", tier: "domestic" },
  // Boxing
  { slug: "world-title-fights", name: "نزالات بطولة العالم", nameEn: "World Title Fights", sport: "boxing", country: "دولية", season: "2026", format: "بطولة فردية", rounds: 12, teamsCount: 24, code: "WTF", tier: "international" },
];

export type Team = {
  slug: string;
  name: string;
  nameEn: string;
  short: string;
  sport: string;
  country: string;
  flag: string;
  competition: string;
  founded: number;
  stadium?: string;
  capacity?: number;
  coach?: string;
  captain?: string;
  primary: string;
  secondary: string;
};

const t = (
  slug: string,
  name: string,
  nameEn: string,
  short: string,
  sport: string,
  country: string,
  flag: string,
  competition: string,
  founded: number,
  primary: string,
  secondary: string,
  extra: Partial<Team> = {},
): Team => ({ slug, name, nameEn, short, sport, country, flag, competition, founded, primary, secondary, ...extra });

export const teams: Team[] = [
  /* ── Premier League ─────────────────────────────────────── */
  t("manchester-city", "مانشستر سيتي", "Manchester City", "MCI", "football", "إنجلترا", "🏴", "premier-league", 1880, "#6CABDD", "#1C2C5B", { stadium: "ملعب الاتحاد", capacity: 61474, coach: "بيب غوارديولا", captain: "برناردو سيلفا" }),
  t("arsenal", "آرسنال", "Arsenal", "ARS", "football", "إنجلترا", "🏴", "premier-league", 1886, "#EF0107", "#023474", { stadium: "ملعب الإمارات", capacity: 60704, coach: "ميكيل أرتيتا", captain: "مارتن أوديغارد" }),
  t("liverpool", "ليفربول", "Liverpool", "LIV", "football", "إنجلترا", "🏴", "premier-league", 1892, "#C8102E", "#00B2A9", { stadium: "أنفيلد", capacity: 61276, coach: "أرني سلوت", captain: "فيرجيل فان دايك" }),
  t("manchester-united", "مانشستر يونايتد", "Manchester United", "MUN", "football", "إنجلترا", "🏴", "premier-league", 1878, "#DA291C", "#FBE122", { stadium: "أولد ترافورد", capacity: 74310, coach: "روبن أموريم", captain: "برونو فيرنانديز" }),
  t("chelsea", "تشيلسي", "Chelsea", "CHE", "football", "إنجلترا", "🏴", "premier-league", 1905, "#034694", "#DBA111", { stadium: "ستامفورد بريدج", capacity: 40173, coach: "إنزو ماريسكا", captain: "ريس جيمس" }),
  t("tottenham", "توتنهام هوتسبير", "Tottenham Hotspur", "TOT", "football", "إنجلترا", "🏴", "premier-league", 1882, "#132257", "#FFFFFF", { stadium: "ملعب توتنهام", capacity: 62850, coach: "توماس فرانك", captain: "كريستيان روميرو" }),
  t("newcastle", "نيوكاسل يونايتد", "Newcastle United", "NEW", "football", "إنجلترا", "🏴", "premier-league", 1892, "#241F20", "#FFFFFF", { stadium: "سانت جيمس بارك", capacity: 52305, coach: "إيدي هاو", captain: "برونو غيمارايش" }),
  t("aston-villa", "أستون فيلا", "Aston Villa", "AVL", "football", "إنجلترا", "🏴", "premier-league", 1874, "#670E36", "#95BFE5", { stadium: "فيلا بارك", capacity: 42657, coach: "أوناي إيمري", captain: "جون ماكجين" }),
  t("brighton", "برايتون", "Brighton & Hove Albion", "BHA", "football", "إنجلترا", "🏴", "premier-league", 1901, "#0057B8", "#FFCD00", { stadium: "ملعب أمريكان إكسبريس", capacity: 31800, coach: "فابيان هورتزلر", captain: "لويس دانك" }),
  t("west-ham", "وست هام يونايتد", "West Ham United", "WHU", "football", "إنجلترا", "🏴", "premier-league", 1895, "#7A263A", "#1BB1E7", { stadium: "ملعب لندن", capacity: 62500, coach: "غراهام بوتر", captain: "جارود بوين" }),
  t("everton", "إيفرتون", "Everton", "EVE", "football", "إنجلترا", "🏴", "premier-league", 1878, "#003399", "#FFFFFF", { stadium: "ملعب إيفرتون الجديد", capacity: 52888, coach: "ديفيد مويس", captain: "شيموس كولمان" }),
  t("fulham", "فولهام", "Fulham", "FUL", "football", "إنجلترا", "🏴", "premier-league", 1879, "#000000", "#FFFFFF", { stadium: "كرافن كوتيج", capacity: 29600, coach: "ماركو سيلفا", captain: "توم كيرني" }),
  /* ── La Liga ────────────────────────────────────────────── */
  t("real-madrid", "ريال مدريد", "Real Madrid", "RMA", "football", "إسبانيا", "🇪🇸", "la-liga", 1902, "#FEBE10", "#00529F", { stadium: "سانتياغو برنابيو", capacity: 83186, coach: "تشابي ألونسو", captain: "داني كارفاخال" }),
  t("barcelona", "برشلونة", "FC Barcelona", "BAR", "football", "إسبانيا", "🇪🇸", "la-liga", 1899, "#A50044", "#004D98", { stadium: "سبوتيفاي كامب نو", capacity: 99354, coach: "هانزي فليك", captain: "رونالد أراوخو" }),
  t("atletico-madrid", "أتلتيكو مدريد", "Atlético Madrid", "ATM", "football", "إسبانيا", "🇪🇸", "la-liga", 1903, "#CB3524", "#FFFFFF", { stadium: "ميتروبوليتانو", capacity: 70460, coach: "دييغو سيميوني", captain: "كوكي" }),
  t("athletic-bilbao", "أتلتيك بيلباو", "Athletic Club", "ATH", "football", "إسبانيا", "🇪🇸", "la-liga", 1898, "#EE2523", "#FFFFFF", { stadium: "سان ماميس", capacity: 53289, coach: "إرنستو فالفيردي", captain: "إيناكي ويليامز" }),
  t("real-sociedad", "ريال سوسيداد", "Real Sociedad", "RSO", "football", "إسبانيا", "🇪🇸", "la-liga", 1909, "#0067B1", "#FFFFFF", { stadium: "أنويتا", capacity: 39500, coach: "سيرجيو فرانسيسكو", captain: "ميكل أويارزابال" }),
  t("villarreal", "فياريال", "Villarreal", "VIL", "football", "إسبانيا", "🇪🇸", "la-liga", 1923, "#FFE667", "#005187", { stadium: "لا سيراميكا", capacity: 23500, coach: "مارسيلينو", captain: "راؤول ألبيول" }),
  /* ── Serie A / Europe ───────────────────────────────────── */
  t("inter-milan", "إنتر ميلان", "Inter Milan", "INT", "football", "إيطاليا", "🇮🇹", "serie-a", 1908, "#0068A8", "#221F20", { stadium: "سان سيرو", capacity: 75923, coach: "كريستيان كيفو", captain: "لاوتارو مارتينيز" }),
  t("ac-milan", "إيه سي ميلان", "AC Milan", "MIL", "football", "إيطاليا", "🇮🇹", "serie-a", 1899, "#FB090B", "#000000", { stadium: "سان سيرو", capacity: 75923, coach: "ماسيميليانو أليغري", captain: "مايك ماينان" }),
  t("juventus", "يوفنتوس", "Juventus", "JUV", "football", "إيطاليا", "🇮🇹", "serie-a", 1897, "#000000", "#FFFFFF", { stadium: "أليانز ستاديوم", capacity: 41507, coach: "إيغور تودور", captain: "مانويل لوكاتيلي" }),
  t("bayern-munich", "بايرن ميونخ", "Bayern München", "BAY", "football", "ألمانيا", "🇩🇪", "champions-league", 1900, "#DC052D", "#0066B2", { stadium: "أليانز أرينا", capacity: 75024, coach: "فينسنت كومباني", captain: "مانويل نوير" }),
  t("psg", "باريس سان جيرمان", "Paris Saint-Germain", "PSG", "football", "فرنسا", "🇷", "champions-league", 1970, "#004170", "#DA291C", { stadium: "حديقة الأمراء", capacity: 47929, coach: "لويس إنريكي", captain: "ماركينيوس" }),
  /* ── Egypt ──────────────────────────────────────────────── */
  t("al-ahly", "الأهلي", "Al Ahly", "AHL", "football", "مصر", "🇪🇬", "egyptian-league", 1907, "#C8102E", "#FFFFFF", { stadium: "استاد القاهرة الدولي", capacity: 74100, coach: "خوسيه ريبيرو", captain: "محمد الشناوي" }),
  t("zamalek", "الزمالك", "Zamalek", "ZAM", "football", "مصر", "🇪🇬", "egyptian-league", 1911, "#FFFFFF", "#C8102E", { stadium: "استاد القاهرة الدولي", capacity: 74100, coach: "يانيس فيريرا", captain: "محمود حمدي الونش" }),
  t("pyramids", "بيراميدز", "Pyramids FC", "PYR", "football", "مصر", "🇪🇬", "egyptian-league", 2008, "#00A0E3", "#FFFFFF", { stadium: "استاد 30 يونيو", capacity: 30000, coach: "كرونسلاف يورتشيتش", captain: "عبد الله السعيد" }),
  t("al-masry", "المصري", "Al Masry", "MSR", "football", "مصر", "🇪🇬", "egyptian-league", 1920, "#007A3D", "#FFFFFF", { stadium: "استاد بورسعيد", capacity: 22000, coach: "نبيل الكوكي", captain: "أحمد الشناوي" }),
  t("ismaily", "الإسماعيلي", "Ismaily", "ISM", "football", "مصر", "🇪🇬", "egyptian-league", 1921, "#FFD100", "#005BAA", { stadium: "استاد الإسماعيلية", capacity: 18525, coach: "إيهاب جلال", captain: "باهر المحمدي" }),
  t("pharco", "فاركو", "Pharco FC", "PHR", "football", "مصر", "🇪🇬", "egyptian-league", 2010, "#F2A900", "#002B5C", { stadium: "استاد حرس الحدود", capacity: 22000, coach: "أحمد خطاب", captain: "أحمد البحراوي" }),
  t("ceramica", "سيراميكا كليوباترا", "Ceramica Cleopatra", "CER", "football", "مصر", "🇪🇬", "egyptian-league", 2007, "#00447C", "#F5C518", { stadium: "استاد السويس الجديد", capacity: 25000, coach: "علي ماهر", captain: "محمد بسام" }),
  t("al-ittihad-alex", "الاتحاد السكندري", "Al Ittihad Alexandria", "ITT", "football", "مصر", "🇪🇬", "egyptian-league", 1914, "#009B48", "#FFFFFF", { stadium: "استاد الإسكندرية", capacity: 13660, coach: "أحمد سامي", captain: "محمود علاء" }),
  /* ── NBA ────────────────────────────────────────────────── */
  t("boston-celtics", "بوسطن سلتيكس", "Boston Celtics", "BOS", "basketball", "الولايات المتحدة", "🇺🇸", "nba", 1946, "#007A33", "#BA9653", { stadium: "تي دي غاردن", capacity: 19156, coach: "جو مازولا", captain: "جايسون تيتوم" }),
  t("la-lakers", "لوس أنجلوس ليكرز", "Los Angeles Lakers", "LAL", "basketball", "الولايات المتحدة", "🇺🇸", "nba", 1947, "#552583", "#FDB927", { stadium: "كريبتو أرينا", capacity: 18997, coach: "جي جي ريديك", captain: "ليبرون جيمس" }),
  t("golden-state", "غولدن ستايت ووريورز", "Golden State Warriors", "GSW", "basketball", "الولايات المتحدة", "🇺🇸", "nba", 1946, "#1D428A", "#FFC72C", { stadium: "تشيس سنتر", capacity: 18064, coach: "ستيف كير", captain: "ستيفن كوري" }),
  t("miami-heat", "ميامي هيت", "Miami Heat", "MIA", "basketball", "الولايات المتحدة", "🇺🇸", "nba", 1988, "#98002E", "#F9A01B", { stadium: "كاسيا سنتر", capacity: 19600, coach: "إريك سبولسترا", captain: "بام أديبايو" }),
  t("denver-nuggets", "دنفر ناغتس", "Denver Nuggets", "DEN", "basketball", "الولايات المتحدة", "🇺🇸", "nba", 1967, "#0E2240", "#FEC524", { stadium: "بول أرينا", capacity: 19520, coach: "ديفيد أديلما", captain: "نيكولا يوكيتش" }),
  t("milwaukee-bucks", "ميلووكي باكس", "Milwaukee Bucks", "MIL", "basketball", "الولايات المتحدة", "🇺🇸", "nba", 1968, "#00471B", "#EEE1C6", { stadium: "فايسرف فوروم", capacity: 17341, coach: "دوك ريفرز", captain: "يانيس أنتيتوكونمبو" }),
  t("phoenix-suns", "فينكس صنز", "Phoenix Suns", "PHX", "basketball", "الولايات المتحدة", "🇺🇸", "nba", 1968, "#1D1160", "#E56020", { stadium: "فوتبرينت سنتر", capacity: 17071, coach: "جوردان أوت", captain: "ديفين بوكر" }),
  t("new-york-knicks", "نيويورك نيكس", "New York Knicks", "NYK", "basketball", "الولايات المتحدة", "🇺🇸", "nba", 1946, "#006BB6", "#F58426", { stadium: "ماديسون سكوير غاردن", capacity: 19812, coach: "مايك براون", captain: "جالين برونسون" }),
  t("dallas-mavericks", "دالاس مافريكس", "Dallas Mavericks", "DAL", "basketball", "الولايات المتحدة", "🇺🇸", "nba", 1980, "#00538C", "#B8C4CA", { stadium: "أميركان إيرلاينز سنتر", capacity: 19200, coach: "جيسون كيد", captain: "أنتوني ديفيس" }),
  t("okc-thunder", "أوكلاهوما سيتي ثاندر", "Oklahoma City Thunder", "OKC", "basketball", "الولايات المتحدة", "🇺🇸", "nba", 1967, "#007AC1", "#EF3B24", { stadium: "بايكوم سنتر", capacity: 18203, coach: "مارك ديغنولت", captain: "شاي غيلجيوس ألكسندر" }),
  /* ── Tennis (singles entries are treated as competitors) ── */
  t("alcaraz", "كارلوس ألكاراز", "Carlos Alcaraz", "ALC", "tennis", "إسبانيا", "🇪🇸", "atp-tour", 2003, "#C8102E", "#F2C94C"),
  t("sinner", "يانيك سينر", "Jannik Sinner", "SIN", "tennis", "إيطاليا", "🇮🇹", "atp-tour", 2001, "#0E2240", "#FFFFFF"),
  t("djokovic", "نوفاك ديوكوفيتش", "Novak Djokovic", "DJO", "tennis", "صربيا", "🇷🇸", "atp-tour", 1987, "#003580", "#FFFFFF"),
  t("zverev", "ألكسندر زفيريف", "Alexander Zverev", "ZVE", "tennis", "ألمانيا", "🇩🇪", "atp-tour", 1997, "#111111", "#D4AF37"),
  t("medvedev", "دانييل مدفيديف", "Daniil Medvedev", "MED", "tennis", "روسيا", "🇷🇺", "atp-tour", 1996, "#0F1B2E", "#00A0E3"),
  t("ritz", "تايلور فريتز", "Taylor Fritz", "FRI", "tennis", "الولايات المتحدة", "🇺🇸", "atp-tour", 1997, "#1D428A", "#FFFFFF"),
  /* ── Handball ───────────────────────────────────────────── */
  t("ahly-handball", "الأهلي (كرة اليد)", "Al Ahly Handball", "AHH", "handball", "مصر", "🇪🇬", "egypt-handball", 1959, "#C8102E", "#FFFFFF", { stadium: "صالة الأهلي", capacity: 3000, coach: "ستيفان مادسن" }),
  t("zamalek-handball", "الزمالك (كرة اليد)", "Zamalek Handball", "ZHH", "handball", "مصر", "🇪🇬", "egypt-handball", 1958, "#FFFFFF", "#C8102E", { stadium: "صالة الزمالك", capacity: 2500, coach: "فرناندو باربيتو" }),
  t("barcelona-handball", "برشلونة (كرة اليد)", "Barça Handball", "BHH", "handball", "إسبانيا", "🇪🇸", "handball-champions", 1943, "#A50044", "#004D98", { stadium: "بالاو بلاوغرانا", capacity: 7500, coach: "تشافي باسكوال" }),
  t("kiel", "كيل", "THW Kiel", "KIE", "handball", "ألمانيا", "🇩🇪", "handball-champions", 1904, "#000000", "#FFFFFF", { stadium: "وندا أرينا", capacity: 10250, coach: "فيليب جيتشا" }),
  t("psg-handball", "باريس سان جيرمان (كرة اليد)", "PSG Handball", "PHH", "handball", "فرنسا", "🇫🇷", "handball-champions", 1941, "#004170", "#DA291C", { stadium: "قاعة بيرسي", capacity: 15000, coach: "ستيفان أولسون" }),
  t("veszprem", "فيزبريم", "MVM Veszprém", "VES", "handball", "المجر", "🇭🇺", "handball-champions", 1977, "#C8102E", "#FFFFFF", { stadium: "فيزبريم أرينا", capacity: 5000, coach: "إيغور غوميز" }),
  /* ── Volleyball ─────────────────────────────────────────── */
  t("egypt-volley", "منتخب مصر للكرة الطائرة", "Egypt Volleyball", "EGV", "volleyball", "مصر", "🇪🇬", "volley-nations", 1947, "#C8102E", "#000000", { coach: "فيرناندو مونوز" }),
  t("brazil-volley", "منتخب البرازيل", "Brazil Volleyball", "BRV", "volleyball", "البرازيل", "🇧🇷", "volley-nations", 1954, "#FFDF00", "#009739", { coach: "بيرناندو ريزيندي" }),
  t("poland-volley", "منتخب بولندا", "Poland Volleyball", "PLV", "volleyball", "بولندا", "🇵🇱", "volley-nations", 1928, "#DC143C", "#FFFFFF", { coach: "نيكولا جربيك" }),
  t("usa-volley", "منتخب الولايات المتحدة", "USA Volleyball", "USV", "volleyball", "الولايات المتحدة", "🇺🇸", "volley-nations", 1928, "#0A3161", "#B31942", { coach: "جون سبيرهاو" }),
  t("italy-volley", "منتخب إيطاليا", "Italy Volleyball", "ITV", "volleyball", "إيطاليا", "🇮🇹", "volley-nations", 1929, "#008C45", "#CD212A", { coach: "فرديناندو دي جيورجي" }),
  t("japan-volley", "منتخب اليابان", "Japan Volleyball", "JPV", "volleyball", "اليابان", "🇯🇵", "volley-nations", 1927, "#BC002D", "#FFFFFF", { coach: "لوران تيلي" }),
  /* ── Baseball ───────────────────────────────────────────── */
  t("ny-yankees", "نيويورك يانكيز", "New York Yankees", "NYY", "baseball", "الولايات المتحدة", "🇺🇸", "mlb", 1903, "#003087", "#C4CED4", { stadium: "يانكي ستاديوم", capacity: 46537, coach: "آرون بون" }),
  t("la-dodgers", "لوس أنجلوس دودجرز", "Los Angeles Dodgers", "LAD", "baseball", "الولايات المتحدة", "🇺🇸", "mlb", 1883, "#005A9C", "#EF3E42", { stadium: "دودجر ستاديوم", capacity: 56000, coach: "ديف روبرتس" }),
  t("boston-redsox", "بوسطن ريد سوكس", "Boston Red Sox", "BOS2", "baseball", "الولايات المتحدة", "🇺🇸", "mlb", 1901, "#BD3039", "#0C2340", { stadium: "فينواي بارك", capacity: 37755, coach: "أليكس كورا" }),
  t("chicago-cubs", "شيكاغو كابز", "Chicago Cubs", "CHC", "baseball", "الولايات المتحدة", "🇺🇸", "mlb", 1876, "#0E3386", "#CC3433", { stadium: "ريغلي فيلد", capacity: 41649, coach: "كريغ كاونسل" }),
  t("houston-astros", "هيوستن أستروس", "Houston Astros", "HOU", "baseball", "الولايات المتحدة", "🇺🇸", "mlb", 1962, "#002D62", "#EB6E1F", { stadium: "مينيت ميد بارك", capacity: 41168, coach: "جو إسبادا" }),
  t("sf-giants", "سان فرانسيسكو جاينتس", "San Francisco Giants", "SFG", "baseball", "الولايات المتحدة", "🇺🇸", "mlb", 1883, "#FD5A1E", "#27251F", { stadium: "أوراكيل بارك", capacity: 41915, coach: "بوب ميلفين" }),
  /* ── Hockey ─────────────────────────────────────────────── */
  t("boston-bruins", "بوسطن بروينز", "Boston Bruins", "BOS3", "hockey", "الولايات المتحدة", "🇺🇸", "nhl", 1924, "#FFB81C", "#000000", { stadium: "تي دي غاردن", capacity: 17850, coach: "ماركو ستورم" }),
  t("toronto-maple", "تورونتو مابل ليفز", "Toronto Maple Leafs", "TOR", "hockey", "كندا", "🇨🇦", "nhl", 1917, "#00205B", "#FFFFFF", { stadium: "سكوتيابانك أرينا", capacity: 18800, coach: "كريغ بيربي" }),
  t("edmonton-oilers", "إدمونتون أويلرز", "Edmonton Oilers", "EDM", "hockey", "كندا", "🇨🇦", "nhl", 1972, "#041E42", "#FF4C00", { stadium: "روجرز بليس", capacity: 18347, coach: "كريس نوبلاخ" }),
  t("ny-rangers", "نيويورك رينجرز", "New York Rangers", "NYR", "hockey", "الولايات المتحدة", "🇺🇸", "nhl", 1926, "#0038A8", "#CE1126", { stadium: "ماديسون سكوير غاردن", capacity: 18006, coach: "مايك سوليفان" }),
  t("colorado-avalanche", "كولورادو أفالانش", "Colorado Avalanche", "COL", "hockey", "الولايات المتحدة", "🇺🇸", "nhl", 1972, "#6F263D", "#236192", { stadium: "بول أرينا", capacity: 18140, coach: "جاريد بيدنار" }),
  t("vegas-golden", "فيغاس غولدن نايتس", "Vegas Golden Knights", "VGK", "hockey", "الولايات المتحدة", "🇺🇸", "nhl", 2017, "#B4975A", "#333F42", { stadium: "تي موبايل أرينا", capacity: 17367, coach: "بروس كاسيدي" }),
  /* ── Boxing ─────────────────────────────────────────────── */
  t("usyk", "أولكسندر أوزيك", "Oleksandr Usyk", "USY", "boxing", "أوكرانيا", "🇺🇦", "world-title-fights", 1987, "#0057B7", "#FFD700"),
  t("fury", "تايسون فيوري", "Tyson Fury", "FUR", "boxing", "بريطانيا", "🏴", "world-title-fights", 1988, "#0F1B2E", "#FFFFFF"),
  t("dubois", "دانيال دوبوا", "Daniel Dubois", "DUB", "boxing", "بريطانيا", "🏴", "world-title-fights", 1997, "#CE1124", "#000000"),
  t("crawford", "تيرينس كروفورد", "Terence Crawford", "CRA", "boxing", "الولايات المتحدة", "🇺🇸", "world-title-fights", 1987, "#002868", "#BF0A30"),
  t("canov", "ساول كانيلو ألفاريز", "Saúl Canelo Álvarez", "CAN", "boxing", "المكسيك", "🇲🇽", "world-title-fights", 1990, "#006847", "#CE1126"),
  t("beterbiev", "أرتور بيتر بِييف", "Artur Beterbiev", "BET", "boxing", "كندا", "🇨🇦", "world-title-fights", 1985, "#FF0000", "#FFFFFF"),
];

export type Player = {
  slug: string;
  name: string;
  nameEn: string;
  team: string;
  competition: string;
  sport: string;
  nationality: string;
  flag: string;
  number?: number;
  position: string;
  positionGroup: "حراسة المرمى" | "الدفاع" | "الوسط" | "الهجوم" | "أساسي" | "فردي";
  birth: string;
  height?: number;
  weight?: number;
  foot?: "يمين" | "يسار" | "ثنائي";
  seasonApps: number;
  seasonGoals: number;
  seasonAssists: number;
  minutes: number;
  yellows: number;
  reds: number;
  bio: string;
};

const p = (
  slug: string, name: string, nameEn: string, team: string, competition: string, sport: string,
  nationality: string, flag: string, number: number | undefined, position: string,
  positionGroup: Player["positionGroup"], birth: string, apps: number, goals: number, assists: number,
  bio: string, extra: Partial<Player> = {},
): Player => ({
  slug, name, nameEn, team, competition, sport, nationality, flag, number, position, positionGroup,
  birth, seasonApps: apps, seasonGoals: goals, seasonAssists: assists,
  minutes: apps * 82, yellows: Math.max(0, Math.round(apps / 14)), reds: 0, bio, ...extra,
});

export const players: Player[] = [
  /* الأهلي */
  p("mohamed-elshenawy", "محمد الشناوي", "Mohamed El Shenawy", "al-ahly", "egyptian-league", "football", "مصر", "🇪🇬", 1, "حارس مرمى", "حراسة المرمى", "1988-12-18", 22, 0, 0, "قائد الأهلي وحارس مرمى منتخب مصر، من أكثر الحراس حفاظًا على نظافة الشباك في الدوري المصري.", { height: 190, weight: 87, foot: "يمين" }),
  p("mohamed-sherif", "محمد شريف", "Mohamed Sherif", "al-ahly", "egyptian-league", "football", "مصر", "🇪🇬", 9, "مهاجم", "الهجوم", "1996-02-04", 24, 14, 3, "مهاجم الأهلي وهداف الفريق في الدوري، يتميز بالتحرك خلف الدفاع وإنهاء الهجمات.", { height: 180, weight: 76, foot: "يمين" }),
  p("imam-ashour", "إمام عاشور", "Emam Ashour", "al-ahly", "egyptian-league", "football", "مصر", "🇪🇬", 8, "وسط مهاجم", "الوسط", "1998-02-20", 23, 9, 7, "صانع ألعاب الأهلي، أكثر لاعبي الدوري مساهمة في الأهداف من وسط الملعب.", { height: 178, weight: 73, foot: "يسار" }),
  p("aly-maaloul", "علي معلول", "Ali Maaloul", "al-ahly", "egyptian-league", "football", "تونس", "🇹🇳", 21, "ظهير أيسر", "الدفاع", "1990-01-01", 18, 2, 8, "ظهير أيسر تونسي، أحد أبرز منفذي الركلات الحرة في تاريخ الأهلي الحديث.", { height: 173, weight: 70, foot: "يسار" }),
  /* الزمالك */
  p("mahmoud-hamdy", "محمود حمدي الونش", "Mahmoud Hamdy El Wensh", "zamalek", "egyptian-league", "football", "مصر", "🇪🇬", 4, "قلب دفاع", "الدفاع", "1995-06-01", 21, 1, 0, "قائد الزمالك وقلب دفاع منتخب مصر، يعتمد عليه الفريق في الكرات العالية.", { height: 187, weight: 82, foot: "يمين" }),
  p("nasser-maher", "ناصر ماهر", "Nasser Maher", "zamalek", "egyptian-league", "football", "مصر", "🇪🇬", 10, "وسط مهاجم", "الوسط", "1997-08-11", 22, 6, 9, "صانع ألعاب الزمالك، صاحب أعلى معدل تمريرات مفتاحية في الفريق.", { height: 174, weight: 71, foot: "يمين" }),
  /* Premier League */
  p("erling-haaland", "إيرلينغ هالاند", "Erling Haaland", "manchester-city", "premier-league", "football", "النرويج", "🇳🇴", 9, "مهاجم", "الهجوم", "2000-07-21", 26, 24, 4, "مهاجم مانشستر سيتي، أسرع من وصل إلى 100 هدف في تاريخ الدوري الإنجليزي.", { height: 195, weight: 94, foot: "يسار" }),
  p("phil-foden", "فيل فودين", "Phil Foden", "manchester-city", "premier-league", "football", "إنجلترا", "🏴", 47, "جناح أيمن", "الهجوم", "2000-05-28", 25, 11, 9, "جناح مانشستر سيتي ومنتخب إنجلترا، يلعب على الطرفين وخلف المهاجم.", { height: 171, weight: 70, foot: "يسار" }),
  p("rodri", "رودري", "Rodri", "manchester-city", "premier-league", "football", "إسبانيا", "🇪🇸", 16, "وسط مدافع", "الوسط", "1996-06-22", 19, 3, 5, "محور مانشستر سيتي والحائز على الكرة الذهبية، مركز ارتكاز الفريق.", { height: 191, weight: 82, foot: "يمين" }),
  p("bukayo-saka", "بوكايو ساكا", "Bukayo Saka", "arsenal", "premier-league", "football", "إنجلترا", "🏴", 7, "جناح أيمن", "الهجوم", "2001-09-05", 24, 10, 11, "جناح آرسنال، أكثر من صنع أهدافًا في الدوري هذا الموسم.", { height: 178, weight: 72, foot: "يسار" }),
  p("martin-odegaard", "مارتن أوديغارد", "Martin Ødegaard", "arsenal", "premier-league", "football", "النرويج", "🇳🇴", 8, "وسط مهاجم", "الوسط", "1998-12-17", 23, 7, 8, "قائد آرسنال وصانع ألعابه، مسؤول عن تنظيم اللعب في الثلث الأخير.", { height: 178, weight: 68, foot: "يسار" }),
  p("mohamed-salah", "محمد صلاح", "Mohamed Salah", "liverpool", "premier-league", "football", "مصر", "🇪🇬", 11, "جناح أيمن", "الهجوم", "1992-06-15", 26, 19, 12, "جناح ليفربول وقائد منتخب مصر، الهداف التاريخي لليفربول في الدوري الإنجليزي.", { height: 175, weight: 71, foot: "يسار" }),
  p("virgil-vandijk", "فيرجيل فان دايك", "Virgil van Dijk", "liverpool", "premier-league", "football", "هولندا", "🇳🇱", 4, "قلب دفاع", "الدفاع", "1991-07-08", 26, 3, 1, "قائد ليفربول وأحد أفضل قلوب الدفاع في جيله.", { height: 195, weight: 92, foot: "يمين" }),
  p("bruno-fernandes", "برونو فيرنانديز", "Bruno Fernandes", "manchester-united", "premier-league", "football", "البرتغال", "🇵🇹", 8, "وسط مهاجم", "الوسط", "1994-09-08", 25, 8, 10, "قائد مانشستر يونايتد ومنفذ ركلات الجزاء والركلات الثابتة.", { height: 179, weight: 69, foot: "يمين" }),
  p("cole-palmer", "كول بالمر", "Cole Palmer", "chelsea", "premier-league", "football", "إنجلترا", "🏴", 20, "وسط مهاجم", "الوسط", "2002-05-06", 22, 12, 8, "صانع ألعاب تشيلسي، أكثر لاعب مساهمة في الأهداف مع البلوز هذا الموسم.", { height: 185, weight: 76, foot: "يسار" }),
  p("alexander-isak", "ألكسندر إيزاك", "Alexander Isak", "newcastle", "premier-league", "football", "السويد", "🇸🇪", 14, "مهاجم", "الهجوم", "1999-09-21", 24, 17, 3, "مهاجم نيوكاسل وهداف الفريق، يتميز بالسرعة والإنهاء الهادئ.", { height: 192, weight: 77, foot: "يمين" }),
  /* La Liga */
  p("kylian-mbappe", "كيليان مبابي", "Kylian Mbappé", "real-madrid", "la-liga", "football", "فرنسا", "🇫🇷", 9, "مهاجم", "الهجوم", "1998-12-20", 26, 22, 6, "مهاجم ريال مدريد، أسرع لاعب في الليغا هذا الموسم وأبرز المرشحين للحذاء الذهبي.", { height: 178, weight: 75, foot: "يمين" }),
  p("vinicius-junior", "فينيسيوس جونيور", "Vinícius Júnior", "real-madrid", "la-liga", "football", "البرازيل", "🇧🇷", 7, "جناح أيسر", "الهجوم", "2000-07-12", 25, 13, 10, "جناح ريال مدريد الأيسر، أكثر لاعبي الليغا محاولة للمراوغة.", { height: 176, weight: 73, foot: "يمين" }),
  p("lamine-yamal", "لامين يامال", "Lamine Yamal", "barcelona", "la-liga", "football", "إسبانيا", "🇪🇸", 19, "جناح أيمن", "الهجوم", "2007-07-13", 24, 9, 14, "جناح برشلونة الصاعد، أصغر لاعب يسجل في تاريخ الكلاسيكو.", { height: 180, weight: 72, foot: "يسار" }),
  p("robert-lewandowski", "روبرت ليفاندوفسكي", "Robert Lewandowski", "barcelona", "la-liga", "football", "بولندا", "🇵🇱", 9, "مهاجم", "الهجوم", "1988-08-21", 23, 15, 2, "مهاجم برشلونة، ثالث الهدافين التاريخيين لدوري أبطال أوروبا.", { height: 185, weight: 81, foot: "يمين" }),
  p("julian-alvarez", "خوليان ألفاريز", "Julián Álvarez", "atletico-madrid", "la-liga", "football", "الأرجنتين", "🇦🇷", 19, "مهاجم ثانٍ", "الهجوم", "2000-01-31", 26, 16, 7, "مهاجم أتلتيكو مدريد، يجمع بين الضغط العالي والإنهاء داخل المنطقة.", { height: 170, weight: 71, foot: "يمين" }),
  /* Serie A / Europe */
  p("lautaro-martinez", "لاوتارو مارتينيز", "Lautaro Martínez", "inter-milan", "serie-a", "football", "الأرجنتين", "🇦🇷", 10, "مهاجم", "الهجوم", "1997-08-22", 25, 14, 5, "قائد إنتر ميلان وهداف الفريق في الدوري الإيطالي.", { height: 174, weight: 72, foot: "يمين" }),
  p("harry-kane", "هاري كين", "Harry Kane", "bayern-munich", "champions-league", "football", "إنجلترا", "🏴", 9, "مهاجم", "الهجوم", "1993-07-28", 24, 21, 8, "مهاجم بايرن ميونخ وهداف منتخب إنجلترا التاريخي.", { height: 188, weight: 86, foot: "يمين" }),
  /* Basketball */
  p("nikola-jokic", "نيكولا يوكيتش", "Nikola Jokić", "denver-nuggets", "nba", "basketball", "صربيا", "🇷🇸", 15, "سنتر", "أساسي", "1995-02-19", 62, 0, 0, "أفضل لاعب في الدوري مرتين، أكثر اللاعبين تمريرًا حاسمًا من مركز السنتر.", { height: 211, weight: 129 }),
  p("stephen-curry", "ستيفن كوري", "Stephen Curry", "golden-state", "nba", "basketball", "الولايات المتحدة", "🇺🇸", 30, "صانع ألعاب", "أساسي", "1988-03-14", 58, 0, 0, "الهداف التاريخي للرميات الثلاثية في دوري كرة السلة الأمريكي.", { height: 188, weight: 84 }),
  p("giannis", "يانيس أنتيتوكونمبو", "Giannis Antetokounmpo", "milwaukee-bucks", "nba", "basketball", "اليونان", "🇬🇷", 34, "جناح قوي", "أساسي", "1994-12-06", 60, 0, 0, "أفضل لاعب في الدوري مرتين، يجمع بين الطول والسرعة في الاختراق.", { height: 211, weight: 110 }),
  p("shai", "شاي غيلجيوس ألكسندر", "Shai Gilgeous-Alexander", "okc-thunder", "nba", "basketball", "كندا", "🇨🇦", 2, "صانع ألعاب", "أساسي", "1998-07-12", 64, 0, 0, "هداف دوري كرة السلة الأمريكي وقائد أوكلاهوما سيتي ثاندر.", { height: 198, weight: 90 }),
  /* Tennis */
  p("carlos-alcaraz", "كارلوس ألكاراز", "Carlos Alcaraz", "alcaraz", "atp-tour", "tennis", "إسبانيا", "🇪🇸", undefined, "فردي", "فردي", "2003-05-05", 58, 0, 0, "المصنف الأول عالميًا، جمع بين بطولات الجراند سلام الأربع على أسطح مختلفة.", { height: 183, weight: 74 }),
  p("jannik-sinner", "يانيك سينر", "Jannik Sinner", "sinner", "atp-tour", "tennis", "إيطاليا", "🇮🇹", undefined, "فردي", "فردي", "2001-08-16", 61, 0, 0, "المصنف الثاني عالميًا، يتميز بضربة خلفية قوية وثبات في المجموعات الطويلة.", { height: 191, weight: 80 }),
  /* Handball */
  p("ahmed-elahmar", "أحمد الأحمر", "Ahmed El Ahmar", "zamalek-handball", "egypt-handball", "handball", "مصر", "🇪🇬", 24, "جناح أيمن", "أساسي", "1984-11-27", 20, 96, 30, "أحد أبرز لاعبي كرة اليد المصرية تاريخيًا، وقائد الزمالك لسنوات طويلة.", { height: 182, weight: 84 }),
];

/* ── lookups ─────────────────────────────────────────────── */
export const sportBySlug = (s: string) => sports.find((x) => x.slug === s);
export const competitionBySlug = (s: string) => competitions.find((x) => x.slug === s);
export const teamBySlug = (s: string) => teams.find((x) => x.slug === s);
export const playerBySlug = (s: string) => players.find((x) => x.slug === s);
export const teamsByCompetition = (c: string) => teams.filter((x) => x.competition === c);
export const playersByTeam = (t: string) => players.filter((x) => x.team === t);
export const competitionsBySport = (s: string) => competitions.filter((x) => x.sport === s);
