# NEMO Sports · تجهيز قاعدة البيانات والكاش (Postgres + Redis)

> **لماذا هذه أهم خطوة؟** بدون `DATABASE_URL` يعمل الموقع على «ذاكرة داخل العملية»:
> أي بث تضيفه من `/admin/broadcast`، وأي خبر يُجمَع، وأي كيان كنسي — **يُفقد عند أول
> إعادة تشغيل**، وعلى Vercel كل نسخة serverless ترى بيانات مختلفة عن الأخرى.
> الكود جاهز بالكامل (`lib/db/pg.ts` + ‏`db/schema.sql` + ‏`db/seed.sql`) — هذه مهمة
> **تشغيل** لا مهمة **بناء**، وتكلفتها صفر على الخطط المجانية أدناه.

---

## 0. الصورة الكاملة (5 دقائق قراءة)

| المكوّن | الدور | بدونه | المزوّد المجاني المقترح |
|---|---|---|---|
| **Postgres** (`DATABASE_URL`) | المخزن الكنسي الدائم: الفرق، المباريات، `broadcasts`، ‏`match_streams`، الأخبار، الأولويات، سجل التدقيق | ذاكرة مؤقتة تُفقد عند إعادة التشغيل | **Neon** (خطة مجانية سخية، pooler مدمج) أو **Supabase** |
| **Redis** (`REDIS_URL`) | طبقات الكاش الخمس + ميزانية الـ rate-limit مشتركة بين النسخ | LRU داخل كل نسخة (مقبول لنسخة واحدة) | **Upstash** (يتكامل مع Vercel بزر واحد) |

> **ملاحظة serverless حاسمة:** استخدم دائمًا **رابط الـ pooler** (المجمَّع) وليس
> الرابط المباشر — دوال Vercel تفتح اتصالات قصيرة كثيرة قد تُغرق القاعدة.
> سكربت التحقق ينبّهك إن استخدمت الرابط المباشر.

---

## 1. تجهيز Postgres على Neon (مجانًا)

