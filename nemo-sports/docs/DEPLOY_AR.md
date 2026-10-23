# النشر — نوع المشروع والإعدادات الصحيحة

## الخلاصة

المشروع **مش static site ومش Worker**، هو **Next.js 15 (App Router) بيشتغل على Node.js**،
ومكانه في **مجلد فرعي `nemo-sports/`** من الريبو — مش في الجذر `/`.

| البند | القيمة الصحيحة |
|---|---|
| النوع | Next.js 15 · Node runtime |
| مجلد المشروع | `nemo-sports` (مش `/`) |
| أمر التثبيت | `npm ci` |
| أمر البناء | `npm run build` (`next build`) |
| أمر التشغيل | `npm run start` (`next start`) |
| نسخة Node | 22 |
| ملفات الإعداد الموجودة | `nemo-sports/vercel.json` (كرون: ingest + news) |

### أرقام من الريبو تثبت إنه مش static

- **28** مسار API (`app/**/route.ts`) كلها `runtime = "nodejs"`.
- **87** صفحة، منها مسارات ديناميكية و`middleware.ts` بيحمي `/admin*`.
- `next.config.ts` مافيهوش `output: "export"` ⇒ **مستحيل** يطلع كملفات HTML ثابتة.
- الكتابة على القرص: `lib/admin-matches.ts` و`lib/match-streams.ts` بيكتبوا ملفات داخل `db/`.

---

## المسار المُوصى به: Vercel

الريبو مُجهّز لـ Vercel أصلًا (`vercel.json`, README فيه `https://nemo-sports.vercel.app`).
الإعدادات في لوحة Vercel (Project → Settings → General / Build & Development):

| الحقل | القيمة |
|---|---|
| Framework Preset | `Next.js` (يُكتشف تلقائيًا) |
| **Root Directory** | `nemo-sports` ← **ده الإصلاح الأساسي** |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | اتركه فاضي (Next.js) |

ثم Environment Variables (الحد الأدنى لتشغيل حقيقي):

- `NEXT_PUBLIC_SITE_URL` = أصل الموقع النهائي (بدونه الـ canonical بيشير لـ `nemo-sports.vercel.app`).
- `DATABASE_URL` (Postgres) و`REDIS_URL` لو عايز المزامنة الدائمة والكاش المشترك.
- `NEMO_INGEST_TOKEN` أو `CRON_SECRET` لتأمين `/api/v1/ingest` (بدونهم بيرد 503 عن قصد).
- `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH` + `ADMIN_SESSION_SECRET` لتشغيل لوحة التحكم
  (`npm run admin:hash -- '<كلمة طويلة>'`).

> ملاحظة: الكتابة على `db/*.json` على Vercel بتشتغل على نظام ملفات للقراءة فقط في الـ serverless
> functions. أي تعديل من لوحة التحكم (مباريات/بث) لازم يروح لـ Postgres عبر `DATABASE_URL`
> وإلا هيتوه بعد انتهاء الـ invocation.

---

## لو لازم Cloudflare

`npx wrangler deploy` فشل لثلاث أسباب متراكبة:

1. **Root directory = `/`** — مفيش `package.json` في الجذر، فمفيش `npm install` ولا `build`.
2. **مفيش build command** — فلا يوجد `.next` يخدمه Wrangler.
3. **مفيش Worker ولا adapter** — Wrangler بيدوّر على `main` أو `assets` فمش لاقي حاجة.

Next.js لا ينشر على Workers بملف `wrangler.jsonc` بسيط؛ محتاج أدابتر
`@opennextjs/cloudflare`، والإعداد وقتها:

- Build command: `npx opennextjs-cloudflare build`
- Deploy command: `npx wrangler deploy`
- Root directory: `nemo-sports`
- `wrangler.jsonc`: `main: ".open-next/worker.js"`, `assets.directory: ".open-next/assets"`,
  `compatibility_flags: ["nodejs_compat"]`

### عوائق حقيقية في هذا الكود على Workers (لازم تتصلّح قبل النشر)

| العائق | المكان | الحل |
|---|---|---|
| الكتابة/القراءة على ملفات JSON | `lib/admin-matches.ts` (`db/admin-matches.json`)، `lib/match-streams.ts` (`db/match-streams.json`)، `lib/pipeline/config.ts` | نقل الحالة لـ Postgres/D1 أو R2 — نظام ملفات Worker غير قابل للكتابة |
| `pg` عبر TCP خام | `DATABASE_URL` في `packages/sdl` | Hyperdrive + `postgres.js` (pg مش مدعوم على Workers) |
| `ioredis` | طبقات الكاش | استخدام Upstash Redis عبر HTTP أو KV |
| الكرونات | `vercel.json` | نقلها إلى Cron Triggers في `wrangler.jsonc` |
| `middleware.ts` | `next/server` middleware | OpenNext بيدعمه، لكن يحتاج مراجعة |

باختصار: التحويل لـ Cloudflare مش تغيير إعدادات، ده شغل طبقة تخزين كاملة.

---

## التحقق قبل النشر

```bash
cd nemo-sports
npm ci
npm run typecheck
npm run build
npm run start   # ثم npm run smoke في تيرمنال تاني
```

نفس الخطوات دي بتشتغل في `.github/workflows/ci.yml` بدون أي أسرار.
