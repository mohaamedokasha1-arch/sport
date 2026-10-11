# NEMO SPORTS — تدقيق تغطية البطولات واكتشافها تلقائيًا وتحسين SEO

**تاريخ التدقيق:** 2026-10-11
**الفرع:** `arena/1b8dee37-sport` (منبثق من `7adb7f2`)
**نطاق العمل:** تدقيق فعلي للكود + تنفيذ أصغر مجموعة تغييرات آمنة عالية القيمة
**الإنتاج:** لم يُلمس — لا نشر، لا دمج، لا كتابة على قاعدة بيانات الإنتاج، PR #26 لم يُفتح ولم يُعدَّل

---

## 0) ملخص تنفيذي

| البند | النتيجة |
|---|---|
| هل المشروع مُدقَّق لا مُعاد بناؤه؟ | نعم — 50 صفحة و21 مسار API فُحصت فعليًا عبر HTTP |
| اكتشاف البطولات المفقودة من فهرس المزوّد الحقيقي | **محجوب** — كل مزوّدي البيانات غير قابلين للوصول من بيئة التنفيذ (HTTP 000) |
| المزامنة التلقائية للبطولات | **مُنفَّذة ومُختبَرة**، لكنها تتطلب `DATABASE_URL` + مفتاح Football-Data أو TheSportsDB |
| إصلاح SEO مُتحقَّق منه | عدد روابط Sitemap: **27 → 42**، صفحات البطولات: **0 → 15** |
| اختبارات الانحدار | `npm run check` أخضر بالكامل (خروج 0)، `npm run build` أخضر |
| اختبارات جديدة | 12 اختبار محوّل + 10 اختبارات مزامنة = **22 اختبارًا جديدًا، كلها ناجحة** |
| بيانات مُختلَقة | **لا شيء** — لم تُضف أي بطولة أو فريق أو نتيجة غير مُتحقَّق منها |

**الخلاصة الأهم:** المزوّد الرئيسي للمنصّة (SportScore) **لا يملك أي endpoint لتعداد البطولات إطلاقًا**. لذلك "الاكتشاف التلقائي للبطولات" مستحيل تقنيًا من المصدر الأساسي، ولا يمكن أن يتم إلا عبر Football-Data.org أو TheSportsDB (وكلاهما يحتاج مفتاحًا). هذه حقيقة مُثبتة من الكود، وليست تقديرًا.

---

## 1) البنية الحالية للنظام (كما هي فعلًا)

### 1.1 طبقة البيانات (SDL)

الحزمة `packages/sdl/` هي الطبقة الوحيدة المسموح لها بمعرفة عناوين المزوّدين:

```
packages/sdl/src/
├── adapters/        base · sportscore · football-data · thesportsdb
│                    · api-football · sportmonks · sportradar · demo
├── orchestrator.ts  سلسلة الأولويات + الكاش + معدّل الطلبات + مراقبة الصحة
├── priority.ts      قواعد الأولوية (رياضة × بطولة × نوع بيانات × مزوّد)
├── mapper.ts        التحويل إلى الكيانات الكنسية (NEMO UUID)
├── entity-resolver  مطابقة الكيانات بين المزوّدين
├── conflict.ts      كشف تعارض القيم بين المزوّدين
├── pg-store.ts      المخزن الكنسي على Postgres
└── redis-store.ts   الكاش الموزّع
```

**نقطة الوصول الوحيدة للتطبيق:** `getSdl()` في `packages/sdl/src/index.ts` (نمط Singleton — كاش واحد وميزانية طلبات واحدة). التطبيق يلمسها عبر `lib/sdl-gateway.ts` فقط.

### 1.2 التخزين الفعلي المُهيّأ

| المكوّن | الحالة في بيئة التنفيذ | الأثر |
|---|---|---|
| PostgreSQL (`DATABASE_URL`) | **غير مُهيّأ** | المخزن الكنسي في الذاكرة — يُفقد عند إعادة التشغيل |
| Redis (`REDIS_URL`) | **غير مُهيّأ** | خمس طبقات كاش داخل العملية |
| `FOOTBALL_DATA_API_KEY` | **غير مُهيّأ** | سلسلة الجداول/الهدّافين بلا مصدر |
| `CRON_SECRET` / `NEMO_INGEST_TOKEN` | **غير مُهيّأ** | `/api/v1/ingest` و`/api/cron/fetch-news` يرفضان بـ 503 |
| `ADMIN_PASSWORD_HASH` | **غير مُهيّأ** | `/admin` يعيد 404 (fail-closed — سلوك صحيح) |

هذا مطابق لسياسة `lib/db/store-policy.ts`: الكتابة في الإنتاج مرفوضة بدون قاعدة بيانات بدل أن تُحفظ في الذاكرة وتضيع بصمت.

### 1.3 جداول Cron الحالية

`vercel.json` كان يحتوي مسارين فقط:

| المسار | الجدولة | الوظيفة |
|---|---|---|
| `/api/v1/ingest` | `0 3 * * *` | استيعاب المباريات المباشرة إلى المخزن الكنسي |
| `/api/cron/fetch-news` | `30 3 * * *` | جلب الأخبار من Google News RSS |

