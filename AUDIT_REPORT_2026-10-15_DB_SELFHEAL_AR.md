# تقرير إصلاح — 2026-10-15 · `relation "sports" does not exist` على `/api/cron/update-matches`

الفرع: `arena/001819f1-sport` (من `main` @ `fc2d82d`). جذر التطبيق `nemo-sports/`.

---

## 1) العَرَض والسبب الجذري

بعد حل مشكلة الـAuthorization، صار المسار المفتوح `GET /api/cron/update-matches`
يصل إلى الكود الحقيقي، فوصل إلى القاعدة وفشل:

```
error: relation "sports" does not exist      →  500 Internal Server Error
```

| # | السبب | الدليل من الكود قبل الإصلاح |
|---|---|---|
| 1 | `DATABASE_URL` **مضبوط لكن القاعدة غير مُهيّأة**: لا `db:setup`، أو فرع Neon/Supabase جديد، أو تفريغ ناقص. الجداول الكنسية الـ29 غير موجودة بينما الكود يفترض وجودها | `db/schema.sql` يُطبَّق يدويًا عبر `npm run db:setup` فقط؛ لا يوجد أي إنشاء تلقائي للجداول الكنسية في وقت التشغيل |
| 2 | أول كتابة في المهمة كانت **خارج أي `try/catch`**: كتلة تسجيل البطولات في `runJob` تستدعي `ensureSport` مباشرة | `lib/pipeline/runner.ts` — `const sportId = await ensureSport(db, "football");` لم تكن داخل حماية |
| 3 | الاستثناء صعد إلى المسار، والمسار كان يرد `500` | `app/api/cron/update-matches/route.ts` (catch → 500) |
| 4 | عقود الرد كانت تحمل `500`/`207` لحالات **اكتمل فيها التشغيل فعلًا** (لا مصدر عُمل / تحديث جزئي) | `lib/matches-update.ts` — `nothingRan → http: 500`, `partial → http: 207` |

> ملاحظة تشخيصية: جدولا `broadcasts` و`match_streams` (وجداول الأخبار) كانا
> يُنشآن تلقائيًا عند أول إقلاع، بينما **الجداول الكنسية لا** — وهذا بالضبط سبب
> ظهور الخطأ على هذا الجدول تحديدًا.

---

## 2) ما نُفِّذ (ثلاث طبقات، كلها إضافية)

### 2.1 معالجة ذاتية للـschema — `lib/db/canonical-schema.ts` **(جديد)**

- **فحص واحد رخيص** (`to_regclass`) للجداول الـ29 الأساسية لكل عملية.
- كلها موجودة ⇒ **لا يُرسل أي DDL** (قاعدة سليمة تدفع استعلامًا واحدًا لكل عملية).
- ناقص ⇒ إنشاء الناقص فقط بـ`CREATE TABLE IF NOT EXISTS` — **إضافة فقط**: لا
  حذف، لا تعديل صفوف، ولا لمس جدول موجود. الترتيب: كنسي ← pipeline ← read-model.
- **لا يرمي استثناءً أبدًا**: كل فشل يُجمع ويُنقّى ويُعاد في نتيجة (`ok` · `ran` ·
  `created` · `missing` · `failures` · `cached`).
- مُذاكرة (memoised) لكل عملية؛ فشل واحد يُعاد اختباره بعد **دقيقة**، لا في كل طلب.
- `NEMO_DB_AUTO_MIGRATE=0` يوقف الإنشاء التلقائي (لِمن يريد `db:setup` وحده).

النصوص المنفَّذة هي **نفسها** نصوص `db/schema.sql` و`db/migration-0006` و
`db/migration-0007`، واختبار آلي يفشل إن انحرف أحدها (مقارنة نصية بملفات SQL).

### 2.2 ربط المعالجة بنقاط القراءة/الكتابة

