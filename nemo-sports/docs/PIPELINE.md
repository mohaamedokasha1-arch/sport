# خط البيانات (Data Pipeline) — جلب وتحديث بيانات كرة القدم تلقائيًا

> المرجع التنفيذي لنظام الجلب والتحديث المستمر، وأساسه **الدوري المصري الممتاز** وكل المنافسات
> المحلية المرتبطة به. يشرح هذا الملف ما تم بناؤه، وكيف يُشغَّل، وما يجب حسمه قبل الإقفال.
>
> كل URLs المصادر موجودة في مكان واحد فقط: `config/pipeline/endpoints.yml`. لا يوجد أي رابط
> مكتوب داخل الكود، وأي تعديل على مصدر يبدأ من ذلك الملف وينتهي بتشغيل `npm run pipeline:doctor`.

---

## 0. حالة التسليم الآن

| المطلوب في التكليف | الحالة | الملف |
|---|---|---|
| (A) تصميم معماري ومكوّنات وتدفّق بيانات | ✅ | هذا الملف §2 + `lib/pipeline/` |
| (B) قاعدة البيانات (normalized + raw + runs + state + id-map) | ✅ | `db/migration-0006-pipeline.sql` |
| (C) خطة المزامنة والجدولة وETag/backoff | ✅ | `config/pipeline/endpoints.yml` (jobs) + `lib/pipeline/http.ts` |
| (D) هيكل كود + Cron/مجدول + Docker | ✅ | `lib/pipeline/*`, `scripts/pipeline.ts`, `Dockerfile`, `docker-compose.yml` |
| (E) كود لكل مصدر (Football-Data.org · TheSportsDB · EPL/EFA/FIFA) | ✅ | `lib/pipeline/connectors.ts` + `lib/pipeline/normalizers/*` |
| Idempotency · Observability · Security · Performance · Extensibility | ✅ | `lib/pipeline/upsert.ts` · `state.ts` · `sourceGate()` · الكاش والأرشفة |
| لوحة مراقبة للمشغّل | ✅ | `/admin/pipeline` + `/api/v1/pipeline/status` |
| اختبارات تعمل بلا شبكة ولا قاعدة بيانات | ✅ | `scripts/verify-pipeline.test.ts` (٣٥ اختبارًا) |
| تشغيل حقيقي مُثبت على قاعدة بيانات وأرشيف خام | ✅ | §12 — نتائج آخر تشغيل كامل |

**ما لم يُنفَّذ بعد (بقصد، وموضّح في §10):** ربط نقاط النهاية الحقيقية لـ EPL/EFA/FIFA (معلّقة على
تأكيد التوثيق والترخيص)، واستيعاب الهدافين/اللاعبين، وتشغيل مزامنة داخل اليوم على Vercel Hobby.

---

## 1. المصادر وأولويتها (§1 و§6 من التكليف)

الترتيب أدناه هو ترتيب حسم التعارضات في النظام، ومصدره `priority:` في ملف الإعداد:

| # | المصدر | النمط | الحالة الافتراضية | لماذا |
|---|---|---|---|---|
| 1 | رابطة الأندية المصرية المحترفة `egyptianproleague` | صفحات (scrape) | **مغلق** | يحتاج تأكيد ترخيص كتابةً (`scraping_licensed` + `PIPELINE_SCRAPING_LICENSED=1`) |
| 2 | الاتحاد المصري `efa` | صفحات (scrape) | **مغلق** | نفس الشرط |
| 3 | FIFA `fifa` | صفحات (scrape) | **مغلق** | نفس الشرط |
| 4 | Football-Data.org `football_data` | API | مفتوح عند وجود المفتاح | `X-Auth-Token` من `FOOTBALL_DATA_API_KEY` |
| 5 | TheSportsDB `thesportsdb` | API | مفتوح عند وجود المفتاح | `X-API-KEY` من `THESPORTSDB_API_KEY` |

**لا يُقبل أي مصدر آخر** بدون موافقة صريحة: مصدر جديد = مدخل في `sources:` + (عند الحاجة)
normalizer + سطر في `priority:`.

---

## 2. (A) المعمارية

### 2.1 المكوّنات

