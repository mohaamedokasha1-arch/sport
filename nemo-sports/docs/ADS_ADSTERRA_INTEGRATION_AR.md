# تكامل إعلانات Adsterra — دليل التشغيل والمراجعة

**التاريخ:** 2026-10-14 · **الشبكة:** Adsterra · **المصدر الوحيد للأكواد:** `lib/ads.ts`

هذا المستند يشرح *أين* وُزّع كل كود أرسلته الشبكة، و*لماذا* وُزّع بهذه الطريقة، وكيف تتحقق من أنه
يعمل فعلًا في الإنتاج. لا يوجد في المشروع أي ملف آخر يحتوي مفتاحًا أو رابطًا من روابط الشبكة.

> **تحديث Anti-Adblock (2026-10-14):** استُبدل سكربت الـ Popunder القديم ورابط الـ
> Smartlink القديم (وكانا على نطاق `profitableratecpmnetwork.com`) بالكامل بنسختي Anti-Adblock على
> `furydonkeypharmacy.com` (نفس المسار والمفتاح، مضيف جديد فقط)، وأُضيف المضيف الجديد إلى
> `AD_SCRIPT_HOSTS` حتى لا تحجبه الـ CSP. نطاق `profitableratecpmnetwork.com` باقٍ في المشروع
> لغرض واحد فقط: البار الاجتماعي (Social Bar) الذي لم يتغيّر كوده. وسكربت الـ Popunder الجديد
> يُحقن برمجيًا مرة واحدة عبر `components/ads/AdScripts.tsx` (يُنتج وسم
> `<script src="https://furydonkeypharmacy.com/ef/1c/8a/ef1c8a99e819306ee5d861acb0544c45.js"></script>`
> في `<head>`) — لا يُلصق خامًا في أي صفحة أو قالب حتى لا يُحمَّل مرتين.

---

## 1) ملخص التوزيع

| الوحدة | الشكل | الموضع في الموقع | الملفات |
| --- | --- | --- | --- |
| Banner 300×250 (iframe) | مفتاح `d7e3e208e423e33ed9dd4297709d102a` | صفحة تفاصيل المباراة `/matches/<slug>` **فوق** قسم «البث المباشر» و**تحته** — في فرعي الصفحة: فرع بيانات المزوّد (`app/matches/[slug]/page.tsx`) وفرع بيانات المعاينة (`components/match/MatchLive.tsx`) | `components/ads/AdsterraBanner.tsx` + `app/ad-frame/route.ts` |
| Social Bar | `…/16/cb/ec/16cbeca9d360e0f7e35b94c803572b23.js` | كل الصفحات العامة، من القالب الرئيسي | `components/ads/AdScripts.tsx` (مركّب في `app/layout.tsx`) |
| Popunder (Anti-Adblock) | `https://furydonkeypharmacy.com/ef/1c/8a/ef1c8a99e819306ee5d861acb0544c45.js` | نفس الموضع، ويُحمَّل بعد اكتمال الصفحة + خمول المتصفح | `components/ads/AdScripts.tsx` |
| Smartlink | `https://furydonkeypharmacy.com/ispf2u0nr9?key=ab1a65e313a5c0034294ac768d3878cc` | أزرار المشاهدة: «فتح في نافذة جديدة ↗» في مشغّل البث، وزر «مشاهدة على {الناقل} ↗» | `components/ads/useSmartlink.ts` |

الملفات المعدَّلة/المضافة: `lib/ads.ts` (جديد)، `app/ad-frame/route.ts` (جديد)،
`components/ads/*` (جديد)، `lib/security-csp.ts`، `next.config.ts`، `app/layout.tsx`،
`app/matches/[slug]/page.tsx`، `components/match/MatchStreamPlayer.tsx`،
`components/match/MatchLive.tsx`، `app/robots.ts`، `app/admin/ads/page.tsx`،
`scripts/verify-ads.test.ts` (اختبارات)، `.env.example`.

---

## 2) لماذا لا يوجد `document.write` في أي مكوّن React؟

كود Adsterra مكتوب لصفحة **متزامنة**: يعرّف متغيّرًا عامًّا واحدًا `atOptions` ثم يتوقع أن يعمل
`invoke.js` أثناء تحليل الصفحة. حقنه في مكوّن عميل بعد الترطيب (hydration) يُنتج مشكلتين معروفتين:

1. `atOptions` متغيّر **عام واحد**: إعلانان في صفحة واحدة يطغى أحدهما على الآخر (لهذا يشتكي الناشرون
   من ظهور إعلان واحد فقط عند تكرار الوحدة، وتوصي Adsterra باستخدام معرّف حاوية فريد أو تفعيل
   «JS ASYNC» في الحساب).
2. الوسم الذي يلجأ إلى `document.write()` بعد اكتمال المستند: حسب مواصفة HTML يستدعي ذلك
   `document.open()` ويستبدل **الصفحة بالكامل** — وهذا بالضبط سبب شكاوى «صفحة بيضاء بالكامل» عند
   استخدام هذا الكود داخل React.