**لم يكن هناك أي مسار لمزامنة فهرس البطولات** — هذه هي الفجوة المركزية التي عالجها هذا العمل.

---

## 2) جرد المسارات والاختبار الفعلي

تم تشغيل خادم التطوير واختبار كل مسار عبر HTTP حقيقي (لا افتراضات).

### 2.1 الصفحات العامة — كلها تعمل

| المسار | الحالة | ملاحظة |
|---|---|---|
| `/` | 200 | |
| `/today` | 308 → `/matches?date=today` | إعادة توجيه مقصودة وسليمة |
| `/matches` `/live` `/results` `/fixtures` | 200 | |
| `/competitions` | 200 | |
| `/standings` `/teams` `/players` | 200 | |
| `/news` `/watch` `/my-day` `/scout` `/search` | 200 | |
| `/learn` `/about` `/contact` `/faq` | 200 | |
| `/privacy` `/terms` `/copyright` `/broadcast-rights` | 200 | |
| `/account` | 200 | |
| `/admin` | 404 | **صحيح** — fail-closed بدون بيانات اعتماد |
| `/admin/login` | 200 | |

### 2.2 صفحات البطولات القانونية — 15/15 تعمل

```
200  /competitions/premier-league            200  /competitions/caf-champions-league
200  /competitions/la-liga                   200  /competitions/caf-confederation-cup
200  /competitions/serie-a                   200  /competitions/uefa-europa-league
200  /competitions/bundesliga                200  /competitions/concacaf-league-champions-cup
200  /competitions/ligue-1                   200  /competitions/usl-championship
200  /competitions/champions-league          200  /competitions/japanese-j1-league
200  /competitions/saudi-pro-league          200  /competitions/brazilian-serie-a
200  /competitions/egyptian-league
```

### 2.3 مسارات API

| المسار | الحالة | التقييم |
|---|---|---|
| `/api/v1` | 200 | |
| `/api/v1/matches` | 200 | يعيد بيانات حقيقية عبر SDL |
| `/api/v1/news` | 200 | `stale: true` — صادق لأن الجلب معطّل |
| `/api/live` | 200 `{}` | **صحيح** — لا يُختلق لوحة مباشرة |
| `/api/search?q=ahli` | 200 | |
| `/api/search?q=الأهلي` (مُرمَّز) | 200 | البحث العربي يعمل |
| `/api/search?q=premier` | 200 | |
| `/api/v1/system` | 503 `not_configured` | **صحيح** |
| `/api/v1/ingest` | 503 `not_configured` | **صحيح** |
| `/api/cron/fetch-news` | 503 `not_configured` | **صحيح** |

> **ملاحظة منهجية:** طلب `/api/search?q=اهلي` بنص عربي غير مُرمَّز في سطر الأوامر أعاد 400. هذا **أثر من أداة الاختبار** وليس عيبًا: عند ترميز النص صحيحًا (`%D8%A7%D9%84%D8%A3%D9%87%D9%84%D9%8A`) يعيد 200 ونتيجة حقيقية.

---

## 3) الأخطاء المُؤكَّدة

### 3.1 عيب SEO مؤكد (تم إصلاحه) — صفحات البطولات غائبة عن Sitemap

**الدليل قبل الإصلاح** (قياس فعلي بعد عزل التغيير بـ `git stash`):

```
قبل:  27 رابطًا في sitemap.xml · صفحات البطولات: 0
بعد:  42 رابطًا في sitemap.xml · صفحات البطولات: 15
```

`app/sitemap.ts` كان يُدرج فهرس `/competitions` وأي بطولة أنشأها المشغّل يدويًا، لكنه **لم يُدرج أبدًا** الفهرس القانوني الذي بُني عليه الموقع. إعلان الفهرس وإخفاء كل ما تحته مشكلة عمق زحف، لا مشكلة محتوى.

**التحقق بعد الإصلاح:** كل روابط البطولات في الـ Sitemap تُعيد 200 — لا روابط ميتة:

```
200 /competitions                      200 /competitions/egyptian-league
200 /competitions/premier-league       200 /competitions/caf-champions-league
200 /competitions/la-liga              200 /competitions/caf-confederation-cup
200 /competitions/serie-a              200 /competitions/uefa-europa-league
200 /competitions/bundesliga           200 /competitions/concacaf-league-champions-cup
200 /competitions/ligue-1              200 /competitions/usl-championship
200 /competitions/champions-league     200 /competitions/japanese-j1-league
200 /competitions/saudi-pro-league     200 /competitions/brazilian-serie-a
```

### 3.2 عيب بنيوي مؤكد (تم إصلاحه) — لا يوجد اكتشاف لفهرس البطولات

قبل هذا العمل:
- نوع البيانات `DataType` لم يكن يحتوي `competitions`.
- واجهة `SportsDataProvider` لم يكن بها `getCompetitions()`.
- `FootballDataAdapter.healthCheck()` كان يستدعي `/competitions` ثم **يرمي الناتج** ويحتفظ بالعدد فقط.
- `TheSportsDbAdapter.healthCheck()` كان يستدعي `search_all_leagues.php?c=England` ثم **يرمي الناتج**.

