# NEMO Sports — تقرير التدقيق + الـPrompt التنفيذي الشامل

**التاريخ:** 2026-10-06
**الفرع المفحوص:** `arena/bcd676e5-sport` (مبني على `3a46254` من `main`)
**المنهج:** قراءة ستاتيكية شاملة للكود (كل الـroutes والمكتبات والـadapters) + مراجعة `AUDIT.md` الموجود + مقارنة الحالة الحالية بما تم إصلاحه منذ التدقيق الأصلي.
**قيد مهم:** هذه البيئة تحجب الاتصال الخارجي (HTTPS)، لذلك لم يكن بالإمكان اختبار مسار البيانات الحية فعليًا — الـPrompt أدناه يتضمن بروتوكول تحقق إنتاجي إلزامي على رابط Vercel الحقيقي.

---

# أولًا: التقرير المختصر

## ما يعمل حاليًا — لا تلمسه (مختصر)

- بنية Next.js 15 + App Router + TypeScript، اعتماديات نحيفة، جودة كود عالية.
- طبقة بيانات SDL ممتازة (134 اختبارًا ناجحًا): SportScore مجاني بلا مفتاح كمصدر افتراضي + Football-Data.org عند وجود مفتاح + 4 مزودين مبرمجين + demo gate صارم.
- **تم إصلاحها منذ التدقيق الأصلي:** حماية `/admin` و`/api/v1/system` عبر `middleware.ts` (فشل نحو الإغلاق)، security headers + CSP، `SITE_URL` الموحد (مشكلة Search Console "URL غير مسموح به" محلولة)، `robots.txt` وsitemap ديناميكي مربوط بـ`dataServable()`، منع فهرسة الديمو، حماية `/matches/[slug]` من الصفحات الفارغة (`hasMatchIdentity`)، تمييز 404 الثابت عن العطل العابر، سجل بث لكل مباراة على حدة (لا يوجد iframe ثابت)، نظام أخبار RSS كامل (جلب→تحليل→إزالة تكرار→تصنيف→تخزين) مع cron + تحديث كسول.
- لا مفاتيح مكشوفة، لا روابط بث مقرصنة، لا بيانات مخترعة في الصفحات العامة.

## 🔴 CRITICAL — يمنع الإنتاج/الفهرسة

| # | المشكلة | الدليل | الإصلاح (مجاني) |
|---|---------|--------|-----------------|
| C1 | **لا توجد Postgres/Redis مُعدّة** — مخزن الأخبار والكاش والـcanonical كلها ذاكرة داخل العملية، تتبخر مع كل cold start على Vercel serverless. الأخبار قد لا تظهر أبدًا في الإنتاج. | `lib/db/pg.ts` و`lib/cache/redis.ts` يعودان لـmemory عند غياب المتغيرات؛ `lib/news/store.ts` نفس النمط | Neon أو Supabase (Postgres مجاني) + Upstash (Redis مجاني) ← ثم `DATABASE_URL` و`REDIS_URL` في Vercel ثم `npm run db:setup`. الكود جاهز، لا تغيير برمجي. |
| C2 | **مسار البيانات الحية غير متحقق منه إنتاجيًا** — SportScore يحجب نطاقات Vercel serverless (403)، والـadapter يجب أن يمر عبر مرحّل Edge الخاص (`/api/v1/sportscore-relay`) عبر `SPORTSCORE_BASE_URL`. إن كان هذا غير مضبوط = كل صفحات المباريات "البيانات غير متوفرة" + الموقع يصبح `noindex` تلقائيًا (حسب `dataServable()`). | تعليقات `packages/sdl/src/adapters/sportscore.ts` و`.env.example` | ضبط `SPORTSCORE_BASE_URL` على الإنتاج + تحقق HTTP فعلي من كل route (البروتوكول في الـPrompt). |
| C3 | **الـcron غير مُصادق عليه على الأرجح** — `/api/cron/fetch-news` يرفض العمل (503) بدون `CRON_SECRET` أو `NEMO_INGEST_TOKEN`، أي لا ingestion مجدول للأخبار. | `app/api/cron/fetch-news/route.ts` | ضبط `CRON_SECRET` في Vercel (Vercel Cron يرسله تلقائيًا). |
| C4 | **روابط مباريات تؤدي لـ404 (شكوى المستخدم)** — الأسباب المحتملة: (أ) فشل المرحّل في الإنتاج، (ب) روابط `providerId` يفشل `getMatchDetail` لها، (ج) روابط demo-slug قديمة/مفهرسة. | `ProviderMatchList` يربط `/matches/${providerId}`؛ صفحة التفاصيل تطلب `sdlMatchDetail` | بروتوكول إعادة إنتاج إلزامي على الإنتاج + ربط الروابط بالـslugs المتحقق منها فقط + 404 مستقر غير مفهرس لما عداها. |

## 🟠 HIGH — يجب إصلاحها

