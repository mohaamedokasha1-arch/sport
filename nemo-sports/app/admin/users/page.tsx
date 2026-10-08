import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AdminHead, Btn, Panel, Pill, Table, Field, inputCls } from "@/components/admin/ui";
import ConfirmForm from "@/components/admin/ConfirmSubmit";
import { requirePermission } from "@/lib/admin-session";
import {
  ADMIN_ROLES,
  ROLE_AR,
  ROLE_HINT_AR,
  ROLE_PERMISSIONS,
  countActiveSuperAdmins,
  createUser,
  deleteUser,
  listUsers,
  setUserPassword,
  updateUser,
  type AdminRole,
} from "@/lib/admin-users";
import { logActivity } from "@/lib/activity";
import { dateAr, timeOf } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ── server actions (super_admin only — enforced twice: middleware + here) ── */

async function createUserAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("users");
  const username = String(form.get("username") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const role = String(form.get("role") ?? "editor") as AdminRole;
  const result = await createUser({ username, email, password, role });
  if (!result.ok) {
    redirect(`/admin/users?err=${encodeURIComponent(result.error)}`);
  }
  await logActivity({
    action: "user.create",
    entityType: "admin_user",
    entityId: result.user.id,
    actor: actor.username,
    role: actor.role,
    after: { username: result.user.username, role: result.user.role },
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin/activity");
  redirect("/admin/users?ok=" + encodeURIComponent(`تم إنشاء حساب ${result.user.username}`));
}

async function updateUserAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("users");
  const id = String(form.get("id") ?? "");
  const email = String(form.get("email") ?? "").trim();
  const role = String(form.get("role") ?? "") as AdminRole;
  const isActive = form.get("isActive") === "on";
  const result = await updateUser(id, {
    email,
    ...(ADMIN_ROLES.includes(role) ? { role } : {}),
    isActive,
  });
  if (!result.ok) {
    redirect(`/admin/users?err=${encodeURIComponent(result.error)}`);
  }
  await logActivity({
    action: "user.update",
    entityType: "admin_user",
    entityId: id,
    actor: actor.username,
    role: actor.role,
    after: { role: result.user.role, isActive: result.user.isActive },
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin/activity");
  redirect("/admin/users?ok=" + encodeURIComponent("تم حفظ تعديلات الحساب"));
}

async function resetPasswordAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("users");
  const id = String(form.get("id") ?? "");
  const password = String(form.get("password") ?? "");
  const result = await setUserPassword(id, password);
  if (!result.ok) {
    redirect(`/admin/users?err=${encodeURIComponent(result.error)}`);
  }
  await logActivity({
    action: "user.password",
    entityType: "admin_user",
    entityId: id,
    actor: actor.username,
    role: actor.role,
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin/activity");
  redirect("/admin/users?ok=" + encodeURIComponent("تم تحديث كلمة المرور"));
}

async function deleteUserAction(form: FormData): Promise<void> {
  "use server";
  const actor = await requirePermission("users");
  const id = String(form.get("id") ?? "");
  if (id === actor.id) {
    redirect(`/admin/users?err=${encodeURIComponent("لا يمكنك حذف حسابك الحالي")}`);
  }
  const result = await deleteUser(id);
  if (!result.ok) {
    redirect(`/admin/users?err=${encodeURIComponent(result.error)}`);
  }
  await logActivity({ action: "user.delete", entityType: "admin_user", entityId: id, actor: actor.username, role: actor.role });
  revalidatePath("/admin/users");
  revalidatePath("/admin/activity");
  redirect("/admin/users?ok=" + encodeURIComponent("تم حذف الحساب"));
}

/* ── page ─────────────────────────────────────────────────────── */

const roleTone: Record<AdminRole, "bad" | "warn" | "idle"> = {
  super_admin: "bad",
  admin: "warn",
  editor: "idle",
};

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Defence in depth: the middleware gates this route by cookie role; here
  // the permission is re-checked against the live directory.
  const actor = await requirePermission("users");
  const sp = await searchParams;
  const err = typeof sp.err === "string" ? sp.err : "";
  const ok = typeof sp.ok === "string" ? sp.ok : "";

  const [users, superCount] = await Promise.all([listUsers(), countActiveSuperAdmins()]);

  return (
    <div>
      <AdminHead
        title="المستخدمون والصلاحيات"
        subtitle={`${users.length} حساب · ${superCount} super admin نشط · الدخول محمي بـ bcrypt + Rate Limiting`}
      />

      {err ? (
        <p role="alert" className="mb-4 rounded-[6px] border border-live/50 bg-live/10 px-4 py-3 text-[13px] font-bold text-live">
          {err}
        </p>
      ) : null}
      {ok ? (
        <p role="status" className="mb-4 rounded-[6px] border border-win/50 bg-win/10 px-4 py-3 text-[13px] font-bold text-win">
          {ok}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <Panel title="حسابات المشغّلين" aside={<Pill tone="idle">{users.length} حساب</Pill>}>
            {users.length === 0 ? (
              <p className="rounded-[3px] border border-dashed border-navy-700 px-4 py-6 text-center text-[12px] text-white/50">
                لا توجد حسابات بعد. أنشئ أول حساب super admin من النموذج المجاور.
              </p>
            ) : (
              <Table
                head={["المستخدم", "البريد", "الدور", "آخر دخول", "الحالة", "إجراءات"]}
                rows={users.map((u) => [
                  <span key="n" className="font-bold">
                    {u.username}
                    {u.id === actor.id ? <span className="ms-1 text-[10px] text-gold-400">(أنت)</span> : null}
                  </span>,
                  <span key="e" className="num max-w-[10rem] truncate text-white/60" dir="ltr">{u.email || "—"}</span>,
                  <Pill key="r" tone={roleTone[u.role]}>{ROLE_AR[u.role]}</Pill>,
                  <span key="l" className="num whitespace-nowrap text-[11px] text-white/50">
                    {u.lastLoginAt ? `${dateAr(u.lastLoginAt)} · ${timeOf(u.lastLoginAt)}` : "—"}
                  </span>,
                  <Pill key="s" tone={u.isActive ? "ok" : "bad"}>{u.isActive ? "نشط" : "معطّل"}</Pill>,
                  <span key="a" className="flex flex-wrap gap-1.5">
                    <details className="relative">
                      <summary className="cursor-pointer list-none rounded-[3px] border border-navy-700 px-2 py-1 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400">
                        تعديل
                      </summary>
                      <div className="absolute end-0 z-20 mt-1 w-64 rounded-[6px] border border-navy-700 bg-navy-950 p-3 shadow-2xl">
                        <form action={updateUserAction} className="space-y-2">
                          <input type="hidden" name="id" value={u.id} />
                          <Field label="البريد الإلكتروني">
                            <input name="email" type="email" defaultValue={u.email} className={inputCls} />
                          </Field>
                          <Field label="الدور">
                            <select name="role" defaultValue={u.role} className={inputCls}>
                              {ADMIN_ROLES.map((r) => (
                                <option key={r} value={r}>{ROLE_AR[r]}</option>
                              ))}
                            </select>
                          </Field>
                          <label className="flex items-center gap-2 text-[11px] text-white/70">
                            <input type="checkbox" name="isActive" defaultChecked={u.isActive} className="h-4 w-4 accent-[#D4AF37]" />
                            الحساب نشط
                          </label>
                          <Btn type="submit">حفظ</Btn>
                        </form>
                        <form action={resetPasswordAction} className="mt-3 space-y-2 border-t border-navy-800 pt-2">
                          <input type="hidden" name="id" value={u.id} />
                          <Field label="كلمة مرور جديدة">
                            <input name="password" type="password" minLength={8} required placeholder="8+ أحرف" className={inputCls} />
                          </Field>
                          <button
                            type="submit"
                            className="w-full rounded-[3px] border border-navy-700 px-2 py-1.5 text-[11px] font-bold text-white/75 transition hover:border-gold-500 hover:text-gold-400"
                          >
                            إعادة تعيين كلمة المرور
                          </button>
                        </form>
                      </div>
                    </details>
                    {u.id !== actor.id ? (
                      <ConfirmForm
                        message={`هل أنت متأكد من حذف حساب ${u.username}؟ لا يمكن التراجع عن هذا الإجراء.`}
                        action={deleteUserAction}
                      >
                        <input type="hidden" name="id" value={u.id} />
                        <button
                          type="submit"
                          className="rounded-[3px] border border-live/50 px-2 py-1 text-[11px] font-bold text-live transition hover:bg-live hover:text-white"
                        >
                          حذف
                        </button>
                      </ConfirmForm>
                    ) : null}
                  </span>,
                ])}
              />
            )}
          </Panel>

          <Panel title="مصفوفة الأدوار (مفعّلة فعليًا)">
            <ul className="grid gap-2 md:grid-cols-3">
              {ADMIN_ROLES.map((r) => (
                <li key={r} className="rounded-[3px] border border-navy-800 p-3">
                  <p className="text-[12px] font-extrabold text-gold-400">{ROLE_AR[r]}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/55">{ROLE_HINT_AR[r]}</p>
                  <p className="num mt-2 text-[10px] text-white/40" dir="ltr">
                    {r === "super_admin" ? "*" : [...ROLE_PERMISSIONS[r]].join(", ")}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] leading-relaxed text-white/45">
              يتم فرض الصلاحيات في ثلاث طبقات: middleware (حماية المسارات)، الصفحات (فحص حيّ من
              قاعدة البيانات)، والإجراءات البرمجية (requirePermission). أي تغيير للدور أو تفعيل/تعطيل
              يسري فورًا حتى قبل انتهاء الجلسة.
            </p>
          </Panel>
        </div>

        <div className="h-fit space-y-4 xl:sticky xl:top-[73px]">
          <Panel title="إضافة مستخدم جديد">
            <form action={createUserAction} className="space-y-3">
              <Field label="اسم المستخدم">
                <input name="username" required minLength={3} maxLength={32} className={inputCls} placeholder="username" dir="ltr" autoComplete="off" />
              </Field>
              <Field label="البريد الإلكتروني (اختياري)">
                <input name="email" type="email" className={inputCls} placeholder="name@example.com" dir="ltr" />
              </Field>
              <Field label="الدور">
                <select name="role" defaultValue="editor" className={inputCls}>
                  {ADMIN_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_AR[r]}</option>
                  ))}
                </select>
              </Field>
              <Field label="كلمة المرور">
                <input name="password" type="password" required minLength={8} maxLength={256} className={inputCls} placeholder="8+ أحرف" autoComplete="new-password" />
              </Field>
              <Btn type="submit">إنشاء الحساب</Btn>
              <p className="text-[11px] leading-5 text-white/40">
                تُشفَّر كلمة المرور بـ bcrypt (cost 12) قبل التخزين. لا تصل كلمات المرور إلى المتصفح أبدًا.
              </p>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