```
config/pipeline/endpoints.yml   ← السجل الوحيد للمصادر: URLs · نقاط النهاية · المفاتيح (بأسمائها) · الحدود · الجدولة
        │
        ▼
lib/pipeline/config.ts          ← تحميل + تحقق صارم؛ يفشل مغلقًا (fail closed) عند أي خلل
        │
        ├── lib/pipeline/connectors.ts    ← «ماذا نطلب من أي مصدر لأي مهمة» (خطة الجلب)
        ├── lib/pipeline/http.ts          ← التنفيذ: timeout · retry/backoff · ETag/If-Modified-Since · robots · حدود المحليّة
        │        ├── lib/pipeline/robots.ts      ← قرار robots.txt (Allow/Disallow/Crawl-delay)
        │        └── lib/pipeline/raw-store.ts   ← أرشيف كل استجابة كما وصلت
        ├── lib/pipeline/normalizers/*    ← raw → كيانات NEMO (football-data · thesportsdb · مواقع محلية)
        ├── lib/pipeline/priority.ts      ← من يفوز عند الاختلاف (حقلًا بحقل)
        ├── lib/pipeline/discrepancies.ts ← تسجيل الاختلاف في data_conflicts
        ├── lib/pipeline/upsert.ts        ← الكتابة المتكرّرة الآمنة (Idempotent) + خريطة المعرّفات
        ├── lib/pipeline/runner.ts        ← المنسّق: هل المهمة مستحقّة؟ ثم مصدرًا مصدرًا بالأولوية
        └── lib/pipeline/state.ts         ← سجل التشغيل (sync_runs) والحالة (sync_state)
        │
        ▼
PostgreSQL: competitions · seasons · teams · matches · standings   (normalized)
            + raw_payloads · sync_runs · sync_state · source_id_map · data_conflicts
```

### 2.2 مسار البيانات

```
المصدر → HTTP (retry/backoff/ETag/robots) → raw_payloads (كما وصل، مع hash)
       → normalizer (raw → كيانات canonical) → priority decision (حقل/صف)
       → upsert (idempotent) → المنظّم (competitions/seasons/teams/matches/standings)
       → sync_runs + sync_state (ماذا حدث ومتى يُعاد) → الواجهة/الإدارة تقرأ من القاعدة
```

### 2.3 فصل Raw عن Normalized

- **Raw**: `raw_payloads` — صف لكل عملية HTTP بما فيها الفاشلة و `304`، مع `status_code`,
  `etag`, `last_modified`, `payload_hash` (sha256 على الجسم الكامل), `payload_json` (JSON
  المُحلَّل), `payload_text` (HTML/نص، مقطوع عند 512 KiB مع بقاء الـ hash كاملًا), `run_id`, والمدة.
- **Normalized**: جداول الكيانات القياسية (`competitions` … `standings`) — لا يحتوي أي منها على
  شكل خاص بمصدر؛ ما يخصّ المصدر يُحفظ في `source_id_map.extra_json` أو `matches.extension`.
- **الأثر العملي**: عند نزاع بين مصدرين يمكن إعادة قراءة ما قاله كل مصدر حرفيًا في تلك اللحظة دون
  استهلاك حصة جديدة، ويمكن دائمًا تفسير سبب القيمة الظاهرة الآن.

### 2.4 سياسة الدمج بين المصادر (Source Priority)

- لكل صف/حقل **مالك** مُسجَّل: في المباريات داخل `matches.extension.pipeline.fields`، وفي جدول
  الترتيب عبر العمود `provider`.
- لا يُستبدل حقل إلا بمصدر **مساوٍ أو أعلى** أولوية. المصدر الأدنى لا يكتب، لكنه يُسجَّل.
- عند وجود قيمة غير مملوكة (أدخلها مشغّل أو مسار آخر) لا تُدهس بسهولة: تُسجَّل منازعة.
- الهدف أن يكون القرار **قابلًا للتفسير**: كل قيمة ظاهرة تعرف من كتبها ومتى ولماذا فازت.

### 2.5 الواجهات العامة (Public surface)

```ts
import { runJob, pipelineStatus, loadPipelineConfig } from "@/lib/pipeline";
const summary = await runJob("matches", { trigger: "cron" });
```

لا يستورد أي ملف خارج `lib/pipeline/` أو `scripts/` أداة اتصال بالمصادر. اختُبر هذا الحدّ
بنيويًا: الاتصال الوحيد بالشبكة داخل `http.ts` والـ SDL القائم.