| # | المشكلة | الحالة |
|---|---------|--------|
| H1 | `/players` (القائمة) تعمل بالديمو فقط = **فارغة في الإنتاج**، بينما `/players/[slug]` تعمل عبر SportScore لكن **لا يمكن الوصول إليها** (لا روابط تقود إليها). | ابنِ الفهرس من SDL topscorers (يعمل بلا مفتاح) لكل بطولة مغطاة، واربط الـslugs الحقيقية فقط. |
| H2 | `/competitions` و`/competitions/[slug]` هياكل ستاتيكية + مباريات ديمو = أصفار وفراغ في الإنتاج. | اربط التفاصيل بـSDL (ترتيب + مباريات البطولة + هدافين)؛ اعرض فقط البطولات ذات البيانات؛ لا أرقام غير صادرة من المصدر. |
| H3 | `/watch` يعمل بالديمو فقط = فارغ في الإنتاج. | اشتق الجدول من سجل `match_streams` مربوطًا بالمباريات الحقيقية؛ حافظ على قواعد المرخص-فقط. |
| H4 | البحث فارغ في الإنتاج (يفتش مصفوفات الديمو). | ابحث في نفس datasets الحقيقية (دليل الفرق، الهدافين/اللاعبين، المباريات، مخزن الأخبار) مع نفس الـnormalizer العربي؛ أبقِ `noindex`. |
| H5 | `LiveProvider` في الـlayout يستطلع `/api/live` كل **5 ثوانٍ** في كل صفحة، والـendpoint يقرأ الديمو فقط = `{}` في الإنتاج — طلبات عبثية دائمة. | أعد التوجيه للقطة حية حقيقية مخزّنة، أو عطّل الاستطلاع إنتاجيًا عند غياب البيانات؛ أبقِ `LiveAutoRefresh` (لا WebSocket). |
| H6 | الـsitemap يتضمن المباريات فقط — لا فرق/لاعبين/أخبار/بطولات حقيقية. | وسّعه بنفس قواعد الصدق (200 + محتوى حقيقي + فحص هوية)، مع سقوف عددية. |
| H7 | لا حدّ للطلبات الواردة — المرحّل `/api/v1/sportscore-relay` بروكسي مفتوح يحرق حصة 10k/يوم. | Token bucket لكل IP (ذاكرة، وRedis عند توفره)؛ أبقِ `no-store`. |
| H8 | `FOOTBALL_DATA_API_KEY` (مجاني، 10 طلب/دقيقة) غير مضبوط على الأرجح — الترتيب/الهدافون/دليل الفرق يعتمدون عليه جزئيًا. | سجّل مفتاحًا مجانيًا من لوحة المزود؛ تحقق هل fallback SportScore يغني عنه وأين لا يغني. |

## 🟡 MEDIUM — مهمة لكن غير مانعة

- M1: احتمال ازدواج وسم `robots` على `not-found.tsx` العامة — تحقق ووحد.
- M2: صفحات `/admin` للمحتوى ما زالت تعرض أرقامًا ثابتة — اعرض تشخيصات SDL الحقيقية أو "غير متوفر"، حتى داخل اللوحة.
- M3: JSON-LD الرئيسية مبني على مباراة ديمو (null إنتاجيًا — سليم لكن يُحسّن بمباراة حية حقيقية أو يُحذف).
- M4: فجوات internal linking (مباراة→فريق، خبر→كيان) + أضف `BreadcrumbList` على صفحات التفاصيل.
- M5: استقرار الروابط M2 (providerId في `/matches/`) — **اقبله كوضع قائم ولا تغير URLs** (ممنوع)، مع خطة 301 مؤجلة موثقة فقط.
- M6: `faq/page.tsx` يستخدم `dangerouslySetInnerHTML` (آمن اليوم، خطِر لو صار المحتوى قابلًا للتحرير) + لا error reporting إنتاجي.
- M7: `/account` نموذج ميت — أبقِ الصدق (`noindex` + disallow موجودان)، لا تبنِ auth (ممنوع إلا للضرورة).
- M8: مزامنة README مع الواقع (الأرقام انحرفت).

## 🟢 OPTIONAL — مستقبلية

- نسخة إنجليزية/i18n (قرار منتج، الموقع عربي بالكامل اليوم — وهذا سليم).
- حسابات Auth.js حقيقية (فقط عندما توجد كتابة في اللوحة).
- اختبارات Playwright E2E، Sentry، صحة المزودين في Redis، تجزئة sitemap index، تكثيف cron (Pro أو cron-job.org المجاني).

## تقييم هندسي صريح (لا تسويق)