أي أن المنصّة كانت تستدعي فعليًا endpoints تعداد البطولات وتُهمل نتائجها.

### 3.3 خطأ موجود مسبقًا (لم أُدخله — مُوثَّق بلا تعديل)

`npm run smoke` يفشل في فحص واحد:

```
✗ /players/nope-not-a-player → 500 (expected a stable 404, not 500)
```

**إثبات أنه ليس انحدارًا من عملي:** تم إنشاء `git worktree` نظيف عند `7adb7f2` (بدون أي من تغييراتي) وتشغيل الخادم عليه:

```
BASELINE (commit 7adb7f2):
500  /players/nope-not-a-player
404  /players/999999
404  /teams/nope
```

**السبب الدقيق** (من سجل الخادم):

```
⨯ Error: player_stats_unavailable:all_providers_failed
    at PlayerPageBody (app/players/[slug]/page.tsx:89:11)
```

`app/players/[slug]` يرمي خطأً مقصودًا عند الفشل **غير الدائم** حتى لا تُخزَّن صفحة 404 في كاش ISR أثناء انقطاع المزوّد. `PERMANENT_FAILURE_KINDS` = `{not_found, no_provider_configured, unsupported}`، بينما `all_providers_failed` ليس منها. في بيئة التنفيذ المزوّد غير قابل للوصول → `all_providers_failed` → 500. وبعد أن يُعلَّم المزوّد كمنقطع تصبح السلسلة `no_provider_configured` → 404 (ولهذا أعادت الطلبات اللاحقة 404).

**لماذا لم أعدّله:** تحويله إلى 404 سيكسر التصميم المقصود ويسمح لانقطاع مؤقت بحذف صفحات لاعبين حقيقية من فهرس جوجل. هذا انحدار في السلوك لا إصلاح. الأثر على الإنتاج **غير مُتحقَّق منه** لأن `nemo-sports.vercel.app` غير قابل للوصول من بيئة التنفيذ.

---

## 4) تغطية البطولات — النتيجة الحقيقية

### 4.1 ما هو مُنفَّذ فعلًا اليوم: 15 بطولة

من `lib/competition-catalog.ts` (ثابت مُتحقَّق يدويًا)، مُولَّد آليًا في `docs/competition-coverage.json`:

```
[coverage] 15 competitions → docs/competition-coverage.json
  canonical (has a public page): 15
  discovered (catalog only):     0
  by sport:                      {"football":15}
  catalog-capable providers:     none configured
```

| # | البطولة | الدولة/المنطقة | معرّف SportScore | صفحة عامة |
|---|---|---|---|---|
| 1 | الدوري الإنجليزي الممتاز | إنجلترا | `english-premier-league` | `/competitions/premier-league` |
| 2 | الدوري الإسباني | إسبانيا | `spanish-la-liga` | `/competitions/la-liga` |
| 3 | الدوري الإيطالي | إيطاليا | `italian-serie-a` | `/competitions/serie-a` |
| 4 | الدوري الألماني | ألمانيا | `bundesliga` | `/competitions/bundesliga` |
| 5 | الدوري الفرنسي | فرنسا | `french-ligue-1` | `/competitions/ligue-1` |
| 6 | دوري أبطال أوروبا | أوروبا | `uefa-champions-league` | `/competitions/champions-league` |
| 7 | دوري روشن السعودي | السعودية | `saudi-professional-league` | `/competitions/saudi-pro-league` |
| 8 | **الدوري المصري الممتاز** | **مصر** | `egyptian-premier-league` | `/competitions/egyptian-league` |
| 9 | **دوري أبطال أفريقيا** | **أفريقيا** | `caf-champions-league` | `/competitions/caf-champions-league` |
| 10 | **كأس الكونفدرالية الأفريقية** | **أفريقيا** | `caf-confederation-cup` | `/competitions/caf-confederation-cup` |
| 11 | الدوري الأوروبي | أوروبا | `uefa-europa-league` | `/competitions/uefa-europa-league` |
| 12 | دوري أبطال كونكاكاف | أمريكا الشمالية | `concacaf-league-champions-cup` | `/competitions/concacaf-league-champions-cup` |
| 13 | دوري USL Championship | الولايات المتحدة | `usl-championship` | `/competitions/usl-championship` |
| 14 | الدوري الياباني J1 | اليابان | `japanese-j1-league` | `/competitions/japanese-j1-league` |
| 15 | الدوري البرازيلي | البرازيل | `brazilian-serie-a` | `/competitions/brazilian-serie-a` |

> الأولوية المطلوبة (مصر / أفريقيا / الدوريات العربية) **مُغطاة بالفعل** في الفهرس الحالي: الدوري المصري ودوري أبطال أفريقيا وكأس الكونفدرالية ودوري روشن السعودي.

### 4.2 البطولات المفقودة — **محجوبة، ولم أختلق قائمة**