---

## 3. (B) قاعدة البيانات

**الترحيل:** `db/migration-0006-pipeline.sql` — مُضاف إلى `scripts/db-setup.mjs` بعد 0005،
وهو idempotent (يمكن تشغيله مرارًا).

| الجدول | الغرض | ملاحظات |
|---|---|---|
| `sync_runs` | صف لكل تنفيذ مهمة لكل مصدر | `job, source, trigger, status, started/finished, duration_ms, attempt, stats jsonb, error, notes` |
| `sync_state` | حالة الكرسر والتحقق الشرطي | مفتاح `(source, job)` · `cursor, etag, last_modified, last_success_at, last_attempt_at, last_error, consecutive_failures, next_due_at` |
| `raw_payloads` | أرشيف خام غير قابل للتعديل | كما في §2.3 + فهارس للفشل و`run_id` |
| `source_id_map` | `source_id → internal_id` | المفتاح `(source, entity_type, source_id)` · `internal_id uuid` · `last_seen_at` · `extra_json` |
| `data_conflicts` (قائم) | سجل النزاعات | `severity, field, values jsonb, providers[], resolved…` — يُعاد استخدامه بدل جدول «discrepancies» ثانٍ |
| `provider_entity_map` (قائم) | خريطة طبقة SDL | يُكتب مع `source_id_map` في **نفس المعاملة** عبر `recordSourceMapping()` — لا يمكن أن يتفرّقا |

دوال مساعدة: `pipeline_close_stale_runs(30)` لإغلاق تشغيلات ماتت في منتصفها، و`pipeline_job_due`
لعرض «ما المستحقّ» بسرعة.

**الهوية (Identity):** البحث أولًا في `source_id_map` ثم `provider_entity_map`، ثم مفتاح طبيعي
(نفس البطولة + نفس الفريقين داخل ±36 ساعة)، وأخيرًا UUID حتمي (`canonicalId` نفسه المستخدم في
SDL) — لذلك إعادة تشغيل مهمة لا تُنشئ صفًا ثانيًا.

**التشغيل:**
```bash
DATABASE_URL='postgres://…' npm run db:setup     # يضيف الجداول الجديدة
```

---

## 4. (C) خطة التحديث (Sync Plan)

### 4.1 الجدولة (كما في `jobs:` بملف الإعداد)

| المهمة | الوضع العادي | أيام المباريات | ملاحظات |
|---|---|---|---|
| `matches` | كل ٤٥ دقيقة | **كل ٣ دقائق** (بحد أدنى دقيقتين) | «٢–٥ دقائق» في التكليف |
| `standings` | كل ١٢ ساعة | كل ٦٠ دقيقة (بحد أدنى ٣٠) | + تُعاد بعد آخر مباراة منتهية |
| `teams` | يوميًا | — | |
| `competitions` | أسبوعيًا | — | ومعها تقليم الأرشيف الخام |
| `players` | أسبوعيًا | — | الطور الثاني |
| `bootstrap` | أسبوعيًا / أول تشغيل | — | بطولات + مواسم + جدول + مباريات |

«أيام المباريات» تُحسب آليًا: وجود مباراة مباشرة أو تنطلق خلال ٣ ساعات
(`isMatchday()`). مهمة لم يحن وقتها تُعاد بـ `skipped: too soon` دون لمس أي مصدر.

### 4.2 كيف تُشغَّل الجدولة فعليًا

| البيئة | الطريقة | التكرار |
|---|---|---|
| Vercel (Hobby) | `vercel.json` → `/api/cron/pipeline/{matches,standings,competitions}` | يومي/أسبوعي (قيود الخطة) |
| Vercel (Pro) | أضف `*/2 * * * *` لمهمة `matches` و`0 */6 * * *` للترتيب | كل دقيقتين خلال اليوم |
| أي سيرفر/حاوية | `npm run pipeline:loop` (مجدول داخلي يقرأ الجدولة من الإعداد) | كل ٦٠ ثانية يبحث عن المستحق |
| cron نظام | `npm run pipeline:tick` كل دقيقة | يشغّل ما استحقّ فقط |
| DNS/VPS آخر | `curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/pipeline/matches` | ما يناسبك |
| أي مجدول يتحدث GET واحدًا فقط | `curl https://…/api/cron/update-matches` | مسار مفتوح بلا رمز — يشغّل مهمة `matches` فورًا (force) لكل زائر ويعيد `200` مع تفاصيل التشغيل في الجسم |