**الحل المستخدم هنا:** لكل بانر مستند حقيقي خاص به على مسار الموقع نفسه: `GET /ad-frame`
(`app/ad-frame/route.ts`) يحتوي على الكود كما أرسلته الشبكة في صيغته المتزامنة الأصلية، ويُضمَّن
داخل `<iframe>` بمقاس ثابت 300×250. النتائج:

- لكل موضع `atOptions` ونافذة (`window`) و`document` خاص به → لا تعارض بين إعلانين.
- لو استخدم الوسم `document.write` بعد التحميل، يُكتب داخل **الإطار فقط** → أسوأ حالة هي مربع فارغ،
  ولن تُمحى صفحة الزائر أبدًا.
- الثبات البصري: المقاس محجوز قبل التحميل، فلا يوجد إزاحة تخطيط (CLS)، ولا يزيد ارتفاع الصفحة بعد
  وصول الإعلان.
- الأداء: لا يُطلب الإطار إلا عند اقتراب القارئ من الموضع (`IntersectionObserver` بهامش 400px)، أي
  أن أول رسم للصفحة لا يدفع ثمن أي إعلان.

كودان مع ذلك يعملان **داخل الصفحة نفسها** لأن طبيعتهما كذلك: الـ Social Bar والـ Popunder. وهذا
الجزء محمي بثلاث قواعد في `components/ads/AdScripts.tsx`: التحميل بعد `load` + idle، الحقن **مرة
واحدة** لكل مستند (يعمل جيدًا مع StrictMode والتنقل بين الصفحات)، و
`guardAgainstDocumentWriteWipe()` في `lib/ads.ts` الذي يحوّل أي `document.write()` بعد اكتمال
المستند إلى لصق آمن داخل `<body>` (مع إعادة إنشاء أي `<script>` ليعمل المحمّل إن وُجد) بدل أن يمحو
الموقع.

---

## 3) الأمان وسياسة المحتوى (CSP)

`lib/security-csp.ts` هو المصدر الوحيد للسياسة، ويستخدمه `next.config.ts` و`middleware.ts`:

- `script-src` و`connect-src` يضيفان نطاقات الشبكة فقط:
  `https://highrevenueformat.com` و`https://*.highrevenueformat.com` و
  `https://profitableratecpmnetwork.com` و`https://*.profitableratecpmnetwork.com` (ما زال
  مطلوبًا للبار الاجتماعي) و`https://furydonkeypharmacy.com` و`https://*.furydonkeypharmacy.com`
  (مضيف Anti-Adblock: سكربت الـ Popunder ووجهة الـ Smartlink — بدونه تحجب الـ CSP السكربت الجديد).
- `frame-src 'self' https:` يسمح بإطار البانر وبإطارات مشغّلات البث القائمة على حالها.
- **صفحات الزوار تبقى `frame-ancestors 'none'` + `X-Frame-Options: DENY`** كما كانت.
- المسار الوحيد المسموح بتضمينه من الموقع نفسه هو `/ad-frame`، ويستبدل فيه الزوجان بـ
  `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN` (قاعدة في `next.config.ts` بعد القاعدة
  العامة + نفس الترويسات من شاشة المسار نفسه). المسار أيضًا `no-store` و`X-Robots-Tag: noindex`،
  والأثر `/ad-frame` مضاف إلى `Disallow` في `app/robots.ts`.
- الإطار نفسه يُحمَّل بـ `sandbox` يسمح بالسكربتات والنوافذ المنبثقة، و**يمنع** `allow-top-navigation`
  → لا يمكن لأي وسوم إعلانية أن تنقل تبويب الزائر.
- عند تعطيل الإعلانات (`NEXT_PUBLIC_ADS_ENABLED=0`) تُحذف نطاقات الشبكة من السياسة تلقائيًا، أي أن
  بناءً بلا إعلانات يخرج بسياسة بلا نطاقات إعلانية.

---

## 4) مفاتيح التحكم (متغيّرات بيئة عامة)

كلها `NEXT_PUBLIC_*` لأن المتصفح هو من يحمّلها، لذلك **تُدمج وقت البناء: بعد أي تغيير أعد البناء
(`npm run build`)**.

| المتغيّر | الافتراضي | الأثر |
| --- | --- | --- |
| `NEXT_PUBLIC_ADS_ENABLED` | `1` | المفتاح الرئيسي: يُخفي كل الإعلانات ويقلّص CSP |
| `NEXT_PUBLIC_ADS_SOCIAL_BAR` | `1` | البار الاجتماعي |
| `NEXT_PUBLIC_ADS_POPUNDER` | `1` | البوبأندر |
| `NEXT_PUBLIC_ADS_SMARTLINK` | `1` | الربط الذكي على أزرار المشاهدة |
| `NEXT_PUBLIC_ADS_SMARTLINK_PER_SESSION` | `1` | عدد مرات فتح الرابط الذكي في الجلسة الواحدة (`0` = إيقاف) |

سلوك مقصود: **لا يُلغى الضغط الأصلي للقارئ أبدًا** — معالج النقرة لا يستدعي `preventDefault`، فيُفتح
رابط البث كما هو، ويُفتح الرابط الذكي في تبويب آخر مرة واحدة في الجلسة. وتُترك التفاعلات عبر لوحة
المفاتيح (`Enter`/`Space`) بلا إعلان، ولا تعمل الإعلانات إطلاقًا في `/admin` و`/api`.

