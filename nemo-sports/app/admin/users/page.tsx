import { AdminHead, Btn, Panel, Table, Pill, Field, inputCls } from "@/components/admin/ui";

const users = [
  { name: "مدير المنصة", email: "owner@nemo.sports", role: "Owner", joined: "2025-01-12", last: "قبل دقيقتين", status: "نشط" },
  { name: "سارة منير", email: "sara@nemo.sports", role: "Super Admin", joined: "2025-03-04", last: "قبل 20 دقيقة", status: "نشط" },
  { name: "كريم عبد الله", email: "karim@nemo.sports", role: "Editor", joined: "2025-06-19", last: "قبل ساعة", status: "نشط" },
  { name: "أحمد فؤاد", email: "ahmed@nemo.sports", role: "Sports Editor", joined: "2025-08-02", last: "قبل 3 ساعات", status: "نشط" },
  { name: "ليلى حسن", email: "laila@nemo.sports", role: "Editor", joined: "2026-01-15", last: "أمس", status: "نشط" },
  { name: "معتز سامي", email: "moataz@nemo.sports", role: "Moderator", joined: "2026-04-22", last: "قبل 5 أيام", status: "موقوف" },
];

const roles = [
  { role: "Owner", perms: "وصول كامل · إدارة المستخدمين والأدوار · إعدادات الموقع الحساسة" },
  { role: "Super Admin", perms: "كل الصلاحيات التشغيلية · إدارة المحتوى والإعدادات" },
  { role: "Admin", perms: "إدارة المحتوى والإعلانات والمستخدمين العاديين (بدون إعدادات أساسية)" },
  { role: "Editor", perms: "كتابة وتعديل وحذف المقالات · إدارة الأخبار · تحديث المباريات" },
  { role: "Sports Editor", perms: "تعديل الرياضات والفرق واللاعبين · إضافة البطولات والمباريات" },
  { role: "Moderator", perms: "مراجعة المحتوى والبلاغات · بدون صلاحية حذف" },
];

export default function AdminUsers() {
  return (
    <div>
      <AdminHead
        title="المستخدمون والصلاحيات"
        subtitle={`${users.length} حساب · مبدأ أقل صلاحية + 2FA إلزامي للأدوار الإدارية`}
        action={<Btn>+ مستخدم جديد</Btn>}
      />

      <Panel title="الحسابات">
        <Table
          head={["الاسم", "البريد", "الدور", "الانضمام", "آخر نشاط", "الحالة", "إجراءات"]}
          rows={users.map((u) => [
            <span key="n" className="font-bold">{u.name}</span>,
            <span key="e" className="num text-white/60">{u.email}</span>,
            <Pill key="r" tone={u.role === "Owner" ? "bad" : u.role.includes("Admin") ? "warn" : "idle"}>{u.role}</Pill>,
            <span key="j" className="num text-white/60">{u.joined}</span>,
            <span key="l" className="text-white/60">{u.last}</span>,
            <Pill key="s" tone={u.status === "نشط" ? "ok" : "bad"}>{u.status}</Pill>,
            <span key="a" className="flex gap-1.5">
              <button type="button" className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400">
                تعديل
              </button>
              <button type="button" className="rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/60 transition hover:border-live hover:text-live">
                تعطيل
              </button>
            </span>,
          ])}
        />
      </Panel>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="مصفوفة الأدوار">
          <ul className="space-y-2">
            {roles.map((r) => (
              <li key={r.role} className="rounded-[3px] border border-navy-800 p-3">
                <p className="text-[12px] font-extrabold text-gold-400">{r.role}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/55">{r.perms}</p>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="إضافة مستخدم">
          <div className="space-y-3">
            <Field label="الاسم الكامل">
              <input className={inputCls} placeholder="الاسم الكامل" />
            </Field>
            <Field label="البريد الإلكتروني">
              <input type="email" className={inputCls} placeholder="name@nemo.sports" />
            </Field>
            <Field label="الدور">
              <select className={inputCls}>
                {roles.map((r) => (
                  <option key={r.role}>{r.role}</option>
                ))}
              </select>
            </Field>
            <Field label="كلمة مرور مؤقتة">
              <input className={inputCls} placeholder="تُولَّد تلقائيًا وتُرسل بالبريد" />
            </Field>
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" defaultChecked className="accent-[#D4AF37]" />
              إلزام تفعيل 2FA عند أول دخول
            </label>
            <Btn>إضافة المستخدم</Btn>
          </div>
        </Panel>
      </div>

      <div className="mt-5">
        <Panel title="سجل النشاطات (آخر 6)">
          <ul className="space-y-1.5 text-[12px] text-white/60">
            {[
              "سارة منير حدّثت نتيجة مباراة مانشستر سيتي × ليفربول",
              "كريم عبد الله نشر مقالًا: ديربي القاهرة",
              "أحمد فؤاد أضاف مصدر بث جديد (قيد المراجعة)",
              "مدير المنصة عدّل صلاحيات معتز سامي",
              "ليلى حسن جدولت مقالًا للنشر غدًا 09:00",
              "سارة منير أعادت بناء sitemap.xml",
            ].map((x) => (
              <li key={x} className="flex items-start gap-2 rounded-[3px] border border-navy-800 px-3 py-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" aria-hidden />
                {x}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
