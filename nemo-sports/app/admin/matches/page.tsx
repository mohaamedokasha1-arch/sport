import Link from "next/link";
import { AdminHead, Btn, Panel, Table, Pill, Field, inputCls } from "@/components/admin/ui";
import { allMatches } from "@/lib/data";
import { competitionBySlug, teamBySlug } from "@/lib/core-data";
import { dateAr, timeOf } from "@/lib/format";

const statusTone = { LIVE: "bad", UPCOMING: "idle", FINISHED: "ok", POSTPONED: "warn", CANCELLED: "warn", HT: "bad", SUSPENDED: "warn" } as const;
const statusAr = { LIVE: "جارية", UPCOMING: "قادمة", FINISHED: "انتهت", POSTPONED: "مؤجلة", CANCELLED: "ملغاة", HT: "استراحة", SUSPENDED: "متوقفة" };

export default function AdminMatches() {
  return (
    <div>
      <AdminHead
        title="المباريات والنتائج"
        subtitle={`${allMatches.length} مباراة · تحديث النتيجة وإضافة الأحداث والإحصائيات`}
        action={<Btn>+ مباراة جديدة</Btn>}
      />

      <div className="mb-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="كل المباريات" aside={<Pill tone="idle">{allMatches.length} سجل</Pill>}>
          <Table
            head={["المباراة", "البطولة", "الجولة", "الموعد", "النتيجة", "الحالة", "إجراءات"]}
            rows={allMatches.map((m) => [
              <span key="t" className="font-bold">
                {teamBySlug(m.home)?.name} × {teamBySlug(m.away)?.name}
              </span>,
              <span key="c" className="text-white/60">{competitionBySlug(m.competition)?.name}</span>,
              <span key="r" className="text-white/60">{m.round}</span>,
              <span key="d" className="num whitespace-nowrap">
                {dateAr(m.kickoff)} · {timeOf(m.kickoff)}
              </span>,
              <span key="s" className="num font-extrabold">{m.homeScore} – {m.awayScore}</span>,
              <Pill key="st" tone={statusTone[m.status]}>{statusAr[m.status]}</Pill>,
              <span key="a" className="flex gap-1.5">
                <button type="button" className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400">
                  تحديث
                </button>
                <Link
                  href={`/matches/${m.slug}`}
                  className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/60 transition hover:border-gold-500 hover:text-gold-400"
                >
                  عرض
                </Link>
              </span>,
            ])}
          />
        </Panel>

        <div className="space-y-4">
          <Panel title="تحديث نتيجة">
            <div className="grid grid-cols-2 gap-3">
              <Field label="أهداف الفريق الأول">
                <input type="number" defaultValue={1} className={inputCls} />
              </Field>
              <Field label="أهداف الفريق الثاني">
                <input type="number" defaultValue={2} className={inputCls} />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="حالة المباراة">
                <select className={inputCls} defaultValue="LIVE">
                  <option value="UPCOMING">لم تبدأ</option>
                  <option value="LIVE">جارية</option>
                  <option value="HT">استراحة</option>
                  <option value="FINISHED">انتهت</option>
                  <option value="POSTPONED">مؤجلة</option>
                  <option value="CANCELLED">ملغاة</option>
                </select>
              </Field>
            </div>
            <div className="mt-3">
              <Field label="الدقيقة الحالية">
                <input type="text" defaultValue="63" className={inputCls} />
              </Field>
            </div>
            <div className="mt-4 flex gap-2">
              <Btn>حفظ النتيجة</Btn>
              <Btn tone="ghost">إلغاء</Btn>
            </div>
          </Panel>

          <Panel title="إضافة حدث">
            <div className="space-y-3">
              <Field label="نوع الحدث">
                <select className={inputCls}>
                  <option>هدف</option>
                  <option>ركلة جزاء</option>
                  <option>بطاقة صفراء</option>
                  <option>بطاقة حمراء</option>
                  <option>تبديل</option>
                  <option>إصابة</option>
                  <option>مراجعة VAR</option>
                </select>
              </Field>
              <Field label="اللاعب">
                <input className={inputCls} placeholder="ابحث عن لاعب…" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="الدقيقة">
                  <input className={inputCls} defaultValue="63" />
                </Field>
                <Field label="الفريق">
                  <select className={inputCls}>
                    <option>الفريق الأول</option>
                    <option>الفريق الثاني</option>
                  </select>
                </Field>
              </div>
              <Field label="تفاصيل إضافية">
                <input className={inputCls} placeholder="مثال: تمريرة حاسمة من…" />
              </Field>
              <Btn>إضافة الحدث</Btn>
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="إضافة مباراة جديدة">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="الفريق الأول">
            <input className={inputCls} placeholder="اختر فريقًا…" />
          </Field>
          <Field label="الفريق الثاني">
            <input className={inputCls} placeholder="اختر فريقًا…" />
          </Field>
          <Field label="البطولة">
            <select className={inputCls}>
              <option>الدوري الإنجليزي الممتاز</option>
              <option>الدوري المصري الممتاز</option>
              <option>دوري أبطال أوروبا</option>
            </select>
          </Field>
          <Field label="الجولة">
            <input className={inputCls} defaultValue="الجولة 25" />
          </Field>
          <Field label="التاريخ والوقت">
            <input type="datetime-local" className={inputCls} />
          </Field>
          <Field label="الملعب">
            <input className={inputCls} placeholder="اسم الملعب" />
          </Field>
          <Field label="الحكم">
            <input className={inputCls} placeholder="اختياري" />
          </Field>
          <Field label="مباراة مميزة">
            <select className={inputCls}>
              <option>لا</option>
              <option>نعم — تظهر في الصفحة الرئيسية</option>
            </select>
          </Field>
        </div>
        <div className="mt-4 flex gap-2">
          <Btn>حفظ المباراة</Btn>
          <Btn tone="ghost">حفظ كمسودة</Btn>
        </div>
      </Panel>
    </div>
  );
}