> الأهم: **التكرار الزائد لا يكلف شيئًا** — المنسّق يرفض ما لم يستحقّ قبل أي اتصال بالمصدر.

> `GET /api/cron/update-matches` مسار **مفتوح بلا أي تحقق من الرمز** (لا `CRON_SECRET`
> ولا `Bearer` ولا `?token=`): يشغّل مهمة `matches` الحقيقية فورًا (**force**، بلا
> انتظار الجدولة) لكل زائر، ويعيد `200 OK` بعد انتهاء التشغيل مع تفاصيله الصادقة
> في الجسم (`ok` / `status` / `run`) — يشرح `run.sources[].reason` متى تعذّر على
> مصدر أن يعمل، ولا يدّعي نجاحًا وهميًا. الجدولة المبرممة والحراسة تبقى على
> `/api/cron/pipeline/matches` مع الرمز — فهناك اللقطة والتشغيل الجاف والمعاملات
> الكاملة.

### 4.3 ETag / If-Modified-Since

يُحفظ `etag` و`last_modified` داخل `cursor` في `sync_state` **لكل نقطة نهاية** (`cursor.etags.<endpoint>`)،
وتُقرأ **عبر كل مهام المصدر** لا من مهمة واحدة فقط — لأن المُتحقِّق (validator) صفةٌ للرابط، لا للمهمة:
`/competitions/{code}/standings` نفسه يجلبه كلٌّ من `standings` و`bootstrap`، وقفل القراءة على مهمة
واحدة كان يعني أن كل مهمة تُعيد تنزيل ما لدى أختها.

قاعدتان مُثبتتان بالتجربة (§12):

- **لا يُرسل إلا مُتحقِّق نقطة النهاية نفسها.** الأعمدة العامة `etag`/`last_modified` تبقى للتوافق
  مع المهام أحادية النقطة، لكن قراءتها لنقطة أخرى تعني سؤال المزوّد «هل تغيّر هذا الرابط؟» بوسم
  رابط آخر — وهو ما كان يُفقد البيانات صامتًا (٣٠٤ كاذبة ⇒ `fetched=0` ⇒ لا كتابة).
- **`304` ليست فشلًا.** تُؤرشف كصف خام (`not_modified = true`)، تُحتسب في `stats.not_modified`،
  وتُعطي حالة `ok` للمصدر. «لم يتغيّر شيء» نتيجة ناجحة، لا حادثة.

أما `429/5xx` فتُعاد، ورفض `robots.txt` أو نفاد الحصة المحلية يُحتسب **تخطيًا مع تحذير** لا فشلًا:
النظام هنا يطيع قواعده، وهذه ليست علّة تُبلَّغ كخطأ.

### 4.4 Retry + Backoff

- الحالات المُعادة: `429`, `5xx`, `408`, `425`, وأخطاء الشبكة/المهلة.
- `Retry-After` يُحترم حرفيًا عند وجوده؛ وإلا تصاعد أُسّي مع jitter: ٠٫٧٥ث → ٣٠ث (قابل للضبط).
- `4xx` الأخرى لا تُعاد إطلاقًا (لا فائدة من التكرار، والمصدر قال كلمته).
- حدّ محلي للطلبات لكل مصدر (`per_minute`/`per_day`) يرفض الطلب **قبل** إرساله إن نفدت الحصة.

---

## 5. (D) هيكل الكود والتشغيل