1. أنشئ حسابًا على [neon.tech](https://neon.tech) ثم **New Project**:
   - الاسم: `nemo-sports` · المنطقة: الأقرب لجمهورك (مثلًا `eu-central-1`) ·
     إصدار Postgres: الأحدث (15+).
2. من لوحة المشروع → **Connect** → انسخ **رابط الـ pooler** (يُميَّزه `‎-pooler.‎`
   في اسم المضيف)، وتأكد أنه ينتهي بـ `?sslmode=require`.
3. (اختياري لكن يُنصح به) أنشئ قاعدة منفصلة للمعاينة: **Branches** ← فرع
   `preview` — هكذا لا تلوّث بيانات الإنتاج أثناء التجربة.

### 1-ب. البديل: Supabase

1. مشروع جديد على [supabase.com](https://supabase.com) ثم **Project Settings →
   Database → Connection string → Transaction pooler** (المنفذ `6543`).
2. انسخ الرابط مع `?sslmode=require` (أو `&sslmode=require` حسب الموجود).

---

## 2. تجهيز Redis على Upstash (مجانًا)

1. من [console.upstash.com](https://console.upstash.com): **Create Database** ←
   اختر **Regional** في نفس منطقة مشروع Vercel، وفعّل **TLS/SSL**.
2. انسخ `UPSTASH_REDIS_REST_URL`؟ **لا** — انسخ رابط **`rediss://`** (لاحظ الحرف
   `s` الزائد = TLS) من تبويب **Connect → Redis → Connect with Redis client**.
   هذا هو ما يوضع في `REDIS_URL`.
3. الطريقة الأسرع: من مشروعك في Vercel ← **Storage → Create → Upstash Redis**
   — تُحقن المتغيرات تلقائيًا، انسخ قيمة `REDIS_URL`/`KV_URL` منها.

---

## 3. حقن المتغيرات في Vercel

من مشروع Vercel ← **Settings → Environment Variables** أضف:

| المتغير | القيمة | البيئات |
|---|---|---|
| `DATABASE_URL` | رابط الـ pooler الكامل (مع `sslmode=require`) | Production + Preview (+ Development إن أردت) |
| `PG_POOL_MAX` | `5` | الكل |
| `REDIS_URL` | رابط `rediss://…` | الكل |
| `REDIS_KEY_PREFIX` | `nemo:prod:` للإنتاج و`nemo:prev:` للمعاينة | حسب البيئة |

> لا تضع أيًا من هذه القيم في `NEXT_PUBLIC_*` ولا في أي ملف داخل الـ Repo —
> `.env.local` المحلي فقط (وهو مُتجاهَل من Git).

---

## 4. تطبيق الـ Schema والـ Seed (مرة واحدة لكل قاعدة)

الترتيب الصحيح (مُغلَّف في أمر واحد):

```bash
# لا يحتاج psql. آمن لإعادة التشغيل (يتخطى schema.sql إن كانت الجداول موجودة):
DATABASE_URL='رابط-الـpooler' npm run db:setup
```

هذا ينفّذ بالترتيب: `db/schema.sql` (الجداول الكنسية الـ 20) ← `db/seed.sql`
(الرياضات + سلاسل الأولويات + حدود المعدل + قواعد الصراعات) ←
`db/migration-0002-news.sql` (جداول الأخبار + `broadcasts`).

**بدون Node؟** الصق محتويات الملفات الثلاثة بنفس الترتيب في **Neon SQL
Editor** (أو Supabase SQL Editor) ونفّذها.

> جدولا `broadcasts` و`match_streams` يُنشآن **تلقائيًا عند أول إقلاع** للتطبيق
> (DDL مدمج في `lib/broadcasts.ts` و`lib/match-streams.ts`) — فإن نسيت
> الـ migration سيتكفّل التطبيق بإنشائهما، لكن نفّذ الـ migration على أي حال
> لجداول الأخبار.

---

## 5. التحقق قبل النشر (إلزامي)

```bash
# يقرأ من البيئة، أو من .env.local تلقائيًا إن وُجد:
DATABASE_URL='...' REDIS_URL='...' npm run db:verify
```

يفحص السكربت (`scripts/verify-db.ts`):

- وجود المتغيرات (دون طباعة قيمها أبدًا) + رابط pooler + ‏`sslmode`
- الاتصال وإصدار الخادم وحالة SSL
- الجداول الـ 20 + جداول الأخبار + جداول البث
- صفوف الـ seed (رياضات، أولويات، حدود، قواعد، صحة)
- **كتابة تجريبية بلا أثر** (جدول مؤقت داخل transaction يُلفَّظ تلقائيًا)
- نبضة Redis + دورة `set/get/del` عبر نفس `RedisKvStore` الذي يستخدمه الـ SDL

النتيجة المتوقعة عند النجاح:

```
canonical store : postgres (durable ✓)
cache           : redis (shared ✓)
result          : OK
```

كود الخروج `0` = جاهز، و`2` = غير مجهَّز/به خطأ (يطبع السكربت الخطوة التالية).

---

## 6. النشر والتأكد على الإنتاج

1. **Redeploy** من Vercel (Deployments ← آخر نشر ← **⋯ → Redeploy**) — متغيرات
   البيئة لا تسري إلا على نشر جديد.
2. افتح (بعد تسجيل دخول الإدارة) `https://<دومينك>/api/v1/system` وتأكد:
   - `infrastructure.canonical` = ‏`"postgres"` (لا `"memory"`)
   - `infrastructure.cache` = ‏`"redis"` (لا `"memory"`)
3. افتح `/admin/providers` — يجب أن ترى المزوّدين وسلاسل الأولويات والتكلفة.
4. **اختبار البقاء:** أضف بثًا تجريبيًا من `/admin/broadcast` ← أعد النشر ←
   تأكد أن البث ما زال موجودًا. هذا هو الدليل القاطع أن البيانات دائمة.

---

## 7. استكشاف الأخطاء الشائعة

| العَرَض | السبب الغالب | الحل |
|---|---|---|
| `self-signed certificate` / ‏`SSL off` | رابط بلا `sslmode=require` | أضفه لنهاية `DATABASE_URL` |
| `too many clients` / ‏`max connections` | رابط مباشر بدل الـ pooler، أو `PG_POOL_MAX` كبير | استخدم رابط الـ pooler + ‏`PG_POOL_MAX=5` |
| `relation "matches" does not exist` | نُسي `db:setup` | نفّذ القسم 4 على نفس القاعدة التي يشير لها الرابط |
| `/api/v1/system` ما زال `memory` | النشر أقدم من إضافة المتغيرات | Redeploy (القسم 6) |
| Redis ‏`WRONGPASS` / ‏`NOAUTH` | نُسخ رابط REST بدل `rediss://` | انسخ رابط عميل Redis (القسم 2) |
| البيانات تختفي بين زيارتين | قاعدة `preview` تُستخدم للإنتاج أو العكس | راجع متغيرات كل بيئة في Vercel |

---

## 8. التشغيل اليومي

- **نسخ احتياطي:** Neon يأخذ لقطات تلقائيًا (Point-in-time على المشاريع
  المدفوعة؛ المWeekly backups على المجانية) — للأخبار والمحتوى الحرج صدّر
  `pg_dump` أسبوعيًا عبر cron محلي.
- **تدوير الأسرار:** غيّر كلمة مرور القاعدة من لوحة المزوّد ← حدّث `DATABASE_URL`
  في Vercel ← Redeploy. (تدوير `ADMIN_SESSION_SECRET` يُبطل جلسات الإدارة.)
- **مراقبة:** `/api/v1/system` (محمي بجلسة الإدارة) + `/admin/providers` يعرضان
  الصحة والتكلفة والصراعات حيًّا — راجعهما بعد أي تغيير في المزوّدين.