هذا هو الحدّ الصادق لهذا التقرير. قياس فعلي من بيئة التنفيذ:

```
www.thesportsdb.com   -> 000
api.football-data.org -> 000
api.sportscore.app    -> 000
nemo-sports.vercel.app-> 000
news.google.com       -> 000
api.github.com        -> 200
```

`000` = فشل الاتصال. بيئة التنفيذ تسمح فقط بـ `github.com` و`registry.npmjs.org` و`pypi.org`.

**النتيجة:** لا يمكن تعداد فهرس أي مزوّد حقيقي من هنا. أي قائمة "بطولات مفقودة" أُقدّمها الآن ستكون **اختلاقًا**، وهذا مخالف صراحةً للقاعدة 4. لذلك لم أُنتج قائمة.

**ما يجب على المشغّل فعله للحصول على القائمة الحقيقية** (دقيقة واحدة، بلا كود):

```bash
# 1) اضبط مفتاح Football-Data (مجاني)
export FOOTBALL_DATA_API_KEY=<your-key>

# 2) نفّذ المزامنة
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://<preview>/api/cron/sync-competitions?force=1"

# 3) اقرأ التغطية الحقيقية (آلي القراءة)
curl "https://<preview>/api/v1/competitions" | jq '.counts, .bySport'
npm run competitions:report   # يكتب docs/competition-coverage.json
```

عندها سيُظهر `/api/v1/competitions` تحت `status: "discovered"` كل بطولة يُدرجها المزوّد ولا تملك المنصّة صفحة لها — وهذا هو تقرير الفجوة الحقيقي، مُولَّدًا من سجلات حقيقية لا من أمثلة.

### 4.3 تمييز الفهرسة عن التغطية (مُنفَّذ بنيويًا)

نوع جديد `CompetitionCapabilities` يفصل كل قدرة على حدة:

```ts
{ listed: boolean,          // يُدرجها فهرس المزوّد
  fixtures: boolean | null, // null = لم يُتحقَّق أبدًا
  live:     boolean | null,
  results:  boolean | null,
  standings: boolean | null,
  teams:    boolean | null,
  players:  boolean | null }
```

`null` تعني "غير مُتحقَّق" وليس "لا". **لا يوجد اختبار يسمح بقلبها إلى `false` أو `true` من ردّ فهرسة** — هناك اختبار صريح يثبّت ذلك (`assertUnverifiedCapabilities`). لهذا لا يمكن لبطولة "فهرس فقط" أن تُعرض كأن لها تغطية مباشرة.

---

## 5) جدوى المزوّدين المجانيين وشروطهم

| المزوّد | تعداد البطولات؟ | endpoint موثّق | مفتاح | الحدّ المجاني | الإسناد |
|---|---|---|---|---|---|
| **SportScore** | **لا** | — (5 مسارات فقط: `matches/` `match/` `standings/` `topscorers/` `player/`) | لا | ~10,000 طلب/24س/IP، كاش 60ث | **إلزامي** — رابط dofollow |
| **Football-Data.org** | **نعم** | `GET /v4/competitions` | نعم | 10 طلبات/دقيقة، 12 بطولة، نتائج متأخرة | مطلوب (معروض دائمًا) |
| **TheSportsDB** | **نعم** | `search_all_leagues.php?s=&c=` | نعم | ~30 طلب/دقيقة على المفاتيح المشتركة | **إلزامي** |
| **Google News RSS** | — | — | لا | لا حدّ منشور | رابط الناشر الأصلي |

### قيود قانونية موثّقة ومُحترمة

- **SportScore:** الإسناد المرئي جزء من الترخيص. محفوظ كما هو في `components/ui/AttributionFooter.tsx` و`lib/providers.ts` — **لم يُلمس**.
- **TheSportsDB:** الطبقة المجانية **بيانات وصفية وصور فقط**، ولا تُستخدم أبدًا للنتائج المباشرة. الصور من قاعدة مجتمعية، لذا كل رابط صورة يُخزَّن مع `photoAttribution` ويجب مراجعة ترخيصه قبل العرض. المحوّل الجديد يحافظ على هذا: `getCompetitions()` يضبط `listed` فقط ولا يطلب أي endpoint مدفوع.
- **Football-Data.org:** المفتاح يُقرأ في الخادم فقط (`packages/sdl/src/index.ts`) ولا يُضمَّن في أي حزمة متصفح. هناك اختبار قائم (`client bundle → no provider hostname in 5 shipped chunks`) يؤكد ذلك، وما زال ناجحًا.

### لماذا لم أُضف مزوّدين آخرين

لم أُضف أي مزوّد جديد. سببان: (1) لا يمكن التحقق من شروط أي مزوّد جديد بدون وصول للإنترنت؛ (2) المزوّدان الموجودان يغطّيان الفجوة الفعلية (تعداد البطولات) — Football-Data لكرة القدم بدقة، وTheSportsDB لبقية الرياضات. إضافة APIs لمجرد أن أسماءها تبدو مثيرة مخالفة صريحة للمطلوب.