| الملف | التغيير |
|---|---|
| `lib/db/pg.ts` | `getReadyDb()` جديدة (تُجهّز الـschema ثم تُعيد المشغّل)، و`getCanonicalStore()` صارت تمرّ عبرها ⇒ **كل قراءة/كتابة كنسية** عبر الـSDL تُشفى قبل أن تُنفَّذ. `getDb()` بقيت كما هي للمخازن التي تُنشئ جداولها بنفسها |
| `lib/pipeline/runner.ts` | `runJob` يستدعي `ensureCanonicalSchema` **قبل أي لمس لجدول**، ويسجّل `schema_bootstrapped` مرة واحدة فقط (لا يُكرَّر مع النتيجة المُذاكرة) |
| `lib/pipeline/runner.ts` | كتلة تسجيل البطولات (السبب المباشر للـ500) صارت داخل `try/catch`: تُسجّل الخطأ في `run.errors` وتُكمل لأرشفة ما جُلب |
| `lib/pipeline/runner.ts` | كتابة سجلات المصدر صارت داخل `try/catch`: قاعدة ترفض الكتابة ⇒ `created/updated = 0` مع السبب في `run.notes` و`run.errors` بدل استثناء يُسقط التشغيل |
| `lib/pipeline/upsert.ts` | `ensureSport` · `ensureCountry` · `upsertCompetition` تلفّ فشل الجدول برسالة تحمل **السبب والعلاج** (`canonicalSchemaError`) بدل رسالة المشغّل الخام |
| `lib/sdl-gateway.ts` | `infrastructure.schema` في `/api/v1/system` و`/admin/providers`: `ok` · `ran` · `created` · `missing` · `failures` — الفرق بين «متّصل» و«صالح للاستخدام» |

### 2.3 المسار يرد `200 OK` دائمًا (مع جسم صادق)

- `lib/matches-update.ts`: **كل** فروع العقد صارت `http: 200` (`success` /
  `partial` / `error`)، والحكم يبقى في `ok` و`status` — كان `500` هنا يعني
  «انهيار» بينما الحقيقة «اكتمل التشغيل ولم يُحدَّث شيء»، وهو ما جعل المراقبة
  صاخبة على حدث غير حادث.
- `failureOutcome(cause)` **(جديدة)**: الرد عند استثناء غير متوقع BEFORE أن
  يُبلّغ التشغيل — `200` مع `ok:false` و`error` **مُنقّى** (لا سلسلة اتصال، لا
  كلمة مرور)، و`run: null`.
- `app/api/cron/update-matches/route.ts`: يستخدم `failureOutcome` في الـcatch،
  ويسجّل الأثر الكامل في السجل الخادمي فقط.

---

## 3) التحقق (كله منفَّذ فعليًا)

### 3.1 اختبار جديد على **قاعدة PostgreSQL حقيقية داخل العملية** (PGlite)

`npm run db:selfheal:test` — 9 اختبارات، كلها خضراء:

1. قاعدة فارغة ⇒ بعد نداء واحد: `sports` وكل الجداول الكنسية موجودة،
   `missing=[]`, `failures=[]`, `created ≥ 20`.
2. النداء الثاني ⇒ `ran:false` («already complete») و**لا DDL إطلاقًا**؛ والنتيجة
   المُذاكرة تُعاد دون لمس القاعدة.
3. `NEMO_DB_AUTO_MIGRATE=0` ⇒ لا إنشاء، والسبب في `reason`.
4. بعد المعالجة: الكتابة الفعلية بدوال الـpipeline تنجح — sport ← country ←
   competition ← season ← team ×2 ← match ← `source_id_map`، ثم إعادة تشغيل نفس
   المباراة **idempotent** (نفس المعرّف، صف واحد).
5. قاعدة ترفض DDL ⇒ النتيجة `ok:false` مع أسماء ما بقي ناقصًا، **بلا استثناء**.
6. تنقية الرسائل: لا كلمة مرور في أي جسم أو سجل.
7. كل فروع عقد الرد = `200`.
8. الاستثناء غير المتوقع = `200` و`error` مُنقّى.
9. **عدم الانحراف**: DDL الكود = حرفيًا DDL ملفات `db/schema.sql` +
   `migration-0006` + `migration-0007` (أكثر من 60 عبارة مقارَنة نصًا).