```
lib/pipeline/
  config.ts        تحميل/تحقق السجل + بوابات المصادر (sourceGate)
  yaml-lite.ts     قارئ YAML بلا اعتماديات (لأن السجل يكتبه بشر)
  http.ts          عميل HTTP: retry · backoff · ETag · robots · حدود · أرشفة
  robots.ts        قرار robots.txt (وكيل مخصص > * مع أطول مطابقة تفوز)
  connectors.ts    خطة الجلب لكل (مصدر × مهمة) + القراءة عبر الـ normalizers
  normalizers/     football-data.ts · thesportsdb.ts · egyptian-sites.ts · web.ts · util.ts
  priority.ts      ترتيب الأولوية + قرار كل حقل
  discrepancies.ts تسجيل النزاعات في data_conflicts
  upsert.ts        كتابة idempotent + خريطة المعرّفات (source_id_map + provider_entity_map)
  runner.ts        تشغيل مهمة كاملة وتسجيل سجلها
  state.ts         logger منظم (بإخفاء المفاتيح) + sync_runs/sync_state
  raw-store.ts     أرشيف خام + تقليم بالاحتفاظ + إحصاءات
  status.ts        لقطة مراقبة واحدة للوحة/الـ API
  index.ts         الواجهة العامة الوحيدة

app/api/cron/pipeline/[job]/route.ts   نقطة الـ Cron (نفس حراسة بقية مسارات cron)
app/api/cron/update-matches/route.ts   تحديث المباريات فورًا (force) بلا انتظار الجدولة
app/api/v1/pipeline/status/route.ts    لقطة المراقبة (صلاحية providers)
app/api/v1/pipeline/run/route.ts       تشغيل يدوي من اللوحة (صلاحية providers)
app/admin/pipeline/page.tsx            لوحة المشغّل: المصادر · المهام · التشغيلات · النزاعات
scripts/pipeline.ts                    doctor · status · run · tick · loop · prune
scripts/pipeline-config-sync.ts        توليد/فحص مرآة JSON للسجل
```

### أوامر التشغيل

```bash
npm run pipeline:doctor                  # تحقق شامل: الإعداد · البوابات · القاعدة · المفاتيح
npm run pipeline:status                  # الحالة وسجل آخر التشغيلات
npm run pipeline:run -- matches          # تشغيل مهمة الآن
npm run pipeline:run -- standings --dry  # فحص جاف: جلب وتحويل بلا أي كتابة
npm run pipeline:tick                    # ما استحقّ فقط (مدخل cron)
npm run pipeline:loop                    # مجدول دائم (VPS/حاوية)
npm run pipeline:prune                   # تنفيذ نافذة الاحتفاظ بالأرشيف الخام
npm run pipeline:config:sync             # بعد أي تعديل على endpoints.yml
npm run pipeline:test                    # اختبارات العقد (بلا شبكة، بلا قاعدة بيانات)
```

### Docker

```bash
cp .env.example .env      # DATABASE_URL + مفاتيح المزوّدين
docker compose up --build # db + migrate + app + scheduler
```

---

## 6. (E) الكود المبدئي لكل مصدر

### 6.1 ملف الإعداد (المرجع الوحيد للروابط)

```yaml
sources:
  football_data:
    base_url: "https://api.football-data.org/v4"      # كما هو، بلا تعديل
    auth: { type: header, header: "X-Auth-Token", env: FOOTBALL_DATA_API_KEY }
    endpoints:
      - { name: standings, path: "/competitions/{code}/standings", kind: json, verified: true }
```

- أي `{placeholder}` يُملأ من `targets[].ref` أو من `sync_state.cursor` (مثل معرّف الدوري المكتشف).
- `verified: false` تعني **لا تستدعِ**: لا يُستدعى المسار إلا بعد تأكيده من التوثيق الرسمي
  (`verified: true`) أو بفحص صريح عبر `PIPELINE_ALLOW_UNVERIFIED_ENDPOINTS=1`.
- لا يُقبل — ولا يوجد في الكود — أي «إصلاح» أو إعادة كتابة أو تمرير عبر وسيط لرابط مصدر.
  عميل HTTP يرفض أي عنوان خارج نطاق `base_url` المسجَّل، وهذا مُختبَر.

### 6.2 Football-Data.org (مُطبَّق فعليًا)

- `X-Auth-Token` من البيئة فقط؛ المفتاح لا يدخل URL ولا سجل ولا أرشيف (يُستبدل بـ `***`).
- نقاط النهاية المُفعَّلة: `competitions` · `competition` · `standings` · `matches` (توثيق v4).
- الأهداف: بطولات مصرية معلَّمة `enabled: false` + `verified: false` لأن كودها لم يُؤكَّد بعد على
  خطتك (المجانية لا تشمل الدوري المصري). وهناك هدف أجنبي مفعّل (`PL`) يعمل كمسار **تحقق حيّ**
  من طرف إلى طرف: يُجلب ويُحوَّل ويُؤرشف، ولا يُنشر في الجداول القياسية لأن `foreign: true`.