---

## 6) المزامنة التلقائية المُنفَّذة

### 6.1 التدفق

```
Vercel Cron (أسبوعيًا، الاثنين 03:45 UTC)
  → GET /api/cron/sync-competitions      [مصادقة CRON_SECRET]
    → syncCompetitions()                  [lib/competition-sync.ts]
      → discoverCompetitions()            [طلب واحد لكل مزوّد × رياضة]
        → sdl.fetch({ dataType: "competitions" })
          → FootballDataAdapter.getCompetitions()   /v4/competitions
          → TheSportsDbAdapter.getCompetitions()    search_all_leagues.php
      → catalogRow()                      [تطبيع + تنظيف + حدود]
      → upsert على (provider, provider_id)
      → تسجيل run (نجح/جزئي/فشل) منفصلًا عن البيانات
```

### 6.2 الضمانات العشرة المطلوبة — وكيف نُفِّذت

| # | المتطلب | التنفيذ | الدليل |
|---|---|---|---|
| 1 | جلب الفهرس من endpoint موثّق | `getCompetitions()` في محوّلين | اختبارات 19–30 |
| 2 | تحقق وتطبيع | `catalogRow()` — تنظيف، طيّ مسافات، حدود طول | 8 اختبارات |
| 3 | مطابقة بمعرّفات مستقرة | مفتاح `(provider, providerId)` | `UNIQUE (provider, provider_id)` |
| 4 | إدراج/تحديث آمن | `ON CONFLICT DO UPDATE` | اختبار idempotency |
| 5 | منع التكرار | قيد فريد + `Map` داخل المرور | 12 مُخزَّنة بعد تشغيلين |
| 6 | الحفاظ على العلاقات | لا يُكتب أي FK — الفهرس معزول عن المباريات/الفرق | بالتصميم |
| 7 | الفشل لا يمحو السجلات | **لا يوجد DELETE إطلاقًا** في مسار المزامنة | مُختبَر + مُوثَّق |
| 8 | تسجيل آخر نجاح منفصلًا عن آخر محاولة | `lastSuccessfulRun()` مقابل `lastSyncRun()` | ظاهر في لوحة الإدارة |
| 9 | الفهرس العام يعكس المُزامَن | عبر `published` فقط (قرار صريح) | `published: false` افتراضيًا |
| 10 | Sitemap للمؤهل فقط | المُكتشَفة **مستبعدة عمدًا** | انظر 6.4 |

### 6.3 إثبات التشغيل الفعلي (end-to-end)

تم تشغيل المزوّد الوهمي المحلي (`scripts/mock-football-data.mjs`) وتوجيه التطبيق إليه:

```
$ curl -H "Authorization: Bearer $CRON_SECRET" \
    "http://127.0.0.1:3000/api/cron/sync-competitions?force=1"

{ "ok": true, "run": {
    "status": "partial",
    "providersOk": ["football_data:football"],
    "seen": 12, "inserted": 12, "updated": 0, "rejected": 0 } }
```

**المصادقة fail-closed — مُتحقَّق:**

```
بدون توكن      → HTTP 401  {"code":"unauthorized"}
بتوكن خاطئ     → HTTP 401  {"code":"unauthorized"}
بدون ضبط سر    → HTTP 503  {"code":"not_configured"}
```

**idempotency — مُتحقَّق:** إعادة التشغيل أعطت `seen: 12, inserted: 0, updated: 12` مع بقاء `storedCompetitions = 12`. لا تكرار.

### 6.4 لماذا لا تُدرج البطولات المُكتشَفة في Sitemap

قرار صريح ومُوثَّق في `app/sitemap.ts`:

> السجل المُكتشَف يحمل **معرّف مزوّد** لا **مسارًا عامًا**. إدراج `/competitions/{providerId}` سيُعلن روابط تُعيد 404 ما لم يكن أحدهم قد ربط المعرّف بصفحة حقيقية. إعلان رابط ميت في Sitemap أسوأ من حذف الصفحة.

لهذا تبقى المُكتشَفة خارج Sitemap حتى يربطها المشغّل ببطولة قابلة للحل (الفهرس القانوني أو بطولة إدارة منشورة) — وكلاهما مُدرَج أصلًا. هذا تطبيق مباشر لشرط "لا صفحات بطولات فارغة قابلة للفهرسة".

### 6.5 ما لا يمكن ادّعاؤه

**المزامنة ليست "تعمل بشكل دائم" الآن.** سببان مُثبتان:

1. **`DATABASE_URL` غير مُهيّأ** — التخزين في الذاكرة. وقد رصدتُ أثرًا عمليًا لذلك: مسار `/api/cron/sync-competitions` خزّن 12 بطولة وأبلغ `storedCompetitions: 12`، بينما `/api/v1/competitions` في نفس العملية أعاد `discovered: 0` — أي أن حُزم المسارات في وضع التطوير لا تتشارك حالة الوحدة النمطية. هذا بالضبط ما تحذّر منه `.env.example`.
2. **لا مفتاح Football-Data ولا TheSportsDB** — `catalogCapableProviders()` أعاد `none configured`.