### 3.2 اختبار نهاية-لنهاية على خادم إنتاج حقيقي وقاعدة **فارغة تمامًا**

شُغِّل Postgres حقيقي بالمحاكي السلكي (PGlite wire) وبعدها خادم `next start`
مع `DATABASE_URL` يشير إليه. النتيجة قبل/بعد:

```
public tables before: 0
GET /api/cron/update-matches → HTTP 200
public tables after: 30 (29 جدولًا + view pipeline_job_due)
sports: [{"slug":"football","name_ar":"كرة القدم","name_en":"Football"}]
competitions: egyptian-premier-league, egypt-cup, egyptian-super-cup
updated_at triggers: 8
```

ثم إعادة الطلب مرتين ⇒ `200` مرة أخرى، **صفر DDL جديد**، وصفر سطور سجل مكرَّرة.

### 3.3 الانحدار العام

`npm run check` (typecheck · ‏31 حزمة اختبار · eslint) ⇒ **exit 0**.
`npm run build` (Next.js production) ⇒ **Compiled successfully**،
و`npm run smoke`-المسار يعمل (اختُبر يدويًا: `/` = 200، المسار = 200).

---

## 4) السلوك النهائي للمسار

| الحالة | رمز الحالة | الجسم |
|---|---|---|
| مصادر عملت ونُشرت | `200` | `{ ok:true, status:"success", run }` |
| قاعدة كانت ناقصة فشُفيت ثم عملت | `200` | نفس أعلاه + `pipeline.schema_bootstrapped` في السجل |
| لا مصدر عُمل (بلا مفاتيح/معطّل) | `200` | `{ ok:false, status:"error", message:"… no source was called", run.sources[].reason }` |
| تحديث جزئي | `200` | `{ ok:false, status:"partial", run.errors[] }` |
| القاعدة ترفض الـDDL (صلاحيات) | `200` | `{ ok:false, status:"partial", run.errors:["canonical table «sports» unavailable — … Remedy: npm run db:setup…"] }` |
| استثناء غير متوقع | `200` | `{ ok:false, status:"error", error:"<مُنقّى>", run:null }` |

**لا يوجد مسار يرد `500` من هذا المسار بعد الآن**، ولا رسالة قاعدة خام تصل إلى
متصفح، ولا بيانات اعتماد في أي جسم أو سجل.

---

## 5) للتشغيل على الإنتاج (لا خطوة إلزامية)

- **لا شيء مطلوب**: أول طلب يلمس القاعدة يُنشئ الناقص تلقائيًا. ومع ذلك
  `npm run db:setup` يبقى مستحسنًا (جداول الأخبار + الفهارس + البيانات الأولية).
- للتأكد: `/api/v1/system` ← `infrastructure.schema.ok = true` و`missing = []`.
- للإيقاف: `NEMO_DB_AUTO_MIGRATE=0` (حينها يُبلَّغ الناقص في جسم الرد بدل إنشائه).
- صلاحيات: دور التطبيق يحتاج `CREATE` على الـschema. بلا هذه الصلاحية يظل
  السلوك صحيحًا (200 + سبب صريح) لكن دون شفاء.

---

## 6) ما لم يُفعل (بصراحة)

- **لا تغيير لشكل جدول قائم** أقدم من الـschema، ولا إنشاء فهارس على جدول كان
  موجودًا مسبقًا (الفحص على مستوى الجدول). تغييرات الشكل تبقى عبر `db:setup`.
- **الأتمتة غير محدودة نطاقًا**: الرسائل المرسلة إلى `/api/cron/update-matches`
  تُشغّل المهمة كاملة (سلوك مقصود ومُوثَّق سابقًا) — أي أن أرشفة القاعدة ملف
  جديد ستُشفى من أول زيارة.
