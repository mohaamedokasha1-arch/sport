> **2026-10-09 implementation update:** Public reads no longer start traffic-driven
> background refreshes. Only awaited cron/admin jobs update the feed. Production
> ingestion requires Postgres; the process/transaction locks and 40-second job
> budget are described in [the current implementation report](IMPLEMENTATION_2026-10-09.md).
> Older descriptions below of lazy refresh are historical, not current behavior.

# NEMO Sports · جدولة تحديث الأخبار

> **المشكلة:** خطة Vercel المجانية (Hobby) تسمح بمهمة cron واحدة يوميًا فقط،
> وهذا لا يكفي لأخبار حديثة. `vercel.json` يحتوي حاليًا على مهمة يومية
> (`30 3 * * *`) كاحتياط. الحل المجاني هو جدولة خارجية تستدعي المسار نفسه كل
> بضع دقائق.

## 1. المتطلبات قبل الجدولة

1. **التخزين الدائم مُفعّل.** بدون `DATABASE_URL` تُحفظ الأخبار في ذاكرة
   النسخة فقط وتضيع عند إعادة التشغيل. راجع [docs/DATABASE.md](DATABASE.md)،
   ثم تحقق بالأمر:
   ```bash
   DATABASE_URL='...' npx tsx scripts/verify-db.ts
   ```
2. **الحقول التي يجب أن تراها في الرد:** `"storage":"postgres"` (لا `memory`)، و`perSource` فيه مصادر `ok:true`.
3. **توكن الجدولة مضبوط** في متغيرات Vercel البيئية (Production):
   - `NEMO_INGEST_TOKEN`: قيمة عشوائية طويلة. أنشئها محليًا بالأمر
     `openssl rand -hex 32`. **لا تضعها في الكود أو في Git.**

## 2. إعداد الجدولة (cron-job.org أو أي خدمة مشابهة)

أنشئ مهمة بهذه الإعدادات:

| الحقل | القيمة |
|---|---|
| URL | `https://nemo-sports.vercel.app/api/cron/fetch-news` |
| Method | `GET` |
| Schedule | كل 15 دقيقة (أو أقل تكرارًا حسب حدود خطتك المجانية) |
| Header | `Authorization: Bearer <NEMO_INGEST_TOKEN>` |

**لماذا الترويسة وليس `?token=`؟** السجلات الخاصة بالخدمة الخارجية وسجلات
الاستضافة قد تحفظ عنوان URL كاملًا، فوضع التوكن في الترويسة يقلل تسريبه.

## 3. التحقق بعد الإعداد

```bash
# 1) بدون توكن يجب أن يُرفض الطلب (401)
curl -s -o /dev/null -w '%{http_code}\n' https://nemo-sports.vercel.app/api/cron/fetch-news

# 2) مع التوكن: المسار يعيد ok:true حتى لو فشلت المصادر كلها،
#    لذلك تحقق من perSource (ok لكل مصدر) وليس من ok وحدها
curl -s -H "Authorization: Bearer $NEMO_INGEST_TOKEN" \
  https://nemo-sports.vercel.app/api/cron/fetch-news \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print("inserted:",d["inserted"]); print("sources ok:",sum(s["ok"] for s in d["perSource"]),"/",len(d["perSource"])); [print(" ✗",s["query"],"-",s["error"]) for s in d["perSource"] if not s["ok"]]'

# 3) الأخبار المحفوظة وآخر تحديث
curl -s https://nemo-sports.vercel.app/api/v1/news | head -c 400
```

الدليل على النجاح: `meta.lastUpdated` ليس `null`، و`meta.stale` يصبح `false`
بعد الجلب، وتبقى الأخبار نفسها بعد إعادة النشر.

## 4. ما الذي يعنيه كل رد من المسار

| الحالة | المعنى | الإجراء |
|---|---|---|
| `401 unauthorized` | التوكن غير مطابق | تحقق من الترويسة والقيمة |
| `503 not_configured` | لم يُضبط `NEMO_INGEST_TOKEN` أو `CRON_SECRET` | أضفه في Vercel ثم أعد النشر |
| `200` مع `storage: "memory"` | قاعدة البيانات غير مستخدمة رغم ضبط `DATABASE_URL` (إعداد خاطئ). **الأخبار لن تبقى.** | راجع سجلات Vercel لرسالة `[news] DATABASE_URL is set but…` |
| `200 ok:true` | المسار نفّذ دورة الجلب. **لا يعني أن المصادر نجحت.** | راجع `perSource`: كل مصدر له `ok` و`error` خاص به |
| `200` مع `perSource` كله `ok:false` | فشل كل المصادر (شبكة، حظر، أو تغيّر في المصدر) | راجع `error` لكل مصدر، واختبر الاتصال من Vercel |
| `500 ingest_failed` | خطأ في خط الأنابيب | راجع سجلات Vercel للدالة |

## 5. ملاحظات

- المسار يحترم فاصل التحديث وإعادة المحاولة لكل مصدر، لذلك الاستدعاء المتكرر
  آمن ولا يسبب طلبات زائدة للمصادر.
- `?force=1` يتجاوز فاصل التحديث، ويُستخدم للاختبار اليدوي فقط.
- إذا تعطّل مصدر بعينه، تستمر بقية المصادر في العمل.