لوحة الإدارة تعرض هذا بأمانة: «لم تنجح بعد» · «ذاكرة مؤقتة — تُفقد عند إعادة التشغيل — اضبط DATABASE_URL».

---

## 7) الملفات الجديدة والمُعدَّلة

### جديدة (6)

| الملف | الدور |
|---|---|
| `lib/competition-sync.ts` | المزامنة + المخزن + جرد التغطية (741 سطرًا) |
| `app/api/cron/sync-competitions/route.ts` | مسار Cron بمصادقة `CRON_SECRET` |
| `app/api/v1/competitions/route.ts` | تقرير التغطية الآلي القراءة (عام، للقراءة فقط) |
| `packages/sdl/test/competitions.test.ts` | 12 اختبار محوّل |
| `scripts/verify-competition-sync.test.ts` | 10 اختبارات مزامنة |
| `scripts/report-competition-coverage.ts` | مولّد `docs/competition-coverage.json` |

### مُعدَّلة (12)

| الملف | التغيير |
|---|---|
| `packages/sdl/src/provider.ts` | نوع `competitions` + `getCompetitions()` + `CompetitionCapabilities` + `emptyCapabilities()` |
| `packages/sdl/src/adapters/base.ts` | افتراضي `not_supported` |
| `packages/sdl/src/adapters/football-data.ts` | تنفيذ `getCompetitions()` عبر `/v4/competitions` |
| `packages/sdl/src/adapters/thesportsdb.ts` | تنفيذ `getCompetitions()` عبر `search_all_leagues.php` |
| `packages/sdl/src/priority.ts` | قواعد `cd-1..cd-3` لنوع `competitions` |
| `packages/sdl/src/orchestrator.ts` | سياسة كاش `competitions` (12س خام / 24س كنسي) |
| `packages/sdl/src/index.ts` | تصدير الأنواع الجديدة |
| `db/seed.sql` | قواعد الأولوية مقابلة في قاعدة البيانات |
| `app/sitemap.ts` | **إصلاح SEO** — صفحات البطولات القانونية |
| `app/admin/providers/page.tsx` | لوحة حالة المزامنة (في اللوحة القائمة، لا لوحة جديدة) |
| `scripts/mock-football-data.mjs` | `/competitions` بشكل موثّق كامل بدل صفّين بلا اسم |
| `vercel.json` · `package.json` | cron أسبوعي + سكربتَي `competitions:test` و`competitions:report` |

**ما لم يُلمس عمدًا:** الهوية البصرية، `lib/providers.ts`، `components/ui/AttributionFooter.tsx`، خطوط أنابيب الأخبار، بنية الروابط (لم يتغيّر أي URL قائم)، لوحة الإدارة (أُضيفت لوحة داخل `/admin/providers` القائمة).

---

## 8) متطلبات قاعدة البيانات والبيئة

```bash
# إلزامي لتشغيل المزامنة فعليًا
DATABASE_URL=postgres://...          # جدولان يُنشأان تلقائيًا (CREATE TABLE IF NOT EXISTS)
FOOTBALL_DATA_API_KEY=...            # أو THESPORTSDB_KEY=...
CRON_SECRET=...                      # لمصادقة مسار الـ cron

# اختياري
NEMO_DEBUG=1                         # تسجيل أسباب رفض الصفوف
```

الجدولان (`provider_competitions`, `provider_competition_sync_runs`) يُنشآن تلقائيًا عند أول تشغيل عبر DDL idempotent — **لا هجرة يدوية مطلوبة**، ولا تعديل على `db/schema.sql` القائم.

---

## 9) قرارات الإسناد والترخيص

| القرار | السبب |
|---|---|
| إسناد SportScore محفوظ كما هو | جزء من الترخيص — لم يُلمس |
| `getCompetitions()` في TheSportsDB يضبط `listed` فقط | الطبقة المجانية بيانات وصفية؛ لا تُستخدم للنتائج المباشرة |
| لا طلب لأي endpoint مدفوع من TheSportsDB | مُثبَّت باختبار + قائمة `capabilities` |
| الصور تحمل `photoAttribution` | قاعدة مجتمعية — الترخيص يُراجع قبل العرض |
| لا شعارات مُختلَقة | `logoUrl` يبقى `null` عند غيابه (مُختبَر) |
| لا ادّعاء رعاية | لا نصّ يوحي بشراكة مع أي اتحاد أو نادٍ |

---

## 10) تحسينات SEO والتحقق منها

| البند | الحالة |
|---|---|
| `robots.txt` | سليم — `Host` و`Sitemap` على نفس النطاق، `/admin` `/account` `/api/` محظورة |
| Canonical | كل صفحة بطولة لها `alternates.canonical` تشير إلى المسار القانوني؛ الأسماء المستعارة تُعيد `permanentRedirect` |
| وصف/عنوان مميّز | لكل صفحة بطولة عنوان ووصف عربي مختلف (مُتحقَّق في `competitionMetadataBody`) |
| الصفحات غير الموجودة | `robots: { index: false, follow: true }` — لا تتراكم مع noindex المدمج |
| **Sitemap** | **مُصلَح: 27 → 42 رابطًا، 0 → 15 صفحة بطولة** |
| روابط ميتة في Sitemap | **صفر** — كل الـ16 تُعيد 200 |
| البوابات | صفحات البيانات تُدرج فقط عند `dataServable()` — لا إعلان لصفحات «البيانات غير متوفرة» |
| الصفحات الفارغة | مُستبعدة عبر `hasMatchIdentity()` |

