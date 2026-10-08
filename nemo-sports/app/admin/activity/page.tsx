import { AdminHead, NotConnected, Panel, Pill, Table } from "@/components/admin/ui";
import { actionLabel, listActivity } from "@/lib/activity";
import { dateAr, timeOf } from "@/lib/format";
import { requirePermission } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

export default async function AdminActivity() {
  await requirePermission("activity");
  const { items, source } = await listActivity(100);

  return (
    <div>
      <AdminHead
        title="سجل النشاط"
        subtitle={`${items.length} حدث · كل إجراء إداري موثّق هنا مع الكيان والتفاصيل`}
        action={
          <Pill tone={source === "postgres" ? "ok" : "warn"}>
            {source === "postgres" ? "سجل دائم (Postgres)" : "سجل مؤقت (ذاكرة)"}
          </Pill>
        }
      />

      <Panel title="الأحدث أولًا" aside={<Pill tone="idle">آخر 100</Pill>}>
        {items.length === 0 ? (
          <NotConnected
            title="لا نشاط بعد"
            message="ستظهر هنا كل التصحيحات على المباريات، وإدارة البث والنواقل، وإدارة الأخبار — مع الوقت والكيان المتأثر."
            requires="نفّذ أي إجراء إداري ثم حدّث الصفحة"
          />
        ) : (
          <Table
            head={["الوقت", "الإجراء", "الكيان", "التفاصيل"]}
            rows={items.map((e) => [
              <span key="t" className="num whitespace-nowrap text-[11px] text-white/60">
                {dateAr(e.createdAt)} · {timeOf(e.createdAt)}
              </span>,
              <span key="a" className="font-bold">{actionLabel(e.action)}</span>,
              <span key="e" className="num max-w-[16rem] truncate text-[11px] text-white/70" dir="ltr">
                {e.entityId ?? e.entityType ?? "—"}
              </span>,
              <span key="d" className="num max-w-[22rem] truncate text-[11px] text-white/50" dir="ltr" title={e.after ? JSON.stringify(e.after) : ""}>
                {e.after ? JSON.stringify(e.after).slice(0, 160) : "—"}
              </span>,
            ])}
          />
        )}
      </Panel>

      {source === "memory" ? (
        <p className="mt-3 text-[11px] leading-5 text-white/40">
          السجل مؤقت لأن قاعدة البيانات غير موصولة — سيُفقد عند إعادة التشغيل. راجع
          <span className="num"> docs/DATABASE.md</span> للتجهيز الدائم.
        </p>
      ) : null}
    </div>
  );
}