### 6.3 TheSportsDB (مُطبَّق فعليًا)

- `X-API-KEY` من `THESPORTSDB_API_KEY` (تنسيق v2 — المفتاح في الترويسة لا في المسار).
- **اكتشاف معرّف الدوري المصري وقت التشغيل** بدل تخمينه: نقطة النهاية `leagues` + `match_field:
  strLeague` + `match_contains: egypt`، ويُخزَّن الناتج في `sync_state.cursor.league_id` لبقية المهام.
- المحوّل يقبل شكل v1 (`{"events":[…]}`) و v2 (مصفوفة مباشرة) لأن الاستجابات تختلف.

### 6.4 EPL · EFA · FIFA (جاهزة ومطفأة)

- القراءة عبر مسارين بالترتيب: **JSON-LD المنشور من الموقع نفسه** (`SportsEvent`) ثم جداول HTML
  بعناوين عربية/إنجليزية (الفريق + النقاط كحدّ أدنى للقبول).
- كل شيء يمر عبر بوابة robots، وبسرعة منخفضة (`min_interval_ms: 2500–3000`)، بهوية واضحة
  (`NemoSportsDataBot`) وبإمكانية إضافة جهة اتصال عبر `PIPELINE_CONTACT`.
- لا تُستدعى إطلاقًا حتى: `enabled: true` **و** `scraping_licensed: true` **و**
  `PIPELINE_SCRAPING_LICENSED=1` — ثلاث بوابات مستقلة بقصد.
- ما لم يُتحقَّق من هيكله يبقى `verified: false` ويظهر في اللوحة وفي `npm run pipeline:doctor`.

---

## 7. المتطلبات غير الوظيفية (§5)

- **Idempotency:** كل كتابة upsert بمفتاح طبيعي/معرّف ثابت؛ إعادة التشغيل تُغيّر `updated_at`
  و`last_seen_at` فقط. جدول الترتيب يُستبدل كاملًا لكل (موسم، مجموعة) لكل مصدر داخل معاملة.
- **Observability:** سجل JSON سطرًا سطرًا (بإخفاء المفاتيح) + `sync_runs` + `sync_state` +
  `/admin/pipeline` + `/api/v1/pipeline/status`.
- **Security:** المفاتيح في البيئة فقط؛ لا مفاتيح في الملف ولا في الأرشيف ولا في السجلات؛
  ومسارات `status` و`run` محميّة بصلاحية `providers` وبفشل مغلق.
- **Performance:** كاش للتحقق الشرطي (304)، سرعة منخفضة لكل مصدر، حدود نافذة زمنية محليّة،
  أرشفة اختيارية في الفحوصات، ومهمة واحدة لكل مصدر في المرة.
- **Extensibility:** إضافة مصدر = مدخل في `sources:` (+ normalizer إن كان نمطه جديدًا)؛
  وإضافة حقل = عمود + قرار أولوية + سطر في المحوّل.

---

## 8. سياسة حسم التعارضات (§6) — مثال عملي

مباراة في الدوري المصري: EPL تقول `2–1`، وTheSportsDB تقول `1–1`.

1. `decideField()` يقارن رتبتي المصدرين (EPL = 0، TheSportsDB = 4).
2. النتيجة: تُطبَّق `2–1`، ويُسجَّل `conflict = true`.
3. يُكتب الطرفان في `data_conflicts` بقيمتهما: `{"egyptianproleague": "2-1", "thesportsdb": "1-1", "__winner": …}`.
4. تبقى نسخة TheSportsDB الخام في `raw_payloads` بجوار نسخة EPL.
5. اللوحة تُظهر النزاع؛ ويمكن للمشغّل أن يقرّره (resolution) دون أن تتغيّر القيمة المطبَّقة.

القاعدة نفسها تُطبّق على الموعد (`scheduledAt` بتسامح دقيقة)، والحالة، والنتيجة، والجولة.
عند تعارض جدول الترتيب كاملًا يحلّ مصدر أعلى أولوية محلّ الأدنى داخل معاملة واحدة، ويُسجَّل النزاع.

---

## 9. بوابات قانونية لا تُفتح من الكود (§2 من التكليف)