**ما لم أفعله عمدًا:** لم أُنشئ صفحات جماعية منخفضة القيمة، لم أُغيّر أي بنية روابط، لم أُضف `hreflang` (الموقع عربي فقط بلا بنية لغات مزدوجة)، لم أُضف JSON-LD جديدًا بدون التحقق من مطابقته للمواصفة.

---

## 11) الاختبارات والنتائج الحرفية

### خط الأساس (قبل أي تعديل)

```
npm run check  →  خروج 0
  sdl:test 156 · repairs 23 · news ✓ · search 26 · freshness 12
  sports 6 · stream-policy 8 · classify 15 · consistency 26 · scenarios 27/27
```

### بعد التعديلات

```
npm run check  →  خروج 0
  sdl:test 168 (‎+12)  · repairs 23 · news ✓ · search 26 · freshness 12
  sports 6 · competitions 10 (جديد) · stream-policy 8 · classify 15
  consistency 26 · scenarios 27/27
```

**صفر انحدار:** كل الأعداد مطابقة لخط الأساس، والإضافات فقط.

### الاختبارات الـ22 الجديدة (كلها ناجحة)

```
ok 19 - thesportsdb getCompetitions maps a doc-shaped league listing
ok 20 - thesportsdb refuses an unfiltered listing instead of reporting an empty catalog
ok 21 - thesportsdb treats a null league array as an empty catalog, not a failure
ok 22 - thesportsdb drops catalog rows without a stable id or a name
ok 23 - thesportsdb surfaces a rate limit as a typed failure, not an empty list
ok 24 - football-data getCompetitions returns the codes the key can actually serve
ok 25 - football-data answers an empty list for a sport it does not cover
ok 26 - football-data filters the catalog by country
ok 27 - football-data propagates an auth failure instead of returning an empty catalog
ok 28 - sportscore reports not_supported for catalog discovery
ok 29 - demo adapter does not claim catalog discovery either
ok 30 - only the two providers with a documented listing endpoint declare it
+ 10 اختبارات مزامنة (تطبيع، رفض، تحديث في المكان، حفظ القدرات، المخزن)
```

### أوامر أخرى

| الأمر | النتيجة |
|---|---|
| `npm run typecheck` | خروج 0 |
| `npm run sdl:typecheck` | خروج 0 |
| `npm run build` | **خروج 0** — المساران الجديدان ظاهران في المخرجات |
| `npm run smoke` | **1 فشل** — `/players/nope-not-a-player` (موجود مسبقًا، انظر 3.3) |

---

## 12) القيود المعروفة

1. **لا وصول للإنترنت** — لا يمكن تعداد فهرس أي مزوّد حقيقي، ولا فحص الإنتاج.
2. **`DATABASE_URL` غير مُهيّأ** — المزامنة غير دائمة؛ الحالة لا تُشارك بين حُزم المسارات في وضع التطوير.
3. **لا مفاتيح مزوّدين** — `catalogCapableProviders()` = `none configured`.
4. **المزامنة لم تُنفَّذ على مزوّد حقيقي** — أُثبتت ضد مزوّد وهمي محلي فقط.
5. **الحماية من التزامن داخل العملية فقط** — كافية لـ cron يومي، وليست قفل Postgres استشاريًا كما في خط أنابيب الأخبار.
6. **`npm run smoke` يفشل** بسبب خطأ موجود مسبقًا مرتبط بانقطاع الشبكة.

---

## 13) ما لم أتمكّن من التحقق منه

| البند | السبب |
|---|---|
| سلوك `/players/[slug]` على الإنتاج | `nemo-sports.vercel.app` → HTTP 000 |
| فهرس Google الفعلي | لا وصول لـ Search Console |
| صحة JSON-LD لدى Google | لا وصول لأداة الاختبار الغنية |
| سلوك Vercel Cron الفعلي | لا نشر (ممنوع صراحةً) |
| شروط المزوّدين الحالية | صفحات الشروط غير قابلة للوصول — الاعتماد على `COMPLIANCE.md` (آخر مراجعة 2026-10-06) |
| تغطية SportScore الحية للبطولات الـ15 | المزوّد غير قابل للوصول |
| العرض على الجوال في متصفح حقيقي | اختُبر عبر HTTP فقط، لا عرض بصري |

---

## 14) تعليمات الاختبار الآمن في Preview