1. **الفهرسة اليوم على الأرجح متوقفة ذاتيًا**: `dataServable()` يُصدر `noindex` عندما لا تتدفق بيانات حقيقية — وهذا **تصميم صحيح** يحميك من فهرسة الفراغ، لكنه يعني أن C1+C2+C3 يجب أن تُحل أولًا وإلا بقي الموقع خارج الفهرس. لا تعد نفسك بظهور في Google قبلها.
2. **بدون مصدر خارجي لا يمكن "اختراع"**: الفرق/اللاعبون/الترتيب يحتاجون Football-Data.org (مجاني) أو ما يغطيه SportScore مجانًا — الـPrompt يحدد لكل صفحة: ما الذي يعمل بلا مفتاح وما الذي يحتاج المفتاح المجاني. لا يوجد حل سحري بدون أي مصدر.
3. **Google News RSS غير رسمي** (نهج مجتمعي موثق، بلا مفتاح): عناوين + ملخصات + روابط أصلية فقط، لا نسخ نصوص كاملة، والصور فقط المرخصة — أي مطالبة بأكثر من ذلك مخاطرة قانونية وSEO.
4. **لا أعدك**: لا مراكز أولى، لا Discover تلقائي، لا News inclusion تلقائي. ما يمكن ضمانه: موقع سليم تقنيًا، بيانات حقيقية، فهرسة نظيفة.

---

# ثانيًا: الـPrompt التنفيذي الشامل (انسخه والصقه للمبرمج / Claude Code)

> **ابدأ من هنا — انسخ كل ما داخل هذا القسم.**

---

# NEMO Sports — Implementation Prompt (Production + SEO Readiness)

## 0. كيف تعمل (اقرأ أولًا — غير قابل للتفاوض)

1. **افحص الكود الحالي أولًا، ثم نفّذ التعديلات تدريجيًا، ولا تعيد بناء ما يعمل.**
2. هذا الموقع قائم ويعمل على Vercel (`https://nemo-sports.vercel.app/`، جذر التطبيق `nemo-sports/`). مهمتك **إصلاح وإكمال**، لا إعادة تصميم ولا إعادة كتابة.
3. نفّذ على مراحل صغيرة قابلة للمراجعة. بعد كل مرحلة: `npm run sdl:test` ثم `npm run build` يجب أن ينجحا.
4. لا تدّعِ أن شيئًا يعمل دون اختباره فعليًا (HTTP حقيقي + build إنتاجي).
5. عند أي تعارض بين "إضافة feature" و"إصلاح الصدق"، الصدق يفوز دائمًا.

## 1. Project Context (افحصه من الكود — لا تفترض)

- Next.js 15 (App Router) + React 19 + TypeScript + Tailwind 4. الموقع **عربي RTL فقط** (`<html lang="ar" dir="rtl">`) — لا i18n ولا نسخة إنجليزية، وهذا مقصود.
- طبقة البيانات: `packages/sdl/` (مزوّدون: `sportscore` بلا مفتاح وافتراضي، `football-data` بمفتاح، `sportradar`/`sportmonks`/`api-football`/`thesportsdb` مبرمجة بلا مفاتيح، `demo` للتجربة). البوابة الوحيدة: `lib/sdl-gateway.ts`. **ممنوع**: استيراد adapter مباشرة من صفحة، بناء URL مزود خارج SDL، إخراج `providerId` الخام خارج SDL إلا في روابط `/matches/` (وضع قائم — انظر §17).
- مصادر الحقيقة: الأصل `lib/site.ts` (`SITE_URL`)، البيانات `lib/sdl-gateway.ts`، الأخبار `lib/news/*`، البث لكل مباراة `lib/match-streams.ts` + `lib/broadcasts.ts`.
- البنية التحتية اختيارية التدهور: Postgres (`lib/db/pg.ts`) وRedis (`lib/cache/redis.ts`) — بدونهما يعمل الموقع بذاكرة العملية. **في الإنتاج على Vercel هذا يعني فقدان البيانات مع كل cold start** — انظر §6.
- البيئة المحلية/الاختبارية قد تحجب HTTPS الخارجي — **التحقق النهائي للبيانات الحية يكون على رابط Vercel الإنتاجي فقط** (§24).

## 2. Current Problems (تحقق من كل واحد بنفسك قبل الإصلاح)

1. روابط مباريات تؤدي لـ404 (بلاغ المستخدم) — أعد الإنتاج أولًا (§7).
2. `/players` فارغة إنتاجيًا + `/players/[slug]` الحقيقية غير reachable.
3. `/competitions` و`/competitions/[slug]` هياكل ستاتيكية بلا بيانات حقيقية.
4. `/watch` فارغ إنتاجيًا (ديمو فقط).
5. البحث فارغ إنتاجيًا (يفتش مصفوفات الديمو).
6. استطلاع حي كل 5 ثوانٍ لـ`/api/live` (ديمو فقط) من كل صفحة عبر `LiveProvider` في الـlayout.
7. لا Postgres/Redis مُعدّة (افتراض — تحقق من Vercel env ثم قرر).
8. `SPORTSCORE_BASE_URL` و`CRON_SECRET` و`FOOTBALL_DATA_API_KEY` — تحقق من وجودها في Vercel env.
9. Sitemap بلا فرق/لاعبين/أخبار/بطولات.
10. المرحّل `/api/v1/sportscore-relay` بلا حدّ وارد.