- لا تعديل على بنية أو روابط أي موقع مصدر؛ نستخدم ما هو منشور.
- أي قراءة صفحات تبقى مغلقة حتى تأكيد الترخيص كتابةً.
- احترام `robots.txt` إلزامي لمصادر الصفحات، وقرار `Disallow` نهائي (لا إعادة محاولة ولا تمويه).
- احترام حدود المزوّد: سرعة منخفضة + حدود محليّة + `Retry-After`.
- لا تجاوز لأي حماية، ولا وصول إلى محتوى غير عام.

---

## 10. الحسم والخطوات التالية

### 10.1 قرارات حُسمت مع مالك المنتج

1. **التقنية:** TypeScript/Node داخل المشروع نفسه (إعادة استخدام SDL و`db/schema.sql` وPostgres).
2. **النطاق:** الدوري المصري الممتاز + كأس مصر + السوبر المصري في الطور الأول.
3. **الاستضافة:** Vercel + Vercel Cron، مع جاهزية Docker/VPS بالتوازي (`Dockerfile` +
   `docker-compose.yml`) بلا إعادة كتابة.

### 10.2 ما يحتاج قرارًا من المالك قبل الإقفال

| البند | المطلوب | لماذا هو لازم |
|---|---|---|
| تأكيد نقاط نهاية EPL/EFA/FIFA | توثيق/عقد رسمي أو تأكيد كتابي بالسماح بالقراءة الآلية | حتى تُقلب `verified: true` وتُشغَّل المصادر الثلاثة |
| كود الدوري المصري على Football-Data.org | تأكيد الكود على الخطة المدفوعة | الهدفان المصريان مضبوطان لكن معطَّلان (`enabled: false`) |
| مفاتيح المزوّدين | `FOOTBALL_DATA_API_KEY` و`THESPORTSDB_API_KEY` في بيئة النشر | بدونهما يُتخطّى المصدر بسبب واضح |
| خطة Vercel | Hobby أم Pro | على Pro يمكن جدولة `matches` كل دقيقتين؛ على Hobby نستخدم المجدول الخارجي |

### 10.3 التالي مباشرة

1. أول مزامنة بمزوّد حقيقي بعد وضع المفاتيح — المسار مُختبَر كاملًا مقابل مزوّدين مُحاكين (§12)،
   ويبقى المطلوب: مفتاح + تأكيد الرخص (§9).
2. تأكيد كود الدوري المصري (أو مسار رسمي من الرابطة) لفتح الهدفين المصريين.
3. استيعاب الهدافين/اللاعبين (`players`) وتوسيع المحوّلات.
4. توحيد `/admin/providers` مع `/admin/pipeline` في لوحة واحدة لتقليل التكرار في العرض.

---

## 11. التشغيل المحلي خطوة بخطوة

```bash
cp .env.example .env.local
# املأ: DATABASE_URL · FOOTBALL_DATA_API_KEY · THESPORTSDB_API_KEY · NEMO_INGEST_TOKEN
npm install
npm run db:setup                     # يضيف جداول الترحيل 0006
npm run pipeline:doctor              # تحقق: ما هو مفتوح، وما هو موقوف ولماذا، وما لم يُتحقَّق منه
npm run pipeline:run -- competitions --force     # بطولات + مواسم
npm run pipeline:run -- matches --force          # مباريات الجولة
npm run pipeline:status                          # سجل التشغيلات وحالة كل مصدر
npm run dev                                      # ثم /admin/pipeline
```

بلا `DATABASE_URL` يعمل كل شيء لكن بلا سجل ولا أرشيف (وتُظهر اللوحة ذلك بوضوح).
بلا مفاتيح: كل مصدر API يُتخطّى بسبب مكتوب — لا بيانات مُختلقة، ولا أرقام وهمية.

**أسبقية ملف الإعداد (مقروءة من الكود، ومُتحقَّق منها):**

| الأولوية | المصدر | الاستخدام |
|---|---|---|
| ١ | `PIPELINE_CONFIG_PATH` | تشغيل بملف إعداد بديل (تجارب/أسطول) — يتقدّم على كل شيء |
| ٢ | `config/pipeline/endpoints.local.json` | تجاوزات محلية غير مرفوعة إلى Git |
| ٣ | `config/pipeline/endpoints.yml` | **المرجع الرسمي** الذي يحرّره الفريق |
| ٤ | `config/pipeline/endpoints.json` | نسخة مولّدة (لبيئات لا تقرأ YAML) |