```bash
# 1) شغّل المزوّد الوهمي (بلا إنترنت، بلا مفاتيح)
node scripts/mock-football-data.mjs

# 2) وجّه التطبيق إليه في نافذة أخرى
FOOTBALL_DATA_API_KEY=mock \
FOOTBALL_DATA_BASE_URL=http://127.0.0.1:4321/v4 \
CRON_SECRET=local-test-secret \
NEMO_SPORTSCORE_ENABLED=0 \
npm run dev

# 3) نفّذ المزامنة
curl -H "Authorization: Bearer local-test-secret" \
  "http://127.0.0.1:3000/api/cron/sync-competitions?force=1"

# 4) اقرأ التغطية
curl "http://127.0.0.1:3000/api/v1/competitions" | jq '.counts'

# 5) تحقق من الـ Sitemap (يتطلب مزوّدًا قابلًا للخدمة)
curl "http://127.0.0.1:3000/sitemap.xml" | grep -c "<loc>"

# 6) لوحة الإدارة: سجّل الدخول ثم افتح /admin/providers
#    → لوحة «اكتشاف البطولات تلقائيًا»
```

**للاختبار بمزوّد حقيقي:** اضبط `FOOTBALL_DATA_API_KEY` حقيقيًا واحذف `FOOTBALL_DATA_BASE_URL` و`NEMO_SPORTSCORE_ENABLED`. **لا تفعل ذلك على الإنتاج** قبل ضبط `DATABASE_URL`.

---

## 15) الخطوات التالية ذات الأولوية

| # | الخطوة | الجهد | القيمة |
|---|---|---|---|
| 1 | ضبط `DATABASE_URL` + `FOOTBALL_DATA_API_KEY` على Preview وتشغيل المزامنة فعليًا | دقائق | **حرجة** — بدونها لا شيء دائم |
| 2 | توليد تقرير الفجوة الحقيقي (`/api/v1/competitions`) ومراجعته تحريريًا | ساعة | **عالية** — هذا هو تقرير البطولات المفقودة الحقيقي |
| 3 | ربط البطولات المُكتشَفة ذات القيمة بصفحات قانونية (عبر `lib/competition-catalog.ts`) | لكل بطولة | **عالية** — يوسّع التغطية بلا صفحات فارغة |
| 4 | تعبئة أعلام القدرات من ردود حقيقية (جدول/مباريات) بدل `null` | يوم | عالية — يُمكّن عرض «هذه البطولة لها جدول ترتيب» بصدق |
| 5 | التحقق من شروط TheSportsDB قبل تفعيل مفتاحه | ساعة | **قانونية** |
| 6 | معالجة `/players/[slug]` 500 بتمييز «المزوّد أجاب: غير موجود» عن «المزوّد غير متاح» | نصف يوم | متوسطة |
| 7 | تشغيل `npm run smoke` في بيئة ذات شبكة للتأكد من زوال الفشل | دقائق | متوسطة |

---

## 16) أمان Git والإصدار

```
الفرع:      arena/1b8dee37-sport
القاعدة:    7adb7f2
الالتزام:   bb58ef7
حالة الشجرة: نظيفة (لا تغييرات غير متتبَّعة خارج الملفات الجديدة المقصودة)
```

| الفحص | النتيجة |
|---|---|
| حذف عرضي | **لا شيء** — `git diff --stat` يُظهر 18 ملفًا، كلها إضافات (+1669/−8) |
| أسرار في الكود | **لا شيء** — التوكنات تُقرأ من `process.env` فقط؛ كلمة مرور الاختبار المحلي استُخدمت كمتغير بيئة في بيئة الاختبار ولم تُكتب في أي ملف مُلتزَم |
| تغييرات مستخدم أُعيدت الكتابة عليها | **لا شيء** — الشجرة كانت نظيفة عند البدء |
| PR #26 | **لم يُفتح، لم يُدمج، لم يُعدَّل** |
| كتابة على قاعدة بيانات الإنتاج | **لا شيء** — `DATABASE_URL` غير مضبوط أصلًا |
| نشر | **لا شيء** |

---

## خلاصة التمييز بين الحالات

| الحالة | البنود |
|---|---|
| **مُنفَّذ ومُتحقَّق منه** | نوع بيانات `competitions` + محوّلان + مزامنة idempotent + مسار cron مؤمَّن + تقرير تغطية آلي + لوحة إدارة + إصلاح Sitemap (27→42) + 22 اختبارًا جديدًا |
| **مُتحقَّق منه كعيب** | صفحات البطولات غائبة عن Sitemap (أُصلح) · لا اكتشاف فهرس (أُصلح) · `/players/[slug]` 500 عند انقطاع المزوّد (موجود مسبقًا، لم يُعدَّل عمدًا) |
| **محجوب** | تعداد فهرس المزوّد الحقيقي · فحص الإنتاج · شروط المزوّدين الحالية · فهرس Google |
| **مقترح ولم يُنفَّذ** | تعبئة أعلام القدرات من ردود حقيقية · ربط المُكتشَفة بصفحات قانونية · تمييز 404 عن 500 في صفحة اللاعب |

**لا بيانات مُختلَقة. لا صفحات جماعية منخفضة القيمة. الإنتاج لم يُلمس.**