## 3. Objectives (بالترتيب)

1. صفر روابط مباريات مكسورة؛ كل مباراة حقيقية لها صفحة تعمل قبل/أثناء/بعد المباراة.
2. بيانات حقيقية فقط في كل الأقسام، وحالات فراغ صادقة لما عداها.
3. SEO تقني سليم: canonical، robots، sitemap ديناميكي صادق، structured data للمحتوى الحقيقي فقط.
4. فهرسة نظيفة: المهم يُفهرس، الفارغ/المكرر/الأدوات لا يُفهرس ولا يُدرج في sitemap.
5. استقرار: ISR + كاش + تدهور صادق عند فشل المصدر، دون كسر التحديث الحي.
6. صفر أسرار مكشوفة، صفر بيانات مخترعة، صفر ادعاءات غير مختبرة.

## 4. Non-Negotiable Constraints (ممنوعات)

- لا إعادة تصميم، لا تغيير ألوان/هوية/Navbar/Footer إلا لسبب وظيفي مثبت.
- لا تغيير URL structure الحالي. لا حذف feature تعمل. لا استبدال مصدر يعمل.
- **لا fake data إطلاقًا**: لا مباريات/نتائج/أخبار/فرق/لاعبين وهمية، لا أرقام ("20 فريقًا"، "38 جولة") إلا من المصدر حرفيًا.
- لا API مدفوع، لا خدمات خارجية مدفوعة، لا Backend/Auth جديد إلا للضرورة القصوى، لا تغيير الاستضافة (Vercel).
- لا structured data لا يطابق المحتوى الظاهر. لا schema للتلاعب. لا `noindex` على الصفحات المهمة. لا فهرسة لـ404/فارغ/demo/search/filter-mazes.
- البث: روابط مرخصة فقط تملك حق استخدامها؛ لا تفترض مصادر مجانية/غير مرخصة؛ لا iframe ثابت مشترك.
- الأخبار: headline + ملخص قصير + مصدر + وقت نشر + رابط أصلي (+ صورة مرخصة فقط). لا نسخ مقالات كاملة.
- أي secret يبقى server-side فقط، ولا يظهر في أي response.
- إن تعذّر شيء بدون مصدر/مفتاح: **وثّقه كقيد صريح** ولا تخترع حلًا.

## 5. Audit Requirements (نفّذ أولًا — قبل أي تعديل)

افحص كل route وأنتج جدولًا (يعمل؟ status؟ بيانات حقيقية؟ فارغ؟ title/description/canonical/روابط داخلية/structured data؟):

`/ /matches /matches/[slug] /live /results /fixtures /competitions /competitions/[slug] /standings /teams /teams/[slug] /players /players/[slug] /news /news/[slug] /watch /search /about /contact /faq /privacy /terms /copyright /broadcast-rights /account /admin/* /api/live /api/search /api/v1/* /api/cron/fetch-news`

- لاحظ: لا توجد صفحات transfers/analytics/statistics — **لا تنشئها** (خارج الأهداف).
- سجّل لكل route: مصدر البيانات الفعلي (provider/demo/memory/empty) — استخدم `DataSourceNote` والـresponses نفسها، لا التخمين.

## 6. Data Architecture & Infrastructure (الأولوية القصوى — قبل الـfeatures)

1. **تحقق من Vercel env**: `DATABASE_URL`، `REDIS_URL`، `SPORTSCORE_BASE_URL`، `CRON_SECRET` أو `NEMO_INGEST_TOKEN`، `FOOTBALL_DATA_API_KEY`، `NEXT_PUBLIC_SITE_URL`، `ADMIN_ACCESS_TOKEN`. سجّل الموجود/المفقود في تقريرك — لا تطبع القيم أبدًا.
2. **إن غابت Postgres/Redis**: الحل المجاني الوحيد المقبول هو Neon أو Supabase (Postgres) + Upstash (Redis) — طبقات مجانية — ثم `npm run db:setup` (ينفذ `db/schema.sql` + `db/seed.sql` + `db/migration-0002-news.sql`). الكود (`lib/db/pg.ts`، `lib/cache/redis.ts`، `lib/news/store.ts`) يدعمها أصلًا — **لا تكتب driver جديدًا**.
3. **سلسلة المصادر** (موجودة في SDL — احترمها ولا تعيد اختراعها): `Primary provider → Fallback provider → Cached last valid (staleGrace)` — ولا fallback أبدًا إلى demo في الإنتاج (`demoContentVisible()`).
4. **وثّق لكل صفحة**: ما الذي يعمل بلا مفتاح (SportScore)، ما الذي يحتاج `FOOTBALL_DATA_API_KEY` **المجاني** (10 طلب/دقيقة — الترتيب/الهدافون/دليل الفرق للدوريات الكبرى)، وحدود كل مصدر (SportScore: ~10k طلب/24h/IP + كاش 60s؛ football-data المجانية: بطولات محدودة + سقف صارم).
5. ممنوع إضافة أي مزود جديد إلا مجانيًا ومتاحًا فعلًا وموثق الحدود.

