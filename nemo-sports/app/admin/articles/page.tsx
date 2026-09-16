import { AdminHead, Btn, Panel, Table, Pill, Field, inputCls } from "@/components/admin/ui";
import { articles, breakingNews } from "@/lib/data";
import { compact, relative } from "@/lib/format";

const editorTools = [
  "عنوان 2", "عنوان 3", "عريض", "مائل", "قائمة", "اقتباس", "رابط", "صورة", "فيديو", "جدول", "فاصل", "تراجع",
];

export default function AdminArticles() {
  return (
    <div>
      <AdminHead
        title="المقالات والأخبار"
        subtitle={`${articles.length} مقالة · ${breakingNews.length} خبر عاجل نشط`}
        action={
          <span className="flex gap-2">
            <Btn tone="ghost">⚡ خبر عاجل</Btn>
            <Btn>+ مقالة جديدة</Btn>
          </span>
        }
      />

      <Panel title="الأخبار العاجلة النشطة" aside={<Pill tone="bad">{breakingNews.length} نشط</Pill>}>
        {breakingNews.length === 0 ? (
          <p className="text-[12px] text-white/50">لا توجد أخبار عاجلة نشطة.</p>
        ) : (
          <ul className="space-y-2">
            {breakingNews.map((a) => (
              <li key={a.slug} className="flex flex-wrap items-center justify-between gap-3 rounded-[3px] border border-live/30 bg-live/5 px-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-bold">{a.title}</span>
                  <span className="num block text-[10px] text-white/45">
                    {relative(new Date(Date.now() - a.publishedAgoMin * 60000).toISOString())} · ينتهي العرض بعد 24 ساعة
                  </span>
                </span>
                <span className="flex gap-1.5">
                  <button type="button" className="rounded-[3px] border border-navy-700 px-2.5 py-1 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400">
                    تعديل
                  </button>
                  <button type="button" className="rounded-[3px] border border-live/50 px-2.5 py-1 text-[11px] font-bold text-live transition hover:bg-live hover:text-white">
                    إيقاف
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="mt-5">
        <Panel title="كل المقالات" aside={<Pill tone="idle">{articles.length}</Pill>}>
          <Table
            head={["العنوان", "الفئة", "النوع", "الكاتب", "الحالة", "مشاهدات", "إجراءات"]}
            rows={articles.map((a) => [
              <span key="t" className="max-w-[280px] truncate font-bold">{a.title}</span>,
              <span key="c" className="text-white/60">{a.category}</span>,
              a.kind === "external" ? <Pill key="k" tone="warn">مصدر خارجي</Pill> : <Pill key="k" tone="idle">أصلي</Pill>,
              <span key="a" className="text-white/60">{a.author}</span>,
              <Pill key="s" tone="ok">منشور</Pill>,
              <span key="v" className="num">{compact(a.views)}</span>,
              <span key="e" className="flex gap-1.5">
                <button type="button" className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400">
                  تعديل
                </button>
                <button type="button" className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/60 transition hover:border-live hover:text-live">
                  حذف
                </button>
              </span>,
            ])}
          />
        </Panel>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="محرر المقالة">
          <div className="space-y-3">
            <Field label="العنوان">
              <input className={inputCls} defaultValue="ديربي القاهرة: كيف يخطط الأهلي والزمالك لمعركة الوسط؟" />
            </Field>

            <div className="rounded-[3px] border border-navy-700">
              <div className="flex flex-wrap gap-1 border-b border-navy-700 bg-navy-950/60 p-2">
                {editorTools.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="rounded-[3px] px-2 py-1 text-[10px] font-bold text-white/60 transition hover:bg-white/10 hover:text-white"
                  >
                    {t}
                  </button>
                ))}
              </div>
              <textarea
                rows={9}
                defaultValue="يدخل الأهلي مواجهة الديربي وهو يبحث عن تثبيت أقدامه في صدارة الترتيب…"
                className="w-full bg-transparent p-3 text-[13px] leading-relaxed outline-none"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="SEO Title (50–60 حرف)">
                <input className={inputCls} defaultValue="ديربي القاهرة اليوم | تحليل خطة الأهلي والزمالك" />
              </Field>
              <Field label="Meta Description (150–160 حرف)">
                <input className={inputCls} defaultValue="قراءة فنية في أوراق الأهلي والزمالك قبل ديربي القاهرة: صراع الوسط، الأرقام، ونقاط الحسم." />
              </Field>
              <Field label="الكلمة المفتاحية">
                <input className={inputCls} defaultValue="ديربي القاهرة" />
              </Field>
              <Field label="Slug">
                <input className={inputCls} defaultValue="ahly-zamalek-cairo-derby-preview" />
              </Field>
            </div>

            <div className="flex gap-2">
              <Btn>نشر</Btn>
              <Btn tone="ghost">جدولة</Btn>
              <Btn tone="ghost">حفظ مسودة</Btn>
            </div>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="التصنيف والربط">
            <div className="space-y-3">
              <Field label="الفئة">
                <select className={inputCls}>
                  <option>تحليل</option>
                  <option>تقرير</option>
                  <option>مقابلة</option>
                  <option>انتقالات</option>
                  <option>ملخص</option>
                </select>
              </Field>
              <Field label="الوسوم">
                <input className={inputCls} defaultValue="الأهلي، الزمالك، ديربي القاهرة" />
              </Field>
              <Field label="ربط بفرق">
                <input className={inputCls} defaultValue="al-ahly, zamalek" />
              </Field>
              <Field label="ربط بلاعبين">
                <input className={inputCls} defaultValue="imam-ashour" />
              </Field>
              <Field label="الصورة الرئيسية">
                <div className="grid h-24 place-items-center rounded-[3px] border border-dashed border-navy-700 text-[11px] text-white/40">
                  اسحب صورة أو اضغط للرفع
                </div>
              </Field>
            </div>
          </Panel>

          <Panel title="مصدر خارجي (اختياري)">
            <p className="mb-3 text-[11px] leading-relaxed text-white/45">
              عند تلخيص خبر من مصدر خارجي: اكتب ملخصًا أصليًا، ولا تنسخ النص كاملًا، وأرفق رابط
              المصدر الأصلي ليظهر بوسم nofollow.
            </p>
            <div className="space-y-3">
              <Field label="اسم المصدر">
                <input className={inputCls} placeholder="مثال: BBC Sport" />
              </Field>
              <Field label="رابط المصدر">
                <input className={inputCls} placeholder="https://…" />
              </Field>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