---

## 5) كيف تتحقق من أنها تعمل؟

1. `npm run ads:test` — يثبّت: نص الأكواد كما أرسلتها، وجود `atOptions` مرة واحدة في مستند البانر
   وقبل `invoke.js`، ترتيب «بانر → بث → بانر» في صفحة المباراة، سياسة CSP (وتقلّصها عند الإيقاف)،
   ترويسات `/ad-frame`، حدود الـ Smartlink، وحراسات الحقن.
2. `npm run check` — السلسلة الكاملة (نوعيات، اختبارات SEO والروابط، lint…).
3. بعد `npm run build && npm run start`:
   - `curl -sI https://<host>/matches/<أي-مباراة> | grep -i content-security-policy` → يجب أن تظهر
     نطاقات الشبكة و`frame-ancestors 'none'`.
   - `curl -sI https://<host>/ad-frame` → `frame-ancestors 'self'`، `X-Frame-Options: SAMEORIGIN`،
     `Cache-Control: no-store`.
   - `curl -s https://<host>/ad-frame | head` → وسما `atOptions` و`invoke.js` بالمفتاح الصحيح.
4. افتح صفحة مباراة في المتصفح: يظهر «إعلان» ثم مربّع 300×250 فوق قسم البث وتحته. وحدة التحقق
   النهائية للأرقام (الانطباعات، الظهور، الأرباح، حالة رفض الوحدات) هي **لوحة Adsterra**، وليست
   الـ HTML.

---

## 6) ما تم التحقق منه فعليًا (2026-10-14)

- `next build` ينجح، ثم `next start` + `curl`:
  - `GET /ad-frame` → `HTTP 200`، `Content-Security-Policy: … frame-ancestors 'self'`،
    `X-Frame-Options: SAMEORIGIN`، `X-Robots-Tag: noindex, nofollow`، `Cache-Control: no-store`،
    والجسم هو نص الكود بالمفتاح الصحيح: `atOptions = {"key":"d7e3e208…","format":"iframe",
    "height":250,"width":300,"params":{}}` ثم `invoke.js`.
  - `/` و`/matches/*` → ما زالتا `frame-ancestors 'none'` + `X-Frame-Options: DENY`، مع ظهور
    نطاقَي الشبكة في `script-src`/`connect-src` فقط.
  - `/robots.txt` → `Disallow: /ad-frame`.
- صفحة مباراة مُصيَّرة فعليًا: الترتيب في HTML هو
  `data-ad-slot="match-above-stream"` ← `id="live-stream"` ← `data-ad-slot="match-below-stream"`،
  مع مربّع محجوز `300×250` ووسمي «إعلان» — و**لا يوجد** أي `atOptions`/`invoke.js` في صفحة الزائر
  نفسها (الكود كله داخل الإطار).
- `npm run ads:test` (10 اختبارات) و`npm run check` بالكامل.

## 7) ملفات محميّة ببصمة SHA-256

`scripts/sports-sync-safety-baseline.json` يثبّت بصمة ملفات البث/المشغّل/المصادر/التهيئة حتى لا
يعيد أي عمل لاحق كتابتها بصمت. هذا التكامل **لمس ثلاثة منها بقصد ولسبب موثّق**، وأُعيد تثبيت
بصماتها في نفس الالتزام:

| الملف | سبب اللمس |
| --- | --- |
| `next.config.ts` | قاعدة ترويسات `/ad-frame` (الاستثناء الوحيد على `frame-ancestors 'none'`) |
| `app/matches/[slug]/page.tsx` | موضعا البانر 300×250 فوق قسم البث وتحته |
| `components/match/MatchStreamPlayer.tsx` | `onClick` للرابط الذكي على رابطي البث الخارجيين |

أي ملف آخر في تلك القائمة (lib/match-streams.ts، lib/stream-policy.ts، lib/broadcasts.ts،
lib/admin-auth.ts …) **باقٍ بايت-ببايت كما هو** — وهذا ما يؤكده `npm run sports-sync:test`.

## 8) ملاحظات تشغيلية

- **مانع الإعلانات:** إن حجب المتصفح أو الشبكة سكربت Adsterra، يبقى مربّع 300×250 بمظهر محايد — لا
  تتغيّر الصفحة ولا تظهر فراغات.
- **صفحة `/admin/ads`:** صارت تعرض جدول «المُوزَّع فعليًا في الكود» المقروء من `lib/ads.ts` مع تحذير
  صريح بأن التحقق من الانطباعات والأرباح يتم من لوحة الشبكة لا من الموقع.
- **إضافة وحدة أخرى لاحقًا:** تُضاف في `lib/ads.ts` فقط (مفتاح + مقاس)، ثم موضع جديد في
  `BannerSlot` إذا كان بانرًا. لا تنسخ المفتاح في مكوّن آخر.
- **ads.txt:** لا تحتاجه شبكة Adsterra لهذه الصيغ، ولم يُضَف عنصر وهمي.