## 7. Match System (أولوية قصوى)

1. **بروتوكول إعادة إنتاج 404 (إلزامي على الإنتاج)**: اجمع كل روابط `/matches/*` الظاهرة (الرئيسية، `/matches`، `/live`، `/results`، `/fixtures`، sitemap) واطلبها HTTP واحدًا واحدًا. صنّف الفشل: (أ) relay failure، (ب) detail failure لslug حقيقي، (ج) demo-slug قديم/مفهرس.
2. القواعد: لا رابط مباراة ظاهر يؤدي لـ404. `slug/providerId` ثابت لا يتغير بتحديث المباراة. الصفحة تعمل scheduled/live/finished/postponed/cancelled.
3. صفحة `/matches/[slug]` موجودة وممتازة (SDL detail + events/lineups/stats + `SportsEvent` JSON-LD + `hasMatchIdentity` + تمييز transient/permanent) — **أصلح الـbug فقط**: تأكد أن كل رابط يُعرض يأتي من feed متحقق منه، وأن أي `slug` بلا هوية (`hasMatchIdentity === false`) يعطي 404 مستقرًا + `noindex` ولا يظهر في sitemap.
4. محتوى الصفحة حسب التوفر **فقط**: الفريقان، البطولة، التاريخ/الوقت، الملعب، الحالة، النتيجة، الأحداث (أهداف/بطاقات/تبديلات)، التشكيلات، الإحصائيات، أخبار مرتبطة (عبر entity matching الموجود)، البث (إن وُجد)، معلومات المباراة. لا تعرض قسمًا فارغًا كأنه موجود.
5. لا تغير `/matches/[slug]` URL pattern. لا تخلط مفردات الحالات (`lib/live.ts` مقابل canonical SDL statuses) — وحّد العرض عبر طبقة واحدة.

## 8. Live System

1. راجع: `LiveFeed` + `LiveProvider` (استطلاع 5s لـ`/api/live`) + `LiveAutoRefresh` (‏`router.refresh()` كل 60s) + `app/api/live/route.ts` (ديمو فقط حاليًا).
2. المطلوب: مباريات live حقيقية (SportScore عبر SDL)، نتيجة، دقائق، أهداف/بطاقات/تبديلات، حالات (HT/FT/مؤجل/ملغي)، وآخر قيمة صالحة عند فشل المصدر (موجود جزئيًا — أكمله).
3. **أصلح هدر الاستطلاع**: `/api/live` يجب أن يخدم لقطة حية حقيقية مخزّنة (SDL `live_matches` عبر الكاش المشترك) أو يُعطَّل استطلاع `LiveProvider` إنتاجيًا عند غياب البيانات الحقيقية. لا WebSocket. لا طلبات مكررة (انتبه لـReact StrictMode double-effect)، لا حلقات لا نهائية، لا مشاكل hydration.
4. احترم حصة المزود: الاعتماد على ISR + الكاش المشترك + coalescing الموجود في SDL؛ التحديث العميلي يعيد العرض (`router.refresh`) ولا يضرب المزود مباشرة.

## 9. News System

1. الخط القائم (Google News RSS → pipeline → store → `/news` + cron + lazy refresh) سليم — **أكمله ولا تستبدله**.
2. تحقق إنتاجيًا: هل الـcron يعمل (auth + آخر `ingestAllSources` ناجح)؟ هل الـstore دائم (Postgres) أم يتبخر؟ هل `/news` تعرض عناصر حقيقية؟ سجّل النتائج.
3. القواعد: headline + ملخص + مصدر + وقت + رابط أصلي فقط. بطاقات RSS تربط **خارجيًا** للمصدر الأصلي (`sourceUrl`) — لا صفحات `/news/[slug]` رقيقة لعناصر RSS. صفحة تفاصيل داخلية فقط للمقالات التحريرية الكاملة (الديمو حاليًا) — ولا تفاصيل فارغة أبدًا.
4. اربط الخبر بالكيانات (فريق/لاعب/بطولة/مباراة) عبر `lib/news/entities.ts` حيثما أمكن — روابط داخلية حقيقية، لا DDOS على المصدر.
5. لا صور إلا المرخصة قانونًا. لا ادعاء Discover/News inclusion.

## 10. Teams