`npm run pipeline:doctor` يطبع دائمًا من أي طبقة جاء الإعداد (`config from: yaml|json|local|path`)
حتى لا يُشغَّل خط بيانات على إعداد لا يقصده المشغّل.

**قاعدة بيانات محلية كاملة (بلا Docker):** أي نسخة PostgreSQL حديثة تكفي؛ للتجربة السريعة داخل
المستودع تم استخدام نسخة مدمجة مؤقتة (عميل `pg` مع `@embedded-postgres`) على منفذ غير قياسي،
وبديلها الموصى به به بيئة حقيقية هو `docker compose up -d db` من §5.

---

## 12. التحقق التنفيذي — ما أُثبت فعليًا لا ما صُمِّم فقط

شُغِّل خط البيانات كاملًا على **PostgreSQL 18 حقيقي** مقابل **مزوّدين مُحاكين** (سيرفر وهمي على
`127.0.0.1` يقدّم مسارات Football-Data.org ومسارات موقع الرابطة المصرية بصفحات HTML وجداول
عربية، مع `ETag` و`304` و`robots.txt`). الهدف: إثبات المسار كاملًا (fetch → normalize → upsert →
raw archive → run history) بلا استهلاك حصة أي مزوّد حقيقي.

| الخطوة | النتيجة |
|---|---|
| `npm run db:setup` | ٧/٧ خطوات، «Database ready» بعد الترحيل 0006 |
| `pipeline:run -- bootstrap --force` (بارد) | `ok:true` · جُلب=٦ · جديد=٩ · محدَّث=١٠ · فشل=٠ · تخطي=١ (robots) |
| `pipeline:run -- bootstrap` (دافئ) | كل الطلبات ٣٠٤ · `ok:true` · طلبات فعلية=٠ (صفر حصة) |
| `matches/standings/teams/competitions --force` | كل مهمة تعمل على نقاط نهايتها وحدها: مباريات ٥/٤ · ترتيب ٣/٣ · فرق · بطولات |
| `pipeline:status` / `pipeline:doctor` | سجل التشغيلات وحالة كل مصدر وسبب تخطيه — من قاعدة البيانات لا من الذاكرة |
| محتوى القاعدة | ٤ بطولات (٣ مصرية + England PL) · ٣ مواسم · ٦ فرق · ٥ صفوف ترتيب · صراعات مفتوحة=٠ |
| الأرشيف الخام | ١٢ صفًا: ٦ استجابات `200` (JSON وHTML) + ٦ `304` — كلها ببصمة `payload_hash` |
| خرائط الهوية | `source_id_map`: ٦ أزواج (مصدر × نوع كيان) — بطولات/مواسم/فرق/مباريات |
| الواجهة HTTP | `cron/pipeline/{job}`: ٤٠١ بلا توكن · ٢٠٠ بالتوكن · ٤٠٤ لمهمة مجهولة · `v1/pipeline/*`: ٤٠٣ بلا صلاحية |
| البناء | `npm run build` ناجح (٢٠+ صفحة + مسارات `api/cron/pipeline/[job]` و`api/v1/pipeline/*`) |
| المجموعات | `npm run check` كامل: كل المجموعات ناجحة (٣٥ اختبارًا لخط البيانات) |

**ثلاث علل حقيقية كشفها التشغيل وأُصلحت:**

1. **تدفّق المُتحقِّقات بين المهام** — كانت `304` تُعطى لأن وسم نقطة نهاية يُرسل لنقطة أخرى
   (`standings` بوسم `competitions`)، فيظهر التشغيل «ناجحًا» بلا كتابة أي صف. الحل: §4.3.
2. **عدم حفظ المُتحقِّق على مسار `304`** — كانت المهمة تعيد بناء حالتها من الصفر في كل مرة،
   فيفشل المصدر التالي بـ«every configured fetch failed». الحل: الكتابة في `cursor` على المسارين.
3. **تصنيف خاطئ للرفض المشروع** — `robots.txt` ونفاد الحصة كانا يُحتسبان «فشلًا» فيُلوَّن المصدر
   أحمر وهما نظامٌ يطيع قواعده. الحل: تخطٍّ + تحذير (§4.3).

وأُضيفت ثلاث اختبارات انحدار (٣٣–٣٥) تقفل هذه الحالات الثلاث حتى لا تعود صامتة.
