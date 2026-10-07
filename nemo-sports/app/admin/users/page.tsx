import { AdminHead, Btn, NotConnected, Panel, Table, Pill, Field, inputCls } from "@/components/admin/ui";

/**
 * The panel now has a real, fail-closed operator login. Per-user accounts,
 * roles and 2FA are intentionally still a separate phase: the canonical
 * schema has no users/sessions tables, so this screen must not invent an
 * account roster or claim that a role matrix is enforced.
 */
type Account = { name: string; email: string; role: string; joined: string; last: string; status: string };
const users: Account[] = [];

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
        subtitle={`${users.length} حساب محلي · دخول المشغّل موصول — الحسابات متعددة المستخدمين والأدوار التفصيلية مرحلة لاحقة`}
        action={<Btn>+ مستخدم جديد</Btn>}
      />

      <Panel title="الحسابات">
        {users.length === 0 ? (
          <NotConnected
            title="لا توجد حسابات"
            message="دخول المشغّل الحالي موصول وآمن عبر ADMIN_USERNAME وADMIN_PASSWORD_HASH، مع كوكي جلسة موقّعة ومدة صلاحية 12 ساعة. لا توجد بعد إدارة حسابات متعددة أو صلاحيات مختلفة، لذلك لا نعرض حسابات مُختلَقة ولا ندّعي تطبيق مصفوفة الأدوار."
            requires="نظام users/roles/sessions + 2FA للأدوار المتعددة"
          />
        ) : (
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
        )}
      </Panel>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="مصفوفة الأدوار" aside={<Pill tone="warn">نموذج مستهدف — غير مُنفَّذ</Pill>}>
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
              <input type="email" className={inputCls} placeholder="name@nemo-sports.example" />
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
          <NotConnected
            title="لا يوجد سجل نشاطات"
            message="كان هذا الموضع يعرض ست وقائع مُختلَعة منسوبة إلى حسابات غير موجودة. السجل الحقيقي سيُكتب في جدول audit_log الموجود فعلًا في db/schema.sql بمجرد تنفيذ نظام الحسابات وأول مسار كتابة."
            requires="جدول audit_log + نظام حسابات + مسارات كتابة"
          />
        </Panel>
      </div>
    </div>
  );
}