1. `/teams` مبنية من `teamsDirectory()` (صفوف ترتيب حقيقية) — تحقق إنتاجيًا: هل تعمل بلا مفتاح (SportScore standings) أم تحتاج `FOOTBALL_DATA_API_KEY`؟ وثّق النتيجة وفعّل المفتاح المجاني إن لزم.
2. `/teams/[slug]` مربوطة بـSDL — أصلح أي كسر، واعرض حسب التوفر فقط: شعار، اسم، بلد، بطولة، مباريات أخيرة/قادمة، نتائج، تشكيلة، إحصائيات، أخبار مرتبطة.
3. الفهرسة فقط للصفحات ذات البيانات الحقيقية المفيدة؛ الفارغ = حالة صادقة + خارج sitemap.

## 11. Players

1. **ابنِ `/players` من البيانات الحقيقية**: الفهرس يُشتق من SDL topscorers لكل بطولة مغطاة (SportScore `getTopScorers` يعمل بلا مفتاح — تحقق). كل لاعب مُدرج يجب أن يملك stats حقيقية وأن يربط لـ`/players/[slug]` العاملة.
2. `/players/[slug]` تعمل عبر SDL — أصلح أي كسر؛ اعرض حسب التوفر: الاسم، الصورة (المرخصة فقط)، الفريق، المركز، الجنسية، الإحصائيات (مباريات/أهداف/صناعات/دقائق/بطاقات)، أخبار مرتبطة. لا صفحات بلا بيانات.
3. وحّد سلاسل الـslugs بين القائمة والتفاصيل (نفس مفردات SportScore) حتى لا توجد روابط ميتة.

## 12. Competitions

1. اربط البطولة فعليًا: `/competitions/[slug]` تعرض من SDL: معلومات البطولة، الفرق (من الترتيب)، المباريات (upcoming/results مفلترة بالبطولة)، الترتيب (إن توفر)، الهدافين، أخبار مرتبطة.
2. `/competitions` تعرض فقط البطولات ذات البيانات الحقيقية؛ أزل أي عدّادات ستاتيكية لا يصدرها المصدر.
3. لا أرقام مخترعة إطلاقًا. أي label ستاتيكي ("بيانات توضيحية") أبقِه فقط حيث ما زال صادقًا، واحذفه حيث صار حقيقيًا.

## 13. Broadcast System (per-match — موجود، أكمله)

1. `lib/match-streams.ts` + `MatchStreamPlayer`: مصدر لكل مباراة، لا مشغّل بلا مصدر، `upcoming` يُجهَّز بلا تشغيل، `inactive` (انتهت/أُلغيت) إشعار ستاتيكي، فشل المصدر رسالة مناسبة **دون كسر بقية الصفحة**.
2. `/watch` (ديمو فقط حاليًا): اشتق الجدول من سجل `match_streams` (Postgres عند توفرها) مربوطًا بالمباريات الحقيقية، مع نفس قواعد: مرخص فقط، إفصاح جغرافي، `rel="noopener noreferrer nofollow"` للخارجي.
3. تحقق من كل `embedUrl`: ‏https فقط (`validateEmbedUrl`)، ولا domains إلا لجهات تملك حق بثها. CSP `frame-src` موجود — لا توسّعه بلا سبب.

## 14. SEO Technical

- أبقِ وأصلح فقط: `SITE_URL` المصدر الوحيد، `metadataBase`، canonical ذاتي لكل صفحة حقيقية، `robotsForDataSource()`، `robots.ts` (allow العام + disallow `/admin /account /api/` فقط)، OG/Twitter، `lang="ar" dir="rtl"`، بنية headings، اتساق trailing slash، لا hreflang (الموقع أحادي اللغة فعلًا).
- أصلح: ازدواج `robots` على `not-found.tsx` (metadata موحدة `noindex, follow`)، أي عناوين/أوصاف مكررة، أي روابط مكسورة داخلية، أي soft-404 (صفحة 200 بلا محتوى = خطأ، حوّلها لفراغ صادق خارج الفهرس أو 404).
- `/search` تبقى `noindex, follow` وخارج sitemap. `/admin/*` تبقى `noindex` + middleware. صفحات API خارج sitemap.

## 15. Sitemap (ديناميكي — موجود، وسّعه)

- أبقِ البوابة `dataServable()` والقواعد: لا URL إلا لصفحة 200 حقيقية، لا 404، لا فارغ، لا مكرر، لا search/filter.
- أضف بنفس الصدق: فرق حقيقية (`/teams/[slug]`)، لاعبين حقيقيين، بطولات حقيقية، (أخبار تحريرية كاملة فقط — لا عناصر RSS الخارجية).
- سقوف معقولة (مثل المباريات 200)، `changeFrequency` واقعية (hourly للمباريات، weekly للستاتيكية)، `lastModified` حقيقية.

## 16. Robots & Indexing Strategy

- يُفهرس: الرئيسية، البطولات/الفرق/اللاعبين/المباريات/الأخبار **الحقيقية**، صفحات المحتوى المهمة.
- لا يُفهرس ولا يُدرج: search، الفارغ، الديمو، الحالات المؤقتة، API routes، الأدوات الداخلية، المكرر، تركيبات الفلاتر، 404.
- لا `noindex` عشوائي — كل `noindex` يجب أن يكون له سبب موثق في الكود.

