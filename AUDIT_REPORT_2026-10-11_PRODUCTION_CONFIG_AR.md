# NEMO SPORTS — تقرير جاهزية الإنتاج: الإعدادات والتحقق
**التاريخ:** 2026-10-11 · **الفرع:** `arena/1460e25f-sport` (عند `8b5bf79` = حالة `main` بعد دمج PR #32) · **الموقع الإنتاجي:** https://nemo-sports.vercel.app

> **طبيعة هذا التقرير:** تدقيق إعدادات وتحقق فقط. لم يُدمج أو يُدفع أو يُغلق أي PR، ولم يُنشر أي تغيير، ولم تُعدَّل أي بيانات إنتاجية، ولم تُطبع أو تُخمّن أي قيمة سرية. كل فحص إنتاجي جرى بطلبات **GET عامة للقراءة فقط**. لم يُنشأ أي لوحة إدارة جديدة ولم تُضعَّف أي حماية.

> **ملاحظة على PR #26/#27/#33:** بقيت كما هي (PR #26 و#27 مفتوحان، PR #33 مفتوح). لا علاقة لهذا العمل بها.

---

## 0. منهجية الفحص وحدوده

| البند | ما فعلته |
|---|---|
| الإنتاج | طلبات GET عامة فقط على `/api/v1/*`، `/robots.txt`، `/sitemap.xml`، وصفحات عامة (`/`، `/live`، `/matches?...`، `/watch`، `/admin`)، بين **11:23–11:27 UTC** من 2026-10-11 |
| الكود | قراءة الملفات على الفرع الحالي؛ لا تعديل على أي ملف برمجي |
| المباريات الخمس | تأكيد من مصادر عامة مستقلة (BBC / ESPN / Bundesliga.com / Marca / Sofascore / worldfootball / الموقع الرسمي للمزوّد) — انظر §6 |
| ما لم أستطع فعله | (أ) قراءة HTML الخام أو ترويسات الاستجابة (أدوات الجلب تُعيد نصًّا/ماركداون، فلا أرى `<meta name="robots">`)؛ (ب) الدخول للوحة الإدارة (لا بيانات دخول مصرّح بها)؛ (ج) الاتصال بقاعدة بيانات الإنتاج أو Redis |

**قاعدة الحكم:** لا أعتبر أي مزوّد أو ميزة «تعمل» إلا بدليل استجابة فعلي من الإنتاج، ولا أعتبر أي إعداد «مضبوط» إلا بدليل غير مباشر قاطع أو بفحص لا يكشف القيمة.

---

## 1. الحقائق المؤكدة (بأدلتها)

### 1.1 حالة الإنتاج (قراءة فقط، 2026-10-11 11:23–11:27 UTC)

| # | الفحص | النتيجة | الدليل/الأثر |
|---|---|---|---|
| 1 | `GET /api/v1/live?sport=all` | **29 مباراة مباشرة** (تنس 9 · كريكيت 20 · كرة قدم 0 · سلة 0)، `meta.complete=true`، `failedSports=[]`، `provider:"sportscore"`، `fetchedAt=2026-10-11T11:23:52Z` | **مزوّد البيانات الحقيقي يعمل في الإنتاج** (SportScore بلا مفتاح) |
| 2 | الصفحة الرئيسية و`/live` | «مباشر الآن (29) · كل الرياضات» — نفس العدد | اتساق العدّ بعد PR #31 |
| 3 | `GET /api/v1/matches?date=today&sport=all&status=live` | 200، صفوف كريكيت/تنس مباشرة فعلًا | الفلاتر والـAPI يعملان |
| 4 | `GET /api/v1/football-data/standings?competition=PL` | 20 صفًا حقيقيًا + `attribution:"Powered by SportScore"` | جدول الترتيب يعمل، **وإسناد المزوّد صار صحيحًا** (كان يزعم Football-Data.org) |
| 5 | `GET /api/v1/football-data/status` | `configured:false`، `registered:false`، `"FOOTBALL_DATA_API_KEY is not set on the server"` | **لا مفتاح Football-Data.org في الإنتاج** (مؤكد من الخادم نفسه) |
| 6 | `GET /api/cron/fetch-news` (بدون توثيق) | `503 {"code":"not_configured"}` — «NEMO_INGEST_TOKEN / CRON_SECRET is not set» | **لا سر استيعاب مضبوط** ⇒ مهمة Vercel Cron اليومية 03:30 UTC **مرفوضة كل يوم** |
| 7 | `GET /api/v1/news?limit=50` | 13 خبرًا، `lastSuccessfulUpdate:null`، `lastFailedAttempt:"2026-10-09T01:02:27Z"`، `freshness.state:"never"`، **14 مصدرًا كلها `never`**، الجدولة = `vercel-cron` كل 1440 دقيقة، عتبة القدم 2880 دقيقة | الأخبار **قديمة/مجمّدة منذ 2026-10-09** ولا يوجد أي تحديث ناجح مسجَّل |
| 8 | `GET /api/v1/system` | `401 {"code":"unauthorized"}` | **تهيئة دخول الإدارة موجودة** (إما `ADMIN_ACCESS_TOKEN` أو `ADMIN_USERNAME`+`ADMIN_PASSWORD_HASH`)، والفشل مُغلَق (fail-closed) |
| 9 | `GET /admin` | 404 عامة (لا تُعلن عن اللوحة) | مطابق لسلوك `middleware.ts` |
| 10 | `GET /robots.txt` | `Allow: /` · `Disallow: /admin /account /api/` · `Host` و`Sitemap` على نفس المضيف | سليم ومشتق من `lib/site.ts` |
| 11 | `GET /sitemap.xml` | يحتوي أقسام البيانات (`/matches`, `/live`, …) + روابط مباريات كثيرة من مزوّد حقيقي + الخمس التحريرية | `dataServable()=true` لحظة الفحص ⇒ الصفحات تُخدَم قابلة للفهرسة، وليست في وضع demo |
| 12 | `GET /watch` | «لا توجد مباريات مربوطة ببث الآن» + سجل 8 نواقل بتحديث **الجمعة 9 أكتوبر** | لا بثوث منشورة؛ سجل النواقل بيانات حقيقية محفوظة |
| 13 | `GET /matches?date=2026-10-09` | الخمس تظهر بوسم **«غير مؤكدة»** + شارة «إدخال تحريري · ليس تحققًا آليًا من المزود» | عرض الحالة صادق، لكن سطر المصدر أسفل الصفحة يقول «المصدر: SportScore · جلب مباشر» ⇒ **تضارب إسناد** |
| 14 | `GET /matches/malaga-vs-espanyol` | 200 + «المصدر: تحريري (إدارة نيمو سبورتس)» | صفحة المباراة التحريرية تعمل ولا تعرض نتيجة مخترعة |

### 1.2 استنتاج قوي (غير مباشر) عن قاعدة البيانات: **الإنتاج يستخدم Postgres دائم فعلًا**

لا أملك وصولًا للقاعدة، لكن الأدلة التالية متضافرة:

1. **سجل النواقل الثمانية** على `/watch` يحمل تاريخ «الجمعة 9 أكتوبر» لكل صف. البذرة الافتراضية في `lib/broadcasts.ts` تكتب `createdAt/updatedAt = now()` لحظة البذر — لذا لو كانت البذرة في ذاكرة كل نسخة serverless لظهر تاريخ **اليوم (11 أكتوبر)** بعد أي إقلاع بارد. بقاءها على 9 أكتوبر يعني أن الصفوف مقروءة من **مخزن دائم** (وأن `DATABASE_URL` مضبوط ومتصل؛ لأن `listBroadcasters` تُعيد `[]` عندما يفشل الاتصال رغم وجود المتغير).
2. **الأخبار**: 13 خبرًا + `lastFailedAttempt=2026-10-09T01:02:27Z` — بيانات من 7–9 أكتوبر ما زالت تُقرأ، وهذا مستحيل مع مخزن الذاكرة عبر نُس Vercel المتعددة.
3. **المباريات التحريرية**: `editorialUpdatedAt=2026-10-09T00:43:56Z` (وهو غير موجود في ملف الريبو `db/admin-matches.json` الذي يحمل `2026-10-08T12:00`) ⇒ الصفوف كُتبت فعلًا في قاعدة بيانات في 9 أكتوبر وبقيت.
4. كود `lib/db/store-policy.ts` يمنع الكتابة في الإنتاج بلا `DATABASE_URL` — ومع ذلك ظهرت هذه البيانات المحدَّثة، فلا مسار آخر أنتجها.

**الحكم:** `infrastructure.canonical = "postgres"` في الإنتاج: مرجّح جدًا (High). التأكيد القاطع يتطلب طلبًا واحدًا موثّقًا: `GET /api/v1/system` بعد تسجيل دخول مصرّح به (انظر §4).

### 1.3 حقائق من الكود (لا تتطلب تحققًا إنتاجيًا)

- **مزوّدو البيانات المعرّفون:** SportScore (بلا مفتاح، مفعّل افتراضيًا) · Football-Data.org · Sportradar · Sportmonks · API-Football · TheSportsDB. **وضع demo يُسجَّل فقط** خارج الإنتاج أو عند `NEMO_SDL_MODE=demo`، ولا يُستخدم كبديل صامت في الإنتاج (`packages/sdl/src/index.ts`).
- **لا استبدال صامت لبيانات المعاينة في الإنتاج:** `demoContentVisible()` تُعيد `false` في الإنتاج مع مفاتيح مزوّد (وهو الحال)، وواجهات الفشل تعرض «غير متاح» صريحة (`components/ui/DataUnavailable.tsx`, `NotConnected`).
- **الاستيعاب المجدول في الإنتاج يشترط قاعدة بيانات:** `lib/news/pipeline.ts:445` يرفع `DurableStorageRequiredError` (503) إذا لم يوجد اتصال DB، ويأخذ `pg_try_advisory_xact_lock` لمنع التنفيذ المتزامن.
- **تعدد الأسرار المقبولة:** مسار الأخبار يقبل `NEMO_INGEST_TOKEN` أو `CRON_SECRET` أو `VERCEL_CRON_SECRET` (الأخير **غير موثّق** في `.env.example` ولا في README). مسار `/api/v1/ingest` يقبل الأولين فقط.
- **ملفات JSON ليست مخزنًا احتياطيًا في الإنتاج:** `saveDiskMatches()` في `lib/admin-matches.ts` تعود فورًا عند `NODE_ENV==="production"`؛ الملف يُقرأ فقط كبذرة لذاكرة التطوير/الاختبار.
- **إعدادات SEO المحفوظة غير موصولة:** `getSiteSettings()` تُقرأ في `/admin/settings` و`/admin/live` فقط؛ لا يستعملها `app/layout.tsx` ولا `sitemap.ts` ولا أي صفحة عامة (تفصيل في §7).

---

## 2. ما تعذّر التحقق منه (صراحةً)

| ما لم يُتحقق | السبب | كيف يُتحقق (انظر §11) |
|---|---|---|
| `infrastructure.canonical`/`cache` على الإنتاج | `/api/v1/system` يتطلب جلسة إدارة | طلب واحد بعد دخول مصرّح به |
| هل نُفِّذ `db/schema.sql` (الجداول الكنسية الـ20) و`seed.sql` على قاعدة الإنتاج | لا وصول مباشر | `npm run db:setup` (آمن التكرار) ثم `npm run db:verify` في بيئة معاينة/Staging تشير لنفس القاعدة |
| وجود `REDIS_URL` في الإنتاج | لا مسار عام يكشفه | `/api/v1/system` بعد الدخول، أو `/admin/providers` |
| أي متغيّر إدارة مضبوط بالضبط (`ADMIN_ACCESS_TOKEN` أم `USERNAME`+`HASH`) | لا يمكن تمييزه من خارج اللوحة (وهذا مقصود أمنيًا) | داخل Vercel → Environment Variables (أسماء فقط) |
| هل الاستيعاب سينجح فعليًا بعد ضبط السر | يتطلب تشغيلًا موثّقًا يكتب لبيانات | بيئة معاينة + قاعدة بيانات اختبارية + `scripts/mock-news-feeds.mjs` (بلا لمس الإنتاج) |
| وسم `<meta name="robots">` الفعلي لكل صفحة | الأداة تُعيد نصًّا لا HTML | `curl -s <url> \| grep -o '<meta name="robots"[^>]*>'` |
| حالة الفهرسة في Google Search Console | خارج نطاق الأدوات | فحص يدوي من مالك الموقع |
| صحة سجلات الإدارة (`audit_log`) وعدد المستخدمين | يتطلب دخولًا | `/admin/activity` و`/admin/users` |

---

## 3. المهمة 1 — جرد متغيّرات البيئة

**الرموز:** إلزامي = بدونه تفقد الميزة وظيفتها في الإنتاج · اختياري = تحسين/تحكم. «المكان»: Vercel → Project → Settings → **Environment Variables** (مع تحديد Production / Preview / Development)، ولا يوضع أي سر في Git أو في `NEXT_PUBLIC_*`.

### 3.1 قاعدة البيانات والتخزين الدائم

| المتغير | يُستخدم في | إلزامي؟ | ما ينكسر عند غيابه | كيف تتحقق من وجوده بلا كشف القيمة |
|---|---|---|---|---|
| `DATABASE_URL` | `lib/db/pg.ts:35,116` · `lib/db/store-policy.ts:40,64` · جميع متاجر الإدارة (`lib/admin-matches.ts:411`, `admin-teams/players/competitions/users`, `lib/activity.ts:136`, `lib/broadcasts.ts:223,299`, `lib/manual-news.ts:139`, `lib/match-overrides.ts:129`, `lib/match-streams.ts:261,384`, `lib/site-settings.ts:78`, `lib/news/store.ts:210`) | **نعم في الإنتاج** | كل كتابة إدارية تُرفض (رسالة «قاعدة البيانات غير مُهيّأة»)؛ لا استيعاب أخبار (503)؛ لا سجل نشاط دائم؛ لا إعدادات موقع؛ لا نواقل/بثوث دائمة. الصفحات تستمر بالعمل للقراءة فقط من المزوّد | بعد دخول الإدارة: `GET /api/v1/system` → `infrastructure.canonical == "postgres"`. أو `npm run db:verify` (exit 0). أو `[ -n "$DATABASE_URL" ] && echo set \|\| echo unset` |
| `PG_POOL_MAX` | `lib/db/pg.ts:43` | اختياري (افتراضي 5) | لا شيء (يُنصح 5 مع روابط pooler على serverless) | `[ -n "$PG_POOL_MAX" ]` |

### 3.2 Redis والكاش

| المتغير | يُستخدم في | إلزامي؟ | ما ينكسر عند غيابه | تحقق آمن |
|---|---|---|---|---|
| `REDIS_URL` | `lib/cache/redis.ts:34,90` | اختياري | الكاش والـrate-limit يصيران **لكل نسخة على حدة** (Vercel يشغّل عدة نسخ) ⇒ تباين مؤقت في الأعداد وحدود المزوّد. لا توقف | `/api/v1/system` → `infrastructure.cache == "redis"`، أو نبضة Redis في `npm run db:verify` |
| `REDIS_KEY_PREFIX` | `lib/cache/redis.ts:80` | اختياري | لا شيء (فصل مساحات المعاينة/الإنتاج) | فحص الاسم فقط |
| `NEMO_DEBUG` | `lib/cache/redis.ts:82` | اختياري | لا شيء؛ `1` يطبع عمليات كاش للمطورين (يُفضّل إبقاؤه غير مضبوط في الإنتاج) | فحص الاسم فقط |

### 3.3 مزوّدو البيانات الرياضية

| المتغير | يُستخدم في | إلزامي؟ | ما ينكسر عند غيابه | تحقق آمن |
|---|---|---|---|---|
| `NEMO_SPORTSCORE_ENABLED` | `packages/sdl/src/index.ts:302` · `lib/site.ts:58` · `lib/providers.ts:147` · `components/layout/Footer.tsx:12` | اختياري (**مفعّل افتراضيًا، بلا مفتاح**) | `0` يعطّل مصدر البيانات الأساسي ⇒ تعطّل المباشر/الترتيب/الإسناد (وقد يُخفض الفهرسة) | دليل عملي: `GET /api/v1/live?sport=all` يعيد صفوفًا بمزوّد `sportscore` (متحقق منه الآن) |
| `SPORTSCORE_BASE_URL` | `packages/sdl/src/adapters/sportscore.ts:304` | اختياري | لا شيء؛ توجيه غير سليم = فشل مزوّد. **لا توجّهه لمضيف لا تملكه** | فحص الاسم فقط + مراجعة سياسة الإذن |
| `NEMO_SPORTSCORE_RELAY_ENABLED` | `app/api/v1/sportscore-relay/[...path]/route.ts:18` · adapter:307 | اختياري (**معطّل افتراضيًا**) | لا شيء (الوضع الافتراضي يخفي الـrelay بـ503) | `curl -s -o /dev/null -w '%{http_code}' /api/v1/sportscore-relay/matches` → 503 = معطّل |
| `FOOTBALL_DATA_API_KEY` | `packages/sdl/src/index.ts:305` · `lib/football-data.ts:19` · `lib/site.ts:66` · `Footer.tsx:13` | اختياري لكنه **مفتاح كرة القدم الثاني/الترتيب والهدافين** | اليوم: لا مصدر ثانٍ لكرة القدم؛ `/api/v1/football-data/standings` يخدمه SportScore؛ الهدافون قد تظل غير متاحة | `GET /api/v1/football-data/status` → `.configured` (مؤكد الآن: `false`) |
| `FOOTBALL_DATA_REQUESTS_PER_MINUTE` / `FOOTBALL_DATA_COMPETITIONS` / `FOOTBALL_DATA_SEASON` / `FOOTBALL_DATA_BASE_URL` | `packages/sdl/src/index.ts:306-309` | اختياري | قيم افتراضية آمنة (8 طلبات/دقيقة، البطولات الكبرى، الموسم الحالي) | `/api/v1/football-data/status` → `.rateLimit`, `.baseUrl` |
| `SPORTRADAR_KEY` | `packages/sdl/src/index.ts:292` · adapter:114 | اختياري | لا شيء (مزوّد بديل) | `/admin/providers` أو `/api/v1/system` → `missingProviders` |
| `SPORTMONKS_TOKEN` (أو `SPORTMONKS_API_TOKEN`) | `packages/sdl/src/index.ts:296` · adapter:195 | اختياري | لا شيء | كما أعلاه — **اسم واحد فقط من التهجئتين** |
| `API_FOOTBALL_KEY` | `packages/sdl/src/index.ts:297` · adapter:142 | اختياري | لا شيء | كما أعلاه |
| `THESPORTSDB_KEY` (أو `THESPORTSDB_API_KEY`) | `packages/sdl/src/index.ts:299` · adapter:132 | اختياري | لا شيء (بيانات فرق/لاعبين وصور فقط) | كما أعلاه |

> **ملاحظة مهمة:** وجود مصدر واحد عامل (SportScore) هو ما يجعل الموقع «قابلًا للفهرسة» و«قابلًا للخدمة» (`dataServable()`). لا تفترض أنه مضبوط في بيئة أخرى لأن سجلاتك المحلية تختلف.

### 3.4 استيعاب الأخبار (RSS بلا مفاتيح)

| المتغير | يُستخدم في | إلزامي؟ | ما ينكسر عند غيابه | تحقق آمن |
|---|---|---|---|---|
| `CRON_SECRET` **أو** `NEMO_INGEST_TOKEN` **أو** `VERCEL_CRON_SECRET` | `app/api/cron/fetch-news/route.ts:27` · `app/api/v1/ingest/route.ts:29` · `app/admin/news/page.tsx:166` | **نعم للتحديث التلقائي** | كل زيارة مجدولة تُرفض 503 ⇒ الأخبار تتجمد (وهو **ما يحدث الآن في الإنتاج**) | `curl -s -o /dev/null -w '%{http_code}' /api/cron/fetch-news` → **401 = مضبوط**، **503 = غير مضبوط**. و`/admin/news` يعرض «هل السكرت مهيّأ» بدون قيمة |
| `NEMO_NEWS_SCHEDULER_INTERVAL_MINUTES` | `lib/news/schedule.ts` (وسيط env) | اختياري | بغيابه يُفترض الأسوأ/الأبطأ (يومي) فتكون عتبة القدم 48 ساعة | `GET /api/v1/news` → `.meta.freshness.schedule.source` (`vercel-cron` أم `external`) |
| `NEMO_NEWS_CONCURRENCY` | `lib/news/pipeline.ts:376` | اختياري (افتراضي 3، حد 1–4) | لا شيء | فحص الاسم فقط |
| `NEMO_NEWS_AUTO_MODERATION` | `lib/news/moderation.ts:80` | اختياري (**مفعّل افتراضيًا**؛ `0` يعطّله) | بدونه تُبقى المواد التجارية/غير الرياضية منشورة (بلا حذف) | `GET /api/cron/fetch-news` المُصرّح → `.moderation.applied` |
| `NEMO_NEWS_DISABLE` | `lib/news/pipeline.ts:342` | اختياري (حالة طوارئ فقط) | `1` يوقف الجلب كليًا | فحص الاسم فقط |
| `NEMO_NEWS_FEED_BASE_URL` | `lib/news/sources.ts:24` | **يجب أن يبقى غير مضبوط في الإنتاج** | توجيه خلاصات RSS لمضيف آخر (للاستخدام في الاختبار فقط) | فحص الاسم فقط + مراجعة envex |
| `NEMO_BOOTSTRAP_LEGACY_DATA` | `lib/admin-matches.ts:420` | **اتركه غير مضبوط** | `1` يسمح بإدراج السجلات التحريرية القديمة في `admin_matches` الفارغة فقط | فحص الاسم فقط |

### 3.5 مصادقة الإدارة والجلسات

| المتغير | يُستخدم في | إلزامي؟ | ما ينكسر عند غيابه | تحقق آمن |
|---|---|---|---|---|
| `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH` | `lib/admin-auth.ts:19,26` · `lib/admin-auth-shared.ts:47` · `middleware.ts:135` (غير مباشر) | **واحدة من طريقتَي الدخول على الأقل** | لا دخول بكلمة مرور (يبقى التوكن كطريقة انقاذ) | `GET /api/v1/system` → **401 = تهيئة موجودة** (مؤكد الآن)، **503 = لا تهيئة** |
| `ADMIN_ACCESS_TOKEN` | `lib/admin-auth-shared.ts:46,54` · `lib/admin-auth.ts:20` · `lib/admin-session.ts:21` · `middleware.ts:135` | بديل «إنقاذ» | بغيابه لا Basic Auth احتياطي | كما أعلاه |
| `ADMIN_SESSION_SECRET` | `lib/admin-auth-shared.ts:53` | اختياري | بغيابه يُشتق مفتاح توقيع الكوكي من التوكن/الهاش (يعمل، لكن **تدوير الهاش يُبطل الجلسات** وليس التدوير مستقلًا) | فحص الاسم فقط |
| توليد الهاش | `npm run admin:hash -- '<كلمة طويلة>'` | — | يُنتج `ADMIN_PASSWORD_HASH` بلا طباعة كلمة المرور | تشغيل الأمر محليًا فقط |

### 3.6 سياسة البث والمحتوى وSEO

| المتغير | يُستخدم في | إلزامي؟ | ما ينكسر عند غيابه | تحقق آمن |
|---|---|---|---|---|
| `NEMO_STREAM_DOMAIN_POLICY` (أو `STREAM_DOMAIN_POLICY`، أو `NEMO_STRICT_STREAM_DOMAINS=1`) | `lib/stream-policy.ts:90,93` | اختياري (افتراضي `open`) | `allowlist` يقيّد روابط البث على نطاقات مرجعية + `NEMO_STREAM_ALLOWED_DOMAINS` | `/admin/streams/validate` أو فحص الاسم |
| `NEMO_STREAM_ALLOWED_DOMAINS` | `lib/stream-policy.ts:99` | اختياري | لا شيء في `open` | فحص الاسم |
| `NEXT_PUBLIC_SITE_URL` | `lib/site.ts:32` · `next.config.ts:36` (HSTS) | اختياري لكن **موصى به** | بغيابه يُشتق الأصل من `VERCEL_PROJECT_PRODUCTION_URL` ثم `VERCEL_URL` ثم `https://nemo-sports.vercel.app` — وهو صحيح حاليًا (يتضح من robots/sitemap) | `curl -s /robots.txt \| grep Sitemap` (URL عام لا سر) |
| `NEXT_PUBLIC_DEMO_CONTENT` | `lib/site.ts:91` | **يجب أن يبقى `0`/غير مضبوط في الإنتاج** | `1` يُظهر بيانات المعاينة ويمنع الفهرسة تمامًا | `GET /sitemap.xml` يحتوي أقسام البيانات = غير مضبوط على 1 (متحقق) |
| `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL` | `lib/site.ts:33-34` · `next.config.ts:36` | يضبطهما Vercel تلقائيًا | لا شيء | فحص الاسم |

### 3.7 متغيّرات خاصة بالاختبار فقط (لا تضبطها على Vercel)

`NEMO_TEST_MEMORY_ONLY` · `NEMO_QA_PASSWORD` · `NEMO_QA_ENV_FILE` · `BASE` · `MOCK` · `REPLAY` · `CHROMIUM_PATH` · `QA_PACKAGE_JSON` — تُستخدم في `scripts/*`. ضبطها في الإنتاج قد يعطّل مسارات (خصوصًا `NEMO_TEST_MEMORY_ONLY=1`).

### 3.8 «فحص وجود بلا كشف قيمة» — أمر واحد آمن

```bash
# يطبع "set/unset" فقط، ولا يطبع أي قيمة. نفّذه في بيئة المعاينة/Staging محليًا.
for v in DATABASE_URL PG_POOL_MAX REDIS_URL REDIS_KEY_PREFIX \
         NEMO_SPORTSCORE_ENABLED SPORTSCORE_BASE_URL FOOTBALL_DATA_API_KEY \
         CRON_SECRET NEMO_INGEST_TOKEN VERCEL_CRON_SECRET \
         ADMIN_USERNAME ADMIN_PASSWORD_HASH ADMIN_ACCESS_TOKEN ADMIN_SESSION_SECRET \
         NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_DEMO_CONTENT NEMO_NEWS_FEED_BASE_URL; do
  [ -n "${!v:-}" ] && echo "$v=set" || echo "$v=unset"
done
```
> على Vercel: `vercel env ls production` (يعرض **الأسماء فقط**) — لا تنسخ أي قيمة إلى محادثة أو تقرير أو لقطة شاشة.

---

## 4. المهمة 2 — جاهزية قاعدة البيانات والاستمرارية

| السؤال | الإجابة | الدليل/الحالة |
|---|---|---|
| هل الإنتاج يستخدم قاعدة بيانات دائمة؟ | **مرجّح جدًا: نعم** | §1.2 (سجل النواقل بتاريخ 9 أكتوبر، أخبار من 7–9 أكتوبر، `editorialUpdatedAt` من 9 أكتوبر) |
| هل نُفِّذت الترحيلات؟ | **جزئيًا ومؤكد ضمنيًا**: التطبيق يطبّق DDL الخاص به تلقائيًا (`CREATE TABLE IF NOT EXISTS` + `ADD COLUMN IF NOT EXISTS`) لجداول `news_articles`, `rss_sources`, `news_fetch_log`, `admin_matches`, `admin_teams/players/competitions/users`, `site_settings`, `audit_log`, `broadcasts`, `match_streams`. أما **الجداول الكنسية الـ20** (`db/schema.sql`) و`db/seed.sql` فلم أستطع تأكيد تنفيذها | الأدلة: عمل الأخبار/الإدارة المؤرخة + `migration-0005` مضمّنة ليديًا في `lib/news/store.ts:82-85` و`lib/match-streams.ts:210-212`. التحقق القاطع: §11/أ |
| هل تبقى الأخبار وسجلات الإدارة بعد إعادة التشغيل؟ | **نعم (على الأرجح) في الإنتاج**؛ **لا** في أي بيئة بلا `DATABASE_URL` | `lib/db/store-policy.ts` يرفض الكتابة في الإنتاج بلا DB؛ والبيانات المؤرخة ما زالت تُقرأ اليوم |
| هل تُستخدم ملفات JSON كمخزن احتياطي؟ | **لا في الإنتاج**: `saveDiskMatches()` تخرج مبكرًا عند `NODE_ENV==="production"`؛ الملف `db/admin-matches.json` بذرة للتطوير/الاختبار فقط | `lib/admin-matches.ts` (الدالتان `loadDiskMatches`/`saveDiskMatches`) — الصفوف الخمسة الإنتاجية تحمل طوابع ليست في الملف |
| هل بيئة الإنتاج متسقة مع الكود؟ | **نعم في الأساس**: الرياضات/المباريات/الترتيب تعمل من SportScore؛ **غير متسقة في الأخبار المجدولة** (لا سر) و**غير مؤكدة في Redis** | §1.1 #1–#7 · §1.2 |
| المخاطر المتبقية | (أ) لو كان `DATABASE_URL` لقاعدة **preview** بالخطأ، ستُخلَط بيانات المعاينة بالإنتاج؛ (ب) بلا `REDIS_URL` تتعدد حدود المعدل بين نسخ serverless؛ (ج) بلا الجداول الكنسية يفشل `/api/v1/ingest` (المهمة اليومية 03:00 UTC) — لذا يجب فحصه | خطوات §11 |

**لم أتصل بقاعدة الإنتاج ولم أكتب إليها إطلاقًا.** كل ما ورد أعلاه استنتاج من سلوك الواجهات العامة + الكود.

---

## 5. المهمة 3 — البيانات الرياضية الحقيقية والأخبار: مسار التدفق الفعلي

### 5.1 مسار البيانات الرياضية
`الصفحة/المسار` → `lib/live-board.ts` أو `lib/sdl-gateway.ts` → `SportsDataLayer` (`packages/sdl/src`) → سلسلة الأولويات (`packages/sdl/src/priority.ts`) → محوّل المزوّد (`adapters/*`) → عودة مقيَّسة (canonical) → كاش (Redis/LRU) مع `raw/canonical/staleGrace`. لا تلمس الصفحات مزوّدًا مباشرة، ولا تصل المفاتيح إلى المتصفح (`serverExternalPackages: ["pg","ioredis"]` + فحص الحِزَم في `scripts/smoke.mjs`).

| السؤال | الإجابة |
|---|---|
| المزوّدون المعرّفون في الكود | SportScore · Football-Data.org · Sportradar · Sportmonks · API-Football · TheSportsDB (+ محوّل demo خارج الإنتاج فقط) |
| من يحتاج اعتمادًا (مفتاح) | Football-Data.org · Sportradar · Sportmonks · API-Football · TheSportsDB. **SportScore بلا مفتاح** |
| كيف تُعالَج المفاتيح الغائبة | المزوّد لا يُسجَّل ويُدرج في `missing` (`getSdl()`), ويظهر في `/api/v1/system` → `missingProviders`؛ والسلسلة تُجرَّب بالترتيب، وإن فشل الجميع تُعاد حالة `all_providers_failed` **لا بيانات وهمية** |
| هل المباشر والترتيب يستخدمان استجابات فعلية؟ | **نعم — مُتحقَّق منه الآن في الإنتاج**: 29 مباراة مباشرة من `sportscore`، و20 صفًا في جدول PL بإسناد «Powered by SportScore»، وروابط مصدر `sportscore.com` لكل مباراة |
| هل مصادر RSS مضبوطة ومُفسَّرة؟ | **المصادر مضبوطة (14 بذرة بلا مفاتيح) لكن الجلب لا يعمل** لأن الجدولة غير موثّقة → كل المصادر `never` |
| هل تستطيع مهام cron المصادقة؟ | **لا حاليًا في الإنتاج**: 503 `not_configured`؛ المسار جاهز ويصبح 401/200 بمجرد ضبط سر |
| هل تُبلَّغ الأخطاء والقدم بدقة؟ | **نعم في واجهات البيانات**: `stale/degraded/failedSports/complete/fromCache/fetchedAt`، و«لا يوجد وقت تحديث ناجح مسجّل»، و`freshness.state`. و**نعم في الأخبار** (`lastSuccessfulUpdate` مقابل `lastFailedAttempt`) |
| هل تستبدل أي صفحة بيانات المزوّد ببيانات معاينة؟ | **لا** في الإنتاج: `demoContentVisible()=false` (بدليل `sitemap` الممتلئ و`LiveProvider enabled=false`)، وحالات الفشل تُعرض كـ«غير متاح». **لكن يوجد تضارب إسناد** (ليس بيانات وهمية): قائمة كرة القدم اليوم/9 أكتوبر تُوضع تحت لافتة «المصدر: SportScore» رغم أن صفوفها الخمسة تحريرية، و`meta.source="provider"` و`degraded=false` رغم أنها ليست من المزوّد |

### 5.2 قيود تغطية موثّقة (لا تُعدّ «أعطالًا» لكنها تحدّ من الجدولة)
- خلاصة SportScore هي نافذة يومية: `?date=2026-10-10` → 0 · `?date=tomorrow` (2026-10-12) → 0 → **لا يوجد جدول مباريات ليوم الغد/الأمس** في هذه الواجهة، والصفحة تُعلن ذلك بأمانة.
- حد أقصى 50 مباراة لكل رياضة في الخلاصة (كرة القدم اليوم = 50).
- مباريات التنس المباشرة تظهر بنتيجة «0:0» — لا يمكن التأكد مما إذا كان المزوّد يرسل نتيجة المجموعات أو النقاط؛ **يُستحسن التحقق البصري في المعاينة** على مباراة معروفة النتيجة.
- لا سجلات كرة قدم مباشرة اللحظة (0) — طبيعي حسب الجدول، وليس فشلًا (بقيّة الرياضات تخدم).

---

## 6. المهمة 4 — المباريات الخمس المجمّدة (المراجعة والقائمة المقترحة فقط)

**مصدرها:** سجل تحريري (`admin_matches`, `created_by='editorial'`) — وليس من مزوّد. **الحالة المخزّنة:** `status='upcoming'` في الجدول (تُعيد الـAPI الحالة المقيَّسة `scheduled`)، `home_score/away_score = NULL`، `editorialUpdatedAt ≈ 2026-10-09T00:43:56Z` لكل صف. **الحالة المعروضة:** «غير مؤكدة» على `/live` و`/matches?date=2026-10-09` (سلوك صحيح بعد إصلاحات main).

**لماذا لا يمكن للمزوّد المُهيّأ أن يؤكدها؟** خلاصة SportScore اليومية تُعيد 0 صفوف للتواريخ 2026-10-09 و2026-10-10 (فحص مباشر)، ومفتاح Football-Data.org غير مضبوط (`configured:false`). أي أن **تأكيد النتيجة عبر مسار التطبيق غير ممكن**، لكن التأكيد متاح من مصادر عامة موثوقة (وكذلك من موقع المزوّد نفسه، الذي يعرض المباراة رغم أن واجهته البرمجية لا تُعيد تواريخ سابقة).

| # | المعرّف المخزّن | الحالة المخزّنة | الموعد المخزّن (UTC) | الحالة الفعلية المؤكدة | الدليل (مصادر مستقلة) |
|---|---|---|---|---|---|
| 1 | `al-fateh-vs-al-ahli` | upcoming / scheduled · بلا نتيجة | 2026-10-09 14:55 | **انتهت** — الفتح 0 × 4 الأهلي (ترينكاو 31'، 50'؛ توني 60'؛ الجوهاني 89')، ملعب الأمير عبد الله بن جلوي/الأحساء، جولة 8 | worldfootball.net (0:4 «End») · tablesleague (0:4 «Finished») · thesportsencounter (جدول النتائج والهدّافين) · ysscores (فوز الأهلي 4-0) |
| 2 | `al-nassr-vs-al-diriyah` | upcoming / scheduled · بلا نتيجة | 2026-10-09 18:00 | **انتهت** — النصر 3 × 0 الدرعية (رونالدو 23'، سامو كوستا 35'، كومان 77')، الأول بارك | BBC Sport · ESPN · Sofascore · VAVEL · 101greatgoals |
| 3 | `borussia-dortmund-vs-werder-bremen` | upcoming / scheduled · بلا نتيجة | 2026-10-09 18:30 | **انتهت** — دورتموند 2 × 2 فيردر بريمن (سفينسون 80'، شلوتيربيك 85'؛ ريس 88'، فولكروغ 90+2')، سيغنال إيدونا بارك | Bundesliga.com · BBC Sport · ESPN · FotMob · 365Scores |
| 4 | `lens-vs-lyon` | upcoming / scheduled · بلا نتيجة | 2026-10-09 18:45 | **انتهت** — لانس 2 × 1 ليون (سوتوكا 36'، أودول 76'؛ ميراه 85')، بولار ديليلولي | BBC Sport · FotMob · SportScore (موقع المزوّد نفسه) · 365Scores |
| 5 | `malaga-vs-espanyol` | upcoming / scheduled · بلا نتيجة | 2026-10-09 19:00 | **انتهت** — مالقا 1 × 1 إسبانيول (زاراغوزا 13'؛ نيーニョ 90+3')، لا روساليدا | BBC Sport · Marca · Sofascore · ESPN · laligaupdate (الترتيب بعد الجولة) |

> ملاحظة جودة بيانات: **مواعيد الانطلاق والملاعب المخزّنة مطابقة تمامًا** للمصادر العامة (14:55 / 18:00 / 18:30 / 18:45 / 19:00 UTC) ⇒ بيانات التحرير الأصلية كانت صحيحة في المعرّف والملعب والموعد، **والخلل الوحيد هو جمود الحالة/النتيجة**.

### 6.1 قائمة التصحيح المقترحة (للمراجعة — **لا تُنفَّذ دون تفويض صريح وبعد مراجعة بشرية**)

| الصف (`id`) | الإجراء المقترح | القيم المقترحة | ملاحظات قبل التنفيذ |
|---|---|---|---|
| `adm_match_fateh_ahli_20261009` | تغيير الحالة إلى **منتهية** + تسجيل النتيجة | `homeScore=0`, `awayScore=4` | يجب أن يؤكدها محرّر من موقع رابطة الدوري السعودي؛ تغييرها يجعلها تظهر في `/results` |
| `adm_match_nassr_diriyah_20261009` | الحالة **منتهية** + النتيجة | `homeScore=3`, `awayScore=0` | تأكيد من 3 مصادر مستقلّة ✅ |
| `adm_match_dortmund_bremen_20261009` | الحالة **منتهية** + النتيجة | `homeScore=2`, `awayScore=2` | تأكيد من Bundesliga.com (مصدر رسمي) ✅ |
| `adm_match_lens_lyon_20261009` | الحالة **منتهية** + النتيجة | `homeScore=2`, `awayScore=1` | تأكيد BBC/FotMob ✅ |
| `adm_match_malaga_espanyol_20261009` | الحالة **منتهية** + النتيجة | `homeScore=1`, `awayScore=1` | تأكيد Marca/BBC/ESPN ✅ |

**قيود التنفيذ عند الموافقة:**
1. تُنفَّذ من `/admin/matches` عبر جلسة مصرّح بها (RBAC)، لا بتعديل SQL مباشر، لتُسجَّل في `audit_log`.
2. لا يُغيَّر أي سجل آخر، ولا يُحذف أي شيء (`is_published` يبقى كما هو ما لم يقرر المالك إخفاءها).
3. بعد التعديل: أعد التحقق من `/matches?date=2026-10-09` و`/api/v1/matches?date=2026-10-09` و`/live` (يجب أن تختفي من «غير مؤكدة») ومن `/api/v1/matches?...&status=finished`.
4. **بديل محافظ** إذا لم يرغب المالك في تعديل نتائج تحريرية: إبقاؤها «غير مؤكدة» مع تعليق تحريري ظاهر، **أو** إلغاء نشرها (`isPublished=false`) كي لا تظهر في الموقع/الخريطة — دون حذف السجل.
5. يبقى خطأ الإسناد (§5.1) قائمًا حتى بعد التصحيح: القائمة تخلط صفوفًا تحريرية ببيانات مزوّد تحت لافتة «المصدر: SportScore».

---

## 7. المهمة 5 — SEO: ما يُحفَظ مقابل ما يُقرأ فعلًا

### 7.1 الذي يُحفَظ
`lib/site-settings.ts` (جدول `site_settings` في Postgres أو ذاكرة) عبر `/admin/settings`: `siteName`, `siteNameAr`, `logoUrl`, `contactEmail`, `defaultLanguage`, `timezone`, `social.*`, `live.defaultStreamLabel`, `live.publishingEnabled`, `news.autoPublish`, **`seo.metaDescription`**, **`seo.keywords`**.

### 7.2 الذي يُقرأ فعلًا
| الحقل | من يقرؤه اليوم | الأثر على الصفحات العامة |
|---|---|---|
| `live.publishingEnabled` | `/admin/live` (حاجز نشر) | ✅ يعمل (داخلي) |
| `live.defaultStreamLabel` | `/admin/live` (قيمة افتراضية للنموذج) | ✅ يعمل (داخلي) |
| `seo.metaDescription` / `seo.keywords` | **لا أحد** غير نموذج الإعدادات | ❌ **غير موصول**: `app/layout.tsx` يستخدم نصًّا ثابتًا |
| `siteName` / `siteNameAr` | لا أحد | ❌ `SITE_NAME`/`SITE_NAME_AR` ثابتتان في `lib/site.ts` |
| `timezone` | لا أحد | ❌ `SITE_TZ = "Africa/Cairo"` ثابتة في `lib/tz.ts` |
| `social.*` / `contactEmail` / `logoUrl` | لا أحد | ❌ التذييل وصفحة الاتصال لا تقرآنها |
| `news.autoPublish` | لا أحد | ❌ خط الأخبار يستخدم عتبات الملاءمة ولا إعداد النشر التلقائي |

### 7.3 الحالة الفعلية لبقية وسوم SEO
| البند | الحالة |
|---|---|
| الأصل الموحّد (canonical/OG/JSON-LD/sitemap) | ✅ من `lib/site.ts`؛ `robots.txt` و`sitemap.xml` على نفس المضيف (مُتحقَّق من الإنتاج) |
| Canonical للصفحات | ✅ مُعرَّف صراحةً على الصفحات العامة (`alternates.canonical`) وصفحات المباريات/الأخبار/الفرق/اللاعبين |
| Robots لكل صفحة | ✅ `/account`, `/search`, `/my-day`, `/scout`, `/players` عند غياب مزوّد، و404s ⇒ `noindex`؛ والصفحات الإخبارية/الرئيسية تتبع `robotsForDataSource()` |
| **خطر مؤكد في التصميم:** `noindex` مؤقت أثناء انقطاع المزوّد | `dataServable()` تحكم على `index,follow` عبر **مسبار لكل عملية** + صحة غير محفوظة في Redis. في نسخة serverless جديدة أثناء انقطاع المزوّد: المسبار يفشل ⇒ الصفحات التي تُعاد تهيئتها (ISR: 60s للرئيسية، 120s للنتائج، حتى 1800s للفرق) قد تُخدَم `noindex,nofollow` مؤقتًا حتى تعود الاستجابة. لم أستطع إثبات حدوثه من الخارج (لا قراءة HTML)، لكنه سلوك مقصود بالكود ⇒ **يحتاج قرارًا** |
| خريطة الموقع | ✅ تعمل، ولا تُدرج `/search` أو `/admin`؛ تشمل صفحات المباريات من مزوّد حقيقي. ⚠️ تشمل أيضًا **الخمس المجمّدة** (`/matches/al-fateh-vs-al-ahli` …) وروابط قد تنتهي صلاحيتها بعد أيام (خلاصة يومية) |
| `/admin/seo` | ⚠️ **واجهة ثابتة غير موصولة**: أرقام Core Web Vitals وUptime و«آخر نسخة احتياطية: اليوم 03:00» وعدد روابط الخريطة **مكتوبة يدويًا**، وأزرار «حفظ/إعادة بناء Sitemap/تنزيل sitemap.xml» **بلا أي معالج** (`app/admin/seo/page.tsx`) |

### 7.4 أصغر تغيير آمن مقترح لوصل الإعدادات (لا يُنشر الآن)
في `app/layout.tsx` فقط (لا تغيير في أي واجهة):

```ts
// app/layout.tsx — داخل generateMetadata
import { getSiteSettings } from "@/lib/site-settings";

export async function generateMetadata(): Promise<Metadata> {
  const robots = await robotsForDataSource();
  const s = await getSiteSettings().catch(() => null); // لا تُسقط الصفحة أبدًا
  const description = s?.seo.metaDescription?.trim() || baseMetadata.description!;
  const keywords = s?.seo.keywords?.split(",").map((k) => k.trim()).filter(Boolean);
  return {
    ...baseMetadata,
    description,
    ...(keywords?.length ? { keywords } : {}),
    openGraph: { ...baseMetadata.openGraph, description },
    robots,
  };
}
```
- الحجم: ~10 أسطر، بلا تبعية جديدة، ويحافظ على القيمة الافتراضية إن لم تُضبط/تعذّر قراءة الإعدادات.
- نفس النمط يمكن تطبيقه على `siteName`/`openGraph.siteName` لاحقًا (اختياري).
- ملاحظة: لا تشمل هذه الخطوة `sitemap.ts` (لا علاقة للإعدادات المخزّنة به) ولا `timezone` (تغييره يمسّ كل حسابات التواريخ ⇒ **ليس تغييرًا صغيرًا**).

---

## 8. المهمة 6 — لوحة الإدارة: الحقيقي مقابل النائب

| الصفحة | متصل بظهر حقيقي؟ | ما تفعله فعلًا | متغيّرات/خدمات مطلوبة | هل ينفّذ النموذج ما يَعِد به؟ |
|---|---|---|---|---|
| `/admin` (لوحة البيانات) | ✅ قراءة | إحصاءات حقيقية من SDL + المتاجر؛ روابط للمصادر | DATABASE_URL (للأرقام الإدارية)، مزوّد (للمباشر) | — |
| `/admin/matches` | ✅ كتابة | إنشاء/تعديل/حذف/نشر مباريات + تجاوزات (`match-overrides`) | DATABASE_URL إلزامي للكتابة في الإنتاج | ✅ (`persistOrThrow` + رسائل أخطاء عربية) |
| `/admin/live` | ✅ كتابة | بثوث المباريات + بوابة حقوق (الجهة + مرجع الترخيص) قبل النشر | DATABASE_URL | ✅ (`RIGHTS_REQUIRED_AR` + احترام `live.publishingEnabled`) |
| `/admin/broadcast` | ✅ كتابة | سجل النواقل + ربط بث بمباراة | DATABASE_URL | ✅ |
| `/admin/news` | ✅ كتابة/قراءة | مصادر RSS، جلب يدوي، إخفاء/نشر/حذف، مؤشر «هل السكرت مهيّأ» (بلا قيمة) | DATABASE_URL + سر cron (للجلب المجدول) | ✅؛ «جلب الكل الآن» يعمل بجلسة مصرّح بها (يكتب فعلًا) |
| `/admin/news/manual` | ✅ كتابة | أخبار يدوية تُنشر على `/news` | DATABASE_URL | ✅ |
| `/admin/teams` `/admin/players` `/admin/competitions` | ✅ كتابة | CRUD + نشر | DATABASE_URL | ✅ |
| `/admin/users` | ✅ كتابة | مستخدمون + أدوار + إعادة كلمة المرور (super_admin فقط) | DATABASE_URL (+ ADMIN_HASH للـ«بيئة») | ✅ |
| `/admin/settings` | ✅ كتابة | يحفظ كل الإعدادات فعليًا (بما فيها SEO) — **لكن معظمها لا يُقرأ علنًا** (انظر §7) | DATABASE_URL | ✅ للحفظ، ❌ للأثر العام على SEO |
| `/admin/activity` | ✅ قراءة | `audit_log` (Postgres) أو ذاكرة | DATABASE_URL | ✅ (يعرض المصدر صراحة) |
| `/admin/providers` | ✅ قراءة | `diagnostics()` حيّة: صحة المزوّدين، سلاسل الأولويات، الحدود | — | ✅ |
| `/admin/standings` | ✅ قراءة (بالتصميم) | جداول المزوّد + روابط الصفحات العامة | مزوّد | ✅ (يقول صراحة إنها لا تُدخل يدويًا) |
| `/admin/upcoming-matches` `/admin/live-matches` | ✅ قراءة | من SDL؛ وحالات فارغة صادقة | مزوّد | ✅ |
| **`/admin/seo`** | ❌ **نائب/ثابت** | أرقام مكتوبة يدويًا (Web Vitals، Uptime 99.97%، «آخر نسخة احتياطية اليوم 03:00»، عدد روابط الخريطة) + حقول نصية وأزرار **بلا معالجات** | لا شيء | ❌ **لا يحفظ ولا يعيد بناء أي شيء** — يجب ألا يُقرأ كتشخيص حقيقي |
| `/admin/ads` | ❌ **نائب/ثابت** | جداول مواضع/حملات مكتوبة يدويًا | لا شيء | ❌ (لا CRUD، لا حفظ) |
| `/admin/articles` | ✅ إعادة توجيه دائم إلى `/admin/news/manual` | — | — | ✅ |
| المصادقة | ✅ | `middleware.ts` يحمي `/admin*`, `/api/v1/system`, `/api/admin/*`؛ جلسة HMAC `httpOnly` 12 ساعة؛ حد 8 محاولات/15 دقيقة لكل IP؛ RBAC (super_admin فقط للـ users/settings) | `ADMIN_USERNAME`+`ADMIN_PASSWORD_HASH` أو `ADMIN_ACCESS_TOKEN` (+`ADMIN_SESSION_SECRET` موصى به) | ✅ (`/admin` = 404 للمجهول، `/api/v1/system` = 401) |

> لم أنشئ أي لوحة، ولم أغيّر أي بيانات دخول، ولم أدخل بأي بيانات اعتماد.

---

## 9. جاهزية الميزات في الإنتاج — صفًّا بصف

| الميزة | الكود | الإنتاج (مُتحقَّق) | المانع الحالي | الحكم |
|---|---|---|---|---|
| المباشر لكل الرياضات | ✅ | ✅ 29 مباشرة (تنس/كريكيت) | — | **جاهز** |
| كرة القدم اليوم + النتائج | ✅ | ✅ 50 مباراة + نتائج حقيقية | حد الخلاصة 50، لا نتائج لأيام سابقة | **جاهز مع قيد تغطية** |
| جدول الغد/الأمس | ✅ | ❌ 0 صفوف (المزوّد لا يخدم تاريخًا غير اليوم) | قيد مزوّد (يحتاج Football-Data.org مفعّلًا) | **ناقص — يحتاج مفتاح مزوّد ثانٍ** |
| جداول الترتيب | ✅ | ✅ PL (20 صفًا، SportScore) | الهدافون قد يتطلب خطة مدفوعة عند Football-Data | **جاهز** |
| صفحات الفرق/اللاعبين من مزوّد | ✅ | جزئيًا (كانت تشكو 404 في تدقيق أمس) | يحتاج فحصًا على الإنتاج بعد النشر الأخير | **يحتاج تحققًا في المعاينة** |
| أخبار RSS — عرض | ✅ | ✅ 13 خبرًا (قديمة) | — | **جاهز للعرض** |
| أخبار RSS — تحديث تلقائي | ✅ | ❌ `not_configured` | **`CRON_SECRET` (أو `NEMO_INGEST_TOKEN`) غير مضبوط** + DATABASE_URL (موجود) | **معطّل — مانع P0** |
| تصنيف/إشراف الأخبار | ✅ | ❌ لم يُشغَّل على الإنتاج | يحتاج تشغيلًا مصرّحًا | **معلّق على P0** |
| الاستيعاب الكنسي `/api/v1/ingest` | ✅ | غير معروف (محمي) | سر + جداول كنسية | **يحتاج فحصًا** |
| البث/النواقل | ✅ | ✅ سجل نواقل، لا بثوث منشورة | بوابة الحقوق (تصميم) | **جاهز** |
| لوحة الإدارة | ✅ | ✅ (401 للمجهول؛ لا دخول لي) | — | **جاهزة (تحتاج جلسة للتحقق الكامل)** |
| SEO — canonical/sitemap/robots | ✅ | ✅ | — | **جاهز** |
| SEO — إعدادات محفوظة | جزئي | ❌ غير موصولة | حاجة لتغيير صغير (§7.4) | **ناقص** |
| Redis/كاش مشترك | ✅ | غير معروف | يحتاج تأكيدًا | **يحتاج تحققًا** |
| جداول كنسية (`schema.sql`) | ✅ | غير معروف | يحتاج `db:verify` | **يحتاج تحققًا** |

---

## 10. أصغر تغييرات الكود الآمنة المتبقية (مقترحة — بلا تنفيذ ولا نشر)

| # | التغيير | الملف | الحجم | لماذا آمن |
|---|---|---|---|---|
| C1 | وصل `seo.metaDescription`/`seo.keywords` بـ`generateMetadata` | `app/layout.tsx` (§7.4) | ~10 أسطر | قيم افتراضية عند الفشل؛ لا تغيير بصري |
| C2 | صدق الإسناد عند خلط صفوف تحريرية بمزوّد: عند وجود صفوف `admin` أضِف علامة لكل صف (`origin: "editorial"`) **أو** اجعل `meta.source="mixed"` و`degraded=true` | `lib/sdl-gateway.ts` (`corrected()`), `app/api/v1/matches/route.ts`, `components/data/DataSourceNote.tsx`, `app/matches/page.tsx` | ~30–50 سطرًا | إضافي/معلوميّ؛ لا يُسقط صفوفًا ولا يغيّر نتيجة |
| C3 | توثيق `VERCEL_CRON_SECRET` كاسم مقبول (وفي `.env.example` وREADME) | `.env.example`, `README.md` | سطور | توثيق فقط |
| C4 | معالجة `noindex` المؤقت أثناء انقطاع المزوّد — اختر أحدهما: (أ) إبقاء آخر حالة «قابل للخدمة» في Redis بدل مسبار لكل عملية؛ (ب) قصر `noindex` على الوضع demo/dev وبثّ إفصاح صريح في الصفحات الفارغة | `lib/sdl-gateway.ts:559-618` | متوسط | قرار سياسة SEO؛ **يستحق نقاشًا لا تطبيقًا تلقائيًا** |
| C5 | `/admin/seo`: إما وصل الحقول بالإعدادات الحقيقية وإزالة الأرقام المختلقة والأزرار الميتة، أو وسم الصفحة «غير موصولة — أرقام تقديرية» وإزالة أزرار الحفظ | `app/admin/seo/page.tsx` | صغير | يمنع اعتماد المالك على أرقام غير حقيقية (نسخ احتياطي/تغطية) |

> **ما لا أنصح به الآن:** أي تغيير في `lib/tz.ts` (timezone)، أو تعديل جماعي لتصنيفات الأخبار المنشورة، أو تغيير عقود `/api/v1` بشكل كاسر، أو تفعيل `NEMO_BOOTSTRAP_LEGACY_DATA`.

---

## 11. المهمة 7 — قائمة التحقق الآمنة في بيئة معاينة/Staging

**قواعد أساسية:** استخدم **قاعدة بيانات معاينة منفصلة** (Neon branch/Supabase preview) و**لا تشغّل أي أمر موثّق ضد الإنتاج**؛ لا تطبع أي سر (استخدم `curl -i` مع تحقق من رمز الحالة فقط)؛ لا ترسل أي طلب POST/PUT إلى الإنتاج.

### أ) قاعدة البيانات والاستمرارية
- [ ] في **معاينة**: عيّن `DATABASE_URL` (رابط pooler + `sslmode=require`) و`PG_POOL_MAX=5`.
- [ ] `npm run db:setup` ⇒ يجب أن يطبع ✓ لكل ملفات الترحيل (0002–0005). لا يطبع الرابط.
- [ ] `npm run db:verify` ⇒ **exit 0** ويطبع `canonical store : postgres (durable ✓)` وحالة Redis.
- [ ] من لوحة الإدارة على المعاينة: أضف بثًّا **مسودة** (بلا نشر) ⇒ أعد النشر/أعد تشغيل الدالة ⇒ تأكد أن المسودة ما زالت موجودة (**اختبار البقاء**).
- [ ] `npm run db:verify` مع نقطة نهاية القاعدة الكنسية: تأكد من وجود الجداول الـ20 (وهذا ما يحتاجه `/api/v1/ingest`).
- [ ] على الإنتاج لاحقًا: **طلب واحد** `GET /api/v1/system` بجلسة مصرّح بها ⇒ `infrastructure.canonical == "postgres"` و`infrastructure.cache` كما تتوقع.

### ب) قراءة واحدة آمنة من مزوّد بيانات
- [ ] `curl -s "$BASE/api/v1/live?sport=all" | jq '{count:.meta.count, bySport:.meta.bySport, failed:.meta.failedSports, provider:.meta.provider}'` ⇒ يجب أن يظهر مصدر حقيقي (`sportscore`) بلا `failedSports`.
- [ ] `curl -s "$BASE/api/v1/football-data/status" | jq '{configured, registered, mode}'` ⇒ تأكد هل مفتاح Football-Data مضبوط في هذه البيئة.
- [ ] افتح صفحة مباراة مباشرة واحدة وتأكد أن العنوان والنتيجة والمصدر تتطابق مع استجابة الـAPI.

### ج) قراءة واحدة آمنة من خلاصات الأخبار
- [ ] `curl -s "$BASE/api/v1/news?limit=5" | jq '.meta'` ⇒ سجّل `lastSuccessfulUpdate`, `freshness.state`, `schedule`.
- [ ] (بلا شبكة خارجية) للتأكد من صحة المحلّل: `node scripts/mock-news-feeds.mjs` ثم `NEMO_NEWS_FEED_BASE_URL=http://127.0.0.1:7799/rss/search`.

### د) مصادقة cron **دون** تشغيل مهام مدمّرة
- [ ] بلا سر: `curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/cron/fetch-news"` ⇒ **503** = غير مضبوط، **401** = مضبوط (وكلاهما لا يكتب شيئًا).
- [ ] في المعاينة فقط: عيّن `NEMO_INGEST_TOKEN` (قيمة اختبارية) وأعد التشغيل، ثم:
  - [ ] `curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/cron/fetch-news"` ⇒ **401** (توثيق ناقص/خاطئ).
  - [ ] `curl -s -H "Authorization: Bearer $NEMO_INGEST_TOKEN" "$BASE/api/cron/fetch-news?source=<source_id>" | jq '{storage, ok, perSource}'` ⇒ **`storage:"postgres"`**، ومصدر واحد فقط، وشاهد `moderation.applied`. (الاستيعاب مُفعَّم بقفل advisory، و`?source=` يقلّص النطاق.)
  - [ ] أعد تشغيل الخدمة وشغّل `--phase=persist` من `scripts/verify-news-ingestion.mjs` ⇒ **بقاء البيانات بعد إعادة التشغيل**.
- [ ] في **الإنتاج** (بعد موافقة المالك فقط): `curl -I` (GET) لتأكيد 401، ثم **تشغيل واحد مصرّح به** ومتابعة `meta.lastSuccessfulUpdate` و`freshness.state` من `/api/v1/news`.

### هـ) دخول الإدارة ببيانات اعتماد مصرّح بها
- [ ] افتح `/admin/login` ⇒ 200؛ تأكد من `POST` على نفس المضيف (حماية Origin) ومن رسالة الخطأ العامة.
- [ ] بعد الدخول (يدويًا، بكلمة المرور التي يملكها المالك — لا تُشارك في المحادثة): تأكد من كوكي `nemo_admin_session` بعلامات **HttpOnly + Secure + SameSite** وعمر 12 ساعة.
- [ ] افتح `/admin/providers` و`/admin/activity` و`/admin/news` ⇒ يجب أن تظهر المصادر والأرقام حقيقية، ومؤشر «هل السكرت مهيّأ» **بدون قيمة**.
- [ ] `/api/v1/system` بجلسة ⇒ سجّل `infrastructure`, `missingProviders`, `health`.
- [ ] جرّب حساب **editor** (إن وُجد) ⇒ يجب أن يُمنع من `/admin/users` و`/admin/settings` (RBAC).

### و) فحوص الصحة العامة للأدوات
- [ ] `curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1"` ⇒ 200 · `/api/v1/system` بلا جلسة ⇒ 401 (أو 503 إن لم تُهيّأ الإدارة) · `/admin` بلا جلسة ⇒ 404.
- [ ] `curl -s "$BASE/api/v1/live?sport=all" | jq .meta` و`/api/v1/matches?date=today&sport=all`.
- [ ] تأكد من ترويسات الأمان: `curl -sI "$BASE/" | grep -iE 'content-security-policy|x-frame-options|referrer-policy|x-content-type-options'`.

### ز) SEO والوسوم والخريطة
- [ ] `curl -s "$BASE/" | grep -o '<meta name="robots"[^>]*>'` ⇒ **ليست `noindex`** في الوضع الطبيعي (كرّر لـ`/live`, `/matches`, `/news`, `/standings`, `/competitions`, وصفحتَي مباراة واحدة على الأقل).
- [ ] `curl -s "$BASE/news" | grep -o 'rel="canonical" href="[^"]*"'` ⇒ عنوان مطلق على المضيف الصحيح وبلا `/` مكرّر.
- [ ] `curl -s "$BASE/robots.txt"` ⇒ المضيف والسايتماب متطابقان مع أصل الموقع.
- [ ] `curl -s "$BASE/sitemap.xml" | grep -c '<url>'` ⇒ عدد معقول؛ تأكد أن كل رابط يُعيد 200 (عيّنة 10 روابط عشوائية + **روابط المباريات التحريرية الخمسة**).
- [ ] اِفحص `title`/`description` لصفحة واحدة **بعد** تنفيذ C1 (في المعاينة) للتأكد من ظهور وصف SEO المحفوظ.
- [ ] Search Console: أعد إرسال الخريطة بعد أي تغيير في الأصل أو الفهرسة، وراقب «الصفحات المستبعدة» خلال 48 ساعة.
- [ ] اختياري: Lighthouse على الرئيسية + `/matches` لقياس CWV (بلا اعتماد على أرقام `/admin/seo`).

### ح) الأخبار/الإشراف (بلا حذف)
- [ ] `npm run news:moderate` (**dry run افتراضي**) على قاعدة المعاينة ⇒ راجع التقرير قبل أي `--apply`.
- [ ] `npm run news:recategorize` (dry run) ⇒ راجع نقل قصص كرة اليد من «الكرة المصرية».
- [ ] تأكد أن القصص التجارية (صابور/السويدي) لم تُنشر على المعاينة بعد تشغيل الاستيعاب الجديد.

---

## 12. الأولويات

**P0 — تمنع وظيفة إنتاجية حقيقية (قرار المالك، لا كود):**
1. ضبط **`CRON_SECRET`** (قيمة عشوائية طويلة) في Vercel → Production، ثم Redeploy. الأدلة: `/api/cron/fetch-news` = 503، وكل مصادر الأخبار `never`. بعد الضبط يجب أن يصبح الرد **401** لا 503.
2. تأكيد **`DATABASE_URL`** للإنتاج (مرجّح موجود — §1.2) عبر طلب واحد موثّق على `/api/v1/system`، ونفس القاعدة للمعاينة منفصلة.
3. مراجعة **المباريات الخمس** (§6.1) والموافقة على قائمة التصحيح أو البديل المحافظ.

**P1 — مهمة للصحة العامة:**
4. ضبط **`ADMIN_SESSION_SECRET`** (مفتاح توقيع مستقل) إن لم يكن مضبوطًا.
5. تقرير **`REDIS_URL`**: مع أكثر من نسخة serverless يُنصح به لتوحيد الكاش وميزانية المعدل.
6. تنفيذ **C1** (وصل إعدادات SEO) و**C2** (صدق الإسناد).
7. فحص إمكانية تفعيل **Football-Data.org** لتغطية جدول الغد/الأمس والهدافين (بلا خدمات مدفوعة).

**P2 — تحسينات ومخاطر:**
8. **C3** توثيق `VERCEL_CRON_SECRET`، **C4** قرار `noindex` أثناء الانقطاع، **C5** معالجة `/admin/seo`.
9. طلب جدولة أدقّ من اليومي (مُجدول خارجي موثّق + `NEMO_NEWS_SCHEDULER_INTERVAL_MINUTES`) لتفادي «قديم 22 ساعة/يوم».
10. ضبط `NEXT_PUBLIC_SITE_URL` صراحةً عند ربط دومين مخصص.

---

## 13. التزامات الفحص

- ✅ لم يُدمج/يُدفع/يُغلق أي PR، ولم يُنشر أي شيء، ولم يُشغَّل أي Deploy.
- ✅ لا كتابة إنتاجية، ولا اتصال مباشر بقاعدة الإنتاج، ولا تعديل لأي نتيجة أو حالة مباراة.
- ✅ لا طباعة لأي سر: كل ما ورد عن الأسرار مأخوذ من **رمز الحالة/الحقول المنطقية** التي يصرّح بها الخادم نفسه (`configured:false`, `not_configured`, `unauthorized`).
- ✅ لم تُخفَّف أي حماية، ولم تُغيَّر أي بيانات اعتماد، ولم يُنشأ أي لوحة إدارة.
- ✅ لم تُحذف أو تُستبدل أي ميزة عاملة.

**ملفات هذا التقرير:** هذا الملف فقط (`AUDIT_REPORT_2026-10-11_PRODUCTION_CONFIG_AR.md`) — بلا أي تعديل على ملفات الكود أو الإعدادات.
