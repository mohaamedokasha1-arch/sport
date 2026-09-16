import { AdminHead, Btn, Panel, Table, Pill, Field, inputCls } from "@/components/admin/ui";
import { competitions, sports, teams } from "@/lib/core-data";
import { standings } from "@/lib/data";

export default function AdminCompetitions() {
  return (
    <div>
      <AdminHead
        title="البطولات والفرق والرياضات"
        subtitle={`${competitions.length} بطولة · ${teams.length} فريق · ${sports.length} رياضات`}
        action={<Btn>+ بطولة جديدة</Btn>}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="البطولات">
          <Table
            head={["البطولة", "الرياضة", "الموسم", "الفرق", "الجداول", "إجراءات"]}
            rows={competitions.map((c) => [
              <span key="n" className="font-bold">{c.name}</span>,
              <span key="s" className="text-white/60">{sports.find((s) => s.slug === c.sport)?.name}</span>,
              <span key="se" className="num">{c.season}</span>,
              <span key="t" className="num">{c.teamsCount}</span>,
              standings[c.slug] ? <Pill key="st" tone="ok">متوفر</Pill> : <Pill key="st" tone="idle">—</Pill>,
              <span key="a" className="flex gap-1.5">
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

        <div className="space-y-4">
          <Panel title="إضافة / تعديل بطولة">
            <div className="space-y-3">
              <Field label="اسم البطولة">
                <input className={inputCls} defaultValue="الدوري المصري الممتاز" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="الرياضة">
                  <select className={inputCls}>
                    {sports.map((s) => (
                      <option key={s.slug}>{s.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="الموسم">
                  <input className={inputCls} defaultValue="2026/2027" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="نوع المنافسة">
                  <select className={inputCls}>
                    <option>دوري</option>
                    <option>كأس</option>
                    <option>دوري + كأس</option>
                    <option>بطولة فردية</option>
                  </select>
                </Field>
                <Field label="عدد الجولات">
                  <input className={inputCls} defaultValue="34" />
                </Field>
              </div>
              <Field label="الرمز المختصر (يظهر في الشريط المباشر)">
                <input className={inputCls} defaultValue="EGY" />
              </Field>
              <div className="flex gap-2">
                <Btn>حفظ</Btn>
                <Btn tone="ghost">إدارة الفرق</Btn>
              </div>
            </div>
          </Panel>

          <Panel title="الرياضات المدعومة">
            <ul className="space-y-1.5 text-[12px]">
              {sports.map((s) => (
                <li key={s.slug} className="flex items-center justify-between gap-2 rounded-[3px] border border-navy-800 px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span aria-hidden>{s.icon}</span>
                    <span className="font-semibold">{s.name}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="num text-[10px] text-white/40">ترتيب {s.order}</span>
                    <Pill tone={s.active ? "ok" : "idle"}>{s.active ? "نشطة" : "متوقفة"}</Pill>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <Btn tone="ghost">+ رياضة جديدة</Btn>
            </div>
          </Panel>
        </div>
      </div>

      <div className="mt-5">
        <Panel title="الفرق" aside={<Pill tone="idle">{teams.length}</Pill>}>
          <Table
            head={["الفريق", "الرياضة", "الدولة", "البطولة", "الملعب", "إجراءات"]}
            rows={teams.slice(0, 24).map((t) => [
              <span key="n" className="font-bold">{t.name}</span>,
              <span key="s" className="text-white/60">{sports.find((s) => s.slug === t.sport)?.name}</span>,
              <span key="c" className="text-white/60">{t.flag} {t.country}</span>,
              <span key="co" className="text-white/60">{competitions.find((c) => c.slug === t.competition)?.name ?? "—"}</span>,
              <span key="st" className="text-white/60">{t.stadium ?? "—"}</span>,
              <span key="a" className="flex gap-1.5">
                <button type="button" className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400">
                  تعديل
                </button>
                <button type="button" className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/60 transition hover:border-live hover:text-live">
                  حذف
                </button>
              </span>,
            ])}
          />
          <p className="mt-3 text-[11px] text-white/40">
            تُعرض أول 24 سجلًا. في الإنتاج تُضاف فلاتر وترقيم صفحات وبحث فوري.
          </p>
        </Panel>
      </div>
    </div>
  );
}