## 17. URLs & Canonical & Redirects

- لا تغيير لأي URL قائم. `providerId` في `/matches/` وضع قائم مقبول — وثّقه كدَين تقني مع خطة 301 **مؤجلة** (canonical `match_id` + ‏`provider_entity_map` الموجود في السكيما) ولا تنفذها الآن.
- روابط demo-slug القديمة المفهرسة/المحفوظة: إن أمكن ربطها بمباراة حقيقية → 301؛ وإلا 404 مستقر + خارج sitemap. لا روابط داخلية جديدة لأي slug غير متحقق منه.

## 18. Structured Data (للحقيقي فقط)

- الموجود سليم (Organization، WebSite+SearchAction، SportsEvent، NewsArticle) — أبقه وأصلح فقط.
- أضف `BreadcrumbList` على صفحات التفاصيل. حسّن JSON-LD الرئيسية (مباراة حية حقيقية أو لا شيء — لا demo).
- `url` داخل الـJSON-LD يجب أن تكون مطلقة (`absoluteUrl`) — راجع `SportsEvent.url` النسبية الحالية.
- لا تخترع: أوقات بث، حالة حدث، نتيجة، فرق، تواريخ، فيديو، توافر.

## 19. Internal Linking

- الهدف: Google يكتشف المهم عبر HTML حقيقي، لا JS فقط. سلاسل: مباراة↔فريق↔بطولة↔لاعب↔خبر (حيث تتوفر العلاقة من المصدر/الكيانات).
- كل رابط داخلي يجب أن يقود لصفحة 200 حقيقية — اختبر آليًا (§24). لا روابط لصفحات ستفشل.

## 20. Mobile (Mobile-first)

- اختبر بعرض 360–390px: الرئيسية، المباريات، تفاصيل مباراة، live، الفرق، اللاعبين، الأخبار، البطولات، البحث، watch.
- ممنوع: overflow أفقي، بطاقات مكسورة، أزرار خارج الشاشة، قصّ نصوص، iframe يتجاوز العرض. لا تغيير هوية/تصميم — إصلاح كسر فقط.

## 21. Performance

- راجع: JS غير ضروري، طلبات API مكررة (خصوصًا استطلاع 5s)، صور (`next/image` + `remotePatterns` موجودة — استخدمها)، lazy loading، كاش (ISR `revalidate` الموجودة: مباريات 30s، live 30s، أخبار 120s...)، hydration.
- القاعدة: تحسين الأداء لا يكسر التحديث الحي. لا استبدال polling بـWebSocket.

## 22. Security

- الموجود (middleware fail-closed، CSP، أسرار server-side، `sanitizeDbMessage`) — أبقه. تحقق: لا `NEXT_PUBLIC_*` سرّي، لا secret في أي response، لا endpoints كتابة بلا حماية.
- أضف: حدّ وارد بسيط على `/api/v1/sportscore-relay` و`/api/search` (token bucket لكل IP؛ Redis عند توفرها وإلا ذاكرة) — يحمي حصة 10k/يوم.
- أصلح/وثّق: `faq` ‏`dangerouslySetInnerHTML` (عقّم أو حوّل لنص ستاتيكي)، CORS، `untrusted iframe URLs` (القائمة البيضاء الضمنية عبر السجل فقط)، XSS في مدخلات `q` (موجود normalizer — تأكد من escape عند العرض).
- لا CSRF مطلوب اليوم (لا نماذج كتابة حقيقية) — وثّق ذلك ولا تبنِ شيئًا.

## 23. Error Handling (حالات صريحة، بلا "Demo Data" إنتاجيًا)

- غطِّ: API down/timeout، لا مباريات/أخبار/فرق/لاعبين، مؤجلة/ملغاة/منتهية، ID غير صالح، مصدر غير متاح.
- القواعد القائمة (أبقها): transient → رمي يُبقي آخر صفحة ISR صالحة؛ permanent (`not_found`/`no_provider_configured`/`unsupported`) → ‏404 مستقر؛ `all_providers_failed` يبقى transient (لا 404 تخميني يحذف صفحات من الفهرس).
- `app/error.tsx` حدود موسومة — أضف تسجيلًا خفيفًا (console/Vercel logs) دون خدمات مدفوعة.

## 24. Testing (إلزامي — لا "يعمل" بلا دليل)

1. `npm run sdl:test` (134 اختبارًا) + `npm run news:test` + `npm run build` — كلها خضراء.
2. `scripts/smoke.mjs` ضد الإنتاج — ومدّده: كل روابط `/matches/*` من sitemap تعطي 200 + `hasMatchIdentity`؛ صفر روابط داخلية ميتة؛ sitemap بلا 404/فارغ؛ `not-found` وسم `robots` واحد.
3. فحص إنتاجي يدوي (عبر HTTP للرابط الحقيقي): أهم URLs تعطي 200، `robots.txt` و`sitemap.xml` على نفس الـhost، canonical مطلق صحيح، لا `noindex` على المهم، لا login مطلوب، mobile سليم.
4. سجّل في تقريرك: ما اختُبر وأين (local/Vercel URL) ونتائج كل فحص —Env indeterminism ممنوع: أي سلوك يعتمد على env يجب توثيق قيمه أثناء الاختبار.

## 25. Google Search Console Checklist (نفّذ ووثّق)

- [ ] الملكية مثبتة (الوسم موجود في `layout.tsx` — تحقق).
- [ ] `robots.txt` يُجلب بنجاح وsitemap مُرسل ومقبول (لا "URL غير مسموح به").
- [ ] عينة `URL Inspection`: مباراة حية + مباراة منتهية + فريق + لاعب + بطولة + خبر — كلها: 200، canonical صحيح، `index,follow`، structured data بلا أخطاء جوهرية (Rich Results Test).
- [ ] `Page indexing`: لا important-404، لا soft-404، لا "Crawled - currently not indexed" لصفحات مهمة بسبب فراغ (إن وُجدت = أعدها ل§7–12).
- [ ] Core Web Vitals مبدئيًا سليم على mobile.

## 26. Deployment Checklist (Vercel — لا تغيير استضافة)

- [ ] env مضبوطة: `DATABASE_URL` + `REDIS_URL` (طبقات مجانية) + `SPORTSCORE_BASE_URL` (المرحّل الخاص) + `CRON_SECRET` + `FOOTBALL_DATA_API_KEY` (مجاني) + `ADMIN_ACCESS_TOKEN` + (اختياري) `NEXT_PUBLIC_SITE_URL` عند الدومين المخصص فقط.
- [ ] `npm run db:setup` منفذة ضد Postgres الإنتاجية.
- [ ] الـcrons تعمل (`/api/v1/ingest` + `/api/cron/fetch-news` يوميًا — حد Hobby؛ intraday عبر lazy refresh).
- [ ] build الإنتاج ناجح، ISR يعمل، لا `NEXT_PUBLIC_DEMO_CONTENT=1` على الإنتاج.
- [ ] لا خدمة مدفوعة مضافة. لا دومين جديد إلا بقرار مالك المشروع.

## 27. Acceptance Criteria (لا يُعتبر المشروع مكتملًا إلا بها جميعًا)

- [ ] No broken match routes (كل رابط مباراة ظاهر = 200 حقيقية)
- [ ] No important 404 pages
- [ ] Real match data (قبل/أثناء/بعد) + events/lineups/stats حسب التوفر
- [ ] Real news (RSS pipeline يعمل إنتاجيًا + تخزين دائم)
- [ ] Real teams (قائمة + تفاصيل مربوطة بالمصدر)
- [ ] Real players (قائمة reachable + تفاصيل)
- [ ] Competition data connected (ترتيب + مباريات + هدافون من المصدر)
- [ ] Live updates tested (حقيقي، بلا هدر استطلاع)
- [ ] Broadcast system tested (لكل مباراة، فشل آمن)
- [ ] Sitemap valid (ديناميكي، حقيقي فقط، يشمل كل الأقسام)
- [ ] Robots valid + indexing strategy مطبقة
- [ ] Canonicals valid (مطلقة، ذاتية، بلا مكرر)
- [ ] Structured data valid (للحقيقي فقط + BreadcrumbList)
- [ ] No accidental noindex (ولا فهرسة للفارغ/الديمو)
- [ ] Internal linking tested (صفر روابط داخلية ميتة)
- [ ] Mobile tested (360px — صفر overflow/كسر)
- [ ] Production build successful + كل الاختبارات خضراء
- [ ] No fake data (صفر أرقام/نتائج/أخبار مخترعة)
- [ ] No exposed secrets + relay محدود المعدل
- [ ] Important pages ready for Google indexing (GSC checklist موثق)
- [ ] تقرير نهائي: ما أُصلح، ما اختُبر وأين، وما بقي كقيد صريح (مع سببه والحل المجاني المقترح)

---

> **نهاية الـPrompt — لا تنسخ ما بعد هذا السطر.**

---

# ثالثًا: كيف تستخدم هذا الملف

1. أعطِ المبرمج/Claude Code قسم **"ثانيًا"** فقط (من `# NEMO Sports — Implementation Prompt` حتى نهاية Acceptance Criteria).
2. اطلب منه العمل مرحلةً بمرحلة مع `build` أخضر بعد كل مرحلة، وتقرير اختبار إنتاجي قبل التسليم.
3. ابدأ أنت (مالك المشروع) بالخطوات التي لا تحتاج مبرمجًا: إنشاء Postgres/Redis مجانيين + مفتاح Football-Data.org المجاني + ضبط env vars في Vercel (القائمة في §26).
